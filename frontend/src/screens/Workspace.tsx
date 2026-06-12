import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { TrackPayload } from "../types/payload";
import { useViewState } from "../store/viewState";
import { Header } from "../features/header/Header";
import { Transport } from "../features/transport/Transport";
import { PanelWorkspace } from "../features/panels/PanelWorkspace";
import { MeterColumn } from "../features/meters/MeterColumn";
import { ProcessingScreen } from "./Processing";

export function Workspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const initialJobId =
    (location.state as { jobId?: string } | null)?.jobId ?? null;
  const [jobId, setJobId] = useState<string | null>(initialJobId);

  const [mixPayload, setMixPayload] = useState<TrackPayload | null>(null);
  const [refPayload, setRefPayload] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(!initialJobId);
  const [failed, setFailed] = useState(false);

  const hydrate = useViewState((s) => s.hydrate);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) { setLoading(true); setFailed(false); }
    try {
      const comp = await api.get(id);
      hydrate(id, comp.viewState);
      if (comp.state === "ready") {
        const [mix, ref] = await Promise.all([
          api.payload(id, "mix"),
          api.payload(id, "reference"),
        ]);
        setMixPayload(mix);
        setRefPayload(ref);
      } else if (comp.state === "failed") {
        if (!silent) setFailed(true);
      }
    } catch {
      if (!silent) setFailed(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, hydrate]);

  useEffect(() => {
    // Skip initial load while ProcessingScreen is running; it calls load() on done
    if (!jobId) load();
  }, [jobId, load]);

  const handleProcessingDone = useCallback(() => {
    setJobId(null);
    // load() fires via the useEffect above once jobId is cleared
  }, []);

  if (!id) return null;

  if (loading) {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
        }}
      >
        <span style={{ color: "var(--tx-3)", fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{ color: "var(--warn)", fontSize: 14, marginBottom: 12 }}
          >
            This comparison failed or could not be found.
          </div>
          <button
            className="btn-ghost"
            onClick={() => navigate("/")}
            style={{ fontSize: 12 }}
          >
            ← Back to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        compId={id}
        mixPayload={mixPayload}
        refPayload={refPayload}
        onSwapped={() => load(true)}
      />

      <div className="main">
        <div className="left-col">
          {mixPayload && refPayload ? (
            <Transport mixPayload={mixPayload} refPayload={refPayload} />
          ) : (
            <div
              className="transport"
              style={{ display: "grid", placeItems: "center" }}
            >
              <span
                style={{
                  color: "var(--tx-3)",
                  fontSize: 12,
                  gridColumn: "1 / -1",
                }}
              >
                Waiting for analysis…
              </span>
            </div>
          )}
          <PanelWorkspace />
        </div>
        <MeterColumn />
      </div>

      {jobId && (
        <ProcessingScreen
          compId={id}
          jobId={jobId}
          onDone={handleProcessingDone}
        />
      )}
    </div>
  );
}
