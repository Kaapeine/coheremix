import logging
import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

log = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_engine(get_settings().db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db(retries: int = 10, delay: float = 2.0) -> None:
    from app.db import models  # noqa: F401  (register tables)
    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(engine)
            return
        except OperationalError as exc:
            if attempt == retries:
                raise
            log.warning(
                "DB not ready (attempt %d/%d): %s — retrying in %.0fs",
                attempt, retries, exc.orig, delay,
            )
            time.sleep(delay)
