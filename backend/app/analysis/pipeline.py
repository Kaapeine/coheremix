from __future__ import annotations

import json

from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison, Job, Track
from app.storage.local import get_storage

P0_STAGES = ["decode", "gainmatch", "waveform"]
ALL_STAGES = ["decode", "gainmatch", "loudness", "frequency", "spatial", "waveform"]


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


def _pack_payload(track: Track, fileinfo, meta_dur, integrated, offset, peaks, sub1, sub2, sub3) -> bytes:
    features = {**sub1["features"], **sub2["features"], **sub3["features"]}
    static = {**sub1["static"], **sub2["static"], **sub3["static"]}
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
        "spectrogram": sub2["spectrogram"],
        "waveform": {"peaksByZoom": peaks},
        "static": static,
        "kblocks": sub1["kblocks"],
    }
    return json.dumps(payload).encode()


def run_analysis(comp_id: str) -> None:
    from app.analysis import decode, features, loudness, spatial, spectrum, waveform  # noqa: PLC0415
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

            current_stage = "loudness"
            _set_stage(db, job, tr.role, "loudness", "running")
            sub1 = features.compute_substrate1(
                pcm, settings.analysis_sample_rate, integrated=integ, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "loudness", "done")

            current_stage = "frequency"
            _set_stage(db, job, tr.role, "frequency", "running")
            sub2 = spectrum.compute_substrate2(
                pcm, settings.analysis_sample_rate, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "frequency", "done")

            current_stage = "spatial"
            _set_stage(db, job, tr.role, "spatial", "running")
            sub3 = spatial.compute_substrate3(
                pcm, settings.analysis_sample_rate, hop_s=0.1
            )
            _set_stage(db, job, tr.role, "spatial", "done")

            current_stage = "waveform"
            _set_stage(db, job, tr.role, "waveform", "running")
            peaks = waveform.build_peaks(pcm)
            payload = _pack_payload(tr, info, dur, integ, offset, peaks, sub1, sub2, sub3)
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
        if settings.r2_account_id:
            # Local upload files are scratch copies for pipeline use only; R2 retains the originals.
            from app.storage.local import LocalDiskStorage  # noqa: PLC0415
            local = LocalDiskStorage()
            for tr in comp.tracks:
                local.delete(tr.upload_key)
        db.close()
