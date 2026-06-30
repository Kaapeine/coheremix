from __future__ import annotations

import uuid

from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as OrmSession

from app.analysis.pipeline import run_analysis
from app.api import get_db
from app.config import get_settings
from app.db import repositories as repo
from app.jobs.inprocess import get_runner
from app.storage.local import get_storage

router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])


def _comp_out(comp) -> dict:
    latest_job = comp.jobs[-1] if comp.jobs else None  # jobs ordered by created_at
    return {
        "id": comp.id,
        "name": comp.name,
        "state": comp.state,
        "createdAt": comp.created_at.isoformat(),
        "viewState": comp.view_state or {},
        "jobId": latest_job.id if latest_job else None,
        "error": latest_job.error if latest_job else None,
        "tracks": [
            {
                "role": t.role,
                "name": t.name,
                "fileInfo": t.file_info,
                "gainMatch": t.gain_match or None,
                "state": t.state,
            }
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

    from app.analysis import decode  # noqa: PLC0415
    saved_keys: list[str] = []
    try:
        tracks = []
        for role, up in (("mix", mix), ("reference", reference)):
            data = await up.read()
            if len(data) > settings.max_upload_bytes:
                raise HTTPException(
                    413, f"{role} file too large (max {settings.max_upload_bytes // 1024 // 1024} MB)"
                )
            key = f"uploads/{uuid.uuid4().hex}-{up.filename}"
            storage.save(key, data)
            saved_keys.append(key)

            # Probe before queuing — authoritative duration + stereo gate
            raw_path = settings.storage_dir / key
            info = decode.probe(str(raw_path), len(data))
            if info.duration > settings.max_duration_s:
                raise HTTPException(
                    422,
                    f"{role} file too long ({info.duration / 60:.1f} min; max {settings.max_duration_s / 60:.0f} min)",
                )
            decode.validate_stereo(info)

            tracks.append({"role": role, "name": up.filename, "upload_key": key})
    except HTTPException:
        for k in saved_keys:
            storage.delete(k)
        raise

    sess = repo.get_or_create_session(db, session_id)
    response.set_cookie("session_id", sess.id, httponly=True, samesite="lax")
    comp_name = name or f"{mix.filename} vs {reference.filename}"
    comp = repo.create_comparison(db, sess.id, comp_name, tracks)
    comp_id = comp.id
    get_runner().submit(lambda: run_analysis(comp_id))
    return {"id": comp_id, "jobId": comp.jobs[-1].id}


@router.get("")
def list_comparisons(
    session_id: str | None = Cookie(None),
    db: OrmSession = Depends(get_db),
):
    if not session_id:
        return []
    return [_comp_out(c) for c in repo.list_comparisons(db, session_id)]


@router.get("/demo/{which}")
def demo_file(which: str):
    p = get_settings().demo_dir / ("mix_demo.wav" if which == "mix" else "reference_demo.wav")
    if not p.exists():
        raise HTTPException(404, "Demo files not yet generated (run Task 16)")
    return FileResponse(p, media_type="audio/wav", filename=p.name)


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


@router.get("/{comp_id}/tracks/{role}/audio")
def get_audio(comp_id: str, role: str, db: OrmSession = Depends(get_db)):
    comp = repo.get_comparison(db, comp_id)
    if not comp:
        raise HTTPException(404)
    track = next((t for t in comp.tracks if t.role == role), None)
    if not track or not track.upload_key:
        raise HTTPException(404, "audio not available")
    storage = get_storage()
    if hasattr(storage, "presign_url"):
        return {"url": storage.presign_url(track.upload_key)}
    return {"url": f"/api/comparisons/{comp_id}/tracks/{role}/audio/bytes"}


@router.get("/{comp_id}/tracks/{role}/audio/bytes")
def get_audio_bytes(comp_id: str, role: str, db: OrmSession = Depends(get_db)):
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
