import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, Download, RefreshCw, ArrowRight } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { SshConnectOptions, SshHostEntry } from "@/types/models";

interface SshHostPickerProps {
  tabId: string;
}

type HostSortMode = "alias_asc" | "alias_desc" | "host_asc";
type SettingsTab = "connection" | "appearance" | "danger";

export const OS_CACHE_KEY = "termif.host_os_cache";

export interface OsInfo {
  os: string;
  version?: string;
}

const OS_META: Record<string, { bg: string; label: string; name: string }> = {
  ubuntu:  { bg: "#E95420", label: "U",  name: "Ubuntu" },
  debian:  { bg: "#A80030", label: "D",  name: "Debian" },
  centos:  { bg: "#932279", label: "C",  name: "CentOS" },
  fedora:  { bg: "#294172", label: "F",  name: "Fedora" },
  arch:    { bg: "#1793D1", label: "A",  name: "Arch" },
  alpine:  { bg: "#0D597F", label: "α",  name: "Alpine" },
  rhel:    { bg: "#CC0000", label: "R",  name: "RHEL" },
  rocky:   { bg: "#10B981", label: "R",  name: "Rocky" },
  freebsd: { bg: "#AB2B28", label: "B",  name: "FreeBSD" },
  windows: { bg: "#0078D4", label: "W",  name: "Windows" },
  macos:   { bg: "#555555", label: "M",  name: "macOS" },
  linux:   { bg: "#F7C220", label: "L",  name: "Linux" },
};

const HOST_COLORS = [
  "#4a8fe7", "#3dba84", "#e0a84a", "#e05468",
  "#9a7ce5", "#5fb4d4", "#d47ea8", "#7cb87a",
  "#f06292", "#4db6ac", "#ff8a65", "#a1887f",
];

function getHostColor(alias: string): string {
  let h = 0;
  for (let i = 0; i < alias.length; i++) h = alias.charCodeAt(i) + ((h << 5) - h);
  return HOST_COLORS[Math.abs(h) % HOST_COLORS.length];
}

function getInitial(s: string): string {
  return (s[0] ?? "?").toUpperCase();
}

function loadOsCache(): Record<string, OsInfo> {
  try {
    const raw = localStorage.getItem(OS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OsInfo>) : {};
  } catch { return {}; }
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
    importedHosts: s.importedHosts, managedHosts: s.managedHosts, sshGroups: s.sshGroups,
    connectSshTab: s.connectSshTab, connectSshTabWithOptions: s.connectSshTabWithOptions,
    saveManagedHost: s.saveManagedHost, deleteManagedHost: s.deleteManagedHost,
    refreshHosts: s.refreshHosts, createHostGroup: s.createHostGroup,
    renameHostGroup: s.renameHostGroup, deleteHostGroup: s.deleteHostGroup, toast: s.toast
  }));

  const [sortMode, setSortMode] = useState<HostSortMode>("alias_asc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [connectingAlias, setConnectingAlias] = useState<string>();
  const [draggingHostId, setDraggingHostId] = useState<string>();
  const [dragOverTarget, setDragOverTarget] = useState<string>(); // groupId or "ungrouped"
  const [osCache, setOsCache] = useState<Record<string, OsInfo>>(() => loadOsCache());

  // Settings modal
  const [settingsDraft, setSettingsDraft] = useState<SshHostEntry | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  // Quick connect
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [qcDraft, setQcDraft] = useState<SshConnectOptions>({ alias: "", host: "", user: "", port: 22, identity_file: "", password: "" });
  const [qcSave, setQcSave] = useState(false);

  // Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalName, setGroupModalName] = useState("");
  const [renameGroupId, setRenameGroupId] = useState<string>();

  useEffect(() => {
    const onFocus = () => setOsCache(loadOsCache());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const importedAliasSet = useMemo(() => {
    const s = new Set<string>();
    managedHosts.forEach((h) => { if (h.original_alias) s.add(h.original_alias); });
    return s;
  }, [managedHosts]);

  const sortHosts = useCallback((hosts: SshHostEntry[]) => {
    return [...hosts].sort((a, b) => {
      if (sortMode === "alias_desc") return b.alias.localeCompare(a.alias);
      if (sortMode === "host_asc") return a.host_name.localeCompare(b.host_name);
      return a.alias.localeCompare(b.alias);
    });
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

  const toggleGroup = (id: string) => setExpandedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const connect = async (alias: string) => {
    setConnectingAlias(alias);
    try { await connectSshTab(tabId, alias); }
    catch (e) { toast(`Connection failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setConnectingAlias(undefined); }
  };

  const openSettings = (host: SshHostEntry, tab: SettingsTab = "connection") => {
    setSettingsDraft({ ...host });
    setSettingsTab(tab);
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    if (!settingsDraft.alias.trim() || !settingsDraft.host_name.trim()) {
      toast("Alias and hostname are required"); return;
    }
    await saveManagedHost({ ...settingsDraft, alias: settingsDraft.alias.trim(), host_name: settingsDraft.host_name.trim(), source: "managed" });
    setSettingsDraft(null);
    toast("Host saved");
  };

  const deleteHost = async () => {
    if (!settingsDraft?.id || !window.confirm(`Delete "${settingsDraft.alias}"?`)) return;
    await deleteManagedHost(settingsDraft.id);
    setSettingsDraft(null);
    toast("Host deleted");
  };

  const exportToConfig = async () => {
    if (!settingsDraft?.id) return;
    try {
      await invoke("export_managed_host_to_config", { hostId: settingsDraft.id, overwriteExisting: false });
      toast("Exported to ~/.ssh/config");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("already exists")) { toast(msg); return; }
      if (!window.confirm("Alias already exists. Overwrite?")) return;
      await invoke("export_managed_host_to_config", { hostId: settingsDraft.id, overwriteExisting: true });
      toast("Config updated");
    }
  };

  const moveHostToGroup = async (hostId: string, groupId: string | null) => {
    const host = managedHosts.find((h) => h.id === hostId);
    if (!host || (host.group_id ?? null) === groupId) return;
    await saveManagedHost({ ...host, group_id: groupId });
  };

  const handleDrop = (targetGroupId: string | null) => {
    if (!draggingHostId) return;
    void moveHostToGroup(draggingHostId, targetGroupId);
    setDraggingHostId(undefined);
    setDragOverTarget(undefined);
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
    const host = qcDraft.host.trim();
    if (!host) { toast("Host is required"); return; }
    const alias = qcDraft.alias?.trim() || host;
    try {
      await connectSshTabWithOptions(tabId, { ...qcDraft, alias, host, user: qcDraft.user?.trim() || null, port: qcDraft.port ?? 22 }, qcSave, null);
      setQuickConnectOpen(false);
    } catch (e) { toast(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const openGroupModal = (groupId?: string) => {
    setRenameGroupId(groupId);
    setGroupModalName(groupId ? sshGroups.find((g) => g.id === groupId)?.name ?? "" : "");
    setGroupModalOpen(true);
  };

  const saveGroupModal = async () => {
    const name = groupModalName.trim();
    if (!name) return;
    if (renameGroupId) { await renameHostGroup(renameGroupId, name); toast("Group renamed"); }
    else { await createHostGroup(name); toast("Group created"); }
    setGroupModalOpen(false);
  };

  // ── Drag & Drop handlers ─────────────────────────────────────────────────────

  const dragProps = (host: SshHostEntry) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; setDraggingHostId(host.id); },
    onDragEnd: () => { setDraggingHostId(undefined); setDragOverTarget(undefined); },
  });

  const dropZoneProps = (targetKey: string, groupId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (!draggingHostId) return; e.preventDefault(); setDragOverTarget(targetKey); },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
        setDragOverTarget((prev) => prev === targetKey ? undefined : prev);
      }
    },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(groupId); },
  });

  const hasAnyHosts = managedHosts.length > 0;

  return (
    <div className="ssh-picker">
      {/* Header */}
      <div className="ssh-header">
        <h2>SSH Hosts</h2>
        <div className="ssh-header-actions">
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as HostSortMode)}>
            <option value="alias_asc">A–Z</option>
            <option value="alias_desc">Z–A</option>
            <option value="host_asc">Host</option>
          </select>
          <button onClick={() => setQuickConnectOpen(true)}>Quick Connect</button>
          <button className="primary" onClick={() => { setSettingsDraft({ ...blankHost }); setSettingsTab("connection"); }}>
            <Plus size={13} strokeWidth={2.5} /> New Host
          </button>
          <button onClick={() => openGroupModal()}>
            <FolderPlus size={13} strokeWidth={2} /> Group
          </button>
          <button onClick={openImportModal}>
            <Download size={13} strokeWidth={2} /> Import SSH
          </button>
          <button onClick={() => void refreshHosts()} title="Refresh">
            <RefreshCw size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Groups section */}
      {groupedManaged.length > 0 && (
        <section className="ssh-section">
          <div className="ssh-section-label">Groups</div>
          <div className="ssh-card-grid ssh-card-grid-groups">
            {groupedManaged.map(({ group, hosts }) => {
              const expanded = expandedGroups.has(group.id);
              const isDropTarget = dragOverTarget === group.id;
              return (
                <div key={group.id} className="ssh-group-wrap">
                  <div
                    className={`ssh-group-card${expanded ? " expanded" : ""}${isDropTarget ? " drag-over" : ""}`}
                    onClick={() => toggleGroup(group.id)}
                    {...dropZoneProps(group.id, group.id)}
                  >
                    <div className="ssh-group-card-icon" style={{ background: getHostColor(group.name) }}>
                      {getInitial(group.name)}
                    </div>
                    <div className="ssh-group-card-info">
                      <div className="ssh-group-card-name">{group.name}</div>
                      <div className="ssh-group-card-count">{hosts.length} host{hosts.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="ssh-group-card-chevron">
                      {expanded ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                    </div>
                    <div className="ssh-group-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost icon-btn" onClick={() => { setSettingsDraft({ ...blankHost, group_id: group.id }); setSettingsTab("connection"); }} title="Add host">
                        <Plus size={12} strokeWidth={2} />
                      </button>
                      <button className="ghost icon-btn" onClick={() => openGroupModal(group.id)} title="Rename">✎</button>
                      <button className="ghost icon-btn danger" onClick={() => void deleteHostGroup(group.id)} title="Delete">
                        <Trash2 size={12} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="ssh-group-expanded">
                      {hosts.length === 0 ? (
                        <div className="ssh-group-empty">Empty group — add hosts or drag here</div>
                      ) : (
                        <div className="ssh-card-grid">
                          {hosts.map((host) => (
                            <HostCard
                              key={host.id}
                              host={host}
                              osInfo={osCache[host.alias]}
                              connecting={connectingAlias === host.alias}
                              onConnect={() => void connect(host.alias)}
                              onSettings={() => openSettings(host)}
                              {...dragProps(host)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Ungrouped hosts */}
      {hasAnyHosts && ungroupedManaged.length > 0 && (
        <section
          className={`ssh-section${dragOverTarget === "ungrouped" ? " drag-over-section" : ""}`}
          {...dropZoneProps("ungrouped", null)}
        >
          <div className="ssh-section-label">Hosts</div>
          <div className="ssh-card-grid">
            {ungroupedManaged.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                osInfo={osCache[host.alias]}
                connecting={connectingAlias === host.alias}
                onConnect={() => void connect(host.alias)}
                onSettings={() => openSettings(host)}
                {...dragProps(host)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!hasAnyHosts && (
        <div className="ssh-empty">
          No hosts yet.<br />
          Click <strong>New Host</strong> to add one, or <strong>Import SSH</strong> to load from ~/.ssh/config.
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
              {(["connection", "appearance", ...(settingsDraft.id ? ["danger"] : [])] as SettingsTab[]).map((tab) => (
                <button key={tab} className={`modal-tab${settingsTab === tab ? " active" : ""}`} onClick={() => setSettingsTab(tab)}>
                  {tab === "connection" ? "Connection" : tab === "appearance" ? "Appearance" : "Actions"}
                </button>
              ))}
            </div>
            <div className="modal-body">
              {settingsTab === "connection" && <>
                <label>Alias (display name)
                  <input value={settingsDraft.alias} onChange={(e) => setSettingsDraft((p) => p ? { ...p, alias: e.target.value } : p)} autoFocus placeholder="my-server" />
                </label>
                <label>Hostname / IP
                  <input value={settingsDraft.host_name} onChange={(e) => setSettingsDraft((p) => p ? { ...p, host_name: e.target.value } : p)} placeholder="192.168.1.1" />
                </label>
                <div className="modal-row-2">
                  <label>User
                    <input value={settingsDraft.user ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, user: e.target.value } : p)} placeholder="root" />
                  </label>
                  <label>Port
                    <input type="number" value={settingsDraft.port ?? 22} onChange={(e) => setSettingsDraft((p) => p ? { ...p, port: Number(e.target.value) || 22 } : p)} />
                  </label>
                </div>
                <label>Identity File
                  <input value={settingsDraft.identity_file ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, identity_file: e.target.value } : p)} placeholder="~/.ssh/id_ed25519" />
                </label>
                <label>Password (optional)
                  <input type="password" value={settingsDraft.password ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, password: e.target.value } : p)} placeholder="leave empty to use key" />
                </label>
                <label>Group
                  <select value={settingsDraft.group_id ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, group_id: e.target.value || null } : p)}>
                    <option value="">Ungrouped</option>
                    {sshGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
              </>}
              {settingsTab === "appearance" && <>
                <div className="modal-tip">Icon color is derived from the alias name. OS is detected automatically after the first connection.</div>
                <div className="host-color-preview">
                  <div className="host-card-icon-lg" style={{ background: getHostColor(settingsDraft.alias || "?") }}>
                    {getInitial(settingsDraft.alias || "?")}
                  </div>
                  <span>Auto-colored from alias</span>
                </div>
              </>}
              {settingsTab === "danger" && settingsDraft.id && <>
                <div className="modal-tip">These actions are permanent.</div>
                <div className="modal-danger-actions">
                  <button onClick={() => void exportToConfig()}>Export to ~/.ssh/config</button>
                  <button className="danger" onClick={() => void deleteHost()}>
                    <Trash2 size={13} strokeWidth={2} /> Delete Host
                  </button>
                </div>
              </>}
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
              ) : <>
                <div className="modal-tip">
                  Select hosts to import. Already-imported ones are disabled.
                </div>
                <div className="import-grid">
                  {importedHosts.map((host) => {
                    const done = importedAliasSet.has(host.alias);
                    const checked = done || importSelected.has(host.alias);
                    const sub = [host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("");
                    return (
                      <label key={host.alias} className={`import-card${done ? " done" : ""}${checked && !done ? " selected" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={done}
                          onChange={(e) => setImportSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(host.alias); else next.delete(host.alias);
                            return next;
                          })}
                        />
                        <div className="import-card-icon" style={{ background: getHostColor(host.alias) }}>
                          {getInitial(host.alias)}
                        </div>
                        <div className="import-card-info">
                          <div className="import-card-alias">{host.alias}</div>
                          <div className="import-card-sub">{sub || host.host_name}</div>
                        </div>
                        {done && <span className="import-done-badge">✓</span>}
                      </label>
                    );
                  })}
                </div>
              </>}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setImportModalOpen(false)}>Cancel</button>
              <button className="primary" disabled={importSelected.size === 0} onClick={() => void importHosts()}>
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
              <label>Host / IP
                <input value={qcDraft.host} onChange={(e) => setQcDraft((p) => ({ ...p, host: e.target.value }))}
                  placeholder="192.168.1.1 or hostname" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void runQuickConnect(); }} />
              </label>
              <div className="modal-row-2">
                <label>User
                  <input value={qcDraft.user ?? ""} onChange={(e) => setQcDraft((p) => ({ ...p, user: e.target.value }))} placeholder="root" />
                </label>
                <label>Port
                  <input type="number" value={qcDraft.port ?? 22} onChange={(e) => setQcDraft((p) => ({ ...p, port: Number(e.target.value) || 22 }))} />
                </label>
              </div>
              <label>Identity File (optional)
                <input value={qcDraft.identity_file ?? ""} onChange={(e) => setQcDraft((p) => ({ ...p, identity_file: e.target.value }))} placeholder="~/.ssh/id_ed25519" />
              </label>
              <label>Password (optional)
                <input type="password" value={qcDraft.password ?? ""} onChange={(e) => setQcDraft((p) => ({ ...p, password: e.target.value }))} placeholder="leave empty to use key" />
              </label>
              <label className="modal-checkbox-row">
                <input type="checkbox" checked={qcSave} onChange={(e) => setQcSave(e.target.checked)} />
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

      {/* ── Group Modal ── */}
      {groupModalOpen && (
        <div className="modal-overlay" onClick={() => setGroupModalOpen(false)}>
          <div className="modal-panel modal-panel-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{renameGroupId ? "Rename Group" : "New Group"}</h3>
              <button className="ghost" onClick={() => setGroupModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>Name
                <input value={groupModalName} onChange={(e) => setGroupModalName(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void saveGroupModal(); }} placeholder="My Servers" />
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

// ─── HostCard ────────────────────────────────────────────────────────────────

interface HostCardProps {
  host: SshHostEntry;
  osInfo?: OsInfo;
  connecting: boolean;
  onConnect: () => void;
  onSettings: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

function HostCard({ host, osInfo, connecting, onConnect, onSettings, draggable, onDragStart, onDragEnd }: HostCardProps) {
  const osMeta = osInfo?.os ? OS_META[osInfo.os] : null;
  const subtitle = [host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("");
  const color = getHostColor(host.alias);

  return (
    <div
      className={`host-card${connecting ? " connecting" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Icon */}
      {osMeta ? (
        <div className="host-card-icon os-icon" style={{ background: osMeta.bg }}>
          {osMeta.label}
        </div>
      ) : (
        <div className="host-card-icon" style={{ background: color }}>
          {getInitial(host.alias)}
        </div>
      )}

      {/* Info */}
      <div className="host-card-body">
        <div className="host-card-alias">{host.alias}</div>
        <div className="host-card-sub">{subtitle || "No host configured"}</div>
        {osMeta && osInfo?.version && (
          <div className="host-card-os">{osMeta.name} {osInfo.version}</div>
        )}
      </div>

      {/* Hover actions overlay */}
      <div className="host-card-actions">
        <button className="host-card-btn settings-btn" onClick={(e) => { e.stopPropagation(); onSettings(); }} title="Settings">
          <Settings size={13} strokeWidth={1.8} />
        </button>
        <button className="host-card-btn connect-btn" onClick={(e) => { e.stopPropagation(); onConnect(); }} title="Connect" disabled={connecting}>
          {connecting ? <div className="mini-spinner" /> : <ArrowRight size={14} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
