/* eslint-disable react-hooks/refs -- `ref` here is the B/reference-track payload
 * (MeterProps.ref: TrackPayload), not a React ref object; the rule taints on the
 * prop key name and can't tell the two apart. */
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import * as R from "../analysis/read";

interface MeterProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

function BarMeter({
  rows, lo, hi, target, fmt,
}: {
  rows: { k: string; cls: string; color: string; v: number }[];
  lo: number; hi: number; target?: number; fmt?: (v: number) => string;
}) {
  const pct = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100;
  return (
    <div className="bar-meter">
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <span className="bk" style={{ color: r.color }}>{r.k}</span>
          <div className="bar-track">
            <div className={`bar-fill ${r.cls}`} style={{ width: pct(r.v) + "%" }} />
            {target !== undefined && <div className="bar-tick" style={{ left: pct(target) + "%" }} />}
          </div>
          <span className="bar-val">{fmt ? fmt(r.v) : r.v.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function LufsMeter({ mix, ref }: MeterProps) {
  const { playhead: t, offsetB, target } = useViewState();
  const stA = R.winMean(mix, "shortTermLUFS", t, 3);
  const stB = R.winMean(ref, "shortTermLUFS", t + offsetB, 3);
  const moA = R.winMean(mix, "momentaryLUFS", t, 0.4);
  const moB = R.winMean(ref, "momentaryLUFS", t + offsetB, 0.4);
  return (
    <div>
      <div className="meter-sublabel">Short-term · target {target}</div>
      <BarMeter lo={-30} hi={-4} target={target}
        rows={[
          { k: "A", cls: "a", color: "var(--a)", v: stA },
          { k: "B", cls: "b", color: "var(--b)", v: stB },
        ]} />
      <div className="mom-line">
        <span><span className="mk">Mom A</span><span className="mv a" style={{ color: "var(--a)" }}>{moA.toFixed(1)}</span></span>
        <span><span className="mk">B</span><span className="mv b" style={{ color: "var(--b)" }}>{moB.toFixed(1)}</span></span>
      </div>
    </div>
  );
}

function TpColumn({ track, role, t }: { track: TrackPayload; role: "a" | "b"; t: number }) {
  const tp = R.at(track, "truePeak", Math.max(0, t));
  const over = tp > -1;
  const yOf = (v: number) => Math.max(0, Math.min(1, (v + 18) / 18)) * 100; // -18..0 dBTP
  const col = over ? "var(--warn)" : role === "a" ? "var(--a)" : "var(--b)";
  return (
    <div className="tp-track">
      <div className="tp-head">
        <span className="dot" style={{ background: role === "a" ? "var(--a)" : "var(--b)" }} />
        <span className="nm">{role === "a" ? "A · mix" : "B · ref"}</span>
      </div>
      <div className="tp-cols">
        <div className="tp-col">
          <div className="tp-bar">
            <div className="fill" style={{ height: yOf(tp) + "%", background: col }} />
          </div>
        </div>
      </div>
      <div className="tp-read">
        <span className="v" style={{ color: over ? "var(--warn)" : "var(--tx-1)" }}>{tp.toFixed(1)}</span>
        <span className={`over ${over ? "clip" : "ok"}`}>{over ? "OVER" : "−1 dBTP ok"}</span>
      </div>
    </div>
  );
}

export function TruePeakMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  return (
    <div className="tp-wrap">
      <TpColumn track={mix} role="a" t={playhead} />
      <TpColumn track={ref} role="b" t={playhead + offsetB} />
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
