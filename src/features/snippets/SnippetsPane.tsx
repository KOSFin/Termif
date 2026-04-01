import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderPlus, Plus, Pencil, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

interface SnippetsPaneProps {
  activeSessionId?: string;
}

interface SnippetGroup {
  id: string;
  name: string;
  order: number;
}

interface CommandSnippet {
  id: string;
  groupId?: string | null;
  title: string;
  description: string;
  command: string;
}

interface SnippetState {
  groups: SnippetGroup[];
  snippets: CommandSnippet[];
}

const STORAGE_KEY = "termif.snippets.v1";

function loadState(): SnippetState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { groups: [], snippets: [] };
    }
    const parsed = JSON.parse(raw) as SnippetState;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      snippets: Array.isArray(parsed.snippets) ? parsed.snippets : [],
    };
  } catch {
    return { groups: [], snippets: [] };
  }
}

export function SnippetsPane(props: SnippetsPaneProps) {
  const toast = useAppStore((state) => state.toast);
  const [state, setState] = useState<SnippetState>(() => loadState());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const orderedGroups = useMemo(
    () => state.groups.slice().sort((a, b) => a.order - b.order),
    [state.groups]
  );

  const groupedSnippets = useMemo(() => {
    return orderedGroups.map((group) => ({
      group,
      snippets: state.snippets.filter((snippet) => snippet.groupId === group.id),
    }));
  }, [orderedGroups, state.snippets]);

  const ungrouped = useMemo(
    () => state.snippets.filter((snippet) => !snippet.groupId),
    [state.snippets]
  );

  const createGroup = () => {
    const name = window.prompt("Group name")?.trim();
    if (!name) return;
    setState((prev) => ({
      ...prev,
      groups: [...prev.groups, { id: crypto.randomUUID(), name, order: prev.groups.length }],
    }));
  };

  const renameGroup = (groupId: string) => {
    const current = state.groups.find((group) => group.id === groupId);
    if (!current) return;
    const name = window.prompt("Rename group", current.name)?.trim();
    if (!name || name === current.name) return;
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((group) => (group.id === groupId ? { ...group, name } : group)),
    }));
  };

  const deleteGroup = (groupId: string) => {
    if (!window.confirm("Delete group? Snippets will be moved to Ungrouped.")) return;
    setState((prev) => ({
      groups: prev.groups.filter((group) => group.id !== groupId),
      snippets: prev.snippets.map((snippet) =>
        snippet.groupId === groupId ? { ...snippet, groupId: null } : snippet
      ),
    }));
  };

  const createSnippet = (groupId?: string | null) => {
    const title = window.prompt("Snippet name")?.trim();
    if (!title) return;
    const command = window.prompt("Command")?.trim();
    if (!command) return;
    const description = window.prompt("Description (optional)")?.trim() ?? "";

    setState((prev) => ({
      ...prev,
      snippets: [
        ...prev.snippets,
        {
          id: crypto.randomUUID(),
          title,
          command,
          description,
          groupId: groupId ?? null,
        },
      ],
    }));
  };

  const editSnippet = (snippetId: string) => {
    const current = state.snippets.find((snippet) => snippet.id === snippetId);
    if (!current) return;

    const title = window.prompt("Snippet name", current.title)?.trim();
    if (!title) return;
    const command = window.prompt("Command", current.command)?.trim();
    if (!command) return;
    const description = window.prompt("Description", current.description)?.trim() ?? "";

    setState((prev) => ({
      ...prev,
      snippets: prev.snippets.map((snippet) =>
        snippet.id === snippetId ? { ...snippet, title, command, description } : snippet
      ),
    }));
  };

  const deleteSnippet = (snippetId: string) => {
    if (!window.confirm("Delete snippet?")) return;
    setState((prev) => ({
      ...prev,
      snippets: prev.snippets.filter((snippet) => snippet.id !== snippetId),
    }));
  };

  const runSnippet = async (snippet: CommandSnippet) => {
    if (!props.activeSessionId) {
      toast("No active terminal session");
      return;
    }

    try {
      await invoke("send_terminal_input", {
        sessionId: props.activeSessionId,
        data: `${snippet.command}\r`,
      });
      toast(`Executed: ${snippet.title}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="snippets-pane">
      <div className="snippets-header">
        <h3>Command Snippets</h3>
        <div className="snippets-actions">
          <button onClick={createGroup} title="New group">
            <FolderPlus size={14} strokeWidth={2} />
          </button>
          <button onClick={() => createSnippet(null)} title="New snippet">
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="snippets-list">
        {groupedSnippets.map(({ group, snippets }) => (
          <section className="snippet-group" key={group.id}>
            <div className="snippet-group-head">
              <div className="snippet-group-title">{group.name}</div>
              <div className="snippet-group-actions">
                <button onClick={() => createSnippet(group.id)} title="Add snippet">
                  <Plus size={13} strokeWidth={2} />
                </button>
                <button onClick={() => renameGroup(group.id)} title="Rename group">
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button onClick={() => deleteGroup(group.id)} title="Delete group">
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            </div>

            {snippets.length === 0 ? (
              <div className="snippet-empty">No snippets</div>
            ) : (
              snippets.map((snippet) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  onRun={() => void runSnippet(snippet)}
                  onEdit={() => editSnippet(snippet.id)}
                  onDelete={() => deleteSnippet(snippet.id)}
                />
              ))
            )}
          </section>
        ))}

        {ungrouped.length > 0 ? (
          <section className="snippet-group">
            <div className="snippet-group-head">
              <div className="snippet-group-title">Ungrouped</div>
            </div>
            {ungrouped.map((snippet) => (
              <SnippetCard
                key={snippet.id}
                snippet={snippet}
                onRun={() => void runSnippet(snippet)}
                onEdit={() => editSnippet(snippet.id)}
                onDelete={() => deleteSnippet(snippet.id)}
              />
            ))}
          </section>
        ) : null}

        {state.snippets.length === 0 ? (
          <div className="snippet-empty-global">Create your first command snippet and run it in one click.</div>
        ) : null}
      </div>
    </div>
  );
}

interface SnippetCardProps {
  snippet: CommandSnippet;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SnippetCard(props: SnippetCardProps) {
  return (
    <article className="snippet-card">
      <div className="snippet-main">
        <div className="snippet-title">{props.snippet.title}</div>
        {props.snippet.description ? <div className="snippet-description">{props.snippet.description}</div> : null}
        <code className="snippet-command">{props.snippet.command}</code>
      </div>
      <div className="snippet-card-actions">
        <button className="primary" onClick={props.onRun} title="Run now">
          <Play size={13} strokeWidth={2} /> Run
        </button>
        <button onClick={props.onEdit} title="Edit">
          <Pencil size={13} strokeWidth={2} />
        </button>
        <button className="danger ghost" onClick={props.onDelete} title="Delete">
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}
