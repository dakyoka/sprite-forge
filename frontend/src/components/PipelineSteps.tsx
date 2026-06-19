import type { PipelineStep } from "@/lib/api";

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

export default function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <div>
      {steps.map((s, i) => (
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
               s.status === "running" ? "実行中" :
               s.status === "error"   ? "エラー" :
               "待機"}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-px h-1.5 bg-neutral-800 ml-[18px] my-0.5" />
          )}
        </div>
      ))}
    </div>
  );
}
