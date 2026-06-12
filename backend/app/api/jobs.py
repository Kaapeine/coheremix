from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from app.api import get_db
from app.db.models import Job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str, db: OrmSession = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404)
    return {
        "id": job.id,
        "state": job.state,
        "progress": job.progress,
        "stages": job.stages,
        "error": job.error,
    }
