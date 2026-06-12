from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UtcDateTime


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=_now)
    comparisons: Mapped[list[Comparison]] = relationship(back_populates="session")


class Comparison(Base):
    __tablename__ = "comparisons"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    name: Mapped[str] = mapped_column(String, default="Untitled comparison")
    state: Mapped[str] = mapped_column(String, default="processing")  # processing|ready|failed
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=_now)
    view_state: Mapped[dict] = mapped_column(JSON, default=dict)
    session: Mapped[Session] = relationship(back_populates="comparisons")
    tracks: Mapped[list[Track]] = relationship(
        back_populates="comparison", cascade="all, delete-orphan"
    )
    jobs: Mapped[list[Job]] = relationship(
        back_populates="comparison",
        cascade="all, delete-orphan",
        order_by="Job.created_at",
    )


class Track(Base):
    __tablename__ = "tracks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    comparison_id: Mapped[str] = mapped_column(ForeignKey("comparisons.id"))
    role: Mapped[str] = mapped_column(String)  # mix|reference
    name: Mapped[str] = mapped_column(String)
    upload_key: Mapped[str] = mapped_column(String)
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
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=_now)
    stages: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    comparison: Mapped[Comparison] = relationship(back_populates="jobs")
