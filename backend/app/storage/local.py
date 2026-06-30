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
    from app.config import get_settings
    if get_settings().r2_account_id:
        from app.storage.r2 import get_r2_storage
        return get_r2_storage()  # type: ignore[return-value]
    return LocalDiskStorage()
