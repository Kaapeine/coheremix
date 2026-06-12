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
