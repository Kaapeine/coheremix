export interface FileInfo {
  format: string;
  sampleRate: number;
  bitDepth: number | null;
  channels: number;
  size: number;
  duration: number;
}

export interface GainMatch {
  integratedLUFS: number;
  offsetToCommon: number;
}

export interface TrackSummary {
  role: "mix" | "reference";
  name: string;
  fileInfo: FileInfo;
  gainMatch: GainMatch | null;
  state: string;
}

export interface Ltas {
  freqs: number[]; // log-spaced bin center frequencies (Hz)
  db: number[];    // peak-normalised dB per bin
  bins: number;
}

/** `null` entries mark a gated/undefined sample (e.g. analysed-as-silent) —
 * renderers should skip them (gap in the line) rather than treat them as 0. */
export interface Features {
  shortTermLUFS: (number | null)[];
  momentaryLUFS: (number | null)[];
  crest: (number | null)[];
  truePeak: (number | null)[];
  centroid?: (number | null)[];     // P2
  correlation?: (number | null)[];  // P3
  sideMidRatio?: (number | null)[]; // P3, Side/Mid energy ratio
  balance?: (number | null)[];      // P3
  [key: string]: (number | null)[] | undefined;
}

export interface StaticAggregates {
  integrated: number;
  lra: number;
  truePeakMax: number;
  plr: number;
  crestAvg: number;
  centroidAvg?: number;    // P2
  tilt?: number;           // P2
  avgCorrelation?: number; // P3
  sideMidRatioAvg?: number; // P3
  widthPerBand?: number[]; // P3, 7 bands
}

export interface TrackPayload {
  track: "user" | "reference";
  role: "mix" | "reference";
  name: string;
  fileInfo: FileInfo;
  meta: { sampleRate: number; duration: number; channels: number };
  gainMatch: GainMatch;
  hop: number;
  features: Features;
  ltas: Ltas | null;
  spectrogram: unknown | null;
  waveform: { peaksByZoom: Record<string, number[]> };
  static: StaticAggregates;
  kblocks: number[][]; // per-100ms [msqL, msqR]
}

export interface ComparisonOut {
  id: string;
  name: string;
  state: "processing" | "ready" | "failed";
  createdAt: string;
  viewState: Record<string, unknown>;
  tracks: TrackSummary[];
  jobId?: string | null; // latest job — lets the client resume polling after a refresh
  error?: string | null; // latest job's error message when state === "failed"
}

export interface JobStatus {
  id: string;
  state: string;
  progress: number;
  stages: Record<string, Record<string, string>>;
  error: string | null;
}
