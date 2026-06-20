"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Job } from "@/lib/api";
import { outputUrl } from "@/lib/api";
import { getThumb, setThumb } from "@/lib/thumbCache";

// オフスクリーンのモデル正面キャプチャ(クライアント専用)。
const ThumbCapture = dynamic(() => import("./ThumbCapture"), { ssr: false });

function isCompletedGlb(j: Job): boolean {
  return j.status === "completed" && !!j.output_glb;
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/** サムネイル本体: キャプチャ済み PNG / キャプチャ中スピナー / 非完了プレースホルダ。 */
function Thumb({ job, thumb }: { job: Job; thumb: string | null }) {
  if (!isCompletedGlb(job)) return <span className="text-neutral-600 text-xl">▣</span>;
  if (thumb) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumb} alt={job.filename} className="w-full h-full object-contain" />;
  }
  return <div className="w-5 h-5 border-2 border-neutral-700 border-t-teal-400 rounded-full animate-spin" />;
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

/** お気に入りの星トグル。 */
function FavStar({ job, onToggle }: { job: Job; onToggle: (j: Job) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(job); }}
      title={job.favorite ? "お気に入り解除" : "お気に入りに追加"}
      aria-pressed={job.favorite}
      className={`text-[13px] leading-none transition-colors ${job.favorite ? "text-yellow-400" : "text-neutral-600 hover:text-neutral-300"}`}
    >
      {job.favorite ? "★" : "☆"}
    </button>
  );
}

/** 小さな削除ボタン(インライン確認付き)。 */
function DeleteBtn({ job, onDelete }: { job: Job; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-[8px] text-neutral-400">削除?</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(job.job_id); }}
          className="text-[9px] font-bold text-red-400 hover:text-red-300 px-1"
          title="削除する"
        >
          はい
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
          className="text-[9px] text-neutral-500 hover:text-neutral-300 px-1"
          title="やめる"
        >
          いいえ
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
      title="履歴から削除"
      className="text-neutral-600 hover:text-red-400 transition-colors p-0.5"
    >
      <TrashIcon />
    </button>
  );
}

interface Props {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (job: Job) => void;
  currentJob: Job | null;
  onDelete: (jobId: string) => void;
  onToggleFavorite: (job: Job) => void;
}

export default function HistoryPane({ jobs, selectedId, onSelect, currentJob, onDelete, onToggleFavorite }: Props) {
  const [view, setView] = useState<"list" | "gallery">("list");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const failedRef = useRef<Set<string>>(new Set());

  const allJobs = currentJob
    ? [currentJob, ...jobs.filter((j) => j.job_id !== currentJob.job_id)]
    : jobs;

  // 完了ジョブの並びが変わったらキャッシュ済みサムネイルを取り込む。
  const completedKey = allJobs.filter(isCompletedGlb).map((j) => j.job_id).join(",");
  useEffect(() => {
    setThumbs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const j of allJobs) {
        if (isCompletedGlb(j) && !next[j.job_id]) {
          const t = getThumb(j.job_id);
          if (t) { next[j.job_id] = t; changed = true; }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  // まだサムネイルが無い完了ジョブを 1 件ずつキャプチャする。
  const captureTarget = allJobs.find(
    (j) => isCompletedGlb(j) && !thumbs[j.job_id] && !failedRef.current.has(j.job_id),
  ) ?? null;

  // キャプチャが詰まる(ロード遅延・ハング)場合のバックストップ。
  useEffect(() => {
    if (!captureTarget) return;
    const id = captureTarget.job_id;
    const timer = setTimeout(() => {
      if (!getThumb(id)) {
        failedRef.current.add(id);
        setThumbs((p) => ({ ...p })); // 次の対象へ進めるため再描画
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [captureTarget]);

  const handleCaptured = (jobId: string, dataUrl: string | null) => {
    if (dataUrl) {
      setThumb(jobId, dataUrl);
      setThumbs((prev) => ({ ...prev, [jobId]: dataUrl }));
    } else {
      failedRef.current.add(jobId);
      setThumbs((prev) => ({ ...prev })); // 次の対象へ
    }
  };

  const filtered = favoritesOnly ? allJobs.filter((j) => j.favorite) : allJobs;
  const today = filtered.filter((j) => isToday(j.created_at));
  const older = filtered.filter((j) => !isToday(j.created_at));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="h-8 min-h-8 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[9px] font-black uppercase tracking-widest text-teal-400">≡ 履歴</span>
        <span className="text-[9px] text-neutral-600">{filtered.length} 件</span>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
            title={favoritesOnly ? "すべて表示" : "お気に入りのみ表示"}
            className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${
              favoritesOnly
                ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/30"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
          >
            {favoritesOnly ? "★ お気に入り" : "☆ お気に入り"}
          </button>
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
        {today.map((j) => (
          <JobItem key={j.job_id} job={j} view={view} selected={selectedId === j.job_id}
            thumb={thumbs[j.job_id] ?? null} onSelect={onSelect} onDelete={onDelete} onToggleFavorite={onToggleFavorite} />
        ))}

        {older.length > 0 && (
          <p className={`text-[8px] font-bold uppercase tracking-widest text-neutral-600 px-2 py-1 mt-2 ${view === "gallery" ? "col-span-2" : ""}`}>それ以前</p>
        )}
        {older.map((j) => (
          <JobItem key={j.job_id} job={j} view={view} selected={selectedId === j.job_id}
            thumb={thumbs[j.job_id] ?? null} onSelect={onSelect} onDelete={onDelete} onToggleFavorite={onToggleFavorite} />
        ))}

        {filtered.length === 0 && (
          <p className={`text-[9px] text-neutral-700 uppercase tracking-wider p-3 ${view === "gallery" ? "col-span-2" : ""}`}>
            {favoritesOnly ? "お気に入りはまだありません" : "まだ履歴がありません"}
          </p>
        )}
      </div>

      {/* オフスクリーンのサムネイルキャプチャ(常に最大 1 件) */}
      {captureTarget && (
        <ThumbCapture
          key={captureTarget.job_id}
          jobId={captureTarget.job_id}
          url={outputUrl(captureTarget.job_id)}
          onDone={handleCaptured}
        />
      )}
    </div>
  );
}

function JobItem({
  job, view, selected, thumb, onSelect, onDelete, onToggleFavorite,
}: {
  job: Job;
  view: "list" | "gallery";
  selected: boolean;
  thumb: string | null;
  onSelect: (j: Job) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (j: Job) => void;
}) {
  const time = new Date(job.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  if (view === "gallery") {
    return (
      <div onClick={() => onSelect(job)}
        className={`group relative flex flex-col rounded border cursor-pointer overflow-hidden transition-all ${selected ? "bg-neutral-800 border-neutral-600" : "border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700"}`}>
        <div className="relative w-full aspect-square bg-neutral-800/60 flex items-center justify-center overflow-hidden">
          <Thumb job={job} thumb={thumb} />
          <span className="absolute top-1 left-1"><FavStar job={job} onToggle={onToggleFavorite} /></span>
          <span className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/70 rounded">
            <DeleteBtn job={job} onDelete={onDelete} />
          </span>
        </div>
        <div className="flex items-center gap-1 px-1.5 py-1">
          <p className="text-[10px] font-semibold truncate flex-1 min-w-0">{job.filename.replace(/\.[^.]+$/, "")}</p>
          <Badge status={job.status} />
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => onSelect(job)}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-all ${selected ? "bg-neutral-800 border-neutral-700" : "border-transparent hover:bg-neutral-800/60 hover:border-neutral-800"}`}>
      <div className="w-14 h-14 flex-shrink-0 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
        <Thumb job={job} thumb={thumb} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold truncate">{job.filename.replace(/\.[^.]+$/, "")}</p>
        <p className="text-[9px] text-neutral-600 mt-0.5">{time} · GLB</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <FavStar job={job} onToggle={onToggleFavorite} />
        <DeleteBtn job={job} onDelete={onDelete} />
        <Badge status={job.status} />
      </div>
    </div>
  );
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
