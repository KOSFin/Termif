import { Search } from "lucide-react";
import { sections, type SettingsSection } from "./SettingsPanel.model";
import { invoke } from "@tauri-apps/api/core";

const REPO_URL = "https://github.com/KOSFin/Termif";

function GithubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.2 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.33-1.73-1.33-1.73-1.09-.72.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.29-5.47-1.31-5.47-5.84 0-1.29.47-2.34 1.24-3.17-.12-.29-.54-1.49.12-3.1 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.39c1.02 0 2.05.13 3 .39 2.29-1.53 3.3-1.21 3.3-1.21.66 1.61.24 2.81.12 3.1.77.83 1.24 1.88 1.24 3.17 0 4.54-2.81 5.54-5.49 5.83.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.83.56A11.8 11.8 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}

interface SettingsNavProps {
  activeSection: SettingsSection;
  searchQuery: string;
  normalizedQuery: string;
  matches: (...texts: string[]) => boolean;
  onSectionChange: (section: SettingsSection) => void;
  onSearchQueryChange: (value: string) => void;
}

export function SettingsNav({
  activeSection,
  searchQuery,
  normalizedQuery,
  matches,
  onSectionChange,
  onSearchQueryChange,
}: SettingsNavProps) {
  return (
    <nav className="settings-nav">
      <div className="settings-nav-header">Settings</div>
      <div className="settings-search-wrap">
        <Search size={13} strokeWidth={2} />
        <input
          className="settings-search-input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search settings..."
        />
      </div>
      {sections.map((section) => {
        const Icon = section.icon;
        const navMatch = matches(section.label, section.key.replace("_", " "));
        return (
          <button
            key={section.key}
            className={`settings-nav-item ${activeSection === section.key ? "active" : ""}${normalizedQuery && navMatch ? " search-match" : ""}`}
            onClick={() => onSectionChange(section.key)}
          >
            <Icon size={15} strokeWidth={1.8} />
            {section.label}
          </button>
        );
      })}
      <a
        className="settings-nav-repo"
        href={REPO_URL}
        onClick={(e) => {
          e.preventDefault();
          void invoke("open_external_url", { url: REPO_URL }).catch(() => {});
        }}
        title="Open Termif on GitHub"
      >
        <GithubIcon size={15} />
        Termif
      </a>
    </nav>
  );
}
