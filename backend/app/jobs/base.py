from typing import Callable, Protocol


class JobRunner(Protocol):
    def submit(self, fn: Callable[[], None]) -> None: ...
