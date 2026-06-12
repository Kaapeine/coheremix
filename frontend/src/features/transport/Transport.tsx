import React from "react";
import type { TrackPayload } from "../../types/payload";

interface Props {
  mixPayload: TrackPayload;
  refPayload: TrackPayload;
}

// Stub — full implementation in Task 22–23
export function Transport(_props: Props) {
  return (
    <div
      className="transport"
      style={{ placeItems: "center", display: "grid" }}
    >
      <span style={{ color: "var(--tx-3)", fontSize: 12, gridColumn: "1/-1" }}>
        Transport — Task 22
      </span>
    </div>
  );
}
