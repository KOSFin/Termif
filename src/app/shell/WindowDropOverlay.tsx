interface WindowDropOverlayProps {
  active: boolean;
}

export function WindowDropOverlay({ active }: WindowDropOverlayProps) {
  if (!active) return null;

  return (
    <div className="window-drop-overlay" aria-hidden="true">
      <div className="window-drop-frame" />
    </div>
  );
}
