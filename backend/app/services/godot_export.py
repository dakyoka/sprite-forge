"""
Step 6: Godot プロジェクトフォルダへ GLB をコピー
コピー先は config/settings.json の godot_export_path で管理（SSOT）
"""
import shutil
from pathlib import Path

from app.core.config import settings
from app.models.job import Job


async def run(input_glb: Path, job: Job) -> Path:
    dest_dir = Path(settings.godot_export_path)
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest = dest_dir / input_glb.name
    shutil.copy2(input_glb, dest)

    return dest
