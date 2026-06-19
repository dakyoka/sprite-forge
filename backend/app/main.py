"""
SpriteForge — FastAPI Backend
Entry point. All pipeline logic is delegated to services/.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import pipeline, jobs, history, output, input_image, queue
from app.core.config import settings
from app.core import job_store, queue_manager
from app.models.job import JobStatus
from app.services.pipeline_runner import run_pipeline

logger = logging.getLogger(__name__)


async def _worker_loop():
    """
    単一ワーカーループ。キューを 1 件ずつ取り出して run_pipeline を実行する。
    例外で 1 件落ちてもループは止めない。
    """
    while True:
        try:
            # 実行中が無く、キューに何かあれば次を取り出す
            if queue_manager.get_running() is None:
                job_id = queue_manager.dequeue_next()
                if job_id is not None:
                    job = job_store.jobs.get(job_id)
                    if job is None or job.status == JobStatus.cancelled:
                        # 既に消えた/キャンセル済みならスキップ
                        queue_manager.clear_cancel(job_id)
                        continue
                    if job.input_image:
                        input_path = Path(job.input_image)
                    else:
                        input_path = Path(settings.output_dir) / job_id / job.filename
                    queue_manager.set_running(job_id)
                    try:
                        await run_pipeline(job, input_path, job_store.jobs)
                    except Exception:
                        logger.exception(f"[{job_id}] worker: run_pipeline crashed")
                    finally:
                        queue_manager.clear_running()
                        queue_manager.clear_cancel(job_id)
                    continue  # すぐ次を確認

            # 仕事が無ければイベント待ち(最大 0.5s)
            ev = queue_manager.wake_event
            if ev is not None:
                try:
                    await asyncio.wait_for(ev.wait(), timeout=0.5)
                except asyncio.TimeoutError:
                    pass
                ev.clear()
            else:
                await asyncio.sleep(0.5)
        except Exception:
            logger.exception("worker loop iteration failed")
            await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 再起動前に queued だったジョブを順序を保って再エンキューする。
    # 再起動前に running だったジョブは orphan なので failed に倒す。
    queued = sorted(
        [j for j in job_store.jobs.values() if j.status == JobStatus.queued],
        key=lambda j: j.created_at,
    )
    for j in queued:
        queue_manager.enqueue(j.job_id)
    for j in job_store.jobs.values():
        if j.status == JobStatus.running:
            j.status = JobStatus.failed
            j.error_msg = "バックエンド再起動により中断されました"
    job_store.save()

    # ワーカー起動用イベントをセットアップ
    queue_manager.wake_event = asyncio.Event()
    queue_manager.wake_loop = asyncio.get_running_loop()
    task = asyncio.create_task(_worker_loop())
    logger.info("worker loop started")
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="SpriteForge API",
    description="2D スプライト → 3D モデル 全自動パイプライン",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipeline.router,    prefix="/api/pipeline", tags=["pipeline"])
app.include_router(jobs.router,        prefix="/api/jobs",     tags=["jobs"])
app.include_router(history.router,     prefix="/api/history",  tags=["history"])
app.include_router(output.router,      prefix="/api/output",   tags=["output"])
app.include_router(input_image.router, prefix="/api/input",    tags=["input"])
app.include_router(queue.router,       prefix="/api/queue",    tags=["queue"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": app.version}
