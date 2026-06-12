import React from "react";
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { Waveform } from "./Waveform";

interface Props {
  mixPayload: TrackPayload;
  refPayload: TrackPayload;
}

// Task 22 verification layout — full Transport grid built in Task 23
export function Transport({ mixPayload, refPayload }: Props) {
  const scroll = useViewState((s) => s.scroll);
  const secPerPx = useViewState((s) => s.secPerPx);
  const offsetB = useViewState((s) => s.offsetB);

  const duration = Math.max(
    mixPayload.meta.duration,
    refPayload.meta.duration,
  );
  const offsetPx = offsetB / secPerPx;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--line)",
        overflow: "hidden",
      }}
    >
      {/* A — mix */}
      <div
        style={{
          flex: 1,
          position: "relative",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          className="wave-tag a"
          style={{ position: "absolute", top: 7, left: 8, zIndex: 3, pointerEvents: "none", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span className="dot" style={{ width: 7, height: 7, borderRadius: 2, background: "var(--a)", display: "inline-block" }} />
          <span style={{ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase" }}>A</span>
          <span className="fname" style={{ color: "var(--tx-3)", fontSize: 10, letterSpacing: ".02em", textTransform: "none" }}>{mixPayload.name}</span>
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
      <div style={{ flex: 1, position: "relative" }}>
        <div
          className="wave-tag b"
          style={{ position: "absolute", top: 7, left: 8, zIndex: 3, pointerEvents: "none", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span className="dot" style={{ width: 7, height: 7, borderRadius: 2, background: "var(--b)", display: "inline-block" }} />
          <span style={{ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase" }}>B</span>
          <span className="fname" style={{ color: "var(--tx-3)", fontSize: 10, letterSpacing: ".02em", textTransform: "none" }}>{refPayload.name}</span>
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
    </div>
  );
}
