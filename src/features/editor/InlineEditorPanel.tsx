import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Save,
  FileCode,
  ChevronDown,
  GripVertical,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  RotateCcw
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu, anchorMenuFromRect, type MenuPoint } from "@/components/ContextMenu";
import { resolveWindowLabel } from "@/store/useAppStore";
import { useAppStore, type EditorDock, type EditorFile } from "@/store/useAppStore";
import { appShortcutTitle } from "@/platform/platform";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { allLanguages } from "./languageMap";
import { openEditorWorkspaceWindow } from "@/features/file_manager/editorWindow";

interface InlineEditorPanelProps {
  dock: EditorDock;
  onStartDockDrag: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function InlineEditorPanel({ dock, onStartDockDrag }: InlineEditorPanelProps) {
  const {
    editorFiles,
    activeEditorFileId,
    tabs,
    activeTabId,
    closeEditorFile,
    setActiveEditorFile,
    updateEditorContent,
    saveEditorFile,
    setEditorLanguage,
    setEditorDock,
    setEditorVisible,
    clearEditorWorkspace,
    setSelectedSidebarTool,
    revealFileInManager,
  } = useAppStore((s) => ({
    editorFiles: s.editorFiles,
    activeEditorFileId: s.activeEditorFileId,
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    closeEditorFile: s.closeEditorFile,
    setActiveEditorFile: s.setActiveEditorFile,
    updateEditorContent: s.updateEditorContent,
    saveEditorFile: s.saveEditorFile,
    setEditorLanguage: s.setEditorLanguage,
    setEditorDock: s.setEditorDock,
    setEditorVisible: s.setEditorVisible,
    clearEditorWorkspace: s.clearEditorWorkspace,
    setSelectedSidebarTool: s.setSelectedSidebarTool,
    revealFileInManager: s.revealFileInManager,
  }));

  const reloadFileFromDisk = useCallback(async (file: EditorFile) => {
    if (file.sessionId) return;
    try {
      const raw = await invoke<string>("read_text_file", { path: file.path });
      const mtime = await invoke<number | null>("get_file_mtime", { path: file.path });
      const content = raw.replace(/\r\n/g, "\n");
      useAppStore.setState((state) => ({
        editorFiles: state.editorFiles.map((f) =>
          f.id === file.id
            ? { ...f, content, originalContent: content, dirty: false, externallyModified: false, diskMtime: mtime ?? undefined }
            : f
        ),
      }));
    } catch {
      // ignore
    }
  }, []);

  const activeFile = useMemo(
    () => editorFiles.find((f) => f.id === activeEditorFileId),
    [editorFiles, activeEditorFileId]
  );

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [langMenuAnchor, setLangMenuAnchor] = useState<MenuPoint | null>(null);
  const [dockMenuAnchor, setDockMenuAnchor] = useState<MenuPoint | null>(null);
  const [tabMenu, setTabMenu] = useState<{ fileId: string; anchor: MenuPoint } | null>(null);

  const onCursorChange = useCallback((line: number, col: number) => {
    setCursorPos({ line, col });
  }, []);

  // Platform save shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        const target = e.target as HTMLElement;
        // Only handle if focus is inside the editor panel
        if (target.closest(".editor-inline-panel")) {
          e.preventDefault();
          if (activeFile && activeFile.dirty && activeFile.mode !== "preview") {
            void saveEditorFile(activeFile.id);
          }
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [activeFile, saveEditorFile]);

  const filename = (f: EditorFile) => f.path.split(/[\\/]/).pop() ?? f.path;
  const resolveServerLabel = useCallback((file: EditorFile) => {
    if (!file.sessionId) {
      return "Local machine";
    }

    const sourceTab = tabs.find((tab) => tab.sessionId === file.sessionId);
    if (sourceTab?.sshAlias) {
      return sourceTab.sshAlias;
    }

    if (sourceTab?.title) {
      return sourceTab.title.replace(/^SSH:\s*/i, "");
    }

    return "Remote server";
  }, [tabs]);

  const popoutEditorWorkspace = () => {
    if (editorFiles.length === 0) return;
    const activeIndex = Math.max(0, editorFiles.findIndex((f) => f.id === activeEditorFileId));
    openEditorWorkspaceWindow(
      editorFiles.map((f) => ({
        path: f.path,
        mode: f.mode,
        sessionId: f.sessionId,
        serverLabel: resolveServerLabel(f),
        ownerWindowLabel: resolveWindowLabel(),
        content: f.content,
        dirty: f.dirty,
        error: f.error,
      })),
      activeIndex
    );
    clearEditorWorkspace();
    setDockMenuAnchor(null);
  };

  if (editorFiles.length === 0) return null;

  return (
    <div className="editor-inline-panel">
      {/* File tabs */}
      <div className="editor-inline-header">
        <div className="editor-inline-tabs">
          {editorFiles.map((f) => (
            <button
              key={f.id}
              className={`editor-inline-tab${f.id === activeEditorFileId ? " active" : ""}`}
              onClick={() => setActiveEditorFile(f.id)}
              title={f.path}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setTabMenu({
                  fileId: f.id,
                  anchor: { x: event.clientX, y: event.clientY },
                });
              }}
            >
              <FileCode size={12} strokeWidth={2} />
              <span className="editor-inline-tab-meta">
                <span className="editor-inline-tab-title">
                  {filename(f)}
                  {f.dirty ? " *" : ""}
                </span>
                <span className="editor-inline-tab-subtitle">{resolveServerLabel(f)}</span>
              </span>
              <span
                className="editor-inline-tab-close"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeEditorFile(f.id);
                }}
              >
                <X size={11} strokeWidth={2.5} />
              </span>
            </button>
          ))}
        </div>
        <div className="editor-inline-actions">
          <button
            className="editor-action-btn"
            onMouseDown={onStartDockDrag}
            title="Drag to re-dock editor"
          >
            <GripVertical size={14} strokeWidth={2} />
          </button>
          <button
            className={`editor-action-btn${dockMenuAnchor ? " active" : ""}`}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setDockMenuAnchor((current) =>
                current
                  ? null
                  : anchorMenuFromRect(rect, { width: 196, height: 180 }, "bottom-end")
              );
            }}
            title={`Dock and window options (current: ${dock})`}
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          <button
            className="editor-action-btn"
            onClick={() => {
              if (activeFile && activeFile.dirty) void saveEditorFile(activeFile.id);
            }}
            disabled={!activeFile || !!activeFile.loading || !activeFile.dirty || activeFile.mode === "preview"}
            title={appShortcutTitle("Save", "Ctrl+S")}
          >
            <Save size={14} strokeWidth={2} />
          </button>
          <button
            className="editor-action-btn"
            onClick={() => setEditorVisible(false)}
            title="Close editor panel"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Editor body */}
      {activeFile ? (
        <>
          {activeFile.error ? (
            <div className="editor-inline-error">{activeFile.error}</div>
          ) : null}
          {activeFile.externallyModified ? (
            <div className="editor-external-modified">
              <span>File changed on disk</span>
              <button onClick={() => void reloadFileFromDisk(activeFile)}>
                <RotateCcw size={12} strokeWidth={2} /> Reload
              </button>
              <button className="dismiss" onClick={() => useAppStore.setState((state) => ({
                editorFiles: state.editorFiles.map((f) =>
                  f.id === activeFile.id ? { ...f, externallyModified: false } : f
                ),
              }))}>Keep</button>
            </div>
          ) : null}
          <div className="editor-inline-body">
            <CodeMirrorEditor
              content={activeFile.content}
              languageId={activeFile.languageId}
              readOnly={activeFile.mode === "preview" || activeFile.loading}
              onChange={(value) => updateEditorContent(activeFile.id, value)}
              onCursorChange={onCursorChange}
            />
            {activeFile.loading ? (
              <div className="editor-loading-overlay">
                <div className="file-loading-spinner" />
                <span>Loading file...</span>
              </div>
            ) : null}
          </div>
          {/* Status bar */}
          <div className="editor-statusbar">
            <div className="editor-statusbar-left">
              <div className="editor-statusbar-item-wrap">
                <button
                  className="editor-statusbar-item"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setLangMenuAnchor((current) =>
                      current
                        ? null
                        : anchorMenuFromRect(rect, { width: 200, height: 280 }, "top-start")
                    );
                  }}
                >
                  {activeFile.languageName} <ChevronDown size={10} strokeWidth={2} />
                </button>
              </div>
              <span className="editor-statusbar-text">{activeFile.encoding}</span>
            </div>
            <div className="editor-statusbar-right">
              {activeFile.mode === "preview" ? (
                <span className="editor-statusbar-badge">Read-Only</span>
              ) : null}
              <span className="editor-statusbar-text">
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="editor-inline-empty">No file selected</div>
      )}

      <ContextMenu
        open={!!dockMenuAnchor}
        anchor={dockMenuAnchor}
        onClose={() => setDockMenuAnchor(null)}
        className="file-context-menu"
        minWidth={196}
        allowViewportOverflowOnMac
      >
        <button onClick={() => { setEditorDock("left"); setDockMenuAnchor(null); }}>
          <PanelLeft size={13} strokeWidth={2} /> Dock Left
        </button>
        <button onClick={() => { setEditorDock("top"); setDockMenuAnchor(null); }}>
          <PanelTop size={13} strokeWidth={2} /> Dock Top
        </button>
        <button onClick={() => { setEditorDock("right"); setDockMenuAnchor(null); }}>
          <PanelRight size={13} strokeWidth={2} /> Dock Right
        </button>
        <button onClick={() => { setEditorDock("bottom"); setDockMenuAnchor(null); }}>
          <PanelBottom size={13} strokeWidth={2} /> Dock Bottom
        </button>
        <button onClick={popoutEditorWorkspace}>
          <ChevronDown size={13} strokeWidth={2} /> Open in Separate Window
        </button>
      </ContextMenu>

      <ContextMenu
        open={!!langMenuAnchor}
        anchor={langMenuAnchor}
        onClose={() => setLangMenuAnchor(null)}
        className="file-context-menu"
        minWidth={200}
        allowViewportOverflowOnMac
      >
        {activeFile ? allLanguages.map((lang) => (
          <button
            key={lang.id}
            className={lang.id === activeFile.languageId ? "active" : ""}
            onClick={() => {
              setEditorLanguage(activeFile.id, lang.id, lang.name);
              setLangMenuAnchor(null);
            }}
          >
            {lang.name}
          </button>
        )) : null}
      </ContextMenu>

      <ContextMenu
        open={!!tabMenu}
        anchor={tabMenu?.anchor ?? null}
        onClose={() => setTabMenu(null)}
        className="file-context-menu"
        minWidth={216}
        allowViewportOverflowOnMac
      >
        {tabMenu ? (() => {
          const file = editorFiles.find((item) => item.id === tabMenu.fileId);
          if (!file) return null;
          return (
            <>
              <button onClick={() => {
                void navigator.clipboard.writeText(file.path);
                setTabMenu(null);
              }}>
                <FileCode size={13} strokeWidth={2} /> Copy Path
              </button>
              <button
                disabled={!!file.sessionId}
                onClick={() => {
                  if (!file.sessionId) {
                    void invoke("reveal_path", { path: file.path });
                  }
                  setTabMenu(null);
                }}
              >
                <PanelRight size={13} strokeWidth={2} /> Open in Finder/Explorer
              </button>
              <button
                disabled={activeTabId == null}
                onClick={() => {
                  setSelectedSidebarTool("files");
                  void revealFileInManager(file.path, file.sessionId).catch(() => undefined);
                  setTabMenu(null);
                }}
              >
                <PanelLeft size={13} strokeWidth={2} /> Show in File Manager
              </button>
              <button onClick={() => {
                closeEditorFile(file.id);
                setTabMenu(null);
              }}>
                <X size={13} strokeWidth={2} /> Close Tab
              </button>
            </>
          );
        })() : null}
      </ContextMenu>
    </div>
  );
}
