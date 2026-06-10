import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";
import { OS_CACHE_KEY } from "@/features/ssh/SshHostPicker";
import type { OsInfo } from "@/features/ssh/SshHostPicker";
import { getDefaultTerminalFont, isMacLike } from "@/platform/platform";
import { appendTerminalLog, loadTerminalLog } from "@/features/terminal/terminalLogStore";

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
  tabId: string;
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
  tabId,
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
  const logBufferRef = useRef<string>("");
  const logFlushTimerRef = useRef<number | undefined>();

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

    const restoredLog = loadTerminalLog(tabId);
    if (restoredLog) {
      xterm.write(restoredLog);
    }

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
      queueTerminalLog(tabId, logBufferRef, logFlushTimerRef, displayChunk);

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
      clearTimerRef(exitCloseTimerRef);
      flushTerminalLog(tabId, logBufferRef, logFlushTimerRef);
      flushTerminalInput(inputBufferRef, inputFlushTimerRef, sessionId, onConnectionError);
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  // sshAlias intentionally excluded — re-mounting for alias changes not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, tabId]);

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

function clearTimerRef(timerRef: MutableRefObject<number | undefined>) {
  if (timerRef.current === undefined) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = undefined;
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
        clearTimerRef(timerRef);
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

function queueTerminalLog(
  tabId: string,
  bufferRef: MutableRefObject<string>,
  timerRef: MutableRefObject<number | undefined>,
  chunk: string,
) {
  bufferRef.current += chunk;

  if (bufferRef.current.length > 12_000) {
    flushTerminalLog(tabId, bufferRef, timerRef);
    return;
  }

  if (timerRef.current !== undefined) return;
  timerRef.current = window.setTimeout(() => {
    flushTerminalLog(tabId, bufferRef, timerRef);
  }, 250);
}

function flushTerminalLog(
  tabId: string,
  bufferRef: MutableRefObject<string>,
  timerRef: MutableRefObject<number | undefined>,
) {
  if (timerRef.current !== undefined) {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }
  const data = bufferRef.current;
  if (!data) return;
  bufferRef.current = "";
  appendTerminalLog(tabId, data);
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
  const lightTheme = isLightColor(bg);
  const lightAnsi = {
    foreground: "#1f1a16",
    cursor: "#1f1a16",
    black: "#201c18",
    brightBlack: "#6f675e",
    red: "#9f1d30",
    brightRed: "#c5223b",
    green: "#256f47",
    brightGreen: "#1f8a50",
    yellow: "#7c5f00",
    brightYellow: "#946f00",
    blue: "#075f91",
    brightBlue: "#0873ad",
    magenta: "#7a3f91",
    brightMagenta: "#954caf",
    cyan: "#0f6c78",
    brightCyan: "#0d8190",
    white: "#3f3933",
    brightWhite: "#11100e",
  };
  const foreground = lightTheme ? lightAnsi.foreground : text;
  const cursor = lightTheme ? lightAnsi.cursor : accent;

  return {
    background: transparentBackground,
    foreground: readableColor(c.foreground, bg, foreground),
    cursor: readableColor(c.cursor, bg, cursor),
    cursorAccent: c.cursorAccent ?? bg,
    selectionBackground: c.selectionBackground ?? c.selection ?? colorMixFallback(bgHover, accent, 0.18),
    selectionForeground: readableColor(c.selectionForeground, bg, lightTheme ? lightAnsi.brightWhite : textBright),
    black: c.black ?? (lightTheme ? lightAnsi.black : pickAnsiBlack(bg)),
    brightBlack: c.brightBlack ?? (lightTheme ? lightAnsi.brightBlack : pickAnsiBrightBlack(textMuted)),
    red: c.red ?? (lightTheme ? lightAnsi.red : danger),
    brightRed: c.brightRed ?? (lightTheme ? lightAnsi.brightRed : "#ff7a8c"),
    green: c.green ?? (lightTheme ? lightAnsi.green : accent2),
    brightGreen: c.brightGreen ?? (lightTheme ? lightAnsi.brightGreen : "#b5e890"),
    yellow: c.yellow ?? (lightTheme ? lightAnsi.yellow : warning),
    brightYellow: c.brightYellow ?? (lightTheme ? lightAnsi.brightYellow : "#f5c06a"),
    blue: c.blue ?? (lightTheme ? lightAnsi.blue : accent),
    brightBlue: c.brightBlue ?? (lightTheme ? lightAnsi.brightBlue : "#7ec8ff"),
    magenta: c.magenta ?? (lightTheme ? lightAnsi.magenta : "#c678dd"),
    brightMagenta: c.brightMagenta ?? (lightTheme ? lightAnsi.brightMagenta : "#d896f0"),
    cyan: c.cyan ?? (lightTheme ? lightAnsi.cyan : "#56b6c2"),
    brightCyan: c.brightCyan ?? (lightTheme ? lightAnsi.brightCyan : "#82ccdf"),
    white: readableColor(c.white, bg, lightTheme ? lightAnsi.white : text),
    brightWhite: readableColor(c.brightWhite, bg, lightTheme ? lightAnsi.brightWhite : textBright),
    extendedAnsi: [bgElev],
  };
}

function pickAnsiBlack(bg: string) {
  return isLightHex(bg) ? "#2f2b26" : bg;
}

function pickAnsiBrightBlack(textMuted: string) {
  return isLightHex(readCssVar("--bg", "#1a1d23")) ? "#6e6258" : textMuted;
}

function readableColor(preferred: string | undefined, background: string, fallback: string, minRatio = 4.5) {
  if (!preferred) return fallback;
  const ratio = contrastRatio(preferred, background);
  if (ratio === null) return preferred;
  return ratio >= minRatio ? preferred : fallback;
}

function contrastRatio(foreground: string, background: string) {
  const bg = parseCssColor(background);
  const fg = parseCssColor(foreground);
  if (!fg || !bg) return null;

  const blendedFg = fg.a < 1 ? blendColor(fg, bg) : fg;
  const fgLum = relativeLuminance(blendedFg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseCssColor(value: string) {
  const normalized = value.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3
      ? hex.split("").map((part) => `${part}${part}`).join("")
      : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(Number);
  const a = parts[3] === undefined ? 1 : Number(parts[3]);
  if ([r, g, b, a].some((part) => Number.isNaN(part))) return null;
  return { r, g, b, a };
}

function blendColor(
  foreground: { r: number; g: number; b: number; a: number },
  background: { r: number; g: number; b: number; a: number },
) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: 1,
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightHex(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 180;
}

function isLightColor(value: string) {
  const normalized = value.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3
      ? hex.split("").map((part) => `${part}${part}`).join("")
      : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 180;
  }
  return false;
}

function colorMixFallback(base: string, accent: string, alpha: number) {
  return `color-mix(in srgb, ${accent} ${Math.round(alpha * 100)}%, ${base})`;
}
