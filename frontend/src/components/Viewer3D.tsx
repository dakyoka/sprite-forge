"use client";
import { useEffect, useRef } from "react";
import type { Job } from "@/lib/api";
import { outputUrl, inputUrl } from "@/lib/api";

interface Props {
  job: Job | null;
}

// model-viewer はカスタム要素。TypeScript を満たすためにキャストする(any は使わない)。
const ModelViewer = "model-viewer" as unknown as React.FC<
  React.HTMLAttributes<HTMLElement> & {
    src: string;
    "camera-controls"?: boolean | string;
    "auto-rotate"?: boolean | string;
    "auto-rotate-delay"?: string;
    "rotation-per-second"?: string;
    "shadow-intensity"?: string;
    exposure?: string;
    "environment-image"?: string;
    ar?: boolean;
    ref?: React.Ref<HTMLElement>;
  }
>;

function fmtNum(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Viewer3D({ job }: Props) {
  const mvRef = useRef<HTMLElement>(null);

  // Web コンポーネントをクライアント側で登録する
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

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
          <a href={outputUrl(job.job_id)} download
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

      {/* processing state (queued or running) — 入力画像のサムネイルを表示 */}
      {(job?.status === "running" || job?.status === "queued") && (
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="relative w-40 h-40 rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inputUrl(job.job_id)}
              alt={job.filename}
              className="w-full h-full object-contain opacity-80"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
            />
            {job.status === "running" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-10 h-10 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
          <p className="text-[10px] text-blue-400 uppercase tracking-wider">
            {job.status === "queued" ? "キュー待機中…" : "処理中…"}
          </p>
        </div>
      )}

      {/* completed — real 3D model */}
      {job && job.status === "completed" && job.output_glb && (
        <ModelViewer
          key={job.job_id}
          ref={mvRef}
          src={outputUrl(job.job_id)}
          camera-controls
          auto-rotate
          auto-rotate-delay="0"
          rotation-per-second="18deg"
          shadow-intensity="1"
          exposure="0.9"
          style={{ width: "100%", height: "100%" }}
        />
      )}

      {/* failed state */}
      {job && job.status === "failed" && (
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="text-6xl" style={{ filter: "drop-shadow(0 0 18px rgba(248,113,113,.4))" }}>⚠</div>
          <p className="text-[10px] text-red-400 uppercase tracking-wider">生成に失敗しました</p>
        </div>
      )}

      {/* cancelled state */}
      {job && job.status === "cancelled" && (
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="text-5xl text-neutral-600">■</div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider">処理を中止しました</p>
        </div>
      )}

      {/* stats */}
      {job?.status === "completed" && (
        <div className="absolute bottom-2.5 left-2.5 flex gap-1.5 z-10">
          {([
            ["🔷", "頂点", fmtNum(job.vertices)],
            ["🔶", "ポリゴン", fmtNum(job.faces)],
            ["💾", "サイズ", fmtSize(job.glb_size)],
            ["📄", "形式", "GLB"],
          ] as const).map(([icon, label, value]) => (
            <div key={label} className="bg-black/80 border border-neutral-700 px-2 py-1 rounded text-center">
              <p className="text-[11px] font-bold text-neutral-200">{value}</p>
              <p className="text-[8px] text-neutral-600 uppercase tracking-wider">{icon} {label}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
