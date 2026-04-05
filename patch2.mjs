import fs from 'fs';

let original = fs.readFileSync('src/features/ssh/SshHostPicker.tsx', 'utf8');

// Replace Header actions
original = original.replace(
  /<div className="ssh-header-actions">[\s\S]*?<\/div>\s*<\/div>/m,
  \`<div className="ssh-header-actions">
          <button className="import-btn" style={{ background: "#4a4a4a", color: "#fff", display: "flex", alignItems: "center", gap: "6px", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }} onClick={openImportModal}>
            <Paperclip size={14} /> IMPORT SSH
          </button>
          <div className="new-host-wrapper" style={{ display: "flex", borderRadius: "6px", overflow: "hidden" }}>
             <button style={{ background: "#5a5a5a", color: "#fff", display: "flex", alignItems: "center", gap: "6px", border: "none", padding: "6px 12px", borderRight: "1px solid rgba(0,0,0,0.2)", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }} onClick={() => { setSettingsDraft({ ...blankHost }); setSettingsTab("connection"); }}>
                <Server size={14} /> NEW HOST
             </button>
             <button style={{ background: "#5a5a5a", color: "#fff", border: "none", padding: "6px 8px", cursor: "pointer" }} onClick={() => setQuickConnectOpen(true)}>
                <ChevronDown size={14} />
             </button>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="ssh-filter-bar" style={{ display: "flex", justifyContent: "space-between", background: "#2a2a2a", borderRadius: "8px", padding: "6px 8px", alignItems: "center", margin: "16px 0" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button style={{ background: "#4a4a4a", color: "#fff", padding: "4px 12px", borderRadius: "4px", border: "none", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>ALL</button>
          <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.2)" }} />
          {sshGroups.map(g => <button key={g.id} style={{ background: "transparent", color: "#aaa", padding: "4px 12px", border: "none", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>{g.name}</button>)}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ background: "#3e3e3e", padding: "4px", borderRadius: "4px", border: "none", color: "#fff", cursor: "pointer" }} onClick={() => openGroupModal()}> <Plus size={16} /> </button>
          <button style={{ background: "#3e3e3e", padding: "4px", borderRadius: "4px", border: "none", color: "#fff", cursor: "pointer" }}> <Search size={16} /> </button>
        </div>
      </div>\`
);

// Replace HostCard!
const oldCardIndex = original.indexOf("function HostCard(");
if (oldCardIndex !== -1) {
  original = original.slice(0, oldCardIndex) + \`
function HostCard({ host, osInfo, connecting, onConnect, onSettings, draggable, onDragStart, onDragEnd }: HostCardProps) {
  const osMeta = osInfo?.os ? OS_META[osInfo.os] : null;
  const subtitle = [host.user ? \\\`\\\${host.user}@\\\` : "", host.host_name, host.port && host.port !== 22 ? \\\`:\\\${host.port}\\\` : ""].join("");
  const color = getHostColor(host.alias);

  return (
    <div
      className="host-card-new"
      style={{ background: "#2a2a2a", borderRadius: "12px", display: "flex", alignItems: "stretch", cursor: "pointer", height: "70px", border: "1px solid rgba(255,255,255,0.05)", position: "relative" }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onConnect}
    >
      {connecting && <div style={{position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px"}}><div className="mini-spinner" /></div>}
      
      {/* Settings section */}
      <div style={{ width: "48px", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", borderRight: "1px solid rgba(255,255,255,0.08)" }} onClick={(e) => { e.stopPropagation(); onSettings(); }}>
        <Settings size={16} strokeWidth={1.5} />
      </div>

      {/* Core info */}
      <div style={{ flex: 1, display: "flex", padding: "0 14px", gap: "14px", alignItems: "center", overflow: "hidden" }}>
        {osMeta ? (
          <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: osMeta.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold" }}>
            {osMeta.label}
          </div>
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold" }}>
            {getInitial(host.alias)}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", justifyContent: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", textTransform: "uppercase" }}>{host.alias}</div>
          <div style={{ fontSize: "0.75rem", color: "#aaa" }}>{subtitle || "No host"}</div>
          <div style={{ fontSize: "0.65rem", color: "#777" }}>{osMeta ? \\\`\\\${osMeta.name} \\\${osInfo?.version || ""}\\\` : "Linux"}</div>
        </div>
      </div>

      <div style={{ width: "38px", display: "flex", alignItems: "center", justifyContent: "center", color: "#777" }}>
        <ChevronRight size={18} strokeWidth={1.5} />
      </div>
    </div>
  );
}
\`;
}

original = original.replace(/import { Settings, ChevronRight,[^}]+} from "lucide-react";/, 
  \`import { Settings, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, Download, RefreshCw, ArrowRight, Paperclip, Server, Search } from "lucide-react";\`);

fs.writeFileSync('src/features/ssh/SshHostPicker.tsx', original);
console.log("Patched successfully");
