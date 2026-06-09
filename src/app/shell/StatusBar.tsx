import type { AppTab, SystemStats } from "@/types/models";
import { classifyPercent, formatClock } from "@/app/shell/shellUtils";
import { formatUpdateProgress, type AutoUpdateState } from "@/features/update/useAutoUpdater";

interface StatusBarProps {
  activeTab?: AppTab;
  remoteStatus: SystemStats | null;
  remoteStatusError?: string;
  remoteStatusFetchedAt: number;
  statusBarEnabled: boolean;
  showResources: boolean;
  showServerTime: boolean;
  clockTick: number;
  updateState: AutoUpdateState;
  onInstallUpdate: () => void;
  onRestartUpdate: () => void;
}

export function StatusBar({
  activeTab,
  remoteStatus,
  remoteStatusError,
  remoteStatusFetchedAt,
  statusBarEnabled,
  showResources,
  showServerTime,
  clockTick,
  updateState,
  onInstallUpdate,
  onRestartUpdate,
}: StatusBarProps) {
  const remoteUsers = (remoteStatus?.user_names ?? []).filter((name) => !!name);
  const localClock = buildLocalClock(statusBarEnabled, showServerTime, clockTick);
  const serverClock = buildServerClock({
    activeTab,
    remoteStatus,
    remoteStatusFetchedAt,
    statusBarEnabled,
    showServerTime,
    clockTick,
  });

  const cpuLevel = classifyPercent(remoteStatus?.cpu ?? null);
  const ramLevel = classifyPercent(remoteStatus?.ram ?? null);
  const diskLevel = classifyPercent(remoteStatus?.disk ?? null);
  const showSshResources = activeTab?.kind === "ssh" && statusBarEnabled && showResources;
  const showUpdateAction = updateState.phase === "available" || updateState.phase === "downloading" || updateState.phase === "installed";
  const updateProgress = formatUpdateProgress(updateState);

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className="status-pill">{activeTab?.kind === "ssh" ? "SSH" : "LOCAL"}</span>
        <span className="status-label">{activeTab?.title ?? "No active tab"}</span>
      </div>

      <div className="statusbar-right">
        {showSshResources ? (
          <span className={`status-metric status-${cpuLevel}`}>
            CPU {remoteStatus?.cpu !== null && remoteStatus?.cpu !== undefined ? `${remoteStatus.cpu.toFixed(0)}%` : "--"}
          </span>
        ) : null}

        {showSshResources ? (
          <span className={`status-metric status-${ramLevel}`}>
            RAM {remoteStatus?.ram !== null && remoteStatus?.ram !== undefined ? `${remoteStatus.ram.toFixed(0)}%` : "--"}
          </span>
        ) : null}

        {showSshResources ? (
          <span className={`status-metric status-${diskLevel}`}>
            Disk {remoteStatus?.disk !== null && remoteStatus?.disk !== undefined ? `${remoteStatus.disk.toFixed(0)}%` : "--"}
          </span>
        ) : null}

        {showSshResources ? (
          <div className="status-users-wrap">
            <span className="status-metric status-users-trigger">
              Users {remoteStatus?.users !== null && remoteStatus?.users !== undefined ? remoteStatus.users : "--"}
            </span>
            <div className="status-users-dropdown">
              {remoteUsers.length > 0 ? (
                remoteUsers.map((user, idx) => (
                  <div key={`${user}-${idx}`} className="status-users-item">
                    {user}
                  </div>
                ))
              ) : (
                <div className="status-users-item muted">No active users</div>
              )}
            </div>
          </div>
        ) : null}

        {localClock.visible ? (
          <span className="status-metric status-clock-local">
            Local {localClock.value}
          </span>
        ) : null}

        {serverClock.visible ? (
          <span className="status-metric status-clock-server">
            Server {serverClock.value}{serverClock.zone ? ` ${serverClock.zone}` : ""}
          </span>
        ) : null}

        {remoteStatusError ? <span className="status-metric status-danger">{remoteStatusError}</span> : null}

        {showUpdateAction ? (
          <button
            className={`status-metric status-update status-update-${updateState.phase}`}
            onClick={updateState.phase === "installed" ? onRestartUpdate : onInstallUpdate}
            disabled={updateState.phase === "downloading"}
            title={updateState.phase === "installed" ? "Restart to finish update" : "Install available update"}
          >
            {updateState.phase === "installed"
              ? "Restart"
              : updateState.phase === "downloading"
                ? `Update ${updateProgress || "..."}`
                : `Update ${updateState.latestVersion ?? ""}`}
          </button>
        ) : null}
      </div>
    </footer>
  );
}

function buildLocalClock(statusBarEnabled: boolean, showServerTime: boolean, _clockTick: number) {
  if (!statusBarEnabled || !showServerTime) {
    return { value: "", visible: false };
  }

  return {
    value: formatClock(new Date()),
    visible: true,
  };
}

function buildServerClock({
  activeTab,
  remoteStatus,
  remoteStatusFetchedAt,
  statusBarEnabled,
  showServerTime,
  clockTick: _clockTick,
}: Pick<StatusBarProps, "activeTab" | "remoteStatus" | "remoteStatusFetchedAt" | "statusBarEnabled" | "showServerTime" | "clockTick">) {
  if (!statusBarEnabled || !showServerTime) {
    return { value: "", zone: "", visible: false };
  }

  if (activeTab?.kind !== "ssh") {
    return { value: "", zone: "", visible: false };
  }

  const serverEpoch = remoteStatus?.server_time_epoch;
  if (serverEpoch === null || serverEpoch === undefined || !remoteStatusFetchedAt) {
    return { value: "--", zone: "", visible: true };
  }

  const elapsedSec = Math.max(0, Math.floor((Date.now() - remoteStatusFetchedAt) / 1000));
  const liveEpoch = serverEpoch + elapsedSec;
  const date = new Date(liveEpoch * 1000);
  const tz = remoteStatus?.server_tz ?? undefined;
  return {
    value: formatClock(date, tz),
    zone: tz ?? "",
    visible: true,
  };
}
