"""
Step 2: Real-ESRGAN によるアップスケール（4x）
"""
from pathlib import Path
import subprocess
import sys

from app.core.config import settings
from app.models.job import Job


async def run(input_path: Path, job: Job) -> Path:
    out_path = input_path.parent / f"{input_path.stem}_upscaled.png"

    # Real-ESRGAN CLI が PATH に入っている前提
    # インストール: pip install realesrgan  または  conda install -c conda-forge realesrgan
    cmd = [
        sys.executable, "-m", "realesrgan",
        "-i", str(input_path),
        "-o", str(out_path),
        "-s", str(settings.upscale_factor),
        "--model", "RealESRGAN_x4plus",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Real-ESRGAN failed: {proc.stderr}")

    return out_path
