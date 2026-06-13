import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Folder,
  File,
  Eye,
  FolderOpen as FolderOpenIcon,
  Copy,
  Type,
  Pencil,
  Trash2,
  Terminal,
  ExternalLink,
  X as XIcon
} from "lucide-react";
import { ContextMenu, type MenuPoint } from "@/components/ContextMenu";
import { useAppStore } from "@/store/useAppStore";
import { getDefaultLocalPath } from "@/platform/platform";
import type { FileEntryDto } from "@/types/models";

interface FileManagerPaneProps {
  activeSessionId?: string;
  isRemote: boolean;
  sshAlias?: string;
}

interface FileContextMenu {
  file: FileEntryDto;
  anchor: MenuPoint;
}

export function FileManagerPane(props: FileManagerPaneProps) {
  const {
    fileEntries,
    fileLoading,
    fileTransitioning,
    fileDisplayTabId,
    fileDisplayPath,
    fileError,
    selectedFile,
    setSelectedFile,
    loadCurrentFiles,
    navigatePath,
    goParentPath,
    goBackPath,
    goForwardPath,
    canGoBackPath,
    canGoForwardPath,
    tabPaths,
    tabs,
    activeTabId,
    toast,
    openFile
  } = useAppStore((state) => ({
    fileEntries: state.fileEntries,
    fileLoading: state.fileLoading,
    fileTransitioning: state.fileTransitioning,
    fileDisplayTabId: state.fileDisplayTabId,
    fileDisplayPath: state.fileDisplayPath,
    fileError: state.fileError,
    selectedFile: state.selectedFile,
    setSelectedFile: state.setSelectedFile,
    loadCurrentFiles: state.loadCurrentFiles,
    navigatePath: state.navigatePath,
    goParentPath: state.goParentPath,
    goBackPath: state.goBackPath,
    goForwardPath: state.goForwardPath,
    canGoBackPath: state.canGoBackPath,
    canGoForwardPath: state.canGoForwardPath,
    tabPaths: state.tabPaths,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    toast: state.toast,
    openFile: state.openFile
  }));

  const [contextMenu, setContextMenu] = useState<FileContextMenu>();
  const [pathMenuAnchor, setPathMenuAnchor] = useState<MenuPoint | null>(null);
  const [inlineInput, setInlineInput] = useState<{ type: "file" | "folder" | "rename"; entry?: FileEntryDto } | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const inlineRef = useRef<React.ElementRef<"input">>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");

  const activeTab = useMemo(() => tabs.find((item) => item.id === activeTabId), [activeTabId, tabs]);
  const canGoBack = canGoBackPath();
  const canGoForward = canGoForwardPath();

  const activePath = useMemo(() => {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (!tab) return props.isRemote ? "/" : getDefaultLocalPath();
    return tabPaths[tab.id] ?? (props.isRemote ? "/" : getDefaultLocalPath());
  }, [activeTabId, props.isRemote, tabPaths, tabs]);

  const displayTab = useMemo(
    () => tabs.find((item) => item.id === fileDisplayTabId) ?? activeTab,
    [activeTab, fileDisplayTabId, tabs]
  );

  const displayPath = fileDisplayPath ?? activePath;

  const breadcrumbs = useMemo(() => {
    const normalized = displayPath.replace(/\\/g, "/");
    if (normalized.includes(":/")) {
      const [drive] = normalized.split("/");
      const rest = normalized.replace(`${drive}/`, "").split("/").filter(Boolean);
      const items: Array<{ label: string; path: string }> = [{ label: drive, path: `${drive}/` }];
      let current = `${drive}/`;
      for (const part of rest) {
        current = `${current}${part}/`;
        items.push({ label: part, path: current.replace(/\/$/, "") });
      }
      return items;
    }
    const chunks = normalized.split("/").filter(Boolean);
    let current = "";
    return [
      { label: "/", path: "/" },
      ...chunks.map((part) => {
        current += `/${part}`;
        return { label: part, path: current };
      })
    ];
  }, [displayPath]);

  const onOpenFile = async (entry: FileEntryDto) => {
    if (entry.is_dir) {
      await navigatePath(entry.path);
      return;
    }
    void openFile(entry.path, "edit", props.isRemote ? props.activeSessionId : undefined);
  };

  const onPreviewFile = (entry: FileEntryDto) => {
    if (!entry.is_dir)
      void openFile(entry.path, "preview", props.isRemote ? props.activeSessionId : undefined);
  };

  const sourceLabel = displayTab?.kind === "ssh" ? "SSH" : "Local";
  const sourceTitle = displayTab?.kind === "ssh" && displayTab.sshAlias
    ? `SSH: ${displayTab.sshAlias}`
    : sourceLabel;

  const uiBusy = fileLoading || fileTransitioning;

  const onDelete = async (entry: FileEntryDto) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    if (props.isRemote && props.activeSessionId) {
      await invoke("delete_remote_fs_entry", { sessionId: props.activeSessionId, path: entry.path, isDir: entry.is_dir });
    } else {
      await invoke("delete_fs_entry", { path: entry.path, isDir: entry.is_dir });
    }
    await loadCurrentFiles({ force: true });
  };

  const openInlineInput = (type: "file" | "folder" | "rename", entry?: FileEntryDto) => {
    setContextMenu(undefined);
    setPathMenuAnchor(null);
    setInlineValue(type === "rename" && entry ? entry.name : "");
    setInlineInput({ type, entry });
    setTimeout(() => inlineRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!editingPath) {
      setPathDraft(displayPath);
    }
  }, [displayPath, editingPath]);

  const commitInlineInput = async () => {
    if (!inlineInput) return;
    const name = inlineValue.trim();
    if (!name) { setInlineInput(null); return; }

    if (inlineInput.type === "rename" && inlineInput.entry) {
      const entry = inlineInput.entry;
      const nextPath = entry.path.replace(/[^/\\]+$/, name);
      setInlineInput(null);
      if (props.isRemote && props.activeSessionId) {
        await invoke("rename_remote_fs_entry", { sessionId: props.activeSessionId, from: entry.path, to: nextPath });
      } else {
        await invoke("rename_fs_entry", { from: entry.path, to: nextPath });
      }
    } else {
      const isDir = inlineInput.type === "folder";
      const path = displayPath.endsWith("/") ? `${displayPath}${name}` : `${displayPath}/${name}`;
      setInlineInput(null);
      if (props.isRemote && props.activeSessionId) {
        await invoke("create_remote_fs_entry", { sessionId: props.activeSessionId, path, isDir });
      } else {
        await invoke("create_fs_entry", { path, isDir });
      }
    }
    await loadCurrentFiles({ force: true });
  };

  const onRename = (entry: FileEntryDto) => openInlineInput("rename", entry);

  const onCreateEntry = (isDir: boolean) => openInlineInput(isDir ? "folder" : "file");

  const onCdHere = async (entry: FileEntryDto) => {
    if (!props.activeSessionId) return;
    const target = entry.is_dir ? entry.path : entry.path.replace(/[/\\][^/\\]+$/, "");
    const escapedLocal = target.replace(/"/g, "\"\"");
    const escapedRemote = `'${target.replace(/'/g, "'\\''")}'`;
    const command = props.isRemote
      ? `cd -- ${escapedRemote}\r`
      : `cd "${escapedLocal}"\r`;
    await invoke("send_terminal_input", {
      sessionId: props.activeSessionId,
      data: command
    });
    toast(`cd ${target}`);
  };

  const onCopy = async (value: string, mode: "path" | "name") => {
    await navigator.clipboard.writeText(value);
    toast(mode === "path" ? "Path copied" : "Name copied");
  };

  const onRevealPath = async () => {
    if (props.isRemote) {
      toast("Reveal is available for local paths");
      return;
    }
    await invoke("reveal_path", { path: displayPath });
  };

  const commitPathEdit = async () => {
    const next = pathDraft.trim();
    setEditingPath(false);
    if (!next || next === displayPath) return;
    await navigatePath(next);
  };

  return (
    <div className="file-manager" onClick={() => setContextMenu(undefined)}>
      <div className="file-toolbar">
        <div className="file-toolbar-main">
          <div className="file-toolbar-actions">
            <button onClick={() => void goBackPath()} title="Back" disabled={!canGoBack}>
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
            <button onClick={() => void goForwardPath()} title="Forward" disabled={!canGoForward}>
              <ArrowRight size={14} strokeWidth={2} />
            </button>
            <button
              onClick={() => void loadCurrentFiles({ force: true })}
              title="Refresh"
            >
              <RefreshCw size={14} strokeWidth={2} className={uiBusy ? "spin-icon" : ""} />
            </button>
            <button onClick={() => void goParentPath()} title="Up">
              <FolderOpenIcon size={14} strokeWidth={2} />
            </button>
            <span className="file-scope-source" title={sourceTitle}>{sourceLabel}</span>
          </div>
          <div className="file-toolbar-path-actions">
            <button onClick={() => void onCreateEntry(false)} title="New file">
              <FilePlus size={14} strokeWidth={2} />
            </button>
            <button onClick={() => void onCreateEntry(true)} title="New folder">
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
        {editingPath ? (
          <div className="file-inline-input file-path-inline-input">
            <span className="file-inline-label">Path:</span>
            <input
              ref={inlineRef}
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitPathEdit();
                }
                if (event.key === "Escape") {
                  setEditingPath(false);
                  setPathDraft(displayPath);
                }
              }}
              onBlur={() => void commitPathEdit()}
            />
            <button className="file-inline-cancel" onClick={() => { setEditingPath(false); setPathDraft(displayPath); }} title="Cancel"><XIcon size={12} /></button>
          </div>
        ) : (
          <div
            className="breadcrumbs"
            aria-label="Current path"
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPathMenuAnchor({ x: event.clientX, y: event.clientY });
            }}
          >
            {breadcrumbs.map((crumb, index) => (
              <button
                key={`${crumb.path}-${index}`}
                onClick={() => void navigatePath(crumb.path)}
                disabled={fileTransitioning}
              >
                {index > 0 ? "/ " : ""}{crumb.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {fileError ? <div className="file-status error">{fileError}</div> : null}

      {inlineInput && (
        <div className="file-inline-input">
          <span className="file-inline-label">
            {inlineInput.type === "rename" ? "Rename:" : inlineInput.type === "folder" ? "Folder:" : "File:"}
          </span>
          <input
            ref={inlineRef}
            value={inlineValue}
            onChange={(e) => setInlineValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitInlineInput(); }
              if (e.key === "Escape") setInlineInput(null);
            }}
            onBlur={() => void commitInlineInput()}
          />
          <button className="file-inline-cancel" onClick={() => setInlineInput(null)} title="Cancel"><XIcon size={12} /></button>
        </div>
      )}

      <div className={`file-list${uiBusy ? " busy" : ""}`}>
        {fileEntries.map((entry) => (
          <button
            key={entry.path}
            className={`file-item ${selectedFile?.path === entry.path ? "selected" : ""}`}
            onClick={() => setSelectedFile(entry)}
            onDoubleClick={() => void onOpenFile(entry)}
            disabled={uiBusy}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({
                file: entry,
                anchor: { x: event.clientX, y: event.clientY },
              });
            }}
          >
            <span className={`file-icon ${entry.is_dir ? "dir" : "file"}`}>
              {entry.is_dir ? <Folder size={15} strokeWidth={1.8} /> : <File size={15} strokeWidth={1.8} />}
            </span>
            <span className="file-name">{entry.name}</span>
          </button>
        ))}
        {!uiBusy && fileEntries.length === 0 && !fileError && (
          <div className="file-status">Empty directory</div>
        )}

        {uiBusy ? (
          <div className="file-loading-overlay">
            <div className="file-loading-spinner" />
            <span>{fileTransitioning ? "Switching tab files..." : `Loading files for ${sourceLabel}`}</span>
          </div>
        ) : null}
      </div>

      <ContextMenu
        open={!!contextMenu}
        anchor={contextMenu?.anchor ?? null}
        onClose={() => setContextMenu(undefined)}
        className="file-context-menu"
        allowViewportOverflowOnMac
      >
        {contextMenu ? (
          <>
            <button onClick={() => { onPreviewFile(contextMenu.file); setContextMenu(undefined); }}>
              <Eye size={13} strokeWidth={2} /> Preview
            </button>
            <button onClick={() => { void onOpenFile(contextMenu.file); setContextMenu(undefined); }}>
              <FolderOpenIcon size={13} strokeWidth={2} /> Open
            </button>
            <button onClick={() => { void onCopy(contextMenu.file.path, "path"); setContextMenu(undefined); }}>
              <Copy size={13} strokeWidth={2} /> Copy Path
            </button>
            <button onClick={() => { void onCopy(contextMenu.file.name, "name"); setContextMenu(undefined); }}>
              <Type size={13} strokeWidth={2} /> Copy Name
            </button>
            <button onClick={() => { void onRename(contextMenu.file); }}>
              <Pencil size={13} strokeWidth={2} /> Rename
            </button>
            <button className="danger" onClick={() => { void onDelete(contextMenu.file); setContextMenu(undefined); }}>
              <Trash2 size={13} strokeWidth={2} /> Delete
            </button>
            <button onClick={() => { void onCdHere(contextMenu.file); setContextMenu(undefined); }}>
              <Terminal size={13} strokeWidth={2} /> CD Here
            </button>
          </>
        ) : null}
      </ContextMenu>

      <ContextMenu
        open={!!pathMenuAnchor}
        anchor={pathMenuAnchor}
        onClose={() => setPathMenuAnchor(null)}
        className="file-context-menu"
        minWidth={208}
        allowViewportOverflowOnMac
      >
        <button onClick={() => { void onCopy(displayPath, "path"); setPathMenuAnchor(null); }}>
          <Copy size={13} strokeWidth={2} /> Copy Path
        </button>
        <button
          disabled={props.isRemote}
          onClick={() => {
            void onRevealPath();
            setPathMenuAnchor(null);
          }}
        >
          <ExternalLink size={13} strokeWidth={2} /> Open in Finder/Explorer
        </button>
        <button
          onClick={() => {
            setEditingPath(true);
            setPathDraft(displayPath);
            setPathMenuAnchor(null);
            setTimeout(() => inlineRef.current?.focus(), 0);
          }}
        >
          <Pencil size={13} strokeWidth={2} /> Edit Path
        </button>
      </ContextMenu>
    </div>
  );
}
