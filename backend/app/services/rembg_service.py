"""
Step 3: 背景除去
- rembg がインストール済みなら常に実行（既に透明でも品質劣化なし）
- rembg 未インストール時はスキップ（RGBA 変換のみ）
"""
from pathlib import Path
from PIL import Image

from app.models.job import Job


async def run(input_path: Path, job: Job) -> Path:
    out_path = input_path.parent / f"{input_path.stem}_nobg.png"

    with Image.open(input_path) as img:
        try:
            from rembg import remove as _remove
        except ImportError:
            _remove = None

        if _remove is not None:
            # rembg インストール済み → 背景除去実行（例外はパイプラインに伝播させる）
            result = _remove(img)
            result.save(out_path, "PNG")
        else:
            # rembg 未インストール → RGBA 変換のみで通過
            converted = img.convert("RGBA") if img.mode != "RGBA" else img
            converted.save(out_path, "PNG")

    return out_path
