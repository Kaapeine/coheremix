# CohereMix Phase 1 — Audio Playback + Loudness Substrate & Meters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, with a review checkpoint before each commit — see [[execution-review-preference]]). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the transport play real, gain-matched, A/B-switchable, region-loopable audio, and fill the loudness panels (short-term LUFS, crest, region tiles, static summary) and the LUFS + True Peak meters with real DSP read off the backend Substrate-1 arrays.

**Architecture:** Two halves, executed in order. **Part A (audio):** a backend endpoint streams each track's raw upload bytes; a frontend `AudioEngine` wraps a single `AudioContext`, decodes both buffers, plays them simultaneously through per-track gain nodes (one audible / one muted = gain-matched, effectively gapless A/B), positions B at `playhead + offsetB`, and re-syncs to the region start on loop. The transport's fake rAF counter is replaced by the engine clock. **Part B (loudness):** the backend computes Substrate-1 features (100 ms K-weighted power blocks → short-term + momentary LUFS series, gated integrated, LRA) plus true-peak (≥4× oversample) and windowed crest, verified against BS.1770-4/EBU values; the frontend gets a typed read layer (`at`/`mean`/`max`) and renders the loudness lanes (2D canvas), region/summary tiles, and the LUFS + True Peak meters by indexing those arrays at the playhead.

**Tech stack:** Backend — Python, FastAPI, numpy, scipy.signal (biquad K-weighting + polyphase oversample), pyloudnorm (cross-check only), pytest. Frontend — React + TypeScript, Zustand, Web Audio API (`AudioContext`, `AudioBufferSourceNode`, `GainNode`), 2D Canvas for lanes.

**Decisions locked before planning:**
- **Audio playback is pulled forward from P4** (spec §8 schedules it there) because a transport you can hear makes every downstream metric verifiable. The full equal-power crossfade, match-mode variants (`shortterm`/`region`), and frame-perfect loop stay in P4; P1 ships working matched A/B + region loop.
- **Meters/panels read precomputed `features` arrays at the playhead** (engineering-spec §5: "live views must index precomputed frames… AnalyserNode emits nothing while parked — fatal"). The playhead is now driven by the real audio clock during playback, so the same read path serves both parked and playing. The AudioWorklet live-DSP meter layer stays deferred (P4).
- **Loudness lanes render with 2D Canvas**, not regl (spec §5.7 calls the handoff `draw.js` "a reference, not a build target"; these are text-heavy line charts and WebGL can't draw text). regl stays reserved for P2 spectrum / P3 goniometer / P5 spectrogram.
- **Region tiles use a spec-honest client-side gate.** The backend ships the per-100 ms K-power block array in the payload; the read layer implements the BS.1770-4 two-pass gate so region-scoped integrated LUFS (§5) is correct *and* responsive (no server round-trip on every region drag). Whole-file integrated stays backend-computed.

**Out of scope for P1 (graceful "lands in Phase N" placeholders):** `ltas`/`liveSpectrum`/`bandDelta` panels (P2), `correlation`/`goniometer`/`spectrogram` panels (P3/P5), `psr`/`correlation`/`balance`/`rms` meters (`correlation`/`balance` need Substrate 3; `psr`/`rms` are derivable but kept out to match spec P1 = "LUFS + True Peak meter slots"). Centroid and M/S tiles (need Substrate 2/3).

---

## File Structure

**Backend (create):**
- `backend/app/analysis/peak.py` — true-peak (≥4× oversample) + windowed crest factor.
- `backend/app/analysis/features.py` — orchestrator: takes decoded PCM, returns the `features` dict + `static` aggregates + the K-power block array.
- `backend/tests/test_peak.py` — true-peak + crest tests.
- `backend/tests/test_features.py` — short-term/momentary/integrated-gated/LRA tests vs known values.

**Backend (modify):**
- `backend/app/analysis/loudness.py` — add K-weighting biquads, 100 ms power blocks, short-term/momentary series, self-implemented gated integrated (whole + region), LRA.
- `backend/app/analysis/pipeline.py` — compute Substrate-1 in a `loudness` stage; pack real `features`/`static`/`kblocks`; restructure `ALL_STAGES` to the stages actually run this phase.
- `backend/app/api/comparisons.py` — add `GET /{comp_id}/tracks/{role}/audio` streaming the raw upload.
- `backend/tests/test_loudness.py` — extend (existing 8 tests stay green).

**Frontend (create):**
- `frontend/src/features/audio/engine.ts` — `AudioEngine` class (decode, play/pause/seek, A/B gain routing, B offset, region loop, clock).
- `frontend/src/features/audio/useAudioEngine.ts` — React hook binding the engine to the view store + payloads.
- `frontend/src/features/analysis/read.ts` — typed read layer (`at`/`mean`/`max`) + client-side gated integrated over the K-power blocks.
- `frontend/src/features/panels/useCanvasDraw.ts` — DPR-aware canvas hook (ResizeObserver + redraw-on-deps).
- `frontend/src/features/panels/draw.ts` — `timeMap`/`gridTime`/`lufsLane`/`valueLane` (2D canvas, ported from `draw.js`).
- `frontend/src/features/panels/bodies.tsx` — `ShortTermLufsBody`, `CrestBody`, `TilesBody`, `SummaryBody`, `PlaceholderBody`, `TimeOverlay`.
- `frontend/src/features/meters/meters.tsx` — `LufsMeter`, `TruePeakMeter`, `MeterPlaceholder`.

**Frontend (modify):**
- `frontend/src/types/payload.ts` — typed `Features`/`Static`/`KBlocks`.
- `frontend/src/store/viewState.ts` — no shape change; `momentary`/`target` already present (wired in Part F).
- `frontend/src/screens/Workspace.tsx` — mount audio hook; thread `mixPayload`/`refPayload` into `PanelWorkspace` + `MeterColumn`; pass `compId` to `Transport`.
- `frontend/src/features/transport/Transport.tsx` — drive playback/clock/seek/loop from the engine instead of the rAF counter.
- `frontend/src/features/panels/PanelWorkspace.tsx` — accept payloads; render bodies via a `kind` switch.
- `frontend/src/features/meters/MeterColumn.tsx` — accept payloads; render meter bodies.
- `frontend/src/features/header/Header.tsx` — Settings menu: momentary toggle + target LUFS stepper.
- `frontend/src/api/client.ts` — `audioUrl(id, role)`.
- `frontend/src/screens/Processing.tsx` — render whatever stages the job reports (robust across phases).

---

# PART A — AUDIO PLAYBACK ENGINE

### Task A1: Backend audio-streaming endpoint

**Files:**
- Modify: `backend/app/api/comparisons.py`
- Modify: `backend/app/db/repositories.py` (only if no track lookup helper exists — reuse `get_comparison`)

- [ ] **Step 1: Add the route** after `get_payload` in `comparisons.py`:

```python
@router.get("/{comp_id}/tracks/{role}/audio")
def get_audio(comp_id: str, role: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    track = next((t for t in comp.tracks if t.role == role), None)
    if not track or not track.upload_key:
        raise HTTPException(404, "audio not available")
    path = get_settings().storage_dir / track.upload_key
    if not path.exists():
        raise HTTPException(410, "audio expired")
    return FileResponse(path, filename=path.name)
```

(`FileResponse`, `get_settings`, `repo`, `HTTPException` are already imported.)

- [ ] **Step 2: Verify it serves bytes.** Start the backend (`cd backend && uv run uvicorn app.main:app --port 8000`), open an existing ready comparison id, and:

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" http://localhost:8000/api/comparisons/<ID>/tracks/mix/audio`
Expected: `200 audio/* <nonzero bytes>` (or run against a fresh demo comparison). Confirm `reference` works too.

- [ ] **Step 3: Add the client helper** in `frontend/src/api/client.ts` inside the `api` object:

```typescript
  audioUrl: (id: string, role: string): string =>
    `/api/comparisons/${id}/tracks/${role}/audio`,
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/comparisons.py frontend/src/api/client.ts
git commit -m "feat(api): stream per-track audio for in-browser playback"
```

---

### Task A2: AudioEngine class

**Files:**
- Create: `frontend/src/features/audio/engine.ts`

The engine owns one `AudioContext`. Both tracks play **simultaneously** through their own `GainNode`; the inaudible one is set to gain 0, the audible one to its gain-match linear gain (so A/B is instant and matched). B is started at `position + offsetB`. The engine clock is `ctx.currentTime`-based.

- [ ] **Step 1: Write the engine**

```typescript
export interface EngineLoad {
  mixUrl: string;
  refUrl: string;
}

interface Voice {
  buffer: AudioBuffer;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
}

/**
 * Two buffers play in lock-step through per-voice gain nodes; muting the
 * inaudible voice gives instant, gain-matched A/B. B is positioned at
 * position + offsetB. Match-mode crossfades + frame-perfect loop are P4.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: Voice | null = null;
  private ref: Voice | null = null;

  // playback bookkeeping (all in A-time seconds)
  private startedAtCtx = 0; // ctx.currentTime when current play() began
  private startPos = 0; // A-time at that ctx instant
  private _playing = false;

  // live params (updated from the store)
  private offsetB = 0;
  private ab: "A" | "B" = "A";
  private mixGainLin = 1; // 10^(offsetToCommon/20)
  private refGainLin = 1;
  private matchOn = true;

  onEnded: (() => void) | null = null;

  get playing() {
    return this._playing;
  }

  async load(load: EngineLoad): Promise<number> {
    this.ctx = new AudioContext();
    const [mixBuf, refBuf] = await Promise.all([
      this.fetchDecode(load.mixUrl),
      this.fetchDecode(load.refUrl),
    ]);
    const mkVoice = (buffer: AudioBuffer): Voice => {
      const gain = this.ctx!.createGain();
      gain.connect(this.ctx!.destination);
      gain.gain.value = 0;
      return { buffer, gain, src: null };
    };
    this.mix = mkVoice(mixBuf);
    this.ref = mkVoice(refBuf);
    this.applyGains();
    return Math.max(mixBuf.duration, refBuf.duration);
  }

  private async fetchDecode(url: string): Promise<AudioBuffer> {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const bytes = await res.arrayBuffer();
    return await this.ctx!.decodeAudioData(bytes);
  }

  /** offsetToCommon is in LU/dB; convert to linear and store. */
  setGainMatch(mixOffsetDb: number, refOffsetDb: number) {
    this.mixGainLin = Math.pow(10, mixOffsetDb / 20);
    this.refGainLin = Math.pow(10, refOffsetDb / 20);
    this.applyGains();
  }

  setMatch(on: boolean) {
    this.matchOn = on;
    this.applyGains();
  }

  setAB(ab: "A" | "B") {
    this.ab = ab;
    this.applyGains();
  }

  setOffsetB(offsetB: number) {
    const wasPlaying = this._playing;
    const pos = this.time();
    this.offsetB = offsetB;
    if (wasPlaying) this.play(pos); // re-sync B position
  }

  private applyGains() {
    if (!this.mix || !this.ref) return;
    const mg = this.matchOn ? this.mixGainLin : 1;
    const rg = this.matchOn ? this.refGainLin : 1;
    this.mix.gain.gain.value = this.ab === "A" ? mg : 0;
    this.ref.gain.gain.value = this.ab === "B" ? rg : 0;
  }

  /** Current A-time. */
  time(): number {
    if (!this.ctx || !this._playing) return this.startPos;
    return this.startPos + (this.ctx.currentTime - this.startedAtCtx);
  }

  /** (Re)start both voices so A-time = pos. Stops any current sources first. */
  play(pos: number) {
    if (!this.ctx || !this.mix || !this.ref) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.stopSources();
    const startVoice = (v: Voice, at: number) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = v.buffer;
      src.connect(v.gain);
      const clamped = Math.max(0, Math.min(at, v.buffer.duration));
      // when (now), offset-into-buffer
      src.start(this.ctx!.currentTime, clamped);
      v.src = src;
    };
    startVoice(this.mix, pos);
    startVoice(this.ref, pos + this.offsetB);
    this.startedAtCtx = this.ctx.currentTime;
    this.startPos = pos;
    this._playing = true;
    this.applyGains();
  }

  pause() {
    const pos = this.time();
    this.stopSources();
    this._playing = false;
    this.startPos = pos;
  }

  /** Move the parked playhead (no audio while paused). */
  seek(pos: number) {
    if (this._playing) this.play(pos);
    else this.startPos = pos;
  }

  private stopSources() {
    for (const v of [this.mix, this.ref]) {
      if (v?.src) {
        try {
          v.src.onended = null;
          v.src.stop();
        } catch {
          /* already stopped */
        }
        v.src.disconnect();
        v.src = null;
      }
    }
  }

  dispose() {
    this.stopSources();
    void this.ctx?.close();
    this.ctx = null;
    this.mix = null;
    this.ref = null;
  }
}
```

- [ ] **Step 2: Type-check.** Run: `cd frontend && npx tsc -b`
Expected: no errors. (Engine is not yet imported anywhere; this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/audio/engine.ts
git commit -m "feat(audio): AudioEngine — dual-buffer gain-matched A/B playback"
```

---

### Task A3: Bind the engine to the store + transport

**Files:**
- Create: `frontend/src/features/audio/useAudioEngine.ts`
- Modify: `frontend/src/features/transport/Transport.tsx`
- Modify: `frontend/src/screens/Workspace.tsx`

- [ ] **Step 1: Write the hook.** It owns one engine instance, loads on mount, drives `playhead`/`scroll` from the engine clock via rAF while playing, handles region loop, and pushes store changes (`ab`, `offsetB`, `matchMode`, gain-match) into the engine.

```typescript
import { useEffect, useRef } from "react";
import { useViewState } from "../../store/viewState";
import { api } from "../../api/client";
import { AudioEngine } from "./engine";
import type { TrackPayload } from "../../types/payload";

interface Args {
  compId: string;
  mix: TrackPayload;
  ref: TrackPayload;
  playing: boolean;
  setPlaying: (v: boolean) => void;
}

export function useAudioEngine({ compId, mix, ref, playing, setPlaying }: Args) {
  const engineRef = useRef<AudioEngine | null>(null);
  const readyRef = useRef(false);
  const store = useViewState();
  const storeRef = useRef(store);
  storeRef.current = store;

  // Load buffers once per comparison.
  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    readyRef.current = false;
    engine
      .load({
        mixUrl: api.audioUrl(compId, "mix"),
        refUrl: api.audioUrl(compId, "reference"),
      })
      .then(() => {
        engine.setGainMatch(
          mix.gainMatch.offsetToCommon,
          ref.gainMatch.offsetToCommon,
        );
        engine.setOffsetB(storeRef.current.offsetB);
        engine.setAB(storeRef.current.ab);
        engine.setMatch(storeRef.current.matchMode !== "off");
        readyRef.current = true;
      })
      .catch(() => {
        readyRef.current = false;
      });
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [compId, mix, ref]);

  // Play / pause.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !readyRef.current) return;
    if (playing) engine.play(storeRef.current.playhead);
    else engine.pause();
  }, [playing]);

  // Push reactive params into the engine.
  useEffect(() => {
    engineRef.current?.setAB(store.ab);
  }, [store.ab]);
  useEffect(() => {
    engineRef.current?.setOffsetB(store.offsetB);
  }, [store.offsetB]);
  useEffect(() => {
    engineRef.current?.setMatch(store.matchMode !== "off");
  }, [store.matchMode]);

  // Clock loop: read engine time -> store.playhead, region loop, auto-follow.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const engine = engineRef.current;
      const s = storeRef.current;
      if (engine) {
        let p = engine.time();
        if (s.loop.enabled && s.regionA && p >= s.regionA[1]) {
          p = s.regionA[0];
          engine.play(p);
        }
        if (p >= s.duration) {
          engine.pause();
          setPlaying(false);
          s.set({ playhead: s.duration });
          return;
        }
        // auto-follow scroll (mirrors the old rAF behaviour)
        const spanPx = 900; // updated by Transport via store-independent ResizeObserver is overkill here
        const span = spanPx * s.secPerPx;
        let scroll = s.scroll;
        if (p > s.scroll + span * 0.88) scroll = p - span * 0.5;
        if (p < s.scroll) scroll = Math.max(0, p - span * 0.1);
        s.set({ playhead: p, scroll });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlaying]);
}
```

> Note: the `spanPx` constant keeps auto-follow simple; Transport already owns the precise content width for rendering. If follow feels off, Task A3 step 4's manual test will catch it and we widen the constant — do not gold-plate here.

- [ ] **Step 2: Wire Transport to the engine.** In `Transport.tsx`:
  - Add `compId: string` to `Props`.
  - Delete the **playback rAF loop** `useEffect` (the block starting `if (!playing) return;` that advances `s.playhead + dt`) — the hook now owns the clock.
  - Call the hook near the top of the component (after `const duration = …`):

```typescript
  useAudioEngine({
    compId,
    mix: mixPayload,
    ref: refPayload,
    playing,
    setPlaying,
  });
```
  - Add the import: `import { useAudioEngine } from "../audio/useAudioEngine";`
  - **Click-to-seek:** in `onAMouseDown`, after computing `t`, also record the down position; add a document `mouseup` that, if the pointer didn't move into a region, seeks. Simplest robust approach — replace `onAMouseDown` with:

```typescript
  const onAMouseDown = (e: React.MouseEvent) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const t = scroll + (e.clientX - rect.left) * secPerPx;
    dragRef.current = {
      mode: "region",
      startX: e.clientX,
      startTime: t,
      startOffset: 0,
    };
  };
```
  and in the existing global `onUp` handler (inside the mouse-handlers `useEffect`), set the playhead when it was a click, not a drag:

```typescript
    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag && drag.mode === "region" && Math.abs(e.clientX - drag.startX) < 4) {
        storeRef.current.set({ playhead: drag.startTime });
      }
      dragRef.current = null;
    };
```

- [ ] **Step 3: Pass `compId` from Workspace.** In `Workspace.tsx`, change the `<Transport … />` call to include `compId={id}`.

- [ ] **Step 4: Manual test (the payoff).** Build/run the app, open a ready comparison, and verify:
  - Space plays audible audio; the playhead tracks the sound; pause stops it.
  - Clicking the waveform seeks; pressing Space resumes from there.
  - `Tab` (or the A/B block) switches which track you hear, instantly, at matched loudness (no big jump in level).
  - Dragging the B lane changes alignment and you hear B shift relative to A.
  - Select a region, enable loop (L), play → it loops within the region.

Run (dev): `cd frontend && npm run dev` — then exercise the above in the browser.

- [ ] **Step 5: Type-check + build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/audio/useAudioEngine.ts frontend/src/features/transport/Transport.tsx frontend/src/screens/Workspace.tsx
git commit -m "feat(transport): real audio playback — clock, seek, A/B switch, region loop"
```

---

# PART B — BACKEND SUBSTRATE 1 (LOUDNESS) + TRUE PEAK / CREST

### Task B1: K-weighting + 100 ms power blocks

**Files:**
- Modify: `backend/app/analysis/loudness.py`
- Test: `backend/tests/test_loudness.py`

- [ ] **Step 1: Write the failing test** (append to `test_loudness.py`):

```python
def test_power_blocks_shape_and_silence():
    import numpy as np
    from app.analysis import loudness

    sr = 48000
    # 2 s of stereo silence -> 20 blocks of 100 ms
    pcm = np.zeros((2, 2 * sr), dtype=np.float32)
    blocks = loudness.power_blocks(pcm, sr, block_s=0.1)
    assert blocks.shape == (20, 2)
    assert np.all(blocks == 0.0)


def test_kweight_boosts_highs():
    import numpy as np
    from app.analysis import loudness

    sr = 48000
    n = sr  # 1 s
    t = np.arange(n) / sr
    low = np.sin(2 * np.pi * 100 * t).astype(np.float32)
    high = np.sin(2 * np.pi * 6000 * t).astype(np.float32)
    kl = loudness.kweight(low[None, :], sr)[0]
    kh = loudness.kweight(high[None, :], sr)[0]
    # K-weighting's high-shelf makes 6 kHz hotter than 100 Hz for equal input.
    assert (kh**2).mean() > (kl**2).mean()
```

- [ ] **Step 2: Run — expect failure.** Run: `cd backend && uv run pytest tests/test_loudness.py::test_power_blocks_shape_and_silence tests/test_loudness.py::test_kweight_boosts_highs -v`
Expected: FAIL (`AttributeError: module … has no attribute 'kweight'`).

- [ ] **Step 3: Implement** — add to `loudness.py`:

```python
from scipy import signal

# BS.1770-4 K-weighting biquad coefficients @ 48 kHz (resample target).
_KW_STAGE1_B = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
_KW_STAGE1_A = np.array([1.0, -1.69065929318241, 0.73248077421585])
_KW_STAGE2_B = np.array([1.0, -2.0, 1.0])
_KW_STAGE2_A = np.array([1.0, -1.99004745483398, 0.99007225036621])


def kweight(pcm: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply BS.1770-4 K-weighting per channel. pcm shape (ch, n) -> (ch, n)."""
    # Coefficients are defined for 48 kHz; the pipeline resamples to that.
    x = pcm.astype(np.float64)
    y = signal.lfilter(_KW_STAGE1_B, _KW_STAGE1_A, x, axis=-1)
    y = signal.lfilter(_KW_STAGE2_B, _KW_STAGE2_A, y, axis=-1)
    return y


def power_blocks(pcm: np.ndarray, sample_rate: int, block_s: float = 0.1) -> np.ndarray:
    """Mean-square of K-weighted signal per block, per channel.

    Returns shape (n_blocks, n_ch). n_blocks = floor(n / block_len).
    """
    k = kweight(pcm, sample_rate)
    bl = int(round(block_s * sample_rate))
    n_blocks = k.shape[1] // bl
    if n_blocks == 0:
        return np.zeros((0, pcm.shape[0]))
    trimmed = k[:, : n_blocks * bl]
    # (ch, n_blocks, bl) -> mean-square over bl
    reshaped = trimmed.reshape(pcm.shape[0], n_blocks, bl)
    msq = (reshaped**2).mean(axis=2)  # (ch, n_blocks)
    return msq.T  # (n_blocks, ch)
```

- [ ] **Step 4: Run — expect pass.** Run: `cd backend && uv run pytest tests/test_loudness.py -v`
Expected: all pass (the original 8 + the 2 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/loudness.py backend/tests/test_loudness.py
git commit -m "feat(dsp): BS.1770-4 K-weighting + 100ms power blocks"
```

---

### Task B2: Short-term + momentary LUFS series

**Files:**
- Modify: `backend/app/analysis/loudness.py`
- Test: `backend/tests/test_features.py` (create)

- [ ] **Step 1: Write the failing test** (`backend/tests/test_features.py`):

```python
import numpy as np
from app.analysis import loudness


def _sine(sr, secs, freq, amp):
    t = np.arange(int(sr * secs)) / sr
    s = (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return np.stack([s, s])  # (2, n)


def test_shortterm_matches_integrated_for_steady_tone():
    sr = 48000
    pcm = _sine(sr, 5.0, 1000.0, 0.5)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)  # short-term
    mo = loudness.windowed_lufs(blocks, win_blocks=4)   # momentary
    integ = loudness.integrated_lufs(pcm, sr)
    # For a steady tone, both windows settle within ~0.5 LU of integrated.
    assert abs(np.median(st[30:]) - integ) < 0.6
    assert abs(np.median(mo[4:]) - integ) < 0.6


def test_windowed_lufs_length_matches_blocks():
    sr = 48000
    pcm = _sine(sr, 2.0, 1000.0, 0.3)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)
    assert st.shape[0] == blocks.shape[0]
```

- [ ] **Step 2: Run — expect failure.** Run: `cd backend && uv run pytest tests/test_features.py -v`
Expected: FAIL (`has no attribute 'windowed_lufs'`).

- [ ] **Step 3: Implement** — add to `loudness.py`:

```python
_ABS_GATE = -70.0  # LUFS absolute gate
_G = np.array([1.0, 1.0])  # channel weights (L, R)


def block_loudness(msq_blocks: np.ndarray) -> np.ndarray:
    """Per-block loudness L = -0.691 + 10*log10(sum_ch G_ch * msq_ch)."""
    weighted = (msq_blocks * _G[: msq_blocks.shape[1]]).sum(axis=1)
    with np.errstate(divide="ignore"):
        return -0.691 + 10.0 * np.log10(weighted)


def windowed_lufs(msq_blocks: np.ndarray, win_blocks: int) -> np.ndarray:
    """Sliding-window LUFS over the block array (trailing window).

    short-term = 30 blocks (3 s), momentary = 4 blocks (400 ms).
    Output length == number of blocks; window clamps at the start.
    """
    n = msq_blocks.shape[0]
    out = np.full(n, -120.0)
    if n == 0:
        return out
    weighted = (msq_blocks * _G[: msq_blocks.shape[1]]).sum(axis=1)  # (n,)
    csum = np.concatenate([[0.0], np.cumsum(weighted)])
    for i in range(n):
        lo = max(0, i - win_blocks + 1)
        mean_pow = (csum[i + 1] - csum[lo]) / (i - lo + 1)
        out[i] = -0.691 + 10.0 * np.log10(mean_pow) if mean_pow > 0 else -120.0
    return out
```

- [ ] **Step 4: Run — expect pass.** Run: `cd backend && uv run pytest tests/test_features.py -v`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/loudness.py backend/tests/test_features.py
git commit -m "feat(dsp): short-term + momentary LUFS series from power blocks"
```

---

### Task B3: Self-implemented gated integrated (whole + region) + LRA

**Files:**
- Modify: `backend/app/analysis/loudness.py`
- Test: `backend/tests/test_features.py`

- [ ] **Step 1: Write the failing test** (append to `test_features.py`):

```python
def test_gated_integrated_matches_pyloudnorm():
    sr = 48000
    pcm = _sine(sr, 6.0, 1000.0, 0.5)
    blocks = loudness.power_blocks(pcm, sr)
    ours = loudness.gated_integrated(blocks)
    theirs = loudness.integrated_lufs(pcm, sr)  # pyloudnorm reference
    assert abs(ours - theirs) < 0.5


def test_region_gate_ignores_silence():
    sr = 48000
    loud = _sine(sr, 3.0, 1000.0, 0.5)
    silence = np.zeros((2, 3 * sr), dtype=np.float32)
    pcm = np.concatenate([loud, silence], axis=1)  # 6 s: loud then silent
    blocks = loudness.power_blocks(pcm, sr)
    # whole-file gated integrated should track the loud half, not be dragged
    # toward -inf by the silence (absolute gate drops silent blocks).
    whole = loudness.gated_integrated(blocks)
    region_loud = loudness.gated_integrated(blocks[:30])   # first 3 s
    assert abs(whole - region_loud) < 0.8


def test_lra_positive_for_dynamic_signal():
    sr = 48000
    quiet = _sine(sr, 4.0, 1000.0, 0.1)
    loud = _sine(sr, 4.0, 1000.0, 0.6)
    pcm = np.concatenate([quiet, loud], axis=1)
    blocks = loudness.power_blocks(pcm, sr)
    st = loudness.windowed_lufs(blocks, win_blocks=30)
    lra = loudness.loudness_range(st)
    assert lra > 3.0  # clear quiet->loud spread
```

- [ ] **Step 2: Run — expect failure.** Run: `cd backend && uv run pytest tests/test_features.py -k "gated or region or lra" -v`
Expected: FAIL (`has no attribute 'gated_integrated'`).

- [ ] **Step 3: Implement** — add to `loudness.py`:

```python
def gated_integrated(msq_blocks: np.ndarray) -> float:
    """BS.1770-4 two-pass gated integrated loudness over the given blocks.

    Pass 1: drop blocks below -70 LUFS absolute; provisional mean power.
    Pass 2: drop blocks below (provisional loudness - 10 LU); re-average.
    Region-scoped integrated = call with that region's block slice.
    """
    if msq_blocks.shape[0] == 0:
        return -120.0
    weighted = (msq_blocks * _G[: msq_blocks.shape[1]]).sum(axis=1)
    bl = -0.691 + 10.0 * np.log10(np.where(weighted > 0, weighted, 1e-12))
    # pass 1: absolute gate
    keep = bl >= _ABS_GATE
    if not np.any(keep):
        return -120.0
    prov_pow = weighted[keep].mean()
    prov_loud = -0.691 + 10.0 * np.log10(prov_pow)
    # pass 2: relative gate
    rel = prov_loud - 10.0
    keep2 = keep & (bl >= rel)
    if not np.any(keep2):
        return prov_loud
    final_pow = weighted[keep2].mean()
    return float(-0.691 + 10.0 * np.log10(final_pow))


def loudness_range(shortterm: np.ndarray) -> float:
    """EBU LRA: gate the short-term distribution (abs -70, then -20 LU below
    the gated mean), take 95th - 10th percentile."""
    st = shortterm[shortterm >= _ABS_GATE]
    if st.size == 0:
        return 0.0
    rel = st.mean() - 20.0
    st = st[st >= rel]
    if st.size < 2:
        return 0.0
    p95, p10 = np.percentile(st, [95, 10])
    return float(round(p95 - p10, 1))
```

- [ ] **Step 4: Run — expect pass.** Run: `cd backend && uv run pytest tests/test_features.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/loudness.py backend/tests/test_features.py
git commit -m "feat(dsp): gated integrated (whole/region) + LRA"
```

---

### Task B4: True peak (≥4× oversample) + windowed crest

**Files:**
- Create: `backend/app/analysis/peak.py`
- Test: `backend/tests/test_peak.py` (create)

- [ ] **Step 1: Write the failing test** (`backend/tests/test_peak.py`):

```python
import numpy as np
from app.analysis import peak


def test_true_peak_exceeds_sample_peak_for_intersample():
    sr = 48000
    n = sr
    t = np.arange(n) / sr
    # near-Nyquist tone phased to fall between samples -> inter-sample overshoot
    s = (0.9 * np.sin(2 * np.pi * (sr / 2 - 100) * t + np.pi / 4)).astype(np.float32)
    pcm = np.stack([s, s])
    sample_peak_db = 20 * np.log10(np.max(np.abs(pcm)))
    tp_db = peak.true_peak_max(pcm, sr)
    assert tp_db >= sample_peak_db - 0.01
    assert tp_db > sample_peak_db  # oversampling reveals the overshoot


def test_crest_of_sine_is_about_3db():
    sr = 48000
    t = np.arange(2 * sr) / sr
    s = (0.5 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    pcm = np.stack([s, s])
    crest = peak.crest_series(pcm, sr, hop_s=0.1, win_s=1.0)
    # sine crest = 20*log10(sqrt(2)) ~ 3.01 dB
    assert abs(np.median(crest[10:]) - 3.01) < 0.4


def test_true_peak_series_length():
    sr = 48000
    pcm = (np.random.rand(2, 2 * sr).astype(np.float32) - 0.5)
    tp = peak.true_peak_series(pcm, sr, hop_s=0.1)
    assert tp.shape[0] == 20
```

- [ ] **Step 2: Run — expect failure.** Run: `cd backend && uv run pytest tests/test_peak.py -v`
Expected: FAIL (no module `peak`).

- [ ] **Step 3: Implement** — `backend/app/analysis/peak.py`:

```python
from __future__ import annotations

import numpy as np
from scipy import signal


def _oversample(pcm: np.ndarray, factor: int = 4) -> np.ndarray:
    """Polyphase upsample per channel. pcm (ch, n) -> (ch, n*factor)."""
    return signal.resample_poly(pcm.astype(np.float64), factor, 1, axis=-1)


def true_peak_max(pcm: np.ndarray, sample_rate: int, factor: int = 4) -> float:
    """Max true peak across channels in dBTP (≥4× oversampled)."""
    up = _oversample(pcm, factor)
    peak = float(np.max(np.abs(up)))
    return 20.0 * np.log10(peak) if peak > 0 else -120.0


def true_peak_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, factor: int = 4
) -> np.ndarray:
    """Per-hop max true peak (dBTP). Length = floor(n / hop_len)."""
    up = _oversample(pcm, factor)
    mag = np.max(np.abs(up), axis=0)  # (n*factor,) max across channels
    hop_up = int(round(hop_s * sample_rate)) * factor
    n_hops = mag.shape[0] // hop_up
    if n_hops == 0:
        return np.zeros(0)
    blocks = mag[: n_hops * hop_up].reshape(n_hops, hop_up)
    peaks = blocks.max(axis=1)
    with np.errstate(divide="ignore"):
        return np.where(peaks > 0, 20.0 * np.log10(peaks), -120.0)


def crest_series(
    pcm: np.ndarray, sample_rate: int, hop_s: float = 0.1, win_s: float = 1.0
) -> np.ndarray:
    """Windowed crest factor (dB) = peak_dB - RMS_dB over a trailing window.

    Output length = number of hops. Uses linear (un-weighted) samples.
    """
    hop = int(round(hop_s * sample_rate))
    win_blocks = max(1, int(round(win_s / hop_s)))
    mono_sq = (pcm.astype(np.float64) ** 2).mean(axis=0)  # (n,) mean power across ch
    mono_abs = np.max(np.abs(pcm.astype(np.float64)), axis=0)  # (n,) peak across ch
    n_hops = mono_sq.shape[0] // hop
    if n_hops == 0:
        return np.zeros(0)
    sq_blocks = mono_sq[: n_hops * hop].reshape(n_hops, hop)
    abs_blocks = mono_abs[: n_hops * hop].reshape(n_hops, hop)
    block_msq = sq_blocks.mean(axis=1)     # per-hop mean square
    block_peak = abs_blocks.max(axis=1)    # per-hop peak
    out = np.zeros(n_hops)
    for i in range(n_hops):
        lo = max(0, i - win_blocks + 1)
        rms = np.sqrt(block_msq[lo : i + 1].mean())
        pk = block_peak[lo : i + 1].max()
        out[i] = 20.0 * np.log10(pk / rms) if rms > 0 and pk > 0 else 0.0
    return out
```

- [ ] **Step 4: Run — expect pass.** Run: `cd backend && uv run pytest tests/test_peak.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/peak.py backend/tests/test_peak.py
git commit -m "feat(dsp): true-peak (4x oversample) + windowed crest"
```

---

### Task B5: Features orchestrator

**Files:**
- Create: `backend/app/analysis/features.py`
- Test: `backend/tests/test_features.py`

- [ ] **Step 1: Write the failing test** (append to `test_features.py`):

```python
def test_compute_substrate1_payload_shape():
    sr = 48000
    pcm = _sine(sr, 3.0, 1000.0, 0.4)
    from app.analysis import features

    out = features.compute_substrate1(pcm, sr, integrated=-14.0, hop_s=0.1)
    f = out["features"]
    expected_len = int(3.0 / 0.1)
    for key in ("shortTermLUFS", "momentaryLUFS", "crest", "truePeak"):
        assert key in f
        assert abs(len(f[key]) - expected_len) <= 1
    st = out["static"]
    for key in ("integrated", "lra", "truePeakMax", "plr", "crestAvg"):
        assert key in st
    # K-power blocks shipped for client-side region gating
    assert "kblocks" in out and len(out["kblocks"]) >= 1
    assert len(out["kblocks"][0]) == 2  # per-channel msq
```

- [ ] **Step 2: Run — expect failure.** Run: `cd backend && uv run pytest tests/test_features.py::test_compute_substrate1_payload_shape -v`
Expected: FAIL (no module `features`).

- [ ] **Step 3: Implement** — `backend/app/analysis/features.py`:

```python
from __future__ import annotations

import numpy as np

from app.analysis import loudness, peak


def _to_list(arr: np.ndarray) -> list[float]:
    return [round(float(x), 3) for x in arr]


def compute_substrate1(
    pcm: np.ndarray, sample_rate: int, integrated: float, hop_s: float = 0.1
) -> dict:
    """Substrate-1 (loudness family) + true-peak/crest features + aggregates.

    `integrated` is the whole-file gated integrated LUFS already computed in
    the gainmatch stage (kept as the authoritative value).
    """
    blocks = loudness.power_blocks(pcm, sample_rate, block_s=hop_s)  # (n,2)
    st = loudness.windowed_lufs(blocks, win_blocks=30)   # 3 s
    mo = loudness.windowed_lufs(blocks, win_blocks=4)     # 400 ms
    crest = peak.crest_series(pcm, sample_rate, hop_s=hop_s, win_s=1.0)
    tp = peak.true_peak_series(pcm, sample_rate, hop_s=hop_s)

    # align lengths to the block count (defensive; resample paths can differ by 1)
    n = blocks.shape[0]
    clip = lambda a: a[:n] if a.shape[0] >= n else np.pad(a, (0, n - a.shape[0]), constant_values=a[-1] if a.shape[0] else 0)

    tp_max = peak.true_peak_max(pcm, sample_rate)
    lra = loudness.loudness_range(st)
    crest_avg = float(round(np.median(crest[10:]) if crest.shape[0] > 10 else (crest.mean() if crest.size else 0.0), 1))

    return {
        "features": {
            "shortTermLUFS": _to_list(st),
            "momentaryLUFS": _to_list(mo),
            "crest": _to_list(clip(crest)),
            "truePeak": _to_list(clip(tp)),
        },
        "static": {
            "integrated": round(float(integrated), 2),
            "lra": lra,
            "truePeakMax": round(tp_max, 1),
            "plr": round(tp_max - integrated, 1),
            "crestAvg": crest_avg,
        },
        # per-100ms K-power blocks (per-channel mean square) for client-side
        # region-scoped gated integrated (data contract: payload.kblocks).
        "kblocks": [[round(float(v), 8) for v in row] for row in blocks],
    }
```

- [ ] **Step 4: Run — expect pass.** Run: `cd backend && uv run pytest tests/test_features.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/features.py backend/tests/test_features.py
git commit -m "feat(dsp): Substrate-1 feature orchestrator + aggregates"
```

---

### Task B6: Wire Substrate 1 into the pipeline + honest stages

**Files:**
- Modify: `backend/app/analysis/pipeline.py`
- Modify: `frontend/src/screens/Processing.tsx`

- [ ] **Step 1: Restructure stages + compute loudness.** In `pipeline.py`:
  - Change the stage lists to what P1 actually runs:

```python
P0_STAGES = ["decode", "gainmatch", "waveform"]
ALL_STAGES = ["decode", "gainmatch", "loudness", "waveform"]
```
  - Import features: `from app.analysis import decode, features, loudness, waveform`
  - Replace `_pack_payload` so it accepts and embeds the computed data:

```python
def _pack_payload(track, fileinfo, meta_dur, integrated, offset, peaks, sub1) -> bytes:
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
        "features": sub1["features"],
        "ltas": None,
        "spectrogram": None,
        "waveform": {"peaksByZoom": peaks},
        "static": sub1["static"],
        "kblocks": sub1["kblocks"],
    }
    return json.dumps(payload).encode()
```
  - In `run_analysis`, after the `gainmatch` stage and before `waveform`, add the `loudness` stage (you already hold `pcm`, `integ`, `offset`):

```python
            current_stage = "loudness"
            _set_stage(db, job, tr.role, "loudness", "running")
            sub1 = features.compute_substrate1(
                pcm, settings.analysis_sample_rate, integrated=integ, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "loudness", "done")
```
  - Update the `waveform` stage's `_pack_payload(...)` call to pass `sub1`:

```python
            payload = _pack_payload(tr, info, dur, integ, offset, peaks, sub1)
```

- [ ] **Step 2: Make the processing screen render reported stages.** In `Processing.tsx`:
  - Extend the label map and order so future phases just add keys:

```typescript
const STAGE_LABELS: Record<string, string> = {
  decode: "Decode",
  gainmatch: "Gain-match",
  loudness: "Loudness",
  waveform: "Waveform",
  stft: "Frequency",
  spatial: "Stereo",
  aggregates: "Aggregates",
};

const STAGE_ORDER = ["decode", "gainmatch", "loudness", "waveform", "stft", "spatial", "aggregates"];
```
  - In `ProcTrack`, render **only stages present in `stages`** (so the bar reaches 100% for the phase actually run):

```typescript
  const entries = STAGE_ORDER.filter((key) => key in stages).map((key) => ({
    key,
    label: STAGE_LABELS[key] ?? key,
    status: stages[key] ?? "pending",
  }));
```

- [ ] **Step 3: Backend tests still green.** Run: `cd backend && uv run pytest -v`
Expected: all pass (waveform/decode/loudness/features/peak).

- [ ] **Step 4: End-to-end smoke.** Run the backend + frontend, create a **new** comparison with the demo files, and confirm: the processing screen shows Decode → Gain-match → Loudness → Waveform all reaching ✓, and the workspace opens. Then check the payload:

Run: `curl -s http://localhost:8000/api/comparisons/<ID>/tracks/mix/payload | python3 -c "import sys,json; p=json.load(sys.stdin); print('features:', {k: len(v) for k,v in p['features'].items()}); print('static:', p['static']); print('kblocks:', len(p['kblocks']))"`
Expected: non-empty feature arrays, sensible `static` (integrated ≈ track LUFS, lra > 0, truePeakMax near 0, plr positive), kblocks length ≈ duration×10.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/pipeline.py frontend/src/screens/Processing.tsx
git commit -m "feat(pipeline): compute Substrate-1 in a loudness stage; honest stage list"
```

---

# PART C — FRONTEND TYPES + READ LAYER + PLUMBING

### Task C1: Typed payload

**Files:**
- Modify: `frontend/src/types/payload.ts`

- [ ] **Step 1: Replace the loose `features`/`static` types** on `TrackPayload`:

```typescript
export interface Features {
  shortTermLUFS: number[];
  momentaryLUFS: number[];
  crest: number[];
  truePeak: number[];
  // later phases: correlation, centroid, msRatio
  [key: string]: number[] | undefined;
}

export interface StaticAggregates {
  integrated: number;
  lra: number;
  truePeakMax: number;
  plr: number;
  crestAvg: number;
  avgCorrelation?: number; // P3
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
  ltas: unknown | null;
  spectrogram: unknown | null;
  waveform: { peaksByZoom: Record<string, number[]> };
  static: StaticAggregates;
  kblocks: number[][]; // per-100ms [msqL, msqR]
}
```

- [ ] **Step 2: Type-check.** Run: `cd frontend && npx tsc -b`
Expected: clean (no consumer reads typed feature keys yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/payload.ts
git commit -m "feat(types): typed Substrate-1 features + static + kblocks"
```

---

### Task C2: Typed read layer

**Files:**
- Create: `frontend/src/features/analysis/read.ts`

- [ ] **Step 1: Write the read layer** (ports `PARITY_READ` + adds spec-honest region gate):

```typescript
import type { TrackPayload } from "../../types/payload";

/** Value of a feature at A-time t (s), linear-interpolated. */
export function at(track: TrackPayload, key: string, t: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return 0;
  const x = t / track.hop;
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x)));
  const j = Math.min(arr.length - 1, i + 1);
  const f = x - i;
  return arr[i] * (1 - f) + arr[j] * f;
}

export function mean(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return 0;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let s = 0, c = 0;
  for (let i = i0; i <= i1; i++) { s += arr[i]; c++; }
  return c ? s / c : arr[0];
}

export function max(track: TrackPayload, key: string, t0: number, t1: number): number {
  const arr = track.features[key];
  if (!arr || arr.length === 0) return -Infinity;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(arr.length - 1, Math.ceil(t1 / track.hop));
  let m = -Infinity;
  for (let i = i0; i <= i1; i++) m = Math.max(m, arr[i]);
  return m;
}

/** Trailing-window mean of a feature at t (seconds). */
export function winMean(track: TrackPayload, key: string, t: number, win: number): number {
  return mean(track, key, Math.max(0, t - win), Math.max(0.05, t));
}

const ABS_GATE = -70;
const G = 1.0;

/**
 * BS.1770-4 two-pass gated integrated LUFS over [t0,t1] using the per-100ms
 * K-power blocks shipped in the payload. Mirrors backend `gated_integrated`.
 */
export function regionIntegrated(track: TrackPayload, t0: number, t1: number): number {
  const kb = track.kblocks;
  if (!kb || kb.length === 0) return track.static.integrated;
  const i0 = Math.max(0, Math.floor(t0 / track.hop));
  const i1 = Math.min(kb.length - 1, Math.ceil(t1 / track.hop));
  const weighted: number[] = [];
  for (let i = i0; i <= i1; i++) weighted.push(G * kb[i][0] + G * kb[i][1]);
  const loud = (p: number) => (p > 0 ? -0.691 + 10 * Math.log10(p) : -120);
  const kept = weighted.filter((p) => loud(p) >= ABS_GATE);
  if (kept.length === 0) return -120;
  const prov = kept.reduce((a, b) => a + b, 0) / kept.length;
  const rel = loud(prov) - 10;
  const kept2 = weighted.filter((p) => loud(p) >= ABS_GATE && loud(p) >= rel);
  if (kept2.length === 0) return loud(prov);
  const finalPow = kept2.reduce((a, b) => a + b, 0) / kept2.length;
  return loud(finalPow);
}
```

- [ ] **Step 2: Type-check.** Run: `cd frontend && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/analysis/read.ts
git commit -m "feat(read): typed feature read layer + client-side region gate"
```

---

### Task C3: Thread payloads into panel workspace + meters

**Files:**
- Modify: `frontend/src/screens/Workspace.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`
- Modify: `frontend/src/features/meters/MeterColumn.tsx`

- [ ] **Step 1: Pass payloads from Workspace.** In `Workspace.tsx`, update the JSX:

```tsx
          <PanelWorkspace mix={mixPayload} ref={refPayload} />
        </div>
        <MeterColumn mix={mixPayload} ref={refPayload} />
```

- [ ] **Step 2: Accept the props (no body change yet).** In `PanelWorkspace.tsx`, change the signature and thread to `Panel`:

```tsx
import type { TrackPayload } from "../../types/payload";

interface WorkspaceProps {
  mix: TrackPayload | null;
  ref: TrackPayload | null;
}

export function PanelWorkspace({ mix, ref }: WorkspaceProps) {
```
  Pass `mix`/`ref` into each `<Panel … mix={mix} ref={ref} />` and add `mix`/`ref` to `PanelProps` (typed `TrackPayload | null`). Leave the body as-is for this step.

- [ ] **Step 3: Same for `MeterColumn.tsx`** — add `{ mix, ref }: { mix: TrackPayload | null; ref: TrackPayload | null }`, thread into each `<MeterSlot … mix={mix} ref={ref} />`, add to `MeterSlotProps`.

- [ ] **Step 4: Type-check + build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/Workspace.tsx frontend/src/features/panels/PanelWorkspace.tsx frontend/src/features/meters/MeterColumn.tsx
git commit -m "refactor(workspace): thread track payloads into panels + meters"
```

---

# PART D — LOUDNESS PANELS (2D CANVAS)

### Task D1: Canvas draw helpers + hook

**Files:**
- Create: `frontend/src/features/panels/useCanvasDraw.ts`
- Create: `frontend/src/features/panels/draw.ts`

- [ ] **Step 1: Write the canvas hook** (`useCanvasDraw.ts`):

```typescript
import { useEffect, useRef } from "react";

/** DPR-aware canvas: runs `draw(canvas)` on mount, deps change, and resize. */
export function useCanvasDraw(
  draw: (canvas: HTMLCanvasElement) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const run = () => drawRef.current(cv);
    run();
    const ro = new ResizeObserver(run);
    ro.observe(cv);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
```

- [ ] **Step 2: Write the draw helpers** (`draw.ts`) — port `timeMap`/`gridTime`/`lufsLane`/`valueLane` from `docs/design_handoff_coheremix/source/draw.js`, typed, reading the `read` layer and CSS vars. The **gutter** is `64` (matches `--gutter`).

```typescript
import type { TrackPayload } from "../../types/payload";
import * as R from "../analysis/read";

const GUTTER = 64;

interface View {
  secPerPx: number;
  scroll: number;
  offsetB: number;
  momentary: boolean;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setup(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, ok: r.width > 2 && r.height > 2 };
}

function timeMap(view: View, w: number, padL: number) {
  const spp = view.secPerPx;
  const t0 = view.scroll;
  return {
    spp, t0,
    xOf: (t: number) => padL + (t - t0) / spp,
    tOf: (x: number) => t0 + (x - padL) * spp,
    tEnd: t0 + (w - padL) * spp,
  };
}

function gridTime(ctx: CanvasRenderingContext2D, w: number, h: number, tm: ReturnType<typeof timeMap>, padL: number, line: string, tx3: string) {
  ctx.save();
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = tx3;
  ctx.font = '9px "JetBrains Mono", monospace';
  const span = (w - padL) * tm.spp;
  const targets = [1, 2, 5, 10, 15, 30, 60, 120];
  const step = targets.find((s) => span / s < 12) ?? 120;
  const start = Math.ceil(tm.t0 / step) * step;
  for (let t = start; t < tm.tEnd; t += step) {
    const x = tm.xOf(t);
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    ctx.fillText(`${mm}:${String(ss).padStart(2, "0")}`, x + 4, h - 5);
  }
  ctx.restore();
}

/** Short-term LUFS lane (A solid, B solid, optional momentary faint). */
export function lufsLane(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload, view: View) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3");
  const padL = GUTTER;
  const tm = timeMap(view, w, padL);
  const lo = -30, hi = -4;
  const yOf = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  ctx.font = '9px "JetBrains Mono", monospace';
  for (let v = -28; v <= -6; v += 6) {
    const y = yOf(v); ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(`${v}`, 4, y + 3);
  }
  const yt = yOf(-14); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(padL, yt + 0.5); ctx.lineTo(w, yt + 0.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = tx3; ctx.fillText("-14 LUFS", w - 56, yt - 4);
  gridTime(ctx, w, h, tm, padL, line, tx3);

  const drawLine = (track: TrackPayload, off: number, color: string, key: string, alpha: number, fill: boolean) => {
    ctx.beginPath();
    let started = false, firstX = padL, lastX = padL;
    for (let x = padL; x < w; x++) {
      const t = tm.tOf(x) + off;
      if (t < 0 || t > track.meta.duration) continue;
      const y = yOf(R.at(track, key, t));
      if (!started) { ctx.moveTo(x, y); started = true; firstX = x; } else ctx.lineTo(x, y);
      lastX = x;
    }
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    if (fill) {
      ctx.lineTo(lastX, h); ctx.lineTo(firstX, h); ctx.closePath();
      ctx.globalAlpha = alpha * 0.13; ctx.fillStyle = color; ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  if (view.momentary) {
    drawLine(A, 0, a, "momentaryLUFS", 0.28, false);
    drawLine(B, view.offsetB, b, "momentaryLUFS", 0.28, false);
  }
  drawLine(A, 0, a, "shortTermLUFS", 0.95, true);
  drawLine(B, view.offsetB, b, "shortTermLUFS", 0.95, true);
}

interface ValueCfg {
  lo: number; hi: number; key: string; ticks: number[]; redBelow?: number;
  fmt: (v: number) => string;
}

/** Generic single-value lane (crest; correlation reuses this in P3). */
export function valueLane(canvas: HTMLCanvasElement, A: TrackPayload, B: TrackPayload, view: View, cfg: ValueCfg) {
  const s = setup(canvas); if (!s.ok) return; const { ctx, w, h } = s;
  const a = css("--a"), b = css("--b"), line = "rgba(255,255,255,0.06)", tx3 = css("--tx-3"), warn = css("--warn");
  const padL = GUTTER;
  const tm = timeMap(view, w, padL);
  const { lo, hi, key, redBelow } = cfg;
  const yOf = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  if (redBelow !== undefined) {
    const yr = yOf(redBelow);
    ctx.fillStyle = warn; ctx.globalAlpha = 0.07; ctx.fillRect(padL, yr, w - padL, h - yr); ctx.globalAlpha = 1;
  }
  ctx.font = '9px "JetBrains Mono", monospace';
  for (const v of cfg.ticks) {
    const y = yOf(v); ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillStyle = tx3; ctx.fillText(cfg.fmt(v), 4, y + 3);
  }
  gridTime(ctx, w, h, tm, padL, line, tx3);
  const draw = (track: TrackPayload, off: number, color: string) => {
    ctx.beginPath(); let started = false;
    for (let x = padL; x < w; x++) {
      const t = tm.tOf(x) + off;
      if (t < 0 || t > track.meta.duration) continue;
      const v = Math.max(lo, Math.min(hi, R.at(track, key, t)));
      const y = yOf(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
  };
  draw(A, 0, a); draw(B, view.offsetB, b);
}
```

- [ ] **Step 2: Type-check.** Run: `cd frontend && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/panels/useCanvasDraw.ts frontend/src/features/panels/draw.ts
git commit -m "feat(panels): 2D-canvas lufs/value lane draw helpers + canvas hook"
```

---

### Task D2: Panel bodies + registry wiring

**Files:**
- Create: `frontend/src/features/panels/bodies.tsx`
- Modify: `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Write the bodies** (`bodies.tsx`):

```tsx
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import { useCanvasDraw } from "./useCanvasDraw";
import { lufsLane, valueLane } from "./draw";
import * as R from "../analysis/read";

const GUTTER = 64;

interface BodyProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

/** Shared playhead + region overlay for time-axis lanes. */
export function TimeOverlay() {
  const { secPerPx, scroll, playhead, regionA } = useViewState();
  const xOf = (t: number) => GUTTER + (t - scroll) / secPerPx;
  return (
    <div className="lane-overlay">
      {regionA && (
        <div
          className="region-sel"
          style={{ left: xOf(regionA[0]), width: Math.max(2, (regionA[1] - regionA[0]) / secPerPx) }}
        />
      )}
      <div className="playhead" style={{ left: xOf(playhead) }} />
    </div>
  );
}

export function ShortTermLufsBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB, momentary } = useViewState();
  const cref = useCanvasDraw(
    (cv) => lufsLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary }),
    [secPerPx, scroll, offsetB, momentary, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function CrestBody({ mix, ref }: BodyProps) {
  const { secPerPx, scroll, offsetB } = useViewState();
  const cref = useCanvasDraw(
    (cv) =>
      valueLane(cv, mix, ref, { secPerPx, scroll, offsetB, momentary: false }, {
        lo: 3, hi: 18, key: "crest", ticks: [4, 8, 12, 16], fmt: (v) => v.toFixed(0),
      }),
    [secPerPx, scroll, offsetB, mix, ref],
  );
  return <canvas ref={cref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function TilesBody({ mix, ref }: BodyProps) {
  const { regionA, offsetB } = useViewState();
  const [t0, t1] = regionA ?? [0, mix.meta.duration];
  const off = offsetB;
  const iA = regionA ? R.regionIntegrated(mix, t0, t1) : mix.static.integrated;
  const iB = regionA ? R.regionIntegrated(ref, t0 + off, t1 + off) : ref.static.integrated;
  const tpA = regionA ? R.max(mix, "truePeak", t0, t1) : mix.static.truePeakMax;
  const tpB = regionA ? R.max(ref, "truePeak", t0 + off, t1 + off) : ref.static.truePeakMax;
  const crA = regionA ? R.mean(mix, "crest", t0, t1) : mix.static.crestAvg;
  const crB = regionA ? R.mean(ref, "crest", t0 + off, t1 + off) : ref.static.crestAvg;

  const tile = (label: string, a: number, b: number, fmt: (v: number) => string, unit: string) => (
    <div className="tile">
      <span className="tile-l">{label}</span>
      <div className="tile-vals">
        <span className="tile-v a">{fmt(a)}</span>
        <span className="tile-v b">{fmt(b)}</span>
        <span className="tile-delta">
          {(a - b >= 0 ? "+" : "") + (a - b).toFixed(1)} {unit}
        </span>
      </div>
    </div>
  );
  return (
    <div style={{ flex: 1 }}>
      <div className="tile-grid">
        {tile("Integrated LUFS", iA, iB, (v) => v.toFixed(1), "LU")}
        {tile("True peak", tpA, tpB, (v) => v.toFixed(1), "dB")}
        {tile("Crest", crA, crB, (v) => v.toFixed(1), "dB")}
      </div>
    </div>
  );
}

export function SummaryBody({ mix, ref }: BodyProps) {
  const rows: [string, number, number, string][] = [
    ["Integrated LUFS", mix.static.integrated, ref.static.integrated, "LUFS"],
    ["LRA", mix.static.lra, ref.static.lra, "LU"],
    ["True-peak max", mix.static.truePeakMax, ref.static.truePeakMax, "dBTP"],
    ["PLR", mix.static.plr, ref.static.plr, "dB"],
  ];
  return (
    <div style={{ flex: 1 }}>
      <div className="tile-grid">
        {rows.map(([l, a, b, u]) => (
          <div className="tile" key={l}>
            <span className="tile-l">{l}</span>
            <div className="tile-vals">
              <span className="tile-v a">{a.toFixed(1)}</span>
              <span className="tile-v b">{b.toFixed(1)}</span>
              <span className="tile-delta">{u}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaceholderBody({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="empty-slot" style={{ fontSize: 11, color: "var(--tx-3)" }}>
      {title} lands in {phase}
    </div>
  );
}
```

- [ ] **Step 2: Wire the registry + body switch** in `PanelWorkspace.tsx`.
  - Extend the `VIEWS` entries with `kind` and `h` (port from `panels.jsx`), e.g. `shortTermLufs: { …, kind: "time", h: 188 }`, `crest: { kind: "time", h: 168 }`, `tiles: { kind: "tiles", h: null }`, `summary: { kind: "summary", h: null }`, others `kind: "soon"`.
  - In `Panel`, replace the placeholder body with:

```tsx
import {
  ShortTermLufsBody, CrestBody, TilesBody, SummaryBody, PlaceholderBody, TimeOverlay,
} from "./bodies";

// inside Panel(), after computing `v`:
  const isTime = v.kind === "time";
  let body: React.ReactNode;
  if (!mix || !ref) {
    body = <PlaceholderBody title={v.title} phase="analysis" />;
  } else if (id === "shortTermLufs") {
    body = <ShortTermLufsBody mix={mix} ref={ref} />;
  } else if (id === "crest") {
    body = <CrestBody mix={mix} ref={ref} />;
  } else if (id === "tiles") {
    body = <TilesBody mix={mix} ref={ref} />;
  } else if (id === "summary") {
    body = <SummaryBody mix={mix} ref={ref} />;
  } else {
    const phaseFor: Record<string, string> = {
      ltas: "Phase 2", liveSpectrum: "Phase 2", bandDelta: "Phase 2",
      correlation: "Phase 3", goniometer: "Phase 3", spectrogram: "Phase 5",
    };
    body = <PlaceholderBody title={v.title} phase={phaseFor[id] ?? "a later phase"} />;
  }
```
  and render:

```tsx
      <div className="panel-body" style={v.h ? { height: v.h } : { minHeight: 0 }}>
        {body}
        {isTime && <TimeOverlay />}
      </div>
```
  Add `import React from "react";` if needed for the `React.ReactNode` type (or type as `JSX.Element`).

- [ ] **Step 3: Type-check + build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Manual test.** Open a ready comparison. Default panels show: **Short-term LUFS** lane with two filled curves + the −14 dashed target + time grid, playhead/region overlay tracking the transport; **LTAS** shows "lands in Phase 2"; **Region readout** tiles show Integrated/True peak/Crest with A, B and delta. Add a **Crest factor** panel and a **Static summary** panel and confirm they render. Drag a region → tile numbers update; play → the playhead crosses the lanes in time with the audio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/panels/bodies.tsx frontend/src/features/panels/PanelWorkspace.tsx
git commit -m "feat(panels): short-term LUFS + crest lanes, region/summary tiles"
```

---

# PART E — LUFS + TRUE PEAK METERS

### Task E1: Meter bodies

**Files:**
- Create: `frontend/src/features/meters/meters.tsx`

- [ ] **Step 1: Write the meters** (port `LufsMeter` + `TruePeakMeter` from `meters.jsx`):

```tsx
import type { TrackPayload } from "../../types/payload";
import { useViewState } from "../../store/viewState";
import * as R from "../analysis/read";

interface MeterProps {
  mix: TrackPayload;
  ref: TrackPayload;
}

function BarMeter({
  rows, lo, hi, target, fmt,
}: {
  rows: { k: string; cls: string; color: string; v: number }[];
  lo: number; hi: number; target?: number; fmt?: (v: number) => string;
}) {
  const pct = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100;
  return (
    <div className="bar-meter">
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <span className="bk" style={{ color: r.color }}>{r.k}</span>
          <div className="bar-track">
            <div className={`bar-fill ${r.cls}`} style={{ width: pct(r.v) + "%" }} />
            {target !== undefined && <div className="bar-tick" style={{ left: pct(target) + "%" }} />}
          </div>
          <span className="bar-val">{fmt ? fmt(r.v) : r.v.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function LufsMeter({ mix, ref }: MeterProps) {
  const { playhead: t, offsetB, target } = useViewState();
  const stA = R.winMean(mix, "shortTermLUFS", t, 3);
  const stB = R.winMean(ref, "shortTermLUFS", t + offsetB, 3);
  const moA = R.winMean(mix, "momentaryLUFS", t, 0.4);
  const moB = R.winMean(ref, "momentaryLUFS", t + offsetB, 0.4);
  return (
    <div>
      <div className="meter-sublabel">Short-term · target {target}</div>
      <BarMeter lo={-30} hi={-4} target={target}
        rows={[
          { k: "A", cls: "a", color: "var(--a)", v: stA },
          { k: "B", cls: "b", color: "var(--b)", v: stB },
        ]} />
      <div className="mom-line">
        <span><span className="mk">Mom A</span><span className="mv a" style={{ color: "var(--a)" }}>{moA.toFixed(1)}</span></span>
        <span><span className="mk">B</span><span className="mv b" style={{ color: "var(--b)" }}>{moB.toFixed(1)}</span></span>
      </div>
    </div>
  );
}

function TpColumn({ track, role, t }: { track: TrackPayload; role: "a" | "b"; t: number }) {
  const tp = R.at(track, "truePeak", Math.max(0, t));
  const over = tp > -1;
  const yOf = (v: number) => Math.max(0, Math.min(1, (v + 18) / 18)) * 100; // -18..0 dBTP
  const col = over ? "var(--warn)" : role === "a" ? "var(--a)" : "var(--b)";
  return (
    <div className="tp-track">
      <div className="tp-head">
        <span className="dot" style={{ background: role === "a" ? "var(--a)" : "var(--b)" }} />
        <span className="nm">{role === "a" ? "A · mix" : "B · ref"}</span>
      </div>
      <div className="tp-cols">
        <div className="tp-col">
          <div className="tp-bar">
            <div className="fill" style={{ height: yOf(tp) + "%", background: col }} />
          </div>
        </div>
      </div>
      <div className="tp-read">
        <span className="v" style={{ color: over ? "var(--warn)" : "var(--tx-1)" }}>{tp.toFixed(1)}</span>
        <span className={`over ${over ? "clip" : "ok"}`}>{over ? "OVER" : "−1 dBTP ok"}</span>
      </div>
    </div>
  );
}

export function TruePeakMeter({ mix, ref }: MeterProps) {
  const { playhead, offsetB } = useViewState();
  return (
    <div className="tp-wrap">
      <TpColumn track={mix} role="a" t={playhead} />
      <TpColumn track={ref} role="b" t={playhead + offsetB} />
    </div>
  );
}

export function MeterPlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="empty-slot" style={{ fontSize: 11, color: "var(--tx-3)" }}>
      {title} lands in {phase}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `MeterColumn.tsx`.** In `MeterSlot`, replace the placeholder body:

```tsx
import { LufsMeter, TruePeakMeter, MeterPlaceholder } from "./meters";

// inside MeterSlot, body:
      <div className="meter-body">
        {!mix || !ref ? (
          <MeterPlaceholder title={METERS[id]} phase="analysis" />
        ) : id === "lufs" ? (
          <LufsMeter mix={mix} ref={ref} />
        ) : id === "truepeak" ? (
          <TruePeakMeter mix={mix} ref={ref} />
        ) : (
          <MeterPlaceholder
            title={METERS[id]}
            phase={id === "correlation" || id === "balance" ? "Phase 3" : "a later phase"}
          />
        )}
      </div>
```

- [ ] **Step 3: Type-check + build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Manual test.** Open a ready comparison. Default meters show **LUFS** (integrated A/B big numbers, short-term bar vs target tick, momentary line) and **True Peak** (L/R bars, dBTP readout, OVER flag when > −1). Park the playhead at different points (click the waveform) → meter numbers change with position. Toggle A/B → the audible row emphasis flips. Swap a meter to Correlation → "lands in Phase 3".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/meters/meters.tsx frontend/src/features/meters/MeterColumn.tsx
git commit -m "feat(meters): LUFS + True Peak meters reading features at playhead"
```

---

# PART F — SETTINGS: MOMENTARY TOGGLE + TARGET

### Task F1: Momentary toggle + target stepper

**Files:**
- Modify: `frontend/src/features/header/Header.tsx`

- [ ] **Step 1: Add controls to the Settings menu.** Replace the Settings `Menu` body (currently just "Back to library") with momentary + target + the nav item:

```tsx
        {(close) => {
          return (
            <div style={{ width: 220 }}>
              <div className="menu-label">Display</div>
              <div
                className="menu-item"
                onClick={() => useViewState.getState().set({ momentary: !useViewState.getState().momentary })}
              >
                Momentary overlay
                <span className="check">{useViewState.getState().momentary ? "✓" : ""}</span>
              </div>
              <div className="menu-label">Target LUFS</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px" }}>
                <button className="tbtn" onClick={() => useViewState.getState().set({ target: Math.max(-24, useViewState.getState().target - 1) })}>−</button>
                <span className="mono" style={{ minWidth: 44, textAlign: "center" }}>{useViewState.getState().target} LU</span>
                <button className="tbtn" onClick={() => useViewState.getState().set({ target: Math.min(-9, useViewState.getState().target + 1) })}>+</button>
              </div>
              <div className="menu-label">Navigation</div>
              <div className="menu-item" onClick={() => { close(); navigate("/"); }}>← Back to library</div>
            </div>
          );
        }}
```

> The momentary check + target readout reflect `getState()` at render of the menu; since the `Menu` re-opens fresh each time and these are low-frequency settings, reading from `getState()` on click is sufficient. (If live tick-through is wanted later, subscribe via `useViewState` selectors — out of scope here.)

- [ ] **Step 2: Manual test.** Open Settings → toggle **Momentary overlay** on; the Short-term LUFS lane gains faint momentary traces. Step **Target LUFS** up/down → the LUFS meter's "target" tick and label move. Reload → settings persist (viewState is localStorage-backed).

- [ ] **Step 3: Type-check + build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/header/Header.tsx
git commit -m "feat(settings): momentary overlay toggle + target LUFS stepper"
```

---

# PART G — PHASE VERIFICATION

### Task G1: Full-phase smoke + commit

- [ ] **Step 1: Backend tests.** Run: `cd backend && uv run pytest -v`
Expected: all green (decode, waveform, loudness, features, peak).

- [ ] **Step 2: Frontend build.** Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean, no type or lint errors.

- [ ] **Step 3: End-to-end verification** (the phase's definition of done). Backend + frontend running:
  - Create a new comparison from the demo files → processing screen runs Decode→Gain-match→Loudness→Waveform to 100%.
  - Workspace opens; **Space** plays audible audio; playhead tracks sound; click seeks.
  - **Tab** switches audible track at matched loudness; dragging B re-aligns audibly.
  - Region select + **L** loops within the region.
  - Short-term LUFS lane shows both curves + target; momentary toggle adds faint traces; crest lane renders; region tiles + static summary show real numbers; LUFS + True Peak meters read at the playhead and update as it moves; ΔLUFS / offset header pills are populated.
  - Reload the page → view state + audio persist/reopen.

- [ ] **Step 4: Final commit (if any verification fixups were needed).**

```bash
git add -A
git commit -m "chore: phase 1 loudness + audio playback verified"
```

---

## Self-Review (against the spec)

**P1 spec coverage (§8 "P1 — Loudness (Substrate 1) + meters"):**
- Short-term LUFS lane (momentary toggle) → Tasks B2, D1, D2, F1. ✓
- Crest lane → Tasks B4, D1, D2. ✓
- Region tiles (integrated LUFS + delta, true peak, crest) → Tasks B3/B4/B5 (data), C2 (region gate), D2 `TilesBody`. ✓
- LUFS + True Peak meter slots, features arrays while parked → Tasks B5, E1. ✓ (AudioWorklet live layer explicitly deferred to P4 — documented above; meters are functional via precomputed reads + real clock.)
- ΔLUFS / offset header pills → already present in `Header.tsx`; populated by real `gainMatch` from P0/B6. ✓ (no new task; verified in G1.)
- Static summary panel (LRA/TP/PLR) → Tasks B3/B5, D2 `SummaryBody`. ✓
- "Web Audio graph established here" → satisfied by the Part A audio engine (real playback), exceeding the literal P1 line; AudioWorklet DSP taps deferred to P4 (decision recorded above). ✓
- **Added (user request):** real audio playback, gain-matched A/B switching, region looping → Part A. ✓

**DSP rigor (spec §5 + §9 "DSP rigor"):** self-implemented two-pass gated integrated (B3), region-scoped via the same function over a block slice (B3 + C2 client-side), ≥4× true-peak oversampling (B4), cross-checked against pyloudnorm and known sine values (B2/B3/B4 tests). ✓

**Type consistency:** `compute_substrate1` returns `{features, static, kblocks}`; pipeline embeds all three; payload type (C1) declares `features: Features`, `static: StaticAggregates`, `kblocks: number[][]`; read layer (C2) consumes `track.features[key]` and `track.kblocks`; bodies/meters consume the read layer. `audioUrl(id, role)` defined in C3-adjacent A1 and used in A3. `useAudioEngine` args match the Transport call site. Stage key `loudness` added to pipeline `ALL_STAGES`, `Processing.tsx` labels/order, and rendered by present-key filter. Consistent. ✓

**Deferred-but-listed views/meters** (`ltas`, `liveSpectrum`, `bandDelta`, `correlation`, `goniometer`, `spectrogram`, `psr`, `correlation`, `balance`, `rms`) all have graceful "lands in Phase N" placeholders (D2, E1). ✓
