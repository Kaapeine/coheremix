import type { TrackPayload } from "../../types/payload";

/** Value of a feature at A-time t (s), linear-interpolated. Returns null where
 * the underlying sample(s) are gated out (e.g. analysed-as-silent) — callers
 * that render a line should treat null as a gap, not a value. */
export function at(track: TrackPayload, key: string, t: number): number | null {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return null;
  const x = t / track.hop;
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x)));
  const j = Math.min(arr.length - 1, i + 1);
  const f = Math.max(0, Math.min(1, x - i));
  const vi = arr[i], vj = arr[j];
  if (vi == null || vj == null) return null;
  return vi * (1 - f) + vj * f;
}

/** Mean over [t0,t1], ignoring gated/null samples. */
export function mean(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return 0;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let s = 0, c = 0;
  for (let i = i0; i <= i1; i++) {
    const v = arr[i];
    if (v != null) { s += v; c++; }
  }
  return c ? s / c : 0;
}

/** Max over [t0,t1], ignoring gated/null samples. */
export function max(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return -Infinity;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let m = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const v = arr[i];
    if (v != null) m = Math.max(m, v);
  }
  return m;
}

/** Trailing-window mean of a feature at t (seconds). */
export function winMean(track: TrackPayload, key: string, t: number, win: number): number {
  return mean(track, key, Math.max(0, t - win), Math.max(0.05, t));
}

const ABS_GATE = -70;
const G = 1.0;

/**
 * BS.1770-4 two-pass gated integrated LUFS over [t0,t1] using the per-100ms
 * K-power blocks shipped in the payload. Mirrors backend `gated_integrated`.
 */
export function regionIntegrated(track: TrackPayload, t0: number, t1: number): number {
  const kb = track.kblocks;
  if (!kb || kb.length === 0) return track.static.integrated;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(kb.length - 1, Math.ceil(t1 / track.hop));
  const weighted: number[] = [];
  for (let i = i0; i <= i1; i++) weighted.push(G * kb[i][0] + G * kb[i][1]);
  const loud = (p: number) => (p > 0 ? -0.691 + 10 * Math.log10(p) : -120);
  const kept = weighted.filter((p) => loud(p) >= ABS_GATE);
  if (kept.length === 0) return -120;
  const prov = kept.reduce((a, b) => a + b, 0) / kept.length;
  const rel = loud(prov) - 10;
  const kept2 = weighted.filter((p) => loud(p) >= ABS_GATE && loud(p) >= rel);
  if (kept2.length === 0) return loud(prov);
  const finalPow = kept2.reduce((a, b) => a + b, 0) / kept2.length;
  return loud(finalPow);
}

/** 7 mastering bands, matching backend ComparisonDefaults.bandEdges. */
export const BAND_EDGES: { name: string; lo: number; hi: number }[] = [
  { name: "Sub", lo: 20, hi: 60 },
  { name: "Low", lo: 60, hi: 120 },
  { name: "L-Mid", lo: 120, hi: 400 },
  { name: "Mid", lo: 400, hi: 2000 },
  { name: "H-Mid", lo: 2000, hi: 5000 },
  { name: "Pres", lo: 5000, hi: 10000 },
  { name: "Air", lo: 10000, hi: 20000 },
];

/** Mean LTAS level (dB) over [lo,hi). -Infinity if no LTAS / no bins in range. */
export function bandEnergy(track: TrackPayload, lo: number, hi: number): number {
  const l = track.ltas;
  if (!l) return -Infinity;
  let pow = 0, c = 0;
  for (let i = 0; i < l.freqs.length; i++) {
    if (l.freqs[i] >= lo && l.freqs[i] < hi) {
      pow += Math.pow(10, l.db[i] / 10);
      c++;
    }
  }
  return c ? 10 * Math.log10(pow / c) : -Infinity;
}
