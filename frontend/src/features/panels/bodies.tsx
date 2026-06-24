/* eslint-disable react-hooks/refs -- `ref` here is the B/reference-track payload
 * (BodyProps.ref: TrackPayload), not a React ref object; the rule taints on the
 * prop key name and can't tell the two apart. */
import { useEffect, useRef } from "react";
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { useCanvasDraw } from "./useCanvasDraw";
import { lufsLane, valueLane, ltasCurve, bandDelta, bandBars } from "./draw";
import { audioTap } from "../audio/tap";
import * as R from "../analysis/read";

const GUTTER = 64;

interface BodyProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

/** Shared playhead + region overlay for time-axis lanes. */
export function TimeOverlay() {
  const { secPerPx, scroll, playhead, regionA } = useViewState();
  const xOf = (t: number) => GUTTER + (t - scroll) / secPerPx;
  return (
    <div className="lane-overlay">
      {regionA && (
        <div
          className="region-sel"
          style={{ left: xOf(regionA[0]), width: Math.max(2, (regionA[1] - regionA[0]) / secPerPx) }}
        />
      )}
      <div className="playhead" style={{ left: xOf(playhead) }} />
    </div>
  );
}

export function ShortTermLufsBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB, momentary } = useViewState();
  const cref = useCanvasDraw(
    (cv) => lufsLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary }),
    [secPerPx, scroll, offsetB, momentary, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function CrestBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB } = useViewState();
  const cref = useCanvasDraw(
    (cv) =>
      valueLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary: false }, {
        lo: 3, hi: 18, key: "crest", ticks: [4, 8, 12, 16], fmt: (v) => v.toFixed(0),
      }),
    [secPerPx, scroll, offsetB, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function CorrelationBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB } = useViewState();
  const cref = useCanvasDraw(
    (cv) =>
      valueLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary: false }, {
        lo: -1, hi: 1, key: "correlation", ticks: [-1, -0.5, 0, 0.5, 1],
        redBelow: 0, fmt: (v) => v.toFixed(1),
      }),
    [secPerPx, scroll, offsetB, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function LtasBody({ mix, ref }: BodyProps) {
  const cref = useCanvasDraw((cv) => ltasCurve(cv, mix, ref), [mix, ref]);
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function BandDeltaBody({ mix, ref }: BodyProps) {
  const cref = useCanvasDraw((cv) => bandDelta(cv, mix, ref), [mix, ref]);
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

const SPEC_F_LO = 20, SPEC_F_HI = 20000;

/** Boxcar-average `db` in the linear-power domain over a ±fraction/2-octave window per bin, via prefix sums (O(n)). */
function octaveSmooth(db: Float32Array, binHz: number, fraction: number): Float32Array {
  const n = db.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const lin = db[i] === -Infinity ? 0 : Math.pow(10, db[i] / 10);
    prefix[i + 1] = prefix[i] + lin;
  }
  const out = new Float32Array(n);
  const mul = Math.pow(2, fraction / 2);
  for (let i = 1; i < n; i++) {
    const f = i * binHz;
    const i0 = Math.max(1, Math.round(f / mul / binHz));
    const i1 = Math.min(n - 1, Math.max(i0, Math.round((f * mul) / binHz)));
    const avg = (prefix[i1 + 1] - prefix[i0]) / (i1 - i0 + 1);
    out[i] = avg > 0 ? 10 * Math.log10(avg) : -100;
  }
  return out;
}

export function SpectrumBody({ mix, ref }: BodyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Time-smoothed (EMA) dB frames per track — the analyser's own smoothing is
  // disabled so this can be controlled precisely in milliseconds.
  const heldA = useRef<Float32Array | null>(null);
  const heldB = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssVar = (n: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const sr = audioTap.sampleRate();
    let raf = 0;
    let lastT = performance.now();

    const read = (role: "mix" | "reference", held: typeof heldA, alpha: number) => {
      // While paused the source is disconnected and the analyser decays toward
      // silence over a few frames — stop sampling so the held frame stays
      // exactly what was on screen at the moment of pause.
      if (!audioTap.playing()) return held.current;
      const an = audioTap.analyser(role);
      if (!an) return held.current;
      const raw = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(raw); // dB, −Infinity when silent
      if (!held.current || held.current.length !== raw.length) {
        held.current = new Float32Array(raw.length).fill(-100);
      }
      const smoothed = held.current;
      for (let i = 0; i < raw.length; i++) {
        // Guard against -Infinity/NaN on both sides so one bad frame can
        // never permanently poison the running average.
        const r = Number.isFinite(raw[i]) ? raw[i] : -100;
        const cur = Number.isFinite(smoothed[i]) ? smoothed[i] : -100;
        smoothed[i] = cur + alpha * (r - cur);
      }
      return held.current;
    };

    const draw = () => {
      const now = performance.now();
      const dt = Math.max(0, (now - lastT) / 1000);
      lastT = now;
      const { spectrumAvgMs = 300, spectrumOctaves = "1/3" } = useViewState.getState();
      const tau = Math.max(0.001, spectrumAvgMs / 1000);
      const alpha = 1 - Math.exp(-dt / tau);
      const [octNum, octDen] = spectrumOctaves.split("/").map(Number);
      const octaveFraction = octDen ? octNum / octDen : octNum;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const a = cssVar("--a"), b = cssVar("--b"), line = "rgba(255,255,255,0.06)", tx3 = cssVar("--tx-3");
      const padL = 30, padT = 10, padB = 14, dbLo = -100, dbHi = -20;
      const plotH = h - padB - padT;
      const xOf = (f: number) =>
        padL + ((Math.log10(f) - Math.log10(SPEC_F_LO)) / (Math.log10(SPEC_F_HI) - Math.log10(SPEC_F_LO))) * (w - padL);
      const yOf = (db: number) => padT + plotH - ((Math.max(dbLo, Math.min(dbHi, db)) - dbLo) / (dbHi - dbLo)) * plotH;
      ctx.font = '9px "JetBrains Mono", monospace';
      // y-axis dB gridlines + labels
      ctx.textAlign = "right";
      for (let db = dbHi; db >= dbLo; db -= 6) {
        const y = yOf(db);
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
        ctx.fillStyle = tx3; ctx.fillText(`${db}`, padL - 4, y + 3);
      }
      ctx.textAlign = "left";
      const plotBottom = padT + plotH;
      // x-axis baseline + major decade gridlines
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, plotBottom + 0.5); ctx.lineTo(w, plotBottom + 0.5); ctx.stroke();
      for (const f of [100, 1000, 10000]) {
        const x = xOf(f);
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x + 0.5, padT); ctx.lineTo(x + 0.5, plotBottom); ctx.stroke();
        ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
      }
      // minor gridlines between decades (20..90, 200..900, 2000..9000), labels on a subset only
      const minorLine = "rgba(255,255,255,0.03)";
      const labeled = new Set([20, 30, 40, 60, 80, 200, 300, 400, 600, 800, 2000, 3000, 4000, 6000, 8000]);
      for (const decade of [10, 100, 1000]) {
        for (let m = 2; m <= 9; m++) {
          const f = decade * m;
          if (f < SPEC_F_LO || f >= SPEC_F_HI) continue;
          const x = xOf(f);
          ctx.strokeStyle = minorLine; ctx.beginPath(); ctx.moveTo(x + 0.5, padT); ctx.lineTo(x + 0.5, plotBottom); ctx.stroke();
          if (labeled.has(f)) {
            ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
          }
        }
      }
      ctx.fillStyle = tx3; ctx.fillText("20k", w - 22, h - 3);
      // live (or held) analyser spectra
      const live = (frame: Float32Array | null, color: string, an: AnalyserNode | null) => {
        if (!frame || !an) return;
        const bins = frame.length;
        ctx.beginPath(); let started = false;
        for (let i = 1; i < bins; i++) {
          const f = (i * sr) / (bins * 2);
          if (f < SPEC_F_LO || f > SPEC_F_HI) continue;
          const x = xOf(f), y = yOf(frame[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.lineJoin = "round"; ctx.stroke();
      };
      const smoothFor = (frame: Float32Array | null) =>
        frame ? octaveSmooth(frame, sr / (frame.length * 2), octaveFraction) : null;
      live(smoothFor(read("mix", heldA, alpha)), a, audioTap.analyser("mix"));
      live(smoothFor(read("reference", heldB, alpha)), b, audioTap.analyser("reference"));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mix, ref]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function Scope({ role, color }: { role: "mix" | "reference"; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stroke = getComputedStyle(document.documentElement).getPropertyValue(color).trim();
    const FRAME_MS = 1000 / 18; // throttled redraw rate (display refresh is much faster than ear-useful here)
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      const r = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.max(1, Math.floor(Math.min(r.width, r.height)));
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr; canvas.height = size * dpr;
        canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // phosphor fade: paint translucent black over the previous frame
      ctx.fillStyle = "rgba(8,7,5,0.22)";
      ctx.fillRect(0, 0, size, size);
      // guide lines through center: vertical, horizontal, both diagonals
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2 + 0.5, 0); ctx.lineTo(size / 2 + 0.5, size);
      ctx.moveTo(0, size / 2 + 0.5); ctx.lineTo(size, size / 2 + 0.5);
      ctx.moveTo(0, 0); ctx.lineTo(size, size);
      ctx.moveTo(size, 0); ctx.lineTo(0, size);
      ctx.stroke();
      const an = audioTap.stereo(role);
      if (an) {
        const N = an.l.fftSize;
        const L = new Float32Array(N), Rr = new Float32Array(N);
        an.l.getFloatTimeDomainData(L);
        an.r.getFloatTimeDomainData(Rr);
        const cx = size / 2, cy = size / 2, scale = size * 0.46;
        ctx.strokeStyle = stroke; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = cx + ((L[i] - Rr[i]) / Math.SQRT2) * scale;
          const y = cy - ((L[i] + Rr[i]) / Math.SQRT2) * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [role, color]);
  return <canvas ref={canvasRef} className="gonio-scope" />;
}

export function GoniometerBody() {
  return (
    <div className="gonio-wrap">
      <div className="gonio-cell"><span className="gonio-tag a">A</span><Scope role="mix" color="--a" /></div>
      <div className="gonio-cell"><span className="gonio-tag b">B</span><Scope role="reference" color="--b" /></div>
    </div>
  );
}

export function TilesBody({ mix, ref }: BodyProps) {
  const { regionA, offsetB } = useViewState();
  const [t0, t1] = regionA ?? [0, mix.meta.duration];
  const off = -offsetB;
  const iA = regionA ? R.regionIntegrated(mix, t0, t1) : mix.static.integrated;
  const iB = regionA ? R.regionIntegrated(ref, t0 + off, t1 + off) : ref.static.integrated;
  const tpA = regionA ? R.max(mix, "truePeak", t0, t1) : mix.static.truePeakMax;
  const tpB = regionA ? R.max(ref, "truePeak", t0 + off, t1 + off) : ref.static.truePeakMax;
  const crA = regionA ? R.mean(mix, "crest", t0, t1) : mix.static.crestAvg;
  const crB = regionA ? R.mean(ref, "crest", t0 + off, t1 + off) : ref.static.crestAvg;

  const tile = (label: string, a: number, b: number, fmt: (v: number) => string, unit: string) => (
    <div className="tile" key={label}>
      <span className="tile-l">{label}</span>
      <div className="tile-vals">
        <span className="tile-v a">{fmt(a)}</span>
        <span className="tile-v b">{fmt(b)}</span>
        <span className="tile-delta">
          {(a - b >= 0 ? "+" : "") + (a - b).toFixed(1)} {unit}
        </span>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 1 }}>
      <div className="tile-grid">
        {tile("Integrated LUFS", iA, iB, (v) => v.toFixed(1), "LU")}
        {tile("True peak", tpA, tpB, (v) => v.toFixed(1), "dB")}
        {tile("Crest", crA, crB, (v) => v.toFixed(1), "dB")}
      </div>
    </div>
  );
}

export function StereoTilesBody({ mix, ref }: BodyProps) {
  const { regionA, offsetB } = useViewState();
  const [t0, t1] = regionA ?? [0, mix.meta.duration];
  const off = -offsetB;
  const msA = regionA ? R.mean(mix, "sideMidRatio", t0, t1) : (mix.static.sideMidRatioAvg ?? 0);
  const msB = regionA ? R.mean(ref, "sideMidRatio", t0 + off, t1 + off) : (ref.static.sideMidRatioAvg ?? 0);
  const coA = regionA ? R.mean(mix, "correlation", t0, t1) : (mix.static.avgCorrelation ?? 0);
  const coB = regionA ? R.mean(ref, "correlation", t0 + off, t1 + off) : (ref.static.avgCorrelation ?? 0);
  const cref = useCanvasDraw((cv) => bandBars(cv, mix, ref), [mix, ref]);

  const tile = (label: string, a: number, b: number) => (
    <div className="tile" key={label}>
      <span className="tile-l">{label}</span>
      <div className="tile-vals">
        <span className="tile-v a">{a.toFixed(2)}</span>
        <span className="tile-v b">{b.toFixed(2)}</span>
        <span className="tile-delta">{(a - b >= 0 ? "+" : "") + (a - b).toFixed(2)}</span>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="tile-grid">
        {tile("Side/Mid ratio", msA, msB)}
        {tile("Avg correlation", coA, coB)}
      </div>
      <div style={{ height: 1, background: "var(--line)" }} />
      <div style={{ fontSize: 10, color: "var(--tx-3)", padding: "6px 10px 2px" }}>
        Width per band (S/M)
      </div>
      <div style={{ flex: 1, minHeight: 80 }}>
        <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </div>
  );
}

export function SummaryBody({ mix, ref }: BodyProps) {
  const rows: [string, number, number, string][] = [
    ["Integrated LUFS", mix.static.integrated, ref.static.integrated, "LUFS"],
    ["LRA", mix.static.lra, ref.static.lra, "LU"],
    ["True-peak max", mix.static.truePeakMax, ref.static.truePeakMax, "dBTP"],
    ["PLR", mix.static.plr, ref.static.plr, "dB"],
    ["Centroid", mix.static.centroidAvg ?? 0, ref.static.centroidAvg ?? 0, "Hz"],
    ["Tilt", mix.static.tilt ?? 0, ref.static.tilt ?? 0, "dB/oct"],
  ];
  return (
    <div style={{ flex: 1 }}>
      <div className="tile-grid">
        {rows.map(([l, a, b, u]) => (
          <div className="tile" key={l}>
            <span className="tile-l">{l}</span>
            <div className="tile-vals">
              <span className="tile-v a">{a.toFixed(1)}</span>
              <span className="tile-v b">{b.toFixed(1)}</span>
              <span className="tile-delta">{u}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaceholderBody({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="empty-slot" style={{ fontSize: 11, color: "var(--tx-3)" }}>
      {title} lands in {phase}
    </div>
  );
}
