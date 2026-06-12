import React, { useEffect, useRef, useState } from "react";
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { ABBlock } from "./ABBlock";
import { ControlRow } from "./ControlRow";
import { Waveform } from "./Waveform";

interface Props {
  mixPayload: TrackPayload;
  refPayload: TrackPayload;
}

interface DragState {
  mode: "region" | "alignB";
  startX: number;
  startTime: number;
  startOffset: number;
}

export function Transport({ mixPayload, refPayload }: Props) {
  // Full store ref — keeps mouse/keyboard handlers out of the re-render cycle.
  const store = useViewState();
  const storeRef = useRef(store);
  storeRef.current = store;

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

  // Playback rAF loop.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = storeRef.current;
      let p = s.playhead + dt;
      if (s.loop.enabled && s.regionA && p >= s.regionA[1]) p = s.regionA[0];
      if (p >= s.duration) {
        setPlaying(false);
        s.set({ playhead: s.duration });
        return;
      }
      // auto-follow scroll
      const span = contentWRef.current * s.secPerPx;
      let scroll = s.scroll;
      if (p > s.scroll + span * 0.88) scroll = p - span * 0.5;
      if (p < s.scroll) scroll = Math.max(0, p - span * 0.1);
      s.set({ playhead: p, scroll });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const s = storeRef.current;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying(!playingRef.current);
      } else if (e.key === "Tab") {
        e.preventDefault();
        s.set({ ab: s.ab === "A" ? "B" : "A" });
      } else if (e.key === "l" || e.key === "L") {
        s.set({ loop: { enabled: !s.loop.enabled } });
      } else if (e.key === "Escape") {
        s.set({ regionA: null });
      } else if (e.key === "+" || e.key === "=") {
        s.set({ secPerPx: Math.max(0.004, s.secPerPx * 0.8) });
      } else if (e.key === "-" || e.key === "_") {
        s.set({ secPerPx: Math.min(0.5, s.secPerPx * 1.25) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        s.set({
          offsetB: Math.max(-30, Math.min(30, drag.startOffset + deltaT)),
        });
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { scroll, secPerPx, playhead, regionA, offsetB } = store;
  const offsetPx = offsetB / secPerPx;

  const onAMouseDown = (e: React.MouseEvent) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const t = scroll + (e.clientX - rect.left) * secPerPx;
    dragRef.current = { mode: "region", startX: e.clientX, startTime: t, startOffset: 0 };
  };

  const onBMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      mode: "alignB",
      startX: e.clientX,
      startTime: 0,
      startOffset: offsetB,
    };
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
            duration={duration}
          />
        </div>

        {/* B — reference */}
        <div className="wave-row" onMouseDown={onBMouseDown}>
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
            duration={duration}
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

      {/* Column 2, Row 2: control row */}
      <ControlRow playing={playing} setPlaying={setPlaying} />
    </div>
  );
}
