import { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { FileManagerPane } from "@/features/file_manager/FileManagerPane";
import { useAppStore } from "@/store/useAppStore";

interface SidebarProps {
  hidden?: boolean;
}

export function Sidebar({ hidden }: SidebarProps) {
  const { tabs, activeTabId } = useAppStore((state) => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  return (
    <aside className={`sidebar${hidden ? " sidebar-hidden" : ""}`}>
      <div className="sidebar-tools">
        <button className="active" title="Files">
          <FolderOpen size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="sidebar-content">
        <FileManagerPane
          activeSessionId={activeTab?.sessionId}
          isRemote={activeTab?.kind === "ssh"}
          sshAlias={activeTab?.sshAlias}
        />
      </div>
    </aside>
  );
}
