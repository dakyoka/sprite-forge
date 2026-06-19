"use client";
import { useEffect, useRef } from "react";
import type { Job } from "@/lib/api";

interface Props {
  job: Job | null;
}

export default function Viewer3D({ job }: Props) {
  const objRef = useRef<HTMLDivElement>(null);

  const emoji = job?.filename
    ? job.filename.toLowerCase().includes("church") ? "⛪"
    : job.filename.toLowerCase().includes("shop")   ? "🏪"
    : job.filename.toLowerCase().includes("gate")   ? "🏰"
    : job.filename.toLowerCase().includes("shrine") ? "⛩"
    : "🏠"
    : "🏗";

  return (
    <div className="w-full h-full bg-[#030303] relative overflow-hidden flex flex-col items-center justify-center">
      {/* grid */}
      <div className="absolute inset-0 opacity-[0.14]"
        style={{ backgroundImage: "linear-gradient(#2a2a2a 1px,transparent 1px),linear-gradient(90deg,#2a2a2a 1px,transparent 1px)", backgroundSize: "42px 42px" }}
      />

      {/* badge */}
      <div className="absolute top-2.5 left-2.5 bg-purple-400/12 border border-purple-400/24 text-purple-400 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded z-10">
        ▣ 3D プレビュー
      </div>

      {/* controls */}
      <div className="absolute top-2.5 right-2.5 flex gap-1 z-10">
        <button className="bg-black/75 border border-neutral-700 text-neutral-500 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded hover:text-white transition-colors">
          Wireframe
        </button>
        <button className="bg-black/75 border border-neutral-700 text-neutral-500 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded hover:text-white transition-colors">
          Reset
        </button>
        {job?.output_glb && (
          <a href={`/api/output/${job.job_id}`}
            className="bg-black/75 border border-purple-400/30 text-purple-400 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded hover:text-purple-300 transition-colors">
            GLB ↓
          </a>
        )}
      </div>

      {/* empty state */}
      {!job && (
        <div className="relative z-10 flex flex-col items-center gap-3 text-center px-8">
          <div className="w-16 h-16 rounded-xl border border-neutral-800 bg-neutral-900/60 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-neutral-700">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <p className="text-[10px] text-neutral-700 uppercase tracking-wider leading-relaxed">
            画像をドロップすると<br/>3D モデルがここに表示されます
          </p>
        </div>
      )}

      {/* processing state (queued or running) */}
      {(job?.status === "running" || job?.status === "queued") && (
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-[10px] text-blue-400 uppercase tracking-wider">処理中…</p>
        </div>
      )}

      {/* completed or failed — show 3D placeholder */}
      {job && job.status !== "running" && job.status !== "queued" && (
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div
            ref={objRef}
            className="text-8xl"
            style={{ filter: "drop-shadow(0 0 28px rgba(167,139,250,.35))" }}
          >
            {emoji}
          </div>
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider">↻ ドラッグで回転 · スクロールでズーム</p>
        </div>
      )}

      {/* stats */}
      {job?.status === "completed" && (
        <div className="absolute bottom-2.5 left-2.5 flex gap-1.5 z-10">
          {[["🔷", "頂点"], ["🔶", "ポリゴン"], ["💾", "サイズ"], ["📄", "形式"]].map(([icon, label], i) => (
            <div key={i} className="bg-black/80 border border-neutral-700 px-2 py-1 rounded text-center">
              <p className="text-[11px] font-bold text-neutral-200">{["18,452","36,904","2.1 MB","GLB"][i]}</p>
              <p className="text-[8px] text-neutral-600 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
