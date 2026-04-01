import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Save, FolderOpen } from "lucide-react";
import type { EditorWindowTabSeed } from "./editorWindow";

interface EditorTab {
  id: string;
  path: string;
  mode: "preview" | "edit";
  content: string;
  dirty: boolean;
  sessionId?: string;
  serverLabel?: string;
  error?: string;
}

function parseQuery() {
  const hash = window.location.hash;
  const queryPart = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(queryPart);
  const path = params.get("path") ? decodeURIComponent(params.get("path") as string) : "";
  const mode = params.get("mode") === "preview" ? "preview" : "edit";
  const sessionId = params.get("sessionId") ?? undefined;
  const serverLabel = params.get("serverLabel") ?? undefined;
  const activeRaw = Number.parseInt(params.get("active") ?? "0", 10);
  const activeIndex = Number.isFinite(activeRaw) ? activeRaw : 0;

  let tabs: EditorWindowTabSeed[] = [];
  const tabsRaw = params.get("tabs");
  if (tabsRaw) {
    try {
      const parsed = JSON.parse(tabsRaw) as unknown;
      if (Array.isArray(parsed)) {
        tabs = parsed
          .map((item): EditorWindowTabSeed | null => {
            if (!item || typeof item !== "object") return null;
            const obj = item as Partial<EditorWindowTabSeed>;
            if (!obj.path || typeof obj.path !== "string") return null;
            return {
              path: obj.path,
              mode: obj.mode === "preview" ? "preview" : "edit",
              sessionId: obj.sessionId,
              serverLabel: typeof obj.serverLabel === "string" ? obj.serverLabel : undefined,
              content: typeof obj.content === "string" ? obj.content : undefined,
              dirty: !!obj.dirty,
              error: typeof obj.error === "string" ? obj.error : undefined,
            };
          })
          .filter((item): item is EditorWindowTabSeed => !!item);
      }
    } catch {
      // Ignore malformed payload and fallback to single-tab query mode.
    }
  }

  return { path, mode: mode as "preview" | "edit", sessionId, serverLabel, tabs, activeIndex };
}

export function EditorWorkspace() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<EditorTab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  const hydrateFromSeeds = useCallback(async (seeds: EditorWindowTabSeed[], activeIndex: number) => {
    const seededTabs: EditorTab[] = seeds.map((seed) => ({
      id: crypto.randomUUID(),
      path: seed.path,
      mode: seed.mode,
      content: seed.content ?? "",
      dirty: !!seed.dirty,
      sessionId: seed.sessionId,
      serverLabel: seed.serverLabel ?? (seed.sessionId ? "Remote server" : "Local machine"),
      error: seed.error,
    }));

    setTabs(seededTabs);
    const clampedActive = Math.max(0, Math.min(activeIndex, seededTabs.length - 1));
    setActiveTabId(seededTabs[clampedActive]?.id);

    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      if (typeof seed.content === "string" || seed.error) continue;

      try {
        const content = seed.sessionId
          ? await invoke<string>("read_remote_text_file", { sessionId: seed.sessionId, path: seed.path })
          : await invoke<string>("read_text_file", { path: seed.path });

        const tabId = seededTabs[i]?.id;
        if (!tabId) continue;
        setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, content } : tab)));
      } catch (error) {
        const tabId = seededTabs[i]?.id;
        if (!tabId) continue;
        setTabs((prev) => prev.map((tab) => (
          tab.id === tabId
            ? { ...tab, error: error instanceof Error ? error.message : String(error) }
            : tab
        )));
      }
    }
  }, []);

  useEffect(() => {
    const { path, mode, sessionId, serverLabel, tabs: seededTabs, activeIndex } = parseQuery();
    if (seededTabs.length > 0) {
      void hydrateFromSeeds(seededTabs, activeIndex);
      return;
    }
    if (path) {
      void openPath(path, mode, sessionId, serverLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateFromSeeds]);

  const openPath = async (
    path: string,
    mode: "preview" | "edit",
    sessionId?: string,
    serverLabel?: string
  ) => {
    const existing = tabsRef.current.find((tab) => tab.path === path && tab.sessionId === sessionId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const id = crypto.randomUUID();

    try {
      let content: string;
      if (sessionId) {
        content = await invoke<string>("read_remote_text_file", { sessionId, path });
      } else {
        content = await invoke<string>("read_text_file", { path });
      }
      setTabs((prev) => [
        ...prev,
        {
          id,
          path,
          mode,
          content,
          dirty: false,
          sessionId,
          serverLabel: serverLabel ?? (sessionId ? "Remote server" : "Local machine"),
        }
      ]);
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
          serverLabel: serverLabel ?? (sessionId ? "Remote server" : "Local machine"),
          error: error instanceof Error ? error.message : String(error)
        }
      ]);
      setActiveTabId(id);
    }
  };

  const closeTab = (tabId: string) => {
    const target = tabsRef.current.find((tab) => tab.id === tabId);
    if (target?.dirty) {
      const ok = window.confirm(`\"${target.path.split(/[\\/]/).pop()}\" has unsaved changes. Close anyway?`);
      if (!ok) return;
    }
    setTabs((prev) => {
      const rest = prev.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(rest[0]?.id);
      }
      return rest;
    });
  };

  const saveActive = useCallback(async () => {
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
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? { ...tab, error: err instanceof Error ? err.message : String(err) }
            : tab
        )
      );
    }
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActive]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (tabs.some((tab) => tab.dirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tabs]);

  const lineCount = activeTab ? activeTab.content.split("\n").length : 0;

  const syncScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
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
              {tab.sessionId ? " (remote)" : ""}
              <span
                className="editor-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X size={11} strokeWidth={2.5} />
              </span>
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <button
            className="editor-action-btn"
            onClick={() => {
              const path = window.prompt("Open file path")?.trim();
              if (path) {
                const { sessionId } = parseQuery();
                void openPath(path, "edit", sessionId, sessionId ? "Remote server" : "Local machine");
              }
            }}
            title="Open file"
          >
            <FolderOpen size={14} strokeWidth={2} />
          </button>
          <button
            className="editor-action-btn"
            onClick={() => void saveActive()}
            disabled={!activeTab || activeTab.mode === "preview"}
            title="Save (Ctrl+S)"
          >
            <Save size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      {!activeTab ? <div className="editor-empty">No file opened</div> : null}

      {activeTab ? (
        <main className="editor-main">
          <div className="editor-meta">
            <span className="editor-meta-path">{activeTab.path}</span>
            <span className="editor-meta-badge">
              {activeTab.sessionId ? "remote" : "local"} · {activeTab.mode}
            </span>
          </div>
          {activeTab.error ? <div className="editor-error">{activeTab.error}</div> : null}
          <div className="editor-body">
            <div className="editor-line-numbers" ref={lineNumbersRef}>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="editor-line-number">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={activeTab.content}
              readOnly={activeTab.mode === "preview"}
              spellCheck={false}
              onScroll={syncScroll}
              onChange={(event) => {
                const value = event.target.value;
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === activeTab.id ? { ...tab, content: value, dirty: true } : tab
                  )
                );
                  <span className="editor-tab-meta">
                    <span className="editor-tab-title">
                      {tab.path.split(/[\\/]/).pop()}
                      {tab.dirty ? " *" : ""}
                    </span>
                    <span className="editor-tab-subtitle">{tab.serverLabel ?? (tab.sessionId ? "Remote server" : "Local machine")}</span>
                  </span>
        </main>
      ) : null}
    </div>
  );
}
