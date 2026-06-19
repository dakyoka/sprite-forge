"""
GET /api/output/{job_id} — 生成済み GLB ファイルを配信する。
3D プレビュー(model-viewer)と GLB ダウンロードの両方がこのエンドポイントを使う。
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.routes.pipeline import _jobs

router = APIRouter()


@router.get("/{job_id}")
async def get_output(job_id: str):
    job = _jobs.get(job_id)
    if not job or not job.output_glb:
        raise HTTPException(status_code=404, detail="GLB not found")

    path = Path(job.output_glb)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"GLB file missing: {path}")

    return FileResponse(
        path,
        media_type="model/gltf-binary",
        filename=path.name,
    )
