import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
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
  Terminal
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { FileEntryDto } from "@/types/models";

interface FileManagerPaneProps {
  activeSessionId?: string;
  isRemote: boolean;
  sshAlias?: string;
}

interface FileContextMenu {
  file: FileEntryDto;
  x: number;
  y: number;
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
    tabPaths: state.tabPaths,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    toast: state.toast,
    openFile: state.openFile
  }));

  const [contextMenu, setContextMenu] = useState<FileContextMenu>();

  const activeTab = useMemo(() => tabs.find((item) => item.id === activeTabId), [activeTabId, tabs]);

  const activePath = useMemo(() => {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (!tab) return props.isRemote ? "/" : "C:/";
    return tabPaths[tab.id] ?? (props.isRemote ? "/" : "C:/");
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

  const clampContextPos = (x: number, y: number) => {
    const menuWidth = 188;
    const menuHeight = 260;
    const pad = 8;
    return {
      x: Math.max(pad, Math.min(x, window.innerWidth - menuWidth - pad)),
      y: Math.max(pad, Math.min(y, window.innerHeight - menuHeight - pad))
    };
  };

  const sourceLabel = displayTab?.kind === "ssh"
    ? `SSH: ${displayTab.sshAlias ?? "unknown host"}`
    : "Local";

  const uiBusy = fileLoading || fileTransitioning;

  const onDelete = async (entry: FileEntryDto) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    await invoke("delete_fs_entry", { path: entry.path, isDir: entry.is_dir });
    await loadCurrentFiles({ force: true });
  };

  const onRename = async (entry: FileEntryDto) => {
    const nextName = window.prompt("Rename", entry.name)?.trim();
    if (!nextName || nextName === entry.name) return;
    const nextPath = entry.path.replace(/[^/\\]+$/, nextName);
    await invoke("rename_fs_entry", { from: entry.path, to: nextPath });
    await loadCurrentFiles({ force: true });
  };

  const onCreateEntry = async (isDir: boolean) => {
    const name = window.prompt(isDir ? "Folder name" : "File name")?.trim();
    if (!name) return;
    const path = activePath.endsWith("/") ? `${activePath}${name}` : `${activePath}/${name}`;
    await invoke("create_fs_entry", { path, isDir });
    await loadCurrentFiles({ force: true });
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

  return (
    <div className="file-manager" onClick={() => setContextMenu(undefined)}>
      <div className="file-toolbar">
        <button onClick={() => void goParentPath()} title="Back">
          <ArrowLeft size={14} strokeWidth={2} />
        </button>
        <button
          onClick={() => void loadCurrentFiles({ force: true })}
          title="Refresh"
          className={uiBusy ? "spinning" : ""}
        >
          <RefreshCw size={14} strokeWidth={2} />
        </button>
        <button onClick={() => void onCreateEntry(false)} title="New file">
          <FilePlus size={14} strokeWidth={2} />
        </button>
        <button onClick={() => void onCreateEntry(true)} title="New folder">
          <FolderPlus size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="breadcrumbs">
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

      <div className="file-scope-bar">
        <span className="file-scope-source">{sourceLabel}</span>
        <span className="file-scope-path" title={displayPath}>{displayPath}</span>
      </div>

      {fileError ? <div className="file-status error">{fileError}</div> : null}

      <div className="file-list">
        {fileEntries.map((entry) => (
          <button
            key={entry.path}
            className={`file-item ${selectedFile?.path === entry.path ? "selected" : ""}`}
            onClick={() => setSelectedFile(entry)}
            onDoubleClick={() => void onOpenFile(entry)}
            disabled={fileTransitioning}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const pos = clampContextPos(event.clientX, event.clientY);
              setContextMenu({ file: entry, x: pos.x, y: pos.y });
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

      {contextMenu ? (
        <div className="context-anchor" onClick={() => setContextMenu(undefined)}>
          <div
            className="file-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
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
            <button onClick={() => { void onRename(contextMenu.file); setContextMenu(undefined); }}>
              <Pencil size={13} strokeWidth={2} /> Rename
            </button>
            <button className="danger" onClick={() => { void onDelete(contextMenu.file); setContextMenu(undefined); }}>
              <Trash2 size={13} strokeWidth={2} /> Delete
            </button>
            <button onClick={() => { void onCdHere(contextMenu.file); setContextMenu(undefined); }}>
              <Terminal size={13} strokeWidth={2} /> CD Here
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
