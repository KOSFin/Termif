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

  // Terminal lifecycle — only depends on sessionId
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
        background: "#131922",
        foreground: "#e4ecff",
        cursor: "#6db3ff",
        selectionBackground: "#28405c",
        black: "#10151f",
        brightBlack: "#3a4456",
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

    // Input → backend
    const dataListener = xterm.onData((data) => {
      void invoke("send_terminal_input", { sessionId, data });
    });

    // Output polling
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

    // Resize observer
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

  // Fit when becoming visible (tab switch)
  useEffect(() => {
    if (!isVisible) return;
    // Small delay so the container has layout dimensions
    const id = window.setTimeout(() => {
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
    }, 20);
    return () => window.clearTimeout(id);
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
