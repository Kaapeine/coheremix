import type { TrackPayload } from "../../types/payload";

/** Value of a feature at A-time t (s), linear-interpolated. */
export function at(track: TrackPayload, key: string, t: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return 0;
  const x = t / track.hop;
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x)));
  const j = Math.min(arr.length - 1, i + 1);
  const f = x - i;
  return arr[i] * (1 - f) + arr[j] * f;
}

export function mean(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return 0;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let s = 0, c = 0;
  for (let i = i0; i <= i1; i++) { s += arr[i]; c++; }
  return c ? s / c : arr[0];
}

export function max(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return -Infinity;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let m = -Infinity;
  for (let i = i0; i <= i1; i++) m = Math.max(m, arr[i]);
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
