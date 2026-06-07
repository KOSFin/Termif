import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
}

const STORAGE_KEY = "termif.clipboard_history.v1";
const MAX_ENTRIES = 50;
const POLL_MS = 1500;

function loadEntries(): ClipboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClipboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: ClipboardEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function ClipboardPane() {
  const toast = useAppStore((s) => s.toast);
  const [entries, setEntries] = useState<ClipboardEntry[]>(() => loadEntries());
  const [, setTick] = useState(0);
  const lastTextRef = useRef<string>(entries[0]?.text ?? "");

  // Persist on change
  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  // Refresh relative timestamps every 15s
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  // Poll clipboard
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!active || !text || text === lastTextRef.current) return;
        lastTextRef.current = text;
        setEntries((prev) => {
          // Dedup: remove existing entry with same text
          const filtered = prev.filter((e) => e.text !== text);
          const next = [{ id: crypto.randomUUID(), text, timestamp: Date.now() }, ...filtered];
          return next.slice(0, MAX_ENTRIES);
        });
      } catch {
        // Clipboard permission denied or unavailable — silently ignore
      }
    };

    const timer = setInterval(() => void poll(), POLL_MS);
    // Initial poll
    void poll();

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
    lastTextRef.current = "";
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      lastTextRef.current = text; // prevent re-adding from poll
      toast("Copied to clipboard");
    } catch {
      toast("Failed to copy");
    }
  }, [toast]);

  return (
    <div className="clipboard-pane">
      <div className="clipboard-header">
        <h3>Clipboard</h3>
        <div className="clipboard-actions">
          {entries.length > 0 && (
            <button className="ghost icon-btn danger" onClick={clearAll} title="Clear all">
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="clipboard-list">
        {entries.length === 0 ? (
          <div className="clipboard-empty">
            Clipboard history will appear here as you copy text.
          </div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              className="clipboard-entry"
              onClick={() => void copyToClipboard(entry.text)}
              title="Copy to clipboard"
            >
              <div className="clipboard-entry-main">
                <div className="clipboard-entry-text">{entry.text}</div>
                <div className="clipboard-entry-time">{formatTimeAgo(entry.timestamp)}</div>
              </div>
              <div className="clipboard-entry-actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); void copyToClipboard(entry.text); }} title="Copy">
                  <Copy size={12} strokeWidth={2} />
                </button>
                <button className="ghost icon-btn danger" onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }} title="Delete">
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
