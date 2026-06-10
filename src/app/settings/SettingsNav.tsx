import { Search } from "lucide-react";
import { sections, type SettingsSection } from "./SettingsPanel.model";

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
      <div className="settings-search-wrap" style={{ margin: "0 8px 10px" }}>
        <Search size={13} strokeWidth={2} />
        <input
          className="settings-search-input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search all settings..."
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
    </nav>
  );
}
