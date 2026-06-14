import { useEffect, useRef, useState } from "react";
import { useViewState } from "../../store/viewState";

interface Props {
  mixDuration: number;
  refDuration: number;
}

/**
 * Horizontal scrollbar driving the shared `scroll` (seconds from start). The
 * scrollable extent spans both lanes including B's alignment offset — B content
 * `C` is drawn at A-timeline `C + offsetB` — so a B lane pushed off-screen by a
 * large offset is always recoverable here.
 */
export function ScrollBar({ mixDuration, refDuration }: Props) {
  const scroll = useViewState((s) => s.scroll);
  const secPerPx = useViewState((s) => s.secPerPx);
  const offsetB = useViewState((s) => s.offsetB);
  const set = useViewState((s) => s.set);

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);

  // Track width must live in state (not a ref) so the thumb re-sizes on resize.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackW(el.clientWidth);
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contentStart = Math.min(0, offsetB);
  const contentEnd = Math.max(mixDuration, refDuration + offsetB);
  const contentLen = Math.max(1e-6, contentEnd - contentStart);
  const span = trackW * secPerPx; // seconds currently visible
  const maxScroll = Math.max(contentStart, contentEnd - span);
  const secPerTrackPx = contentLen / Math.max(1, trackW);

  const clamp = (v: number) => Math.min(maxScroll, Math.max(contentStart, v));

  const thumbW = Math.max(24, Math.min(1, span / contentLen) * trackW);
  const leftFrac = (scroll - contentStart) / contentLen;
  const thumbLeft = Math.min(trackW - thumbW, Math.max(0, leftFrac * trackW));

  // Listeners depend only on the mapping scalars, which don't change mid-drag.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      set({ scroll: clamp(drag.startScroll + (e.clientX - drag.startX) * secPerTrackPx) });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secPerTrackPx, maxScroll, contentStart]);

  const onThumbDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startScroll: scroll };
  };

  // Click on the empty track jumps the thumb under the cursor, then drags.
  const onTrackDown = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const target = clamp(contentStart + ((e.clientX - rect.left - thumbW / 2) / trackW) * contentLen);
    set({ scroll: target });
    dragRef.current = { startX: e.clientX, startScroll: target };
  };

  return (
    <div className="wave-scroll" ref={trackRef} onMouseDown={onTrackDown}>
      <div
        className="wave-scroll-thumb"
        style={{ left: thumbLeft, width: thumbW }}
        onMouseDown={onThumbDown}
      />
    </div>
  );
}
