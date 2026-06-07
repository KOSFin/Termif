import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

function toastDuration(message: string): number {
  return Math.min(6000, Math.max(2000, 2000 + message.length * 30));
}

export function Toast({ message, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number>();
  const remainingRef = useRef<number>(toastDuration(message));

  useEffect(() => {
    timerRef.current = window.setTimeout(onDismiss, remainingRef.current);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [message, onDismiss]);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    } else {
      remainingRef.current = toastDuration(message);
      timerRef.current = window.setTimeout(onDismiss, remainingRef.current);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [message, onDismiss, paused]);

  return (
    <div
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onDismiss}>
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
