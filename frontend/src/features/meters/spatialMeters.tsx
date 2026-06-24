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

/** Map correlation −1..+1 to 0..100% across the scale. */
const corrPct = (c: number) => ((Math.max(-1, Math.min(1, c)) + 1) / 2) * 100;

export function CorrelationMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  const cA = R.at(mix, "correlation", Math.max(0, playhead)) ?? 0;
  const cB = R.at(ref, "correlation", Math.max(0, playhead - offsetB)) ?? 0;
  const row = (label: string, c: number, cls: "a" | "b") => (
    <div className="corr-row" key={label}>
      <span className="lbl">
        <span className="dot" style={{ background: `var(--${cls})` }} />
        {label}
        <span className="v">{c.toFixed(2)}</span>
      </span>
      <div className="corr-scale">
        <span className={`corr-needle ${cls}`} style={{ left: `calc(${corrPct(c)}% - 1.5px)` }} />
      </div>
      <div className="corr-axis"><span>−1</span><span>0</span><span>+1</span></div>
    </div>
  );
  return (
    <div className="corr-meter">
      {row("A · mix", cA, "a")}
      {row("B · ref", cB, "b")}
    </div>
  );
}

/** Balance in dB → horizontal offset from centre. Positive = right louder. */
export function BalanceMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  const bA = R.at(mix, "balance", Math.max(0, playhead)) ?? 0;
  const bB = R.at(ref, "balance", Math.max(0, playhead - offsetB)) ?? 0;
  const pct = (db: number) => 50 + (Math.max(-12, Math.min(12, db)) / 12) * 50;
  const row = (label: string, db: number, cls: "a" | "b") => (
    <div className="corr-row" key={label}>
      <span className="lbl">
        <span className="dot" style={{ background: `var(--${cls})` }} />
        {label}
        <span className="v">{(db >= 0 ? "+" : "") + db.toFixed(1)} dB</span>
      </span>
      <div className="corr-scale" style={{ background: "var(--surface-3)" }}>
        <span className={`corr-needle ${cls}`} style={{ left: `calc(${pct(db)}% - 1.5px)` }} />
      </div>
      <div className="corr-axis"><span>L</span><span>·</span><span>R</span></div>
    </div>
  );
  return (
    <div className="corr-meter">
      {row("A · mix", bA, "a")}
      {row("B · ref", bB, "b")}
    </div>
  );
}
