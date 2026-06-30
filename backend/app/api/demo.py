from __future__ import annotations

from sqlalchemy import select

from app.api import get_db
from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison, Session
from app.db.repositories import create_comparison
from app.jobs.inprocess import get_runner
from app.storage.local import LocalDiskStorage, get_storage
from fastapi import APIRouter

router = APIRouter(tags=["demo"])

DEMO_SESSION_ID = "demo"


@router.get("/api/demo")
def get_or_create_demo():
    db = SessionLocal()
    try:
        # Ensure demo session exists
        if not db.get(Session, DEMO_SESSION_ID):
            db.add(Session(id=DEMO_SESSION_ID))
            db.commit()

        # Return existing demo comparison if present
        comp = db.scalars(
            select(Comparison)
            .where(Comparison.session_id == DEMO_SESSION_ID)
            .limit(1)
        ).first()
        if comp:
            return {"id": comp.id, "state": comp.state}

        # First-ever request — seed from demo_dir
        settings = get_settings()
        storage = get_storage()
        local = LocalDiskStorage()
        use_r2 = hasattr(storage, "presign_url")

        tracks = []
        for role, filename in [("mix", "Across The Universe.mp3"), ("reference", "Till There Was You.mp3")]:
            data = (settings.demo_dir / filename).read_bytes()
            key = f"uploads/demo-{role}"
            local.save(key, data)
            if use_r2:
                storage.save(key, data)
            tracks.append({"role": role, "name": filename, "upload_key": key})

        comp = create_comparison(db, DEMO_SESSION_ID, "Demo", tracks)
        comp_id = comp.id
        get_runner().submit(lambda: run_analysis(comp_id))
        return {"id": comp_id, "state": comp.state}
    finally:
        db.close()


# Imported here to avoid a circular import (pipeline imports storage which imports config)
from app.analysis.pipeline import run_analysis  # noqa: E402
