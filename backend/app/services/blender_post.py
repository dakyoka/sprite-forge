"""
Step 5: Blender による後処理
- メッシュ原点を底面（地面）に移動
- emission = 0 にリセット
- roughness を 0.8 に正規化
スケールは Godot 側で手動調整するため変更しない。
"""
import subprocess
import sys
from pathlib import Path

from app.models.job import Job

_BLENDER_SCRIPT = Path(__file__).parent / "blender_post_script.py"


async def run(input_glb: Path, job: Job) -> Path:
    out_glb = input_glb.parent / f"{input_glb.stem}_processed.glb"

    blender_exe = _find_blender()
    cmd = [
        blender_exe,
        "--background",
        "--python", str(_BLENDER_SCRIPT),
        "--",
        str(input_glb),
        str(out_glb),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"Blender failed:\n{proc.stderr[-600:]}")

    return out_glb


def _find_blender() -> str:
    import shutil
    exe = shutil.which("blender")
    if exe:
        return exe
    # Windows default install path
    candidates = [
        r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    raise FileNotFoundError("Blender が見つかりません。PATH に追加するか SETUP.md を参照してください。")
