"""
POST /api/pipeline/start  — 画像アップロードと同時にジョブをキューへ投入する。
POST /api/pipeline/{job_id}/cancel — キュー中/実行中ジョブを停止する。
GET  /api/pipeline/{job_id} — ジョブ単体取得。

実際の処理はバックグラウンドのワーカーループ(main.py)が
キューを 1 件ずつ取り出して run_pipeline を呼ぶ。
"""
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models.job import Job, JobStatus
from app.core.config import settings
from app.core import job_store, queue_manager

router = APIRouter()

# ジョブストア(JSON 永続化)。他ルートもこの dict を共有する(再エクスポート)。
_jobs = job_store.jobs


@router.post("/start", response_model=Job)
async def start_pipeline(
    file: UploadFile = File(...),
):
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="PNG / JPG / WEBP のみ対応")

    job = Job(filename=file.filename or "unknown.png", status=JobStatus.queued)

    # 受け取った画像を output/{job_id}/{filename} に保存する
    tmp_dir = Path(settings.output_dir) / job.job_id
    tmp_dir.mkdir(parents=True, exist_ok=True)
    input_path = tmp_dir / (file.filename or "input.png")
    with input_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    job.input_image = str(input_path)
    _jobs[job.job_id] = job

    # キューへ投入 → ワーカーを起こす
    queue_manager.enqueue(job.job_id)
    job_store.save()
    _wake_worker()

    return job


@router.post("/{job_id}/cancel", response_model=Job)
async def cancel_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # 既に終了しているジョブは no-op
    if job.status in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
        return job

    if job.status == JobStatus.queued:
        # まだ実行されていない → キューから外して cancelled に
        queue_manager.remove(job_id)
        job.status = JobStatus.cancelled
        job.error_msg = "キャンセルされました"
        job_store.save()
        return job

    # running の場合 → キャンセル要求 + サブプロセス終了
    queue_manager.request_cancel(job_id)
    queue_manager.terminate_running_proc()
    # 実際の status=cancelled への遷移は run_pipeline 側が行う
    job_store.save()
    return job


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _wake_worker() -> None:
    """ワーカーループ用の asyncio.Event を(あれば)set する。"""
    ev = queue_manager.wake_event
    loop = getattr(queue_manager, "wake_loop", None)
    if ev is None:
        return
    try:
        if loop is not None:
            loop.call_soon_threadsafe(ev.set)
        else:
            ev.set()
    except Exception:
        pass
