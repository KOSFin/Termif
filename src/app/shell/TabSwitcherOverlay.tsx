import type { AppTab } from "@/types/models";

interface TabSwitcherOverlayProps {
  open: boolean;
  tabs: AppTab[];
  activeTabId?: string;
  selectedIndex: number;
  tabMruOrder: string[];
  useMru: boolean;
  onSelect: (tabId: string) => void;
}

export function getOrderedSwitcherTabs(
  tabs: AppTab[],
  tabMruOrder: string[],
  useMru: boolean
): AppTab[] {
  if (!useMru) return tabs;

  return tabMruOrder
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is AppTab => !!t)
    .concat(tabs.filter((t) => !tabMruOrder.includes(t.id)));
}

export function TabSwitcherOverlay({
  open,
  tabs,
  activeTabId,
  selectedIndex,
  tabMruOrder,
  useMru,
  onSelect,
}: TabSwitcherOverlayProps) {
  if (!open) return null;

  const orderedTabs = getOrderedSwitcherTabs(tabs, tabMruOrder, useMru);

  return (
    <div className="tab-switcher-overlay">
      <div className="tab-switcher-panel">
        {orderedTabs.map((tab, idx) => (
          <button
            key={tab.id}
            className={`tab-switcher-item${idx === selectedIndex ? " selected" : ""}${tab.id === activeTabId ? " current" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="tab-switcher-dot" style={{ background: tab.color }} />
            <span className="tab-switcher-title">{tab.title}</span>
            <span className="tab-switcher-index">{idx + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
