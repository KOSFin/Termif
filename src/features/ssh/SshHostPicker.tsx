import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings, ChevronRight, ChevronDown, ArrowRight, Plus, Trash2, FolderPlus, Download, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { SshConnectOptions, SshHostEntry } from "@/types/models";

interface SshHostPickerProps {
  tabId: string;
}

type HostSortMode = "alias_asc" | "alias_desc" | "host_asc";
type SettingsTab = "connection" | "appearance" | "danger";

const OS_CACHE_KEY = "termif.host_os_cache";

interface OsInfo {
  os: string;
  version?: string;
}

const OS_META: Record<string, { bg: string; label: string; name: string }> = {
  ubuntu:  { bg: "#E95420", label: "U", name: "Ubuntu" },
  debian:  { bg: "#A80030", label: "D", name: "Debian" },
  centos:  { bg: "#932279", label: "C", name: "CentOS" },
  fedora:  { bg: "#294172", label: "F", name: "Fedora" },
  arch:    { bg: "#1793D1", label: "A", name: "Arch" },
  alpine:  { bg: "#0D597F", label: "α", name: "Alpine" },
  rhel:    { bg: "#CC0000", label: "R", name: "RHEL" },
  rocky:   { bg: "#10B981", label: "R", name: "Rocky" },
  freebsd: { bg: "#AB2B28", label: "B", name: "FreeBSD" },
  windows: { bg: "#0078D4", label: "W", name: "Windows" },
  macos:   { bg: "#555555", label: "M", name: "macOS" },
  linux:   { bg: "#F7C220", label: "L", name: "Linux" },
};

const HOST_COLORS = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#5fb4d4", "#d47ea8", "#7cb87a"];

function getHostColor(alias: string): string {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) {
    hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length];
}

function getHostInitial(alias: string): string {
  return (alias[0] ?? "?").toUpperCase();
}

function loadOsCache(): Record<string, OsInfo> {
  try {
    const raw = localStorage.getItem(OS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OsInfo>) : {};
  } catch {
    return {};
  }
}

const blankHost: SshHostEntry = {
  id: "", alias: "", host_name: "", user: "", port: 22,
  identity_file: "", password: "", group_id: null, original_alias: null, source: "managed"
};

export function SshHostPicker({ tabId }: SshHostPickerProps) {
  const {
    importedHosts, managedHosts, sshGroups,
    connectSshTab, connectSshTabWithOptions,
    saveManagedHost, deleteManagedHost, refreshHosts,
    createHostGroup, renameHostGroup, deleteHostGroup, toast
  } = useAppStore((s) => ({
    importedHosts: s.importedHosts,
    managedHosts: s.managedHosts,
    sshGroups: s.sshGroups,
    connectSshTab: s.connectSshTab,
    connectSshTabWithOptions: s.connectSshTabWithOptions,
    saveManagedHost: s.saveManagedHost,
    deleteManagedHost: s.deleteManagedHost,
    refreshHosts: s.refreshHosts,
    createHostGroup: s.createHostGroup,
    renameHostGroup: s.renameHostGroup,
    deleteHostGroup: s.deleteHostGroup,
    toast: s.toast
  }));

  const [sortMode, setSortMode] = useState<HostSortMode>("alias_asc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [connectingAlias, setConnectingAlias] = useState<string>();
  const [draggingHostId, setDraggingHostId] = useState<string>();
  const [dragOverGroupId, setDragOverGroupId] = useState<string>();
  const [osCache, setOsCache] = useState<Record<string, OsInfo>>(() => loadOsCache());

  // Settings modal
  const [settingsDraft, setSettingsDraft] = useState<SshHostEntry | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  // Quick connect modal
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [quickConnectDraft, setQuickConnectDraft] = useState<SshConnectOptions>({ alias: "", host: "", user: "", port: 22, identity_file: "", password: "" });
  const [quickConnectSave, setQuickConnectSave] = useState(false);

  // New group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalName, setGroupModalName] = useState("");
  const [renameGroupId, setRenameGroupId] = useState<string>();

  // Refresh OS cache when window gains focus
  useEffect(() => {
    const onFocus = () => setOsCache(loadOsCache());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Set of already-imported aliases (managed hosts that came from imported)
  const importedAliasSet = useMemo(() => {
    const set = new Set<string>();
    for (const h of managedHosts) {
      if (h.original_alias) set.add(h.original_alias);
    }
    return set;
  }, [managedHosts]);

  const sortHosts = useCallback((hosts: SshHostEntry[]) => {
    const data = [...hosts];
    data.sort((a, b) => {
      if (sortMode === "alias_desc") return b.alias.localeCompare(a.alias);
      if (sortMode === "host_asc") return a.host_name.localeCompare(b.host_name);
      return a.alias.localeCompare(b.alias);
    });
    return data;
  }, [sortMode]);

  const groupedManaged = useMemo(() =>
    sshGroups.slice().sort((a, b) => a.order - b.order).map((group) => ({
      group,
      hosts: sortHosts(managedHosts.filter((h) => h.group_id === group.id))
    })), [managedHosts, sortHosts, sshGroups]);

  const ungroupedManaged = useMemo(
    () => sortHosts(managedHosts.filter((h) => !h.group_id)),
    [managedHosts, sortHosts]
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const connect = async (alias: string) => {
    setConnectingAlias(alias);
    try {
      await connectSshTab(tabId, alias);
    } catch (error) {
      toast(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setConnectingAlias(undefined);
    }
  };

  const openSettings = (host: SshHostEntry) => {
    setSettingsDraft({ ...host });
    setSettingsTab("connection");
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    if (!settingsDraft.alias.trim() || !settingsDraft.host_name.trim()) {
      toast("Alias and hostname are required");
      return;
    }
    await saveManagedHost({ ...settingsDraft, alias: settingsDraft.alias.trim(), host_name: settingsDraft.host_name.trim(), source: "managed" });
    setSettingsDraft(null);
    toast("Host saved");
  };

  const deleteHost = async () => {
    if (!settingsDraft?.id) return;
    if (!window.confirm(`Delete host "${settingsDraft.alias}"?`)) return;
    await deleteManagedHost(settingsDraft.id);
    setSettingsDraft(null);
    toast("Host deleted");
  };

  const exportToConfig = async () => {
    if (!settingsDraft?.id) return;
    try {
      await invoke("export_managed_host_to_config", { hostId: settingsDraft.id, overwriteExisting: false });
      toast("Host exported to ~/.ssh/config");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.toLowerCase().includes("already exists")) { toast(msg); return; }
      if (!window.confirm("Alias already exists in ~/.ssh/config. Overwrite?")) return;
      await invoke("export_managed_host_to_config", { hostId: settingsDraft.id, overwriteExisting: true });
      toast("Config updated");
    }
  };

  const moveHostToGroup = async (hostId: string, groupId: string | null) => {
    const host = managedHosts.find((h) => h.id === hostId);
    if (!host || (host.group_id ?? null) === groupId) return;
    await saveManagedHost({ ...host, group_id: groupId });
  };

  const openImportModal = async () => {
    await refreshHosts();
    setImportSelected(new Set());
    setImportModalOpen(true);
  };

  const importHosts = async () => {
    const toImport = importedHosts.filter((h) => importSelected.has(h.alias) && !importedAliasSet.has(h.alias));
    for (const host of toImport) {
      await saveManagedHost({ ...host, id: "", source: "managed", original_alias: host.alias });
    }
    setImportModalOpen(false);
    toast(`Imported ${toImport.length} host(s)`);
    await refreshHosts();
  };

  const runQuickConnect = async () => {
    const host = quickConnectDraft.host.trim();
    if (!host) { toast("Host is required"); return; }
    const alias = quickConnectDraft.alias?.trim() || host;
    try {
      await connectSshTabWithOptions(tabId, { ...quickConnectDraft, alias, host, user: quickConnectDraft.user?.trim() || null, port: quickConnectDraft.port ?? 22 }, quickConnectSave, null);
      setQuickConnectOpen(false);
    } catch (error) {
      toast(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openGroupModal = (groupId?: string) => {
    setRenameGroupId(groupId);
    const existing = groupId ? sshGroups.find((g) => g.id === groupId)?.name ?? "" : "";
    setGroupModalName(existing);
    setGroupModalOpen(true);
  };

  const saveGroupModal = async () => {
    const name = groupModalName.trim();
    if (!name) return;
    if (renameGroupId) {
      await renameHostGroup(renameGroupId, name);
      toast("Group renamed");
    } else {
      await createHostGroup(name);
      toast("Group created");
    }
    setGroupModalOpen(false);
  };

  const hasAnyHosts = managedHosts.length > 0;

  return (
    <div className="ssh-picker">
      <div className="ssh-header">
        <h2>SSH Hosts</h2>
        <div className="ssh-header-actions">
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as HostSortMode)}>
            <option value="alias_asc">Sort: A–Z</option>
            <option value="alias_desc">Sort: Z–A</option>
            <option value="host_asc">Sort: Host</option>
          </select>
          <button onClick={() => setQuickConnectOpen(true)} title="Quick Connect">Quick Connect</button>
          <button className="primary" onClick={() => { setSettingsDraft({ ...blankHost }); setSettingsTab("connection"); }} title="Add new host">
            <Plus size={13} strokeWidth={2.5} /> New Host
          </button>
          <button onClick={() => openGroupModal()} title="New Group">
            <FolderPlus size={13} strokeWidth={2} /> Group
          </button>
          <button onClick={openImportModal} title="Import from ~/.ssh/config">
            <Download size={13} strokeWidth={2} /> Import SSH
          </button>
          <button onClick={() => void refreshHosts()} title="Refresh">
            <RefreshCw size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Groups */}
      {groupedManaged.map((bundle) => (
        <div key={bundle.group.id} className={`ssh-group-section${dragOverGroupId === bundle.group.id ? " drag-over" : ""}`}
          onDragOver={(e) => { if (!draggingHostId) return; e.preventDefault(); setDragOverGroupId(bundle.group.id); }}
          onDrop={(e) => { if (!draggingHostId) return; e.preventDefault(); void moveHostToGroup(draggingHostId, bundle.group.id); setDraggingHostId(undefined); setDragOverGroupId(undefined); }}
          onDragLeave={() => { if (dragOverGroupId === bundle.group.id) setDragOverGroupId(undefined); }}
        >
          <div className="ssh-group-row" onClick={() => toggleGroup(bundle.group.id)}>
            <div className="ssh-group-chevron">
              {expandedGroups.has(bundle.group.id)
                ? <ChevronDown size={14} strokeWidth={2} />
                : <ChevronRight size={14} strokeWidth={2} />}
            </div>
            <div className="ssh-group-name-text">{bundle.group.name}</div>
            <div className="ssh-group-count-badge">{bundle.hosts.length}</div>
            <div className="ssh-group-row-actions" onClick={(e) => e.stopPropagation()}>
              <button className="ghost icon-btn" onClick={() => { setSettingsDraft({ ...blankHost, group_id: bundle.group.id }); setSettingsTab("connection"); }} title="Add host">
                <Plus size={13} strokeWidth={2} />
              </button>
              <button className="ghost icon-btn" onClick={() => openGroupModal(bundle.group.id)} title="Rename group">✎</button>
              <button className="ghost icon-btn danger" onClick={() => void deleteHostGroup(bundle.group.id)} title="Delete group">
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {expandedGroups.has(bundle.group.id) && (
            <div className="ssh-group-hosts-list">
              {bundle.hosts.length === 0 ? (
                <div className="ssh-group-empty">No hosts — drag a host here or add one</div>
              ) : (
                bundle.hosts.map((host) => (
                  <HostRow
                    key={host.id}
                    host={host}
                    osInfo={osCache[host.alias]}
                    connecting={connectingAlias === host.alias}
                    onConnect={() => void connect(host.alias)}
                    onSettings={() => openSettings(host)}
                    draggable
                    onDragStart={() => setDraggingHostId(host.id)}
                    onDragEnd={() => { setDraggingHostId(undefined); setDragOverGroupId(undefined); }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {/* Ungrouped hosts */}
      {hasAnyHosts && (
        <div
          className={`ssh-hosts-list${dragOverGroupId === "ungrouped" ? " drag-over" : ""}`}
          onDragOver={(e) => { if (!draggingHostId) return; e.preventDefault(); setDragOverGroupId("ungrouped"); }}
          onDrop={(e) => { if (!draggingHostId) return; e.preventDefault(); void moveHostToGroup(draggingHostId, null); setDraggingHostId(undefined); setDragOverGroupId(undefined); }}
          onDragLeave={() => { if (dragOverGroupId === "ungrouped") setDragOverGroupId(undefined); }}
        >
          {ungroupedManaged.map((host) => (
            <HostRow
              key={host.id}
              host={host}
              osInfo={osCache[host.alias]}
              connecting={connectingAlias === host.alias}
              onConnect={() => void connect(host.alias)}
              onSettings={() => openSettings(host)}
              draggable
              onDragStart={() => setDraggingHostId(host.id)}
              onDragEnd={() => { setDraggingHostId(undefined); setDragOverGroupId(undefined); }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasAnyHosts && (
        <div className="ssh-empty">
          No hosts yet. Click <strong>New Host</strong> to add one, or <strong>Import SSH</strong> to load from ~/.ssh/config.
        </div>
      )}

      {/* ── Host Settings Modal ── */}
      {settingsDraft !== null && (
        <div className="modal-overlay" onClick={() => setSettingsDraft(null)}>
          <div className="modal-panel modal-panel-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{settingsDraft.id ? `Edit: ${settingsDraft.alias}` : "New Host"}</h3>
              <button className="ghost" onClick={() => setSettingsDraft(null)}>×</button>
            </div>
            <div className="modal-tabs">
              {(["connection", "appearance", "danger"] as SettingsTab[]).map((tab) => (
                <button key={tab} className={`modal-tab${settingsTab === tab ? " active" : ""}${tab === "danger" && !settingsDraft.id ? " hidden" : ""}`}
                  onClick={() => setSettingsTab(tab)}>
                  {tab === "connection" ? "Connection" : tab === "appearance" ? "Appearance" : "Actions"}
                </button>
              ))}
            </div>
            <div className="modal-body">
              {settingsTab === "connection" && (
                <>
                  <label>
                    Alias (display name)
                    <input value={settingsDraft.alias} onChange={(e) => setSettingsDraft((p) => p ? { ...p, alias: e.target.value } : p)} autoFocus placeholder="my-server" />
                  </label>
                  <label>
                    Hostname / IP
                    <input value={settingsDraft.host_name} onChange={(e) => setSettingsDraft((p) => p ? { ...p, host_name: e.target.value } : p)} placeholder="192.168.1.1" />
                  </label>
                  <div className="modal-row-2">
                    <label>
                      User
                      <input value={settingsDraft.user ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, user: e.target.value } : p)} placeholder="root" />
                    </label>
                    <label>
                      Port
                      <input type="number" value={settingsDraft.port ?? 22} onChange={(e) => setSettingsDraft((p) => p ? { ...p, port: Number(e.target.value) || 22 } : p)} />
                    </label>
                  </div>
                  <label>
                    Identity File
                    <input value={settingsDraft.identity_file ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, identity_file: e.target.value } : p)} placeholder="~/.ssh/id_ed25519" />
                  </label>
                  <label>
                    Password (optional)
                    <input type="password" value={settingsDraft.password ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, password: e.target.value } : p)} placeholder="leave empty to use key" />
                  </label>
                  <label>
                    Group
                    <select value={settingsDraft.group_id ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, group_id: e.target.value || null } : p)}>
                      <option value="">Ungrouped</option>
                      {sshGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </label>
                </>
              )}
              {settingsTab === "appearance" && (
                <>
                  <div className="modal-tip">
                    The host icon uses a color derived from the alias. OS icon is detected automatically after the first connection.
                  </div>
                  <div className="host-color-preview">
                    <div className="host-row-icon" style={{ background: getHostColor(settingsDraft.alias || "?") }}>
                      {getHostInitial(settingsDraft.alias || "?")}
                    </div>
                    <span>Color is auto-assigned from alias</span>
                  </div>
                </>
              )}
              {settingsTab === "danger" && settingsDraft.id && (
                <>
                  <div className="modal-tip">Danger zone — these actions cannot be undone.</div>
                  <div className="modal-danger-actions">
                    <button onClick={() => void exportToConfig()}>Export to ~/.ssh/config</button>
                    <button className="danger" onClick={() => void deleteHost()}>
                      <Trash2 size={13} strokeWidth={2} /> Delete Host
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setSettingsDraft(null)}>Cancel</button>
              <button className="primary" onClick={() => void saveSettings()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import SSH Config Modal ── */}
      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal-panel modal-panel-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Import from ~/.ssh/config</h3>
              <button className="ghost" onClick={() => setImportModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {importedHosts.length === 0 ? (
                <div className="modal-tip">No hosts found in ~/.ssh/config</div>
              ) : (
                <>
                  <div className="modal-tip">
                    Check the hosts you want to import. Already imported hosts are shown checked and disabled.
                  </div>
                  <div className="import-host-list">
                    {importedHosts.map((host) => {
                      const alreadyImported = importedAliasSet.has(host.alias);
                      return (
                        <label key={host.alias} className={`import-host-row${alreadyImported ? " imported" : ""}`}>
                          <input
                            type="checkbox"
                            checked={alreadyImported || importSelected.has(host.alias)}
                            disabled={alreadyImported}
                            onChange={(e) => {
                              setImportSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(host.alias);
                                else next.delete(host.alias);
                                return next;
                              });
                            }}
                          />
                          <div className="import-host-icon" style={{ background: getHostColor(host.alias) }}>
                            {getHostInitial(host.alias)}
                          </div>
                          <div className="import-host-info">
                            <div className="import-host-alias">{host.alias}</div>
                            <div className="import-host-sub">{[host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("")}</div>
                          </div>
                          {alreadyImported && <span className="import-badge">Imported</span>}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setImportModalOpen(false)}>Cancel</button>
              <button
                className="primary"
                disabled={importSelected.size === 0}
                onClick={() => void importHosts()}
              >
                Import {importSelected.size > 0 ? `(${importSelected.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Connect Modal ── */}
      {quickConnectOpen && (
        <div className="modal-overlay" onClick={() => setQuickConnectOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Quick Connect</h3>
              <button className="ghost" onClick={() => setQuickConnectOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Host / IP
                <input
                  value={quickConnectDraft.host}
                  onChange={(e) => setQuickConnectDraft((p) => ({ ...p, host: e.target.value }))}
                  placeholder="192.168.1.1 or hostname"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void runQuickConnect(); }}
                />
              </label>
              <div className="modal-row-2">
                <label>
                  User
                  <input
                    value={quickConnectDraft.user ?? ""}
                    onChange={(e) => setQuickConnectDraft((p) => ({ ...p, user: e.target.value }))}
                    placeholder="root"
                  />
                </label>
                <label>
                  Port
                  <input
                    type="number"
                    value={quickConnectDraft.port ?? 22}
                    onChange={(e) => setQuickConnectDraft((p) => ({ ...p, port: Number(e.target.value) || 22 }))}
                  />
                </label>
              </div>
              <label>
                Identity File (optional)
                <input
                  value={quickConnectDraft.identity_file ?? ""}
                  onChange={(e) => setQuickConnectDraft((p) => ({ ...p, identity_file: e.target.value }))}
                  placeholder="~/.ssh/id_ed25519"
                />
              </label>
              <label>
                Password (optional)
                <input
                  type="password"
                  value={quickConnectDraft.password ?? ""}
                  onChange={(e) => setQuickConnectDraft((p) => ({ ...p, password: e.target.value }))}
                  placeholder="leave empty to use key"
                />
              </label>
              <label className="modal-checkbox-row">
                <input type="checkbox" checked={quickConnectSave} onChange={(e) => setQuickConnectSave(e.target.checked)} />
                <span>Save as managed host</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setQuickConnectOpen(false)}>Cancel</button>
              <button className="primary" onClick={() => void runQuickConnect()}>Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Group Create/Rename Modal ── */}
      {groupModalOpen && (
        <div className="modal-overlay" onClick={() => setGroupModalOpen(false)}>
          <div className="modal-panel modal-panel-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{renameGroupId ? "Rename Group" : "New Group"}</h3>
              <button className="ghost" onClick={() => setGroupModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Name
                <input
                  value={groupModalName}
                  onChange={(e) => setGroupModalName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void saveGroupModal(); }}
                  placeholder="Group name"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setGroupModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={() => void saveGroupModal()}>
                {renameGroupId ? "Rename" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HostRow Component ──────────────────────────────────────────────────────

interface HostRowProps {
  host: SshHostEntry;
  osInfo?: OsInfo;
  connecting: boolean;
  onConnect: () => void;
  onSettings: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function HostRow({ host, osInfo, connecting, onConnect, onSettings, draggable, onDragStart, onDragEnd }: HostRowProps) {
  const osMeta = osInfo?.os ? OS_META[osInfo.os] : null;
  const subtitle = [host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("");

  return (
    <div className="host-row">
      {/* Settings gear */}
      <button
        className="host-row-settings ghost icon-btn"
        onClick={onSettings}
        title="Settings"
      >
        <Settings size={14} strokeWidth={1.8} />
      </button>

      <div className="host-row-divider" />

      {/* Draggable center area */}
      <div
        className="host-row-center"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/* Icon: OS or letter */}
        {osMeta ? (
          <div className="host-row-icon os-icon" style={{ background: osMeta.bg }}>
            {osMeta.label}
          </div>
        ) : (
          <div className="host-row-icon" style={{ background: getHostColor(host.alias) }}>
            {getHostInitial(host.alias)}
          </div>
        )}

        <div className="host-row-info">
          <div className="host-row-alias">{host.alias}</div>
          <div className="host-row-sub">{subtitle || "No host configured"}</div>
          {osMeta && osInfo?.version && (
            <div className="host-row-os">{osMeta.name} v.{osInfo.version}</div>
          )}
        </div>
      </div>

      {/* Connect arrow */}
      <button
        className={`host-row-connect${connecting ? " connecting" : ""}`}
        onClick={onConnect}
        disabled={connecting}
        title="Connect"
      >
        <ArrowRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

export { OS_CACHE_KEY };
export type { OsInfo };
