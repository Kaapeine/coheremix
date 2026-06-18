/* eslint-disable react-hooks/refs -- `ref` here is the B/reference-track payload
 * (MeterProps.ref: TrackPayload), not a React ref object; the rule taints on the
 * prop key name and can't tell the two apart. */
import type { ReactNode } from "react";
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import * as R from "../analysis/read";

interface MeterProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

/** Labeled tick scale alongside a vertical bar pair, sharing the bars' lo/hi mapping. */
function VScale({ lo, hi, ticks }: { lo: number; hi: number; ticks: number[] }) {
  const yOf = (x: number) => 100 - (Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * 100);
  return (
    <div className="vscale">
      {ticks.map((t) => (
        <div key={t} className="vscale-tick" style={{ top: `${yOf(t)}%` }}>
          <span className="vscale-lbl">{t}</span>
          <span className="vscale-line" />
        </div>
      ))}
    </div>
  );
}

/**
 * Vertical level bar (true-peak style). `v` is already in dB/LUFS, a log
 * scale, so mapping it linearly to height is the correct (not an
 * additional log) transform.
 */
function VBar({
  label, color, v, lo, hi, ticks, status, sub,
}: {
  label: string; color: string; v: number; lo: number; hi: number; ticks: number[];
  status?: { text: string; cls: string }; sub?: ReactNode;
}) {
  const yOf = (x: number) => Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * 100;
  return (
    <div className="tp-track">
      <div className="tp-head">
        <span className="dot" style={{ background: color }} />
        <span className="nm">{label}</span>
      </div>
      <div className="tp-cols">
        <div className="tp-col">
          <div className="vbar-row">
            <VScale lo={lo} hi={hi} ticks={ticks} />
            <div className="tp-bar">
              <div className="fill" style={{ height: yOf(v) + "%", background: color }} />
            </div>
          </div>
        </div>
      </div>
      <div className="tp-read">
        <span className="v" style={{ color: status?.cls === "clip" ? "var(--warn)" : "var(--tx-1)" }}>{v.toFixed(1)}</span>
        {status && <span className={`over ${status.cls}`}>{status.text}</span>}
      </div>
      {sub}
    </div>
  );
}

export function LufsMeter({ mix, ref }: MeterProps) {
  const { playhead: t, offsetB } = useViewState();
  const stA = R.winMean(mix, "shortTermLUFS", t, 3);
  const stB = R.winMean(ref, "shortTermLUFS", t + offsetB, 3);
  const moA = R.winMean(mix, "momentaryLUFS", t, 0.4);
  const moB = R.winMean(ref, "momentaryLUFS", t + offsetB, 0.4);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="meter-sublabel">Short-term LUFS</div>
      <div className="tp-wrap">
        <VBar label="A" color="var(--a)" v={stA} lo={-30} hi={0} ticks={[0, -6, -12, -18, -24, -30]}
          sub={<div className="mom-sub"><span className="mk">Mom</span><span className="mv a" style={{ color: "var(--a)" }}>{moA.toFixed(1)}</span></div>} />
        <VBar label="B" color="var(--b)" v={stB} lo={-30} hi={0} ticks={[0, -6, -12, -18, -24, -30]}
          sub={<div className="mom-sub"><span className="mk">Mom</span><span className="mv b" style={{ color: "var(--b)" }}>{moB.toFixed(1)}</span></div>} />
      </div>
    </div>
  );
}

export function TruePeakMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  const tpA = R.at(mix, "truePeak", Math.max(0, playhead));
  const tpB = R.at(ref, "truePeak", Math.max(0, playhead + offsetB));
  const overA = tpA > -1, overB = tpB > -1;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="tp-wrap">
        <VBar label="A · mix" color={overA ? "var(--warn)" : "var(--a)"} v={tpA} lo={-18} hi={0} ticks={[0, -3, -6, -9, -12, -15, -18]}
          status={{ text: overA ? "OVER" : "−1 dBTP ok", cls: overA ? "clip" : "ok" }} />
        <VBar label="B · ref" color={overB ? "var(--warn)" : "var(--b)"} v={tpB} lo={-18} hi={0} ticks={[0, -3, -6, -9, -12, -15, -18]}
          status={{ text: overB ? "OVER" : "−1 dBTP ok", cls: overB ? "clip" : "ok" }} />
      </div>
    </div>
  );
}

export function MeterPlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="empty-slot" style={{ fontSize: 11, color: "var(--tx-3)" }}>
      {title} lands in {phase}
    </div>
  );
}
