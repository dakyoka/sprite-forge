"""
Step 5: Blender post-processing (optional)
- Move mesh origin to ground level
- Reset emission to 0
- Normalize roughness to 0.8
Scale is intentionally left for manual adjustment in Godot.

If Blender is not found, this step is skipped gracefully.
"""
import asyncio
import shutil
import subprocess
from pathlib import Path

from app.core.config import settings
from app.models.job import Job
from app.services.step_result import StepResult

_BLENDER_SCRIPT = Path(__file__).parent / "blender_post_script.py"

_CANDIDATE_PATHS = [
    r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
    r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
    r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe",
    r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
    r"C:\Program Files\Blender Foundation\Blender 3.6\blender.exe",
]


def find_blender() -> str | None:
    if settings.blender_exe and Path(settings.blender_exe).exists():
        return settings.blender_exe
    exe = shutil.which("blender")
    if exe:
        return exe
    for c in _CANDIDATE_PATHS:
        if Path(c).exists():
            return c
    return None


async def run(input_glb: Path, job: Job) -> StepResult:
    blender_exe = find_blender()
    if blender_exe is None:
        return StepResult(
            path=input_glb,
            skipped=True,
            detail="Blender 未検出のため後処理をスキップしました",
        )

    out_glb = input_glb.parent / f"{input_glb.stem}_processed.glb"
    cmd = [
        blender_exe,
        "--background",
        "--python", str(_BLENDER_SCRIPT),
        "--",
        str(input_glb),
        str(out_glb),
    ]
    proc = await asyncio.to_thread(
        subprocess.run, cmd, capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        return StepResult(
            path=input_glb,
            skipped=True,
            detail=f"Blender エラーのため後処理をスキップ: {proc.stderr[-200:]}",
        )

    return StepResult(path=out_glb, detail="原点/マテリアル調整 完了")
