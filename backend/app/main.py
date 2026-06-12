from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db.base import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="CohereMix", lifespan=lifespan)

from app.api import comparisons, jobs  # noqa: E402

app.include_router(comparisons.router)
app.include_router(jobs.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
