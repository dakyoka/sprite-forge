"""
プロセス保護ユーティリティ。

目的:
- バックエンドが異常終了/再起動した際に取り残される TRELLIS 子プロセス
  (trellis_infer.py) を後始末する。孤児プロセスは 8GB GPU の VRAM を握り続け、
  次の推論をデッドロック/スラッシングさせる主因になる。

提供する機能:
1. kill_orphan_trellis(): 起動時に走らせ、生き残っている trellis_infer.py
   プロセスを強制終了する (psutil ベース、クロスプラットフォーム)。
2. assign_kill_on_close(proc): Windows の Job Object を使い、親(=この
   バックエンドプロセス)が死んだら子も道連れで OS に kill させる
   (ベストエフォート。失敗しても致命的ではない)。

注意: ここは揮発的なランタイム保護であり、設定値は持たない (SSOT は
config/settings.json)。
"""
import logging
import os

logger = logging.getLogger(__name__)

# 子プロセスを識別するためのコマンドラインのマーカー。
_TRELLIS_MARKER = "trellis_infer"


def kill_orphan_trellis() -> int:
    """
    生き残っている TRELLIS 推論サブプロセス(trellis_infer.py)を強制終了する。
    終了させたプロセス数を返す。psutil が無い/権限が無い場合は 0。

    起動時に呼ぶ前提。正常稼働中の子プロセスは存在しないはずなので、
    マーカーに一致する python プロセスは全て孤児とみなして kill する。
    """
    killed = 0
    try:
        import psutil
    except Exception as e:  # psutil 未導入でも起動は止めない
        logger.warning(f"psutil 不在のため孤児 TRELLIS の掃除をスキップ: {e}")
        return 0

    my_pid = os.getpid()
    victims = []
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if proc.info["pid"] == my_pid:
                continue
            cmdline = proc.info.get("cmdline") or []
            if any(_TRELLIS_MARKER in str(part) for part in cmdline):
                victims.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    for proc in victims:
        try:
            logger.warning(f"孤児 TRELLIS プロセスを終了します pid={proc.pid}")
            proc.kill()
            killed += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if victims:
        # kill 後の解放を少し待つ (VRAM が解放されるまでのラグ吸収)
        gone, alive = psutil.wait_procs(victims, timeout=5)
        for p in alive:
            try:
                p.kill()
            except Exception:
                pass

    return killed


def assign_kill_on_close(proc) -> object | None:
    """
    Windows: 子プロセスを「親が死んだら一緒に殺される」Job Object に割り当てる。
    親プロセス(このバックエンド)のハンドルが閉じる(=プロセス終了)と、OS が
    Job 内の全プロセスを kill する (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)。

    返り値: 生成した Job ハンドル(GC されないよう呼び出し側で保持すること)。
            Windows 以外 / 失敗時は None (致命的ではない、ベストエフォート)。
    """
    if os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("ReadOperationCount", ctypes.c_uint64),
                ("WriteOperationCount", ctypes.c_uint64),
                ("OtherOperationCount", ctypes.c_uint64),
                ("ReadTransferCount", ctypes.c_uint64),
                ("WriteTransferCount", ctypes.c_uint64),
                ("OtherTransferCount", ctypes.c_uint64),
            ]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
        JobObjectExtendedLimitInformation = 9

        kernel32.CreateJobObjectW.restype = wintypes.HANDLE
        hjob = kernel32.CreateJobObjectW(None, None)
        if not hjob:
            return None

        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        ok = kernel32.SetInformationJobObject(
            hjob,
            JobObjectExtendedLimitInformation,
            ctypes.byref(info),
            ctypes.sizeof(info),
        )
        if not ok:
            kernel32.CloseHandle(hjob)
            return None

        # Popen の Windows プロセスハンドルを Job に割り当てる
        handle = int(proc._handle)
        kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        ok = kernel32.AssignProcessToJobObject(hjob, handle)
        if not ok:
            kernel32.CloseHandle(hjob)
            return None

        return hjob
    except Exception as e:
        logger.warning(f"kill-on-close Job 割り当てに失敗 (続行): {e}")
        return None
