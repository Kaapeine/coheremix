import { useEffect, useRef } from "react";
import {
  createWaveformRenderer,
  type WaveformRenderer,
} from "./waveform.regl";

interface Props {
  peaks: Record<string, number[]>;
  color: string; // hex e.g. "#f2a93b"
  role: string;
  scroll: number;
  secPerPx: number;
  duration: number;
  offsetPx?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function Waveform({
  peaks,
  color,
  scroll,
  secPerPx,
  duration,
  offsetPx = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WaveformRenderer | null>(null);

  // Keep latest draw params in a ref so the ResizeObserver can always draw
  // with fresh values without being a useEffect dependency itself.
  const paramsRef = useRef({ scroll, secPerPx, duration, color, offsetPx });
  paramsRef.current = { scroll, secPerPx, duration, color, offsetPx };

  const doDraw = () => {
    const r = rendererRef.current;
    if (!r) return;
    const { scroll, secPerPx, duration, color, offsetPx } = paramsRef.current;
    r.draw({ scroll, secPerPx, duration, color: hexToRgb(color), offsetPx });
  };

  // Create (or recreate) the renderer when peaks change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set physical size before creating the GL context.
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.offsetWidth * dpr));
    const h = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    canvas.width = w;
    canvas.height = h;

    const r = createWaveformRenderer(canvas, peaks);
    rendererRef.current = r;
    return () => {
      r.destroy();
      rendererRef.current = null;
    };
  }, [peaks]); // peaks identity changes only on new comparison or swap

  // Resize observer: update canvas physical size and redraw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      const h = Math.max(1, Math.round(canvas.offsetHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      requestAnimationFrame(doDraw);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw whenever visible params change.
  useEffect(() => {
    const raf = requestAnimationFrame(doDraw);
    return () => cancelAnimationFrame(raf);
  }, [scroll, secPerPx, duration, color, offsetPx, peaks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
