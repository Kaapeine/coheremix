import { Menu } from "../../components/Menu";
import { Icon } from "../../components/Icon";
import { useViewState } from "../../store/viewState";

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
  onChange: (k: string) => void;
}

function MeterSlot({ id, taken, onChange }: MeterSlotProps) {
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
        <div className="empty-slot" style={{ fontSize: 11, color: "var(--tx-3)" }}>
          No data yet — loudness lands in Phase 1
        </div>
      </div>
    </div>
  );
}

export function MeterColumn() {
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
          onChange={(k) => handleChange(i, k)}
        />
      ))}
    </div>
  );
}
