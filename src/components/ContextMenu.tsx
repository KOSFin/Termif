import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktopPlatform, isMacLike } from "@/platform/platform";

const MENU_MARGIN = 8;

export interface MenuPoint {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  open: boolean;
  anchor: MenuPoint | null;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  allowViewportOverflowOnMac?: boolean;
  minWidth?: number;
}

export function anchorMenuFromRect(
  rect: { left: number; right: number; top: number; bottom: number },
  menuSize: { width: number; height: number },
  placement: "bottom-start" | "bottom-end" | "top-start" | "top-end" = "bottom-start",
  options?: { allowViewportOverflowOnMac?: boolean; offsetX?: number; offsetY?: number }
) {
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 4;
  const point = (() => {
    switch (placement) {
      case "bottom-end":
        return { x: rect.right - menuSize.width + offsetX, y: rect.bottom + offsetY };
      case "top-start":
        return { x: rect.left + offsetX, y: rect.top - menuSize.height - offsetY };
      case "top-end":
        return { x: rect.right - menuSize.width + offsetX, y: rect.top - menuSize.height - offsetY };
      case "bottom-start":
      default:
        return { x: rect.left + offsetX, y: rect.bottom + offsetY };
    }
  })();

  return clampMenuPoint(point, menuSize, options);
}

export function clampMenuPoint(
  anchor: MenuPoint,
  menuSize: { width: number; height: number },
  options?: { allowViewportOverflowOnMac?: boolean }
) {
  if (options?.allowViewportOverflowOnMac && isMacLike) {
    return anchor;
  }

  let x = anchor.x;
  let y = anchor.y;

  if (x + menuSize.width + MENU_MARGIN > window.innerWidth && x - menuSize.width >= MENU_MARGIN) {
    x -= menuSize.width;
  }

  if (y + menuSize.height + MENU_MARGIN > window.innerHeight && y - menuSize.height >= MENU_MARGIN) {
    y -= menuSize.height;
  }

  const maxX = Math.max(MENU_MARGIN, window.innerWidth - menuSize.width - MENU_MARGIN);
  const maxY = Math.max(MENU_MARGIN, window.innerHeight - menuSize.height - MENU_MARGIN);

  return {
    x: Math.max(MENU_MARGIN, Math.min(x, maxX)),
    y: Math.max(MENU_MARGIN, Math.min(y, maxY)),
  };
}

export function ContextMenu({
  open,
  anchor,
  onClose,
  className = "",
  children,
  allowViewportOverflowOnMac = false,
  minWidth,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPoint | null>(anchor);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onResize = () => {
      if (!menuRef.current || !anchor) return;
      const rect = menuRef.current.getBoundingClientRect();
      setPosition(clampMenuPoint(anchor, { width: rect.width, height: rect.height }, { allowViewportOverflowOnMac }));
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [allowViewportOverflowOnMac, anchor, onClose, open]);

  useLayoutEffect(() => {
    if (!open || !anchor || !menuRef.current) {
      setPosition(anchor);
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    setPosition(clampMenuPoint(anchor, { width: rect.width, height: rect.height }, { allowViewportOverflowOnMac }));
  }, [allowViewportOverflowOnMac, anchor, children, open]);

  const style = useMemo(() => {
    const base: CSSProperties = {
      left: position?.x ?? anchor?.x ?? MENU_MARGIN,
      top: position?.y ?? anchor?.y ?? MENU_MARGIN,
      minWidth,
    };

    if (allowViewportOverflowOnMac && desktopPlatform === "macos") {
      base.maxHeight = "min(80vh, 720px)";
    }

    return base;
  }, [allowViewportOverflowOnMac, anchor?.x, anchor?.y, minWidth, position?.x, position?.y]);

  if (!open || !anchor) return null;

  return createPortal(
    <div className="context-anchor">
      <div
        ref={menuRef}
        className={`app-context-menu ${className}`.trim()}
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
