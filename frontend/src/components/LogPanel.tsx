import { useEffect, useRef } from "react";
import type { Job } from "@/lib/api";

export default function LogPanel({ job }: { job: Job | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [job]);

  const lines = job
    ? job.steps.flatMap((s) => {
        const rows = [];
        if (s.status === "done")    rows.push({ type: "ok",  text: `${s.label} 完了 ${s.detail ? `— ${s.detail}` : ""}` });
        if (s.status === "running") rows.push({ type: "run", text: `${s.label} 処理中…` });
        if (s.status === "error")   rows.push({ type: "err", text: `${s.label} エラー: ${s.detail}` });
        return rows;
      })
    : [];

  const runningStep = job?.steps.find((s) => s.status === "running");

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed">
      {lines.length === 0 && !job && (
        <span className="text-neutral-700 uppercase tracking-widest text-[9px]">
          画像をドロップするとログがここに表示されます
        </span>
      )}
      {lines.length === 0 && job && (
        <span className="text-blue-400/60 text-[9px]">
          バックエンド接続中… ジョブ ID: {job.job_id.slice(0, 8)}
        </span>
      )}
      {lines.map((l, i) => (
        <div key={i}>
          <span className={
            l.type === "ok"  ? "text-green-400" :
            l.type === "run" ? "text-blue-400"  :
            "text-red-400"
          }>
            [{l.type === "ok" ? "OK" : l.type === "run" ? ">>" : "!!"}]
          </span>
          {"  "}
          <span className="text-neutral-300">{l.text}</span>
          {l.type === "run" && (
            <span className="inline-block w-1.5 h-2.5 bg-blue-400 align-text-bottom ml-0.5 animate-pulse" />
          )}
        </div>
      ))}
      {job?.status === "completed" && (
        <div className="mt-1 text-green-400">
          [OK]  パイプライン完了 → Godot フォルダへ書き出しました ✓
        </div>
      )}
      {job?.status === "failed" && (
        <div className="mt-1 text-red-400">
          [!!]  エラー: {job.error_msg}
        </div>
      )}
    </div>
  );
}
