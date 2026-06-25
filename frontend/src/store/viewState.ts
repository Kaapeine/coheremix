import { create } from "zustand";
import { api } from "../api/client";

export type MatchMode = "integrated" | "shortterm" | "region" | "off";
export type ViewMode = "overlaid" | "sideBySide";
// Deliberately fine-grained — power-averaging a wide band dilutes real peaks,
// so the useful range tops out well below the ANSI-standard 1/3 octave.
export const OCTAVE_FRACTIONS = ["1/48", "1/24", "1/12", "1/6", "1/3"] as const;
export type OctaveFraction = (typeof OCTAVE_FRACTIONS)[number];

export interface ViewState {
  secPerPx: number;
  scroll: number;
  offsetB: number;
  locked: boolean;
  playhead: number;
  regionA: [number, number] | null;
  loop: { enabled: boolean };
  ab: "A" | "B";
  matchMode: MatchMode;
  viewMode: ViewMode;
  target: number;
  momentary: boolean;
  duration: number;
  panels: string[];
  meterSlots: [string, string];
  spectrumAvgMs: number;
  spectrumOctaves: OctaveFraction;
}

export const DEFAULT: ViewState = {
  secPerPx: 0.062,
  scroll: 0,
  offsetB: 0,
  locked: false,
  playhead: 0,
  regionA: null,
  loop: { enabled: false },
  ab: "A",
  matchMode: "integrated",
  viewMode: "overlaid",
  target: -14,
  momentary: false,
  duration: 0,
  panels: ["shortTermLufs", "ltas", "tiles"],
  meterSlots: ["lufs", "truepeak"],
  spectrumAvgMs: 300,
  spectrumOctaves: "1/24",
};

const lsKey = (id: string) => `coheremix:vs:${id}`;

interface Store extends ViewState {
  comparisonId: string | null;
  set: (patch: Partial<ViewState>) => void;
  /** Zoom by `factor` (<1 in, >1 out) keeping the playhead pinned to its pixel. */
  zoomBy: (factor: number) => void;
  hydrate: (id: string, fromDb?: Record<string, unknown>) => void;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

export const useViewState = create<Store>((set, get) => ({
  ...DEFAULT,
  comparisonId: null,

  set: (patch) => {
    set(patch as Partial<Store>);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { comparisonId, set: _s, hydrate: _h, ...vs } = get();
    if (comparisonId) {
      localStorage.setItem(lsKey(comparisonId), JSON.stringify(vs));
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        api.patch(comparisonId, { viewState: vs }).catch(() => {});
      }, 800);
    }
  },

  zoomBy: (factor) => {
    const { secPerPx, scroll, playhead, offsetB, set: apply } = get();
    const next = Math.min(0.5, Math.max(0.004, secPerPx * factor));
    // Keep the playhead at the same screen x: (playhead - scroll)/secPerPx const.
    const scrollNext = playhead - (playhead - scroll) * (next / secPerPx);
    apply({ secPerPx: next, scroll: Math.max(Math.min(0, offsetB), scrollNext) });
  },

  hydrate: (id, fromDb) => {
    const cached = localStorage.getItem(lsKey(id));
    const base = cached ? JSON.parse(cached) : (fromDb ?? {});
    set({ ...DEFAULT, ...base, comparisonId: id });
  },
}));
