# CohereMix — Phase 0: Library, Ingest, Transport & Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deployable foundation: a comparisons library, the two-file upload → decode → gain-match → waveform pipeline, and the full app shell with the dual-waveform transport (alignment, zoom, playhead, region/loop) — no metrics yet, but the complete interaction model and design system.

**Architecture:** Monorepo. A single FastAPI app serves the built Vite/React SPA (`frontend/dist`) and `/api/*` routes. Analysis runs in-process behind a `JobRunner` interface (no Celery). SQLite via SQLAlchemy behind a repository layer; heavy bytes (uploads, payloads) in a local-disk store behind a `Storage` interface. Frontend is local-first: viewState + comparison metadata in localStorage (write-through), DB is source of truth. Audio decode/resample via ffmpeg subprocess; DSP in numpy/scipy/pyloudnorm.

**Tech Stack:** Backend — Python 3.12, uv, FastAPI, uvicorn, SQLAlchemy 2.0, pydantic v2, numpy, scipy, pyloudnorm, ffmpeg (system dep), pytest. Frontend — Vite, React 18, TypeScript, Tailwind, Zustand, React Router. **Testing policy:** automated tests **only** for audio/DSP code (Tasks 9–11); DB/storage/jobs/API verified by smoke checks; no frontend tests; no TDD.

**Source-of-truth references (read before frontend tasks):**
- Design tokens + layout CSS: `design_handoff_coheremix/source/styles.css`
- Component/behavior specs: `design_handoff_coheremix/source/{app,transport,panels,meters,states,ui}.jsx`
- Canvas rendering spec: `design_handoff_coheremix/source/draw.js`
- Data contract + sampling: `design_handoff_coheremix/source/data.js` and spec §6
- Full spec: `docs/superpowers/specs/2026-06-11-coheremix-mix-comparison-design.md`

**Phase 0 deployable outcome:** upload two stereo files → watch per-stage processing → land in a workspace where both waveforms render, you can zoom, scrub, select/loop a region, and drag the B waveform to align it; the comparison is saved to your library; you can reopen, rename, duplicate, delete, and swap A/B roles. Later substrate stages report as "pending" and panels/meters are empty slots.

---

## File Structure

```
coheremix/
├── backend/
│   ├── pyproject.toml                  # uv project, deps, pytest config
│   ├── app/
│   │   ├── main.py                     # FastAPI app, router mount, static SPA serving
│   │   ├── config.py                   # Settings (db url, storage dir, ttl, limits)
│   │   ├── db/
│   │   │   ├── base.py                 # engine, SessionLocal, Base, init_db
│   │   │   ├── models.py               # Session, Comparison, Track, Job ORM
│   │   │   └── repositories.py         # CRUD functions (no raw SQL at call sites)
│   │   ├── storage/
│   │   │   ├── base.py                 # Storage protocol
│   │   │   └── local.py                # LocalDiskStorage
│   │   ├── analysis/
│   │   │   ├── decode.py               # ffmpeg decode + resample + ffprobe fileInfo
│   │   │   ├── loudness.py             # integrated LUFS (gated) + gain-match
│   │   │   ├── waveform.py             # multi-resolution peaks
│   │   │   └── pipeline.py             # orchestrates P0 stages, writes progress
│   │   ├── jobs/
│   │   │   ├── base.py                 # JobRunner protocol
│   │   │   └── inprocess.py            # InProcessJobRunner (BackgroundTasks)
│   │   ├── schemas.py                  # pydantic payload contract (spec §6)
│   │   └── api/
│   │       ├── comparisons.py          # comparison + track + upload routes
│   │       └── jobs.py                 # job status route
│   ├── tests/
│   │   ├── conftest.py                 # fixtures: generated wav tones
│   │   ├── test_decode.py
│   │   ├── test_loudness.py
│   │   └── test_waveform.py
│   └── demo/                           # two bundled demo tracks ("Use demo files")
│       ├── mix_demo.wav
│       └── reference_demo.wav
├── frontend/
│   ├── package.json
│   ├── vite.config.ts                  # dev proxy /api → :8000; build to dist
│   ├── tailwind.config.ts
│   ├── index.html                      # loads JetBrains Mono
│   └── src/
│       ├── main.tsx                    # router root
│       ├── styles/tokens.css           # ported :root tokens from styles.css
│       ├── api/client.ts               # typed fetch wrappers
│       ├── types/payload.ts            # TS mirror of schemas.py contract
│       ├── store/viewState.ts          # Zustand store + localStorage persistence
│       ├── store/library.ts            # comparisons list cache + sync
│       ├── components/{Icon,Menu,buttons}.tsx
│       ├── screens/Library.tsx
│       ├── screens/UploadModal.tsx
│       ├── screens/Processing.tsx
│       ├── screens/Workspace.tsx
│       ├── features/header/Header.tsx
│       ├── features/transport/{Transport,Waveform,ControlRow,ABBlock}.tsx
│       ├── features/transport/draw.ts  # canvas drawing (ported from draw.js)
│       ├── features/panels/Workspace.tsx  # panel stack + add/reorder (empty in P0)
│       └── features/meters/MeterColumn.tsx # two empty meter slots
└── docs/… (specs + plans)
```

---

## Task 1: Monorepo + git + backend scaffold

**Files:**
- Create: `.gitignore`, `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/tests/__init__.py`

- [ ] **Step 1: Initialize git and ignore file**

Run from repo root:
```bash
cd /Users/vathsa/Documents/Projects/coheremix
git init
```
Create `.gitignore`:
```
# Python
__pycache__/
*.pyc
.venv/
backend/.venv/
backend/data/        # sqlite + storage at runtime
.pytest_cache/
# Node
frontend/node_modules/
frontend/dist/
# OS
.DS_Store
```

- [ ] **Step 2: Verify ffmpeg + uv are available**

Run:
```bash
ffmpeg -version | head -1 && ffprobe -version | head -1
uv --version
```
Expected: version strings print. If `uv` is missing: `curl -LsSf https://astral.sh/uv/install.sh | sh`. If ffmpeg missing: `brew install ffmpeg`.

- [ ] **Step 3: Create the backend project**

`backend/pyproject.toml`:
```toml
[project]
name = "coheremix-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy>=2.0",
    "pydantic>=2.9",
    "python-multipart>=0.0.12",
    "numpy>=2.1",
    "scipy>=1.14",
    "pyloudnorm>=0.1.1",
]

[dependency-groups]
dev = ["pytest>=8.3", "httpx>=0.27", "soundfile>=0.12"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.uv]
package = false
```

- [ ] **Step 4: Minimal FastAPI app with health route**

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="CohereMix")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```
Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

- [ ] **Step 5: Install and smoke-run**

Run:
```bash
cd backend && uv sync && uv run uvicorn app.main:app --port 8000 &
sleep 2 && curl -s localhost:8000/api/health && kill %1
```
Expected: `{"status":"ok"}`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/pyproject.toml backend/app backend/tests backend/uv.lock
git commit -m "chore: monorepo + backend scaffold with health endpoint"
```

---

## Task 2: Config module

**Files:**
- Create: `backend/app/config.py`

- [ ] **Step 1: Implement settings**

`backend/app/config.py`:
```python
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Settings(BaseModel):
    data_dir: Path = DATA_DIR
    db_url: str = f"sqlite:///{DATA_DIR / 'coheremix.db'}"
    storage_dir: Path = DATA_DIR / "storage"
    demo_dir: Path = Path(__file__).resolve().parent.parent / "demo"
    target_lufs: float = -14.0
    analysis_sample_rate: int = 48000
    max_upload_bytes: int = 100 * 1024 * 1024  # ~100 MB
    max_duration_s: float = 15 * 60            # 15 min
    ttl_hours: float = 24.0


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.storage_dir.mkdir(parents=True, exist_ok=True)
    return s
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && uv run python -c "from app.config import get_settings; print(get_settings().target_lufs)"`
Expected: `-14.0` and `backend/data/` is created.

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py && git commit -m "feat: backend settings"
```

---

## Task 3: Database engine, models & init

**Files:**
- Create: `backend/app/db/__init__.py`, `backend/app/db/base.py`, `backend/app/db/models.py`

- [ ] **Step 1: Engine/session/base**

`backend/app/db/base.py`:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    get_settings().db_url, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from app.db import models  # noqa: F401  (register tables)
    Base.metadata.create_all(engine)
```

- [ ] **Step 2: ORM models**

`backend/app/db/models.py` — `Comparison.view_state` and `Track.payload_meta` are JSON columns; heavy payload bytes live in the file store, not here.
```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    comparisons: Mapped[list[Comparison]] = relationship(back_populates="session")


class Comparison(Base):
    __tablename__ = "comparisons"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    name: Mapped[str] = mapped_column(String, default="Untitled comparison")
    state: Mapped[str] = mapped_column(String, default="processing")  # processing|ready|failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    view_state: Mapped[dict] = mapped_column(JSON, default=dict)
    session: Mapped[Session] = relationship(back_populates="comparisons")
    tracks: Mapped[list[Track]] = relationship(
        back_populates="comparison", cascade="all, delete-orphan"
    )
    jobs: Mapped[list[Job]] = relationship(
        back_populates="comparison", cascade="all, delete-orphan"
    )


class Track(Base):
    __tablename__ = "tracks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    comparison_id: Mapped[str] = mapped_column(ForeignKey("comparisons.id"))
    role: Mapped[str] = mapped_column(String)  # mix|reference
    name: Mapped[str] = mapped_column(String)
    upload_key: Mapped[str] = mapped_column(String)         # storage key of raw upload
    payload_key: Mapped[str | None] = mapped_column(String, nullable=True)
    file_info: Mapped[dict] = mapped_column(JSON, default=dict)
    gain_match: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String, default="pending")
    comparison: Mapped[Comparison] = relationship(back_populates="tracks")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    comparison_id: Mapped[str] = mapped_column(ForeignKey("comparisons.id"))
    state: Mapped[str] = mapped_column(String, default="queued")  # queued|running|done|failed|cancelled
    # stages: {role: {stage_name: "pending|running|done|failed"}}
    stages: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    comparison: Mapped[Comparison] = relationship(back_populates="jobs")
```
Create empty `backend/app/db/__init__.py`.

- [ ] **Step 3: Initialize DB on app startup**

Edit `backend/app/main.py` — add startup init:
```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db.base import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="CohereMix", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Smoke-verify tables create**

Run:
```bash
cd backend && uv run python -c "from app.db.base import init_db, engine; init_db(); from sqlalchemy import inspect; print(sorted(inspect(engine).get_table_names()))"
```
Expected: `['comparisons', 'jobs', 'sessions', 'tracks']`

- [ ] **Step 5: Commit**

```bash
git add backend/app/db backend/app/main.py && git commit -m "feat: db models + init"
```

---

## Task 4: Repository layer

**Files:**
- Create: `backend/app/db/repositories.py`

- [ ] **Step 1: Implement CRUD helpers**

`backend/app/db/repositories.py`:
```python
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.db.models import Comparison, Job, Session, Track


def get_or_create_session(db: OrmSession, session_id: str | None) -> Session:
    if session_id:
        s = db.get(Session, session_id)
        if s:
            return s
    s = Session()
    db.add(s)
    db.commit()
    return s


def create_comparison(
    db: OrmSession, session_id: str, name: str, tracks: list[dict]
) -> Comparison:
    comp = Comparison(session_id=session_id, name=name)
    for t in tracks:
        comp.tracks.append(Track(**t))
    job = Job(stages={t["role"]: {} for t in tracks})
    comp.jobs.append(job)
    db.add(comp)
    db.commit()
    return comp


def get_comparison(db: OrmSession, comp_id: str) -> Comparison | None:
    return db.get(Comparison, comp_id)


def list_comparisons(db: OrmSession, session_id: str) -> list[Comparison]:
    stmt = (
        select(Comparison)
        .where(Comparison.session_id == session_id)
        .order_by(Comparison.created_at.desc())
    )
    return list(db.scalars(stmt))


def update_view_state(db: OrmSession, comp: Comparison, view_state: dict) -> None:
    comp.view_state = view_state
    db.commit()


def rename_comparison(db: OrmSession, comp: Comparison, name: str) -> None:
    comp.name = name
    db.commit()


def delete_comparison(db: OrmSession, comp: Comparison) -> None:
    db.delete(comp)
    db.commit()


def latest_job(db: OrmSession, comp: Comparison) -> Job | None:
    return comp.jobs[-1] if comp.jobs else None
```

- [ ] **Step 2: Smoke-verify**

Run:
```bash
cd backend && uv run python -c "
from app.db.base import init_db, SessionLocal
init_db()
from app.db import repositories as r
db = SessionLocal()
s = r.get_or_create_session(db, None)
c = r.create_comparison(db, s.id, 'A vs B', [
  {'role':'mix','name':'m.wav','upload_key':'k1'},
  {'role':'reference','name':'r.wav','upload_key':'k2'}])
print('comp', c.id, 'tracks', len(c.tracks), 'job stages', c.jobs[0].stages)
print('list', len(r.list_comparisons(db, s.id)))
"
```
Expected: prints a comparison id, `tracks 2`, job stages with mix/reference keys, `list 1`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/repositories.py && git commit -m "feat: repository layer"
```

---

## Task 5: Storage interface + local disk

**Files:**
- Create: `backend/app/storage/__init__.py`, `backend/app/storage/base.py`, `backend/app/storage/local.py`

- [ ] **Step 1: Protocol**

`backend/app/storage/base.py`:
```python
from typing import Protocol


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def load(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...
```

- [ ] **Step 2: Local disk implementation**

`backend/app/storage/local.py`:
```python
from pathlib import Path

from app.config import get_settings


class LocalDiskStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or get_settings().storage_dir
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError("key escapes storage root")
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def save(self, key: str, data: bytes) -> None:
        self._path(key).write_bytes(data)

    def load(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


def get_storage() -> LocalDiskStorage:
    return LocalDiskStorage()
```
Create empty `backend/app/storage/__init__.py`.

- [ ] **Step 3: Smoke-verify round-trip**

Run:
```bash
cd backend && uv run python -c "
from app.storage.local import get_storage
s = get_storage(); s.save('t/x.bin', b'hi'); print(s.load('t/x.bin')); s.delete('t/x.bin'); print(s.exists('t/x.bin'))"
```
Expected: `b'hi'` then `False`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/storage && git commit -m "feat: storage interface + local disk"
```

---

## Task 6: Payload contract (pydantic schemas)

**Files:**
- Create: `backend/app/schemas.py`

This is the contract from spec §6 and `data.js`. The frontend `types/payload.ts` (Task 15) mirrors it exactly.

- [ ] **Step 1: Implement schemas**

`backend/app/schemas.py`:
```python
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
    # interleaved [min,max,min,max,...] per zoom level
    peaksByZoom: dict[str, list[float]]


class TrackPayload(BaseModel):
    track: str                 # "user" | "reference"
    role: str                  # "mix" | "reference"
    name: str
    fileInfo: FileInfo
    meta: Meta
    gainMatch: GainMatch
    hop: float = 0.1
    # Substrate-derived fields are filled in later phases; optional in P0.
    features: dict[str, list[float]] = {}
    ltas: dict | None = None
    liveSpec: list | None = None
    spectrogram: dict | None = None
    waveform: Waveform
    static: dict = {}


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


class JobStatus(BaseModel):
    id: str
    state: str
    progress: float
    stages: dict
    error: str | None = None
```

- [ ] **Step 2: Smoke-verify**

Run: `cd backend && uv run python -c "from app.schemas import ComparisonOut, TrackPayload; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py && git commit -m "feat: payload contract schemas"
```

---

## Task 7: Audio decode + resample (TESTED)

**Files:**
- Create: `backend/app/analysis/__init__.py`, `backend/app/analysis/decode.py`, `backend/tests/conftest.py`, `backend/tests/test_decode.py`

- [ ] **Step 1: Implement decode/probe**

`backend/app/analysis/decode.py` — `decode_to_48k` returns float32 array shape `(2, n)`; `probe` reads original file info; stereo enforced.
```python
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass

import numpy as np

TARGET_SR = 48000


class DecodeError(Exception):
    pass


@dataclass
class FileInfo:
    format: str
    sampleRate: int
    bitDepth: int | None
    channels: int
    size: int
    duration: float


def probe(path: str, size: int) -> FileInfo:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise DecodeError(f"ffprobe failed: {out.stderr.strip()}")
    info = json.loads(out.stdout)
    audio = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if audio is None:
        raise DecodeError("no audio stream")
    fmt = info["format"]
    bits = audio.get("bits_per_raw_sample") or audio.get("bits_per_sample")
    return FileInfo(
        format=(fmt.get("format_name", "?").split(",")[0]).upper(),
        sampleRate=int(audio.get("sample_rate", 0)),
        bitDepth=int(bits) if bits else None,
        channels=int(audio.get("channels", 0)),
        size=size,
        duration=float(fmt.get("duration", 0.0)),
    )


def decode_to_48k(path: str) -> np.ndarray:
    """Decode any supported file to float32 stereo PCM at 48 kHz, shape (2, n)."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path,
         "-ac", "2", "-ar", str(TARGET_SR), "-f", "f32le", "-"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise DecodeError(f"ffmpeg failed: {proc.stderr.decode().strip()}")
    interleaved = np.frombuffer(proc.stdout, dtype=np.float32)
    if interleaved.size == 0:
        raise DecodeError("empty decode")
    return interleaved.reshape(-1, 2).T.copy()  # (2, n)


def validate_stereo(info: FileInfo) -> None:
    if info.channels != 2:
        raise DecodeError(
            f"Stereo files only — got {info.channels} channel(s)."
        )
```
Create empty `backend/app/analysis/__init__.py`.

- [ ] **Step 2: Test fixtures (generated WAVs)**

`backend/tests/conftest.py`:
```python
import numpy as np
import pytest
import soundfile as sf


@pytest.fixture
def stereo_wav(tmp_path):
    sr, dur = 44100, 2.0
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    left = 0.5 * np.sin(2 * np.pi * 440 * t)
    right = 0.5 * np.sin(2 * np.pi * 445 * t)
    path = tmp_path / "stereo.wav"
    sf.write(path, np.stack([left, right], axis=1), sr, subtype="PCM_16")
    return str(path), path.stat().st_size


@pytest.fixture
def mono_wav(tmp_path):
    sr, dur = 44100, 1.0
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    path = tmp_path / "mono.wav"
    sf.write(path, 0.5 * np.sin(2 * np.pi * 440 * t), sr, subtype="PCM_16")
    return str(path), path.stat().st_size
```

- [ ] **Step 3: Tests**

`backend/tests/test_decode.py`:
```python
import numpy as np
import pytest

from app.analysis.decode import (
    DecodeError, decode_to_48k, probe, validate_stereo,
)


def test_probe_reads_stereo_44k(stereo_wav):
    path, size = stereo_wav
    info = probe(path, size)
    assert info.channels == 2
    assert info.sampleRate == 44100
    assert info.duration == pytest.approx(2.0, abs=0.05)
    assert info.size == size


def test_decode_resamples_to_48k_stereo(stereo_wav):
    path, _ = stereo_wav
    pcm = decode_to_48k(path)
    assert pcm.shape[0] == 2
    # 2.0 s at 48 kHz ≈ 96000 samples per channel
    assert pcm.shape[1] == pytest.approx(96000, rel=0.02)
    assert pcm.dtype == np.float32
    assert np.abs(pcm).max() <= 1.0


def test_validate_rejects_mono(mono_wav):
    path, size = mono_wav
    info = probe(path, size)
    with pytest.raises(DecodeError, match="Stereo"):
        validate_stereo(info)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_decode.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis/__init__.py backend/app/analysis/decode.py backend/tests/conftest.py backend/tests/test_decode.py
git commit -m "feat: ffmpeg decode/resample + stereo validation (tested)"
```

---

## Task 8: Integrated LUFS + gain-match (TESTED)

**Files:**
- Create: `backend/app/analysis/loudness.py`, `backend/tests/test_loudness.py`

- [ ] **Step 1: Implement gated integrated LUFS + gain-match**

`backend/app/analysis/loudness.py` — uses `pyloudnorm` for the K-weighting/gating (verified in tests), and computes the offset to the common target.
```python
from __future__ import annotations

import numpy as np
import pyloudnorm as pyln


def integrated_lufs(pcm: np.ndarray, sample_rate: int) -> float:
    """Gated integrated loudness (BS.1770-4) for stereo PCM shape (2, n)."""
    meter = pyln.Meter(sample_rate)  # BS.1770-4 with gating
    samples = pcm.T.astype(np.float64)  # (n, 2)
    return float(meter.integrated_loudness(samples))


def gain_match(integrated: float, target_lufs: float) -> float:
    """LU offset to bring this track to the common target."""
    return round(target_lufs - integrated, 2)
```

- [ ] **Step 2: Tests (cross-check + offset math)**

`backend/tests/test_loudness.py`:
```python
import numpy as np
import pyloudnorm as pyln

from app.analysis.loudness import gain_match, integrated_lufs


def _tone(sr=48000, dur=3.0, amp=0.5, freq=1000.0):
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    s = amp * np.sin(2 * np.pi * freq * t)
    return np.stack([s, s], axis=0)  # (2, n)


def test_integrated_matches_pyloudnorm_reference():
    sr = 48000
    pcm = _tone(sr=sr)
    ours = integrated_lufs(pcm, sr)
    ref = pyln.Meter(sr).integrated_loudness(pcm.T.astype(np.float64))
    assert abs(ours - ref) < 1e-6


def test_louder_signal_reads_higher():
    sr = 48000
    quiet = integrated_lufs(_tone(amp=0.1), sr)
    loud = integrated_lufs(_tone(amp=0.5), sr)
    assert loud > quiet
    # +14 dB amplitude (×5) ≈ +14 LU
    assert abs((loud - quiet) - 13.98) < 0.5


def test_gain_match_offset_to_target():
    # a -9.2 LUFS master needs -4.8 LU to hit -14
    assert gain_match(-9.2, -14.0) == -4.8
    assert gain_match(-20.0, -14.0) == 6.0
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest tests/test_loudness.py -v`
Expected: 3 passed.

> Note for later phases: the region-scoped integrated LUFS and the two-pass gate detail (spec §5) are implemented in Phase 1 on top of the K-power substrate; P0 only needs whole-file integrated for the gain-match offset.

- [ ] **Step 4: Commit**

```bash
git add backend/app/analysis/loudness.py backend/tests/test_loudness.py
git commit -m "feat: integrated LUFS + gain-match offset (tested)"
```

---

## Task 9: Multi-resolution waveform peaks (TESTED)

**Files:**
- Create: `backend/app/analysis/waveform.py`, `backend/tests/test_waveform.py`

- [ ] **Step 1: Implement peaks**

`backend/app/analysis/waveform.py` — downmix to mono envelope, bucket into N columns, store interleaved [min,max] per zoom.
```python
from __future__ import annotations

import numpy as np

ZOOMS = {"z256": 256, "z512": 512, "z1024": 1024, "z2048": 2048, "z4096": 4096}


def build_peaks(pcm: np.ndarray, counts: dict[str, int] = ZOOMS) -> dict[str, list[float]]:
    """Return {zoom: [min0,max0,min1,max1,...]} from stereo PCM (2, n)."""
    mono = pcm.mean(axis=0)
    out: dict[str, list[float]] = {}
    for name, count in counts.items():
        # split into `count` near-equal buckets
        idx = np.linspace(0, mono.size, count + 1).astype(int)
        peaks = np.empty(count * 2, dtype=np.float32)
        for i in range(count):
            seg = mono[idx[i]:idx[i + 1]]
            if seg.size == 0:
                peaks[i * 2] = 0.0
                peaks[i * 2 + 1] = 0.0
            else:
                peaks[i * 2] = float(seg.min())
                peaks[i * 2 + 1] = float(seg.max())
        out[name] = peaks.tolist()
    return out
```

- [ ] **Step 2: Tests**

`backend/tests/test_waveform.py`:
```python
import numpy as np

from app.analysis.waveform import build_peaks


def test_peaks_shape_and_range():
    sr = 48000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    s = 0.8 * np.sin(2 * np.pi * 100 * t)
    pcm = np.stack([s, s], axis=0)
    peaks = build_peaks(pcm, {"z256": 256, "z512": 512, "z1024": 1024, "z2048": 2048, "z4096": 4096})
    assert len(peaks["z4096"]) == 4096 * 2
    assert len(peaks["z256"]) == 256 * 2
    arr = np.array(peaks["z4096"])
    mins, maxs = arr[0::2], arr[1::2]
    assert (mins <= maxs).all()
    assert maxs.max() <= 1.0 and mins.min() >= -1.0
    assert maxs.max() > 0.5  # captured the amplitude


def test_silence_is_flat():
    pcm = np.zeros((2, 48000), dtype=np.float32)
    peaks = build_peaks(pcm, {"z256": 256})
    assert all(abs(v) < 1e-6 for v in peaks["z256"])
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest tests/test_waveform.py -v`
Expected: 2 passed. Then run the full suite: `uv run pytest -v` → 8 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/app/analysis/waveform.py backend/tests/test_waveform.py
git commit -m "feat: multi-resolution waveform peaks (tested)"
```

---

## Task 10: Analysis pipeline + JobRunner

**Files:**
- Create: `backend/app/jobs/__init__.py`, `backend/app/jobs/base.py`, `backend/app/jobs/inprocess.py`, `backend/app/analysis/pipeline.py`

P0 stages per track: `decode`, `gainmatch`, `waveform`. Later substrate stages are reported as `pending` (added in P1–P3). No automated test — smoke-verified via the API in Task 11.

- [ ] **Step 1: JobRunner protocol**

`backend/app/jobs/base.py`:
```python
from typing import Callable, Protocol


class JobRunner(Protocol):
    def submit(self, fn: Callable[[], None]) -> None: ...
```

- [ ] **Step 2: In-process runner**

`backend/app/jobs/inprocess.py` — runs work on a thread pool so the request returns immediately and the SQLite write happens off the event loop.
```python
from concurrent.futures import ThreadPoolExecutor
from typing import Callable


class InProcessJobRunner:
    def __init__(self, max_workers: int = 2) -> None:
        self._pool = ThreadPoolExecutor(max_workers=max_workers)

    def submit(self, fn: Callable[[], None]) -> None:
        self._pool.submit(fn)


_runner = InProcessJobRunner()


def get_runner() -> InProcessJobRunner:
    return _runner
```
Create empty `backend/app/jobs/__init__.py`.

- [ ] **Step 3: Pipeline**

`backend/app/analysis/pipeline.py`:
```python
from __future__ import annotations

import struct

from app.analysis import decode, loudness, waveform
from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison, Job, Track
from app.storage.local import get_storage

# Stages computed in Phase 0. Later phases append to this list.
P0_STAGES = ["decode", "gainmatch", "waveform"]
ALL_STAGES = P0_STAGES + ["stft", "spatial", "aggregates"]  # later phases fill these


def _set_stage(db, job: Job, role: str, stage: str, status: str) -> None:
    stages = dict(job.stages)
    role_stages = dict(stages.get(role, {}))
    role_stages[stage] = status
    stages[role] = role_stages
    job.stages = stages
    done = sum(1 for r in stages.values() for v in r.values() if v == "done")
    total = len(stages) * len(ALL_STAGES)
    job.progress = round(done / total, 3) if total else 0.0
    db.commit()


def _pack_payload(track: Track, fileinfo, meta_dur, integrated, offset, peaks) -> bytes:
    import json
    payload = {
        "track": "user" if track.role == "mix" else "reference",
        "role": track.role,
        "name": track.name,
        "fileInfo": fileinfo.__dict__,
        "meta": {"sampleRate": get_settings().analysis_sample_rate,
                 "duration": meta_dur, "channels": 2},
        "gainMatch": {"integratedLUFS": round(integrated, 2), "offsetToCommon": offset},
        "hop": 0.1,
        "features": {}, "ltas": None, "liveSpec": None, "spectrogram": None,
        "waveform": {"peaksByZoom": peaks},
        "static": {},
    }
    return json.dumps(payload).encode()


def run_analysis(comp_id: str) -> None:
    db = SessionLocal()
    settings = get_settings()
    storage = get_storage()
    comp: Comparison = db.get(Comparison, comp_id)
    job: Job = comp.jobs[-1]
    job.state = "running"
    # init all stages pending
    for tr in comp.tracks:
        for st in ALL_STAGES:
            _set_stage(db, job, tr.role, st, "pending")
    try:
        durations = []
        for tr in comp.tracks:
            raw_path = settings.storage_dir / tr.upload_key
            # decode
            _set_stage(db, job, tr.role, "decode", "running")
            info = decode.probe(str(raw_path), raw_path.stat().st_size)
            decode.validate_stereo(info)
            pcm = decode.decode_to_48k(str(raw_path))
            dur = pcm.shape[1] / settings.analysis_sample_rate
            durations.append(dur)
            tr.file_info = info.__dict__
            tr.state = "decoded"
            _set_stage(db, job, tr.role, "decode", "done")
            # gainmatch
            _set_stage(db, job, tr.role, "gainmatch", "running")
            integ = loudness.integrated_lufs(pcm, settings.analysis_sample_rate)
            offset = loudness.gain_match(integ, settings.target_lufs)
            tr.gain_match = {"integratedLUFS": round(integ, 2), "offsetToCommon": offset}
            _set_stage(db, job, tr.role, "gainmatch", "done")
            # waveform
            _set_stage(db, job, tr.role, "waveform", "running")
            peaks = waveform.build_peaks(pcm)
            payload = _pack_payload(tr, info, dur, integ, offset, peaks)
            key = f"payloads/{comp.id}/{tr.role}.json"
            storage.save(key, payload)
            tr.payload_key = key
            _set_stage(db, job, tr.role, "waveform", "done")
            db.commit()
        # comparison defaults
        vs = dict(comp.view_state)
        vs.setdefault("duration", max(durations) if durations else 0.0)
        comp.view_state = vs
        comp.state = "ready"
        job.state = "done"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        comp.state = "failed"
        job.state = "failed"
        job.error = str(exc)
        db.commit()
    finally:
        db.close()
```

- [ ] **Step 4: Smoke-verify the pipeline end-to-end (no server)**

Run (uses the demo files added in Task 16; until then, point at any two stereo wavs):
```bash
cd backend && uv run python -c "
from app.db.base import init_db, SessionLocal; init_db()
from app.storage.local import get_storage
from app.db import repositories as r
from app.analysis.pipeline import run_analysis
import shutil, pathlib
db = SessionLocal(); st = get_storage()
src='tests/_smoke_a.wav'  # create two small stereo wavs first, or copy demo/*
" || echo "smoke deferred to Task 11 (API)"
```
Expected: this is fully exercised via the API in Task 11; mark done once Task 11 passes.

- [ ] **Step 5: Commit**

```bash
git add backend/app/jobs backend/app/analysis/pipeline.py
git commit -m "feat: in-process job runner + P0 analysis pipeline"
```

---

## Task 11: API routes (comparisons, upload, jobs)

**Files:**
- Create: `backend/app/api/__init__.py`, `backend/app/api/comparisons.py`, `backend/app/api/jobs.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: DB dependency + session cookie helper**

Add to `backend/app/api/__init__.py`:
```python
from app.db.base import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Comparison + upload routes**

`backend/app/api/comparisons.py`:
```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session as OrmSession

from app.analysis.pipeline import run_analysis
from app.api import get_db
from app.config import get_settings
from app.db import repositories as repo
from app.jobs.inprocess import get_runner
from app.storage.local import get_storage

router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])


def _comp_out(comp) -> dict:
    return {
        "id": comp.id,
        "name": comp.name,
        "state": comp.state,
        "createdAt": comp.created_at.isoformat(),
        "viewState": comp.view_state or {},
        "tracks": [
            {"role": t.role, "name": t.name, "fileInfo": t.file_info,
             "gainMatch": t.gain_match or None, "state": t.state}
            for t in sorted(comp.tracks, key=lambda t: t.role != "mix")
        ],
    }


@router.post("")
async def create_comparison(
    response: Response,
    mix: UploadFile = File(...),
    reference: UploadFile = File(...),
    name: str | None = Form(None),
    session_id: str | None = Cookie(None),
    db: OrmSession = Depends(get_db),
):
    settings = get_settings()
    storage = get_storage()
    sess = repo.get_or_create_session(db, session_id)
    response.set_cookie("session_id", sess.id, httponly=True, samesite="lax")

    tracks = []
    for role, up in (("mix", mix), ("reference", reference)):
        data = await up.read()
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(413, f"{role} file too large")
        key = f"uploads/{uuid.uuid4().hex}-{up.filename}"
        storage.save(key, data)
        tracks.append({"role": role, "name": up.filename, "upload_key": key})

    comp_name = name or f"{mix.filename} vs {reference.filename}"
    comp = repo.create_comparison(db, sess.id, comp_name, tracks)
    comp_id = comp.id
    get_runner().submit(lambda: run_analysis(comp_id))
    return {"id": comp_id, "jobId": comp.jobs[-1].id}


@router.get("")
def list_comparisons(session_id: str | None = Cookie(None), db: OrmSession = Depends(get_db)):
    if not session_id:
        return []
    return [_comp_out(c) for c in repo.list_comparisons(db, session_id)]


@router.get("/{comp_id}")
def get_comparison(comp_id: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    return _comp_out(comp)


@router.get("/{comp_id}/tracks/{role}/payload")
def get_payload(comp_id: str, role: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    track = next((t for t in comp.tracks if t.role == role), None)
    if not track or not track.payload_key:
        raise HTTPException(404, "payload not ready")
    data = get_storage().load(track.payload_key)
    return Response(content=data, media_type="application/json")


@router.patch("/{comp_id}")
def patch_comparison(comp_id: str, body: dict, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    if "name" in body:
        repo.rename_comparison(db, comp, body["name"])
    if "viewState" in body:
        repo.update_view_state(db, comp, body["viewState"])
    return _comp_out(comp)


@router.post("/{comp_id}/swap")
def swap_roles(comp_id: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    for t in comp.tracks:
        t.role = "reference" if t.role == "mix" else "mix"
    vs = dict(comp.view_state)
    if "offsetB" in vs:
        vs["offsetB"] = -vs["offsetB"]
    comp.view_state = vs
    db.commit()
    return _comp_out(comp)


@router.delete("/{comp_id}")
def delete_comparison(comp_id: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if comp:
        repo.delete_comparison(db, comp)
    return {"ok": True}
```

- [ ] **Step 3: Job status route**

`backend/app/api/jobs.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from app.api import get_db
from app.db.models import Job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str, db: OrmSession = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404)
    return {"id": job.id, "state": job.state, "progress": job.progress,
            "stages": job.stages, "error": job.error}
```

- [ ] **Step 4: Mount routers**

Edit `backend/app/main.py` to include routers (after `app = FastAPI(...)`):
```python
from app.api import comparisons, jobs

app.include_router(comparisons.router)
app.include_router(jobs.router)
```

- [ ] **Step 5: Smoke-verify the full flow**

Run (create two short stereo wavs, upload, poll, fetch payload):
```bash
cd backend
uv run python -c "
import numpy as np, soundfile as sf
for f,fr in [('a.wav',440),('b.wav',330)]:
    t=np.linspace(0,3,44100*3,endpoint=False)
    s=0.4*np.sin(2*np.pi*fr*t); sf.write(f, np.stack([s,s],1), 44100)"
uv run uvicorn app.main:app --port 8000 & sleep 2
CID=$(curl -s -c jar -F mix=@a.wav -F reference=@b.wav localhost:8000/api/comparisons | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
sleep 3
curl -s -b jar localhost:8000/api/comparisons/$CID | python3 -m json.tool | head -30
curl -s localhost:8000/api/comparisons/$CID/tracks/mix/payload | python3 -c "import sys,json;d=json.load(sys.stdin);print('peaks hi len', len(d['waveform']['peaksByZoom']['hi']), 'gain', d['gainMatch'])"
kill %1; rm -f a.wav b.wav jar
```
Expected: comparison JSON with `state: ready`, two tracks with `fileInfo`/`gainMatch`; payload prints `peaks hi len 4800` and a gainMatch dict.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api backend/app/main.py
git commit -m "feat: comparison/upload/job API routes"
```

---

## Task 12: TTL sweeper + serve built SPA

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/app/cleanup.py`

- [ ] **Step 1: Sweeper**

`backend/app/cleanup.py` — deletes comparisons + their storage older than TTL.
```python
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison
from app.storage.local import get_storage


def sweep_expired() -> int:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.ttl_hours)
    db = SessionLocal()
    storage = get_storage()
    removed = 0
    try:
        for comp in db.query(Comparison).filter(Comparison.created_at < cutoff):
            for t in comp.tracks:
                storage.delete(t.upload_key)
                if t.payload_key:
                    storage.delete(t.payload_key)
            db.delete(comp)
            removed += 1
        db.commit()
    finally:
        db.close()
    return removed
```

- [ ] **Step 2: Run sweeper on startup + serve SPA**

Edit `backend/app/main.py` — call `sweep_expired()` in lifespan, and mount static files **after** API routers (so `/api/*` wins). The SPA fallback serves `index.html` for client routes like `/c/:id`.
```python
from pathlib import Path

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.cleanup import sweep_expired

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# inside lifespan, after init_db():
#     sweep_expired()

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        candidate = DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
```

- [ ] **Step 3: Smoke-verify sweeper logic**

Run: `cd backend && uv run python -c "from app.cleanup import sweep_expired; print('removed', sweep_expired())"`
Expected: `removed 0` (nothing older than 24h yet).

- [ ] **Step 4: Commit**

```bash
git add backend/app/cleanup.py backend/app/main.py
git commit -m "feat: TTL sweeper + SPA static serving"
```

---

## Task 13: Frontend scaffold + design tokens

**Files:**
- Create: `frontend/` (Vite project), `frontend/src/styles/tokens.css`, `frontend/tailwind.config.ts`, `frontend/vite.config.ts`, `frontend/index.html`

No tests for any frontend task — verify visually in the browser.

- [ ] **Step 1: Scaffold Vite + React + TS**

Run:
```bash
cd /Users/vathsa/Documents/Projects/coheremix
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install zustand react-router-dom
npm install -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Port design tokens**

Copy the entire `:root { … }` block (and the `:root[data-bg=…]`, `[data-accent=…]`, `[data-density=…]` variants, base `html/body`, `.scroll-y`, `.mono`, `::selection`) from `design_handoff_coheremix/source/styles.css` into `frontend/src/styles/tokens.css`. This is the authoritative token source — copy values verbatim (surfaces `#13110e`/`#1c1813`/…, identity `--a #f2a93b` / `--b #3fcfe0`, geometry `--header-h 60px` / `--gutter 64px` / `--main-split 80%`, `--mono "JetBrains Mono"…`).

- [ ] **Step 3: index.html loads JetBrains Mono**

Edit `frontend/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: Tailwind config maps tokens → utilities**

`frontend/tailwind.config.ts` (so we can use both raw CSS classes ported from the handoff and Tailwind utilities backed by the same vars):
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)", "surface-3": "var(--surface-3)",
        line: "var(--line)", "line-strong": "var(--line-strong)",
        "tx-1": "var(--tx-1)", "tx-2": "var(--tx-2)", "tx-3": "var(--tx-3)",
        a: "var(--a)", b: "var(--b)", warn: "var(--warn)", good: "var(--good)",
      },
      fontFamily: { mono: "var(--mono)".split(",") as unknown as string[] },
    },
  },
  plugins: [],
} satisfies Config;
```
Ensure `frontend/src/main.tsx` imports `./styles/tokens.css` and the Tailwind entry CSS (with `@tailwind base/components/utilities`).

- [ ] **Step 5: Dev proxy to backend**

`frontend/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  build: { outDir: "dist" },
});
```

- [ ] **Step 6: Verify dev server boots**

Run: `cd frontend && npm run dev` → open the printed URL. Expected: blank dark page using `--bg` background (set `body { background: var(--bg) }` is in tokens.css). Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat: frontend scaffold + design tokens"
```

---

## Task 14: Payload types + API client

**Files:**
- Create: `frontend/src/types/payload.ts`, `frontend/src/api/client.ts`

- [ ] **Step 1: TS mirror of the contract**

`frontend/src/types/payload.ts` — mirror `backend/app/schemas.py` exactly:
```ts
export interface FileInfo {
  format: string; sampleRate: number; bitDepth: number | null;
  channels: number; size: number; duration: number;
}
export interface GainMatch { integratedLUFS: number; offsetToCommon: number; }
export interface TrackSummary {
  role: "mix" | "reference"; name: string; fileInfo: FileInfo;
  gainMatch: GainMatch | null; state: string;
}
export interface TrackPayload {
  track: "user" | "reference"; role: "mix" | "reference"; name: string;
  fileInfo: FileInfo; meta: { sampleRate: number; duration: number; channels: number };
  gainMatch: GainMatch; hop: number;
  features: Record<string, number[]>;
  ltas: unknown | null; liveSpec: unknown | null; spectrogram: unknown | null;
  waveform: { peaksByZoom: Record<string, number[]> };
  static: Record<string, number>;
}
export interface ComparisonOut {
  id: string; name: string; state: "processing" | "ready" | "failed";
  createdAt: string; viewState: Record<string, unknown>; tracks: TrackSummary[];
}
export interface JobStatus {
  id: string; state: string; progress: number;
  stages: Record<string, Record<string, string>>; error: string | null;
}
```

- [ ] **Step 2: API client**

`frontend/src/api/client.ts`:
```ts
import type { ComparisonOut, JobStatus, TrackPayload } from "../types/payload";

const json = (r: Response) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

export const api = {
  list: (): Promise<ComparisonOut[]> =>
    fetch("/api/comparisons", { credentials: "include" }).then(json),
  get: (id: string): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}`, { credentials: "include" }).then(json),
  payload: (id: string, role: string): Promise<TrackPayload> =>
    fetch(`/api/comparisons/${id}/tracks/${role}/payload`, { credentials: "include" }).then(json),
  job: (id: string): Promise<JobStatus> =>
    fetch(`/api/jobs/${id}`, { credentials: "include" }).then(json),
  create: (mix: File, reference: File, name?: string): Promise<{ id: string; jobId: string }> => {
    const fd = new FormData();
    fd.append("mix", mix); fd.append("reference", reference);
    if (name) fd.append("name", name);
    return fetch("/api/comparisons", { method: "POST", body: fd, credentials: "include" }).then(json);
  },
  patch: (id: string, body: Record<string, unknown>): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(json),
  swap: (id: string): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}/swap`, { method: "POST", credentials: "include" }).then(json),
  remove: (id: string): Promise<void> =>
    fetch(`/api/comparisons/${id}`, { method: "DELETE", credentials: "include" }).then(() => undefined),
};
```

- [ ] **Step 3: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types frontend/src/api
git commit -m "feat: payload types + api client"
```

---

## Task 15: viewState store with local-first persistence

**Files:**
- Create: `frontend/src/store/viewState.ts`

- [ ] **Step 1: Implement the Zustand store**

`frontend/src/store/viewState.ts` — the single source of truth (spec §5.4). Local-first: hydrate from localStorage, write-through on change, debounced sync to DB.
```ts
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
  secPerPx: 0.062, scroll: 0, offsetB: 0, linked: false, playhead: 0,
  regionA: null, loop: { enabled: false }, ab: "A", matchMode: "integrated",
  viewMode: "overlaid", target: -14, momentary: false, duration: 0,
  panels: ["shortTermLufs", "ltas", "tiles"], meterSlots: ["lufs", "truepeak"],
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
      localStorage.setItem(lsKey(comparisonId), JSON.stringify(vs));     // write-through
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {                                      // debounced DB sync
        api.patch(comparisonId, { viewState: vs }).catch(() => {});
      }, 800);
    }
  },
  hydrate: (id, fromDb) => {
    const cached = localStorage.getItem(lsKey(id));                      // local-first read
    const base = cached ? JSON.parse(cached) : (fromDb ?? {});
    set({ ...DEFAULT, ...base, comparisonId: id });
  },
}));
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store
git commit -m "feat: viewState store with local-first persistence"
```

---

## Task 16: Base UI primitives + demo files

**Files:**
- Create: `frontend/src/components/Icon.tsx`, `frontend/src/components/Menu.tsx`, `frontend/src/components/buttons.tsx`
- Create: `backend/demo/mix_demo.wav`, `backend/demo/reference_demo.wav`

- [ ] **Step 1: Icon set**

Port the inline SVGs from `design_handoff_coheremix/source/ui.jsx` (`Icon`) and `states.jsx` into `Icon.tsx` as a `<Icon name="play|pause|loop|plus|x|chevron|swap|up|down|help|settings|upload|spinner|zoomIn|zoomOut" />` component. Keep stroke ~1.4–1.8, size 13–16px, `currentColor`.

- [ ] **Step 2: Portal Menu**

Port `design_handoff_coheremix/source/ui.jsx` → `Menu` into `Menu.tsx`: a dropdown rendered via `createPortal` to `document.body`, `position: fixed`, anchored to a trigger ref, flips upward when <250px below, closes on outside-click / scroll / resize. Use the `.menu`, `.menu-item`, `.menu-label`, `.menu-sep` classes from tokens.css.

- [ ] **Step 3: Buttons**

`buttons.tsx` — thin wrappers emitting the handoff classes: `IconButton` (`.icon-btn`), `Tbtn` (`.tbtn`, supports `on`), `PrimaryButton` (`.btn-primary`), `GhostButton` (`.btn-ghost`).

- [ ] **Step 4: Generate demo tracks**

Run (creates two distinct stereo tracks for "Use demo files"):
```bash
cd backend && uv run python -c "
import numpy as np, soundfile as sf, pathlib
pathlib.Path('demo').mkdir(exist_ok=True)
def track(path, base, dur):
    sr=44100; t=np.linspace(0,dur,int(sr*dur),endpoint=False)
    sig=0.3*np.sin(2*np.pi*base*t)+0.2*np.sin(2*np.pi*base*2*t)
    env=0.5+0.5*np.sin(2*np.pi*0.2*t)
    l=sig*env; r=sig*env*0.95
    sf.write(path, np.stack([l,r],1), sr, subtype='PCM_24')
track('demo/mix_demo.wav', 110, 12.0)
track('demo/reference_demo.wav', 110, 10.0)
print('demo files written')"
```
Add a backend route in `comparisons.py` to expose demo files for the frontend to fetch as `File`s:
```python
@router.get("/demo/{which}")
def demo_file(which: str):
    from fastapi.responses import FileResponse
    p = get_settings().demo_dir / ("mix_demo.wav" if which == "mix" else "reference_demo.wav")
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="audio/wav", filename=p.name)
```

- [ ] **Step 5: Verify type-check + demo route**

Run: `cd frontend && npx tsc --noEmit` (no errors). Then `cd backend && uv run uvicorn app.main:app --port 8000 & sleep 2 && curl -s -o /tmp/d.wav -w "%{http_code}\n" localhost:8000/api/comparisons/demo/mix && kill %1` → `200`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components backend/demo backend/app/api/comparisons.py
git commit -m "feat: UI primitives + bundled demo files"
```

---

## Task 17: Router + screen skeletons

**Files:**
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/screens/{Library,Workspace}.tsx` (stubs)

- [ ] **Step 1: Router**

`frontend/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./styles/tokens.css";
import "./index.css"; // @tailwind directives
import { Library } from "./screens/Library";
import { Workspace } from "./screens/Workspace";

const router = createBrowserRouter([
  { path: "/", element: <Library /> },
  { path: "/c/:id", element: <Workspace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);
```

- [ ] **Step 2: Stub screens**

`Library.tsx`: `export function Library() { return <div className="mono" style={{padding:24}}>Library</div>; }`
`Workspace.tsx`: same with "Workspace".

- [ ] **Step 3: Verify routing**

Run `npm run dev`; visit `/` and `/c/test` → see the two stubs. (Direct nav to `/c/test` works in dev; in prod the SPA fallback from Task 12 handles it.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.tsx frontend/src/screens
git commit -m "feat: router + screen skeletons"
```

---

## Task 18: Library screen

**Files:**
- Modify: `frontend/src/screens/Library.tsx`
- Create: `frontend/src/store/library.ts`

- [ ] **Step 1: Library cache store**

`frontend/src/store/library.ts` — local-first list: read cached list from localStorage immediately, then refresh from API and reconcile.
```ts
import { create } from "zustand";
import { api } from "../api/client";
import type { ComparisonOut } from "../types/payload";

const LS = "coheremix:library";

interface LibStore {
  items: ComparisonOut[];
  loading: boolean;
  load: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
}

export const useLibrary = create<LibStore>((set, get) => ({
  items: JSON.parse(localStorage.getItem(LS) ?? "[]"),
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const items = await api.list();
      localStorage.setItem(LS, JSON.stringify(items));
      set({ items });
    } finally {
      set({ loading: false });
    }
  },
  remove: async (id) => {
    await api.remove(id);
    set({ items: get().items.filter((c) => c.id !== id) });
  },
  rename: async (id, name) => {
    await api.patch(id, { name });
    set({ items: get().items.map((c) => (c.id === id ? { ...c, name } : c)) });
  },
}));
```

- [ ] **Step 2: Library UI**

`Library.tsx` — grid of comparison cards (name inline-editable, two track names, date, open/rename/delete/duplicate). Empty state → big "New comparison" CTA. Renders `UploadModal` (Task 19) when "New comparison" is clicked. Use tokens classes; cards on `--surface-1` with `--line` borders, amber/cyan dots for the two tracks. On mount call `useLibrary().load()`. Failed comparisons render with a `--warn` tag. **No analyzing state** (per spec — a comparison only lands here ready or failed; in-flight ones live behind the Processing modal during creation).

- [ ] **Step 3: Verify**

Run backend + `npm run dev`. With an empty DB → empty state shows. (Cards verified after Task 19 creates one.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/library.ts frontend/src/screens/Library.tsx
git commit -m "feat: comparisons library screen"
```

---

## Task 19: Upload modal

**Files:**
- Create: `frontend/src/screens/UploadModal.tsx`

- [ ] **Step 1: Build the modal**

Port `design_handoff_coheremix/source/states.jsx` → `UploadModal`. Two side-by-side drop slots (A·Your mix amber, B·Reference cyan). Each: `DropZone` (dashed, drag-over highlight using `.dz.a`/`.dz.over`) → `FileCard` on fill (editable name, "Decoded — ready" badge once validated, spec grid format/duration/sampleRate/bitDepth/channels/size, remove ✕). Footer: **Analyze** (`.btn-primary`, disabled until both valid), hint line, and **Use demo files** link.

- [ ] **Step 2: Client-side validation incl. stereo**

On file drop, validate before enabling Analyze:
```ts
const ACCEPT = ["audio/wav", "audio/x-wav", "audio/aiff", "audio/flac", "audio/mpeg"];
async function probeFile(file: File) {
  if (file.size > 100 * 1024 * 1024) throw new Error("File too large (max 100 MB)");
  const buf = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  if (decoded.numberOfChannels !== 2) throw new Error("Stereo files only");
  return {
    format: (file.name.split(".").pop() ?? "?").toUpperCase(),
    sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels,
    duration: decoded.duration, size: file.size, bitDepth: null,
  };
}
```
Show inline per-slot errors (unsupported/too large/decode fail/not stereo). The backend re-validates authoritatively (Task 7); this is the early UX beat.

- [ ] **Step 3: Analyze + demo wiring**

- **Analyze** → `api.create(mixFile, refFile, name)` → navigate to `/c/:id` and open the Processing modal (Task 20) with the returned `jobId`.
- **Use demo files** → fetch `/api/comparisons/demo/mix` and `/api/comparisons/demo/reference` as blobs, wrap in `File`, run them through the same slots.

- [ ] **Step 4: Verify**

Run full stack. From Library → New comparison → drop two stereo files (or Use demo files) → Analyze. Confirm a mono file is rejected inline. Confirm navigation to `/c/:id`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/UploadModal.tsx
git commit -m "feat: upload modal with stereo validation + demo files"
```

---

## Task 20: Processing screen

**Files:**
- Create: `frontend/src/screens/Processing.tsx`

- [ ] **Step 1: Build the processing modal**

Port `design_handoff_coheremix/source/states.jsx` → `ProcessingScreen`. Two `ProcTrack` rows (A amber-top, B cyan-top). **Stages are driven by the backend job's `stages` map** (not hardcoded) — render each stage with a dot: `pending` (outline), `running` (spinner + `--b` ring), `done` (✓ `--good`). Per-track progress bar from the count of done stages. Friendly stage labels: `decode→Decode, gainmatch→Gain-match, waveform→Waveform, stft→Frequency, spatial→Stereo, aggregates→Aggregates`.

- [ ] **Step 2: Poll the job**

```ts
useEffect(() => {
  const t = setInterval(async () => {
    const job = await api.job(jobId);
    setJob(job);
    if (job.state === "done") { clearInterval(t); onDone(); }
    if (job.state === "failed") { clearInterval(t); setError(job.error); }
  }, 600);
  return () => clearInterval(t);
}, [jobId]);
```
On done → close modal, reveal the workspace + show the alignment coachmark (Task 23 adds the coachmark element). Cancel → navigate back to `/` (and best-effort `api.remove`).

- [ ] **Step 3: Verify**

Create a comparison → watch the two tracks step through Decode → Gain-match → Waveform with the later stages shown pending, then transition into the workspace.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/Processing.tsx
git commit -m "feat: processing screen with per-stage progress"
```

---

## Task 21: App shell + header

**Files:**
- Modify: `frontend/src/screens/Workspace.tsx`
- Create: `frontend/src/features/header/Header.tsx`

- [ ] **Step 1: Shell layout**

`Workspace.tsx` — the `.app` grid (`60px 1fr` rows). On mount: `api.get(id)` → `useViewState.hydrate(id, comp.viewState)`; fetch both track payloads (`api.payload(id,'mix'|'reference')`) into local component state. Renders `<Header/>`, the `.main` grid (`minmax(0,1fr) clamp(252px,20%,360px)`), the `.left-col` (`minmax(268px,40%) 1fr`) holding `<Transport/>` (Task 22–23) above `<PanelWorkspace/>` (Task 24), and `<MeterColumn/>` (Task 24) on the right. While loading show the canonical loading state; on `state==="failed"` show an error with a re-upload affordance.

- [ ] **Step 2: Header**

Port `design_handoff_coheremix/source/app.jsx` → `App` header + `HeaderChip`. Left: brand mark (CSS amber/cyan split) + "CohereMix". Then `.hdr-readouts`: offset-B pill (value in `--b`, reads `offsetB` from store) + ΔLUFS A−B pill (computed `mixGain.integratedLUFS − refGain.integratedLUFS`, in `--tx-1`). Flexible spacer. Then chips: HeaderChip A + swap button (⇄ → `api.swap(id)` then re-hydrate, negate handled server-side) + HeaderChip B. Far right: Help and Settings `icon-btn`s opening portal `Menu`s (Help = keyboard shortcuts list; Settings = theme/target/momentary + "New comparison" link to `/`). Clicking a chip routes to `/` opening the upload modal for replacement (full replace flow is refined in a later phase; P0 just reopens upload).

- [ ] **Step 3: Verify**

Open a ready comparison → header shows brand, both pills with real numbers, both file chips with name + "WAV · 48 kHz · …" info, swap flips A/B colors and negates the offset pill.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/Workspace.tsx frontend/src/features/header
git commit -m "feat: app shell + header"
```

---

## Task 22: Transport — dual waveform rendering

**Files:**
- Create: `frontend/src/features/transport/waveform.regl.ts`, `frontend/src/features/transport/Waveform.tsx`

Install regl: `npm install regl` and `npm install -D @types/regl`.

- [ ] **Step 1: regl waveform renderer**

`waveform.regl.ts` — initialise a regl context on the canvas element. Upload each zoom level's peak array as a 1D texture (`R = min, G = max`, `float` type). On each draw call:
1. Pick the zoom level (`z256`…`z4096`) whose column count is closest to canvas pixel width — this ensures ~1 data point per pixel at any zoom level, always crisp.
2. Issue a regl draw call with uniforms: `scroll`, `secPerPx`, `duration`, `color`, `offsetPx` (B lane). Vertex shader positions each column bar using the texture sample; fragment shader fills with track color at ~0.5 alpha plus a brighter midline. DPR-aware via `devicePixelRatio`.

Export `createWaveformRenderer(canvas) → { draw(params), destroy() }`.

- [ ] **Step 2: Waveform component**

`Waveform.tsx` — a `<canvas>` filling its lane. On mount: create the regl renderer. Sizes to the element via `ResizeObserver` (guard zero-size first paint). Redraws via `requestAnimationFrame` when `peaks`, `secPerPx`, `scroll`, or `offsetPx` change. Props: `{ peaks: Record<string, number[]>, color: string, role: string, offsetPx?: number }`. The B lane passes `offsetB / secPerPx` as `offsetPx`.

- [ ] **Step 3: Verify**

Temporarily mount two `<Waveform>` with the fetched payload peaks (A amber `#f2a93b`, B cyan `#3fcfe0`) in the transport area → both waveforms render, are crisp at all zoom levels, and reflect the demo files' amplitude envelope.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/transport/waveform.regl.ts frontend/src/features/transport/Waveform.tsx
git commit -m "feat: dual waveform regl rendering with mipmap zoom"
```

---

## Task 23: Transport — layout, A/B block, control row, interactions

**Files:**
- Create: `frontend/src/features/transport/{Transport,ABBlock,ControlRow}.tsx`

- [ ] **Step 1: Transport grid + lanes**

`Transport.tsx` — the `.transport` grid (`cols var(--gutter) 1fr / rows 1fr 46px`, `overflow:hidden`). Column 1 spanning both rows = `<ABBlock/>`. Row 1 col 2 = `.wave-stack` with two `.wave-row`s (A·MIX over B·REF, each a `<Waveform/>` + `.wave-tag`). Row 2 col 2 = `<ControlRow/>`. Add the shared `.lane-overlay` with the `.playhead` line and `.region-sel` rectangle, positioned from `--gutter` and the store's `playhead`/`regionA` via `secPerPx`/`scroll`.

- [ ] **Step 2: A/B block**

`ABBlock.tsx` — vertical segmented control (port `transport.jsx` `.ab-block`): two `.ab-seg` (A "mix" / B "ref"), active segment solid amber/cyan with `#0b0b0d` letter, reading/writing `ab` in the store. `.ab-hint` with `<kbd>Tab</kbd>`. Click sets `ab` directly.

- [ ] **Step 3: Control row**

`ControlRow.tsx` — port `transport.jsx` control row: play/pause (`.tbtn.play`), loop toggle (`.tbtn.accent` reflecting `loop.enabled`), zoom out/in (adjust `secPerPx`, clamp 0.004–0.5), time readout (`playhead` / `duration`), link toggle (`linked`), and the **Match** dropdown (portal Menu: Integrated / Short-term / Region / Off → `matchMode`). All write through the store.

- [ ] **Step 4: Playhead motion + keyboard**

Add a rAF loop (port `app.jsx` playback loop, but P0 has no audio engine yet — drive `playhead` from `performance.now()` deltas while `playing`). Keyboard: `Space` toggles a local `playing` flag, `Tab` toggles `ab`, `L` toggles `loop.enabled`, `Esc` clears `regionA`, `+`/`-` zoom. Auto-follow scroll when the playhead nears the right edge. Looping wraps `playhead` within `regionA` when `loop.enabled`.

- [ ] **Step 5: Region select + drag-B alignment**

- **Region:** drag on a wave lane sets `regionA = [t0,t1]` (convert px→sec via `secPerPx`,`scroll`); render `.region-sel`.
- **Alignment:** horizontal drag on the **B lane** updates `offsetB` (clamp −30…+30 s), live-updating the header offset pill and shifting the B waveform. When `linked` is on, scrolling moves both lanes together preserving `offsetB`.

- [ ] **Step 6: Verify**

Full interaction pass on a ready comparison: waveforms render; Space scrubs the playhead; +/- zoom both lanes; drag selects a region; L loops it; drag B shifts it and updates the offset pill; Tab flips A/B; values persist across refresh (localStorage) and survive a backend restart (DB sync).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/transport
git commit -m "feat: transport layout, A/B block, controls, alignment + region/loop"
```

---

## Task 24: Empty meter column + panel workspace

**Files:**
- Create: `frontend/src/features/meters/MeterColumn.tsx`, `frontend/src/features/panels/PanelWorkspace.tsx`

- [ ] **Step 1: Meter column (empty slots)**

`MeterColumn.tsx` — the `.meter-col` grid (`1fr 1fr`). Two `.meter-slot`s, each with a `.meter-head` carrying a portal-Menu selector listing the six meter types (LUFS, True Peak, PSR, Correlation, Balance, RMS) — a type chosen in one slot is disabled in the other. Default `meterSlots = ['lufs','truepeak']`. **Body shows the `.empty-slot` placeholder** ("No data yet — loudness lands in Phase 1"); actual meter renderers arrive in P1/P3. Selecting a type updates `meterSlots` in the store.

- [ ] **Step 2: Panel workspace (empty panel)**

`PanelWorkspace.tsx` — `.workspace` with the 34px `.workspace-bar` ("Analysis panels" + panel count + **Add panel** on the right; **no cap**, always enabled) above a `.workspace-scroll`. Render one `.panel` per id in `panels` (default `['shortTermLufs','ltas','tiles']`); each panel has the `.panel-head` (view-switcher Menu grouped by family, title + subtitle, move-up/down + remove `.ptool`s) and a body showing the `.empty-slot` placeholder for now. Add panel appends a default view id; reorder = array index swap; remove drops it. All mutate `panels` in the store (persisted).

- [ ] **Step 3: Verify**

Open a comparison → right column shows two empty meter slots with working type selectors; workspace shows three empty panels with working add/remove/reorder and view-switcher menus; panel/meter layout persists across refresh.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/meters frontend/src/features/panels
git commit -m "feat: empty meter column + panel workspace shell"
```

---

## Task 25: Production build + end-to-end smoke

**Files:**
- Modify: `frontend/package.json` (build script already present), no new files

- [ ] **Step 1: Build the SPA**

Run: `cd frontend && npm run build`
Expected: `frontend/dist/` with `index.html` + `assets/`.

- [ ] **Step 2: Serve everything from FastAPI**

Run: `cd backend && uv run uvicorn app.main:app --port 8000` then open `http://localhost:8000/`.
Expected: the Library loads from the single server (SPA served by FastAPI, `/api` same-origin). Direct-navigate to a `/c/:id` URL → SPA fallback serves it.

- [ ] **Step 3: Full manual flow**

From `localhost:8000`: New comparison → Use demo files → Analyze → watch processing → land in workspace → zoom/scrub/region/loop/align/Tab → return to `/` → see the card → rename, duplicate-by-reopen, swap roles, delete. Refresh mid-workspace → state restored.

- [ ] **Step 4: Run backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: all audio/DSP tests pass (8 tests across decode/loudness/waveform).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: phase 0 production build + e2e smoke verified"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** library + multi-comparison (Tasks 4, 18); local-first persistence (Tasks 15, 18); single-server SPA (Task 12, 25); in-process JobRunner (Task 10); SQLite+Storage abstractions (Tasks 3–5); stereo-only validation (Tasks 7, 19); 48 kHz resample + gain-match to −14 (Tasks 7, 8); waveform/transport/alignment/region/loop/zoom/link + A/B block (Tasks 22–23); empty meters + uncapped panel workspace (Task 24); processing stages driven by backend (Task 20); swap roles + TTL (Tasks 11, 12); design tokens ported verbatim (Task 13); data contract mirrored FE/BE (Tasks 6, 14); demo files (Task 16). Substrate metrics (loudness/frequency/spatial), the A/B audio engine, spectrogram, and offline payload/audio caching are explicitly **P1–P5**, not P0.
- **Testing policy honored:** automated tests only in Tasks 7–9 (audio/DSP); everything else smoke-verified.
- **Type consistency:** `view_state`/`viewState`, `offsetB`, `peaksByZoom`, `meterSlots`, stage names (`decode`/`gainmatch`/`waveform`/`stft`/`spatial`/`aggregates`), and the `mix`/`reference` ↔ `user`/`reference` mapping are consistent across schemas.py, pipeline.py, the API, and the TS types/store.
