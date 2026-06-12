import React, { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ProcessingScreen } from "./Processing";

export function Workspace() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialJobId =
    (location.state as { jobId?: string } | null)?.jobId ?? null;
  const [jobId, setJobId] = useState<string | null>(initialJobId);

  return (
    <div
      className="mono"
      style={{ padding: 24, height: "100%", background: "var(--bg)" }}
    >
      Workspace — {id}
      {jobId && id && (
        <ProcessingScreen
          compId={id}
          jobId={jobId}
          onDone={() => setJobId(null)}
        />
      )}
    </div>
  );
}
