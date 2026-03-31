import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
  /** SSH alias — when set, shows a "Connecting…" overlay until first output. */
  sshAlias?: string;
}

export function TerminalPane({ sessionId, isVisible, sshAlias }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Show connecting overlay for SSH sessions until the first byte of output arrives.
  const [connecting, setConnecting] = useState<boolean>(!!sshAlias);
  const connectingRef = useRef<boolean>(!!sshAlias);

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
      cursorStyle: "bar",
      fontFamily: "Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: "#0a0e14",
        foreground: "#d4dae6",
        cursor: "#4a8fe7",
        cursorAccent: "#0a0e14",
        selectionBackground: "#1c3050",
        black: "#0a0e14",
        brightBlack: "#3a4456",
        red: "#e05468",
        brightRed: "#ff7a8c",
        green: "#3dba84",
        brightGreen: "#5ed4a0",
        yellow: "#e0a84a",
        brightYellow: "#f5c06a",
        blue: "#4a8fe7",
        brightBlue: "#6aaeff",
        magenta: "#9a7ce5",
        brightMagenta: "#b89cf5",
        cyan: "#5fb4d4",
        brightCyan: "#82ccdf",
        white: "#d4dae6",
        brightWhite: "#eef1f8",
      },
      scrollback: 20000,
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
}

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
