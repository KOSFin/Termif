import { useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { SshHostEntry } from "@/types/models";

interface SshHostPickerProps {
  tabId: string;
}

const blankHost: SshHostEntry = {
  id: "",
  alias: "",
  host_name: "",
  user: "",
  port: 22,
  identity_file: "",
  group_id: null,
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

export function SshHostPicker(props: SshHostPickerProps) {
  const {
    importedHosts,
    managedHosts,
    sshGroups,
    connectSshTab,
    saveManagedHost,
    deleteManagedHost,
    refreshHosts,
    createHostGroup,
    deleteHostGroup,
    toast
  } = useAppStore((state) => ({
    importedHosts: state.importedHosts,
    managedHosts: state.managedHosts,
    sshGroups: state.sshGroups,
    connectSshTab: state.connectSshTab,
    saveManagedHost: state.saveManagedHost,
    deleteManagedHost: state.deleteManagedHost,
    refreshHosts: state.refreshHosts,
    createHostGroup: state.createHostGroup,
    deleteHostGroup: state.deleteHostGroup,
    toast: state.toast
  }));

  const [draft, setDraft] = useState<SshHostEntry | null>(null);
  const [connectingAlias, setConnectingAlias] = useState<string>();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedManaged = useMemo(() => {
    return sshGroups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        group,
        hosts: managedHosts.filter((host) => host.group_id === group.id)
      }));
  }, [managedHosts, sshGroups]);

  const ungroupedManaged = managedHosts.filter((host) => !host.group_id);

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

  const openNewHostModal = (groupId?: string | null) => {
    setDraft({ ...blankHost, group_id: groupId ?? null });
  };

  const openEditHostModal = (host: SshHostEntry) => {
    setDraft({ ...host });
  };

  const saveHost = async () => {
    if (!draft) return;
    if (!draft.alias.trim() || !draft.host_name.trim()) {
      toast("Alias and host are required");
      return;
    }
    await saveManagedHost({ ...draft, alias: draft.alias.trim(), host_name: draft.host_name.trim(), source: "managed" });
    setDraft(null);
  };

  return (
    <div className="ssh-picker">
      <div className="ssh-header">
        <h2>SSH Hosts</h2>
        <div className="ssh-header-actions">
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

      {/* Groups */}
      {groupedManaged.length > 0 && (
        <>
          <div className="ssh-section-title">Groups</div>
          <div className="ssh-grid">
            {groupedManaged.map((bundle) => (
              <div key={bundle.group.id} className="ssh-group-card">
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

      {/* Ungrouped Hosts */}
      {ungroupedManaged.length > 0 && (
        <>
          <div className="ssh-section-title">Hosts</div>
          <div className="ssh-grid">
            {ungroupedManaged.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                connecting={connectingAlias === host.alias}
                onConnect={connect}
                onEdit={() => openEditHostModal(host)}
                onDelete={async () => {
                  await deleteManagedHost(host.id);
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Imported */}
      {importedHosts.length > 0 && (
        <>
          <div className="ssh-section-title">Imported from ~/.ssh/config</div>
          <div className="ssh-grid">
            {importedHosts.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                connecting={connectingAlias === host.alias}
                onConnect={connect}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {managedHosts.length === 0 && importedHosts.length === 0 && (
        <div className="ssh-empty">
          No SSH hosts configured. Add a new host or import from ~/.ssh/config.
        </div>
      )}

      {/* Host modal */}
      {draft !== null && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{draft.id ? "Edit Host" : "New Host"}</h3>
              <button className="ghost" onClick={() => setDraft(null)}>×</button>
            </div>
            <div className="modal-body">
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
                Identity File
                <input
                  value={draft.identity_file ?? ""}
                  onChange={(e) => setDraft((p) => p ? { ...p, identity_file: e.target.value } : p)}
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
              <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="primary" onClick={() => void saveHost()}>Save</button>
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
}

function HostCard(props: HostCardProps) {
  const color = getHostColor(props.host.alias);
  const subtitle = [
    props.host.user ? `${props.host.user}@` : "",
    props.host.host_name,
    props.host.port && props.host.port !== 22 ? `:${props.host.port}` : ""
  ].join("");

  return (
    <div className="host-card">
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
        {props.onDelete ? (
          <button className="danger ghost" onClick={props.onDelete}>Del</button>
        ) : null}
      </div>
    </div>
  );
}
