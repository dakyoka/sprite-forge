"""
GET /api/gpu — nvidia-smi による実測 GPU テレメトリ。

GPU / nvidia-smi が無い環境では捏造値を返さず、
{"available": false, "reason": ...} を返す(フロントは N/A 表示)。
"""
import asyncio
import shutil
import subprocess

from fastapi import APIRouter

router = APIRouter()

_QUERY = "utilization.gpu,memory.used,memory.total,temperature.gpu"


def _to_float(s: str):
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


@router.get("")
async def get_gpu():
    smi = shutil.which("nvidia-smi")
    if smi is None:
        return {"available": False, "reason": "nvidia-smi が見つかりません"}

    cmd = [smi, f"--query-gpu={_QUERY}", "--format=csv,noheader,nounits"]
    try:
        proc = await asyncio.to_thread(
            subprocess.run, cmd, capture_output=True, text=True, timeout=5,
        )
    except Exception as e:  # noqa: BLE001 - 取得失敗は捏造せず unavailable として返す
        return {"available": False, "reason": f"nvidia-smi 実行失敗: {e}"}

    if proc.returncode != 0:
        reason = (proc.stderr or "").strip()[:200] or "nvidia-smi が異常終了しました"
        return {"available": False, "reason": reason}

    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
    if not lines:
        return {"available": False, "reason": "nvidia-smi が空の出力を返しました"}

    # 複数 GPU でも先頭 1 枚を返す
    parts = [p.strip() for p in lines[0].split(",")]
    if len(parts) < 4:
        return {"available": False, "reason": "nvidia-smi の出力形式が想定外です"}

    return {
        "available": True,
        "util_pct": _to_float(parts[0]),
        "vram_used_mib": _to_float(parts[1]),
        "vram_total_mib": _to_float(parts[2]),
        "temp_c": _to_float(parts[3]),
    }
