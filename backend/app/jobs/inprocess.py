from concurrent.futures import ThreadPoolExecutor
from typing import Callable


class InProcessJobRunner:
    def __init__(self, max_workers: int = 2) -> None:
        self._pool = ThreadPoolExecutor(max_workers=max_workers)

    def submit(self, fn: Callable[[], None]) -> None:
        self._pool.submit(fn)


_runner = InProcessJobRunner()


def get_runner() -> InProcessJobRunner:
    return _runner
