import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Menu } from "../../components/Menu";
import { api } from "../../api/client";
import type { TrackPayload } from "../../types/payload";

function HeaderChip({
  payload,
  role,
  onClick,
}: {
  payload: TrackPayload;
  role: "a" | "b";
  onClick: () => void;
}) {
  const { fileInfo } = payload;
  const info = `${fileInfo.format} · ${(fileInfo.sampleRate / 1000).toFixed(1)} kHz · ${fileInfo.channels === 2 ? "Stereo" : fileInfo.channels + "ch"}`;
  return (
    <div
      className="chip"
      onClick={onClick}
      title="Replace this track / view info"
    >
      <span className={`chip-dot ${role}`} />
      <div className="chip-meta">
        <span className="chip-name">{payload.name}</span>
        <span className="chip-info mono">{info}</span>
      </div>
      <span className="chip-role">{role === "a" ? "mix" : "ref"}</span>
    </div>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Toggle A / B", ["Tab"]],
  ["Play / pause", ["Space"]],
  ["Loop region", ["L"]],
  ["Clear region", ["Esc"]],
  ["Zoom in / out", ["+", "−"]],
];

interface Props {
  compId: string;
  mixPayload: TrackPayload | null;
  refPayload: TrackPayload | null;
  onSwapped: () => void;
}

export function Header({ compId, mixPayload, refPayload, onSwapped }: Props) {
  const navigate = useNavigate();
  const dLufs =
    mixPayload && refPayload
      ? mixPayload.gainMatch.integratedLUFS -
        refPayload.gainMatch.integratedLUFS
      : null;

  const handleSwap = async () => {
    await api.swap(compId);
    onSwapped();
  };

  return (
    <div className="header">
      {/* brand */}
      <div className="brand">
        <svg
          className="brand-mark"
          viewBox="0 0 128 128"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="brand-grad" x1="18" y1="110" x2="110" y2="18" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#f2a93b"/>
              <stop offset="1" stop-color="#3fcfe0"/>
            </linearGradient>
          </defs>
          <rect width="128" height="128" rx="28" fill="#13110e"/>
          <path d="M 110.0,64.0 L 109.6,68.1 L 108.3,72.2 L 106.3,76.2 L 103.5,80.2 L 100.0,84.0 L 95.8,87.6 L 91.0,91.0 L 85.8,94.3 L 80.2,97.2 L 74.2,100.0 L 68.1,102.4 L 61.9,104.5 L 55.8,106.3 L 49.8,107.7 L 44.0,108.8 L 38.7,109.6 L 33.7,110.0 L 29.4,110.0 L 25.6,109.6 L 22.6,108.8 L 20.3,107.7 L 18.7,106.3 L 18.0,104.5 L 18.2,102.4 L 19.2,100.0 L 20.9,97.2 L 23.5,94.3 L 26.8,91.0 L 30.8,87.6 L 35.3,84.0 L 40.4,80.2 L 45.9,76.2 L 51.8,72.2 L 57.8,68.1 L 64.0,64.0 L 70.2,59.9 L 76.2,55.8 L 82.1,51.8 L 87.6,47.8 L 92.7,44.0 L 97.2,40.4 L 101.2,37.0 L 104.5,33.7 L 107.1,30.8 L 108.8,28.0 L 109.8,25.6 L 110.0,23.5 L 109.3,21.7 L 107.7,20.3 L 105.4,19.2 L 102.4,18.4 L 98.6,18.0 L 94.3,18.0 L 89.3,18.4 L 84.0,19.2 L 78.2,20.3 L 72.2,21.7 L 66.1,23.5 L 59.9,25.6 L 53.8,28.0 L 47.8,30.8 L 42.2,33.7 L 37.0,37.0 L 32.2,40.4 L 28.0,44.0 L 24.5,47.8 L 21.7,51.8 L 19.7,55.8 L 18.4,59.9 L 18.0,64.0 L 18.4,68.1 L 19.7,72.2 L 21.7,76.2 L 24.5,80.2 L 28.0,84.0 L 32.2,87.6 L 37.0,91.0 L 42.2,94.3 L 47.8,97.2 L 53.8,100.0 L 59.9,102.4 L 66.1,104.5 L 72.2,106.3 L 78.2,107.7 L 84.0,108.8 L 89.3,109.6 L 94.3,110.0 L 98.6,110.0 L 102.4,109.6 L 105.4,108.8 L 107.7,107.7 L 109.3,106.3 L 110.0,104.5 L 109.8,102.4 L 108.8,100.0 L 107.1,97.2 L 104.5,94.3 L 101.2,91.0 L 97.2,87.6 L 92.7,84.0 L 87.6,80.2 L 82.1,76.2 L 76.2,72.2 L 70.2,68.1 L 64.0,64.0 L 57.8,59.9 L 51.8,55.8 L 45.9,51.8 L 40.4,47.8 L 35.3,44.0 L 30.8,40.4 L 26.8,37.0 L 23.5,33.7 L 20.9,30.8 L 19.2,28.0 L 18.2,25.6 L 18.0,23.5 L 18.7,21.7 L 20.3,20.3 L 22.6,19.2 L 25.6,18.4 L 29.4,18.0 L 33.7,18.0 L 38.7,18.4 L 44.0,19.2 L 49.8,20.3 L 55.8,21.7 L 61.9,23.5 L 68.1,25.6 L 74.2,28.0 L 80.2,30.8 L 85.8,33.7 L 91.0,37.0 L 95.8,40.4 L 100.0,44.0 L 103.5,47.8 L 106.3,51.8 L 108.3,55.8 L 109.6,59.9 L 110.0,64.0" fill="none" stroke="url(#brand-grad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span className="brand-name">CoheMix</span>
      </div>

      {/* readout pills */}
      <div className="hdr-readouts">
        <div
          className="offset-pill"
          title="Raw integrated-loudness difference (not corrected away)"
        >
          <span className="ol">ΔLUFS A−B</span>
          <span className="ov mono" style={{ color: "var(--tx-1)" }}>
            {dLufs !== null
              ? `${dLufs >= 0 ? "+" : ""}${dLufs.toFixed(1)} LU`
              : "—"}
          </span>
        </div>
      </div>

      <div className="header-spacer" />

      {/* chips + swap */}
      {mixPayload && refPayload && (
        <>
          <div className="chips">
            <HeaderChip
              payload={mixPayload}
              role="a"
              onClick={() => navigate("/library")}
            />
            <button
              className="swap-btn"
              onClick={handleSwap}
              title="Swap A / B roles"
            >
              <Icon name="swap" size={15} />
            </button>
            <HeaderChip
              payload={refPayload}
              role="b"
              onClick={() => navigate("/library")}
            />
          </div>
          <div className="ctrl-divider" />
        </>
      )}

      {/* help */}
      <Menu
        align="right"
        trigger={(_open, toggle) => (
          <button className="icon-btn" onClick={toggle} title="Shortcuts">
            <Icon name="help" />
          </button>
        )}
      >
        {() => (
          <div style={{ width: 230 }}>
            <div className="menu-label">Keyboard</div>
            {SHORTCUTS.map(([label, keys]) => (
              <div className="kbd-row" key={label}>
                <span>{label}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </Menu>

      {/* settings */}
      <Menu
        align="right"
        width={210}
        trigger={(_open, toggle) => (
          <button className="icon-btn" onClick={toggle} title="Settings">
            <Icon name="settings" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="menu-label">Navigation</div>
            <div
              className="menu-item"
              onClick={() => {
                close();
                navigate("/library");
              }}
            >
              ← Back to library
            </div>
          </div>
        )}
      </Menu>
    </div>
  );
}
