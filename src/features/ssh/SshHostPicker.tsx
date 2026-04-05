import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, Download, RefreshCw, ArrowRight, Paperclip, Server, Search, ChevronUp, Database } from "lucide-react";
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
    tabs,
    importedHosts, managedHosts, sshGroups,
    connectSshTab, connectSshTabWithOptions,
    saveManagedHost, deleteManagedHost, refreshHosts,
    createHostGroup, renameHostGroup, deleteHostGroup, toast
  } = useAppStore((s) => ({
    tabs: s.tabs,
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
  const [dragOverTarget, setDragOverTarget] = useState<string>(); 
  const [osCache, setOsCache] = useState<Record<string, OsInfo>>(() => loadOsCache());

  // Connected state
  const connectedHostAliases = useMemo(() => {
    return new Set(tabs.map(t => t.sshAlias).filter(Boolean));
  }, [tabs]);

  // Tab Filter
  const [activeGroupTab, setActiveGroupTab] = useState<string>("ALL");

  // Settings modal
  const [settingsDraft, setSettingsDraft] = useState<SshHostEntry | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");    

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set()); 

  // Quick connect & Popover
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [qcDraft, setQcDraft] = useState<SshConnectOptions>({ alias: "", host: "", user: "", port: 22, identity_file: "", password: "" });
  const [qcSave, setQcSave] = useState(false);

  const [qcPopoverOpen, setQcPopoverOpen] = useState(false);

  // Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalName, setGroupModalName] = useState("");
  const [renameGroupId, setRenameGroupId] = useState<string>();
  const [alreadyConnectedModal, setAlreadyConnectedModal] = useState<string | null>(null);

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

  const { setActiveTab } = useAppStore();

  const connect = async (alias: string) => {
    if (connectedHostAliases.has(alias)) {
      setAlreadyConnectedModal(alias);
      return;
    }
    await onConfirmConnect(alias);
  };

  const onConfirmConnect = async (alias: string) => {
    setConnectingAlias(alias);
    try { await connectSshTab(tabId, alias); }
    catch (e) { toast(`Connection failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setConnectingAlias(undefined); setAlreadyConnectedModal(null); }
  };

  const handleGoToTab = (alias: string) => {
    const existingTab = tabs.find(t => t.sshAlias === alias);
    if (existingTab) {
      setActiveTab(existingTab.id);
    }
    setAlreadyConnectedModal(null);
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
      setQcPopoverOpen(false);
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

  // Filter rendering groups based on Active Tab
  const renderGroups = activeGroupTab === "ALL" ? groupedManaged : groupedManaged.filter(g => g.group.id === activeGroupTab);
  
  return (
    <div className="ssh-picker new-ssh-design">
      {/* Header */}
      <div className="ssh-header">
        <h2>SSH HOSTS</h2>
        <div className="ssh-header-actions">
          <button className="import-btn" onClick={openImportModal}>
            <Paperclip size={14} strokeWidth={2.5}/> IMPORT SSH
          </button>
          <div className="new-host-wrapper" style={{position: "relative"}}>
            <div className="new-host-group" style={{ display: "flex" }}>
              <button 
                onClick={() => { setSettingsDraft({ ...blankHost }); setSettingsTab("connection"); }}
              >
                <Server size={14} strokeWidth={2}/> NEW HOST
              </button>
              <button onClick={() => setQcPopoverOpen(!qcPopoverOpen)}>
                <ChevronDown size={14} strokeWidth={2}/>
              </button>
              
              {qcPopoverOpen && (
                <div className="quick-connect-popover" style={{ padding: "8px", width: "200px" }}>
                  <button
                    className="ghost"
                    style={{ width: "100%", justifyContent: "flex-start", marginBottom: "4px" }}
                    onClick={() => {
                      setQuickConnectOpen(true);
                      setQcPopoverOpen(false);
                    }}
                  >
                    ⚡ Quick Connect
                  </button>
                  <button
                    className="ghost"
                    style={{ width: "100%", justifyItems: "flex-start", justifyContent: "flex-start" }}
                    onClick={() => {
                      setSettingsDraft({ ...blankHost });
                      setSettingsTab("connection");
                      setQcPopoverOpen(false);
                    }}
                  >
                    ➕ Add to list
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Filter Bar */}
      <div className="ssh-filter-bar">
        <div className="ssh-filter-tabs">
          <button className={`ssh-filter-tab ${activeGroupTab === "ALL" ? "active" : ""}`} onClick={() => setActiveGroupTab("ALL")}>ALL</button>
          <div className="ssh-filter-divider"></div>
          {sshGroups.map(g => (
            <button key={g.id} className={`ssh-filter-tab ${activeGroupTab === g.id ? "active" : ""}`} onClick={() => setActiveGroupTab(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        <div className="ssh-filter-actions">
          <button onClick={() => openGroupModal()} title="New Group"><Plus size={16}/></button>
          <button title="Search..."><Search size={16}/></button>
        </div>
      </div>

      {/* Lists Content */}
      <div className="ssh-lists-content" style={{ overflowY: "auto", flex: 1, paddingRight: "4px" }}>
        
        {/* Ungrouped hosts -> display if ALL or if specifically looking at ungrouped (virtually) - Let's just show it in ALL */}
        {(activeGroupTab === "ALL") && hasAnyHosts && ungroupedManaged.length > 0 && (
          <section
            className={`ssh-section${dragOverTarget === "ungrouped" ? " drag-over-section" : ""}`}
            {...dropZoneProps("ungrouped", null)}
          >
            <div 
              className="ssh-group-heading" 
              onClick={() => toggleGroup("ungrouped")}
            >
              Without a group {expandedGroups.has("ungrouped") ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </div>
            
            {!expandedGroups.has("ungrouped") && (
              <div className="ssh-card-grid">
                {ungroupedManaged.map((host) => (
                  <HostCard
                    key={host.id}
                    host={host}
                    osInfo={osCache[host.alias]}
                    connecting={connectingAlias === host.alias}
                    isConnected={connectedHostAliases.has(host.alias)}
                    onConnect={() => void connect(host.alias)}
                    onSettings={() => openSettings(host)}
                    {...dragProps(host)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Grouped Hosts */}
        {renderGroups.map(({ group, hosts }) => {
          const expanded = expandedGroups.has(group.id);
          const isDropTarget = dragOverTarget === group.id;

          return (
            <section
              key={group.id}
              className={`ssh-section ssh-group-wrap ${isDropTarget ? "drag-over-section" : ""}`}
              {...dropZoneProps(group.id, group.id)}
            >
              <div 
                className="ssh-group-heading"
                onClick={() => toggleGroup(group.id)}
              >
                {group.name} {!expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
              </div>
              
              {!expanded && (
                hosts.length === 0 ? (
                  <div className="ssh-group-empty" style={{marginTop: "8px", fontSize: "0.85rem", color: "#888"}}>Empty folder. Drag here or "+" to add.</div>
                ) : (
                  <div className="ssh-card-grid">
                    {hosts.map((host) => (
                      <HostCard
                        key={host.id}
                        host={host}
                        osInfo={osCache[host.alias]}
                        connecting={connectingAlias === host.alias}
                        isConnected={connectedHostAliases.has(host.alias)}
                        onConnect={() => void connect(host.alias)}        
                        onSettings={() => openSettings(host)}
                        {...dragProps(host)}
                      />
                    ))}
                  </div>
                )
              )}
            </section>
          );
        })}

      </div>

      {/* Modals */}
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

      {/* ── Already Connected Modal ── */}
      {alreadyConnectedModal && (
        <div className="modal-overlay" onClick={() => setAlreadyConnectedModal(null)}>
          <div className="modal-panel modal-panel-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Host already connected</h3>
              <button className="ghost" onClick={() => setAlreadyConnectedModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-tip">
                This host is already open in another tab. Do you want to open a new connection or switch to the existing tab?
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '8px', display: 'flex' }}>
              <button className="ghost" onClick={() => setAlreadyConnectedModal(null)}>Cancel</button>
              <button className="ghost" onClick={() => handleGoToTab(alreadyConnectedModal)}>Go to Tab</button>
              <button className="primary" onClick={() => onConfirmConnect(alreadyConnectedModal)}>Open New Connection</button>
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



// ──― HostCard  ──―

interface HostCardProps {
  host: SshHostEntry;
  osInfo?: OsInfo;
  connecting: boolean;
  isConnected?: boolean;
  onConnect: () => void;
  onSettings: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

function HostCard({ host, osInfo, connecting, isConnected, onConnect, onSettings, draggable, onDragStart, onDragEnd }: HostCardProps) {
  const osMeta = osInfo?.os ? OS_META[osInfo.os] : null;
  const subtitle = [host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("");
  const color = getHostColor(host.alias);

  return (
    <div 
      className="host-card-new"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onConnect}
    >
      {connecting && (
        <div className="connecting-overlay-new">
            <div className="mini-spinner" />
        </div>
      )}
      {isConnected && (
         <div className="connection-dot-new" title="Connected in a tab"></div>
      )}

      {/* Left side settings lock */}
      <div className="host-card-new-settings" onClick={(e) => { e.stopPropagation(); onSettings(); }}>
         <Settings size={16} strokeWidth={1.5} />
      </div>

      <div className="host-card-new-core">
        {osMeta ? (
          <div className="host-card-new-icon os-icon" style={{ background: osMeta.bg }}>
            {osMeta.label}
          </div>
        ) : (
          <div className="host-card-new-icon" style={{ background: color }}>
            {getInitial(host.alias)}
          </div>
        )}

        <div className="host-card-new-details">
          <div className="host-card-new-alias">{host.alias}</div>
          <div className="host-card-new-sub">{subtitle || "No host configured"}</div>
          <div className="host-card-new-os">{osMeta ? `${osMeta.name} ${osInfo?.version || ""}` : "Linux/Unknown"}</div>
        </div>
      </div>

      <div className="host-card-new-chevron">
         <ChevronRight size={18} strokeWidth={1.5} />
      </div>
    </div>
  );
}
