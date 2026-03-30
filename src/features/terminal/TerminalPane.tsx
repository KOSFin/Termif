import { invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

interface TerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
}

export function TerminalPane({ sessionId, isVisible }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const xterm = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: "Cascadia Code, Fira Code, JetBrains Mono, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: "#0a0e14",
        foreground: "#d4dae6",
        cursor: "#4a8fe7",
        selectionBackground: "#1c3050",
        black: "#0a0e14",
        brightBlack: "#3a4456",
        red: "#e05468",
        green: "#3dba84",
        yellow: "#e0a84a",
        blue: "#4a8fe7",
        magenta: "#9a7ce5",
        cyan: "#5fb4d4",
        white: "#d4dae6",
        brightWhite: "#eef1f8",
      },
      scrollback: 20000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(el);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitRef.current = fitAddon;

    const dataListener = xterm.onData((data) => {
      void invoke("send_terminal_input", { sessionId, data });
    });

    let polling = true;
    const poll = window.setInterval(async () => {
      if (!polling) return;
      try {
        const chunk = await invoke<string>("read_terminal_output", { sessionId });
        if (chunk) xterm.write(chunk);
      } catch {
        // session closed
      }
    }, 45);

    const resizeObserver = new ResizeObserver(() => {
      if (!xtermRef.current || !fitRef.current) return;
      fitAddon.fit();
      void invoke("resize_terminal", {
        sessionId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });
    resizeObserver.observe(el);

    return () => {
      polling = false;
      window.clearInterval(poll);
      dataListener.dispose();
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Fit immediately when becoming visible
  useEffect(() => {
    if (!isVisible) return;
    const xterm = xtermRef.current;
    const fit = fitRef.current;
    if (!xterm || !fit) return;
    fit.fit();
    void invoke("resize_terminal", {
      sessionId,
      cols: xterm.cols,
      rows: xterm.rows,
    });
    xterm.focus();
  }, [isVisible, sessionId]);

  return (
    <div
      className="terminal-pane-wrap"
      style={{ display: isVisible ? undefined : "none" }}
    >
      <div className="terminal-pane" ref={containerRef} />
    </div>
  );
}
