import { type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Header } from "../features/header/Header";
import { Transport } from "../features/transport/Transport";
import { PanelWorkspace } from "../features/panels/PanelWorkspace";
import { MeterColumn } from "../features/meters/MeterColumn";
import { ProcessingScreen } from "./Processing";
import { useComparison } from "./useComparison";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
      }}
    >
      {children}
    </div>
  );
}

function Loading() {
  return (
    <Centered>
      <span style={{ color: "var(--tx-3)", fontSize: 13 }}>Loading…</span>
    </Centered>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <Centered>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--warn)", fontSize: 14, marginBottom: 12 }}>
          {message}
        </div>
        <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12 }}>
          ← Back to library
        </button>
      </div>
    </Centered>
  );
}

export function Workspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // The comparison record is the single source of truth for which UI to show.
  // `comp.state` ("processing" | "ready" | "failed") drives the render branches
  // below; payloads are only fetched once the comparison is ready.
  const { comp, mixPayload, refPayload, loadError, reload } = useComparison(id);

  if (!id) return null;

  // Couldn't fetch the comparison at all (network error / 404).
  if (loadError) {
    return (
      <ErrorScreen
        message="This comparison could not be found or loaded."
        onBack={() => navigate("/")}
      />
    );
  }

  // First fetch still in flight.
  if (!comp) return <Loading />;

  // Analysis failed — the error message rides along on the comparison record
  // (latest job's error), so no extra job fetch is needed.
  if (comp.state === "failed") {
    return (
      <ErrorScreen
        message={`Analysis failed${comp.error ? `: ${comp.error}` : "."}`}
        onBack={() => navigate("/")}
      />
    );
  }

  // Analysis in progress. comp.jobId is recovered from the server, so this works
  // on a fresh upload *and* after a hard refresh (router state no longer needed).
  if (comp.state === "processing") {
    if (!comp.jobId) return <Loading />;
    return <ProcessingScreen compId={id} jobId={comp.jobId} onDone={reload} />;
  }

  // Ready, but payloads still loading.
  if (!mixPayload || !refPayload) return <Loading />;

  return (
    <div className="app">
      <Header
        compId={id}
        mixPayload={mixPayload}
        refPayload={refPayload}
        onSwapped={reload}
      />

      <div className="main">
        <div className="left-col">
          <Transport compId={id} mixPayload={mixPayload} refPayload={refPayload} />
          <PanelWorkspace mix={mixPayload} ref={refPayload} />
        </div>
        <MeterColumn mix={mixPayload} ref={refPayload} />
      </div>
    </div>
  );
}
