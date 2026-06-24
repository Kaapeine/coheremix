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
        <div className="brand-mark" />
        <span className="brand-name">CohereMix</span>
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
              onClick={() => navigate("/")}
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
              onClick={() => navigate("/")}
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
                navigate("/");
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
