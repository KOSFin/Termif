import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { memo, useEffect, useRef, useState } from "react";
import { OS_CACHE_KEY } from "@/features/ssh/SshHostPicker";
import type { OsInfo } from "@/features/ssh/SshHostPicker";

interface TerminalVisualSettings {
  font_family: string;
  font_size: number;
  cursor_style: string;
  scrollback_lines: number;
  syntax_highlighting?: boolean;
}

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
  /** SSH alias — when set, shows a "Connecting…" overlay until first output. */
  sshAlias?: string;
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

  const [connecting, setConnecting] = useState<boolean>(!!sshAlias);
  const connectingRef = useRef<boolean>(!!sshAlias);
  const syntaxBootstrapSentRef = useRef<boolean>(false);
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
    syntaxBootstrapSentRef.current = false;
    osDetectedRef.current = false;
    outputBufferRef.current = "";

    const xterm = new Terminal({
      cursorBlink: true,
      cursorStyle: asCursorStyle(terminalSettings?.cursor_style),
      fontFamily: terminalSettings?.font_family ?? "Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace",
      fontSize: terminalSettings?.font_size ?? 13,
      lineHeight: 1.3,
      theme: buildXtermTheme(),
      scrollback: terminalSettings?.scrollback_lines ?? 20_000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(el);

    xtermRef.current = xterm;
    fitRef.current = fitAddon;

    // Initial fit — defer one frame so the element dimensions are ready.
    requestAnimationFrame(() => {
      if (!fitRef.current || !xtermRef.current) return;
      safeFit(fitRef.current);
      void invoke("resize_terminal", {
        sessionId,
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      });
    });

    // ── Custom key handler for copy/paste ────────────────────────────────────
    xterm.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Ctrl+Shift+C → copy selected text
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {});
        }
        return false; // prevent propagation
      }

      // Ctrl+Shift+V → paste from clipboard
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && e.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            void invoke("send_terminal_input", { sessionId, data: text }).catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              onConnectionError?.(message);
            });
          }
        }).catch(() => {});
        return false;
      }

      // Ctrl+C when text is selected → copy (don't send interrupt)
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.code === "KeyC") {
        const selection = xterm.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {});
          xterm.clearSelection();
          return false; // prevent sending ^C to PTY
        }
        // No selection: let ^C pass through as interrupt
        return true;
      }

      // Ctrl+V → paste from clipboard
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            void invoke("send_terminal_input", { sessionId, data: text }).catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              onConnectionError?.(message);
            });
          }
        }).catch(() => {});
        return false;
      }

      return true;
    });

    // Forward keyboard/paste input to the PTY.
    const dataListener = xterm.onData((data) => {
      void invoke("send_terminal_input", { sessionId, data }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        onConnectionError?.(message);
      });
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

    // ── SSH syntax highlighting bootstrap (always for SSH sessions) ──────────
    if (isSSH) {
      window.setTimeout(() => {
        if (syntaxBootstrapSentRef.current) return;
        syntaxBootstrapSentRef.current = true;
        const initScript = "export TERM=xterm-256color; export CLICOLOR=1; export COLORTERM=truecolor; alias ls='ls --color=auto' 2>/dev/null || alias ls='ls -G' 2>/dev/null; true\r";
        void invoke("send_terminal_input", { sessionId, data: initScript }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          onConnectionError?.(message);
        });
      }, 300);

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
      safeFit(fitRef.current);
      void invoke("resize_terminal", {
        sessionId,
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      });
    });
    resizeObserver.observe(el);

    return () => {
      dataListener.dispose();
      resizeObserver.disconnect();
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
    xterm.options.fontFamily = terminalSettings?.font_family ?? "Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace";
    xterm.options.fontSize = terminalSettings?.font_size ?? 13;
    xterm.options.scrollback = terminalSettings?.scrollback_lines ?? 20_000;

    const fit = fitRef.current;
    if (fit) safeFit(fit);
  }, [terminalSettings]);

  useEffect(() => {
    const applyTheme = () => {
      const xterm = xtermRef.current;
      if (!xterm) return;
      xterm.options.theme = buildXtermTheme();
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
    <div className={`terminal-pane-wrap${isVisible ? " active" : ""}`}>
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

function buildXtermTheme() {
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

  return {
    background: bg,
    foreground: text,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: bgHover,
    black: bg,
    brightBlack: textMuted,
    red: danger,
    brightRed: "#ff7a8c",
    green: accent2,
    brightGreen: "#b5e890",
    yellow: warning,
    brightYellow: "#f5c06a",
    blue: accent,
    brightBlue: "#7ec8ff",
    magenta: "#c678dd",
    brightMagenta: "#d896f0",
    cyan: "#56b6c2",
    brightCyan: "#82ccdf",
    white: text,
    brightWhite: textBright,
    extendedAnsi: [bgElev],
  };
}
