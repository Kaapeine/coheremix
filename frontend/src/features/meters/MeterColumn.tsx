import React from "react";

// Stub — full implementation in Task 24
export function MeterColumn() {
  return (
    <div className="meter-col">
      <div className="meter-slot">
        <div className="meter-head">
          <span className="mt">LUFS</span>
        </div>
        <div className="meter-body">
          <div className="empty-slot">Meters — Task 24</div>
        </div>
      </div>
      <div className="meter-slot">
        <div className="meter-head">
          <span className="mt">True Peak</span>
        </div>
        <div className="meter-body">
          <div className="empty-slot" />
        </div>
      </div>
    </div>
  );
}
