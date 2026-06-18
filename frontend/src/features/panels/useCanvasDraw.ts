import { useEffect, useLayoutEffect, useRef } from "react";

/** DPR-aware canvas: runs `draw(canvas)` on mount, deps change, and resize. */
export function useCanvasDraw(
  draw: (canvas: HTMLCanvasElement) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);

  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const run = () => drawRef.current(cv);
    run();
    const ro = new ResizeObserver(run);
    ro.observe(cv);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
