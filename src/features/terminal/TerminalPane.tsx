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
  const visibleRef = useRef(isVisible);

  // Keep visibleRef in sync
  visibleRef.current = isVisible;

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

    // Only fit if visible (has dimensions)
    if (visibleRef.current) {
      fitAddon.fit();
    }

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

    // Debounced ResizeObserver - skip when not visible
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!visibleRef.current || !xtermRef.current || !fitRef.current) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!visibleRef.current || !xtermRef.current || !fitRef.current) return;
        fitRef.current.fit();
        void invoke("resize_terminal", {
          sessionId,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        });
      }, 80);
    });
    resizeObserver.observe(el);

    return () => {
      polling = false;
      window.clearInterval(poll);
      if (resizeTimer) clearTimeout(resizeTimer);
      dataListener.dispose();
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Fit when becoming visible - use RAF + setTimeout to let layout settle
  useEffect(() => {
    if (!isVisible) return;
    const xterm = xtermRef.current;
    const fit = fitRef.current;
    if (!xterm || !fit) return;

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      // Additional frame to let layout fully resolve after display change
      const timerId = setTimeout(() => {
        if (cancelled) return;
        fit.fit();
        void invoke("resize_terminal", {
          sessionId,
          cols: xterm.cols,
          rows: xterm.rows,
        });
        xterm.focus();
      }, 0);
      // Store timerId for cleanup
      cleanupTimer = timerId;
    });

    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
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
