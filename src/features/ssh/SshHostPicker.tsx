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

  const [draft, setDraft] = useState<SshHostEntry>(blankHost);
  const [connectingAlias, setConnectingAlias] = useState<string>();

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

  return (
    <div className="ssh-picker">
      <div className="ssh-head">
        <h2>SSH Hosts</h2>
        <div className="ssh-head-actions">
          <button onClick={() => void refreshHosts()}>Refresh</button>
          <button
            onClick={() => {
              const name = window.prompt("Group name")?.trim();
              if (name) {
                void createHostGroup(name);
              }
            }}
          >
            New Group
          </button>
        </div>
      </div>

      <div className="ssh-grid">
        <section className="ssh-panel">
          <h3>Managed Hosts</h3>

          {groupedManaged.map((bundle) => (
            <div key={bundle.group.id} className="ssh-group-block">
              <div className="ssh-group-row">
                <strong>{bundle.group.name}</strong>
                <button className="danger ghost" onClick={() => void deleteHostGroup(bundle.group.id)}>Delete Group</button>
              </div>
              {bundle.hosts.length === 0 ? <div className="ssh-empty">No hosts</div> : null}
              {bundle.hosts.map((host) => (
                <HostCard
                  key={host.id}
                  host={host}
                  connecting={connectingAlias === host.alias}
                  onConnect={connect}
                  onEdit={() => setDraft(host)}
                  onDelete={async () => {
                    await deleteManagedHost(host.id);
                  }}
                />
              ))}
            </div>
          ))}

          <div className="ssh-group-block">
            <div className="ssh-group-row">
              <strong>Ungrouped</strong>
            </div>
            {ungroupedManaged.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                connecting={connectingAlias === host.alias}
                onConnect={connect}
                onEdit={() => setDraft(host)}
                onDelete={async () => {
                  await deleteManagedHost(host.id);
                }}
              />
            ))}
            {ungroupedManaged.length === 0 ? <div className="ssh-empty">No hosts</div> : null}
          </div>
        </section>

        <section className="ssh-panel">
          <h3>Imported from .ssh/config</h3>
          {importedHosts.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              connecting={connectingAlias === host.alias}
              onConnect={connect}
            />
          ))}
          {importedHosts.length === 0 ? <div className="ssh-empty">No imported hosts found</div> : null}
        </section>

        <section className="ssh-panel">
          <h3>{draft.id ? "Edit Host" : "Add Host"}</h3>
          <label>
            Alias
            <input
              value={draft.alias}
              onChange={(event) => setDraft((prev) => ({ ...prev, alias: event.target.value }))}
            />
          </label>
          <label>
            Host
            <input
              value={draft.host_name}
              onChange={(event) => setDraft((prev) => ({ ...prev, host_name: event.target.value }))}
            />
          </label>
          <label>
            User
            <input
              value={draft.user ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, user: event.target.value }))}
            />
          </label>
          <label>
            Port
            <input
              value={draft.port ?? 22}
              type="number"
              onChange={(event) => setDraft((prev) => ({ ...prev, port: Number(event.target.value) || 22 }))}
            />
          </label>
          <label>
            Identity File
            <input
              value={draft.identity_file ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, identity_file: event.target.value }))}
            />
          </label>
          <label>
            Group
            <select
              value={draft.group_id ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setDraft((prev) => ({ ...prev, group_id: value || null }));
              }}
            >
              <option value="">Ungrouped</option>
              {sshGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ssh-form-actions">
            <button
              onClick={async () => {
                if (!draft.alias.trim() || !draft.host_name.trim()) {
                  toast("Alias and host are required");
                  return;
                }
                await saveManagedHost({
                  ...draft,
                  alias: draft.alias.trim(),
                  host_name: draft.host_name.trim(),
                  source: "managed"
                });
                setDraft(blankHost);
              }}
            >
              Save Host
            </button>
            <button className="ghost" onClick={() => setDraft(blankHost)}>
              Reset
            </button>
          </div>
        </section>
      </div>
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
  return (
    <div className="host-card">
      <div>
        <div className="host-title">{props.host.alias}</div>
        <div className="host-subtitle">
          {props.host.user ? `${props.host.user}@` : ""}
          {props.host.host_name}
          {props.host.port ? `:${props.host.port}` : ""}
        </div>
      </div>
      <div className="host-actions">
        <button onClick={() => props.onConnect(props.host.alias)} disabled={props.connecting}>
          {props.connecting ? "Connecting..." : "Connect"}
        </button>
        {props.onEdit ? <button onClick={props.onEdit}>Edit</button> : null}
        {props.onDelete ? (
          <button className="danger ghost" onClick={props.onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
