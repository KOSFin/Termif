import { useMemo } from "react";
import { FolderOpen, Braces } from "lucide-react";
import { FileManagerPane } from "@/features/file_manager/FileManagerPane";
import { SnippetsPane } from "@/features/snippets/SnippetsPane";
import { useAppStore } from "@/store/useAppStore";

interface SidebarProps {
  hidden?: boolean;
}

export function Sidebar({ hidden }: SidebarProps) {
  const { tabs, activeTabId, selectedSidebarTool, setSelectedSidebarTool } = useAppStore((state) => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    selectedSidebarTool: state.selectedSidebarTool,
    setSelectedSidebarTool: state.setSelectedSidebarTool,
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  return (
    <aside className={`sidebar${hidden ? " sidebar-hidden" : ""}`}>
      <div className="sidebar-tools">
        <button
          className={selectedSidebarTool === "files" ? "active" : ""}
          title="Files"
          onClick={() => setSelectedSidebarTool("files")}
        >
          <FolderOpen size={15} strokeWidth={2} />
        </button>
        <button
          className={selectedSidebarTool === "snippets" ? "active" : ""}
          title="Snippets"
          onClick={() => setSelectedSidebarTool("snippets")}
        >
          <Braces size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="sidebar-content">
        {selectedSidebarTool === "files" ? (
          <FileManagerPane
            activeSessionId={activeTab?.sessionId}
            isRemote={activeTab?.kind === "ssh"}
            sshAlias={activeTab?.sshAlias}
          />
        ) : (
          <SnippetsPane activeSessionId={activeTab?.sessionId} />
        )}
      </div>
    </aside>
  );
}
