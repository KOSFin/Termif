import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

interface EditorTab {
  id: string;
  path: string;
  mode: "preview" | "edit";
  content: string;
  dirty: boolean;
  error?: string;
}

function parseQuery() {
  const hash = window.location.hash;
  const queryPart = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(queryPart);
  const path = params.get("path") ? decodeURIComponent(params.get("path") as string) : "";
  const mode = params.get("mode") === "preview" ? "preview" : "edit";
  return { path, mode: mode as "preview" | "edit" };
}

export function EditorWorkspace() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>();

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  useEffect(() => {
    const { path, mode } = parseQuery();
    if (path) {
      void openPath(path, mode);
    }
    // This effect intentionally runs only once for initial tab hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPath = async (path: string, mode: "preview" | "edit") => {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const id = crypto.randomUUID();

    try {
      const content = await invoke<string>("read_text_file", { path });
      setTabs((prev) => [...prev, { id, path, mode, content, dirty: false }]);
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
    if (!activeTab || activeTab.mode === "preview") {
      return;
    }
    await invoke("write_text_file", { path: activeTab.path, content: activeTab.content });
    setTabs((prev) => prev.map((tab) => (tab.id === activeTab.id ? { ...tab, dirty: false } : tab)));
  };

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
              <span
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
                void openPath(path, "edit");
              }
            }}
          >
            Open
          </button>
          <button onClick={() => void saveActive()} disabled={!activeTab || activeTab.mode === "preview"}>
            Save
          </button>
        </div>
      </header>

      {!activeTab ? <div className="editor-empty">No file opened</div> : null}

      {activeTab ? (
        <main className="editor-main">
          <div className="editor-meta">
            <span>{activeTab.path}</span>
            <span>{activeTab.mode === "preview" ? "Preview" : "Edit"}</span>
          </div>
          {activeTab.error ? <div className="editor-error">{activeTab.error}</div> : null}
          <textarea
            value={activeTab.content}
            readOnly={activeTab.mode === "preview"}
            onChange={(event) => {
              const value = event.target.value;
              setTabs((prev) =>
                prev.map((tab) => (tab.id === activeTab.id ? { ...tab, content: value, dirty: true } : tab))
              );
            }}
          />
        </main>
      ) : null}
    </div>
  );
}
