import { create } from "zustand";
import { api } from "../api/client";

export type MatchMode = "integrated" | "shortterm" | "region" | "off";
export type ViewMode = "overlaid" | "sideBySide";

export interface ViewState {
  secPerPx: number;
  scroll: number;
  offsetB: number;
  linked: boolean;
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
}

const DEFAULT: ViewState = {
  secPerPx: 0.062,
  scroll: 0,
  offsetB: 0,
  linked: false,
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
};

const lsKey = (id: string) => `coheremix:vs:${id}`;

interface Store extends ViewState {
  comparisonId: string | null;
  set: (patch: Partial<ViewState>) => void;
  hydrate: (id: string, fromDb?: Record<string, unknown>) => void;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

export const useViewState = create<Store>((set, get) => ({
  ...DEFAULT,
  comparisonId: null,

  set: (patch) => {
    set(patch as Partial<Store>);
    const { comparisonId, set: _s, hydrate: _h, ...vs } = get();
    if (comparisonId) {
      localStorage.setItem(lsKey(comparisonId), JSON.stringify(vs));
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        api.patch(comparisonId, { viewState: vs }).catch(() => {});
      }, 800);
    }
  },

  hydrate: (id, fromDb) => {
    const cached = localStorage.getItem(lsKey(id));
    const base = cached ? JSON.parse(cached) : (fromDb ?? {});
    set({ ...DEFAULT, ...base, comparisonId: id });
  },
}));
