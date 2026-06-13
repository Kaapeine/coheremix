import { Icon } from "../../components/Icon";
import { Menu } from "../../components/Menu";
import { useViewState, type MatchMode } from "../../store/viewState";

const MATCH_OPTIONS: { value: MatchMode; label: string }[] = [
  { value: "integrated", label: "Integrated" },
  { value: "shortterm", label: "Short-term" },
  { value: "region", label: "Region" },
  { value: "off", label: "Off" },
];

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
}

interface Props {
  playing: boolean;
  setPlaying: (v: boolean) => void;
}

export function ControlRow({ playing, setPlaying }: Props) {
  const loop = useViewState((s) => s.loop);
  const secPerPx = useViewState((s) => s.secPerPx);
  const linked = useViewState((s) => s.linked);
  const matchMode = useViewState((s) => s.matchMode);
  const playhead = useViewState((s) => s.playhead);
  const duration = useViewState((s) => s.duration);
  const set = useViewState((s) => s.set);

  const zoomIn = () => set({ secPerPx: Math.max(0.004, secPerPx * 0.8) });
  const zoomOut = () => set({ secPerPx: Math.min(0.5, secPerPx * 1.25) });

  return (
    <div className="control-row">
      {/* play / pause */}
      <button
        className="tbtn play"
        onClick={() => setPlaying(!playing)}
        title="Play / pause (Space)"
      >
        <Icon name={playing ? "pause" : "play"} size={14} />
      </button>

      {/* loop */}
      <button
        className={`tbtn accent ${loop.enabled ? "on" : ""}`}
        onClick={() => set({ loop: { enabled: !loop.enabled } })}
        title="Loop region (L)"
      >
        <Icon name="loop" size={14} />
      </button>

      <div className="ctrl-divider" />

      {/* zoom */}
      <div className="ctrl-group">
        <button className="tbtn" onClick={zoomOut} title="Zoom out (−)">
          <Icon name="zoomOut" size={14} />
        </button>
        <button className="tbtn" onClick={zoomIn} title="Zoom in (+)">
          <Icon name="zoomIn" size={14} />
        </button>
      </div>

      <div className="ctrl-divider" />

      {/* time readout */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "var(--tx-1)" }}>{fmtTime(playhead)}</span>
        <span style={{ color: "var(--tx-3)", margin: "0 3px" }}>/</span>
        <span style={{ color: "var(--tx-3)" }}>{fmtTime(duration)}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* link toggle */}
      <button
        className={`tbtn ${linked ? "on" : ""}`}
        onClick={() => set({ linked: !linked })}
        title="Link lanes"
      >
        <Icon name="link" size={14} />
      </button>

      <div className="ctrl-divider" />

      {/* match mode */}
      <Menu
        trigger={(_open, toggle) => (
          <button
            className="tbtn"
            onClick={toggle}
            style={{ gap: 6, padding: "0 10px" }}
          >
            <span
              style={{
                fontSize: 9.5,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--tx-3)",
              }}
            >
              Match
            </span>
            <span style={{ fontSize: 11.5, color: "var(--tx-1)" }}>
              {MATCH_OPTIONS.find((o) => o.value === matchMode)?.label ??
                "Integrated"}
            </span>
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="menu-label">Loudness match</div>
            {MATCH_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={`menu-item ${matchMode === opt.value ? "sel-on" : ""}`}
                onClick={() => {
                  set({ matchMode: opt.value });
                  close();
                }}
              >
                {opt.label}
                {matchMode === opt.value && (
                  <span className="check">✓</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Menu>
    </div>
  );
}
