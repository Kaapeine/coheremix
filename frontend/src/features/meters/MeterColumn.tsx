import { Menu } from "../../components/Menu";
import { Icon } from "../../components/Icon";
import { useViewState } from "../../store/viewState";
import type { TrackPayload } from "../../types/payload";
import { LufsMeter, TruePeakMeter, PsrMeter, MeterPlaceholder } from "./meters";
import { CorrelationMeter, BalanceMeter } from "./spatialMeters";

const METERS: Record<string, string> = {
  lufs: "LUFS",
  truepeak: "True Peak",
  psr: "PSR / Dynamics",
  correlation: "Correlation",
  balance: "Stereo Balance",
  rms: "RMS",
};

interface MeterSlotProps {
  id: string;
  taken: string[];
  mix: TrackPayload | null;
  ref: TrackPayload | null;
  onChange: (k: string) => void;
}

function MeterSlot({ id, taken, mix, ref, onChange }: MeterSlotProps) {
  return (
    <div className="meter-slot">
      <div className="meter-head">
        <span className="mt">{METERS[id]}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <Menu
          align="right"
          width={180}
          trigger={(_open, toggle) => (
            <button className="ptool" onClick={toggle} title="Change meter">
              <Icon name="chevron" size={14} />
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="menu-label">Meter</div>
              {Object.keys(METERS).map((k) => {
                const isOtherSlot = taken.includes(k) && k !== id;
                return (
                  <div
                    key={k}
                    className={`menu-item${id === k ? " sel-on" : ""}`}
                    style={{
                      opacity: isOtherSlot ? 0.4 : 1,
                      pointerEvents: isOtherSlot ? "none" : "auto",
                    }}
                    onClick={() => {
                      onChange(k);
                      close();
                    }}
                  >
                    {METERS[k]}
                  </div>
                );
              })}
            </div>
          )}
        </Menu>
      </div>
      <div className="meter-body">
        {!mix || !ref ? (
          <MeterPlaceholder title={METERS[id]} phase="analysis" />
        ) : id === "lufs" ? (
          <LufsMeter mix={mix} ref={ref} />
        ) : id === "truepeak" ? (
          <TruePeakMeter mix={mix} ref={ref} />
        ) : id === "psr" ? (
          <PsrMeter mix={mix} ref={ref} />
        ) : id === "correlation" ? (
          <CorrelationMeter mix={mix} ref={ref} />
        ) : id === "balance" ? (
          <BalanceMeter mix={mix} ref={ref} />
        ) : (
          <MeterPlaceholder title={METERS[id]} phase="a later phase" />
        )}
      </div>
    </div>
  );
}

interface MeterColumnProps {
  mix: TrackPayload | null;
  ref: TrackPayload | null;
}

export function MeterColumn({ mix, ref }: MeterColumnProps) {
  const meterSlots = useViewState((s) => s.meterSlots);
  const set = useViewState((s) => s.set);

  const handleChange = (idx: number, k: string) => {
    const next: [string, string] = [meterSlots[0], meterSlots[1]];
    next[idx] = k;
    set({ meterSlots: next });
  };

  return (
    <div className="meter-col">
      {meterSlots.map((id, i) => (
        <MeterSlot
          key={i}
          id={id}
          taken={meterSlots}
          mix={mix}
          ref={ref}
          onChange={(k) => handleChange(i, k)}
        />
      ))}
    </div>
  );
}
