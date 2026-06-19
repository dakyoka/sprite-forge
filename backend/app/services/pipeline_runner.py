"""
パイプライン全体の実行オーケストレーター。
各ステップは独立したサービスモジュールに委譲する。
"""
import logging
from datetime import datetime
from pathlib import Path

from app.models.job import Job, JobStatus, StepStatus
from app.services import upscale, rembg_service, trellis_service as trellis, blender_post, godot_export

logger = logging.getLogger(__name__)

STEPS = [
    ("upload",  None),
    ("upscale", upscale.run),
    ("rembg",   rembg_service.run),
    ("trellis", trellis.run),
    ("blender", blender_post.run),
    ("godot",   godot_export.run),
]


async def run_pipeline(job: Job, input_path: Path, store: dict):
    job.status = JobStatus.running

    # Step 0: upload (already done)
    _mark(job, "upload", StepStatus.done, f"{input_path.name} 読み込み完了")
    job.progress = 10
    _sync(job, store)

    current_path = input_path

    for step_id, fn in STEPS[1:]:
        _mark(job, step_id, StepStatus.running)
        _sync(job, store)
        try:
            result_path = await fn(current_path, job)
            current_path = result_path
            _mark(job, step_id, StepStatus.done)
        except Exception as e:
            logger.exception(f"[{job.job_id}] step={step_id} failed")
            _mark(job, step_id, StepStatus.error, str(e))
            job.status = JobStatus.failed
            job.error_msg = f"{step_id}: {e}"
            _sync(job, store)
            return

        job.progress = _calc_progress(step_id)
        _sync(job, store)

    job.status = JobStatus.completed
    job.output_glb = str(current_path)
    job.progress = 100
    _sync(job, store)
    logger.info(f"[{job.job_id}] pipeline completed → {current_path}")


def _mark(job: Job, step_id: str, status: StepStatus, detail: str = ""):
    for s in job.steps:
        if s.step_id == step_id:
            s.status = status
            if detail:
                s.detail = detail
            if status == StepStatus.running:
                s.started_at = datetime.utcnow()
            elif status in (StepStatus.done, StepStatus.error):
                s.finished_at = datetime.utcnow()
            break


def _sync(job: Job, store: dict):
    job.updated_at = datetime.utcnow()
    store[job.job_id] = job


def _calc_progress(step_id: str) -> int:
    return {"upscale": 25, "rembg": 40, "trellis": 75, "blender": 88, "godot": 100}.get(step_id, 0)
