from __future__ import annotations

import json

from app.analysis import decode, loudness, waveform
from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison, Job, Track
from app.storage.local import get_storage

P0_STAGES = ["decode", "gainmatch", "waveform"]
ALL_STAGES = P0_STAGES + ["stft", "spatial", "aggregates"]


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
        "features": {},
        "ltas": None,
        "spectrogram": None,
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
    for tr in comp.tracks:
        for st in ALL_STAGES:
            _set_stage(db, job, tr.role, st, "pending")

    current_role: str | None = None
    current_stage: str | None = None

    try:
        durations = []
        for tr in comp.tracks:
            current_role = tr.role
            raw_path = settings.storage_dir / tr.upload_key

            current_stage = "decode"
            _set_stage(db, job, tr.role, "decode", "running")
            info = decode.probe(str(raw_path), raw_path.stat().st_size)
            decode.validate_stereo(info)
            pcm = decode.decode_to_48k(str(raw_path))
            dur = pcm.shape[1] / settings.analysis_sample_rate
            durations.append(dur)
            tr.file_info = info.__dict__
            tr.state = "decoded"
            _set_stage(db, job, tr.role, "decode", "done")

            current_stage = "gainmatch"
            _set_stage(db, job, tr.role, "gainmatch", "running")
            integ = loudness.integrated_lufs(pcm, settings.analysis_sample_rate)
            offset = loudness.gain_match(integ, settings.target_lufs)
            tr.gain_match = {"integratedLUFS": round(integ, 2), "offsetToCommon": offset}
            _set_stage(db, job, tr.role, "gainmatch", "done")

            current_stage = "waveform"
            _set_stage(db, job, tr.role, "waveform", "running")
            peaks = waveform.build_peaks(pcm)
            payload = _pack_payload(tr, info, dur, integ, offset, peaks)
            key = f"payloads/{comp.id}/{tr.role}.json"
            storage.save(key, payload)
            tr.payload_key = key
            _set_stage(db, job, tr.role, "waveform", "done")
            db.commit()

        vs = dict(comp.view_state)
        vs.setdefault("duration", max(durations) if durations else 0.0)
        comp.view_state = vs
        comp.state = "ready"
        job.state = "done"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        if current_role and current_stage:
            _set_stage(db, job, current_role, current_stage, "failed")
        comp.state = "failed"
        job.state = "failed"
        job.error = str(exc)
        db.commit()
    finally:
        db.close()
