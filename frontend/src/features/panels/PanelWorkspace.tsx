import React from "react";

// Stub — full implementation in Task 24
export function PanelWorkspace() {
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <span className="wb-title">Analysis panels</span>
        <span className="wb-count" style={{ marginLeft: 6 }}>0</span>
        <span className="spacer" style={{ flex: 1 }} />
      </div>
      <div className="workspace-scroll">
        <div className="empty-slot" style={{ minHeight: 80 }}>
          Panels — Task 24
        </div>
      </div>
    </div>
  );
}
