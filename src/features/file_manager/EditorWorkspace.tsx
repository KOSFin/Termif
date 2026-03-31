import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

interface EditorTab {
  id: string;
  path: string;
  mode: "preview" | "edit";
  content: string;
  dirty: boolean;
  sessionId?: string; // present for remote SSH files
  error?: string;
}

function parseQuery() {
  const hash = window.location.hash;
  const queryPart = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(queryPart);
  const path = params.get("path") ? decodeURIComponent(params.get("path") as string) : "";
  const mode = params.get("mode") === "preview" ? "preview" : "edit";
  const sessionId = params.get("sessionId") ?? undefined;
  return { path, mode: mode as "preview" | "edit", sessionId };
}

export function EditorWorkspace() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>();

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  useEffect(() => {
    const { path, mode, sessionId } = parseQuery();
    if (path) {
      void openPath(path, mode, sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPath = async (path: string, mode: "preview" | "edit", sessionId?: string) => {
    const existing = tabs.find((tab) => tab.path === path && tab.sessionId === sessionId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const id = crypto.randomUUID();

    try {
      let content: string;
      if (sessionId) {
        // Remote file via SSH
        content = await invoke<string>("read_remote_text_file", { sessionId, path });
      } else {
        content = await invoke<string>("read_text_file", { path });
      }
      setTabs((prev) => [...prev, { id, path, mode, content, dirty: false, sessionId }]);
      setActiveTabId(id);
    } catch (error) {
      setTabs((prev) => [
        ...prev,
        {
          id,
          path,
          mode,
          content: "",
          dirty: false,
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        }
      ]);
      setActiveTabId(id);
    }
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) {
      const rest = tabs.filter((tab) => tab.id !== tabId);
      setActiveTabId(rest[0]?.id);
    }
  };

  const saveActive = async () => {
    if (!activeTab || activeTab.mode === "preview") return;
    try {
      if (activeTab.sessionId) {
        await invoke("write_remote_text_file", {
          sessionId: activeTab.sessionId,
          path: activeTab.path,
          content: activeTab.content
        });
      } else {
        await invoke("write_text_file", { path: activeTab.path, content: activeTab.content });
      }
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTab.id ? { ...tab, dirty: false } : tab))
      );
    } catch (err) {
      // Show error inline
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? { ...tab, error: err instanceof Error ? err.message : String(err) }
            : tab
        )
      );
    }
  };

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="editor-workspace">
      <header className="editor-header">
        <div className="editor-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`editor-tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.path.split(/[\\/]/).pop()}
              {tab.dirty ? " *" : ""}
              {tab.sessionId ? " ☁" : ""}
              <span
                className="editor-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <button
            onClick={() => {
              const path = window.prompt("Open file path")?.trim();
              if (path) {
                const { sessionId } = parseQuery();
                void openPath(path, "edit", sessionId);
              }
            }}
          >
            Open
          </button>
          <button
            onClick={() => void saveActive()}
            disabled={!activeTab || activeTab.mode === "preview"}
            title="Save (Ctrl+S)"
          >
            Save
          </button>
        </div>
      </header>

      {!activeTab ? <div className="editor-empty">No file opened</div> : null}

      {activeTab ? (
        <main className="editor-main">
          <div className="editor-meta">
            <span>{activeTab.path}</span>
            <span className="editor-meta-badge">
              {activeTab.sessionId ? "remote" : "local"} · {activeTab.mode}
            </span>
          </div>
          {activeTab.error ? <div className="editor-error">{activeTab.error}</div> : null}
          <textarea
            className="editor-textarea"
            value={activeTab.content}
            readOnly={activeTab.mode === "preview"}
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === activeTab.id ? { ...tab, content: value, dirty: true } : tab
                )
              );
            }}
          />
        </main>
      ) : null}
    </div>
  );
}
