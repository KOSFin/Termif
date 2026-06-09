import { Download, RefreshCw, RotateCw, X } from "lucide-react";
import { formatUpdateProgress, type AutoUpdateState } from "@/features/update/useAutoUpdater";

interface UpdateBannerProps {
  updateState: AutoUpdateState;
  onInstall: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ updateState, onInstall, onRestart, onDismiss }: UpdateBannerProps) {
  if (updateState.dismissed) return null;
  if (updateState.phase !== "available" && updateState.phase !== "downloading" && updateState.phase !== "installed" && updateState.phase !== "error") {
    return null;
  }

  const isDownloading = updateState.phase === "downloading";
  const isInstalled = updateState.phase === "installed";
  const isError = updateState.phase === "error";
  const progress = formatUpdateProgress(updateState);

  const title = isInstalled
    ? "Update installed"
    : isDownloading
      ? "Installing update"
      : isError
        ? "Update failed"
        : "Update available";

  const meta = isError
    ? updateState.error
    : isInstalled
      ? "Restart Termif to finish"
      : isDownloading
        ? (progress ? `Downloading ${progress}` : "Downloading...")
        : `${updateState.currentVersion ?? "current"} -> ${updateState.latestVersion ?? "latest"}`;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-main">
        <span className="update-banner-title">{title}</span>
        <span className="update-banner-meta">{meta}</span>
      </div>
      {isInstalled ? (
        <button className="primary update-banner-action" onClick={onRestart}>
          <RotateCw size={13} strokeWidth={2} />
          <span>Restart</span>
        </button>
      ) : (
        <button className="primary update-banner-action" onClick={onInstall} disabled={isDownloading}>
          {isDownloading ? <RefreshCw size={13} strokeWidth={2} /> : <Download size={13} strokeWidth={2} />}
          <span>{isDownloading ? "Installing" : isError ? "Retry" : "Update"}</span>
        </button>
      )}
      {!isDownloading ? (
        <button className="ghost icon-btn update-banner-close" onClick={onDismiss} title="Dismiss">
          <X size={13} strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  );
}
