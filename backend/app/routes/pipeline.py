"""
POST /api/pipeline/start — 画像アップロードと同時にパイプラインを開始する。
画像をドロップしたらフロントエンドがこのエンドポイントを叩く。
"""
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.models.job import Job
from app.services.pipeline_runner import run_pipeline
from app.core.config import settings

router = APIRouter()

# インメモリジョブストア（将来 SQLite に移行可能）
_jobs: dict[str, Job] = {}


@router.post("/start", response_model=Job)
async def start_pipeline(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="PNG / JPG / WEBP のみ対応")

    job = Job(filename=file.filename or "unknown.png")
    _jobs[job.job_id] = job

    # 受け取った画像をtmpに保存
    tmp_dir = Path(settings.output_dir) / job.job_id
    tmp_dir.mkdir(parents=True, exist_ok=True)
    input_path = tmp_dir / file.filename
    with input_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    background_tasks.add_task(run_pipeline, job, input_path, _jobs)
    return job


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
