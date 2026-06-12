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

export interface TrackPayload {
  track: "user" | "reference";
  role: "mix" | "reference";
  name: string;
  fileInfo: FileInfo;
  meta: { sampleRate: number; duration: number; channels: number };
  gainMatch: GainMatch;
  hop: number;
  features: Record<string, number[]>;
  ltas: unknown | null;
  spectrogram: unknown | null;
  waveform: { peaksByZoom: Record<string, number[]> };
  static: Record<string, number>;
}

export interface ComparisonOut {
  id: string;
  name: string;
  state: "processing" | "ready" | "failed";
  createdAt: string;
  viewState: Record<string, unknown>;
  tracks: TrackSummary[];
}

export interface JobStatus {
  id: string;
  state: string;
  progress: number;
  stages: Record<string, Record<string, string>>;
  error: string | null;
}
