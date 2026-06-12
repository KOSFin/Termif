import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2, FolderOpen, Paperclip, Server, Search, ChevronUp, Zap, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { SshConnectOptions, SshHostEntry } from "@/types/models";
import { HostCard } from "@/features/ssh/HostCard";
import { getHostColor, getInitial, loadOsCache, type OsInfo } from "@/features/ssh/sshHostPickerUtils";

interface SshHostPickerProps {
  tabId: string;
}

type HostSortMode = "alias_asc" | "alias_desc" | "host_asc";
type SettingsTab = "connection" | "appearance" | "danger";

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

  const [sortMode] = useState<HostSortMode>("alias_asc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); 
  const [connectingAlias, setConnectingAlias] = useState<string>();
  const [draggingHostId, setDraggingHostId] = useState<string>();
  const [dragOverTarget, setDragOverTarget] = useState<string>(); 
  const [osCache, setOsCache] = useState<Record<string, OsInfo>>(() => loadOsCache());

  // Connected state
  const connectedHostAliases = useMemo(() => {
    return new Set(
      tabs
        .filter((tab) => tab.kind === "ssh" && !!tab.sessionId)
        .map((tab) => tab.sshAlias)
        .filter(Boolean)
    );
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

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalName, setGroupModalName] = useState("");
  const [renameGroupId, setRenameGroupId] = useState<string>();
  const [alreadyConnectedModal, setAlreadyConnectedModal] = useState<string | null>(null);

  // Group context menu (right-click on a group heading)
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);
  // Delete-group modal: choose what happens to the hosts inside the group
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [deleteHostsAction, setDeleteHostsAction] = useState<"ungroup" | "move" | "cascade">("ungroup");
  const [deleteMoveTarget, setDeleteMoveTarget] = useState<string>("");

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

  const filteredManaged = useMemo(() => {
    if (!searchQuery.trim()) return managedHosts;
    const q = searchQuery.toLowerCase();
    return managedHosts.filter(h =>
      h.alias.toLowerCase().includes(q) ||
      h.host_name.toLowerCase().includes(q) ||
      (h.user ?? "").toLowerCase().includes(q)
    );
  }, [managedHosts, searchQuery]);

  const groupedManaged = useMemo(() =>
    sshGroups.slice().sort((a, b) => a.order - b.order).map((group) => ({
      group,
      hosts: sortHosts(filteredManaged.filter((h) => h.group_id === group.id))
    })), [filteredManaged, sortHosts, sshGroups]);

  const ungroupedManaged = useMemo(
    () => sortHosts(filteredManaged.filter((h) => !h.group_id)),
    [filteredManaged, sortHosts]
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

  const onConfirmConnect = useCallback(async (alias: string) => {
    setConnectingAlias(alias);
    try { await connectSshTab(tabId, alias); }
    catch (e) { toast(`Connection failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setConnectingAlias(undefined); setAlreadyConnectedModal(null); }
  }, [connectSshTab, tabId, toast]);

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

  const saveSettings = useCallback(async () => {
    if (!settingsDraft) return;
    if (!settingsDraft.alias.trim() || !settingsDraft.host_name.trim()) {       
      toast("Alias and hostname are required"); return;
    }
    await saveManagedHost({ ...settingsDraft, alias: settingsDraft.alias.trim(), host_name: settingsDraft.host_name.trim(), source: "managed" });
    setSettingsDraft(null);
    toast("Host saved");
  }, [saveManagedHost, settingsDraft, toast]);

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

  const importHosts = useCallback(async () => {
    const toImport = importedHosts.filter((h) => importSelected.has(h.alias) && !importedAliasSet.has(h.alias));
    for (const host of toImport) {
      await saveManagedHost({ ...host, id: "", source: "managed", original_alias: host.alias });
    }
    setImportModalOpen(false);
    toast(`Imported ${toImport.length} host(s)`);
    await refreshHosts();
  }, [importSelected, importedAliasSet, importedHosts, refreshHosts, saveManagedHost, toast]);

  const runQuickConnect = useCallback(async () => {
    const host = qcDraft.host.trim();
    if (!host) { toast("Host is required"); return; }
    const alias = qcDraft.alias?.trim() || host;
    try {
      await connectSshTabWithOptions(tabId, { ...qcDraft, alias, host, user: qcDraft.user?.trim() || null, port: qcDraft.port ?? 22 }, qcSave, null);
      setQuickConnectOpen(false);
      setQcPopoverOpen(false);
    } catch (e) { toast(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
  }, [connectSshTabWithOptions, qcDraft, qcSave, tabId, toast]);

  const chooseIdentityFile = async (target: "settings" | "quickConnect") => {
    try {
      const selected = await openDialog({ multiple: false, directory: false });
      if (typeof selected !== "string") return;
      if (target === "settings") {
        setSettingsDraft((p) => p ? { ...p, identity_file: selected } : p);
        return;
      }
      setQcDraft((p) => ({ ...p, identity_file: selected }));
    } catch (e) {
      toast(`File picker failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openGroupModal = (groupId?: string) => {
    setRenameGroupId(groupId);
    setGroupModalName(groupId ? sshGroups.find((g) => g.id === groupId)?.name ?? "" : "");
    setGroupModalOpen(true);
  };

  const saveGroupModal = useCallback(async () => {
    const name = groupModalName.trim();
    if (!name) return;
    if (renameGroupId) { await renameHostGroup(renameGroupId, name); toast("Group renamed"); }
    else { await createHostGroup(name); toast("Group created"); }
    setGroupModalOpen(false);
  }, [createHostGroup, groupModalName, renameGroupId, renameHostGroup, toast]);

  const openDeleteGroupModal = useCallback((groupId: string) => {
    setGroupMenu(null);
    setDeleteGroupTarget(groupId);
    setDeleteHostsAction("ungroup");
    // Preselect another group to move into, if one exists.
    const otherGroup = sshGroups.find((g) => g.id !== groupId);
    setDeleteMoveTarget(otherGroup?.id ?? "");
  }, [sshGroups]);

  const confirmDeleteGroup = useCallback(async () => {
    if (!deleteGroupTarget) return;
    try {
      await deleteHostGroup(deleteGroupTarget, {
        hostsAction: deleteHostsAction,
        targetGroupId: deleteHostsAction === "move" ? (deleteMoveTarget || null) : null,
      });
      toast(
        deleteHostsAction === "cascade"
          ? "Group and its hosts deleted"
          : deleteHostsAction === "move"
            ? "Group deleted, hosts moved"
            : "Group deleted"
      );
    } catch (e) {
      toast(`Failed to delete group: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleteGroupTarget(null);
      if (activeGroupTab === deleteGroupTarget) setActiveGroupTab("ALL");
    }
  }, [activeGroupTab, deleteGroupTarget, deleteHostsAction, deleteHostGroup, deleteMoveTarget, toast]);

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

  useEffect(() => {
    const anyModalOpen = settingsDraft !== null || importModalOpen || quickConnectOpen || alreadyConnectedModal !== null || groupModalOpen || deleteGroupTarget !== null;
    if (!anyModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsDraft !== null) {
          setSettingsDraft(null);
          return;
        }
        if (importModalOpen) {
          setImportModalOpen(false);
          return;
        }
        if (quickConnectOpen) {
          setQuickConnectOpen(false);
          return;
        }
        if (alreadyConnectedModal) {
          setAlreadyConnectedModal(null);
          return;
        }
        if (deleteGroupTarget) {
          setDeleteGroupTarget(null);
          return;
        }
        if (groupModalOpen) {
          setGroupModalOpen(false);
        }
        return;
      }

      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "TEXTAREA") return;

      if (settingsDraft !== null) {
        event.preventDefault();
        void saveSettings();
        return;
      }

      if (importModalOpen && importSelected.size > 0) {
        event.preventDefault();
        void importHosts();
        return;
      }

      if (quickConnectOpen) {
        event.preventDefault();
        void runQuickConnect();
        return;
      }

      if (alreadyConnectedModal) {
        event.preventDefault();
        void onConfirmConnect(alreadyConnectedModal);
        return;
      }

      if (groupModalOpen) {
        event.preventDefault();
        void saveGroupModal();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    alreadyConnectedModal,
    groupModalOpen,
    deleteGroupTarget,
    importHosts,
    importModalOpen,
    importSelected.size,
    onConfirmConnect,
    quickConnectOpen,
    runQuickConnect,
    saveGroupModal,
    saveSettings,
    settingsDraft,
  ]);

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
            </div>
            {qcPopoverOpen && (
              <>
                <div className="dropdown-backdrop" onClick={() => setQcPopoverOpen(false)} />
                <div className="new-host-dropdown">
                  <button
                    className="new-host-dropdown-item"
                    onClick={() => {
                      setQuickConnectOpen(true);
                      setQcPopoverOpen(false);
                    }}
                  >
                    <Zap size={14} strokeWidth={2} /> Quick Connect
                  </button>
                  <button
                    className="new-host-dropdown-item"
                    onClick={() => {
                      setSettingsDraft({ ...blankHost });
                      setSettingsTab("connection");
                      setQcPopoverOpen(false);
                    }}
                  >
                    <Plus size={14} strokeWidth={2} /> Add to list
                  </button>
                </div>
              </>
            )}
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
          <button onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(""); }} title="Search..." className={searchOpen ? "active" : ""}>
            {searchOpen ? <X size={16}/> : <Search size={16}/>}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="ssh-search-bar">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hosts by alias, hostname, or user..."
            onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }}
          />
        </div>
      )}

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
                onContextMenu={(e) => {
                  e.preventDefault();
                  setGroupMenu({ groupId: group.id, x: e.clientX, y: e.clientY });
                }}
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
        <div className="modal-overlay" onClick={() => setSettingsDraft(null)} onKeyDown={(e) => {
          if (e.key === "Escape") setSettingsDraft(null);
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).tagName !== "SELECT") void saveSettings();
        }}>
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
                  <div className="ssh-key-picker-row">
                    <input value={settingsDraft.identity_file ?? ""} onChange={(e) => setSettingsDraft((p) => p ? { ...p, identity_file: e.target.value } : p)} placeholder="~/.ssh/id_ed25519" />
                    <button type="button" title="Choose identity file" onClick={() => void chooseIdentityFile("settings")}>
                      <FolderOpen size={14} strokeWidth={2} />
                    </button>
                  </div>
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
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)} onKeyDown={(e) => {
          if (e.key === "Escape") setImportModalOpen(false);
        }}>
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
                        {done && <span className="import-done-badge">Imported</span>}
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
                <div className="ssh-key-picker-row">
                  <input value={qcDraft.identity_file ?? ""} onChange={(e) => setQcDraft((p) => ({ ...p, identity_file: e.target.value }))} placeholder="~/.ssh/id_ed25519" />
                  <button type="button" title="Choose identity file" onClick={() => void chooseIdentityFile("quickConnect")}>
                    <FolderOpen size={14} strokeWidth={2} />
                  </button>
                </div>
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
        <div className="modal-overlay" onClick={() => setAlreadyConnectedModal(null)} onKeyDown={(e) => {
          if (e.key === "Escape") setAlreadyConnectedModal(null);
          if (e.key === "Enter") void onConfirmConnect(alreadyConnectedModal);
        }}>
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
            <div className="modal-footer" style={{ justifyContent: "flex-end", gap: "8px", display: "flex" }}>
              <button className="ghost" onClick={() => setAlreadyConnectedModal(null)}>Cancel</button>
              <button className="ghost" onClick={() => handleGoToTab(alreadyConnectedModal)}>Go to Tab</button>
              <button className="primary" onClick={() => onConfirmConnect(alreadyConnectedModal)}>Open New Connection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Group Modal ── */}
      {groupModalOpen && (
        <div className="modal-overlay" onClick={() => setGroupModalOpen(false)} onKeyDown={(e) => {
          if (e.key === "Escape") setGroupModalOpen(false);
        }}>
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
      {/* ── Group Context Menu (right-click on a group heading) ── */}
      {groupMenu && (
        <>
          <div className="dropdown-backdrop" onClick={() => setGroupMenu(null)} onContextMenu={(e) => { e.preventDefault(); setGroupMenu(null); }} />
          <div
            className="new-host-dropdown ssh-group-context-menu"
            style={{ position: "fixed", top: groupMenu.y, left: groupMenu.x, right: "auto" }}
          >
            <button
              className="new-host-dropdown-item"
              onClick={() => { openGroupModal(groupMenu.groupId); setGroupMenu(null); }}
            >
              <FolderOpen size={14} strokeWidth={2} /> Rename group
            </button>
            <button
              className="new-host-dropdown-item danger"
              onClick={() => openDeleteGroupModal(groupMenu.groupId)}
            >
              <Trash2 size={14} strokeWidth={2} /> Delete group…
            </button>
          </div>
        </>
      )}

      {/* ── Delete Group Modal ── */}
      {deleteGroupTarget && (() => {
        const group = sshGroups.find((g) => g.id === deleteGroupTarget);
        const hostsInGroup = managedHosts.filter((h) => h.group_id === deleteGroupTarget);
        const otherGroups = sshGroups.filter((g) => g.id !== deleteGroupTarget);
        return (
          <div className="modal-overlay" onClick={() => setDeleteGroupTarget(null)} onKeyDown={(e) => {
            if (e.key === "Escape") setDeleteGroupTarget(null);
            if (e.key === "Enter") void confirmDeleteGroup();
          }}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Delete group "{group?.name ?? ""}"</h3>
                <button className="ghost" onClick={() => setDeleteGroupTarget(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="modal-tip">
                  This group has {hostsInGroup.length} host{hostsInGroup.length === 1 ? "" : "s"}. Choose what to do with {hostsInGroup.length === 1 ? "it" : "them"}.
                </div>
                <label className="modal-checkbox-row">
                  <input type="radio" name="delete-hosts-action" checked={deleteHostsAction === "ungroup"} onChange={() => setDeleteHostsAction("ungroup")} />
                  <span>Keep hosts, move them to "Without a group"</span>
                </label>
                <label className="modal-checkbox-row" style={{ opacity: otherGroups.length === 0 ? 0.5 : 1 }}>
                  <input type="radio" name="delete-hosts-action" disabled={otherGroups.length === 0} checked={deleteHostsAction === "move"} onChange={() => setDeleteHostsAction("move")} />
                  <span>Move hosts to another group</span>
                </label>
                {deleteHostsAction === "move" && otherGroups.length > 0 && (
                  <select value={deleteMoveTarget} onChange={(e) => setDeleteMoveTarget(e.target.value)} style={{ marginLeft: 24 }}>
                    {otherGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}
                <label className="modal-checkbox-row">
                  <input type="radio" name="delete-hosts-action" checked={deleteHostsAction === "cascade"} onChange={() => setDeleteHostsAction("cascade")} />
                  <span className="ssh-delete-cascade-label">Delete hosts together with the group</span>
                </label>
              </div>
              <div className="modal-footer">
                <button className="ghost" onClick={() => setDeleteGroupTarget(null)}>Cancel</button>
                <button className="primary danger" onClick={() => void confirmDeleteGroup()}>
                  {deleteHostsAction === "cascade" ? "Delete group & hosts" : "Delete group"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
