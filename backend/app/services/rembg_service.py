"""
Step 3: rembg による背景除去（AI セグメンテーション）
"""
from pathlib import Path
from app.models.job import Job


async def run(input_path: Path, job: Job) -> Path:
    from rembg import remove
    from PIL import Image

    out_path = input_path.parent / f"{input_path.stem}_nobg.png"
    with Image.open(input_path) as img:
        result = remove(img)
        result.save(out_path)

    return out_path
