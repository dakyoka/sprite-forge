"""
GET /api/jobs — 全ジョブ一覧（履歴ペイン用）
"""
from fastapi import APIRouter
from app.models.job import Job
from app.routes.pipeline import _jobs

router = APIRouter()


@router.get("/", response_model=list[Job])
async def list_jobs():
    return sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
