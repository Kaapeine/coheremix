import type { ReactNode } from "react";
import { Menu } from "../../components/Menu";
import { Icon } from "../../components/Icon";
import { Knob } from "../../components/Knob";
import { OCTAVE_FRACTIONS, useViewState } from "../../store/viewState";
import type { TrackPayload } from "../../types/payload";
import {
  ShortTermLufsBody, CrestBody, TilesBody, SummaryBody, LtasBody, BandDeltaBody, SpectrumBody, CorrelationBody, StereoTilesBody, GoniometerBody, SpectrogramBody, PlaceholderBody, TimeOverlay,
} from "./bodies";

const VIEWS: Record<string, { title: string; sub: string; family: string; kind: string }> = {
  shortTermLufs: { title: "Short-term LUFS", sub: "loudness · section-feel", family: "Loudness", kind: "time" },
  crest:         { title: "Crest factor", sub: "where it's being limited", family: "Loudness", kind: "time" },
  ltas:          { title: "LTAS — tonal balance", sub: "long-term average spectrum", family: "Frequency", kind: "freq" },
  liveSpectrum:  { title: "Live spectrum", sub: "real-time · holds on pause", family: "Frequency", kind: "freq" },
  bandDelta:     { title: "Band-energy delta", sub: "A relative to B · whole file", family: "Frequency", kind: "freq" },
  correlation:   { title: "Phase correlation", sub: "mono-compatibility", family: "Stereo", kind: "time" },
  stereoTiles:   { title: "Side/Mid width", sub: "region ratio + per-band width", family: "Stereo", kind: "tiles" },
  goniometer:    { title: "Goniometer", sub: "real-time · A | B side-by-side", family: "Stereo", kind: "freq" },
  spectrogram:   { title: "Spectrogram", sub: "A-row over B-row", family: "Spectrogram", kind: "time" },
  tiles:         { title: "Region readout", sub: "matched aggregates", family: "Summary", kind: "tiles" },
  summary:       { title: "Static summary", sub: "whole-file aggregates", family: "Summary", kind: "summary" },
};

const PHASE_FOR: Record<string, string> = {};

const FAMILY_ORDER = ["Loudness", "Frequency", "Stereo", "Spectrogram", "Summary"];

interface ViewPickerProps {
  current: string | null;
  onPick: (id: string) => void;
  close: () => void;
}

function ViewPicker({ current, onPick, close }: ViewPickerProps) {
  return (
    <div>
      {FAMILY_ORDER.map((fam) => (
        <div key={fam}>
          <div className="menu-label">{fam}</div>
          {Object.keys(VIEWS)
            .filter((k) => VIEWS[k].family === fam)
            .map((k) => (
              <div
                key={k}
                className={`menu-item${current === k ? " sel-on" : ""}`}
                onClick={() => {
                  onPick(k);
                  close();
                }}
              >
                {VIEWS[k].title}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

const OCTAVE_VALUES = OCTAVE_FRACTIONS.map((f) => {
  const [n, d] = f.split("/").map(Number);
  return d ? n / d : n;
});

function SpectrumSettings() {
  const spectrumAvgMs = useViewState((s) => s.spectrumAvgMs);
  const spectrumOctaves = useViewState((s) => s.spectrumOctaves);
  const set = useViewState((s) => s.set);
  const octaveValue = OCTAVE_VALUES[OCTAVE_FRACTIONS.indexOf(spectrumOctaves)];

  return (
    <div className="spectrum-settings">
      <Knob
        value={spectrumAvgMs}
        min={5}
        max={10000}
        log
        defaultValue={300}
        label="Averaging"
        format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`)}
        onChange={(v) => set({ spectrumAvgMs: v })}
      />
      <Knob
        value={octaveValue}
        min={OCTAVE_VALUES[0]}
        max={OCTAVE_VALUES[OCTAVE_VALUES.length - 1]}
        steps={OCTAVE_VALUES}
        defaultValue={OCTAVE_VALUES[OCTAVE_FRACTIONS.indexOf("1/24")]}
        label="Smoothing"
        format={(v) => `${OCTAVE_FRACTIONS[OCTAVE_VALUES.indexOf(v)]} oct`}
        onChange={(v) => {
          const idx = OCTAVE_VALUES.indexOf(v);
          set({ spectrumOctaves: OCTAVE_FRACTIONS[idx] });
        }}
      />
    </div>
  );
}

interface PanelProps {
  id: string;
  idx: number;
  count: number;
  mix: TrackPayload | null;
  ref: TrackPayload | null;
  onChange: (k: string) => void;
  onMove: (dir: number) => void;
  onClose: () => void;
}

function Panel({ id, idx, count, mix, ref, onChange, onMove, onClose }: PanelProps) {
  const v = VIEWS[id] ?? { title: id, sub: "", family: "", kind: "soon" };
  const isTime = v.kind === "time";
  let body: ReactNode;
  if (!mix || !ref) {
    body = <PlaceholderBody title={v.title} phase="analysis" />;
  } else if (id === "shortTermLufs") {
    body = <ShortTermLufsBody mix={mix} ref={ref} />;
  } else if (id === "crest") {
    body = <CrestBody mix={mix} ref={ref} />;
  } else if (id === "tiles") {
    body = <TilesBody mix={mix} ref={ref} />;
  } else if (id === "summary") {
    body = <SummaryBody mix={mix} ref={ref} />;
  } else if (id === "ltas") {
    body = <LtasBody mix={mix} ref={ref} />;
  } else if (id === "bandDelta") {
    body = <BandDeltaBody mix={mix} ref={ref} />;
  } else if (id === "liveSpectrum") {
    body = <SpectrumBody mix={mix} ref={ref} />;
  } else if (id === "correlation") {
    body = <CorrelationBody mix={mix} ref={ref} />;
  } else if (id === "stereoTiles") {
    body = <StereoTilesBody mix={mix} ref={ref} />;
  } else if (id === "goniometer") {
    body = <GoniometerBody />;
  } else if (id === "spectrogram") {
    body = <SpectrogramBody mix={mix} ref={ref} />;
  } else {
    body = <PlaceholderBody title={v.title} phase={PHASE_FOR[id] ?? "a later phase"} />;
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <Menu
          width={210}
          trigger={(_open, toggle) => (
            <button className="ptool" onClick={toggle} title="Change view" style={{ width: 22 }}>
              <Icon name="chevron" size={14} />
            </button>
          )}
        >
          {(close) => (
            <ViewPicker current={id} onPick={(k) => onChange(k)} close={close} />
          )}
        </Menu>
        <span className="panel-title">{v.title}</span>
        <span className="panel-sub">· {v.sub}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="panel-tools">
          {id === "liveSpectrum" && (
            <Menu
              align="right"
              width={150}
              trigger={(_open, toggle) => (
                <button className="ptool" onClick={toggle} title="Spectrum settings">
                  <Icon name="settings" size={14} />
                </button>
              )}
            >
              <SpectrumSettings />
            </Menu>
          )}
          <button
            className="ptool"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            style={{ opacity: idx === 0 ? 0.3 : 1 }}
            title="Move up"
          >
            <Icon name="up" size={14} />
          </button>
          <button
            className="ptool"
            onClick={() => onMove(1)}
            disabled={idx === count - 1}
            style={{ opacity: idx === count - 1 ? 0.3 : 1 }}
            title="Move down"
          >
            <Icon name="down" size={14} />
          </button>
          <button className="ptool" onClick={onClose} title="Remove panel">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
      <div className="panel-body">
        {body}
        {isTime && <TimeOverlay />}
      </div>
    </div>
  );
}

interface WorkspaceProps {
  mix: TrackPayload | null;
  ref: TrackPayload | null;
}

export function PanelWorkspace({ mix, ref }: WorkspaceProps) {
  const panels = useViewState((s) => s.panels);
  const set = useViewState((s) => s.set);

  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= panels.length) return;
    const next = panels.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set({ panels: next });
  };

  const addPanel = (id: string) => {
    set({ panels: [...panels, id] });
  };

  return (
    <div className="workspace">
      <div className="workspace-bar">
        <span className="wb-title">Analysis panels</span>
        <span className="wb-count" style={{ marginLeft: 6 }}>
          {panels.length}
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <Menu
          align="right"
          width={210}
          trigger={(_open, toggle) => (
            <button className="add-panel" onClick={toggle}>
              <Icon name="plus" size={12} />
              Add panel
            </button>
          )}
        >
          {(close) => (
            <ViewPicker current={null} onPick={addPanel} close={close} />
          )}
        </Menu>
      </div>
      <div className="workspace-scroll scroll-y" style={{ flex: 1 }}>
        {panels.map((id, i) => (
          <Panel
            key={id + i}
            id={id}
            idx={i}
            count={panels.length}
            mix={mix}
            ref={ref}
            onChange={(k) => set({ panels: panels.map((p, j) => (j === i ? k : p)) })}
            onMove={(dir) => move(i, dir)}
            onClose={() => set({ panels: panels.filter((_, j) => j !== i) })}
          />
        ))}
      </div>
    </div>
  );
}
