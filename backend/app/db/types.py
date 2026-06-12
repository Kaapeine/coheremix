from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UtcDateTime(TypeDecorator):
    """Stores naive UTC (SQLite drops tzinfo) and always returns tz-aware UTC.

    SQLite has no native timezone support, so a tz-aware datetime round-trips
    as naive — which makes `.isoformat()` ambiguous (JS reads suffix-less
    strings as local time) and breaks aware-vs-aware comparisons in the TTL
    sweeper. This decorator normalises both ends: bind converts to UTC and
    strips tzinfo for storage; load re-attaches UTC.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)
