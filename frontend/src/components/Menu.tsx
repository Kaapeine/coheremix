import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface Coords {
  left: number;
  top: number | null;
  bottom: number | null;
  width?: number;
  maxHeight: number;
}

interface Props {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: number;
}

export function Menu({ trigger, children, align = "left", width }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const measure = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    const r = w.getBoundingClientRect();
    const mw = width ?? 210;
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const dropUp = spaceBelow < 250 && r.top > spaceBelow;
    const margin = 13; // 5px gap + 8px screen padding
    setCoords({
      left:
        align === "right"
          ? Math.max(8, r.right - mw)
          : Math.min(r.left, window.innerWidth - mw - 8),
      top: dropUp ? null : r.bottom + 5,
      bottom: dropUp ? vh - r.top + 5 : null,
      width,
      maxHeight: Math.max(120, (dropUp ? r.top : spaceBelow) - margin),
    });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const reflow = () => measure();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", reflow, true);
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", reflow, true);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open, measure]);

  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  return (
    <div className="sel" ref={wrapRef} style={{ position: "relative" }}>
      {trigger(open, toggle)}
      {open &&
        coords &&
        createPortal(
          <div
            className="menu"
            ref={menuRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top ?? undefined,
              bottom: coords.bottom ?? undefined,
              width: coords.width,
              maxHeight: coords.maxHeight,
              overflowY: "auto",
            }}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}
