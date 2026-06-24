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

export function SpectrumBody({ mix, ref }: BodyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Held frames: last non-silent analyser reading per track (dB arrays).
  const heldA = useRef<Float32Array | null>(null);
  const heldB = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssVar = (n: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const sr = audioTap.sampleRate();
    let raf = 0;

    const read = (role: "mix" | "reference", held: typeof heldA) => {
      const an = audioTap.analyser(role);
      if (!an) return held.current;
      const buf = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(buf); // dB, −Infinity when silent
      let peak = -Infinity;
      for (let i = 0; i < buf.length; i++) if (buf[i] > peak) peak = buf[i];
      if (peak > -100) held.current = buf; // only overwrite on real signal (hold-on-pause)
      return held.current;
    };

    const draw = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const a = cssVar("--a"), b = cssVar("--b"), line = "rgba(255,255,255,0.06)", tx3 = cssVar("--tx-3");
      const padL = 30, padB = 14, dbLo = -100, dbHi = -20;
      const plotH = h - padB;
      const xOf = (f: number) =>
        padL + ((Math.log10(f) - Math.log10(SPEC_F_LO)) / (Math.log10(SPEC_F_HI) - Math.log10(SPEC_F_LO))) * (w - padL);
      const yOf = (db: number) => plotH - ((Math.max(dbLo, Math.min(dbHi, db)) - dbLo) / (dbHi - dbLo)) * plotH;
      ctx.font = '9px "JetBrains Mono", monospace';
      // x-axis baseline + major decade gridlines
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, plotH + 0.5); ctx.lineTo(w, plotH + 0.5); ctx.stroke();
      for (const f of [100, 1000, 10000]) {
        const x = xOf(f);
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, plotH); ctx.stroke();
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
          ctx.strokeStyle = minorLine; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, plotH); ctx.stroke();
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
      live(read("mix", heldA), a, audioTap.analyser("mix"));
      live(read("reference", heldB), b, audioTap.analyser("reference"));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mix, ref]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
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
