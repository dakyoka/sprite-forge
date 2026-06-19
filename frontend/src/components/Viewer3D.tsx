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

      {/* 3D object (placeholder — model-viewer で置き換え可) */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div
          ref={objRef}
          className="text-8xl"
          style={{ animation: "spin3d 8s linear infinite", filter: "drop-shadow(0 0 28px rgba(167,139,250,.35))" }}
        >
          {job?.status === "running" ? "⚙" : emoji}
        </div>
        <p className="text-[9px] text-neutral-700 uppercase tracking-wider">
          {job ? "↻ ドラッグで回転 · スクロールでズーム" : "画像をドロップすると 3D モデルがここに表示されます"}
        </p>
      </div>

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

      <style>{`@keyframes spin3d{from{transform:rotateY(0deg) rotateX(8deg)}to{transform:rotateY(360deg) rotateX(8deg)}}`}</style>
    </div>
  );
}
