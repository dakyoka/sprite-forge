"use client";
import { useState, useEffect, useCallback } from "react";

/**
 * バックエンド(FastAPI)の稼働状態を表示し、停止中なら起動ボタンを出す。
 * 状態確認・起動は Next.js の /api/backend ルート経由で行う。
 */
export default function BackendStatus() {
  const [running, setRunning]   = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);

  const check = useCallback(async () => {
    try {
      const res  = await fetch("/api/backend", { cache: "no-store" });
      const data = await res.json();
      setRunning(!!data.running);
    } catch {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, [check]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      await fetch("/api/backend", { method: "POST" });
    } catch {
      /* noop: 状態は下の check で反映 */
    } finally {
      await check();
      setStarting(false);
    }
  }, [check]);

  const dotColor =
    running === null ? "bg-neutral-600" : running ? "bg-green-400" : "bg-red-400";
  const label =
    running === null ? "確認中" : running ? "Backend 稼働中" : "Backend 停止中";

  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${running ? "animate-pulse" : ""}`} />
      <span className="text-[9px] uppercase tracking-wider text-neutral-500 hidden sm:block">{label}</span>
      {running === false && (
        <button
          onClick={start}
          disabled={starting}
          className="text-[9px] font-bold uppercase tracking-wider text-green-400 border border-green-400/40 bg-green-400/10 px-2.5 py-1 rounded hover:bg-green-400/20 transition-colors disabled:opacity-50"
        >
          {starting ? "起動中…" : "▶ Backend 起動"}
        </button>
      )}
    </div>
  );
}
