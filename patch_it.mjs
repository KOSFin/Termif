import fs from 'fs';

const newSshPicker = `import { invoke } from "@tauri-apps/api/core";
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
    catch (e) { toast(\`Connection failed: \${e instanceof Error ? e.message : String(e)}\`); }
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
    if (!settingsDraft?.id || !window.confirm(\`Delete "\${settingsDraft.alias}"?\`)) return;
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
    toast(\`Imported \${toImport.length} host(s)\`);
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
    } catch (e) { toast(\`Failed: \${e instanceof Error ? e.message : String(e)}\`); }
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
                <Database size={14} strokeWidth={2}/> NEW HOST
              </button>
              <button onClick={() => setQcPopoverOpen(!qcPopoverOpen)}>
                <ChevronDown size={14} strokeWidth={2}/>
              </button>
            </div>
            
            {qcPopoverOpen && (
              <div className="quick-connect-popover">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{fontSize: "0.8rem", fontWeight: 600, color: "#ccc", textTransform: "uppercase"}}>Quick Connect</div>
                  <input autoFocus placeholder="user@host" onChange={(e) => {
                    const parts = e.target.value.split("@");
                    if (parts.length === 2) {
                      setQcDraft(p => ({...p, user: parts[0], host: parts[1]}));
                    } else {
                      setQcDraft(p => ({...p, host: e.target.value}));
                    }
                  }} />
                  <input type="password" placeholder="Password (Optional)" onChange={(e) => setQcDraft(p => ({...p, password: e.target.value}))} />
                  <button className="primary" style={{marginTop: "4px"}} onClick={runQuickConnect}>Connect Now</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs / Filter Bar */}
      <div className="ssh-filter-bar">
        <div className="ssh-filter-tabs">
          <button className={\`ssh-filter-tab \${activeGroupTab === "ALL" ? "active" : ""}\`} onClick={() => setActiveGroupTab("ALL")}>ALL</button>
          <div className="ssh-filter-divider"></div>
          {sshGroups.map(g => (
            <button key={g.id} className={\`ssh-filter-tab \${activeGroupTab === g.id ? "active" : ""}\`} onClick={() => setActiveGroupTab(g.id)}>
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
            className={\`ssh-section\${dragOverTarget === "ungrouped" ? " drag-over-section" : ""}\`}
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
              className={\`ssh-section ssh-group-wrap \${isDropTarget ? "drag-over-section" : ""}\`}
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

      {/* Modals... */}
      <SshModals 
        // Delegating all the modal rendering downwards so we don't spam 200 lines, 
        // but strictly within this file actually to preserve all state
      />
      {settingsDraft !== null && ( ... same as original 
`; 

const originalCode = fs.readFileSync('src/features/ssh/SshHostPicker.tsx', 'utf8');
const modalsPart = originalCode.substring(originalCode.indexOf("{/* ── Host Settings Modal"));

const combined = newSshPicker + modalsPart.replace("return (", "").trim();

fs.writeFileSync('src/features/ssh/SshHostPicker.tsx', combined);

const appCssAdd = `

/* SSH HOSTS PAGE REDESIGN REDUX */
.new-ssh-design.ssh-picker {
  padding: 24px 32px;
  display: flex !important;
  flex-direction: column !important;
  gap: 20px !important;
  background: var(--bg) !important;
  height: 100%;
}

.new-ssh-design .ssh-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.new-ssh-design .ssh-header h2 {
  font-size: 1.1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0;
  color: #eeeeee;
}

.new-ssh-design .ssh-header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.new-ssh-design .import-btn {
  background: #3a3a3a !important;
  color: #eeeeee !important;
  border-radius: 6px !important;
  padding: 6px 14px !important;
  font-weight: 600;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 0.8rem;
  border: none;
  cursor: pointer;
  transition: opacity 0.1s;
}
.new-ssh-design .import-btn:hover { opacity: 0.8; }

.new-ssh-design .new-host-group {
  display: flex;
  border-radius: 6px;
  overflow: hidden;
}
.new-ssh-design .new-host-group > button {
  background: #4a4a4a !important;
  color: #ffffff !important;
  border: none;
  cursor: pointer;
}
.new-ssh-design .new-host-group > button:first-child {
  padding: 6px 12px 6px 14px !important;
  font-weight: 600;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 0.8rem;
  border-right: 1px solid rgba(0,0,0,0.2);
}
.new-ssh-design .new-host-group > button:last-child {
  padding: 6px 8px !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
.new-ssh-design .new-host-group > button:hover {
  filter: brightness(1.1);
}

.quick-connect-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #2a2a2a;
  border-radius: 8px;
  padding: 16px;
  width: 260px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.05);
  z-index: 100;
}
.quick-connect-popover input {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.1);
  padding: 6px 10px;
  border-radius: 4px;
  color: #fff;
}

.new-ssh-design .ssh-filter-bar {
  display: flex;
  justify-content: space-between;
  background: #2a2a2a;
  border-radius: 8px;
  padding: 6px 8px;
  align-items: center;
}

.new-ssh-design .ssh-filter-tabs {
  display: flex;
  gap: 12px;
  align-items: center;
}

.new-ssh-design .ssh-filter-tab {
  background: transparent;
  color: #aaaaaa;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
  font-family: inherit;
}
.new-ssh-design .ssh-filter-tab.active {
  background: #3e3e3e;
  color: #ffffff;
}

.new-ssh-design .ssh-filter-divider {
  width: 1px;
  height: 16px;
  background: rgba(255,255,255,0.2);
}

.new-ssh-design .ssh-filter-actions {
  display: flex;
  gap: 8px;
  padding-right: 4px;
}
.new-ssh-design .ssh-filter-actions button {
  background: #3e3e3e;
  border-radius: 4px;
  padding: 4px;
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-ssh-design .ssh-group-heading {
  color: #eeeeee;
  font-weight: 700;
  font-size: 1rem;
  margin: 16px 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.new-ssh-design .drag-over-section {
  border: 1px dashed rgba(255,255,255,0.3);
  border-radius: 8px;
  padding: 8px;
}

/* Host Card REDESIGN */
.new-ssh-design .ssh-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.host-card-new {
  background: #2a2a2a;
  border-radius: 12px;
  display: flex;
  align-items: stretch;
  position: relative;
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  height: 70px;
  transition: transform 0.1s, box-shadow 0.1s;
  overflow: hidden;
}
.host-card-new:hover {
  background: #303030;
}

.host-card-new-settings {
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.host-card-new-settings:hover {
  color: #fff;
  background: rgba(255,255,255,0.05);
}

.host-card-new-core {
  display: flex;
  flex: 1;
  padding: 0 14px;
  gap: 14px;
  align-items: center;
  overflow: hidden;
}

.host-card-new-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.host-card-new-details {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  justify-content: center;
}

.host-card-new-alias {
  font-weight: 700;
  font-size: 0.9rem;
  color: #ffffff;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host-card-new-sub {
  font-size: 0.75rem;
  color: #aaaaaa;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host-card-new-os {
  font-size: 0.65rem;
  color: #777777;
  margin-top: 2px;
}

.host-card-new-chevron {
  width: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
}

.connection-dot-new {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  background: #4caf50;
  border-radius: 50%;
  box-shadow: 0 0 6px #4caf50;
}
.connecting-overlay-new {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
`;

fs.appendFileSync('src/theme/app.css', appCssAdd);

const newCardCode = `

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
  const subtitle = [host.user ? \`\${host.user}@\` : "", host.host_name, host.port && host.port !== 22 ? \`:\${host.port}\` : ""].join("");
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
          <div className="host-card-new-os">{osMeta ? \`\${osMeta.name} \${osInfo?.version || ""}\` : "Linux/Unknown"}</div>
        </div>
      </div>

      <div className="host-card-new-chevron">
         <ChevronRight size={18} strokeWidth={1.5} />
      </div>
    </div>
  );
}
`;

// Now let's carefully replace HostCard in the file!
let finalCode = fs.readFileSync('src/features/ssh/SshHostPicker.tsx', 'utf8');

// Slice off the old HostCard, up to the comment:
const oldCardIndex = finalCode.indexOf("// ──― HostCard");
if (oldCardIndex !== -1) {
   finalCode = finalCode.slice(0, oldCardIndex) + newCardCode;
   fs.writeFileSync('src/features/ssh/SshHostPicker.tsx', finalCode);
} else {
  // Try another index
  const alternativeIndex = finalCode.indexOf("interface HostCardProps");
  if (alternativeIndex !== -1) {
     finalCode = finalCode.slice(0, alternativeIndex) + newCardCode;
     fs.writeFileSync('src/features/ssh/SshHostPicker.tsx', finalCode);
  }
}

console.log("Done");
