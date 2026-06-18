import type { TrackPayload } from "../../types/payload";
import * as R from "../analysis/read";

const GUTTER = 64;

interface View {
  secPerPx: number;
  scroll: number;
  offsetB: number;
  momentary: boolean;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setup(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, ok: r.width > 2 && r.height > 2 };
}

function timeMap(view: View, w: number, padL: number) {
  const spp = view.secPerPx;
  const t0 = view.scroll;
  return {
    spp, t0,
    xOf: (t: number) => padL + (t - t0) / spp,
    tOf: (x: number) => t0 + (x - padL) * spp,
    tEnd: t0 + (w - padL) * spp,
  };
}

function gridTime(ctx: CanvasRenderingContext2D, w: number, h: number, tm: ReturnType<typeof timeMap>, padL: number, line: string, tx3: string) {
  ctx.save();
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = tx3;
  ctx.font = '9px "JetBrains Mono", monospace';
  const span = (w - padL) * tm.spp;
  const targets = [1, 2, 5, 10, 15, 30, 60, 120];
  const step = targets.find((s) => span / s < 12) ?? 120;
  const start = Math.ceil(tm.t0 / step) * step;
  for (let t = start; t < tm.tEnd; t += step) {
    const x = tm.xOf(t);
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    ctx.fillText(`${mm}:${String(ss).padStart(2, "0")}`, x + 4, h - 5);
  }
  ctx.restore();
}

/** Short-term LUFS lane (A solid, B solid, optional momentary faint). */
export function lufsLane(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload, view: View) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3");
  const padL = GUTTER;
  const tm = timeMap(view, w, padL);
  const lo = -30, hi = -4;
  const yOf = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  ctx.font = '9px "JetBrains Mono", monospace';
  for (let v = -28; v <= -6; v += 6) {
    const y = yOf(v); ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(`${v}`, 4, y + 3);
  }
  const yt = yOf(-14); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(padL, yt + 0.5); ctx.lineTo(w, yt + 0.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = tx3; ctx.fillText("-14 LUFS", w - 56, yt - 4);
  gridTime(ctx, w, h, tm, padL, line, tx3);

  const drawLine = (track: TrackPayload, off: number, color: string, key: string, alpha: number, fill: boolean) => {
    ctx.beginPath();
    let started = false, firstX = padL, lastX = padL;
    for (let x = padL; x < w; x++) {
      const t = tm.tOf(x) + off;
      if (t < 0 || t > track.meta.duration) continue;
      const y = yOf(R.at(track, key, t));
      if (!started) { ctx.moveTo(x, y); started = true; firstX = x; } else ctx.lineTo(x, y);
      lastX = x;
    }
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    if (fill) {
      ctx.lineTo(lastX, h); ctx.lineTo(firstX, h); ctx.closePath();
      ctx.globalAlpha = alpha * 0.13; ctx.fillStyle = color; ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  if (view.momentary) {
    drawLine(A, 0, a, "momentaryLUFS", 0.28, false);
    drawLine(B, view.offsetB, b, "momentaryLUFS", 0.28, false);
  }
  drawLine(A, 0, a, "shortTermLUFS", 0.95, true);
  drawLine(B, view.offsetB, b, "shortTermLUFS", 0.95, true);
}

interface ValueCfg {
  lo: number; hi: number; key: string; ticks: number[]; redBelow?: number;
  fmt: (v: number) => string;
}

/** Generic single-value lane (crest; correlation reuses this in P3). */
export function valueLane(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload, view: View, cfg: ValueCfg) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3"), warn = css("--warn");
  const padL = GUTTER;
  const tm = timeMap(view, w, padL);
  const { lo, hi, key, redBelow } = cfg;
  const yOf = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  if (redBelow !== undefined) {
    const yr = yOf(redBelow);
    ctx.fillStyle = warn; ctx.globalAlpha = 0.07; ctx.fillRect(padL, yr, w - padL, h - yr); ctx.globalAlpha = 1;
  }
  ctx.font = '9px "JetBrains Mono", monospace';
  for (const v of cfg.ticks) {
    const y = yOf(v); ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(cfg.fmt(v), 4, y + 3);
  }
  gridTime(ctx, w, h, tm, padL, line, tx3);
  const draw = (track: TrackPayload, off: number, color: string) => {
    ctx.beginPath(); let started = false;
    for (let x = padL; x < w; x++) {
      const t = tm.tOf(x) + off;
      if (t < 0 || t > track.meta.duration) continue;
      const v = Math.max(lo, Math.min(hi, R.at(track, key, t)));
      const y = yOf(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
  };
  draw(A, 0, a); draw(B, view.offsetB, b);
}
