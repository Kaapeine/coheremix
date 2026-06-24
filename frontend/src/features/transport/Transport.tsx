import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { ABBlock } from "./ABBlock";
import { ControlRow } from "./ControlRow";
import { ScrollBar } from "./ScrollBar";
import { Waveform } from "./Waveform";
import { useAudioEngine } from "../audio/useAudioEngine";

interface Props {
  compId: string;
  mixPayload: TrackPayload;
  refPayload: TrackPayload;
}

interface DragState {
  mode: "region" | "alignB";
  startX: number;
  startTime: number;
  startOffset: number;
}

export function Transport({ compId, mixPayload, refPayload }: Props) {
  // Full store ref — keeps mouse/keyboard handlers out of the re-render cycle.
  const store = useViewState();
  const storeRef = useRef(store);
  useLayoutEffect(() => { storeRef.current = store; });

  const waveRef = useRef<HTMLDivElement>(null);
  const contentWRef = useRef(900);
  const dragRef = useRef<DragState | null>(null);
  const playingRef = useRef(false);
  const [playing, _setPlaying] = useState(false);

  const setPlaying = (v: boolean) => {
    playingRef.current = v;
    _setPlaying(v);
  };

  const duration = Math.max(
    mixPayload.meta.duration,
    refPayload.meta.duration,
  );

  const { touch, seekTo } = useAudioEngine({ compId, mix: mixPayload, ref: refPayload, playing, setPlaying });
  const touchRef = useRef(touch);
  const seekToRef = useRef(seekTo);
  // offsetB range that lets any part of ref line up with any part of mix:
  // ref end → mix start = -refDur; ref start → mix end = +mixDur.
  const offsetBoundsRef = useRef({ min: 0, max: 0 });
  useLayoutEffect(() => {
    touchRef.current = touch;
    seekToRef.current = seekTo;
    offsetBoundsRef.current = {
      min: -refPayload.meta.duration,
      max: mixPayload.meta.duration,
    };
  });

  // Wrap setPlaying so every play/pause gesture also unblocks the AudioContext.
  const handleSetPlaying = (v: boolean) => {
    touchRef.current();
    setPlaying(v);
  };

  // Sync duration into store once on mount / when payloads change.
  useEffect(() => {
    if (storeRef.current.duration !== duration) {
      storeRef.current.set({ duration });
    }
  }, [duration]);

  // Track wave-stack width for auto-follow.
  useEffect(() => {
    const el = waveRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      contentWRef.current = el.clientWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const s = storeRef.current;
      if (e.key === " ") {
        e.preventDefault();
        touchRef.current();
        const v = !playingRef.current;
        playingRef.current = v;
        _setPlaying(v);
      } else if (e.key === "Tab") {
        e.preventDefault();
        s.set({ ab: s.ab === "A" ? "B" : "A" });
      } else if (e.key === "l" || e.key === "L") {
        s.set({ loop: { enabled: !s.loop.enabled } });
      } else if (e.key === "Escape") {
        s.set({ regionA: null });
      } else if (e.key === "+" || e.key === "=") {
        s.zoomBy(0.8);
      } else if (e.key === "-" || e.key === "_") {
        s.zoomBy(1.25);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Global mouse handlers for drag-region and drag-B.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !waveRef.current) return;
      const rect = waveRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const s = storeRef.current;
      if (drag.mode === "region") {
        const t = s.scroll + localX * s.secPerPx;
        const t0 = Math.max(0, Math.min(drag.startTime, t));
        const t1 = Math.min(s.duration, Math.max(drag.startTime, t));
        if (t1 > t0) s.set({ regionA: [t0, t1] });
      } else {
        const deltaT = (e.clientX - drag.startX) * s.secPerPx;
        const { min, max } = offsetBoundsRef.current;
        s.set({
          offsetB: Math.max(min, Math.min(max, drag.startOffset + deltaT)),
        });
      }
    };
    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      // A click (negligible movement) on either lane seeks to that A-time.
      if (drag && Math.abs(e.clientX - drag.startX) < 4) {
        seekToRef.current(drag.startTime);
      }
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const { scroll, secPerPx, playhead, regionA, offsetB } = store;
  const offsetPx = offsetB / secPerPx;

  const onAMouseDown = (e: React.MouseEvent) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const t = scroll + (e.clientX - rect.left) * secPerPx;
    dragRef.current = { mode: "region", startX: e.clientX, startTime: t, startOffset: 0 };
  };

  const onBMouseDown = (e: React.MouseEvent) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    // Record the click's A-time so a plain click seeks (a drag instead aligns B).
    const t = scroll + (e.clientX - rect.left) * secPerPx;
    // Locked: B no longer drags to realign — behaves like the A lane (seek/region-select).
    dragRef.current = store.locked
      ? { mode: "region", startX: e.clientX, startTime: t, startOffset: 0 }
      : { mode: "alignB", startX: e.clientX, startTime: t, startOffset: offsetB };
  };

  const playheadPx = (playhead - scroll) / secPerPx;
  const regionLeftPx = regionA ? (regionA[0] - scroll) / secPerPx : 0;
  const regionW = regionA ? (regionA[1] - regionA[0]) / secPerPx : 0;

  return (
    <div className="transport">
      {/* Column 1: A/B segmented control */}
      <ABBlock />

      {/* Column 2, Row 1: dual waveform lanes */}
      <div className="wave-stack" ref={waveRef}>
        {/* A — mix */}
        <div className="wave-row" onMouseDown={onAMouseDown}>
          <div className="wave-tag a">
            <span className="dot" />
            A
            <span className="fname">{mixPayload.name}</span>
          </div>
          <Waveform
            peaks={mixPayload.waveform.peaksByZoom}
            color="#f2a93b"
            role="mix"
            scroll={scroll}
            secPerPx={secPerPx}
            duration={mixPayload.meta.duration}
          />
        </div>

        {/* B — reference */}
        <div className="wave-row" onMouseDown={onBMouseDown} style={{ cursor: store.locked ? "default" : "grab" }}>
          <div className="wave-tag b">
            <span className="dot" />
            B
            <span className="fname">{refPayload.name}</span>
          </div>
          <Waveform
            peaks={refPayload.waveform.peaksByZoom}
            color="#3fcfe0"
            role="reference"
            scroll={scroll}
            secPerPx={secPerPx}
            duration={refPayload.meta.duration}
            offsetPx={offsetPx}
          />
        </div>

        {/* Shared overlay: playhead + region selection */}
        <div className="lane-overlay">
          <div className="playhead" style={{ left: playheadPx }} />
          {regionA && regionW > 0 && (
            <div
              className="region-sel"
              style={{ left: regionLeftPx, width: regionW }}
            />
          )}
        </div>
      </div>

      {/* Column 2, Row 2: horizontal scrollbar */}
      <ScrollBar
        mixDuration={mixPayload.meta.duration}
        refDuration={refPayload.meta.duration}
      />

      {/* Column 2, Row 3: control row */}
      <ControlRow
        playing={playing}
        setPlaying={handleSetPlaying}
        onRestart={() => {
          seekToRef.current(0);
          storeRef.current.set({ scroll: 0 });
        }}
      />
    </div>
  );
}
