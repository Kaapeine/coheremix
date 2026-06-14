import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ComparisonOut, TrackPayload } from "../types/payload";
import { useViewState } from "../store/viewState";

export interface ComparisonData {
  comp: ComparisonOut | null;
  mixPayload: TrackPayload | null;
  refPayload: TrackPayload | null;
  loadError: boolean;
  /** Re-fetch the comparison (and payloads, once ready). */
  reload: () => void;
}

/**
 * Fetches a comparison and, once it is ready, its track payloads. The returned
 * `comp.state` ("processing" | "ready" | "failed") is the single source of truth
 * the workspace renders from; `comp.jobId` lets a refresh resume polling.
 */
export function useComparison(id: string | undefined): ComparisonData {
  const [comp, setComp] = useState<ComparisonOut | null>(null);
  const [mixPayload, setMixPayload] = useState<TrackPayload | null>(null);
  const [refPayload, setRefPayload] = useState<TrackPayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const hydrate = useViewState((s) => s.hydrate);

  // Bumping reloadKey re-runs the fetch effect. Used after a swap (refresh
  // payloads) and after processing finishes (re-read the now-ready comparison).
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!id) return;
    // `cancelled` lets an in-flight load bail before it touches state, so a
    // superseded fetch (re-run / unmount) can't clobber a newer one. The fetch
    // lives in a function defined *inside* the effect so React's
    // set-state-in-effect rule is satisfied — every setState runs after an
    // await, never synchronously in the effect body.
    let cancelled = false;

    const cid = id; // narrowed to string by the guard above; capture for the closure

    async function loadComparison() {
      try {
        const c = await api.get(cid);
        if (cancelled) return;
        hydrate(cid, c.viewState);
        setComp(c);
        setLoadError(false);
        if (c.state === "ready") {
          const [mix, ref] = await Promise.all([
            api.payload(cid, "mix"),
            api.payload(cid, "reference"),
          ]);
          if (cancelled) return;
          setMixPayload(mix);
          setRefPayload(ref);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    loadComparison();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey, hydrate]);

  return { comp, mixPayload, refPayload, loadError, reload };
}
