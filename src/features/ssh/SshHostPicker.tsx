import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { SshConnectOptions, SshHostEntry } from "@/types/models";

interface SshHostPickerProps {
  tabId: string;
}

type HostSortMode = "alias_asc" | "alias_desc" | "host_asc";
type DraftMode = "managed" | "imported_override";

const blankHost: SshHostEntry = {
  id: "",
  alias: "",
  host_name: "",
  user: "",
  port: 22,
  identity_file: "",
  password: "",
  group_id: null,
  original_alias: null,
  source: "managed"
};

const hostColors = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#5fb4d4", "#d47ea8", "#7cb87a"];

function getHostColor(alias: string): string {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) {
    hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hostColors[Math.abs(hash) % hostColors.length];
}

function getHostInitial(alias: string): string {
  return (alias[0] ?? "?").toUpperCase();
}

function defaultQuickConnect(): SshConnectOptions {
  return {
    alias: "",
    host: "",
    user: "",
    port: 22,
    identity_file: "",
    password: ""
  };
}

export function SshHostPicker(props: SshHostPickerProps) {
  const {
    importedHosts,
    managedHosts,
    sshGroups,
    connectSshTab,
    connectSshTabWithOptions,
    saveManagedHost,
    deleteManagedHost,
    refreshHosts,
    createHostGroup,
    renameHostGroup,
    deleteHostGroup,
    toast
  } = useAppStore((state) => ({
    importedHosts: state.importedHosts,
    managedHosts: state.managedHosts,
    sshGroups: state.sshGroups,
    connectSshTab: state.connectSshTab,
    connectSshTabWithOptions: state.connectSshTabWithOptions,
    saveManagedHost: state.saveManagedHost,
    deleteManagedHost: state.deleteManagedHost,
    refreshHosts: state.refreshHosts,
    createHostGroup: state.createHostGroup,
    renameHostGroup: state.renameHostGroup,
    deleteHostGroup: state.deleteHostGroup,
    toast: state.toast
  }));

  const [draft, setDraft] = useState<SshHostEntry | null>(null);
  const [draftMode, setDraftMode] = useState<DraftMode>("managed");
  const [importedSourceAlias, setImportedSourceAlias] = useState<string>();
  const [connectingAlias, setConnectingAlias] = useState<string>();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<HostSortMode>("alias_asc");
  const [draggingHostId, setDraggingHostId] = useState<string>();
  const [dragOverGroupId, setDragOverGroupId] = useState<string>();

  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [quickConnectSaveHost, setQuickConnectSaveHost] = useState(false);
  const [quickConnectGroupId, setQuickConnectGroupId] = useState<string>("");
  const [quickConnectDraft, setQuickConnectDraft] = useState<SshConnectOptions>(defaultQuickConnect());

  const sortHosts = useCallback((hosts: SshHostEntry[]) => {
    const data = hosts.slice();
    data.sort((a, b) => {
      if (sortMode === "alias_desc") return b.alias.localeCompare(a.alias);
      if (sortMode === "host_asc") return a.host_name.localeCompare(b.host_name);
      return a.alias.localeCompare(b.alias);
    });
    return data;
  }, [sortMode]);

  const groupedManaged = useMemo(() => {
    return sshGroups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        group,
        hosts: sortHosts(managedHosts.filter((host) => host.group_id === group.id))
      }));
  }, [managedHosts, sortHosts, sshGroups]);

  const ungroupedManaged = useMemo(
    () => sortHosts(managedHosts.filter((host) => !host.group_id)),
    [managedHosts, sortHosts]
  );

  const sortedImported = useMemo(
    () => sortHosts(importedHosts),
    [importedHosts, sortHosts]
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
      await connectSshTab(props.tabId, alias);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`Connection failed: ${message}`);
    } finally {
      setConnectingAlias(undefined);
    }
  };

  const openQuickConnect = () => {
    setQuickConnectDraft(defaultQuickConnect());
    setQuickConnectSaveHost(false);
    setQuickConnectGroupId("");
    setQuickConnectOpen(true);
  };

  const runQuickConnect = async () => {
    const alias = quickConnectDraft.alias?.trim() || quickConnectDraft.host.trim();
    const host = quickConnectDraft.host.trim();
    if (!host) {
      toast("Host is required");
      return;
    }

    try {
      await connectSshTabWithOptions(
        props.tabId,
        {
          ...quickConnectDraft,
          alias,
          host,
          user: quickConnectDraft.user?.trim() || null,
          identity_file: quickConnectDraft.identity_file?.trim() || null,
          password: quickConnectDraft.password || null,
          port: quickConnectDraft.port ?? 22,
        },
        quickConnectSaveHost,
        quickConnectSaveHost ? (quickConnectGroupId || null) : null
      );
      setQuickConnectOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`Quick connect failed: ${message}`);
    }
  };

  const openNewHostModal = (groupId?: string | null) => {
    setDraftMode("managed");
    setImportedSourceAlias(undefined);
    setDraft({ ...blankHost, group_id: groupId ?? null });
  };

  const openEditHostModal = (host: SshHostEntry) => {
    setDraftMode("managed");
    setImportedSourceAlias(undefined);
    setDraft({ ...host });
  };

  const openImportedOverridesModal = (host: SshHostEntry) => {
    setDraftMode("imported_override");
    setImportedSourceAlias(host.original_alias ?? host.alias);
    setDraft({ ...host });
  };

  const moveHostToGroup = async (hostId: string, groupId: string | null) => {
    const host = managedHosts.find((item) => item.id === hostId);
    if (!host) return;
    if ((host.group_id ?? null) === groupId) return;
    await saveManagedHost({ ...host, group_id: groupId });
  };

  const saveHost = async () => {
    if (!draft) return;
    if (!draft.alias.trim() || !draft.host_name.trim()) {
      toast("Alias and host are required");
      return;
    }

    if (draftMode === "imported_override") {
      const sourceAlias = importedSourceAlias || draft.original_alias || draft.alias;
      await invoke("set_imported_host_overrides", {
        sourceAlias,
        localAlias: draft.alias.trim(),
        groupId: draft.group_id ?? null,
      });
      await refreshHosts();
      toast("Imported host override updated");
      setDraft(null);
      return;
    }

    await saveManagedHost({
      ...draft,
      alias: draft.alias.trim(),
      host_name: draft.host_name.trim(),
      source: "managed"
    });
    setDraft(null);
  };

  const saveImportedAsManaged = async () => {
    if (!draft) return;
    if (!draft.alias.trim() || !draft.host_name.trim()) {
      toast("Alias and host are required");
      return;
    }

    await saveManagedHost({
      ...draft,
      id: "",
      source: "managed",
      original_alias: null,
    });
    toast("Imported host saved as managed");
  };

  const renameImportedInConfig = async () => {
    if (!draft || !importedSourceAlias) return;
    const nextAlias = draft.alias.trim();
    if (!nextAlias) {
      toast("Alias is required");
      return;
    }

    await invoke("rename_imported_host_in_config", {
      sourceAlias: importedSourceAlias,
      newAlias: nextAlias,
    });
    await refreshHosts();
    toast("SSH config updated");
  };

  const exportManagedToConfig = async (host: SshHostEntry) => {
    try {
      await invoke("export_managed_host_to_config", {
        hostId: host.id,
        overwriteExisting: false,
      });
      toast("Host exported to ~/.ssh/config");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("already exists")) {
        toast(message);
        return;
      }
      const overwrite = window.confirm("Alias already exists in ~/.ssh/config. Overwrite block?");
      if (!overwrite) return;
      await invoke("export_managed_host_to_config", {
        hostId: host.id,
        overwriteExisting: true,
      });
      toast("Host block updated in ~/.ssh/config");
    }
  };

  return (
    <div className="ssh-picker">
      <div className="ssh-header">
        <h2>SSH Hosts</h2>
        <div className="ssh-header-actions">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as HostSortMode)}
            title="Sort hosts"
          >
            <option value="alias_asc">Sort: Alias A-Z</option>
            <option value="alias_desc">Sort: Alias Z-A</option>
            <option value="host_asc">Sort: Host A-Z</option>
          </select>
          <button onClick={openQuickConnect}>Quick Connect</button>
          <button onClick={() => openNewHostModal()} className="primary">New Host</button>
          <button
            onClick={() => {
              const name = window.prompt("Group name")?.trim();
              if (name) void createHostGroup(name);
            }}
          >
            New Group
          </button>
          <button onClick={() => void refreshHosts()}>Refresh</button>
        </div>
      </div>

      <div className="ssh-help-line">
        Alias is your local friendly name for quick connect. For Identity File you can type full path or just key filename.
      </div>

      {groupedManaged.length > 0 && (
        <>
          <div className="ssh-section-title">Groups</div>
          <div className="ssh-grid">
            {groupedManaged.map((bundle) => (
              <div
                key={bundle.group.id}
                className={`ssh-group-card${dragOverGroupId === bundle.group.id ? " drag-over" : ""}`}
                onDragOver={(e) => {
                  if (!draggingHostId) return;
                  e.preventDefault();
                  setDragOverGroupId(bundle.group.id);
                }}
                onDrop={(e) => {
                  if (!draggingHostId) return;
                  e.preventDefault();
                  void moveHostToGroup(draggingHostId, bundle.group.id);
                  setDraggingHostId(undefined);
                  setDragOverGroupId(undefined);
                }}
                onDragLeave={() => {
                  if (dragOverGroupId === bundle.group.id) {
                    setDragOverGroupId(undefined);
                  }
                }}
              >
                <div className="ssh-group-header" onClick={() => toggleGroup(bundle.group.id)}>
                  <div className="ssh-group-icon">
                    {bundle.group.name[0]?.toUpperCase() ?? "G"}
                  </div>
                  <div className="ssh-group-info">
                    <div className="ssh-group-name">{bundle.group.name}</div>
                    <div className="ssh-group-count">
                      {bundle.hosts.length} host{bundle.hosts.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="ssh-group-actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openNewHostModal(bundle.group.id)} title="Add host">+</button>
                    <button
                      onClick={() => {
                        const next = window.prompt("Rename group", bundle.group.name)?.trim();
                        if (next && next !== bundle.group.name) {
                          void renameHostGroup(bundle.group.id, next);
                        }
                      }}
                      title="Rename group"
                    >
                      ✎
                    </button>
                    <button onClick={() => void deleteHostGroup(bundle.group.id)} title="Delete group">×</button>
                  </div>
                </div>
                {expandedGroups.has(bundle.group.id) && (
                  <div className="ssh-group-hosts">
                    {bundle.hosts.length === 0 ? (
                      <div className="ssh-group-empty">No hosts in this group</div>
                    ) : (
                      bundle.hosts.map((host) => (
                        <HostCard
                          key={host.id}
                          host={host}
                          connecting={connectingAlias === host.alias}
                          onConnect={connect}
                          onEdit={() => openEditHostModal(host)}
                          onExport={() => void exportManagedToConfig(host)}
                          draggable
                          onDragStart={() => {
                            setDraggingHostId(host.id);
                          }}
                          onDragEnd={() => {
                            setDraggingHostId(undefined);
                            setDragOverGroupId(undefined);
                          }}
                          onDelete={async () => {
                            await deleteManagedHost(host.id);
                          }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {ungroupedManaged.length > 0 && (
        <>
          <div className="ssh-section-title">Hosts</div>
          <div
            className={`ssh-grid ssh-dropzone${dragOverGroupId === "ungrouped" ? " drag-over" : ""}`}
            onDragOver={(e) => {
              if (!draggingHostId) return;
              e.preventDefault();
              setDragOverGroupId("ungrouped");
            }}
            onDrop={(e) => {
              if (!draggingHostId) return;
              e.preventDefault();
              void moveHostToGroup(draggingHostId, null);
              setDraggingHostId(undefined);
              setDragOverGroupId(undefined);
            }}
            onDragLeave={() => {
              if (dragOverGroupId === "ungrouped") {
                setDragOverGroupId(undefined);
              }
            }}
          >
            {ungroupedManaged.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                connecting={connectingAlias === host.alias}
                onConnect={connect}
                onEdit={() => openEditHostModal(host)}
                onExport={() => void exportManagedToConfig(host)}
                draggable
                onDragStart={() => {
                  setDraggingHostId(host.id);
                }}
                onDragEnd={() => {
                  setDraggingHostId(undefined);
                  setDragOverGroupId(undefined);
                }}
                onDelete={async () => {
                  await deleteManagedHost(host.id);
                }}
              />
            ))}
          </div>
        </>
      )}

      {importedHosts.length > 0 && (
        <>
          <div className="ssh-section-title">Imported from ~/.ssh/config</div>
          <div className="ssh-grid">
            {sortedImported.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                connecting={connectingAlias === host.alias}
                onConnect={connect}
                onEdit={() => openImportedOverridesModal(host)}
              />
            ))}
          </div>
        </>
      )}

      {managedHosts.length === 0 && importedHosts.length === 0 && (
        <div className="ssh-empty">
          No SSH hosts configured. Add a new host, import from ~/.ssh/config, or use Quick Connect.
        </div>
      )}

      {quickConnectOpen && (
        <div className="modal-overlay" onClick={() => setQuickConnectOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Quick Connect</h3>
              <button className="ghost" onClick={() => setQuickConnectOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Alias
                <input
                  value={quickConnectDraft.alias}
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, alias: e.target.value }))}
                  placeholder="friendly name (optional)"
                />
              </label>
              <label>
                Host
                <input
                  value={quickConnectDraft.host}
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder="server address"
                  autoFocus
                />
              </label>
              <label>
                User
                <input
                  value={quickConnectDraft.user ?? ""}
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, user: e.target.value }))}
                />
              </label>
              <label>
                Port
                <input
                  value={quickConnectDraft.port ?? 22}
                  type="number"
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, port: Number(e.target.value) || 22 }))}
                />
              </label>
              <label>
                Password (optional)
                <input
                  type="password"
                  value={quickConnectDraft.password ?? ""}
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="leave empty to use ssh key"
                />
              </label>
              <label>
                Identity File
                <input
                  value={quickConnectDraft.identity_file ?? ""}
                  onChange={(e) => setQuickConnectDraft((prev) => ({ ...prev, identity_file: e.target.value }))}
                  placeholder="id_ed25519 or full path"
                />
              </label>
              <label className="settings-row-toggle">
                <span>Save as managed host</span>
                <input
                  type="checkbox"
                  checked={quickConnectSaveHost}
                  onChange={(e) => setQuickConnectSaveHost(e.target.checked)}
                />
              </label>
              {quickConnectSaveHost ? (
                <label>
                  Group
                  <select
                    value={quickConnectGroupId}
                    onChange={(e) => setQuickConnectGroupId(e.target.value)}
                  >
                    <option value="">Ungrouped</option>
                    {sshGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setQuickConnectOpen(false)}>Cancel</button>
              <button className="primary" onClick={() => void runQuickConnect()}>Connect</button>
            </div>
          </div>
        </div>
      )}

      {draft !== null && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{draft.id ? "Edit Host" : draftMode === "imported_override" ? "Imported Host Overrides" : "New Host"}</h3>
              <button className="ghost" onClick={() => setDraft(null)}>×</button>
            </div>
            <div className="modal-body">
              {draftMode === "imported_override" ? (
                <div className="ssh-modal-tip">
                  Local override changes only Termif label/group. Global rename updates ~/.ssh/config Host alias.
                </div>
              ) : null}
              <label>
                Alias
                <input
                  value={draft.alias}
                  onChange={(e) => setDraft((p) => p ? { ...p, alias: e.target.value } : p)}
                  autoFocus
                />
              </label>
              <label>
                Host
                <input
                  value={draft.host_name}
                  onChange={(e) => setDraft((p) => p ? { ...p, host_name: e.target.value } : p)}
                />
              </label>
              <label>
                User
                <input
                  value={draft.user ?? ""}
                  onChange={(e) => setDraft((p) => p ? { ...p, user: e.target.value } : p)}
                />
              </label>
              <label>
                Port
                <input
                  value={draft.port ?? 22}
                  type="number"
                  onChange={(e) => setDraft((p) => p ? { ...p, port: Number(e.target.value) || 22 } : p)}
                />
              </label>
              <label>
                Password (optional)
                <input
                  type="password"
                  value={draft.password ?? ""}
                  onChange={(e) => setDraft((p) => p ? { ...p, password: e.target.value } : p)}
                />
              </label>
              <label>
                Identity File
                <input
                  value={draft.identity_file ?? ""}
                  onChange={(e) => setDraft((p) => p ? { ...p, identity_file: e.target.value } : p)}
                  placeholder="id_ed25519 or full path"
                />
              </label>
              <label>
                Group
                <select
                  value={draft.group_id ?? ""}
                  onChange={(e) => setDraft((p) => p ? { ...p, group_id: e.target.value || null } : p)}
                >
                  <option value="">Ungrouped</option>
                  {sshGroups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              {draftMode === "imported_override" ? (
                <>
                  <button onClick={() => void saveImportedAsManaged()}>Save as Managed</button>
                  <button onClick={() => void renameImportedInConfig()}>Rename in Config</button>
                </>
              ) : null}
              <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="primary" onClick={() => void saveHost()}>
                {draftMode === "imported_override" ? "Apply Local Override" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface HostCardProps {
  host: SshHostEntry;
  connecting: boolean;
  onConnect: (alias: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function HostCard(props: HostCardProps) {
  const color = getHostColor(props.host.alias);
  const subtitle = [
    props.host.user ? `${props.host.user}@` : "",
    props.host.host_name,
    props.host.port && props.host.port !== 22 ? `:${props.host.port}` : ""
  ].join("");

  return (
    <div
      className="host-card"
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      <div className="host-icon" style={{ background: color }}>
        {getHostInitial(props.host.alias)}
      </div>
      <div className="host-info">
        <div className="host-title">{props.host.alias}</div>
        <div className="host-subtitle">{subtitle || "No host configured"}</div>
      </div>
      <div className="host-actions">
        <button
          className="primary"
          onClick={() => props.onConnect(props.host.alias)}
          disabled={props.connecting}
        >
          {props.connecting ? "..." : "Connect"}
        </button>
        {props.onEdit ? (
          <button className="ghost" onClick={props.onEdit}>Edit</button>
        ) : null}
        {props.onExport ? (
          <button className="ghost" onClick={props.onExport}>To cfg</button>
        ) : null}
        {props.onDelete ? (
          <button className="danger ghost" onClick={props.onDelete}>Del</button>
        ) : null}
      </div>
    </div>
  );
}
