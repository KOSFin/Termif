import type { DragEvent } from "react";
import { ChevronRight, Settings } from "lucide-react";
import type { SshHostEntry } from "@/types/models";
import { OS_LOGO_META, OsLogoBadge } from "@/features/ssh/OsLogo";
import { getHostColor, getInitial, type OsInfo } from "@/features/ssh/sshHostPickerUtils";

interface HostCardProps {
  host: SshHostEntry;
  osInfo?: OsInfo;
  connecting: boolean;
  isConnected?: boolean;
  onConnect: () => void;
  onSettings: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}

export function HostCard({
  host,
  osInfo,
  connecting,
  isConnected,
  onConnect,
  onSettings,
  draggable,
  onDragStart,
  onDragEnd,
}: HostCardProps) {
  const osMeta = osInfo?.os ? OS_LOGO_META[osInfo.os] : null;
  const subtitle = [host.user ? `${host.user}@` : "", host.host_name, host.port && host.port !== 22 ? `:${host.port}` : ""].join("");
  const color = getHostColor(host.alias);

  return (
    <div
      className="host-card-new"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onConnect}
    >
      {connecting ? (
        <div className="connecting-overlay-new">
          <div className="mini-spinner" />
        </div>
      ) : null}
      {isConnected ? <div className="connection-dot-new" title="Connected in a tab" /> : null}

      <div className="host-card-new-settings" onClick={(event) => { event.stopPropagation(); onSettings(); }}>
        <Settings size={16} strokeWidth={1.5} />
      </div>

      <div className="host-card-new-core">
        {osMeta ? (
          <OsLogoBadge os={osInfo!.os} version={osInfo?.version} className="host-card-new-icon os-icon" />
        ) : (
          <div className="host-card-new-icon" style={{ background: color }}>
            {getInitial(host.alias)}
          </div>
        )}

        <div className="host-card-new-details">
          <div className="host-card-new-alias">{host.alias}</div>
          <div className="host-card-new-sub">{subtitle || "No host configured"}</div>
          <div className="host-card-new-os">{osMeta ? `${osMeta.name} ${osInfo?.version || ""}` : "Linux/Unknown"}</div>
        </div>
      </div>

      <div className="host-card-new-chevron">
        <ChevronRight size={18} strokeWidth={1.5} />
      </div>
    </div>
  );
}
