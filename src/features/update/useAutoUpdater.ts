import { useCallback, useEffect, useRef, useState } from "react";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const DISMISSED_KEY = "termif.update.dismissed_version";
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installed"
  | "error";

export interface AutoUpdateState {
  phase: UpdatePhase;
  currentVersion?: string;
  latestVersion?: string;
  body?: string;
  date?: string;
  downloadedBytes: number;
  totalBytes?: number;
  error?: string;
  dismissed: boolean;
}

const idleState: AutoUpdateState = {
  phase: "idle",
  downloadedBytes: 0,
  dismissed: false,
};

export function useAutoUpdater() {
  const [state, setState] = useState<AutoUpdateState>(idleState);
  const updateRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async (manual = false) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setState((prev) => ({
      ...prev,
      phase: "checking",
      error: undefined,
      dismissed: manual ? false : prev.dismissed,
    }));

    try {
      const update = await check({ timeout: 15_000 });
      updateRef.current = update;

      if (!update) {
        setState({
          phase: "idle",
          downloadedBytes: 0,
          dismissed: false,
        });
        return;
      }

      const dismissed = !manual && localStorage.getItem(DISMISSED_KEY) === update.version;
      setState({
        phase: "available",
        currentVersion: update.currentVersion,
        latestVersion: update.version,
        body: update.body,
        date: update.date,
        downloadedBytes: 0,
        totalBytes: undefined,
        dismissed,
      });
    } catch (error) {
      updateRef.current = null;
      const message = error instanceof Error ? error.message : String(error);
      if (isUpdaterUnavailableError(message)) {
        setState({
          phase: "idle",
          downloadedBytes: 0,
          dismissed: false,
        });
        return;
      }
      setState({
        phase: "error",
        downloadedBytes: 0,
        dismissed: false,
        error: message,
      });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setState((prev) => {
      if (prev.latestVersion) {
        localStorage.setItem(DISMISSED_KEY, prev.latestVersion);
      }
      return { ...prev, dismissed: true };
    });
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      await checkForUpdate(true);
      return;
    }

    let downloadedBytes = 0;
    setState((prev) => ({
      ...prev,
      phase: "downloading",
      downloadedBytes: 0,
      totalBytes: undefined,
      error: undefined,
      dismissed: false,
    }));

    const onEvent = (event: DownloadEvent) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        setState((prev) => ({
          ...prev,
          downloadedBytes: 0,
          totalBytes: event.data.contentLength,
        }));
        return;
      }

      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        setState((prev) => ({
          ...prev,
          downloadedBytes,
        }));
        return;
      }

      if (event.event === "Finished") {
        setState((prev) => ({
          ...prev,
          downloadedBytes: prev.totalBytes ?? downloadedBytes,
        }));
      }
    };

    try {
      await update.downloadAndInstall(onEvent);
      setState((prev) => ({
        ...prev,
        phase: "installed",
        downloadedBytes: prev.totalBytes ?? prev.downloadedBytes,
        dismissed: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [checkForUpdate]);

  const restart = useCallback(async () => {
    await relaunch();
  }, []);

  useEffect(() => {
    void checkForUpdate(false);
    const timer = window.setInterval(() => {
      void checkForUpdate(false);
    }, AUTO_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkForUpdate]);

  return {
    updateState: state,
    checkForUpdate,
    dismissUpdate: dismiss,
    installUpdate: install,
    restartForUpdate: restart,
  };
}

export function formatUpdateProgress(state: AutoUpdateState): string {
  if (state.phase !== "downloading") return "";
  if (!state.totalBytes) return formatBytes(state.downloadedBytes);
  const pct = Math.max(0, Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)));
  return `${pct}%`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isUpdaterUnavailableError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("updater")
    && (
      lower.includes("not configured")
      || lower.includes("not active")
      || lower.includes("no endpoints")
      || lower.includes("missing updater")
      || lower.includes("plugin not found")
    );
}
