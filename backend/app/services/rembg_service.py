"""
Step 3: 背景除去
- settings.rembg_enabled == False → スキップ（RGBA変換のみ）
- settings.rembg_enabled == True  → rembg で AI 背景除去
  - rembg 未インストール時は RGBA 変換のみで通過
背景がすでに除去済みの場合は config/settings.json で rembg_enabled を false にすること。
"""
from pathlib import Path
from PIL import Image

from app.core.config import settings
from app.models.job import Job


async def run(input_path: Path, job: Job) -> Path:
    out_path = input_path.parent / f"{input_path.stem}_nobg.png"

    with Image.open(input_path) as img:
        if not settings.rembg_enabled:
            # 背景除去スキップ（背景除去済みの画像向け）
            converted = img.convert("RGBA") if img.mode != "RGBA" else img
            converted.save(out_path, "PNG")
            return out_path

        try:
            from rembg import remove as _remove
        except ImportError:
            _remove = None

        if _remove is not None:
            result = _remove(img)
            result.save(out_path, "PNG")
        else:
            converted = img.convert("RGBA") if img.mode != "RGBA" else img
            converted.save(out_path, "PNG")

    return out_path
