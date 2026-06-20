"""
GET    /api/jobs            — 全ジョブ一覧（履歴・キューペイン用）
DELETE /api/jobs/{job_id}   — ジョブを履歴から削除（出力ファイルも削除）
POST   /api/jobs/{job_id}/favorite — お気に入りフラグの設定

queued ジョブはキュー処理順(queue_manager の並び)で、
それ以外は created_at の降順で返す。フロント側は status で
filter するだけで正しいキュー順が得られる(filter は順序を保つため)。
"""
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.job import Job, JobStatus
from app.core import queue_manager, job_store
from app.core.config import settings
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


def _delete_job_files(job: Job) -> None:
    """ジョブに紐づく出力ファイルを削除する(ベストエフォート)。"""
    # per-job 出力ディレクトリ(入力画像 + TRELLIS GLB)。
    try:
        job_dir = Path(settings.output_dir) / job.job_id
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass
    # エクスポート済み GLB(godot_export_path など、per-job ディレクトリ外)。
    # 同名で上書きされる運用のため共有され得るが、削除はベストエフォートで行う。
    if job.output_glb:
        try:
            fp = Path(job.output_glb)
            if fp.exists():
                fp.unlink()
        except Exception:
            pass


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """完了/失敗/中止したジョブを履歴から削除し、出力ファイルも消す。"""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == JobStatus.running:
        raise HTTPException(status_code=409, detail="実行中のジョブは削除できません。先に停止してください。")

    # queued なら先にキューから外す。
    if job.status == JobStatus.queued:
        queue_manager.remove(job_id)
    queue_manager.clear_cancel(job_id)

    _delete_job_files(job)
    _jobs.pop(job_id, None)
    job_store.save()
    return {"deleted": job_id}


class FavoriteIn(BaseModel):
    favorite: bool


@router.post("/{job_id}/favorite", response_model=Job)
async def set_favorite(job_id: str, body: FavoriteIn):
    """お気に入りフラグを設定して永続化する。"""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.favorite = body.favorite
    job_store.save()
    return job
