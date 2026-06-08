import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { memo, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { OS_CACHE_KEY } from "@/features/ssh/SshHostPicker";
import type { OsInfo } from "@/features/ssh/SshHostPicker";
import { TERMINAL_COLOR_SCHEMES } from "@/app/settings/TerminalPreview";
import { getDefaultTerminalFont, isMacLike } from "@/platform/platform";

interface TerminalVisualSettings {
  font_family: string;
  font_size: number;
  cursor_style: string;
  scrollback_lines: number;
  syntax_highlighting?: boolean;
  color_scheme?: string;
  custom_colors?: Record<string, string>;
}

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
  /** SSH alias — when set, shows a "Connecting…" overlay until first output. */
  sshAlias?: string;
  /** Shell profile for local tabs (e.g. "powershell", "cmd", "pwsh"). */
  shellProfile?: string;
  terminalSettings?: TerminalVisualSettings;
  disconnectedReason?: string;
  reconnecting?: boolean;
  onConnectionError?: (message: string) => void;
  onReconnect?: () => void;
}

// OS detection patterns
const OS_PATTERNS: Array<{ pattern: RegExp; os: string; versionPattern?: RegExp }> = [
  { pattern: /ubuntu/i,    os: "ubuntu",  versionPattern: /ubuntu[^\d]*(\d+\.\d+)/i },
  { pattern: /debian/i,    os: "debian",  versionPattern: /debian[^\d]*(\d+)/i },
  { pattern: /centos/i,    os: "centos",  versionPattern: /centos[^\d]*(\d+)/i },
  { pattern: /fedora/i,    os: "fedora",  versionPattern: /fedora[^\d]*(\d+)/i },
  { pattern: /arch linux/i,os: "arch" },
  { pattern: /alpine/i,    os: "alpine",  versionPattern: /alpine[^\d]*(\d+\.\d+)/i },
  { pattern: /red hat/i,   os: "rhel",    versionPattern: /release[^\d]*(\d+)/i },
  { pattern: /rocky/i,     os: "rocky",   versionPattern: /rocky[^\d]*(\d+)/i },
  { pattern: /freebsd/i,   os: "freebsd", versionPattern: /freebsd[^\d]*(\d+\.\d+)/i },
  { pattern: /microsoft/i, os: "windows" },
  { pattern: /windows/i,   os: "windows" },
];

function detectOsFromOutput(text: string): OsInfo | null {
  for (const { pattern, os, versionPattern } of OS_PATTERNS) {
    if (pattern.test(text)) {
      let version: string | undefined;
      if (versionPattern) {
        const match = text.match(versionPattern);
        if (match) version = match[1];
      }
      return { os, version };
    }
  }
  return null;
}

function saveOsToCache(alias: string, info: OsInfo) {
  try {
    const raw = localStorage.getItem(OS_CACHE_KEY);
    const cache: Record<string, OsInfo> = raw ? (JSON.parse(raw) as Record<string, OsInfo>) : {};
    if (cache[alias]?.os === info.os) return; // already cached
    cache[alias] = info;
    localStorage.setItem(OS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export const TerminalPane = memo(function TerminalPane({
  sessionId,
  isVisible,
  sshAlias,
  shellProfile: _shellProfile,
  terminalSettings,
  disconnectedReason,
  reconnecting,
  onConnectionError,
  onReconnect,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const visibleRef = useRef<boolean>(isVisible);
  const inputBufferRef = useRef<string>("");
  const inputFlushTimerRef = useRef<number | undefined>();

  const [connecting, setConnecting] = useState<boolean>(!!sshAlias);
  const connectingRef = useRef<boolean>(!!sshAlias);
  const osDetectedRef = useRef<boolean>(false);
  const outputBufferRef = useRef<string>("");

  useEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  // ── Mount / session-change effect ───────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isSSH = !!sshAlias;
    connectingRef.current = isSSH;
    setConnecting(isSSH);
    osDetectedRef.current = false;
    outputBufferRef.current = "";

    const xterm = new Terminal({
      cursorBlink: true,
      cursorStyle: asCursorStyle(terminalSettings?.cursor_style),
      fontFamily: terminalSettings?.font_family ?? getDefaultTerminalFont(),
      fontSize: terminalSettings?.font_size ?? 13,
      letterSpacing: 0,
      lineHeight: 1.3,
      theme: buildXtermTheme(terminalSettings?.color_scheme, terminalSettings?.custom_colors),
      scrollback: terminalSettings?.scrollback_lines ?? 20_000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(el);

    xtermRef.current = xterm;
    fitRef.current = fitAddon;

    const resizeBackend = () => {
      if (!fitRef.current || !xtermRef.current) return;
      safeFit(fitRef.current);
      void invoke("resize_terminal", {
        sessionId,
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      });
    };

    let resizeTimer: number | undefined;
    const scheduleResizeBackend = () => {
      if (resizeTimer !== undefined) return;
      resizeTimer = window.setTimeout(() => {
        resizeTimer = undefined;
        resizeBackend();
      }, 60);
    };

    const queueInput = (data: string) => {
      queueTerminalInput(inputBufferRef, inputFlushTimerRef, sessionId, data, onConnectionError);
    };

    // Initial fit — defer one frame so the element dimensions are ready.
    requestAnimationFrame(resizeBackend);

    // ── Block native paste so xterm.onData doesn't double-fire ────────────
    const onNativePaste = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    el.addEventListener("paste", onNativePaste, true);

    // ── Custom key handler for copy/paste ────────────────────────────────────
    xterm.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === "keydown" && e.code === "Backspace" && !e.metaKey && !e.altKey) {
        queueInput("\x7f");
        return false;
      }

      if (e.type === "keydown" && e.code === "Delete" && !e.metaKey && !e.altKey) {
        queueInput("\x1b[3~");
        return false;
      }

      // macOS: Cmd+C copies selected text and never sends ^C to the shell.
      if (isMacLike && e.type === "keydown" && e.metaKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
        return false;
      }

      // macOS: Cmd+V pastes from the system clipboard.
      if (isMacLike && e.type === "keydown" && e.metaKey && e.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          if (text) queueInput(text);
        }).catch(() => {});
        return false;
      }

      // Ctrl+Shift+C → copy selected text
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
        return false;
      }

      // Ctrl+V → paste from clipboard
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          if (text) queueInput(text);
        }).catch(() => {});
        return false;
      }

      // Ctrl+Shift+V → paste from clipboard (alternative shortcut)
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          if (text) queueInput(text);
        }).catch(() => {});
        return false;
      }

      // Ctrl+C with selection → copy, clear selection, don't send ^C interrupt
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {});
          xterm.clearSelection();
          return false;
        }
        return true; // no selection → let ^C through as interrupt
      }

      return true;
    });

    // Forward keyboard/paste input to the PTY.
    const dataListener = xterm.onData((data) => {
      queueInput(data);
    });

    // ── Push-based output via Tauri Channel ─────────────────────────────────
    const channel = new Channel<string>();
    channel.onmessage = (chunk) => {
      if (connectingRef.current) {
        connectingRef.current = false;
        setConnecting(false);
      }

      xtermRef.current?.write(chunk);

      // Buffer first 4000 chars for OS detection
      if (isSSH && sshAlias && !osDetectedRef.current) {
        outputBufferRef.current += chunk;
        if (outputBufferRef.current.length > 4000) {
          outputBufferRef.current = outputBufferRef.current.slice(0, 4000);
        }
      }
    };

    void invoke("stream_terminal_output", { sessionId, onData: channel });

    if (isSSH) {
      // OS detection — scan buffered output after initial shell loads
      if (sshAlias) {
        window.setTimeout(() => {
          if (!osDetectedRef.current && outputBufferRef.current) {
            const info = detectOsFromOutput(outputBufferRef.current);
            if (info) {
              osDetectedRef.current = true;
              saveOsToCache(sshAlias, info);
            }
          }
        }, 3000);
      }
    }

    // ── Resize observer ──────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      if (!xtermRef.current || !fitRef.current) return;
      if (!visibleRef.current) return;
      scheduleResizeBackend();
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("paste", onNativePaste, true);
      dataListener.dispose();
      resizeObserver.disconnect();
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      flushTerminalInput(inputBufferRef, inputFlushTimerRef, sessionId, onConnectionError);
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  // sshAlias intentionally excluded — re-mounting for alias changes not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    xterm.options.cursorStyle = asCursorStyle(terminalSettings?.cursor_style);
    xterm.options.fontFamily = terminalSettings?.font_family ?? getDefaultTerminalFont();
    xterm.options.fontSize = terminalSettings?.font_size ?? 13;
    xterm.options.letterSpacing = 0;
    xterm.options.scrollback = terminalSettings?.scrollback_lines ?? 20_000;
    xterm.options.theme = buildXtermTheme(terminalSettings?.color_scheme, terminalSettings?.custom_colors);

    const fit = fitRef.current;
    if (fit) safeFit(fit);
  }, [terminalSettings]);

  const colorSchemeRef = useRef(terminalSettings?.color_scheme);
  colorSchemeRef.current = terminalSettings?.color_scheme;

  useEffect(() => {
    const applyTheme = () => {
      const xterm = xtermRef.current;
      if (!xterm) return;
        xterm.options.theme = buildXtermTheme(colorSchemeRef.current, terminalSettings?.custom_colors);
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === "data-theme" || m.attributeName === "style")) {
        applyTheme();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });

    return () => observer.disconnect();
  }, [terminalSettings?.custom_colors]);

  // ── Visibility-change effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fit = fitRef.current;
        const xterm = xtermRef.current;
        if (!fit || !xterm) return;
        safeFit(fit);
        void invoke("resize_terminal", {
          sessionId,
          cols: xterm.cols,
          rows: xterm.rows,
        });
        xterm.focus();
      });
    });
  }, [isVisible, sessionId]);

  return (
    <div
      className={`terminal-pane-wrap${isVisible ? " active" : ""}`}
      style={{ "--terminal-bg": getTerminalBackground(terminalSettings?.color_scheme, terminalSettings?.custom_colors) } as CSSProperties}
    >
      <div className="terminal-pane">
        <div className="terminal-pane-inner" ref={containerRef} />
      </div>

      {connecting && (
        <div className="terminal-connecting">
          <div className="terminal-connecting-inner">
            <div className="terminal-connecting-spinner" />
            <span>Connecting to <strong>{sshAlias}</strong>…</span>
          </div>
        </div>
      )}

      {disconnectedReason ? (
        <div className="terminal-connecting terminal-disconnected">
          <div className="terminal-connecting-inner">
            <div className="terminal-connecting-spinner" />
            <span>Connection lost: <strong>{sshAlias ?? "remote host"}</strong></span>
            <span className="terminal-disconnect-reason">{disconnectedReason}</span>
            <button className="primary" onClick={onReconnect} disabled={reconnecting}>
              {reconnecting ? "Reconnecting..." : "Reconnect"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function safeFit(fit: FitAddon) {
  try {
    const dims = fit.proposeDimensions();
    if (dims && dims.cols > 0 && dims.rows > 0) {
      fit.fit();
    }
  } catch {
    // Ignore
  }
}

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function asCursorStyle(value?: string): "bar" | "block" | "underline" {
  if (value === "block" || value === "underline") return value;
  return "bar";
}

async function sendTerminalInput(
  sessionId: string,
  data: string,
  onConnectionError?: (message: string) => void,
) {
  try {
    await invoke("send_terminal_input", { sessionId, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onConnectionError?.(message);
  }
}

function queueTerminalInput(
  bufferRef: MutableRefObject<string>,
  timerRef: MutableRefObject<number | undefined>,
  sessionId: string,
  data: string,
  onConnectionError?: (message: string) => void,
) {
  bufferRef.current += data;

  if (timerRef.current !== undefined) {
    if (bufferRef.current.length < 4096 && !data.includes("\r")) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }

  if (bufferRef.current.length >= 4096 || data.includes("\r")) {
    flushTerminalInput(bufferRef, timerRef, sessionId, onConnectionError);
    return;
  }

  timerRef.current = window.setTimeout(() => {
    flushTerminalInput(bufferRef, timerRef, sessionId, onConnectionError);
  }, 4);
}

function flushTerminalInput(
  bufferRef: MutableRefObject<string>,
  timerRef: MutableRefObject<number | undefined>,
  sessionId: string,
  onConnectionError?: (message: string) => void,
) {
  if (timerRef.current !== undefined) {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }
  const data = bufferRef.current;
  if (!data) return;
  bufferRef.current = "";
  void sendTerminalInput(sessionId, data, onConnectionError);
}

function getTerminalBackground(colorSchemeId?: string, customColors?: Record<string, string>) {
  const scheme = TERMINAL_COLOR_SCHEMES.find((s) => s.id === colorSchemeId);
  return customColors?.background ?? scheme?.colors.background ?? readCssVar("--bg", "#1a1d23");
}

function buildXtermTheme(colorSchemeId?: string, customColors?: Record<string, string>) {
  const scheme = TERMINAL_COLOR_SCHEMES.find((s) => s.id === colorSchemeId);
  if (scheme) {
    const c = { ...scheme.colors, ...(customColors ?? {}) };
    return {
      background: c.background,
      foreground: c.foreground,
      cursor: c.cursor,
      cursorAccent: c.background,
      selectionBackground: c.selection,
      black: c.black,
      brightBlack: c.brightBlack,
      red: c.red,
      brightRed: c.brightRed,
      green: c.green,
      brightGreen: c.brightGreen,
      yellow: c.yellow,
      brightYellow: c.brightYellow,
      blue: c.blue,
      brightBlue: c.brightBlue,
      magenta: c.magenta,
      brightMagenta: c.brightMagenta,
      cyan: c.cyan,
      brightCyan: c.brightCyan,
      white: c.white,
      brightWhite: c.brightWhite,
    };
  }

  // Fallback: derive from CSS variables
  const bg = readCssVar("--bg", "#1a1d23");
  const bgElev = readCssVar("--bg-elev-1", "#21252b");
  const bgHover = readCssVar("--bg-hover", "#2c313a");
  const text = readCssVar("--text", "#abb2bf");
  const textBright = readCssVar("--text-bright", "#e6e8ee");
  const textMuted = readCssVar("--text-muted", "#636d83");
  const accent = readCssVar("--accent", "#61afef");
  const accent2 = readCssVar("--accent-2", "#98c379");
  const danger = readCssVar("--danger", "#e06c75");
  const warning = readCssVar("--warning", "#e5c07b");
  const c = customColors ?? {};

  return {
    background: c.background ?? bg,
    foreground: c.foreground ?? text,
    cursor: c.cursor ?? accent,
    cursorAccent: c.background ?? bg,
    selectionBackground: c.selection ?? bgHover,
    black: c.black ?? bg,
    brightBlack: c.brightBlack ?? textMuted,
    red: c.red ?? danger,
    brightRed: c.brightRed ?? "#ff7a8c",
    green: c.green ?? accent2,
    brightGreen: c.brightGreen ?? "#b5e890",
    yellow: c.yellow ?? warning,
    brightYellow: c.brightYellow ?? "#f5c06a",
    blue: c.blue ?? accent,
    brightBlue: c.brightBlue ?? "#7ec8ff",
    magenta: c.magenta ?? "#c678dd",
    brightMagenta: c.brightMagenta ?? "#d896f0",
    cyan: c.cyan ?? "#56b6c2",
    brightCyan: c.brightCyan ?? "#82ccdf",
    white: c.white ?? text,
    brightWhite: c.brightWhite ?? textBright,
    extendedAnsi: [bgElev],
  };
}
