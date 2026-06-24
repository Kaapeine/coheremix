# CohereMix Phases 2 + 3 — Frequency & Spatial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Frequency (Substrate 2) and Spatial (Substrate 3) analysis families — LTAS, live spectrum, band-energy delta, centroid/tilt, correlation, M/S width, dual goniometers, and correlation + balance meters — on top of the working Phase 0/1 loudness app.

**Architecture:** Two independently-shippable parts. **Part A (Frequency)** computes an STFT substrate on the backend (LTAS curve + per-frame centroid + tilt), ships it in the existing per-track payload, and renders three new 2D-canvas panels plus a real-time spectrum analyzer. **Part B (Spatial)** computes correlation / M-S ratio / L-R balance / per-band width on the backend and renders a correlation lane, an M/S-width tile panel, two meters, and a real-time dual goniometer. Real-time views (live spectrum, goniometer) read `AnalyserNode` taps added to the existing `AudioEngine` via a small module singleton; everything else is precomputed and read through the existing typed `read.ts` layer.

**Tech Stack:** Backend — Python, NumPy, SciPy, pyloudnorm, FastAPI, pytest (test-vector TDD). Frontend — React + TypeScript + Zustand, 2D Canvas (`useCanvasDraw`), Web Audio `AnalyserNode`. No new runtime dependencies.

---

## Resolved design decisions (read first)

These resolve conflicts between the two source docs (`docs/superpowers/specs/2026-06-11-coheremix-mix-comparison-design.md` and `docs/mix-comparison-tool-spec(2).md`) for this plan:

1. **Rendering = 2D Canvas, not regl.** The design doc asks for regl/WebGL spectrum + a regl point-cloud goniometer, but the codebase renders every analysis panel with 2D Canvas (`features/panels/draw.ts` + `useCanvasDraw`); only the waveform uses regl. We follow the established 2D-canvas pattern for all new panels, including the real-time spectrum and goniometer. (Decision confirmed with the user.)
2. **Live spectrum is real-time-only with hold-on-pause.** `AnalyserNode` is silent when parked, and we are **not** shipping an STFT frame matrix in this plan (that stays Phase 5 with the spectrogram). The live-spectrum panel shows the precomputed LTAS curve as a faint baseline always; while audio plays it overlays the real-time `AnalyserNode` spectrum for A and B; **on pause it holds the last live frame** (seeking does not update the held frame — acceptable, confirmed with the user).
3. **Both A and B feed live analysers simultaneously.** The `AudioEngine` plays both buffers in lock-step and mutes the inaudible one via a gain node. We tap each voice's `AudioBufferSourceNode` **before** its gain node, so both A and B analysers receive signal even though only one is audible → true A+B overlaid live spectrum and two simultaneous goniometer scopes.
4. **Meters keep reading precomputed `features` arrays at the playhead.** The existing LUFS/True-Peak meters already do this (no live audio). Correlation and Balance meters follow the same pattern (they animate because the playhead advances during playback). The design's "AudioWorklet while playing" for meters is deferred; no behavior is lost.
5. **Whole-file scope for band-delta and per-band width.** Region-scoped band-delta / per-band width would need per-region STFT, which we are not shipping. Band-delta compares each track's whole-file LTAS shape (correct post-gain-match), and per-band width is whole-file S/M energy. Region-scoping is noted as a later extension.

**Scope note:** Part A (Frequency) and Part B (Spatial) are independent subsystems; each ends at a shippable state and could be split into two plans. They are combined here per request. Execute Part A fully (including its commits) before Part B.

---

## File Structure

**Part A — Frequency**
- Create `backend/app/analysis/spectrum.py` — Substrate-2 DSP: STFT magnitude, LTAS, centroid series, spectral tilt, `compute_substrate2()` orchestrator.
- Create `backend/tests/test_spectrum.py` — test-vector tests for the above.
- Modify `backend/app/analysis/pipeline.py` — add `frequency` stage; merge sub2 into the payload.
- Modify `frontend/src/types/payload.ts` — `Ltas` type; `centroid`; `centroidAvg`/`tilt` statics.
- Modify `frontend/src/features/analysis/read.ts` — `bandEnergy()` over LTAS; `BAND_EDGES` constant.
- Create `frontend/src/features/audio/tap.ts` — module singleton exposing the current engine's analyser nodes.
- Modify `frontend/src/features/audio/engine.ts` — per-voice `AnalyserNode` taps + accessors.
- Modify `frontend/src/features/audio/useAudioEngine.ts` — register/unregister the engine with `audioTap`.
- Modify `frontend/src/features/panels/draw.ts` — `ltasCurve()`, `bandDelta()`.
- Modify `frontend/src/features/panels/bodies.tsx` — `LtasBody`, `BandDeltaBody`, `SpectrumBody`.
- Modify `frontend/src/features/panels/PanelWorkspace.tsx` — wire the three frequency views.
- Modify `frontend/src/styles/tokens.css` — spectrum/LTAS/band-delta classes.

**Part B — Spatial**
- Create `backend/app/analysis/spatial.py` — Substrate-3 DSP: correlation, M/S ratio, balance, per-band width, `compute_substrate3()`.
- Create `backend/tests/test_spatial.py` — test-vector tests.
- Modify `backend/app/analysis/pipeline.py` — add `spatial` stage; merge sub3.
- Modify `frontend/src/types/payload.ts` — `correlation`/`msRatio`/`balance`; `avgCorrelation`/`msRatioAvg`/`widthPerBand` statics.
- Modify `frontend/src/features/panels/draw.ts` — `bandBars()` helper for width.
- Modify `frontend/src/features/panels/bodies.tsx` — `CorrelationBody`, `StereoTilesBody`, `GoniometerBody`.
- Modify `frontend/src/features/panels/PanelWorkspace.tsx` — wire correlation / stereo-tiles / goniometer.
- Create `frontend/src/features/meters/spatialMeters.tsx` — `CorrelationMeter`, `BalanceMeter`.
- Modify `frontend/src/features/meters/MeterColumn.tsx` — wire the two meters.
- Modify `frontend/src/styles/tokens.css` — goniometer + balance-meter classes.

---

## Conventions

- **Backend tests:** `cd backend && uv run pytest <file> -q`. PCM is `float32` shape `(2, n)`. Helper `_sine(sr, secs, freq, amp)` (see `backend/tests/test_features.py`) returns identical L/R; build stereo manually when you need channel differences.
- **Frontend verification (no unit-test framework in repo):** `cd frontend && npm run build` (runs `tsc -b` then `vite build`) and `npm run lint`. Then a manual browser check via the `/run` skill or `npm run dev`.
- **Feature arrays** are at `hop = 0.1 s`. The typed read layer (`features/analysis/read.ts`) clamps indices, so arrays a few samples shorter/longer than the loudness block count are safe.
- **Commit** after each task's verification passes. Do not push unless asked.

---

# PART A — Frequency (Substrate 2)

## Task A1: Backend STFT substrate (`spectrum.py`)

**Files:**
- Create: `backend/app/analysis/spectrum.py`
- Test: `backend/tests/test_spectrum.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_spectrum.py`:

```python
import numpy as np
from app.analysis import spectrum


def _sine(sr, secs, freq, amp):
    t = np.arange(int(sr * secs)) / sr
    s = (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return np.stack([s, s])  # (2, n)


def test_ltas_peaks_near_tone():
    sr = 48000
    pcm = _sine(sr, 4.0, 1000.0, 0.5)
    freqs, frames = spectrum.stft_mag(pcm, sr)
    lt = spectrum.ltas(freqs, frames)
    peak_bin = int(np.argmax(lt["db"]))
    peak_freq = lt["freqs"][peak_bin]
    # log-freq bins are coarse; 1 kHz tone should land within ~1/3 octave.
    assert 800 < peak_freq < 1250
    assert lt["bins"] == len(lt["db"]) == len(lt["freqs"])


def test_centroid_orders_by_brightness():
    sr = 48000
    low = _sine(sr, 3.0, 200.0, 0.5)
    high = _sine(sr, 3.0, 6000.0, 0.5)
    fl, frl = spectrum.stft_mag(low, sr)
    fh, frh = spectrum.stft_mag(high, sr)
    cen_low = np.median(spectrum.centroid_series(fl, frl, sr))
    cen_high = np.median(spectrum.centroid_series(fh, frh, sr))
    assert cen_low < cen_high
    assert cen_low < 1000 and cen_high > 3000


def test_compute_substrate2_payload_shape():
    sr = 48000
    pcm = _sine(sr, 3.0, 1000.0, 0.4)
    out = spectrum.compute_substrate2(pcm, sr, hop_s=0.1)
    assert set(out["ltas"]) == {"freqs", "db", "bins"}
    assert "centroid" in out["features"]
    assert len(out["features"]["centroid"]) >= 1
    for key in ("centroidAvg", "tilt"):
        assert key in out["static"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_spectrum.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analysis.spectrum'`.

- [ ] **Step 3: Implement `spectrum.py`**

Create `backend/app/analysis/spectrum.py`:

```python
from __future__ import annotations

import numpy as np
from scipy import signal

_FFT = 4096
_HOP = 1024  # 75% overlap
_F_LO = 20.0
_F_HI = 20000.0


def stft_mag(
    pcm: np.ndarray, sample_rate: int, fft: int = _FFT, hop: int = _HOP
) -> tuple[np.ndarray, np.ndarray]:
    """Magnitude STFT of the mono mix. Returns (freqs[fft/2+1], mag[frames, fft/2+1])."""
    mono = pcm.mean(axis=0).astype(np.float64)
    freqs = np.fft.rfftfreq(fft, 1.0 / sample_rate)
    n_frames = 1 + max(0, (mono.shape[0] - fft) // hop)
    if mono.shape[0] < fft:
        return freqs, np.zeros((0, freqs.shape[0]))
    win = signal.windows.hann(fft, sym=False)
    frames = np.empty((n_frames, freqs.shape[0]))
    for i in range(n_frames):
        seg = mono[i * hop : i * hop + fft] * win
        frames[i] = np.abs(np.fft.rfft(seg))
    return freqs, frames


def ltas(
    freqs: np.ndarray, frames: np.ndarray, bins: int = 96,
    f_lo: float = _F_LO, f_hi: float = _F_HI,
) -> dict:
    """Long-term average spectrum on a log-freq grid, in dB, peak-normalised to 0.

    Peak-normalisation means the curve describes tonal *shape* (apples-to-apples
    after gain-match), not absolute level.
    """
    edges = np.geomspace(f_lo, f_hi, bins + 1)
    centers = np.sqrt(edges[:-1] * edges[1:])
    if frames.shape[0] == 0:
        return {
            "freqs": [round(float(f), 1) for f in centers],
            "db": [-120.0] * bins, "bins": bins,
        }
    mean_pow = (frames ** 2).mean(axis=0)  # mean power per FFT bin
    db = np.empty(bins)
    for i in range(bins):
        sel = (freqs >= edges[i]) & (freqs < edges[i + 1])
        if np.any(sel):
            p = mean_pow[sel].mean()
        else:  # log band narrower than FFT resolution (low end): nearest bin
            p = mean_pow[int(np.argmin(np.abs(freqs - centers[i])))]
        db[i] = 10.0 * np.log10(p) if p > 0 else -120.0
    db = db - db.max()
    return {
        "freqs": [round(float(f), 1) for f in centers],
        "db": [round(float(x), 2) for x in db], "bins": bins,
    }


def centroid_series(
    freqs: np.ndarray, frames: np.ndarray, sample_rate: int,
    fft: int = _FFT, hop: int = _HOP, hop_s: float = 0.1,
) -> np.ndarray:
    """Spectral centroid (Hz) per STFT frame, averaged onto a `hop_s` grid."""
    if frames.shape[0] == 0:
        return np.zeros(0)
    denom = frames.sum(axis=1)
    cen = np.where(denom > 0, (frames * freqs).sum(axis=1) / denom, 0.0)
    frame_t = (np.arange(frames.shape[0]) * hop + fft / 2) / sample_rate
    n_out = int(frame_t[-1] / hop_s) + 1
    idx = np.floor(frame_t / hop_s).astype(int)
    out = np.zeros(n_out)
    for b in range(n_out):
        sel = idx == b
        out[b] = cen[sel].mean() if np.any(sel) else (out[b - 1] if b else 0.0)
    return out


def spectral_tilt(ltas_dict: dict) -> float:
    """Least-squares slope of the LTAS curve in dB per octave (negative = darker)."""
    f = np.asarray(ltas_dict["freqs"], dtype=np.float64)
    db = np.asarray(ltas_dict["db"], dtype=np.float64)
    x = np.log2(f)
    a = np.vstack([x, np.ones_like(x)]).T
    slope = np.linalg.lstsq(a, db, rcond=None)[0][0]
    return float(round(slope, 2))


def compute_substrate2(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> dict:
    """Substrate-2 (frequency family): LTAS curve, centroid series, tilt."""
    freqs, frames = stft_mag(pcm, sample_rate)
    lt = ltas(freqs, frames)
    cen = centroid_series(freqs, frames, sample_rate, hop_s=hop_s)
    cen_pos = cen[cen > 0]
    cen_avg = float(round(np.median(cen_pos) if cen_pos.size else 0.0, 0))
    return {
        "ltas": lt,
        "features": {"centroid": [round(float(x), 1) for x in cen]},
        "static": {"centroidAvg": cen_avg, "tilt": spectral_tilt(lt)},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_spectrum.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/spectrum.py backend/tests/test_spectrum.py
git commit -m "feat(dsp): Substrate-2 STFT — LTAS, centroid, tilt"
```

---

## Task A2: Wire the frequency stage into the pipeline

**Files:**
- Modify: `backend/app/analysis/pipeline.py`

- [ ] **Step 1: Add `frequency` to the stage list**

In `backend/app/analysis/pipeline.py`, update the imports and stage constants:

```python
from app.analysis import decode, features, loudness, spectrum, waveform
```

```python
P0_STAGES = ["decode", "gainmatch", "waveform"]
ALL_STAGES = ["decode", "gainmatch", "loudness", "frequency", "waveform"]
```

- [ ] **Step 2: Merge sub2 in `_pack_payload`**

Replace the `_pack_payload` function with this version (adds the `sub2` parameter, merges its features/static, and ships `ltas`):

```python
def _pack_payload(track: Track, fileinfo, meta_dur, integrated, offset, peaks, sub1, sub2) -> bytes:
    features = {**sub1["features"], **sub2["features"]}
    static = {**sub1["static"], **sub2["static"]}
    payload = {
        "track": "user" if track.role == "mix" else "reference",
        "role": track.role,
        "name": track.name,
        "fileInfo": fileinfo.__dict__,
        "meta": {
            "sampleRate": get_settings().analysis_sample_rate,
            "duration": meta_dur,
            "channels": 2,
        },
        "gainMatch": {"integratedLUFS": round(integrated, 2), "offsetToCommon": offset},
        "hop": 0.1,
        "features": features,
        "ltas": sub2["ltas"],
        "spectrogram": None,
        "waveform": {"peaksByZoom": peaks},
        "static": static,
        "kblocks": sub1["kblocks"],
    }
    return json.dumps(payload).encode()
```

- [ ] **Step 3: Compute sub2 in `run_analysis`**

In `run_analysis`, immediately **after** the `loudness` stage block (after `_set_stage(db, job, tr.role, "loudness", "done")`), insert the frequency stage:

```python
            current_stage = "frequency"
            _set_stage(db, job, tr.role, "frequency", "running")
            sub2 = spectrum.compute_substrate2(
                pcm, settings.analysis_sample_rate, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "frequency", "done")
```

Then update the `waveform` stage's `_pack_payload` call to pass `sub2`:

```python
            payload = _pack_payload(tr, info, dur, integ, offset, peaks, sub1, sub2)
```

- [ ] **Step 4: Verify the pipeline imports and the full backend suite passes**

Run: `cd backend && uv run pytest -q`
Expected: PASS (all existing tests + A1's). The pipeline module imports `spectrum` cleanly.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/pipeline.py
git commit -m "feat(pipeline): compute Substrate-2 in a frequency stage; ship LTAS"
```

---

## Task A3: Frontend frequency types + LTAS read layer

**Files:**
- Modify: `frontend/src/types/payload.ts`
- Modify: `frontend/src/features/analysis/read.ts`

- [ ] **Step 1: Extend payload types**

In `frontend/src/types/payload.ts`, add an `Ltas` interface and extend `Features`, `StaticAggregates`, and `TrackPayload`:

```typescript
export interface Ltas {
  freqs: number[]; // log-spaced bin center frequencies (Hz)
  db: number[];    // peak-normalised dB per bin
  bins: number;
}
```

In `Features`, replace the `// later phases` comment with the centroid field (keep the index signature):

```typescript
export interface Features {
  shortTermLUFS: number[];
  momentaryLUFS: number[];
  crest: number[];
  truePeak: number[];
  centroid?: number[]; // P2
  // P3: correlation, msRatio, balance
  [key: string]: number[] | undefined;
}
```

In `StaticAggregates`, add the two P2 aggregates:

```typescript
export interface StaticAggregates {
  integrated: number;
  lra: number;
  truePeakMax: number;
  plr: number;
  crestAvg: number;
  centroidAvg?: number; // P2
  tilt?: number;        // P2
  avgCorrelation?: number; // P3
}
```

In `TrackPayload`, type the `ltas` field:

```typescript
  ltas: Ltas | null;
```

- [ ] **Step 2: Add `BAND_EDGES` + `bandEnergy()` to the read layer**

Append to `frontend/src/features/analysis/read.ts`:

```typescript
/** 7 mastering bands, matching backend ComparisonDefaults.bandEdges. */
export const BAND_EDGES: { name: string; lo: number; hi: number }[] = [
  { name: "Sub", lo: 20, hi: 60 },
  { name: "Low", lo: 60, hi: 120 },
  { name: "L-Mid", lo: 120, hi: 400 },
  { name: "Mid", lo: 400, hi: 2000 },
  { name: "H-Mid", lo: 2000, hi: 5000 },
  { name: "Pres", lo: 5000, hi: 10000 },
  { name: "Air", lo: 10000, hi: 20000 },
];

/** Mean LTAS level (dB) over [lo,hi). -Infinity if no LTAS / no bins in range. */
export function bandEnergy(track: TrackPayload, lo: number, hi: number): number {
  const l = track.ltas;
  if (!l) return -Infinity;
  let pow = 0, c = 0;
  for (let i = 0; i < l.freqs.length; i++) {
    if (l.freqs[i] >= lo && l.freqs[i] < hi) {
      pow += Math.pow(10, l.db[i] / 10);
      c++;
    }
  }
  return c ? 10 * Math.log10(pow / c) : -Infinity;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npm run build`
Expected: PASS (no type errors). `ltas` is now `Ltas | null` and consumed nowhere yet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/payload.ts frontend/src/features/analysis/read.ts
git commit -m "feat(read): LTAS types + band-energy read helper"
```

---

## Task A4: AnalyserNode taps on the AudioEngine + module singleton

**Files:**
- Modify: `frontend/src/features/audio/engine.ts`
- Create: `frontend/src/features/audio/tap.ts`
- Modify: `frontend/src/features/audio/useAudioEngine.ts`

- [ ] **Step 1: Add analyser nodes to each voice**

In `frontend/src/features/audio/engine.ts`, extend the `Voice` interface:

```typescript
interface Voice {
  buffer: AudioBuffer;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
  analyser: AnalyserNode;          // mono, for the live spectrum
  splitter: ChannelSplitterNode;   // → L/R analysers for the goniometer
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
}
```

In `load()`, replace the `mkVoice` definition with one that builds the analyser graph:

```typescript
    const mkVoice = (buffer: AudioBuffer): Voice => {
      const ctx = this.ctx!;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.value = 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.7;
      const splitter = ctx.createChannelSplitter(2);
      const analyserL = ctx.createAnalyser();
      const analyserR = ctx.createAnalyser();
      analyserL.fftSize = 2048;
      analyserR.fftSize = 2048;
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
      return { buffer, gain, src: null, analyser, splitter, analyserL, analyserR };
    };
```

In `play()`, inside `startVoice`, after `src.connect(v.gain);` add the analyser taps (these are pre-gain, so they receive signal even when the voice is muted):

```typescript
      src.connect(v.gain);
      src.connect(v.analyser);
      src.connect(v.splitter);
```

Add accessor methods to the class (e.g. just below `setOffsetB`):

```typescript
  getAnalyser(role: "mix" | "reference"): AnalyserNode | null {
    const v = role === "mix" ? this.mix : this.ref;
    return v?.analyser ?? null;
  }

  getStereoAnalysers(role: "mix" | "reference"): { l: AnalyserNode; r: AnalyserNode } | null {
    const v = role === "mix" ? this.mix : this.ref;
    return v ? { l: v.analyserL, r: v.analyserR } : null;
  }

  sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }
```

- [ ] **Step 2: Create the `audioTap` module singleton**

Create `frontend/src/features/audio/tap.ts`:

```typescript
import type { AudioEngine } from "./engine";

/**
 * Module-level handle to the live AudioEngine so panels deep in the tree
 * (spectrum, goniometer) can read AnalyserNode taps without prop-drilling or a
 * context. useAudioEngine registers/unregisters the active engine.
 */
let current: AudioEngine | null = null;

export const audioTap = {
  set(engine: AudioEngine | null) {
    current = engine;
  },
  analyser(role: "mix" | "reference"): AnalyserNode | null {
    return current?.getAnalyser(role) ?? null;
  },
  stereo(role: "mix" | "reference") {
    return current?.getStereoAnalysers(role) ?? null;
  },
  sampleRate(): number {
    return current?.sampleRate() ?? 48000;
  },
};
```

- [ ] **Step 3: Register the engine in `useAudioEngine`**

In `frontend/src/features/audio/useAudioEngine.ts`, import the tap:

```typescript
import { audioTap } from "./tap";
```

Inside the load `useEffect`, register the engine on success and clear it on cleanup. In the `.then(() => { ... })` block, after `readyRef.current = true;` add:

```typescript
        audioTap.set(engine);
```

In that effect's `return () => { ... }` cleanup, before `engine.dispose();` add:

```typescript
      audioTap.set(null);
```

- [ ] **Step 4: Verify build + that playback is unchanged**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Then manually (via `/run` or `npm run dev`): open a ready comparison, press Space — audio still plays and A/B toggling still works (the analyser taps are additive and route nowhere audible).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/audio/engine.ts frontend/src/features/audio/tap.ts frontend/src/features/audio/useAudioEngine.ts
git commit -m "feat(audio): AnalyserNode taps + audioTap singleton for live panels"
```

---

## Task A5: LTAS panel

**Files:**
- Modify: `frontend/src/features/panels/draw.ts`
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Add the `ltasCurve` draw helper**

Append to `frontend/src/features/panels/draw.ts` (reuses the existing module-private `setup` and `css`):

```typescript
const F_LO = 20, F_HI = 20000;

/** Map a frequency (Hz) to an x pixel on a log scale within [padL, w). */
function logFreqX(f: number, padL: number, w: number): number {
  const r = (Math.log10(f) - Math.log10(F_LO)) / (Math.log10(F_HI) - Math.log10(F_LO));
  return padL + r * (w - padL);
}

/** LTAS tonal-balance curve: log-freq x-axis, peak-normalised dB y-axis. */
export function ltasCurve(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3");
  const padL = 30;
  const dbLo = -54, dbHi = 6;
  const yOf = (db: number) => h - ((db - dbLo) / (dbHi - dbLo)) * h;
  ctx.font = '9px "JetBrains Mono", monospace';
  // horizontal dB gridlines
  for (let db = 0; db >= -48; db -= 12) {
    const y = yOf(db);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(`${db}`, 4, y + 3);
  }
  // vertical decade gridlines + labels
  for (const f of [100, 1000, 10000]) {
    const x = logFreqX(f, padL, w);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h - 12); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
  }
  const drawCurve = (track: TrackPayload, color: string) => {
    const l = track.ltas; if (!l) return;
    ctx.beginPath();
    for (let i = 0; i < l.freqs.length; i++) {
      const x = logFreqX(l.freqs[i], padL, w);
      const y = yOf(Math.max(dbLo, l.db[i]));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    ctx.globalAlpha = 1;
  };
  drawCurve(A, a); drawCurve(B, b);
}
```

- [ ] **Step 2: Add `LtasBody`**

In `frontend/src/features/panels/bodies.tsx`, add `ltasCurve` to the `draw` import and add the body component (place it after `CrestBody`):

```typescript
import { lufsLane, valueLane, ltasCurve } from "./draw";
```

```typescript
export function LtasBody({ mix, ref }: BodyProps) {
  const cref = useCanvasDraw((cv) => ltasCurve(cv, mix, ref), [mix, ref]);
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
```

- [ ] **Step 3: Register the LTAS view**

In `frontend/src/features/panels/PanelWorkspace.tsx`:

Update the `ltas` entry in `VIEWS` to be a real fixed-height frequency panel:

```typescript
  ltas:          { title: "LTAS — tonal balance", sub: "long-term average spectrum", family: "Frequency", kind: "freq", h: 200 },
```

Remove `ltas` from `PHASE_FOR` (delete the `ltas: "Phase 2",` entry).

Import `LtasBody` and add a dispatch branch. Update the bodies import:

```typescript
import {
  ShortTermLufsBody, CrestBody, TilesBody, SummaryBody, LtasBody, PlaceholderBody, TimeOverlay,
} from "./bodies";
```

In `Panel`, add a branch to the `if/else` chain (after the `crest` branch):

```typescript
  } else if (id === "ltas") {
    body = <LtasBody mix={mix} ref={ref} />;
```

- [ ] **Step 4: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: the default layout includes `ltas` — open a comparison and confirm the LTAS panel draws two smooth log-freq curves (amber A, cyan B) with 100/1k/10k labels.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/panels/draw.ts frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): LTAS tonal-balance curve"
```

---

## Task A6: Band-energy delta panel

**Files:**
- Modify: `frontend/src/features/panels/draw.ts`
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Add the `bandDelta` draw helper**

Append to `frontend/src/features/panels/draw.ts` (import `R` is already present at the top of the file):

```typescript
/** 7 vertical bars = (A − B) band energy in dB, centred on a zero line. */
export function bandDelta(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.10)", tx3 = css("--tx-3");
  const range = 9; // ±9 dB full scale
  const mid = h / 2;
  const yOf = (d: number) => mid - (Math.max(-range, Math.min(range, d)) / range) * (mid - 14);
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(w, mid + 0.5); ctx.stroke();
  const n = R.BAND_EDGES.length;
  const slot = w / n;
  for (let i = 0; i < n; i++) {
    const { name, lo, hi } = R.BAND_EDGES[i];
    const dA = R.bandEnergy(A, lo, hi), dB = R.bandEnergy(B, lo, hi);
    const d = (isFinite(dA) && isFinite(dB)) ? dA - dB : 0;
    const x = i * slot + slot * 0.2;
    const bw = slot * 0.6;
    const y = yOf(d);
    ctx.fillStyle = d >= 0 ? a : b;
    ctx.fillRect(x, Math.min(mid, y), bw, Math.abs(y - mid));
    ctx.fillStyle = tx3; ctx.textAlign = "center";
    ctx.fillText(name, x + bw / 2, h - 3);
    ctx.fillText((d >= 0 ? "+" : "") + d.toFixed(1), x + bw / 2, d >= 0 ? y - 3 : y + 9);
  }
  ctx.textAlign = "left";
}
```

- [ ] **Step 2: Add `BandDeltaBody`**

In `frontend/src/features/panels/bodies.tsx`, add `bandDelta` to the draw import and add the body (after `LtasBody`):

```typescript
import { lufsLane, valueLane, ltasCurve, bandDelta } from "./draw";
```

```typescript
export function BandDeltaBody({ mix, ref }: BodyProps) {
  const cref = useCanvasDraw((cv) => bandDelta(cv, mix, ref), [mix, ref]);
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
```

- [ ] **Step 3: Register the band-delta view**

In `frontend/src/features/panels/PanelWorkspace.tsx`:

```typescript
  bandDelta:     { title: "Band-energy delta", sub: "A relative to B · whole file", family: "Frequency", kind: "freq", h: 168 },
```

Remove `bandDelta` from `PHASE_FOR`. Add `BandDeltaBody` to the bodies import and a dispatch branch after the `ltas` branch:

```typescript
  } else if (id === "bandDelta") {
    body = <BandDeltaBody mix={mix} ref={ref} />;
```

- [ ] **Step 4: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: add the "Band-energy delta" panel from the Add-panel menu → 7 labelled bars (Sub…Air) above/below a zero line.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/panels/draw.ts frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): band-energy delta bars"
```

---

## Task A7: Live spectrum analyzer panel

**Files:**
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Add `SpectrumBody`**

In `frontend/src/features/panels/bodies.tsx`, add these imports at the top of the file (alongside the existing imports):

```typescript
import { useEffect, useRef } from "react";
import { audioTap } from "../audio/tap";
```

Add the component (after `BandDeltaBody`). It runs a permanent rAF: it draws the faint LTAS baseline, then overlays each track's live `AnalyserNode` spectrum, **holding** the last non-silent frame (so a paused playhead keeps the last spectrum):

```typescript
const F_LO = 20, F_HI = 20000;

export function SpectrumBody({ mix, ref }: BodyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Held frames: last non-silent analyser reading per track (dB arrays).
  const heldA = useRef<Float32Array | null>(null);
  const heldB = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssVar = (n: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const sr = audioTap.sampleRate();
    let raf = 0;

    const read = (role: "mix" | "reference", held: typeof heldA) => {
      const an = audioTap.analyser(role);
      if (!an) return held.current;
      const buf = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(buf); // dB, −Infinity when silent
      let peak = -Infinity;
      for (let i = 0; i < buf.length; i++) if (buf[i] > peak) peak = buf[i];
      if (peak > -100) held.current = buf; // only overwrite on real signal (hold-on-pause)
      return held.current;
    };

    const draw = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const a = cssVar("--a"), b = cssVar("--b"), line = "rgba(255,255,255,0.06)", tx3 = cssVar("--tx-3");
      const padL = 30, dbLo = -100, dbHi = -20;
      const xOf = (f: number) =>
        padL + ((Math.log10(f) - Math.log10(F_LO)) / (Math.log10(F_HI) - Math.log10(F_LO))) * (w - padL);
      const yOf = (db: number) => h - ((Math.max(dbLo, Math.min(dbHi, db)) - dbLo) / (dbHi - dbLo)) * h;
      ctx.font = '9px "JetBrains Mono", monospace';
      for (const f of [100, 1000, 10000]) {
        const x = xOf(f);
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h - 12); ctx.stroke();
        ctx.fillStyle = tx3; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, h - 3);
      }
      // faint LTAS baseline (always present, even before playback)
      const baseline = (track: TrackPayload, color: string) => {
        const l = track.ltas; if (!l) return;
        ctx.beginPath();
        for (let i = 0; i < l.freqs.length; i++) {
          const x = xOf(l.freqs[i]);
          const y = yOf(dbLo + ((l.db[i] + 60) / 66) * (dbHi - dbLo)); // map norm-LTAS into view
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.globalAlpha = 0.18; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      };
      baseline(mix, a); baseline(ref, b);
      // live (or held) analyser spectra
      const live = (frame: Float32Array | null, color: string, an: AnalyserNode | null) => {
        if (!frame || !an) return;
        const bins = frame.length;
        ctx.beginPath(); let started = false;
        for (let i = 1; i < bins; i++) {
          const f = (i * sr) / (bins * 2);
          if (f < F_LO || f > F_HI) continue;
          const x = xOf(f), y = yOf(frame[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.lineJoin = "round"; ctx.stroke();
      };
      live(read("mix", heldA), a, audioTap.analyser("mix"));
      live(read("reference", heldB), b, audioTap.analyser("reference"));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mix, ref]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
```

- [ ] **Step 2: Register the live-spectrum view**

In `frontend/src/features/panels/PanelWorkspace.tsx`:

```typescript
  liveSpectrum:  { title: "Live spectrum", sub: "real-time · holds on pause", family: "Frequency", kind: "freq", h: 200 },
```

Remove `liveSpectrum` from `PHASE_FOR`. Add `SpectrumBody` to the bodies import and a dispatch branch after the `bandDelta` branch:

```typescript
  } else if (id === "liveSpectrum") {
    body = <SpectrumBody mix={mix} ref={ref} />;
```

- [ ] **Step 3: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: add the "Live spectrum" panel; before playback you see faint LTAS baselines; press Space → live amber (A) + cyan (B) spectra animate together; press Space to pause → the last spectrum is held on screen.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): real-time live spectrum analyzer (hold-on-pause)"
```

---

## Task A8: Centroid / tilt summary tiles + frequency CSS polish

**Files:**
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/styles/tokens.css` (only if a new class is referenced — the panels reuse `tile-grid`/`tile`)

- [ ] **Step 1: Surface centroid + tilt in the Static summary panel**

In `frontend/src/features/panels/bodies.tsx`, extend `SummaryBody`'s `rows` array to include the two P2 aggregates (guard with `?? 0` since they are optional):

```typescript
  const rows: [string, number, number, string][] = [
    ["Integrated LUFS", mix.static.integrated, ref.static.integrated, "LUFS"],
    ["LRA", mix.static.lra, ref.static.lra, "LU"],
    ["True-peak max", mix.static.truePeakMax, ref.static.truePeakMax, "dBTP"],
    ["PLR", mix.static.plr, ref.static.plr, "dB"],
    ["Centroid", mix.static.centroidAvg ?? 0, ref.static.centroidAvg ?? 0, "Hz"],
    ["Tilt", mix.static.tilt ?? 0, ref.static.tilt ?? 0, "dB/oct"],
  ];
```

- [ ] **Step 2: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: the "Static summary" panel now shows Centroid (Hz) and Tilt (dB/oct) rows for A and B.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/panels/bodies.tsx
git commit -m "feat(panels): centroid + tilt in static summary"
```

**Part A is shippable here:** the Frequency family (LTAS, band-delta, live spectrum, centroid/tilt) is complete end-to-end. New uploads carry the LTAS payload; previously-analyzed comparisons must be re-created to gain `ltas`/`centroid` (the panels guard for `ltas: null` and render baselines/zeros gracefully).

---

# PART B — Spatial (Substrate 3)

## Task B1: Backend spatial substrate (`spatial.py`)

**Files:**
- Create: `backend/app/analysis/spatial.py`
- Test: `backend/tests/test_spatial.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_spatial.py`:

```python
import numpy as np
from app.analysis import spatial


def _stereo(sr, secs, freq, ampL, ampR, phaseR=0.0):
    t = np.arange(int(sr * secs)) / sr
    left = (ampL * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    right = (ampR * np.sin(2 * np.pi * freq * t + phaseR)).astype(np.float32)
    return np.stack([left, right])


def test_correlation_mono_is_one():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5)  # identical L/R
    corr = spatial.correlation_series(pcm, sr)
    assert np.median(corr[3:]) > 0.98


def test_correlation_antiphase_is_negative():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5, phaseR=np.pi)  # inverted R
    corr = spatial.correlation_series(pcm, sr)
    assert np.median(corr[3:]) < -0.9


def test_ms_ratio_mono_near_zero():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.5)  # no side content
    ms = spatial.ms_ratio_series(pcm, sr)
    assert np.median(ms) < 0.05


def test_balance_right_heavier_is_positive():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.25, 0.5)  # right louder
    bal = spatial.balance_series(pcm, sr)
    assert np.median(bal) > 3.0  # ~ +6 dB


def test_compute_substrate3_payload_shape():
    sr = 48000
    pcm = _stereo(sr, 2.0, 500.0, 0.5, 0.4)
    out = spatial.compute_substrate3(pcm, sr, hop_s=0.1)
    for key in ("correlation", "msRatio", "balance"):
        assert key in out["features"] and len(out["features"][key]) >= 1
    for key in ("avgCorrelation", "msRatioAvg", "widthPerBand"):
        assert key in out["static"]
    assert len(out["static"]["widthPerBand"]) == len(spatial.DEFAULT_BANDS)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_spatial.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analysis.spatial'`.

- [ ] **Step 3: Implement `spatial.py`**

Create `backend/app/analysis/spatial.py`:

```python
from __future__ import annotations

import numpy as np
from scipy.signal import welch

# Matches schemas.ComparisonDefaults.bandEdges.
DEFAULT_BANDS: list[tuple[float, float]] = [
    (20, 60), (60, 120), (120, 400), (400, 2000),
    (2000, 5000), (5000, 10000), (10000, 20000),
]


def _block_count(n_samples: int, hop: int) -> int:
    return n_samples // hop


def correlation_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, win_s: float = 0.3
) -> np.ndarray:
    """Normalised L/R cross-correlation over a trailing ~win_s window, -1..1."""
    L = pcm[0].astype(np.float64)
    R = pcm[1].astype(np.float64)
    hop = int(round(hop_s * sample_rate))
    n = _block_count(L.shape[0], hop)
    if n == 0:
        return np.zeros(0)
    Lr = L[: n * hop].reshape(n, hop)
    Rr = R[: n * hop].reshape(n, hop)
    sLL = (Lr * Lr).sum(axis=1)
    sRR = (Rr * Rr).sum(axis=1)
    sLR = (Lr * Rr).sum(axis=1)
    cLL = np.concatenate([[0.0], np.cumsum(sLL)])
    cRR = np.concatenate([[0.0], np.cumsum(sRR)])
    cLR = np.concatenate([[0.0], np.cumsum(sLR)])
    win_blocks = max(1, int(round(win_s / hop_s)))
    out = np.zeros(n)
    for i in range(n):
        lo = max(0, i - win_blocks + 1)
        ll = cLL[i + 1] - cLL[lo]
        rr = cRR[i + 1] - cRR[lo]
        lr = cLR[i + 1] - cLR[lo]
        d = np.sqrt(ll * rr)
        out[i] = lr / d if d > 0 else 0.0
    return out


def ms_ratio_series(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> np.ndarray:
    """Side/Mid energy ratio per block (0 = mono, larger = wider)."""
    M = (pcm[0] + pcm[1]) * 0.5
    S = (pcm[0] - pcm[1]) * 0.5
    hop = int(round(hop_s * sample_rate))
    n = _block_count(M.shape[0], hop)
    if n == 0:
        return np.zeros(0)
    Me = (M[: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    Se = (S[: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    return np.where(Me > 0, Se / Me, 0.0)


def balance_series(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> np.ndarray:
    """L/R balance in dB per block; positive = right louder."""
    hop = int(round(hop_s * sample_rate))
    n = _block_count(pcm.shape[1], hop)
    if n == 0:
        return np.zeros(0)
    Le = (pcm[0][: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    Re = (pcm[1][: n * hop].astype(np.float64) ** 2).reshape(n, hop).mean(axis=1)
    return np.where((Le > 0) & (Re > 0), 10.0 * np.log10(Re / Le), 0.0)


def width_per_band(
    pcm: np.ndarray, sample_rate: int, bands: list[tuple[float, float]] = DEFAULT_BANDS
) -> list[float]:
    """Whole-file Side/Mid energy ratio within each band (via Welch PSD)."""
    M = (pcm[0] + pcm[1]) * 0.5
    S = (pcm[0] - pcm[1]) * 0.5
    nper = min(4096, pcm.shape[1])
    f, PM = welch(M.astype(np.float64), fs=sample_rate, nperseg=nper)
    _, PS = welch(S.astype(np.float64), fs=sample_rate, nperseg=nper)
    out = []
    for lo, hi in bands:
        sel = (f >= lo) & (f < hi)
        m = PM[sel].sum()
        s = PS[sel].sum()
        out.append(round(float(s / m) if m > 0 else 0.0, 3))
    return out


def compute_substrate3(pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1) -> dict:
    """Substrate-3 (spatial family): correlation, M/S, balance, per-band width."""
    corr = correlation_series(pcm, sample_rate, hop_s)
    ms = ms_ratio_series(pcm, sample_rate, hop_s)
    bal = balance_series(pcm, sample_rate, hop_s)

    def _l(a: np.ndarray) -> list[float]:
        return [round(float(x), 3) for x in a]

    return {
        "features": {"correlation": _l(corr), "msRatio": _l(ms), "balance": _l(bal)},
        "static": {
            "avgCorrelation": round(float(np.median(corr)) if corr.size else 0.0, 2),
            "msRatioAvg": round(float(np.median(ms)) if ms.size else 0.0, 3),
            "widthPerBand": width_per_band(pcm, sample_rate),
        },
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_spatial.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/spatial.py backend/tests/test_spatial.py
git commit -m "feat(dsp): Substrate-3 spatial — correlation, M/S, balance, width"
```

---

## Task B2: Wire the spatial stage into the pipeline

**Files:**
- Modify: `backend/app/analysis/pipeline.py`

- [ ] **Step 1: Add `spatial` to imports + stages**

```python
from app.analysis import decode, features, loudness, spatial, spectrum, waveform
```

```python
ALL_STAGES = ["decode", "gainmatch", "loudness", "frequency", "spatial", "waveform"]
```

- [ ] **Step 2: Merge sub3 in `_pack_payload`**

Replace the `_pack_payload` signature and the two merge lines to accept `sub3`:

```python
def _pack_payload(track: Track, fileinfo, meta_dur, integrated, offset, peaks, sub1, sub2, sub3) -> bytes:
    features = {**sub1["features"], **sub2["features"], **sub3["features"]}
    static = {**sub1["static"], **sub2["static"], **sub3["static"]}
```

(The rest of `_pack_payload` is unchanged from Task A2.)

- [ ] **Step 3: Compute sub3 in `run_analysis`**

After the `frequency` stage block (after `_set_stage(db, job, tr.role, "frequency", "done")`), insert:

```python
            current_stage = "spatial"
            _set_stage(db, job, tr.role, "spatial", "running")
            sub3 = spatial.compute_substrate3(
                pcm, settings.analysis_sample_rate, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "spatial", "done")
```

Update the `_pack_payload` call in the `waveform` stage to pass `sub3`:

```python
            payload = _pack_payload(tr, info, dur, integ, offset, peaks, sub1, sub2, sub3)
```

- [ ] **Step 4: Verify the full backend suite passes**

Run: `cd backend && uv run pytest -q`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/pipeline.py
git commit -m "feat(pipeline): compute Substrate-3 in a spatial stage"
```

---

## Task B3: Frontend spatial types

**Files:**
- Modify: `frontend/src/types/payload.ts`

- [ ] **Step 1: Extend `Features` and `StaticAggregates`**

In `frontend/src/types/payload.ts`, update the `Features` comment line to declare the three spatial arrays (they are already permitted by the index signature; the named fields document them):

```typescript
  centroid?: number[];     // P2
  correlation?: number[];  // P3
  msRatio?: number[];      // P3
  balance?: number[];      // P3
```

In `StaticAggregates`, add:

```typescript
  avgCorrelation?: number; // P3 (already declared — keep)
  msRatioAvg?: number;     // P3
  widthPerBand?: number[]; // P3, 7 bands
```

(Remove the duplicate `avgCorrelation?` line if it already exists; keep exactly one.)

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/payload.ts
git commit -m "feat(types): spatial feature + static fields"
```

---

## Task B4: Correlation lane panel

**Files:**
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Add `CorrelationBody` (reuses the existing `valueLane`)**

In `frontend/src/features/panels/bodies.tsx`, add (after `CrestBody`):

```typescript
export function CorrelationBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB } = useViewState();
  const cref = useCanvasDraw(
    (cv) =>
      valueLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary: false }, {
        lo: -1, hi: 1, key: "correlation", ticks: [-1, -0.5, 0, 0.5, 1],
        redBelow: 0, fmt: (v) => v.toFixed(1),
      }),
    [secPerPx, scroll, offsetB, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
```

- [ ] **Step 2: Register the correlation view as a time-axis lane**

In `frontend/src/features/panels/PanelWorkspace.tsx`:

```typescript
  correlation:   { title: "Phase correlation", sub: "mono-compatibility", family: "Stereo", kind: "time", h: 148 },
```

Remove `correlation` from `PHASE_FOR`. Add `CorrelationBody` to the bodies import and a dispatch branch (after the `crest` branch, alongside the other time lanes):

```typescript
  } else if (id === "correlation") {
    body = <CorrelationBody mix={mix} ref={ref} />;
```

(`kind: "time"` makes `isTime` true, so the shared `TimeOverlay` playhead/region draws over it — correct, it shares the time axis.)

- [ ] **Step 3: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: add "Phase correlation" → a −1..+1 lane with a red zone below 0, amber A + cyan B traces, sharing the playhead column.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): phase-correlation lane"
```

---

## Task B5: M/S width tile panel

**Files:**
- Modify: `frontend/src/features/panels/draw.ts`
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Add the `bandBars` draw helper (per-band width, A vs B)**

Append to `frontend/src/features/panels/draw.ts`:

```typescript
/** Per-band width: paired A/B bars (height ∝ S/M ratio) across the 7 bands. */
export function bandBars(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), tx3 = css("--tx-3");
  const wbA = A.static.widthPerBand ?? [], wbB = B.static.widthPerBand ?? [];
  const n = R.BAND_EDGES.length;
  const slot = w / n;
  const hi = Math.max(0.6, ...wbA, ...wbB); // dynamic full-scale
  const base = h - 14;
  ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = "center";
  for (let i = 0; i < n; i++) {
    const vA = wbA[i] ?? 0, vB = wbB[i] ?? 0;
    const hA = (Math.min(hi, vA) / hi) * (base - 4);
    const hB = (Math.min(hi, vB) / hi) * (base - 4);
    const x = i * slot;
    ctx.fillStyle = a; ctx.fillRect(x + slot * 0.18, base - hA, slot * 0.28, hA);
    ctx.fillStyle = b; ctx.fillRect(x + slot * 0.54, base - hB, slot * 0.28, hB);
    ctx.fillStyle = tx3; ctx.fillText(R.BAND_EDGES[i].name, x + slot / 2, h - 3);
  }
  ctx.textAlign = "left";
}
```

- [ ] **Step 2: Add `StereoTilesBody`**

In `frontend/src/features/panels/bodies.tsx`, add `bandBars` to the draw import, then add the body. It shows region-scoped M/S ratio tiles (reusing the `tile-grid` markup) plus the per-band width bars:

```typescript
import { lufsLane, valueLane, ltasCurve, bandDelta, bandBars } from "./draw";
```

```typescript
export function StereoTilesBody({ mix, ref }: BodyProps) {
  const { regionA, offsetB } = useViewState();
  const [t0, t1] = regionA ?? [0, mix.meta.duration];
  const off = offsetB;
  const msA = regionA ? R.mean(mix, "msRatio", t0, t1) : (mix.static.msRatioAvg ?? 0);
  const msB = regionA ? R.mean(ref, "msRatio", t0 + off, t1 + off) : (ref.static.msRatioAvg ?? 0);
  const coA = regionA ? R.mean(mix, "correlation", t0, t1) : (mix.static.avgCorrelation ?? 0);
  const coB = regionA ? R.mean(ref, "correlation", t0 + off, t1 + off) : (ref.static.avgCorrelation ?? 0);
  const cref = useCanvasDraw((cv) => bandBars(cv, mix, ref), [mix, ref]);

  const tile = (label: string, a: number, b: number) => (
    <div className="tile" key={label}>
      <span className="tile-l">{label}</span>
      <div className="tile-vals">
        <span className="tile-v a">{a.toFixed(2)}</span>
        <span className="tile-v b">{b.toFixed(2)}</span>
        <span className="tile-delta">{(a - b >= 0 ? "+" : "") + (a - b).toFixed(2)}</span>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="tile-grid">
        {tile("M/S ratio", msA, msB)}
        {tile("Avg correlation", coA, coB)}
      </div>
      <div style={{ fontSize: 10, color: "var(--tx-3)", padding: "6px 10px 2px" }}>
        Width per band (S/M)
      </div>
      <div style={{ flex: 1, minHeight: 80 }}>
        <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the M/S-width view**

In `frontend/src/features/panels/PanelWorkspace.tsx`, add a new entry to `VIEWS` (in the Stereo family, after `correlation`):

```typescript
  stereoTiles:   { title: "M/S width", sub: "region ratio + per-band width", family: "Stereo", kind: "tiles", h: null },
```

Add `StereoTilesBody` to the bodies import and a dispatch branch (after the `tiles` branch):

```typescript
  } else if (id === "stereoTiles") {
    body = <StereoTilesBody mix={mix} ref={ref} />;
```

- [ ] **Step 4: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: add "M/S width" → two ratio tiles (region-aware when a region is selected) + 7 paired A/B width bars.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/panels/draw.ts frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): M/S width tiles + per-band width bars"
```

---

## Task B6: Correlation + Balance meters

**Files:**
- Create: `frontend/src/features/meters/spatialMeters.tsx`
- Modify: `frontend/src/features/meters/MeterColumn.tsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Create the meter components**

Create `frontend/src/features/meters/spatialMeters.tsx`. The correlation meter reuses the pre-existing `corr-meter`/`corr-row`/`corr-scale`/`corr-needle`/`corr-axis` classes in `tokens.css`; the balance meter uses two small dual bars:

```typescript
/* eslint-disable react-hooks/refs -- `ref` here is the B/reference-track payload
 * (MeterProps.ref: TrackPayload), not a React ref object. */
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import * as R from "../analysis/read";

interface MeterProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

/** Map correlation −1..+1 to 0..100% across the scale. */
const corrPct = (c: number) => ((Math.max(-1, Math.min(1, c)) + 1) / 2) * 100;

export function CorrelationMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  const cA = R.at(mix, "correlation", Math.max(0, playhead));
  const cB = R.at(ref, "correlation", Math.max(0, playhead + offsetB));
  const row = (label: string, c: number, cls: "a" | "b") => (
    <div className="corr-row">
      <span className="lbl">
        <span className="dot" style={{ background: `var(--${cls})` }} />
        {label}
        <span className="v">{c.toFixed(2)}</span>
      </span>
      <div className="corr-scale" style={{ background: "linear-gradient(90deg, var(--warn-soft, rgba(229,84,78,.25)), transparent 50%, transparent)" }}>
        <span className={`corr-needle ${cls}`} style={{ left: `calc(${corrPct(c)}% - 1.5px)` }} />
      </div>
      <div className="corr-axis"><span>−1</span><span>0</span><span>+1</span></div>
    </div>
  );
  return (
    <div className="corr-meter">
      {row("A · mix", cA, "a")}
      {row("B · ref", cB, "b")}
    </div>
  );
}

/** Balance in dB → horizontal offset from centre. Positive = right louder. */
export function BalanceMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  const bA = R.at(mix, "balance", Math.max(0, playhead));
  const bB = R.at(ref, "balance", Math.max(0, playhead + offsetB));
  const pct = (db: number) => 50 + (Math.max(-12, Math.min(12, db)) / 12) * 50;
  const row = (label: string, db: number, cls: "a" | "b") => (
    <div className="corr-row">
      <span className="lbl">
        <span className="dot" style={{ background: `var(--${cls})` }} />
        {label}
        <span className="v">{(db >= 0 ? "+" : "") + db.toFixed(1)} dB</span>
      </span>
      <div className="corr-scale" style={{ background: "var(--surface-3)" }}>
        <span className={`corr-needle ${cls}`} style={{ left: `calc(${pct(db)}% - 1.5px)` }} />
      </div>
      <div className="corr-axis"><span>L</span><span>·</span><span>R</span></div>
    </div>
  );
  return (
    <div className="corr-meter">
      {row("A · mix", bA, "a")}
      {row("B · ref", bB, "b")}
    </div>
  );
}
```

- [ ] **Step 2: Wire the meters into `MeterColumn`**

In `frontend/src/features/meters/MeterColumn.tsx`, import the new components:

```typescript
import { CorrelationMeter, BalanceMeter } from "./spatialMeters";
```

In `MeterSlot`'s body dispatch, replace the trailing `MeterPlaceholder` fallback chain with branches for `correlation` and `balance`:

```typescript
      <div className="meter-body">
        {!mix || !ref ? (
          <MeterPlaceholder title={METERS[id]} phase="analysis" />
        ) : id === "lufs" ? (
          <LufsMeter mix={mix} ref={ref} />
        ) : id === "truepeak" ? (
          <TruePeakMeter mix={mix} ref={ref} />
        ) : id === "correlation" ? (
          <CorrelationMeter mix={mix} ref={ref} />
        ) : id === "balance" ? (
          <BalanceMeter mix={mix} ref={ref} />
        ) : (
          <MeterPlaceholder title={METERS[id]} phase="a later phase" />
        )}
      </div>
```

- [ ] **Step 3: Add a `--warn-soft` token (only if missing)**

In `frontend/src/styles/tokens.css`, confirm the `:root` block defines `--warn-soft`; if not, add it near `--warn`:

```css
  --warn-soft: rgba(229, 84, 78, 0.22);
```

(The correlation meter references it for the sub-zero red zone; the inline style already provides a fallback, so this is cosmetic.)

- [ ] **Step 4: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: in a meter slot's `▾` picker choose Correlation, then Balance → each shows A/B needles; values update as the playhead moves during playback.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/meters/spatialMeters.tsx frontend/src/features/meters/MeterColumn.tsx frontend/src/styles/tokens.css
git commit -m "feat(meters): correlation + stereo-balance meters"
```

---

## Task B7: Dual goniometer panel (real-time)

**Files:**
- Modify: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1: Add `GoniometerBody`**

In `frontend/src/features/panels/bodies.tsx` add the component (after `SpectrumBody`). It renders two side-by-side scopes (A and B), each reading the per-channel time-domain analysers via `audioTap.stereo()`, plotting `(x = (L−R)/√2, y = (L+R)/√2)` with a phosphor fade (translucent fill instead of clear). It is only meaningful while audio plays; when silent the trail fades to empty:

```typescript
function Scope({ role, color }: { role: "mix" | "reference"; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stroke = getComputedStyle(document.documentElement).getPropertyValue(color).trim();
    let raf = 0;
    const draw = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.max(1, Math.round(Math.min(r.width, r.height)));
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // phosphor fade: paint translucent black over the previous frame
      ctx.fillStyle = "rgba(8,7,5,0.22)";
      ctx.fillRect(0, 0, size, size);
      const an = audioTap.stereo(role);
      if (an) {
        const N = an.l.fftSize;
        const L = new Float32Array(N), Rr = new Float32Array(N);
        an.l.getFloatTimeDomainData(L);
        an.r.getFloatTimeDomainData(Rr);
        const cx = size / 2, cy = size / 2, scale = size * 0.46;
        ctx.fillStyle = stroke; ctx.globalAlpha = 0.8;
        for (let i = 0; i < N; i++) {
          const x = cx + ((L[i] - Rr[i]) / Math.SQRT2) * scale;
          const y = cy - ((L[i] + Rr[i]) / Math.SQRT2) * scale;
          ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [role, color]);
  return <canvas ref={canvasRef} className="gonio-scope" />;
}

export function GoniometerBody() {
  return (
    <div className="gonio-wrap">
      <div className="gonio-cell"><span className="gonio-tag a">A</span><Scope role="mix" color="--a" /></div>
      <div className="gonio-cell"><span className="gonio-tag b">B</span><Scope role="reference" color="--b" /></div>
    </div>
  );
}
```

- [ ] **Step 2: Register the goniometer view (no payload props needed)**

In `frontend/src/features/panels/PanelWorkspace.tsx`:

```typescript
  goniometer:    { title: "Goniometer", sub: "real-time · A | B side-by-side", family: "Stereo", kind: "freq", h: 220 },
```

Remove `goniometer` from `PHASE_FOR`. Add `GoniometerBody` to the bodies import and a dispatch branch (it takes no `mix`/`ref` props):

```typescript
  } else if (id === "goniometer") {
    body = <GoniometerBody />;
```

- [ ] **Step 3: Add goniometer CSS**

Append to `frontend/src/styles/tokens.css`:

```css
/* goniometer */
.gonio-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; height: 100%; padding: 8px 10px; }
.gonio-cell { position: relative; display: grid; place-items: center; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; }
.gonio-scope { width: 100%; height: 100%; display: block; }
.gonio-tag { position: absolute; top: 6px; left: 8px; font-size: 10px; font-family: var(--mono); letter-spacing: .08em; }
.gonio-tag.a { color: var(--a); } .gonio-tag.b { color: var(--b); }
```

- [ ] **Step 4: Build + lint + manual check**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. Manual: add "Goniometer" → two boxed scopes; press Space → A and B Lissajous clouds glow and fade (a mono signal traces a vertical line, wide stereo fills out). Pausing lets the trail fade to black.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx frontend/src/styles/tokens.css
git commit -m "feat(panels): real-time dual goniometer"
```

---

## Final verification (whole plan)

- [ ] **Backend:** `cd backend && uv run pytest -q` → all green (loudness, peak, features, decode, waveform, spectrum, spatial).
- [ ] **Frontend:** `cd frontend && npm run build && npm run lint` → no errors.
- [ ] **End-to-end (manual via `/run`):** create a fresh comparison with two stereo files (or "Use demo files"). On the processing screen, confirm the stage list now shows **Decode → Loudness → Frequency → Spatial → Waveform**. In the workspace, add one of each new panel (LTAS, Live spectrum, Band-energy delta, Phase correlation, M/S width, Goniometer) and both new meters (Correlation, Balance). Press Space: live spectrum + goniometer animate; correlation/balance meters track the playhead; pause holds the last spectrum frame.

> **Migration note:** comparisons analyzed before this plan lack `ltas`/`centroid`/`correlation`/etc. The panels and meters guard for missing data (`ltas: null` → baseline only; absent feature arrays → `R.at` returns 0), so old comparisons render without crashing but show empty frequency/spatial content until re-created.

---

## Self-review — spec coverage

- **Phase 2 (Frequency):** LTAS hero overlay ✓ (A5), real-time spectrum analyzer ✓ (A7, AnalyserNode + hold-on-pause), band-energy delta ✓ (A6), centroid/tilt ✓ (A1 backend + A8 tiles). *Deviation:* 2D canvas instead of regl (decision #1); live spectrum is real-time-only with LTAS baseline, no parked STFT frames (decision #2).
- **Phase 3 (Spatial):** correlation lane ✓ (B4), M/S region tiles ✓ (B5), per-band width ✓ (B5, whole-file — decision #5), dual goniometers ✓ (B7, real-time via channel-split AnalyserNodes rather than an AudioWorklet ring buffer — same Lissajous result, reuses the spectrum infra), correlation + balance meter slots ✓ (B6).
- **Contract:** all new payload fields (`ltas`, `centroid`, `correlation`, `msRatio`, `balance`, `centroidAvg`, `tilt`, `avgCorrelation`, `msRatioAvg`, `widthPerBand`) match the `schemas.py` stubs and the design doc's `buildTrack()` shape. `spectrogram` stays `null` (Phase 5).
- **Type consistency:** `compute_substrate2`/`compute_substrate3` return `{features, static, ...}` dicts merged identically in `_pack_payload`; `bandEnergy`/`BAND_EDGES`/`audioTap` names are used consistently across draw helpers, bodies, and meters.
