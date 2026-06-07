import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { checkForGitHubUpdate, isUpdateCheckConfigured, type UpdateInfo } from "@/features/update/updateChecker";

const DISMISSED_KEY = "termif.update.dismissed_version";

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isUpdateCheckConfigured()) return;

    let disposed = false;
    setChecking(true);

    void checkForGitHubUpdate()
      .then((info) => {
        if (disposed || !info) return;
        if (localStorage.getItem(DISMISSED_KEY) === info.latestVersion) return;
        setUpdate(info);
      })
      .catch(() => {
        // Update checks should never interrupt the terminal workspace.
      })
      .finally(() => {
        if (!disposed) setChecking(false);
      });

    return () => {
      disposed = true;
    };
  }, []);

  if (!update) return null;

  const openRelease = () => {
    const popup = window.open(update.releaseUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      void navigator.clipboard.writeText(update.releaseUrl).catch(() => {});
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, update.latestVersion);
    setUpdate(null);
  };

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-main">
        <span className="update-banner-title">Update available</span>
        <span className="update-banner-meta">
          {update.currentVersion} {"->"} {update.latestVersion}
          {checking ? " checking..." : ""}
        </span>
      </div>
      <button className="primary update-banner-action" onClick={openRelease}>
        <ExternalLink size={13} strokeWidth={2} />
        <span>Update</span>
      </button>
      <button className="ghost icon-btn update-banner-close" onClick={dismiss} title="Dismiss">
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}
