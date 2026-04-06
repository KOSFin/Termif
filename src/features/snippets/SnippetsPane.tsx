import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderPlus, Plus, Pencil, Trash2, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
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

type ModalMode = { type: "create_snippet"; groupId?: string | null }
  | { type: "edit_snippet"; snippetId: string }
  | { type: "create_group" }
  | { type: "rename_group"; groupId: string };

function loadState(): SnippetState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { groups: [], snippets: [] };
    const parsed = JSON.parse(raw) as SnippetState;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      snippets: Array.isArray(parsed.snippets) ? parsed.snippets : [],
    };
  } catch {
    return { groups: [], snippets: [] };
  }
}

export function SnippetsPane({ activeSessionId }: SnippetsPaneProps) {
  const toast = useAppStore((s) => s.toast);
  const [state, setState] = useState<SnippetState>(() => loadState());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCommand, setDraftCommand] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftGroupId, setDraftGroupId] = useState<string>("");
  const [draftGroupName, setDraftGroupName] = useState("");

  // Drag-and-drop
  const [draggingId, setDraggingId] = useState<string>();
  const [dragOverId, setDragOverId] = useState<string>();
  const [dragOverGroupId, setDragOverGroupId] = useState<string>();
  const dragCounter = useRef(0);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const orderedGroups = useMemo(
    () => state.groups.slice().sort((a, b) => a.order - b.order),
    [state.groups]
  );

  const groupedSnippets = useMemo(() =>
    orderedGroups.map((group) => ({
      group,
      snippets: state.snippets.filter((s) => s.groupId === group.id),
    })),
    [orderedGroups, state.snippets]
  );

  const ungrouped = useMemo(
    () => state.snippets.filter((s) => !s.groupId),
    [state.snippets]
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openCreateSnippet = (groupId?: string | null) => {
    setDraftTitle("");
    setDraftCommand("");
    setDraftDesc("");
    setDraftGroupId(groupId ?? "");
    setModal({ type: "create_snippet", groupId });
  };

  const openEditSnippet = (snippetId: string) => {
    const s = state.snippets.find((x) => x.id === snippetId);
    if (!s) return;
    setDraftTitle(s.title);
    setDraftCommand(s.command);
    setDraftDesc(s.description);
    setDraftGroupId(s.groupId ?? "");
    setModal({ type: "edit_snippet", snippetId });
  };

  const openCreateGroup = () => {
    setDraftGroupName("");
    setModal({ type: "create_group" });
  };

  const openRenameGroup = (groupId: string) => {
    const g = state.groups.find((x) => x.id === groupId);
    setDraftGroupName(g?.name ?? "");
    setModal({ type: "rename_group", groupId });
  };

  const closeModal = () => setModal(null);

  const saveSnippetModal = () => {
    const title = draftTitle.trim();
    const command = draftCommand.trim();
    if (!title || !command) { toast("Name and command are required"); return; }
    const groupId = draftGroupId || null;

    if (modal?.type === "create_snippet") {
      setState((prev) => ({
        ...prev,
        snippets: [...prev.snippets, { id: crypto.randomUUID(), title, command, description: draftDesc.trim(), groupId }],
      }));
    } else if (modal?.type === "edit_snippet") {
      setState((prev) => ({
        ...prev,
        snippets: prev.snippets.map((s) =>
          s.id === modal.snippetId ? { ...s, title, command, description: draftDesc.trim(), groupId } : s
        ),
      }));
    }
    closeModal();
  };

  const saveGroupModal = () => {
    const name = draftGroupName.trim();
    if (!name) return;
    if (modal?.type === "create_group") {
      setState((prev) => ({
        ...prev,
        groups: [...prev.groups, { id: crypto.randomUUID(), name, order: prev.groups.length }],
      }));
    } else if (modal?.type === "rename_group") {
      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => g.id === modal.groupId ? { ...g, name } : g),
      }));
    }
    closeModal();
  };

  const deleteSnippet = (snippetId: string) => {
    if (!window.confirm("Delete this snippet?")) return;
    setState((prev) => ({ ...prev, snippets: prev.snippets.filter((s) => s.id !== snippetId) }));
  };

  const deleteGroup = (groupId: string) => {
    if (!window.confirm("Delete group? Snippets will become ungrouped.")) return;
    setState((prev) => ({
      groups: prev.groups.filter((g) => g.id !== groupId),
      snippets: prev.snippets.map((s) => s.groupId === groupId ? { ...s, groupId: null } : s),
    }));
  };

  const runSnippet = async (snippet: CommandSnippet) => {
    if (!activeSessionId) { toast("No active terminal session"); return; }
    try {
      await invoke("send_terminal_input", { sessionId: activeSessionId, data: `${snippet.command}\r` });
      toast(`Executed: ${snippet.title}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const onDragStart = (snippetId: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", snippetId);
    setDraggingId(snippetId);
  };

  const onDragEnd = () => {
    setDraggingId(undefined);
    setDragOverId(undefined);
    setDragOverGroupId(undefined);
    dragCounter.current = 0;
  };

  const onDropOnSnippet = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setState((prev) => {
      const snippets = [...prev.snippets];
      const fromIdx = snippets.findIndex((s) => s.id === draggingId);
      const toIdx = snippets.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [item] = snippets.splice(fromIdx, 1);
      // Move to target's group
      const targetSnippet = prev.snippets.find((s) => s.id === targetId);
      snippets.splice(toIdx, 0, { ...item, groupId: targetSnippet?.groupId ?? null });
      return { ...prev, snippets };
    });
    setDragOverId(undefined);
  };

  const onDropOnGroup = (groupId: string | null) => {
    if (!draggingId) return;
    setState((prev) => ({
      ...prev,
      snippets: prev.snippets.map((s) => s.id === draggingId ? { ...s, groupId } : s),
    }));
    setDragOverGroupId(undefined);
  };

  const isSnippetModal = modal?.type === "create_snippet" || modal?.type === "edit_snippet";
  const isGroupModal = modal?.type === "create_group" || modal?.type === "rename_group";

  return (
    <div className="snippets-pane">
      <div className="snippets-header">
        <h3>Snippets</h3>
        <div className="snippets-actions">
          <button className="ghost icon-btn" onClick={openCreateGroup} title="New group">
            <FolderPlus size={14} strokeWidth={2} />
          </button>
          <button className="ghost icon-btn" onClick={() => openCreateSnippet(null)} title="New snippet">
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="snippets-list">
        {/* Grouped sections */}
        {groupedSnippets.map(({ group, snippets }) => (
          <div
            key={group.id}
            className={`snippet-group${dragOverGroupId === group.id ? " drag-over" : ""}`}
            onDragOver={(e) => { if (!draggingId) return; e.preventDefault(); setDragOverGroupId(group.id); }}
            onDrop={(e) => { e.preventDefault(); onDropOnGroup(group.id); }}
            onDragLeave={() => { if (dragOverGroupId === group.id) setDragOverGroupId(undefined); }}
          >
            <div className="snippet-group-head" onClick={() => toggleGroup(group.id)}>
              <div className="snippet-group-chevron">
                {expandedGroups.has(group.id)
                  ? <ChevronDown size={12} strokeWidth={2} />
                  : <ChevronRight size={12} strokeWidth={2} />}
              </div>
              <div className="snippet-group-title">{group.name}</div>
              <div className="snippet-group-count">{snippets.length}</div>
              <div className="snippet-group-actions" onClick={(e) => e.stopPropagation()}>
                <button className="ghost icon-btn" onClick={() => openCreateSnippet(group.id)} title="Add snippet">
                  <Plus size={12} strokeWidth={2} />
                </button>
                <button className="ghost icon-btn" onClick={() => openRenameGroup(group.id)} title="Rename">
                  <Pencil size={12} strokeWidth={2} />
                </button>
                <button className="ghost icon-btn danger" onClick={() => deleteGroup(group.id)} title="Delete">
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </div>

            {expandedGroups.has(group.id) && (
              <div className="snippet-group-body">
                {snippets.length === 0 ? (
                  <div className="snippet-empty">No snippets — add one or drag here</div>
                ) : (
                  snippets.map((snippet) => (
                    <SnippetCard
                      key={snippet.id}
                      snippet={snippet}
                      isDragOver={dragOverId === snippet.id}
                      onRun={() => void runSnippet(snippet)}
                      onEdit={() => openEditSnippet(snippet.id)}
                      onDelete={() => deleteSnippet(snippet.id)}
                      onDragStart={(e) => onDragStart(snippet.id, e)}
                      onDragEnd={onDragEnd}
                      onDragOver={(e) => { e.preventDefault(); setDragOverId(snippet.id); }}
                      onDrop={() => onDropOnSnippet(snippet.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        ))}

        {/* Ungrouped section */}
        <div
          className={`snippet-ungrouped${dragOverGroupId === "ungrouped" ? " drag-over" : ""}`}
          onDragOver={(e) => { if (!draggingId) return; e.preventDefault(); setDragOverGroupId("ungrouped"); }}
          onDrop={(e) => { e.preventDefault(); onDropOnGroup(null); }}
          onDragLeave={() => { if (dragOverGroupId === "ungrouped") setDragOverGroupId(undefined); }}
        >
          {ungrouped.map((snippet) => (
            <SnippetCard
              key={snippet.id}
              snippet={snippet}
              isDragOver={dragOverId === snippet.id}
              onRun={() => void runSnippet(snippet)}
              onEdit={() => openEditSnippet(snippet.id)}
              onDelete={() => deleteSnippet(snippet.id)}
              onDragStart={(e) => onDragStart(snippet.id, e)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(snippet.id); }}
              onDrop={() => onDropOnSnippet(snippet.id)}
            />
          ))}
        </div>

        {state.snippets.length === 0 && state.groups.length === 0 ? (
          <div className="snippet-empty-global">
            Save commands here and run them in one click.
          </div>
        ) : null}
      </div>

      {/* ── Snippet Create/Edit Modal ── */}
      {isSnippetModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal?.type === "create_snippet" ? "New Snippet" : "Edit Snippet"}</h3>
              <button className="ghost" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Name
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} autoFocus placeholder="My command" />
              </label>
              <label>
                Command
                <textarea
                  value={draftCommand}
                  onChange={(e) => setDraftCommand(e.target.value)}
                  placeholder="echo hello world"
                  rows={3}
                  style={{ height: "auto", resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                />
              </label>
              <label>
                Description (optional)
                <input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="What does this do?" />
              </label>
              <label>
                Group
                <select value={draftGroupId} onChange={(e) => setDraftGroupId(e.target.value)}>
                  <option value="">Ungrouped</option>
                  {orderedGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={saveSnippetModal}>
                {modal?.type === "create_snippet" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Group Create/Rename Modal ── */}
      {isGroupModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel modal-panel-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal?.type === "create_group" ? "New Group" : "Rename Group"}</h3>
              <button className="ghost" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Name
                <input
                  value={draftGroupName}
                  onChange={(e) => setDraftGroupName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveGroupModal(); }}
                  placeholder="Group name"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={saveGroupModal}>
                {modal?.type === "create_group" ? "Create" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SnippetCard Component ────────────────────────────────────────────────────

interface SnippetCardProps {
  snippet: CommandSnippet;
  isDragOver: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

function SnippetCard({ snippet, isDragOver, onRun, onEdit, onDelete, onDragStart, onDragEnd, onDragOver, onDrop }: SnippetCardProps) {
  return (
    <article
      className={`snippet-card${isDragOver ? " drag-over" : ""}`}
      draggable
      onDragStart={(e) => { onDragStart(e); }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <div className="snippet-drag-handle" title="Drag to reorder">
        <GripVertical size={12} strokeWidth={2} />
      </div>
      <div className="snippet-main">
        <div className="snippet-title">{snippet.title}</div>
        {snippet.description ? <div className="snippet-description">{snippet.description}</div> : null}
        <code className="snippet-command">{snippet.command}</code>
      </div>
      <div className="snippet-card-actions">
        <button className="primary" onClick={onRun} title="Run now">
          <Play size={12} strokeWidth={2} />
        </button>
        <button className="ghost icon-btn" onClick={onEdit} title="Edit">
          <Pencil size={12} strokeWidth={2} />
        </button>
        <button className="ghost icon-btn danger" onClick={onDelete} title="Delete">
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}
