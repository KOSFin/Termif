import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo } from "react";
import { TabStrip } from "@/app/tabs/TabStrip";
import { Sidebar } from "@/app/sidebar/Sidebar";
import { CommandPalette, type PaletteCommand } from "@/app/palette/CommandPalette";
import { SettingsPanel } from "@/app/settings/SettingsPanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useAppStore } from "@/store/useAppStore";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { SshHostPicker } from "@/features/ssh/SshHostPicker";
import { openEditorWindow } from "@/features/file_manager/editorWindow";

export function AppShell() {
  const {
    isInitialized,
    initialize,
    tabs,
    activeTabId,
    sidebarVisible,
    paletteOpen,
    settingsOpen,
    settings,
    selectedFile,
    lastToast,
    createLocalTab,
    createSshPickerTab,
    closeTab,
    duplicateTab,
    renameTab,
    setTabColor,
    setActiveTab,
    setPaletteOpen,
    setSettingsOpen,
    toggleSidebar,
    loadCurrentFiles,
    saveSettings,
    toast
  } = useAppStore((state) => ({
    isInitialized: state.isInitialized,
    initialize: state.initialize,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    sidebarVisible: state.sidebarVisible,
    paletteOpen: state.paletteOpen,
    settingsOpen: state.settingsOpen,
    settings: state.settings,
    selectedFile: state.selectedFile,
    lastToast: state.lastToast,
    createLocalTab: state.createLocalTab,
    createSshPickerTab: state.createSshPickerTab,
    closeTab: state.closeTab,
    duplicateTab: state.duplicateTab,
    renameTab: state.renameTab,
    setTabColor: state.setTabColor,
    setActiveTab: state.setActiveTab,
    setPaletteOpen: state.setPaletteOpen,
    setSettingsOpen: state.setSettingsOpen,
    toggleSidebar: state.toggleSidebar,
    loadCurrentFiles: state.loadCurrentFiles,
    saveSettings: state.saveSettings,
    toast: state.toast
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useHotkeys({
    onOpenPalette: () => setPaletteOpen(true),
    onToggleSidebar: () => toggleSidebar(),
    onNewTab: () => {
      void createLocalTab(settings?.terminal.default_shell ?? "powershell");
    },
    onOpenSettings: () => setSettingsOpen(true)
  });

  const commands: PaletteCommand[] = [
    {
      id: "tab.new_default",
      title: "New Default Terminal",
      category: "Tabs",
      action: () => {
        void createLocalTab(settings?.terminal.default_shell ?? "powershell");
      }
    },
    {
      id: "tab.new_powershell",
      title: "New PowerShell Tab",
      category: "Tabs",
      action: () => {
        void createLocalTab("powershell");
      }
    },
    {
      id: "tab.new_cmd",
      title: "New CMD Tab",
      category: "Tabs",
      action: () => {
        void createLocalTab("cmd");
      }
    },
    {
      id: "ssh.open",
      title: "Open SSH Connection",
      category: "SSH",
      action: createSshPickerTab
    },
    {
      id: "settings.open",
      title: "Open Settings",
      category: "UI",
      action: () => setSettingsOpen(true)
    },
    {
      id: "sidebar.toggle",
      title: "Toggle Sidebar",
      category: "UI",
      action: toggleSidebar
    },
    {
      id: "tab.rename",
      title: "Rename Current Tab",
      category: "Tabs",
      action: () => {
        if (!activeTab) return;
        const nextName = window.prompt("Rename tab", activeTab.title)?.trim();
        if (nextName) renameTab(activeTab.id, nextName);
      }
    },
    {
      id: "tab.recolor",
      title: "Change Tab Color",
      category: "Tabs",
      action: () => {
        if (!activeTab) return;
        const color = window.prompt("Hex color", activeTab.color)?.trim();
        if (color) setTabColor(activeTab.id, color);
      }
    },
    {
      id: "files.refresh",
      title: "Refresh File Manager",
      category: "Files",
      action: () => {
        void loadCurrentFiles();
      }
    },
    {
      id: "files.new_file",
      title: "Create New File",
      category: "Files",
      action: async () => {
        const name = window.prompt("File name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? "C:/").replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: false });
        await loadCurrentFiles();
      }
    },
    {
      id: "files.new_folder",
      title: "Create New Folder",
      category: "Files",
      action: async () => {
        const name = window.prompt("Folder name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? "C:/").replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: true });
        await loadCurrentFiles();
      }
    },
    {
      id: "files.open_selected",
      title: "Open Selected File",
      category: "Files",
      action: () => {
        if (!selectedFile) {
          toast("No file selected");
          return;
        }
        openEditorWindow(selectedFile.path, "edit");
      }
    },
    {
      id: "files.preview_selected",
      title: "Preview Selected File",
      category: "Files",
      action: () => {
        if (!selectedFile) {
          toast("No file selected");
          return;
        }
        openEditorWindow(selectedFile.path, "preview");
      }
    }
  ];

  return (
    <div className="app-root">
      <header className="topbar">
        <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          ☰
        </button>
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTab}
          onNewDefault={() => void createLocalTab(settings?.terminal.default_shell ?? "powershell")}
          onNewShell={(shell) => void createLocalTab(shell)}
          onNewSsh={createSshPickerTab}
          onRename={renameTab}
          onColor={setTabColor}
          onDuplicate={(tabId) => {
            void duplicateTab(tabId);
          }}
          onClose={(tabId) => {
            void closeTab(tabId);
          }}
        />
        <div className="topbar-spacer" />
        <div className="topbar-right">
          <button onClick={() => setPaletteOpen(true)} title="Command Palette (Ctrl+Shift+P)">&#x2318;</button>
          <button onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)">&#x2699;</button>
        </div>
      </header>

      <main className="workspace">
        {sidebarVisible ? <Sidebar /> : null}

        <section className="center-pane">
          {!isInitialized ? <div className="loading-screen">Loading...</div> : null}

          {isInitialized && activeTab?.kind === "ssh_picker" ? <SshHostPicker tabId={activeTab.id} /> : null}

          {isInitialized &&
            tabs
              .filter((t) => (t.kind === "local" || t.kind === "ssh") && t.sessionId)
              .map((t) => (
                <TerminalPane
                  key={t.sessionId}
                  sessionId={t.sessionId!}
                  isVisible={t.id === activeTabId}
                  sshAlias={t.sshAlias}
                />
              ))}
        </section>
      </main>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />

      {lastToast ? <div className="toast">{lastToast}</div> : null}
    </div>
  );
}
