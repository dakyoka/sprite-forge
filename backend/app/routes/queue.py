"""
POST /api/queue/reorder — キュー中ジョブの並び替え。
GET  /api/queue/         — 現在のキュー(queued ジョブ)を順序通りに返す。
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.job import Job
from app.core import job_store, queue_manager
from app.routes.pipeline import _jobs

router = APIRouter()


class ReorderRequest(BaseModel):
    order: list[str]


@router.get("/", response_model=list[Job])
async def get_queue():
    """queued ジョブをキュー順で返す。"""
    return [_jobs[jid] for jid in queue_manager.queued_ids() if jid in _jobs]


@router.post("/reorder", response_model=list[Job])
async def reorder_queue(req: ReorderRequest):
    new_order = queue_manager.reorder(req.order)
    job_store.save()
    return [_jobs[jid] for jid in new_order if jid in _jobs]
