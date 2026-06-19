"""
パイプライン全体の実行オーケストレーター。
各ステップは独立したサービスモジュールに委譲する。
"""
import asyncio
import logging
import os
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

    # GLB の実統計(サイズ・頂点数・面数)を計算する。
    # 統計の取得失敗で完了したジョブを失敗扱いにはしない(ベストエフォート)。
    size, verts, faces = await asyncio.to_thread(_glb_stats, current_path)
    job.glb_size = size
    job.vertices = verts
    job.faces = faces

    _sync(job, store)
    logger.info(f"[{job.job_id}] pipeline completed → {current_path}")


def _glb_stats(path: Path) -> tuple[int | None, int | None, int | None]:
    """GLB ファイルサイズ(bytes)・頂点数・面数を返す。失敗時はその項目を None にする。"""
    size: int | None = None
    verts: int | None = None
    faces: int | None = None
    try:
        size = os.path.getsize(path)
    except OSError:
        pass
    # trimesh は TRELLIS の依存で .venv に入っている想定。import/load 失敗時は None のまま継続。
    try:
        import trimesh
        mesh = trimesh.load(str(path), force="mesh")
        verts = int(mesh.vertices.shape[0])
        faces = int(mesh.faces.shape[0])
    except Exception as e:
        logger.warning(f"GLB stats (trimesh) skipped: {e}")
    return size, verts, faces


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
    # 更新のたびに永続化(再起動後も履歴が残るように)
    from app.core import job_store
    job_store.save()


def _calc_progress(step_id: str) -> int:
    return {"upscale": 25, "rembg": 40, "trellis": 75, "blender": 88, "godot": 100}.get(step_id, 0)
