import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { memo, useEffect, useRef, useState } from "react";

interface TerminalVisualSettings {
  font_family: string;
  font_size: number;
  cursor_style: string;
  scrollback_lines: number;
}

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
  /** SSH alias — when set, shows a "Connecting…" overlay until first output. */
  sshAlias?: string;
  terminalSettings?: TerminalVisualSettings;
}

export const TerminalPane = memo(function TerminalPane({
  sessionId,
  isVisible,
  sshAlias,
  terminalSettings
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const visibleRef = useRef<boolean>(isVisible);

  // Show connecting overlay for SSH sessions until the first byte of output arrives.
  const [connecting, setConnecting] = useState<boolean>(!!sshAlias);
  const connectingRef = useRef<boolean>(!!sshAlias);

  useEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  // ── Mount / session-change effect ───────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Reset connecting state when a new SSH session starts.
    const isSSH = !!sshAlias;
    connectingRef.current = isSSH;
    setConnecting(isSSH);

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

    // Forward keyboard/paste input to the PTY.
    const dataListener = xterm.onData((data) => {
      void invoke("send_terminal_input", { sessionId, data });
    });

    // ── Push-based output via Tauri Channel ─────────────────────────────────
    const channel = new Channel<string>();
    channel.onmessage = (chunk) => {
      // Hide the "connecting" overlay on first received byte.
      if (connectingRef.current) {
        connectingRef.current = false;
        setConnecting(false);
      }
      xtermRef.current?.write(chunk);
    };

    // attach_channel returns immediately; output flows through the channel.
    void invoke("stream_terminal_output", { sessionId, onData: channel });

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
  // When this pane is switched to, re-fit (window may have resized while hidden).
  useEffect(() => {
    if (!isVisible) return;
    // Two-frame defer: first frame removes the hidden class, second frame has real dimensions.
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
      <div className="terminal-pane" ref={containerRef} />

      {connecting && (
        <div className="terminal-connecting">
          <div className="terminal-connecting-inner">
            <div className="terminal-connecting-spinner" />
            <span>Connecting to <strong>{sshAlias}</strong>…</span>
          </div>
        </div>
      )}
    </div>
  );
});

/** Call fit() only when the container has real dimensions. */
function safeFit(fit: FitAddon) {
  try {
    const dims = fit.proposeDimensions();
    if (dims && dims.cols > 0 && dims.rows > 0) {
      fit.fit();
    }
  } catch {
    // Ignore — element may be mid-transition.
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
  const bg = readCssVar("--bg", "#0a0e14");
  const bgElev = readCssVar("--bg-elev-1", "#111620");
  const bgHover = readCssVar("--bg-hover", "#1c2230");
  const text = readCssVar("--text", "#d4dae6");
  const textBright = readCssVar("--text-bright", "#eef1f8");
  const textMuted = readCssVar("--text-muted", "#6b7a8d");
  const accent = readCssVar("--accent", "#4a8fe7");
  const accent2 = readCssVar("--accent-2", "#3dba84");
  const danger = readCssVar("--danger", "#e05468");
  const warning = readCssVar("--warning", "#e0a84a");

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
    brightGreen: "#5ed4a0",
    yellow: warning,
    brightYellow: "#f5c06a",
    blue: accent,
    brightBlue: "#6aaeff",
    magenta: "#9a7ce5",
    brightMagenta: "#b89cf5",
    cyan: "#5fb4d4",
    brightCyan: "#82ccdf",
    white: text,
    brightWhite: textBright,
    extendedAnsi: [bgElev],
  };
}
