import { useMemo } from "react";
import { FileManagerPane } from "@/features/file_manager/FileManagerPane";
import { useAppStore } from "@/store/useAppStore";

export function Sidebar() {
  const { tabs, activeTabId } = useAppStore((state) => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  return (
    <aside className="sidebar">
      <div className="sidebar-tools">
        <button className="active">Files</button>
      </div>
      <div className="sidebar-content">
        <FileManagerPane
          activeSessionId={activeTab?.sessionId}
          isRemote={activeTab?.kind === "ssh"}
        />
      </div>
    </aside>
  );
}
