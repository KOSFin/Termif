import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";
import { OS_CACHE_KEY } from "@/features/ssh/SshHostPicker";
import type { OsInfo } from "@/features/ssh/SshHostPicker";
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
  onExitRequested?: () => void;
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
  onExitRequested,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const visibleRef = useRef<boolean>(isVisible);
  const inputBufferRef = useRef<string>("");
  const inputFlushTimerRef = useRef<number | undefined>();
  const commandLineRef = useRef<string>("");
  const exitCloseTimerRef = useRef<number | undefined>();

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
      allowTransparency: true,
      cursorBlink: true,
      cursorStyle: asCursorStyle(terminalSettings?.cursor_style),
      fontFamily: terminalSettings?.font_family ?? getDefaultTerminalFont(),
      fontSize: terminalSettings?.font_size ?? 13,
      letterSpacing: 0,
      lineHeight: 1.3,
      theme: buildXtermTheme(terminalSettings?.custom_colors),
      scrollback: terminalSettings?.scrollback_lines ?? 20_000,
      allowProposedApi: true,
      ignoreBracketedPasteMode: false,
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
      if (isSSH) {
        trackSshCommandForExit(data, commandLineRef, exitCloseTimerRef, onExitRequested);
      }
      queueTerminalInput(inputBufferRef, inputFlushTimerRef, sessionId, data, onConnectionError);
    };

    // Initial fit — defer one frame so the element dimensions are ready.
    requestAnimationFrame(resizeBackend);

    // Route browser paste through xterm so bracketed paste mode is respected.
    const onNativePaste = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const clipboardData = "clipboardData" in e
        ? (e as { clipboardData?: { getData: (format: string) => string } }).clipboardData
        : undefined;
      const text = clipboardData?.getData("text/plain") ?? "";
      if (text) xterm.paste(text);
    };
    el.addEventListener("paste", onNativePaste, true);

    const onWheel = (e: WheelEvent) => {
      const activeBuffer = xterm.buffer.active as unknown as { type?: string };
      if (activeBuffer.type !== "alternate") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });

    // ── Custom key handler for copy/paste ────────────────────────────────────
    xterm.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const navigation = getPlainNavigationSequence(e);
      if (navigation && e.type === "keydown") {
        queueInput(navigation);
        return false;
      }

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

      // macOS: let the native paste event fire; it carries clipboard data
      // without triggering the WebView clipboard permission popover.
      if (isMacLike && e.type === "keydown" && e.metaKey && e.code === "KeyV") {
        return true;
      }

      // Ctrl+Shift+C → copy selected text
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
        return false;
      }

      // Ctrl+V → let the native paste event fire.
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.code === "KeyV") {
        return true;
      }

      // Ctrl+Shift+V → let the native paste event fire.
      if (!isMacLike && e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyV") {
        return true;
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

      const displayChunk = preserveScrollbackOnClear(chunk);
      xtermRef.current?.write(displayChunk);

      // Buffer first 4000 chars for OS detection
      if (isSSH && sshAlias && !osDetectedRef.current) {
        outputBufferRef.current += displayChunk;
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
      el.removeEventListener("wheel", onWheel, true);
      dataListener.dispose();
      resizeObserver.disconnect();
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      if (exitCloseTimerRef.current !== undefined) window.clearTimeout(exitCloseTimerRef.current);
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
    xterm.options.theme = buildXtermTheme(terminalSettings?.custom_colors);

    const fit = fitRef.current;
    if (fit) safeFit(fit);
  }, [terminalSettings]);

  const customColorsRef = useRef(terminalSettings?.custom_colors);
  customColorsRef.current = terminalSettings?.custom_colors;

  useEffect(() => {
    const applyTheme = () => {
      const xterm = xtermRef.current;
      if (!xterm) return;
      xterm.options.theme = buildXtermTheme(customColorsRef.current);
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
  }, []);

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

function trackSshCommandForExit(
  data: string,
  commandLineRef: MutableRefObject<string>,
  timerRef: MutableRefObject<number | undefined>,
  onExitRequested?: () => void,
) {
  for (const char of data) {
    if (char === "\r" || char === "\n") {
      const command = commandLineRef.current.trim();
      commandLineRef.current = "";
      if (command === "exit" || command === "logout") {
        if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = undefined;
          onExitRequested?.();
        }, 180);
      }
      continue;
    }

    if (char === "\x03") {
      commandLineRef.current = "";
      continue;
    }

    if (char === "\x7f" || char === "\b") {
      commandLineRef.current = commandLineRef.current.slice(0, -1);
      continue;
    }

    if (char >= " " && char !== "\x7f") {
      commandLineRef.current += char;
    }
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

function getPlainNavigationSequence(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;

  if (e.code === "Tab") {
    return e.shiftKey ? "\x1b[Z" : "\t";
  }

  if (e.shiftKey) return null;

  const sequences: Record<string, string> = {
    ArrowLeft: "\x1b[D",
    ArrowRight: "\x1b[C",
    ArrowUp: "\x1b[A",
    ArrowDown: "\x1b[B",
    Home: "\x1b[H",
    End: "\x1b[F",
    PageUp: "\x1b[5~",
    PageDown: "\x1b[6~",
  };

  return sequences[e.code] ?? null;
}

function preserveScrollbackOnClear(chunk: string): string {
  return chunk.split("\x1b[3J").join("");
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

function buildXtermTheme(customColors?: Record<string, string>) {
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
  const transparentBackground = "rgba(0, 0, 0, 0)";

  return {
    background: transparentBackground,
    foreground: c.foreground ?? text,
    cursor: c.cursor ?? accent,
    cursorAccent: c.cursorAccent ?? bg,
    selectionBackground: c.selectionBackground ?? c.selection ?? colorMixFallback(bgHover, accent, 0.18),
    selectionForeground: c.selectionForeground ?? textBright,
    black: c.black ?? pickAnsiBlack(bg),
    brightBlack: c.brightBlack ?? pickAnsiBrightBlack(textMuted),
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

function pickAnsiBlack(bg: string) {
  return isLightHex(bg) ? "#2f2b26" : bg;
}

function pickAnsiBrightBlack(textMuted: string) {
  return isLightHex(readCssVar("--bg", "#1a1d23")) ? "#6e6258" : textMuted;
}

function isLightHex(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 180;
}

function colorMixFallback(base: string, accent: string, alpha: number) {
  return `color-mix(in srgb, ${accent} ${Math.round(alpha * 100)}%, ${base})`;
}
