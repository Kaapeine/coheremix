/* eslint-disable react-hooks/refs -- `ref` here is the B/reference-track payload
 * (BodyProps.ref: TrackPayload), not a React ref object; the rule taints on the
 * prop key name and can't tell the two apart. */
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { useCanvasDraw } from "./useCanvasDraw";
import { lufsLane, valueLane } from "./draw";
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

export function TilesBody({ mix, ref }: BodyProps) {
  const { regionA, offsetB } = useViewState();
  const [t0, t1] = regionA ?? [0, mix.meta.duration];
  const off = offsetB;
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

export function SummaryBody({ mix, ref }: BodyProps) {
  const rows: [string, number, number, string][] = [
    ["LRA", mix.static.lra, ref.static.lra, "LU"],
    ["True-peak max", mix.static.truePeakMax, ref.static.truePeakMax, "dBTP"],
    ["PLR", mix.static.plr, ref.static.plr, "dB"],
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
