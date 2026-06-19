"""
Step 4: Microsoft TRELLIS 2D→3D generation
Requirements: H:/TRELLIS cloned, CUDA torch installed.
GPU 適応: VRAM を自動検出し settings.json の gpu_presets から
推論パラメータ(steps/texture_size/bake_mode/fp16)を選択する。
8GB(low) / 12-16GB(standard) / 16GB+(high) に対応。
"""
import asyncio
import os
import subprocess
import sys
import time
from collections import deque
from pathlib import Path

from app.core.config import settings
from app.core import job_store, queue_manager
from app.models.job import Job

_TRELLIS_SCRIPT = Path(__file__).parent / "trellis_infer.py"

_MAX_LOG_LINES = 300       # job.logs に保持する最大行数
_SAVE_INTERVAL_SEC = 1.5   # ログ反映の永続化スロットル間隔


class TrellisCancelled(Exception):
    """キャンセル要求によりサブプロセスを終了したことを示す。"""
    pass


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

    # サブプロセスをライブストリーミングで実行する(別スレッドで読み取る)。
    # async ループを塞がないよう asyncio.to_thread で回す。
    try:
        await asyncio.to_thread(_run_streaming, cmd, env, job)
    except TrellisCancelled:
        # キャンセル起因。run_pipeline 側で cancelled 扱いになるよう再送出する。
        from app.services.pipeline_runner import JobCancelled
        raise JobCancelled()

    return out_glb


def _run_streaming(cmd: list[str], env: dict, job: Job) -> None:
    """
    Popen で起動し、stdout/stderr(マージ)を 1 行ずつ読みながら job.logs に追記する。
    - ログは末尾 _MAX_LOG_LINES 行に制限する。
    - 永続化(job_store.save)は _SAVE_INTERVAL_SEC ごとにスロットルする。
    - settings.trellis_timeout_sec を独自に監視し、超過時は terminate する。
    - キャンセル要求が出ていたら TrellisCancelled を送出する。
    - 非ゼロ終了(非キャンセル)なら直近ログ tail を含む RuntimeError を送出する。
    """
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
    )
    queue_manager.register_proc(proc)

    start = time.monotonic()
    last_save = 0.0
    tail = deque(maxlen=50)  # 失敗時のエラーメッセージ用

    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip("\n")
            if line:
                tail.append(line)
                job.logs.append(line)
                if len(job.logs) > _MAX_LOG_LINES:
                    del job.logs[: len(job.logs) - _MAX_LOG_LINES]

            # キャンセル要求のチェック
            if queue_manager.is_cancel_requested(job.job_id):
                _terminate(proc)
                raise TrellisCancelled()

            # タイムアウト監視
            if time.monotonic() - start > settings.trellis_timeout_sec:
                _terminate(proc)
                raise RuntimeError(
                    f"Trellis timeout ({settings.trellis_timeout_sec}s)\n"
                    + "\n".join(tail)
                )

            # 永続化スロットル
            now = time.monotonic()
            if now - last_save >= _SAVE_INTERVAL_SEC:
                last_save = now
                job_store.save()

        returncode = proc.wait()
    finally:
        # 最後のログを確実に永続化する
        job_store.save()

    # ループ終了後、キャンセルされていた場合
    if queue_manager.is_cancel_requested(job.job_id):
        raise TrellisCancelled()

    if returncode != 0:
        raise RuntimeError("Trellis failed:\n" + "\n".join(tail))


def _terminate(proc: subprocess.Popen) -> None:
    try:
        proc.terminate()
    except Exception:
        pass
    try:
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
