from __future__ import annotations

from pydantic import BaseModel


class FileInfo(BaseModel):
    format: str
    sampleRate: int
    bitDepth: int | None
    channels: int
    size: int
    duration: float


class Meta(BaseModel):
    sampleRate: int
    duration: float
    channels: int


class GainMatch(BaseModel):
    integratedLUFS: float
    offsetToCommon: float


class Waveform(BaseModel):
    peaksByZoom: dict[str, list[float]]


class TrackPayload(BaseModel):
    track: str                 # "user" | "reference"
    role: str                  # "mix" | "reference"
    name: str
    fileInfo: FileInfo
    meta: Meta
    gainMatch: GainMatch
    hop: float = 0.1
    features: dict[str, list[float]] = {}  # shortTermLUFS, momentaryLUFS, correlation, crest, truePeak, centroid, sideMidRatio
    ltas: dict | None = None               # {freqs, db, bins} — long-term average spectrum, pre-computed
    spectrogram: dict | None = None        # {bins, cols, data} — log-freq x time uint8 heatmap, base64-encoded, pre-computed
    waveform: Waveform                     # mipmap pyramid: z256/z512/z1024/z2048/z4096 — renderer picks closest to canvas px width
    static: dict = {}                      # lra, integrated, truePeakMax, plr, avgCorrelation, crestAvg


class BandEdge(BaseModel):
    name: str
    lo: float
    hi: float


class ComparisonDefaults(BaseModel):
    offsetB: float = 0.0
    secPerPx: float = 0.062
    duration: float
    bandEdges: list[BandEdge] = [
        BandEdge(name="Sub", lo=20, hi=60),
        BandEdge(name="Low", lo=60, hi=120),
        BandEdge(name="L-Mid", lo=120, hi=400),
        BandEdge(name="Mid", lo=400, hi=2000),
        BandEdge(name="H-Mid", lo=2000, hi=5000),
        BandEdge(name="Pres", lo=5000, hi=10000),
        BandEdge(name="Air", lo=10000, hi=20000),
    ]


class TrackSummary(BaseModel):
    role: str
    name: str
    fileInfo: FileInfo
    gainMatch: GainMatch | None
    state: str


class ComparisonOut(BaseModel):
    id: str
    name: str
    state: str
    createdAt: str
    viewState: dict
    tracks: list[TrackSummary]
    defaults: ComparisonDefaults | None = None
    jobId: str | None = None        # latest job — lets the client resume polling after a refresh
    error: str | None = None        # latest job's error message when state == "failed"


class JobStatus(BaseModel):
    id: str
    state: str
    progress: float
    stages: dict
    error: str | None = None
