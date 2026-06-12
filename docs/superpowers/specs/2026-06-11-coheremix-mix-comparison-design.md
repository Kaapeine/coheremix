# CohereMix — v1 Design & Decision Record

**Date:** 2026-06-11
**Status:** Approved for planning

This document is the authoritative v1 spec. It layers concrete engineering decisions and the design-handoff integration on top of two source documents, and resolves their open questions:

- **Engineering spec:** `mix-comparison-tool-spec(2).md` — DSP first-principles, substrates, metric reference, backend pipeline. *Governs behavior, DSP, and data flow.*
- **Design handoff:** `design_handoff_coheremix/` (`README.md`, `source/styles.css`, `source/data.js`, etc.) — high-fidelity visual prototype. *Governs layout, proportions, styling, component structure, and the frontend data contract.*

**Conflict rule:** design wins on visuals/structure; spec wins on behavior/DSP. Where they conflict, the resolution is recorded below.

---

## 1. Product summary

CohereMix is a desktop-first web tool for mix/mastering engineers. The user loads two stereo tracks — **their mix (A)** and a **commercial reference (B)** — and the app gain-matches them to a common loudness, lets the user manually align an analogous section, and presents a synchronized comparison: dual-waveform transport, a configurable stack of analysis panels (loudness / frequency / stereo / spectrogram / summary), and a right-hand column of two live meters that read at the playhead. The headline interaction is **loudness-matched, gapless A/B switching** so tone and dynamics are compared honestly, not "louder wins."

The original spec's first principles (§2) stand unchanged and drive everything: gain-match is the spine; comparison is honest about time (manual offset); overlay within a metric, never across; precompute once, read three ways; loudness-matched A/B is the killer feature.

---

## 2. Scope (v1)

**In:** Full spec Phases 0–5 — ingest/transport/shell, loudness + meters, frequency, spatial, the loudness-matched A/B instrument, spectrogram, view modes, layout persistence — plus a **comparisons library** (multiple comparisons per anonymous session). No accounts, no auth, no sharing, no cloud sync.

**Out (v1):** automatic section detection, stem separation, real-time input monitoring, multi-user/auth, durable cloud storage, shareable links, mobile/narrow layouts, light theme. Multiple-reference-per-comparison is deferred but the data model leaves room for it.

---

## 3. Architecture

### 3.1 One server, one artifact
- A **single FastAPI app** serves the built Vite/React static bundle **and** the `/api/*` routes. `GET /` → SPA; `/api/...` → JSON/binary. One process, one deployable artifact.
- **No auth, no users.** An anonymous `session_id` (cookie + localStorage) scopes a user's comparisons.

### 3.2 In-process job orchestration (no Celery/Redis)
- Analysis runs on a background worker (FastAPI `BackgroundTasks` / thread or process pool) behind a small **`JobRunner` interface**. The interface is the seam: swapping in Celery later touches one module, not the call sites.
- Per-track, per-stage progress is written to the DB and polled by the frontend.

### 3.3 Storage — DB + file store, both abstracted
- **SQLite via SQLAlchemy**, behind a repository layer. Postgres-ready (config change, not a rewrite).
- **Local-disk file store** behind a `Storage` interface for heavy bytes (raw uploads + serialized analysis payloads). S3-ready.
- The DB holds metadata; the file store holds bytes. A **TTL sweeper** purges temp uploads/payloads after ~24h so disk doesn't grow unbounded.

### 3.4 Data model
```
sessions            anonymous session id
  └─ comparisons    many per session
                    name, created_at, state (ready | failed),
                    persisted view context: offsetB, region, secPerPx,
                    panels[], meterSlots[], ab, matchMode, target, momentary
       └─ tracks    exactly 2 per comparison: role = mix | reference
                    file meta, gainMatch, per-track analysis state
            └─ jobs analysis job + per-stage progress
```
- A comparison enters the library only once analysis **succeeds** (or is shown **failed**). There is **no persistent "analyzing" state in the library** — the wait happens on the processing screen during creation.
- Per-track payload model is preserved so **multiple references per comparison** is a clean later extension (a comparison gains >1 reference track + a slot index).

### 3.5 Local-first persistence & offline
The client is **local-first**: it reads from local storage first and falls back to the server, and syncs writes back to the DB.

- **viewState + comparison metadata** (library list, names, dates, offset/region/layout) cached in **localStorage**, keyed by comparison + session. Writes go to localStorage immediately (write-through) and sync to the DB. On open/refresh, hydrate from localStorage; if missing/stale, fetch from the DB and backfill the cache.
- **Analysis payloads** (feature arrays, LTAS, spectrogram blob) cached in **IndexedDB** (too large for localStorage), keyed by comparison/track. A previously-opened comparison renders its graphs/meters **offline** without refetching.
- **Audio assets** for offline A/B playback: cache the decoded/uploaded audio (Cache API / IndexedDB) so a previously-opened comparison can replay offline. *Best-effort* — large files may be evicted; on a cache miss the app refetches when online.
- The **DB remains the source of truth / sync + backup**; localStorage holds the `session_id`. Creating a *new* comparison still requires the server (decode + DSP). Offline support targets **re-opening already-analyzed comparisons**, not analyzing new ones.

---

## 4. Backend analysis pipeline

Per spec §8, with in-process orchestration:

```
Upload (POST) → FastAPI → create comparison + tracks → enqueue JobRunner task(s)
  per track:
    ├─ decode (ffmpeg) → PCM
    ├─ resample to 48 kHz (so STFT bins align across tracks)
    ├─ gain-match: integrated LUFS + offsetToCommon (common target −14 LUFS)
    ├─ Substrate 1: K-weighted power blocks (100 ms)        [BS.1770-4]
    ├─ Substrate 2: STFT frames (4096, Hann, 75% overlap)
    ├─ Substrate 3: per-block correlation + M/S
    ├─ derive static aggregates (LRA, true-peak max, PLR, avg corr, crest avg)
    ├─ multi-resolution waveform peaks (min/max per zoom)
    └─ serialize → file store (matching §6 contract)
Frontend polls job → fetches payload → renders
```

**Channels:** **stereo only.** Mono and >2ch are rejected at the upload-validation beat with a clear inline message (spatial metrics are undefined otherwise).

**DSP correctness:** use `pyloudnorm`/`scipy`, but **verify against BS.1770-4 / EBU R128 test vectors** in the test suite. **Implement region-scoped integrated LUFS ourselves** (libs don't expose it), plus the two-pass gate (§5 of source spec) and ≥4× true-peak oversampling. The gain-match spine must be correct — every downstream comparison depends on it.

**Progressive reveal:** as soon as a track's decode lands, its waveform + transport can go live; panels/meters fill as each substrate completes. **Cancellable**, with a per-stage failure path that does not force re-upload of the track that succeeded.

**Demo files:** two bundled demo tracks back the "Use demo files" affordance.

---

## 5. Frontend

### 5.1 Stack
**Vite + React + TypeScript + Tailwind + Zustand.** Tailwind because the handoff is token-driven CSS and we rebuild-to-match; Zustand for the single shared view store. **regl (thin WebGL wrapper) for all waveform and spectrum rendering; Web Audio API + AudioWorklet for real-time meters and the goniometer; HTML Canvas only for simple overlays (playhead, region rect).** Desktop-first, explicit min-width (~1280px); phone out of scope.

The handoff `source/*.jsx` are **readable component specs, not a build target** (they use in-browser Babel). We **rebuild cleanly, matching pixel-for-pixel**, porting tokens and component structure into our own components.

### 5.2 Design system (verbatim from `source/styles.css`)
Port these tokens exactly. Dark-only. Default "warm" theme; `neutral`/`slate` background variants, `muted`/`vivid` accent variants, `compact`/`comfy` density — applied as `data-bg` / `data-accent` / `data-density` on `:root`.

- **Surfaces:** `--bg #13110e`, `--surface-1 #1c1813`, `--surface-2 #241f18`, `--surface-3 #2c261d`
- **Hairlines:** `--line rgba(255,240,222,.07)`, `--line-strong rgba(255,240,222,.14)`
- **Text:** `--tx-1 #efe9df`, `--tx-2 #a39888`, `--tx-3 #6d6354`
- **Identity:** A/mix amber `--a #f2a93b` (`-dim #a8772a`, `-soft rgba(242,169,59,.14)`); B/ref cyan `--b #3fcfe0` (`-dim #2b8c99`, `-soft rgba(63,207,224,.13)`); active meter text near-black `#0b0b0d`
- **Status:** `--warn #e5544e`, `--good #4fc08a`
- **Geometry:** `--radius 4px`, `--radius-sm 2px`, `--header-h 60px`, `--transport-min 268px`, `--gutter 64px`, `--main-split 80%`, `--gap 10px`
- **Type:** monospace throughout — `--mono "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`. A/B letters 30px/700; section labels 10–11px uppercase ~0.1em tracking; meter numbers 12–27px; body 10–13px.

### 5.3 Layout (verbatim geometry)
- **App shell:** CSS grid `grid-template-rows: 60px 1fr; grid-template-columns: minmax(0,1fr); height:100%`. Page never scrolls.
- **Main:** `grid-template-columns: minmax(0,1fr) clamp(252px,20%,360px)` — left column + meter column that never collapses.
- **Left column:** `grid-template-rows: minmax(268px,40%) 1fr` — transport above workspace.
- **Transport:** grid `cols var(--gutter) 1fr / rows 1fr 46px`; `overflow:hidden` (dropdowns must portal to body). A/B block spans both rows in column 1.
- **Shared 64px left gutter:** the A/B block and every panel's y-axis label gutter share `--gutter`, so the **time lane begins at the same x** across the whole left column and the playhead is one unbroken vertical column. Load-bearing.
- **Workspace:** 34px sticky bar ("Analysis panels" + panel count + **Add panel** on the right) above a `overflow-y:auto` scroll of edge-to-edge stacked panels (no gaps, no inset cards, only `border-bottom` between them). **No panel cap in v1** (a cap can be reintroduced later); Add panel is always enabled.
- **Meter column:** `grid-template-rows: 1fr 1fr` — two stacked meter slots, `overflow:hidden`.

### 5.4 Shared viewState (Zustand)
Single source of truth (spec §6.1 + handoff `App` state). Transport writes nav/region/offset; A/B writes `ab`; slot selectors write `panels`/`meterSlots`. **Swapping a panel or meter never perturbs `playhead`, `region`, `offsetB`, or `ab`.**

```
secPerPx        zoom (clamp 0.004…0.5)
scroll          single shared scroll (v1)
offsetB         B alignment offset (clamp −30…+30 s); B read at playhead + offsetB
linked          lock alignment so scroll preserves offsetB
playhead        A-time
regionA         [start,end] selection; regionB derived = regionA + offsetB
loop            { enabled }
ab              'A' | 'B' (which track is audible)
matchMode       'integrated' | 'shortterm' | 'region' | 'off'
viewMode        'overlaid' | 'sideBySide'  (spectrogram/goniometer force side-by-side)
target          common LUFS target (default −14, user-adjustable)
momentary       momentary-LUFS overlay toggle
panels          ordered view ids (no cap in v1); default ['shortTermLufs','ltas','tiles']
meterSlots      [meter id, meter id]; default ['lufs','truepeak']
```

This store is the unit that gets **cached in localStorage** per comparison (§3.5) and synced to the DB.

### 5.5 Screens
1. **Comparisons library (new — entry point).** List/grid of comparisons: name (auto-named `<mix> vs <ref>`, inline-editable), the two track names, date, and actions (open, rename, delete, duplicate). Empty state → "New comparison" CTA → upload modal. Loading/error states for the list fetch. No per-item analyzing state. Routed at `/`.
2. **Upload modal** (`states.jsx`). Two side-by-side drop slots — A·Your mix (amber), B·Reference (cyan). DropZone → FileCard on fill (editable name, "Decoded — ready" badge, spec grid format/duration/sample-rate/bit-depth/channels/size, remove). Per-slot validation (format, size, decode, **stereo-only**). Analyze enabled only when both valid. "Use demo files" link.
3. **Processing screen** (`states.jsx`). Two `ProcTrack` rows, five staged steps each — Decode → Loudness substrate → STFT substrate → Spatial → Aggregates — spinner on active, ✓ on done, progress bar. Cancellable (returns to upload). On success → app + alignment coachmark.
4. **App workspace** — routed at `/c/:comparisonId`. Header + transport + panel workspace + meter column, as specified above.

**Routing:** React Router. `/` library, `/c/:id` workspace.

### 5.6 Components & registries (rebuild from handoff)
- **Header (60px):** brand mark/wordmark; offset-B pill + ΔLUFS A−B pill (results, shown not corrected away); flexible spacer; file chip A + swap (⇄, swaps roles & negates offset) + file chip B; Help and Settings icon buttons. All dropdowns portal to `<body>` with fixed positioning, flip up when low on space, close on outside click/scroll/resize (port `ui.jsx` `Menu`).
- **Transport:** dual waveform (A over B), B lane horizontally draggable to set `offsetB` (updates the header pill live); control row = play/pause (Space), loop (L), zoom ±, time readout, link toggle, Match dropdown (Integrated/Short-term/Region/Off); A/B vertical segmented block (Tab toggles, click sets; active A=amber/active B=cyan with near-black letter).
- **Panel:** 34px head (view-switcher chevron, title + muted subtitle, optional A/B legend chips anchored in-head, move-up/down + remove tools); body height from a view registry. **View registry families:** Loudness (Short-term LUFS, Crest), Frequency (LTAS, Live spectrum, Band-energy delta), Stereo (Phase correlation, Goniometer side-by-side), Spectrogram (A-row over B-row), Summary (Region readout tiles, Static summary). Time-axis panels overlay shared playhead + region from `--gutter`.
- **Meter column:** two swappable slots; meter types LUFS, True Peak, PSR/Dynamics, Correlation, Stereo Balance, RMS; a meter shown in one slot is disabled in the other's picker. Each shows A and B (B at `playhead + offsetB`), amber/cyan identity, audible-track row emphasized. **Dual-mode:** while playing → AudioWorklet live output; while parked → index pre-computed `features` arrays at `playhead` so meters stay populated when not playing. Region aggregates live in Summary **tiles**, not meters (meters = instantaneous).
- **Settings:** target LUFS, momentary toggle, theme (bg/accent/density variants). Help: keyboard-shortcuts overlay (Tab A/B, Space play, region drag, Esc clear, L loop, +/− zoom).

### 5.7 Rendering
**regl (WebGL)** for all waveforms, spectrum, and spectrogram. `draw.js` from the handoff is the visual spec for what to render — use it as a reference, not a build target. Pre-upload the spectrogram heatmap as a 2D WebGL texture once; blit the visible slice on scroll/zoom via shader uniforms — never re-upload. DPR-aware sizing via `ResizeObserver`; guard zero-size first paint. Two independent transports decode via `decodeAudioData`; playhead tracked off `AudioContext.currentTime`. Simple 2D Canvas only for non-data overlays (playhead line, region selection rectangle).

### 5.8 Visualization compute architecture

Two categories of visualization: **pre-computed on backend** (static, cached in IndexedDB) and **real-time on frontend** (live while audio plays, Web Audio API + AudioWorklet → regl).

**Backend pre-computes — rendered statically:**

| Data | What it is | Rendered as |
|------|-----------|-------------|
| Waveform peak mipmap | `{z256,z512,z1024,z2048,z4096}` — interleaved min/max per column | regl — renderer picks level closest to canvas px width; smooth at any zoom |
| LTAS | Long-term average spectrum: mean of all STFT frames, `{freqs,db,bins}` | Smooth curve overlay on spectrum panel (regl) |
| Spectrogram | Full STFT matrix: uint8 `bins×cols`; never raw float JSON | 2D WebGL texture, scrub with playhead |
| Short-term LUFS time series | K-power block values over full file, `features.shortTermLUFS` | Line chart (regl) |
| Integrated LUFS, true-peak, LRA, PLR | Single static values | Header pills, summary tiles |
| Band energy (7 bands) | Derived from LTAS per bandEdge | Band-energy delta bars |

**Frontend real-time — Web Audio API + AudioWorklet → regl:**

| Visualization | Compute | Render |
|--------------|---------|--------|
| Real-time spectrum analyzer (SPAN-like) | `AnalyserNode` (FFT up to 32768 bins) | regl 1D texture → log-freq curve, peak-hold line, A+B overlaid |
| Goniometer (stereo field / Lissajous) | AudioWorklet ring buffer of `(L+R, L−R)` sample pairs | regl point cloud with phosphor-decay fade; A and B side-by-side |
| Momentary/short-term LUFS meter | AudioWorklet: two `BiquadFilterNode`s (K-weighting shelf + high-pass) → windowed RMS | Meter bar with amber/cyan identity |
| Correlation meter | AudioWorklet: `Σ(L×R) / √(Σ(L²)·Σ(R²))` over window | Needle/bar |
| Balance meter | AudioWorklet: RMS(L) vs RMS(R) | Dual bar |
| True peak meter (live) | Approximated via AnalyserNode | Peak hold indicator |

**Key implications:**
- `liveSpec` is **dropped** from the payload — the real-time AnalyserNode replaces it entirely for the spectrum analyzer panel
- The Web Audio graph must expose `AnalyserNode` and `AudioWorklet` tap-points so panels and meter slots can attach to them
- Meter slots read real-time AudioWorklet output while audio plays; when parked (not playing) they read from the pre-computed `features` arrays so they stay populated
- The goniometer is meaningless as a static pre-computed blob — it must be real-time

---

## 6. Frontend data contract (authoritative)

The backend payload **must match `design_handoff_coheremix/source/data.js` `buildTrack()`** (this supersedes the rougher §9 sketch in the source spec). Per track:

```jsonc
{
  "track": "user" | "reference",
  "name": "Nightdrive_mix_v7.wav",
  "fileInfo": {                     // ORIGINAL uploaded file (what the chip/FileCard shows)
    "format": "WAV", "sampleRate": 48000, "bitDepth": 24,
    "channels": 2, "size": 38219340, "duration": 214.6
  },
  "meta": { "sampleRate": 48000, "duration": 214.6, "channels": 2 }, // ANALYZED stream (post-resample to 48 kHz)
  "gainMatch": { "integratedLUFS": -11.8, "offsetToCommon": -2.2 }, // target − integrated, common −14
  "hop": 0.1,                       // s, feature frame hop
  "features": {                     // Float32 arrays, length = duration/hop
    "shortTermLUFS": [...], "momentaryLUFS": [...], "correlation": [...],
    "crest": [...], "truePeak": [...], "centroid": [...], "msRatio": [...]
  },
  "ltas":  { "freqs": [...], "db": [...], "bins": 96 },   // dB per log-freq bin
  "spectrogram": { "bins": 56, "cols": 240, "data": "<uint8 bins×cols>" },
  "waveform": { "peaksByZoom": { "z256": [...], "z512": [...], "z1024": [...], "z2048": [...], "z4096": [...] } }, // mipmap pyramid; interleaved min/max per column; renderer picks closest to canvas px width
  "static": { "lra": 6.1, "integrated": -11.8, "truePeakMax": -0.8,
              "plr": 9.3, "avgCorrelation": 0.74, "crestAvg": 11.2 }
}
```
`fileInfo` describes the **original uploaded file** (e.g. a `FLAC · 44.1 kHz · 24-bit` source) and drives the header chip / upload FileCard; `meta` describes the **analyzed stream** after resampling to 48 kHz. They differ whenever the source isn't already 48 kHz.

Plus comparison-level **defaults**: `offsetB`, `secPerPx`, `duration`, and 7 `bandEdges` (Sub 20–60, Low 60–120, L-Mid 120–400, Mid 400–2000, H-Mid 2000–5000, Pres 5000–10000, Air 10000–20000).

**Frontend sampling** mirrors `PARITY_READ`: `at(track,key,t)` linear-interp at A-time, `mean`/`max` over `[t0,t1]`, `specAt(track,t)` interpolated live-spectrum frame, `bandEnergy(track,lo,hi)` over LTAS. Implement these as the typed read layer over the payload.

**Serialization:** feature arrays + LTAS as typed arrays (small at 100 ms hop). Spectrogram is the only heavy payload — quantize to uint8, ship `bins×cols` as a binary/base64 blob, never float JSON.

---

## 7. A/B playback (the instrument)

Per spec §6.5. Loudness-matched is non-negotiable — switch at matched gain via the gain-match spine. Both decoded buffers stay loaded; playback position locked; one key (**Tab**) crossfades the audible source between **A at `playhead`** and **B at `playhead + offsetB`** with no audible seam. Match modes: `integrated` (default), `shortterm`, `region`, `off`. Loop the selected region and toggle A/B within it — the looped-chorus A/B/A/B at matched loudness is the moment of insight. Ballistics → smoothing-window length over the precomputed arrays. Explicitly **not** building DAW sync or master-bus insertion.

---

## 8. Build sequencing — each phase an independently deployable, verifiable slice

Contract-first within each phase: define the typed payload/API contract → backend slice + DSP verification → frontend that consumes it → deploy. Every phase ends at a shippable state.

- **P0 — Library, ingest, transport & shell.** Comparisons library + routing + "new comparison" upload flow (stereo validation, file-info beat) → decode → gain-match → processing screen → dual-waveform transport using **regl** (waveform mipmap pyramid, smooth zoom/scroll, playhead, region/loop, drag-B alignment, link toggle) + the full app shell (header, A/B block, two empty meter slots, workspace with one empty panel + add/reorder/remove). Design system (tokens + base components) established here as the first FE task, along with the Zustand store + **local-first viewState/metadata persistence** (localStorage write-through, DB fallback). *Deployable: upload two stereo files, see the comparison in your library, open it, align sections, keep several comparisons.*
- **P1 — Loudness (Substrate 1) + meters.** Short-term LUFS lane (momentary toggle), crest lane, region tiles (integrated LUFS + delta, true peak, crest), LUFS + True Peak meter slots (AudioWorklet real-time while playing; `features` arrays while parked), ΔLUFS/offset header pills, Static summary panel (LRA/TP/PLR). The 80/20 spine, shippable alone. Web Audio graph established here.
- **P2 — Frequency (Substrate 2).** LTAS hero overlay (pre-computed curve, regl), **real-time spectrum analyzer** (AnalyserNode → regl, SPAN-style: log-freq, peak-hold, A+B overlaid), band-energy delta bars, centroid/tilt.
- **P3 — Spatial (Substrate 3).** Correlation lane, M/S region tiles, per-band width, **dual goniometers** (AudioWorklet ring buffer → regl point cloud with phosphor decay); correlation + balance meter slots (AudioWorklet).
- **P4 — A/B instrument.** Loudness-matched, keyboard-bound, gapless A/B; match modes; loop-the-region; B at `playhead + offsetB`.
- **P5 — Polish.** Spectrogram panel, overlaid/side-by-side view modes, region-select refinements, **offline caching** (analysis payloads in IndexedDB + best-effort audio caching so analyzed comparisons re-open offline), multiple-reference-slot data model, export (Summary + LTAS as PNG/PDF — minimal).

---

## 9. Defaults & resolved open questions

| Item | Decision |
|---|---|
| App name | **CohereMix** |
| Deployment | Single FastAPI server serves SPA + `/api`; no auth/users |
| Job orchestration | In-process `JobRunner` (FastAPI BackgroundTasks); Celery-swappable later |
| DB / storage | SQLite (SQLAlchemy repo layer) + local-disk store behind a `Storage` interface; Postgres/S3-ready; ~24h TTL sweeper |
| Sessions | Anonymous `session_id`; many comparisons per session |
| Channels | Stereo only; reject mono / >2ch at upload |
| Sample rate | Resample both to 48 kHz at decode |
| Common loudness target | −14 LUFS (gain-match anchor + meter target tick; user-adjustable) |
| Scroll model | Single shared scroll + drag-B-to-align (independent scroll deferred) |
| Panels | No cap in v1; default `[shortTermLufs, ltas, tiles]` |
| Meter slots | 2; default `[lufs, truepeak]` |
| Match modes | Integrated / Short-term / Region / Off |
| Persistence | Local-first: viewState + comparison metadata in localStorage, payloads in IndexedDB, synced to DB (source of truth) |
| Offline | Re-open already-analyzed comparisons offline (cached payloads + best-effort audio); new analysis requires the server |
| Theme | Dark only; warm default + neutral/slate bg, muted/vivid accent, compact/comfy density |
| Upload limits | ~100 MB / ~15 min per file (configurable) |
| Min width | ~1280px desktop; phone out of scope |
| Demo files | Two bundled demo tracks behind "Use demo files" |
| DSP rigor | Libs + EBU/BS.1770-4 test-vector verification; region-scoped integrated LUFS implemented ourselves |
| Data contract | `data.js` `buildTrack()` shape; `liveSpec` dropped (replaced by real-time AnalyserNode); waveform uses 5-level mipmap pyramid (`z256`–`z4096`) |
| Waveform rendering | regl (WebGL) with mipmap pyramid; renderer picks zoom level closest to canvas pixel width |
| Spectrum analyzer | Real-time: `AnalyserNode` (32768-bin FFT) → regl; log-freq scale, slope compensation, peak hold, A+B overlaid |
| Goniometer | Real-time: AudioWorklet ring buffer → regl point cloud with phosphor decay; must be real-time (static blob is meaningless) |
| Meters (live) | AudioWorklet while playing; `features` array index while parked |

---

## 10. Risks

- **Loudness gating correctness** — verify the adopted lib matches BS.1770-4 two-pass gating; the region-scoped integrated case is not exposed by most libs and must be implemented + tested.
- **Spectrogram payload size** — uint8 + time downsample (bins×cols) is the default; revisit if high-res zoom is wanted.
- **Gapless, matched A/B** — the highest-leverage feature and the trickiest (seamless crossfade between two buffers at `playhead` vs `playhead + offsetB` at matched gain); give P4 real time.
- **Sample-rate alignment** — resample both to 48 kHz so STFT bins align across tracks; verify true-peak oversampling on resampled material.
