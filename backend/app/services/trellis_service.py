"""
Step 4: Microsoft TRELLIS 2D→3D generation
Requirements: H:/TRELLIS cloned, CUDA torch installed.
GPU 適応: VRAM を自動検出し settings.json の gpu_presets から
推論パラメータ(steps/texture_size/bake_mode/fp16)を選択する。
8GB(low) / 12-16GB(standard) / 16GB+(high) に対応。
"""
import os
import subprocess
import sys
from pathlib import Path

from app.core.config import settings
from app.models.job import Job

_TRELLIS_SCRIPT = Path(__file__).parent / "trellis_infer.py"


async def run(input_path: Path, job: Job) -> Path:
    out_glb = input_path.parent / f"{input_path.stem}.glb"

    env = {
        **os.environ,
        "TRELLIS_PATH": str(Path(settings.trellis_path).resolve()),
        "ATTN_BACKEND": "xformers",
        "SPARSE_BACKEND": "spconv",
    }

    # VRAM 自動検出とプリセット選択はサブプロセス(trellis_infer.py)側で行う。
    # ここでは settings.json の「明示オーバーライド」だけを CLI で渡す
    # (null の項目は渡さず、サブプロセスがプリセット値を採用する)。
    cmd = [
        sys.executable, str(_TRELLIS_SCRIPT),
        "--input",  str(input_path),
        "--output", str(out_glb),
        "--model",  settings.trellis_model,
    ]
    if settings.gpu_preset and settings.gpu_preset != "auto":
        cmd += ["--gpu-preset", settings.gpu_preset]
    if settings.trellis_steps is not None:
        cmd += ["--steps", str(settings.trellis_steps)]
    if settings.texture_size is not None:
        cmd += ["--texture-size", str(settings.texture_size)]
    if settings.bake_mode is not None:
        cmd += ["--bake-mode", settings.bake_mode]
    if settings.trellis_fp16 is True:
        cmd += ["--fp16"]
    elif settings.trellis_fp16 is False:
        cmd += ["--no-fp16"]

    proc = subprocess.run(
        cmd, capture_output=True, text=True,
        timeout=settings.trellis_timeout_sec, env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Trellis failed:\n{proc.stderr[-800:]}")

    return out_glb
