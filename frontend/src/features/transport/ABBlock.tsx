import React from "react";
import { useViewState } from "../../store/viewState";

export function ABBlock() {
  const ab = useViewState((s) => s.ab);
  const set = useViewState((s) => s.set);

  return (
    <div className="ab-block">
      <button
        className={`ab-seg a ${ab === "A" ? "on" : ""}`}
        onClick={() => set({ ab: "A" })}
        title="Monitor mix (Tab)"
      >
        <span className="ab-letter">A</span>
        <span className="ab-sub">mix</span>
      </button>
      <button
        className={`ab-seg b ${ab === "B" ? "on" : ""}`}
        onClick={() => set({ ab: "B" })}
        title="Monitor reference (Tab)"
      >
        <span className="ab-letter">B</span>
        <span className="ab-sub">ref</span>
      </button>
      <div className="ab-hint">
        <kbd>Tab</kbd>
      </div>
    </div>
  );
}
