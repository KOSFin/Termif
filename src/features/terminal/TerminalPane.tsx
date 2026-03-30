import { invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useMemo, useRef, useState } from "react";

interface TerminalPaneProps {
  sessionId: string;
}

export function TerminalPane(props: TerminalPaneProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [liveInput, setLiveInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const suggestions = useMemo(() => {
    const value = liveInput.trim();
    if (!value) {
      return history.slice(0, 3);
    }

    return history.filter((cmd) => cmd.startsWith(value)).slice(0, 3);
  }, [history, liveInput]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

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
        black: "#10151f",
        brightBlack: "#3a4456"
      },
      scrollback: 20000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void invoke("resize_terminal", {
        sessionId: props.sessionId,
        cols: xterm.cols,
        rows: xterm.rows
      });
    });
    resizeObserver.observe(terminalRef.current);

    const dataListener = xterm.onData((data) => {
      void invoke("send_terminal_input", {
        sessionId: props.sessionId,
        data
      });

      if (data === "\r") {
        const cmd = liveInput.trim();
        if (cmd) {
          setHistory((prev) => [cmd, ...prev.filter((x) => x !== cmd)].slice(0, 80));
        }
        setLiveInput("");
        return;
      }

      if (data === "\u007f") {
        setLiveInput((prev) => prev.slice(0, -1));
        return;
      }

      if (/^[\x20-\x7E]+$/.test(data)) {
        setLiveInput((prev) => `${prev}${data}`);
      }
    });

    const poll = window.setInterval(async () => {
      try {
        const chunk = await invoke<string>("read_terminal_output", { sessionId: props.sessionId });
        if (chunk) {
          xterm.write(chunk);
        }
      } catch {
        // Session might already be closed; polling stops on unmount.
      }
    }, 45);

    return () => {
      window.clearInterval(poll);
      dataListener.dispose();
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [props.sessionId, liveInput]);

  return (
    <div className="terminal-pane-wrap">
      <div className="terminal-pane" ref={terminalRef} />
      <div className="terminal-assist">
        <div className="assist-title">Recent Commands</div>
        <div className="assist-list">
          {suggestions.map((item) => (
            <span key={item}>{item}</span>
          ))}
          {suggestions.length === 0 ? <span className="muted">No command suggestions yet</span> : null}
        </div>
      </div>
    </div>
  );
}
