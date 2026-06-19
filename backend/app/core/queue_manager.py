"""
ジョブキュー管理(単一 GPU・FIFO・1 件ずつ処理)。

- 永続化される正本は job_store の `jobs` dict と各 Job の status。
- ここで管理するのは「実行順序(queued の並び)」「実行中ジョブ」
  「実行中サブプロセスのハンドル」「キャンセル要求フラグ」という
  揮発的なランタイム状態のみ。
- ワーカーは 1 本だけ動く前提なので、threading.Lock で十分なスレッド安全性を確保する
  (subprocess の読み取りスレッドと async ワーカーの両方から触られるため)。

注意: バックエンド再起動時、ここのランタイム状態は失われる。再起動後は
job_store 側で queued のままのジョブを main.py の起動処理で再エンキューする。
"""
import threading

_lock = threading.RLock()

# queued ジョブ ID を順序付きで保持する(先頭が次に処理される)。
_queue: list[str] = []

# 現在実行中のジョブ ID(なければ None)。
_running: str | None = None

# 実行中 TRELLIS サブプロセス(Popen)。キャンセル時に terminate する。
_proc = None  # subprocess.Popen | None

# キャンセル要求が出ているジョブ ID の集合。
_cancel_requested: set[str] = set()

# ワーカーを起こすためのイベント。エンキュー時に set する。
wake_event = None  # asyncio.Event。main.py 側で生成して差し込む
wake_loop = None   # asyncio の event loop。別スレッドから安全に set するために使う


def enqueue(job_id: str) -> None:
    with _lock:
        if job_id not in _queue:
            _queue.append(job_id)


def dequeue_next() -> str | None:
    """次に処理すべき queued ジョブ ID を取り出して返す(キューから除去)。"""
    with _lock:
        if _queue:
            return _queue.pop(0)
        return None


def peek_next() -> str | None:
    with _lock:
        return _queue[0] if _queue else None


def remove(job_id: str) -> bool:
    """queued から除去する。除去できたら True。"""
    with _lock:
        if job_id in _queue:
            _queue.remove(job_id)
            return True
        return False


def queued_ids() -> list[str]:
    with _lock:
        return list(_queue)


def reorder(order: list[str]) -> list[str]:
    """
    queued リストを `order` の並びに合わせて並べ替える。
    - order 内の、現在 queued でない ID は無視する。
    - order に含まれない queued ID は、現在の相対順を保って末尾に残す。
    新しい順序を返す。
    """
    with _lock:
        current = set(_queue)
        new_order = [jid for jid in order if jid in current]
        seen = set(new_order)
        for jid in _queue:
            if jid not in seen:
                new_order.append(jid)
                seen.add(jid)
        _queue[:] = new_order
        return list(_queue)


def set_running(job_id: str | None) -> None:
    global _running
    with _lock:
        _running = job_id


def clear_running() -> None:
    global _running, _proc
    with _lock:
        _running = None
        _proc = None


def get_running() -> str | None:
    with _lock:
        return _running


def register_proc(proc) -> None:
    global _proc
    with _lock:
        _proc = proc


def get_proc():
    with _lock:
        return _proc


def request_cancel(job_id: str) -> None:
    with _lock:
        _cancel_requested.add(job_id)


def is_cancel_requested(job_id: str) -> bool:
    with _lock:
        return job_id in _cancel_requested


def clear_cancel(job_id: str) -> None:
    with _lock:
        _cancel_requested.discard(job_id)


def terminate_running_proc() -> None:
    """実行中サブプロセスを terminate(→ 効かなければ kill)する。"""
    with _lock:
        proc = _proc
    if proc is None:
        return
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
