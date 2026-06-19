"use client";
import { useEffect, useState } from "react";
import type { PipelineStep } from "@/lib/api";
import { parseTs } from "@/lib/api";

const COLORS: Record<string, string> = {
  upload:  "text-yellow-400 border-yellow-400",
  upscale: "text-orange-400 border-orange-400",
  rembg:   "text-blue-400   border-blue-400",
  trellis: "text-purple-400 border-purple-400",
  blender: "text-teal-400   border-teal-400",
  godot:   "text-green-400  border-green-400",
};
const BG: Record<string, string> = {
  done:    "bg-green-400/5  border-green-400/15",
  running: "bg-blue-400/5   border-blue-400/20",
  error:   "bg-red-400/5    border-red-400/20",
  pending: "",
};

function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  const hasRunning = steps.some((s) => s.status === "running");
  const [now, setNow] = useState(() => Date.now());

  // running 中だけ 1 秒ごとに再描画する(終わったら interval を破棄)
  useEffect(() => {
    if (!hasRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  return (
    <div>
      {steps.map((s, i) => {
        const startedMs = s.status === "running" ? parseTs(s.started_at) : null;
        const elapsed = startedMs != null ? Math.max(0, Math.floor((now - startedMs) / 1000)) : null;
        return (
          <div key={s.step_id}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded border transition-all ${BG[s.status]} ${s.status === "pending" ? "opacity-40" : ""}`}>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-black flex-shrink-0 ${COLORS[s.step_id] ?? "text-neutral-400 border-neutral-400"}`}>
                {s.status === "done" ? "✓" : s.status === "error" ? "✕" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold">{s.label}</p>
                {s.detail && <p className="text-[9px] text-neutral-500 mt-0.5 truncate">{s.detail}</p>}
              </div>
              <span className={`text-[9px] font-bold flex-shrink-0 ${
                s.status === "done"    ? "text-green-400"  :
                s.status === "running" ? "text-blue-400"   :
                s.status === "error"   ? "text-red-400"    :
                "text-neutral-600"
              }`}>
                {s.status === "done"    ? "完了"   :
                 s.status === "running" ? (elapsed != null ? `実行中 ${fmtElapsed(elapsed)}` : "実行中") :
                 s.status === "error"   ? "エラー" :
                 "待機"}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-px h-1.5 bg-neutral-800 ml-[18px] my-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}
