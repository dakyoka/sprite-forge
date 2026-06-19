"""
Step 4: Microsoft TRELLIS 2D→3D generation
Requirements: H:/TRELLIS cloned, CUDA torch installed.
GPU 適応: VRAM を自動検出し settings.json の gpu_presets から
推論パラメータ(steps/texture_size/bake_mode/fp16)を選択する。
8GB(low) / 12-16GB(standard) / 16GB+(high) に対応。
"""
import asyncio
import os
import queue as _queue
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path

from app.core.config import settings
from app.core import job_store, process_guard, queue_manager
from app.models.job import Job

_TRELLIS_SCRIPT = Path(__file__).parent / "trellis_infer.py"

_MAX_LOG_LINES = 300       # job.logs に保持する最大行数
_SAVE_INTERVAL_SEC = 1.5   # ログ反映の永続化スロットル間隔
_POLL_INTERVAL_SEC = 0.25  # キャンセル/タイムアウト監視のウォールクロック周期


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
    if settings.trellis_max_voxels is not None:
        cmd += ["--max-voxels", str(settings.trellis_max_voxels)]

    # サブプロセスをライブストリーミングで実行する(別スレッドで読み取る)。
    # async ループを塞がないよう asyncio.to_thread で回す。
    try:
        await asyncio.to_thread(_run_streaming, cmd, env, job)
    except TrellisCancelled:
        # キャンセル起因。run_pipeline 側で cancelled 扱いになるよう再送出する。
        from app.services.pipeline_runner import JobCancelled
        raise JobCancelled()

    return out_glb


def _reader_loop(stream, line_q: "_queue.Queue", done: threading.Event) -> None:
    """
    別スレッドでパイプを読み、行を line_q へ流し込む。

    tqdm の進捗は復帰文字 `\r` で同じ行を上書き更新するため、`\n` 区切りだけ
    読むとサンプリング段の間まったく行が確定せず UI が固まる。ここでは `\r` と
    `\n` の両方を行区切りとして扱い、進捗更新も 1 行ずつ捕捉する。
    """
    try:
        buf = []
        while True:
            ch = stream.read(1)
            if ch == "":
                break  # EOF (プロセス終了)
            if ch in ("\r", "\n"):
                if buf:
                    line_q.put("".join(buf))
                    buf = []
            else:
                buf.append(ch)
        if buf:
            line_q.put("".join(buf))
    except Exception:
        pass
    finally:
        done.set()


def _run_streaming(cmd: list[str], env: dict, job: Job) -> None:
    """
    Popen で起動し、stdout/stderr(マージ)をライブで読みながら job.logs に追記する。

    Bug A 対策: 行の到着を待たずに、キャンセル/タイムアウト/永続化を
    ウォールクロック周期(_POLL_INTERVAL_SEC)で判定する。パイプ読み取りは
    専用スレッドで行い、メインスレッドはポーリングに専念するので、tqdm が
    `\r` だけで更新し改行を出さないサンプリング段でも、キャンセルボタン・
    タイムアウト・ログ保存が滞らない。

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
    # 親(このバックエンド)が死んだら子 TRELLIS も道連れにする (Windows, ベストエフォート)。
    _kill_on_close_job = process_guard.assign_kill_on_close(proc)  # noqa: F841 (GC 防止で保持)

    start = time.monotonic()
    last_save = 0.0
    tail = deque(maxlen=50)  # 失敗時のエラーメッセージ用

    line_q: "_queue.Queue[str]" = _queue.Queue()
    reader_done = threading.Event()
    assert proc.stdout is not None
    reader = threading.Thread(
        target=_reader_loop, args=(proc.stdout, line_q, reader_done), daemon=True
    )
    reader.start()

    cancelled = False
    timed_out = False

    def _drain() -> None:
        """キューに溜まった行を job.logs / tail へ移す。"""
        while True:
            try:
                line = line_q.get_nowait()
            except _queue.Empty:
                return
            if not line:
                continue
            tail.append(line)
            job.logs.append(line)
            if len(job.logs) > _MAX_LOG_LINES:
                del job.logs[: len(job.logs) - _MAX_LOG_LINES]

    try:
        while True:
            _drain()

            # --- 行の到着に依存しないウォールクロック監視 ---
            # キャンセル要求のチェック
            if queue_manager.is_cancel_requested(job.job_id):
                _terminate(proc)
                cancelled = True
                break

            # タイムアウト監視
            if time.monotonic() - start > settings.trellis_timeout_sec:
                _terminate(proc)
                timed_out = True
                break

            # 永続化スロットル
            now = time.monotonic()
            if now - last_save >= _SAVE_INTERVAL_SEC:
                last_save = now
                job_store.save()

            # 正常終了: プロセス終了 かつ 読み取り完了 かつ 取りこぼしなし
            if proc.poll() is not None and reader_done.is_set() and line_q.empty():
                break

            time.sleep(_POLL_INTERVAL_SEC)

        # ループを抜けたら残りを確実に取り込む
        reader_done.wait(timeout=5)
        _drain()
        returncode = proc.wait()
    finally:
        # 最後のログを確実に永続化する
        job_store.save()

    if cancelled or queue_manager.is_cancel_requested(job.job_id):
        raise TrellisCancelled()

    if timed_out:
        raise RuntimeError(
            f"Trellis timeout ({settings.trellis_timeout_sec}s)\n" + "\n".join(tail)
        )

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
