import { Icon } from "../../components/Icon";
import { useViewState } from "../../store/viewState";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
}

interface Props {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  onRestart: () => void;
}

export function ControlRow({ playing, setPlaying, onRestart }: Props) {
  const loop = useViewState((s) => s.loop);
  const locked = useViewState((s) => s.locked);
  const playhead = useViewState((s) => s.playhead);
  const duration = useViewState((s) => s.duration);
  const set = useViewState((s) => s.set);
  const zoomBy = useViewState((s) => s.zoomBy);

  const zoomIn = () => zoomBy(0.8);
  const zoomOut = () => zoomBy(1.25);

  return (
    <div className="control-row">
      {/* back to start */}
      <button
        className="tbtn"
        onClick={onRestart}
        title="Back to start"
      >
        <Icon name="skipBack" size={14} />
      </button>

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

      {/* lock toggle */}
      <button
        className={`tbtn ${locked ? "on" : ""}`}
        onClick={() => set({ locked: !locked })}
        title={locked ? "Unlock lanes" : "Lock lanes"}
      >
        <Icon name={locked ? "lock" : "unlock"} size={14} />
      </button>
    </div>
  );
}
