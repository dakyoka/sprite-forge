"""
Step 4: Microsoft TRELLIS による 2D→3D 生成
要件: TRELLIS を別途インストール済みであること（SETUP.md 参照）
GPU: RTX 3060 12GB 以上推奨（fp16 モード）
"""
import subprocess
import sys
from pathlib import Path

from app.core.config import settings
from app.models.job import Job

_TRELLIS_SCRIPT = Path(__file__).parent / "trellis_infer.py"


async def run(input_path: Path, job: Job) -> Path:
    out_glb = input_path.parent / f"{input_path.stem}.glb"

    cmd = [
        sys.executable, str(_TRELLIS_SCRIPT),
        "--input",  str(input_path),
        "--output", str(out_glb),
        "--model",  settings.trellis_model,
        "--steps",  str(settings.trellis_steps),
        *(["--fp16"] if settings.trellis_fp16 else []),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(f"Trellis failed:\n{proc.stderr[-800:]}")

    return out_glb
