"use client";
import { useState, useEffect } from "react";
import type { Job } from "@/lib/api";
import { inputUrl } from "@/lib/api";

interface Props {
  running: Job | null;
  queued: Job[];
  selectedId: string | null;
  onSelect: (job: Job) => void;
  onCancel: (jobId: string) => void;
  onReorder: (order: string[]) => void;
}

/**
 * 実行中ジョブ(先頭・ドラッグ不可)＋ キュー中ジョブ(ドラッグで並び替え)を表示する。
 * 並び替えはネイティブ HTML5 drag-and-drop のみ(外部依存なし)。
 * ドラッグ中はホバー先へ「よけて」リアルタイムに並びが入れ替わる(ライブプレビュー)。
 */
export default function QueuePane({ running, queued, selectedId, onSelect, onCancel, onReorder }: Props) {
  const [order, setOrder] = useState<string[]>(() => queued.map((j) => j.job_id));
  const [dragId, setDragId] = useState<string | null>(null);
  const dragging = dragId !== null;

  // ドラッグ中でない時だけ、ポーリング結果(queued)からローカル順を同期する
  useEffect(() => {
    if (!dragging) setOrder(queued.map((j) => j.job_id));
  }, [queued, dragging]);

  const byId = new Map(queued.map((j) => [j.job_id, j]));
  const orderedJobs = order.map((id) => byId.get(id)).filter((j): j is Job => !!j);

  const moveDragTo = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const cur = [...prev];
      const from = cur.indexOf(dragId);
      const to = cur.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      cur.splice(to, 0, cur.splice(from, 1)[0]);
      return cur;
    });
  };

  const handleDragEnd = () => {
    if (dragId) onReorder(order);
    setDragId(null);
  };

  const removeNow = (jobId: string) => {
    setOrder((prev) => prev.filter((id) => id !== jobId));
    onCancel(jobId);
  };

  if (!running && orderedJobs.length === 0) {
    return <p className="text-[9px] text-neutral-700 uppercase tracking-wider">キューは空です</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {running && (
        <div
          onClick={() => onSelect(running)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all cursor-pointer ${
            selectedId === running.job_id ? "bg-blue-400/10 border-blue-400/40" : "bg-blue-400/5 border-blue-400/25"
          }`}
        >
          <Thumb jobId={running.job_id} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate text-blue-300">{running.filename}</p>
            <p className="text-[9px] text-blue-400/70 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              処理中 {running.progress}%
            </p>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCancel(running.job_id); }}
            className="text-[9px] font-bold uppercase tracking-wider text-red-400 border border-red-400/30 bg-red-400/10 px-2 py-1 rounded hover:bg-red-400/20 transition-colors flex-shrink-0"
          >
            ■ 停止
          </button>
        </div>
      )}

      {orderedJobs.map((j, i) => (
        <div
          key={j.job_id}
          draggable
          onDragStart={() => setDragId(j.job_id)}
          onDragOver={(e) => { e.preventDefault(); moveDragTo(j.job_id); }}
          onDrop={(e) => { e.preventDefault(); handleDragEnd(); }}
          onDragEnd={handleDragEnd}
          onClick={() => onSelect(j)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-grab active:cursor-grabbing transition-all duration-150 ${
            selectedId === j.job_id ? "bg-neutral-800 border-neutral-600" :
            "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
          } ${dragId === j.job_id ? "opacity-30 ring-1 ring-yellow-400/60" : ""}`}
        >
          <span className="text-neutral-600 text-[10px] font-bold flex-shrink-0 w-3 text-center">{i + 1}</span>
          <Thumb jobId={j.job_id} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate">{j.filename}</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">待機中</p>
          </div>
          <span className="text-neutral-700 text-[11px] flex-shrink-0 select-none">⋮⋮</span>
          <button
            type="button"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeNow(j.job_id); }}
            className="text-[12px] font-bold text-neutral-500 hover:text-red-400 px-1.5 py-0.5 flex-shrink-0 transition-colors"
            title="キューから削除"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function Thumb({ jobId }: { jobId: string }) {
  return (
    <div className="w-9 h-9 flex-shrink-0 rounded bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={inputUrl(jobId)}
        alt=""
        className="w-full h-full object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
        draggable={false}
      />
    </div>
  );
}
