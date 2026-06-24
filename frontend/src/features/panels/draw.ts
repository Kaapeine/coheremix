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
      if (t < 0 || t > track.meta.duration) { started = false; continue; }
      const raw = R.at(track, key, t);
      if (raw == null) { started = false; continue; }
      const y = yOf(raw);
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
    drawLine(B, -view.offsetB, b, "momentaryLUFS", 0.28, false);
  }
  drawLine(A, 0, a, "shortTermLUFS", 0.95, true);
  drawLine(B, -view.offsetB, b, "shortTermLUFS", 0.95, true);
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
  const padT = 10, padB = 16;
  const plotH = h - padT - padB;
  const yOf = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  if (redBelow !== undefined) {
    const yr = yOf(redBelow);
    ctx.fillStyle = warn; ctx.globalAlpha = 0.07; ctx.fillRect(padL, yr, w - padL, h - padB - yr); ctx.globalAlpha = 1;
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
      if (t < 0 || t > track.meta.duration) { started = false; continue; }
      const raw = R.at(track, key, t);
      if (raw == null) { started = false; continue; }
      const v = Math.max(lo, Math.min(hi, raw));
      const y = yOf(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
  };
  draw(A, 0, a); draw(B, -view.offsetB, b);
}

const F_LO = 20, F_HI = 20000;

/** Map a frequency (Hz) to an x pixel on a log scale within [padL, w). */
function logFreqX(f: number, padL: number, w: number): number {
  const r = (Math.log10(f) - Math.log10(F_LO)) / (Math.log10(F_HI) - Math.log10(F_LO));
  return padL + r * (w - padL);
}

/** LTAS tonal-balance curve: log-freq x-axis, peak-normalised dB y-axis. */
export function ltasCurve(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3");
  const padL = 30, padB = 14;
  const plotH = h - padB;
  const dbLo = -54, dbHi = 6;
  const yOf = (db: number) => plotH - ((db - dbLo) / (dbHi - dbLo)) * plotH;
  ctx.font = '9px "JetBrains Mono", monospace';
  // horizontal dB gridlines
  for (let db = 0; db >= -48; db -= 12) {
    const y = yOf(db);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(`${db}`, 4, y + 3);
  }
  // x-axis baseline (separates the plot from the frequency-label row)
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, plotH + 0.5); ctx.lineTo(w, plotH + 0.5); ctx.stroke();
  // vertical decade gridlines + labels
  for (const f of [100, 1000, 10000]) {
    const x = logFreqX(f, padL, w);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, plotH); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
  }
  // minor gridlines between decades (20..90, 200..900, 2000..9000), labels on a subset only
  const minorLine = "rgba(255,255,255,0.03)";
  const labeled = new Set([20, 30, 40, 60, 80, 200, 300, 400, 600, 800, 2000, 3000, 4000, 6000, 8000]);
  for (const decade of [10, 100, 1000]) {
    for (let m = 2; m <= 9; m++) {
      const f = decade * m;
      if (f < F_LO || f >= F_HI) continue;
      const x = logFreqX(f, padL, w);
      ctx.strokeStyle = minorLine; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, plotH); ctx.stroke();
      if (labeled.has(f)) {
        ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
      }
    }
  }
  // label the right edge (20k = F_HI)
  ctx.fillStyle = tx3; ctx.fillText("20k", w - 22, h - 3);
  const drawCurve = (track: TrackPayload, color: string) => {
    const l = track.ltas; if (!l) return;
    const NO_INFO_DB = -60; // trailing high-freq bins this far down are "no signal" (e.g. MP3 cutoff), not tonal content
    let last = l.freqs.length - 1;
    while (last > 0 && l.db[last] <= NO_INFO_DB) last--;
    ctx.beginPath();
    for (let i = 0; i <= last; i++) {
      const x = logFreqX(l.freqs[i], padL, w);
      const y = yOf(Math.max(dbLo, l.db[i]));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    ctx.globalAlpha = 1;
  };
  drawCurve(A, a); drawCurve(B, b);
}

/** 7 vertical bars = (A − B) band energy in dB, centred on a zero line. */
export function bandDelta(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.10)", tx3 = css("--tx-3");
  const range = 9; // ±9 dB full scale
  const mid = h / 2;
  const yOf = (d: number) => mid - (Math.max(-range, Math.min(range, d)) / range) * (mid - 14);
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(w, mid + 0.5); ctx.stroke();
  const n = R.BAND_EDGES.length;
  const slot = w / n;
  for (let i = 0; i < n; i++) {
    const { name, lo, hi } = R.BAND_EDGES[i];
    const dA = R.bandEnergy(A, lo, hi), dB = R.bandEnergy(B, lo, hi);
    const d = (isFinite(dA) && isFinite(dB)) ? dA - dB : 0;
    const x = i * slot + slot * 0.2;
    const bw = slot * 0.6;
    const y = yOf(d);
    ctx.fillStyle = d >= 0 ? a : b;
    ctx.fillRect(x, Math.min(mid, y), bw, Math.abs(y - mid));
    ctx.fillStyle = tx3; ctx.textAlign = "center";
    ctx.fillText(name, x + bw / 2, 10);
    ctx.fillText((d >= 0 ? "+" : "") + d.toFixed(1), x + bw / 2, d >= 0 ? y - 3 : y + 9);
  }
  ctx.textAlign = "left";
}

/** Per-band width: paired A/B bars (height ∝ S/M ratio) across the 7 bands. */
export function bandBars(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), tx3 = css("--tx-3");
  const wbA = A.static.widthPerBand ?? [], wbB = B.static.widthPerBand ?? [];
  const n = R.BAND_EDGES.length;
  const slot = w / n;
  const hi = Math.max(0.6, ...wbA, ...wbB); // dynamic full-scale
  const base = h - 14;
  ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = "center";
  for (let i = 0; i < n; i++) {
    const vA = wbA[i] ?? 0, vB = wbB[i] ?? 0;
    const hA = (Math.min(hi, vA) / hi) * (base - 4);
    const hB = (Math.min(hi, vB) / hi) * (base - 4);
    const x = i * slot;
    ctx.fillStyle = a; ctx.fillRect(x + slot * 0.18, base - hA, slot * 0.28, hA);
    ctx.fillStyle = b; ctx.fillRect(x + slot * 0.54, base - hB, slot * 0.28, hB);
    ctx.fillStyle = tx3; ctx.fillText(R.BAND_EDGES[i].name, x + slot / 2, h - 3);
  }
  ctx.textAlign = "left";
}
