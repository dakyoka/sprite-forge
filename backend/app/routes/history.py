"""
GET /api/history — 完了済みジョブのみ返す（右ペイン履歴用）
"""
from fastapi import APIRouter
from app.models.job import Job, JobStatus
from app.routes.pipeline import _jobs

router = APIRouter()


@router.get("/", response_model=list[Job])
async def get_history():
    return sorted(
        [j for j in _jobs.values() if j.status == JobStatus.completed],
        key=lambda j: j.created_at,
        reverse=True,
    )
