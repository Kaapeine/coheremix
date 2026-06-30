from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import get_settings
from app.db.base import SessionLocal
from app.db.models import Comparison
from app.api.demo import DEMO_SESSION_ID
from app.storage.local import LocalDiskStorage, get_storage


def sweep_expired() -> int:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.ttl_hours)
    db = SessionLocal()
    storage = get_storage()
    local = LocalDiskStorage()
    removed = 0
    try:
        stmt = select(Comparison).where(
            Comparison.created_at < cutoff,
            Comparison.session_id != DEMO_SESSION_ID,
        )
        for comp in db.scalars(stmt):
            for t in comp.tracks:
                if settings.r2_account_id:
                    local.delete(t.upload_key)  # no-op if pipeline already cleaned up
                storage.delete(t.upload_key)
                if t.payload_key:
                    storage.delete(t.payload_key)
            db.delete(comp)
            removed += 1
        db.commit()
    finally:
        db.close()
    return removed
