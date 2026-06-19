"use client";
import { useEffect, useState } from "react";
import type { Job } from "@/lib/api";
import { outputUrl } from "@/lib/api";

// model-viewer はカスタム要素。Viewer3D と同じキャスト方針で型を満たす(any 不使用)。
const ModelViewer = "model-viewer" as unknown as React.FC<
  React.HTMLAttributes<HTMLElement> & {
    src: string;
    "camera-controls"?: boolean | string;
    "disable-zoom"?: boolean | string;
    "interaction-prompt"?: string;
    "auto-rotate"?: boolean | string;
    exposure?: string;
    loading?: string;
    reveal?: string;
  }
>;

/** 完了済みジョブの GLB を小さなライブ 3D プレビューとして描画する。 */
function GlbThumb({ jobId, size }: { jobId: string; size: number }) {
  useEffect(() => {
    import("@google/model-viewer");
  }, []);
  return (
    <ModelViewer
      src={outputUrl(jobId)}
      camera-controls={false}
      disable-zoom
      interaction-prompt="none"
      exposure="0.9"
      loading="lazy"
      reveal="auto"
      style={{ width: `${size}px`, height: `${size}px`, ["--poster-color" as string]: "transparent" }}
    />
  );
}

function Badge({ status }: { status: Job["status"] }) {
  const map: Record<Job["status"], string> = {
    completed: "bg-green-400/10 text-green-400",
    running:   "bg-blue-400/10  text-blue-400",
    queued:    "bg-neutral-700  text-neutral-400",
    failed:    "bg-red-400/10   text-red-400",
    cancelled: "bg-neutral-700  text-neutral-400",
  };
  const label: Record<Job["status"], string> = { completed: "完了", running: "処理中", queued: "待機中", failed: "失敗", cancelled: "中止" };
  return (
    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${map[status]}`}>
      {label[status]}
    </span>
  );
}

interface Props {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (job: Job) => void;
  currentJob: Job | null;
}

export default function HistoryPane({ jobs, selectedId, onSelect, currentJob }: Props) {
  const [view, setView] = useState<"list" | "gallery">("list");

  const allJobs = currentJob
    ? [currentJob, ...jobs.filter((j) => j.job_id !== currentJob.job_id)]
    : jobs;

  const today  = allJobs.filter((j) => isToday(j.created_at));
  const older  = allJobs.filter((j) => !isToday(j.created_at));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="h-8 min-h-8 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[9px] font-black uppercase tracking-widest text-teal-400">≡ 履歴</span>
        <span className="text-[9px] text-neutral-600 ml-auto mr-2">{allJobs.length} 件</span>
        <div className="flex gap-1">
          {(["list", "gallery"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${
                view === v
                  ? "bg-teal-400/10 text-teal-400 border-teal-400/30"
                  : "bg-neutral-800 text-neutral-500 border-neutral-700"
              }`}>
              {v === "list" ? "☰ リスト" : "⊞ ギャラリー"}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      <div className={`flex-1 overflow-y-auto p-2 ${view === "gallery" ? "grid grid-cols-2 gap-2 content-start" : "flex flex-col gap-1"}`}>
        {today.length > 0 && (
          <p className={`text-[8px] font-bold uppercase tracking-widest text-neutral-600 px-2 py-1 ${view === "gallery" ? "col-span-2" : ""}`}>今日</p>
        )}
        {today.map((j) => <JobItem key={j.job_id} job={j} view={view} selected={selectedId === j.job_id} onSelect={onSelect} />)}

        {older.length > 0 && (
          <p className={`text-[8px] font-bold uppercase tracking-widest text-neutral-600 px-2 py-1 mt-2 ${view === "gallery" ? "col-span-2" : ""}`}>それ以前</p>
        )}
        {older.map((j) => <JobItem key={j.job_id} job={j} view={view} selected={selectedId === j.job_id} onSelect={onSelect} />)}

        {allJobs.length === 0 && (
          <p className={`text-[9px] text-neutral-700 uppercase tracking-wider p-3 ${view === "gallery" ? "col-span-2" : ""}`}>
            まだ履歴がありません
          </p>
        )}
      </div>
    </div>
  );
}

function JobItem({ job, view, selected, onSelect }: { job: Job; view: "list" | "gallery"; selected: boolean; onSelect: (j: Job) => void }) {
  const time  = new Date(job.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const hasGlb = job.status === "completed" && !!job.output_glb;

  if (view === "gallery") {
    return (
      <div onClick={() => onSelect(job)}
        className={`flex flex-col items-center gap-1.5 p-2 rounded border cursor-pointer transition-all ${selected ? "bg-neutral-800 border-neutral-600" : "border-transparent hover:bg-neutral-800 hover:border-neutral-700"}`}>
        <div className="w-full h-16 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
          {hasGlb ? <GlbThumb jobId={job.job_id} size={64} /> : <span className="text-neutral-600 text-2xl">▣</span>}
        </div>
        <p className="text-[10px] font-semibold text-center truncate w-full">{job.filename.replace(/\.[^.]+$/, "")}</p>
        <p className="text-[8px] text-neutral-600">{time}</p>
        <Badge status={job.status} />
      </div>
    );
  }

  return (
    <div onClick={() => onSelect(job)}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-all ${selected ? "bg-neutral-800 border-neutral-700" : "border-transparent hover:bg-neutral-800/60 hover:border-neutral-800"}`}>
      <div className="w-12 h-12 flex-shrink-0 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
        {hasGlb ? <GlbThumb jobId={job.job_id} size={48} /> : <span className="text-neutral-600 text-lg">▣</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold truncate">{job.filename.replace(/\.[^.]+$/, "")}</p>
        <p className="text-[9px] text-neutral-600 mt-0.5">{time} · GLB</p>
      </div>
      <Badge status={job.status} />
    </div>
  );
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
