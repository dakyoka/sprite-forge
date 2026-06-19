"""
GET /api/input/{job_id} — ジョブの入力画像を配信する。
キュー中/処理中のジョブのサムネイル表示に使う。
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.routes.pipeline import _jobs

router = APIRouter()

_MEDIA_BY_EXT = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif":  "image/gif",
    ".bmp":  "image/bmp",
}


@router.get("/{job_id}")
async def get_input(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.input_image:
        path = Path(job.input_image)
    else:
        # フォールバック: output/{job_id}/{filename}
        from app.core.config import settings
        path = Path(settings.output_dir) / job_id / job.filename

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Input image missing: {path}")

    media = _MEDIA_BY_EXT.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media, filename=path.name)
