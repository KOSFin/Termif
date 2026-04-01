import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Save,
  FileCode,
  ChevronDown,
  GripVertical,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop
} from "lucide-react";
import { useAppStore, type EditorDock, type EditorFile } from "@/store/useAppStore";
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
    closeEditorFile,
    setActiveEditorFile,
    updateEditorContent,
    saveEditorFile,
    setEditorLanguage,
    setEditorDock,
    setEditorVisible,
    clearEditorWorkspace,
  } = useAppStore((s) => ({
    editorFiles: s.editorFiles,
    activeEditorFileId: s.activeEditorFileId,
    tabs: s.tabs,
    closeEditorFile: s.closeEditorFile,
    setActiveEditorFile: s.setActiveEditorFile,
    updateEditorContent: s.updateEditorContent,
    saveEditorFile: s.saveEditorFile,
    setEditorLanguage: s.setEditorLanguage,
    setEditorDock: s.setEditorDock,
    setEditorVisible: s.setEditorVisible,
    clearEditorWorkspace: s.clearEditorWorkspace,
  }));

  const activeFile = useMemo(
    () => editorFiles.find((f) => f.id === activeEditorFileId),
    [editorFiles, activeEditorFileId]
  );

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [langSelectorOpen, setLangSelectorOpen] = useState(false);
  const [dockMenuOpen, setDockMenuOpen] = useState(false);
  const langSelectorRef = useRef<HTMLDivElement | null>(null);
  const dockMenuRef = useRef<HTMLDivElement | null>(null);

  const onCursorChange = useCallback((line: number, col: number) => {
    setCursorPos({ line, col });
  }, []);

  // Ctrl+S save
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

  useEffect(() => {
    if (!langSelectorOpen && !dockMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (langSelectorOpen && langSelectorRef.current && !langSelectorRef.current.contains(target)) {
        setLangSelectorOpen(false);
      }
      if (dockMenuOpen && dockMenuRef.current && !dockMenuRef.current.contains(target)) {
        setDockMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [dockMenuOpen, langSelectorOpen]);

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
        content: f.content,
        dirty: f.dirty,
        error: f.error,
      })),
      activeIndex
    );
    clearEditorWorkspace();
    setDockMenuOpen(false);
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
          <div className="editor-action-menu-wrap" ref={dockMenuRef}>
            <button
              className={`editor-action-btn${dockMenuOpen ? " active" : ""}`}
              onClick={() => setDockMenuOpen((v) => !v)}
              title={`Dock and window options (current: ${dock})`}
            >
              <ChevronDown size={14} strokeWidth={2} />
            </button>
            {dockMenuOpen ? (
              <div className="editor-action-menu" onMouseLeave={() => setDockMenuOpen(false)}>
                <button onClick={() => { setEditorDock("left"); setDockMenuOpen(false); }}>
                  <PanelLeft size={13} strokeWidth={2} /> Dock Left
                </button>
                <button onClick={() => { setEditorDock("top"); setDockMenuOpen(false); }}>
                  <PanelTop size={13} strokeWidth={2} /> Dock Top
                </button>
                <button onClick={() => { setEditorDock("right"); setDockMenuOpen(false); }}>
                  <PanelRight size={13} strokeWidth={2} /> Dock Right
                </button>
                <button onClick={() => { setEditorDock("bottom"); setDockMenuOpen(false); }}>
                  <PanelBottom size={13} strokeWidth={2} /> Dock Bottom
                </button>
                <button onClick={popoutEditorWorkspace}>
                  <ChevronDown size={13} strokeWidth={2} /> Open in Separate Window
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="editor-action-btn"
            onClick={() => {
              if (activeFile && activeFile.dirty) void saveEditorFile(activeFile.id);
            }}
            disabled={!activeFile || !activeFile.dirty || activeFile.mode === "preview"}
            title="Save (Ctrl+S)"
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
          <div className="editor-inline-body">
            <CodeMirrorEditor
              content={activeFile.content}
              languageId={activeFile.languageId}
              readOnly={activeFile.mode === "preview"}
              onChange={(value) => updateEditorContent(activeFile.id, value)}
              onCursorChange={onCursorChange}
            />
          </div>
          {/* Status bar */}
          <div className="editor-statusbar">
            <div className="editor-statusbar-left">
              <div className="editor-statusbar-item-wrap" style={{ position: "relative" }}>
                <button
                  className="editor-statusbar-item"
                  onClick={() => setLangSelectorOpen((v) => !v)}
                >
                  {activeFile.languageName} <ChevronDown size={10} strokeWidth={2} />
                </button>
                {langSelectorOpen ? (
                  <div
                    className="editor-selector-dropdown"
                        ref={langSelectorRef}
                    onMouseLeave={() => setLangSelectorOpen(false)}
                  >
                    {allLanguages.map((lang) => (
                      <button
                        key={lang.id}
                        className={lang.id === activeFile.languageId ? "active" : ""}
                        onClick={() => {
                          setEditorLanguage(activeFile.id, lang.id, lang.name);
                          setLangSelectorOpen(false);
                        }}
                      >
                        {lang.name}
                      </button>
                    ))}
                  </div>
                ) : null}
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
    </div>
  );
}
