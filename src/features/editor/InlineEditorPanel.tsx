import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Save, FileCode, ChevronDown } from "lucide-react";
import { useAppStore, type EditorFile } from "@/store/useAppStore";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { allLanguages } from "./languageMap";

export function InlineEditorPanel() {
  const {
    editorFiles,
    activeEditorFileId,
    closeEditorFile,
    setActiveEditorFile,
    updateEditorContent,
    saveEditorFile,
    setEditorLanguage,
    setEditorVisible,
  } = useAppStore((s) => ({
    editorFiles: s.editorFiles,
    activeEditorFileId: s.activeEditorFileId,
    closeEditorFile: s.closeEditorFile,
    setActiveEditorFile: s.setActiveEditorFile,
    updateEditorContent: s.updateEditorContent,
    saveEditorFile: s.saveEditorFile,
    setEditorLanguage: s.setEditorLanguage,
    setEditorVisible: s.setEditorVisible,
  }));

  const activeFile = useMemo(
    () => editorFiles.find((f) => f.id === activeEditorFileId),
    [editorFiles, activeEditorFileId]
  );

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [langSelectorOpen, setLangSelectorOpen] = useState(false);

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

  const filename = (f: EditorFile) => f.path.split(/[\\/]/).pop() ?? f.path;

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
              <span className="editor-inline-tab-title">
                {filename(f)}
                {f.dirty ? " *" : ""}
              </span>
              {f.sessionId ? <span className="editor-inline-tab-badge">remote</span> : null}
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
