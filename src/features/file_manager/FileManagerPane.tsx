import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
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

  const onDelete = async (entry: FileEntryDto) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    await invoke("delete_fs_entry", { path: entry.path, isDir: entry.is_dir });
    await loadCurrentFiles();
  };

  const onRename = async (entry: FileEntryDto) => {
    const nextName = window.prompt("Rename", entry.name)?.trim();
    if (!nextName || nextName === entry.name) return;
    const nextPath = entry.path.replace(/[^/\\]+$/, nextName);
    await invoke("rename_fs_entry", { from: entry.path, to: nextPath });
    await loadCurrentFiles();
  };

  const onCreateEntry = async (isDir: boolean) => {
    const name = window.prompt(isDir ? "Folder name" : "File name")?.trim();
    if (!name) return;
    const path = activePath.endsWith("/") ? `${activePath}${name}` : `${activePath}/${name}`;
    await invoke("create_fs_entry", { path, isDir });
    await loadCurrentFiles();
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
        <button onClick={() => void goParentPath()} title="Back">&#x2190;</button>
        <button onClick={() => void loadCurrentFiles()} title="Refresh">&#x21BB;</button>
        <button onClick={() => void onCreateEntry(false)} title="New file">+</button>
        <button onClick={() => void onCreateEntry(true)} title="New folder">&#x1F4C1;</button>
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
              {entry.is_dir ? "\uD83D\uDCC2" : "\uD83D\uDCC4"}
            </span>
            <span className="file-name">{entry.name}</span>
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
            <button onClick={() => { onPreviewFile(contextMenu.file); setContextMenu(undefined); }}>Preview</button>
            <button onClick={() => { void onOpenFile(contextMenu.file); setContextMenu(undefined); }}>Open</button>
            <button onClick={() => { void onCopy(contextMenu.file.path, "path"); setContextMenu(undefined); }}>Copy Path</button>
            <button onClick={() => { void onCopy(contextMenu.file.name, "name"); setContextMenu(undefined); }}>Copy Name</button>
            <button onClick={() => { void onRename(contextMenu.file); setContextMenu(undefined); }}>Rename</button>
            <button className="danger" onClick={() => { void onDelete(contextMenu.file); setContextMenu(undefined); }}>Delete</button>
            <button onClick={() => { void onCdHere(contextMenu.file); setContextMenu(undefined); }}>CD Here</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
