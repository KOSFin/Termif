import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowClockwiseIcon,
  FilePlusIcon,
  FolderPlusIcon,
  FolderIcon,
  FileIcon,
  EyeIcon,
  FolderOpenIcon,
  CopySimpleIcon,
  TextAaIcon,
  PencilIcon,
  TrashIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
import { openEditorWindow } from "./editorWindow";
import { useAppStore } from "@/store/useAppStore";
import type { FileEntryDto } from "@/types/models";

interface FileManagerPaneProps {
  activeSessionId?: string;
  isRemote: boolean;
}

interface FileContextMenu {
  file: FileEntryDto;
  x: number;
  y: number;
}

interface DeleteConfirm {
  file: FileEntryDto;
  x: number;
  y: number;
}

export function FileManagerPane(props: FileManagerPaneProps) {
  const {
    fileEntries,
    fileLoading,
    fileError,
    selectedFile,
    setSelectedFile,
    loadCurrentFiles,
    navigatePath,
    goParentPath,
    tabPaths,
    tabs,
    activeTabId,
    toast
  } = useAppStore((state) => ({
    fileEntries: state.fileEntries,
    fileLoading: state.fileLoading,
    fileError: state.fileError,
    selectedFile: state.selectedFile,
    setSelectedFile: state.setSelectedFile,
    loadCurrentFiles: state.loadCurrentFiles,
    navigatePath: state.navigatePath,
    goParentPath: state.goParentPath,
    tabPaths: state.tabPaths,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    toast: state.toast
  }));

  const [contextMenu, setContextMenu] = useState<FileContextMenu>();
  const [renamingPath, setRenamingPath] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const [pendingCreate, setPendingCreate] = useState<{ isDir: boolean } | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const activePath = useMemo(() => {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (!tab) return props.isRemote ? "/" : "C:/";
    return tabPaths[tab.id] ?? (props.isRemote ? "/" : "C:/");
  }, [activeTabId, props.isRemote, tabPaths, tabs]);

  const breadcrumbs = useMemo(() => {
    const normalized = activePath.replace(/\\/g, "/");
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
  }, [activePath]);

  const onOpenFile = async (entry: FileEntryDto) => {
    if (entry.is_dir) {
      await navigatePath(entry.path);
      return;
    }
    openEditorWindow(entry.path, "edit");
  };

  const onPreviewFile = (entry: FileEntryDto) => {
    if (!entry.is_dir) openEditorWindow(entry.path, "preview");
  };

  const onStartRename = useCallback((entry: FileEntryDto) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
    setContextMenu(undefined);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const onConfirmRename = async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(undefined);
      return;
    }
    const nextPath = renamingPath.replace(/[^/\\]+$/, renameValue.trim());
    if (nextPath !== renamingPath) {
      await invoke("rename_fs_entry", { from: renamingPath, to: nextPath });
      await loadCurrentFiles();
    }
    setRenamingPath(undefined);
  };

  const onStartCreate = (isDir: boolean) => {
    setPendingCreate({ isDir });
    setCreateValue("");
    setTimeout(() => createInputRef.current?.focus(), 0);
  };

  const onConfirmCreate = async () => {
    if (!pendingCreate || !createValue.trim()) {
      setPendingCreate(null);
      return;
    }
    const path = activePath.endsWith("/") ? `${activePath}${createValue.trim()}` : `${activePath}/${createValue.trim()}`;
    await invoke("create_fs_entry", { path, isDir: pendingCreate.isDir });
    await loadCurrentFiles();
    setPendingCreate(null);
  };

  const onRequestDelete = (entry: FileEntryDto, x: number, y: number) => {
    setContextMenu(undefined);
    setDeleteConfirm({ file: entry, x, y });
  };

  const onConfirmDelete = async () => {
    if (!deleteConfirm) return;
    await invoke("delete_fs_entry", { path: deleteConfirm.file.path, isDir: deleteConfirm.file.is_dir });
    await loadCurrentFiles();
    setDeleteConfirm(undefined);
  };

  const onCdHere = async (entry: FileEntryDto) => {
    if (!props.activeSessionId) return;
    const target = entry.is_dir ? entry.path : entry.path.replace(/[/\\][^/\\]+$/, "");
    const escaped = target.replace(/"/g, '"');
    await invoke("send_terminal_input", {
      sessionId: props.activeSessionId,
      data: `cd "${escaped}"\n`
    });
    toast(`cd ${target}`);
  };

  const onCopy = async (value: string, mode: "path" | "name") => {
    await navigator.clipboard.writeText(value);
    toast(mode === "path" ? "Path copied" : "Name copied");
  };

  const dismissAll = () => {
    setContextMenu(undefined);
    setDeleteConfirm(undefined);
  };

  return (
    <div className="file-manager" onClick={dismissAll}>
      <div className="file-toolbar">
        <button onClick={() => void goParentPath()} title="Back">
          <ArrowLeftIcon size={15} weight="bold" />
        </button>
        <button onClick={() => void loadCurrentFiles()} title="Refresh">
          <ArrowClockwiseIcon size={15} weight="bold" />
        </button>
        <div className="file-toolbar-spacer" />
        <button onClick={() => onStartCreate(false)} title="New file">
          <FilePlusIcon size={15} weight="bold" />
        </button>
        <button onClick={() => onStartCreate(true)} title="New folder">
          <FolderPlusIcon size={15} weight="bold" />
        </button>
      </div>

      <div className="breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <button key={`${crumb.path}-${index}`} onClick={() => void navigatePath(crumb.path)}>
            {index > 0 ? "/ " : ""}{crumb.label}
          </button>
        ))}
      </div>

      {fileLoading ? <div className="file-status">Loading...</div> : null}
      {fileError ? <div className="file-status error">{fileError}</div> : null}

      <div className="file-list">
        {pendingCreate ? (
          <div className="file-item creating">
            <span className="file-icon dir">
              {pendingCreate.isDir ? <FolderIcon size={15} weight="fill" /> : <FileIcon size={15} />}
            </span>
            <input
              ref={createInputRef}
              className="inline-input"
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onConfirmCreate();
                if (e.key === "Escape") setPendingCreate(null);
              }}
              onBlur={() => void onConfirmCreate()}
              placeholder={pendingCreate.isDir ? "Folder name..." : "File name..."}
            />
          </div>
        ) : null}

        {fileEntries.map((entry) => (
          <button
            key={entry.path}
            className={`file-item ${selectedFile?.path === entry.path ? "selected" : ""}`}
            onClick={() => setSelectedFile(entry)}
            onDoubleClick={() => void onOpenFile(entry)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ file: entry, x: event.clientX, y: event.clientY });
            }}
          >
            <span className={`file-icon ${entry.is_dir ? "dir" : "file"}`}>
              {entry.is_dir ? <FolderIcon size={15} weight="fill" /> : <FileIcon size={15} />}
            </span>
            {renamingPath === entry.path ? (
              <input
                ref={renameInputRef}
                className="inline-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onConfirmRename();
                  if (e.key === "Escape") setRenamingPath(undefined);
                }}
                onBlur={() => void onConfirmRename()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="file-name">{entry.name}</span>
            )}
          </button>
        ))}
      </div>

      {contextMenu ? (
        <div className="context-anchor" onClick={() => setContextMenu(undefined)}>
          <div
            className="file-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {!contextMenu.file.is_dir && (
              <button onClick={() => { onPreviewFile(contextMenu.file); setContextMenu(undefined); }}>
                <EyeIcon size={14} /> Preview
              </button>
            )}
            <button onClick={() => { void onOpenFile(contextMenu.file); setContextMenu(undefined); }}>
              <FolderOpenIcon size={14} /> Open
            </button>
            <div className="context-divider" />
            <button onClick={() => { void onCopy(contextMenu.file.path, "path"); setContextMenu(undefined); }}>
              <CopySimpleIcon size={14} /> Copy Path
            </button>
            <button onClick={() => { void onCopy(contextMenu.file.name, "name"); setContextMenu(undefined); }}>
              <TextAaIcon size={14} /> Copy Name
            </button>
            <div className="context-divider" />
            <button onClick={() => { onStartRename(contextMenu.file); }}>
              <PencilIcon size={14} /> Rename
            </button>
            <button className="danger" onClick={() => { onRequestDelete(contextMenu.file, contextMenu.x, contextMenu.y); }}>
              <TrashIcon size={14} /> Delete
            </button>
            <div className="context-divider" />
            <button onClick={() => { void onCdHere(contextMenu.file); setContextMenu(undefined); }}>
              <TerminalIcon size={14} /> CD Here
            </button>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div className="context-anchor" onClick={() => setDeleteConfirm(undefined)}>
          <div
            className="delete-confirm-popover"
            style={{ left: deleteConfirm.x, top: deleteConfirm.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-confirm-text">
              Delete <strong>{deleteConfirm.file.name}</strong>?
            </div>
            <div className="delete-confirm-actions">
              <button className="ghost" onClick={() => setDeleteConfirm(undefined)}>Cancel</button>
              <button className="danger" onClick={() => void onConfirmDelete()}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
