import { Copy, Minus, Square, X } from "lucide-react";

interface WindowControlsProps {
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export function WindowControls({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
}: WindowControlsProps) {
  return (
    <div className="window-controls">
      <button className="window-btn window-btn-minimize" onClick={onMinimize} title="Minimize">
        <Minus size={14} strokeWidth={2} />
      </button>
      <button className="window-btn window-btn-maximize" onClick={onMaximize} title={isMaximized ? "Restore Down" : "Maximize"}>
        {isMaximized ? <Copy size={11} strokeWidth={2} /> : <Square size={11} strokeWidth={2} />}
      </button>
      <button className="window-btn window-btn-close" onClick={onClose} title="Close">
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
