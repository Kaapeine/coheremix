import { useRef } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  /** Map the knob's rotation logarithmically onto [min, max] (for wide-range values). */
  log?: boolean;
  /** Snap to one of these values (overrides continuous min/max mapping). */
  steps?: number[];
  defaultValue: number;
  label: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
  size?: number;
}

const DRAG_PX_FOR_FULL_RANGE = 150;
const ANGLE_MIN = -135;
const ANGLE_MAX = 135;

function toFraction(v: number, min: number, max: number, log?: boolean): number {
  if (log) {
    const lv = Math.log(v), lmin = Math.log(min), lmax = Math.log(max);
    return (lv - lmin) / (lmax - lmin);
  }
  return (v - min) / (max - min);
}

function fromFraction(f: number, min: number, max: number, log?: boolean): number {
  const c = Math.max(0, Math.min(1, f));
  if (log) {
    const lmin = Math.log(min), lmax = Math.log(max);
    return Math.exp(lmin + c * (lmax - lmin));
  }
  return min + c * (max - min);
}

export function Knob({ value, min, max, log, steps, defaultValue, label, format, onChange, size = 36 }: Props) {
  const dragRef = useRef<{ startY: number; startFrac: number } | null>(null);

  const frac = steps
    ? steps.indexOf(value) / (steps.length - 1)
    : toFraction(value, min, max, log);
  const angle = ANGLE_MIN + frac * (ANGLE_MAX - ANGLE_MIN);

  const commit = (f: number) => {
    if (steps) {
      const i = Math.round(f * (steps.length - 1));
      onChange(steps[Math.max(0, Math.min(steps.length - 1, i))]);
    } else {
      onChange(fromFraction(f, min, max, log));
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startFrac: frac };
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (drag.startY - ev.clientY) / DRAG_PX_FOR_FULL_RANGE;
      commit(drag.startFrac + delta);
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const r = size / 2;
  const knobR = r - 3;

  return (
    <div className="knob-wrap" style={{ width: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="knob"
        onMouseDown={onMouseDown}
        onDoubleClick={() => onChange(defaultValue)}
      >
        <circle cx={r} cy={r} r={knobR} className="knob-body" />
        <line
          x1={r}
          y1={r}
          x2={r + knobR * 0.75 * Math.sin((angle * Math.PI) / 180)}
          y2={r - knobR * 0.75 * Math.cos((angle * Math.PI) / 180)}
          className="knob-pointer"
        />
      </svg>
      <div className="knob-label">{label}</div>
      <div className="knob-value mono">{format(value)}</div>
    </div>
  );
}
