"""
GET /api/jobs — 全ジョブ一覧（履歴・キューペイン用）

queued ジョブはキュー処理順(queue_manager の並び)で、
それ以外は created_at の降順で返す。フロント側は status で
filter するだけで正しいキュー順が得られる(filter は順序を保つため)。
"""
from fastapi import APIRouter
from app.models.job import Job, JobStatus
from app.core import queue_manager
from app.routes.pipeline import _jobs

router = APIRouter()


@router.get("/", response_model=list[Job])
async def list_jobs():
    queued_order = queue_manager.queued_ids()
    queued_pos = {jid: i for i, jid in enumerate(queued_order)}

    def sort_key(j: Job):
        # queued はキュー順(0,1,2..)、その他は新しい順。
        # queued を先頭グループにしないよう、created_at 降順を主キーにしつつ
        # queued 同士はキュー順を保つため、別グループで整列する。
        if j.status == JobStatus.queued:
            return (0, queued_pos.get(j.job_id, 1_000_000), 0.0)
        return (1, 0, -j.created_at.timestamp())

    return sorted(_jobs.values(), key=sort_key)
