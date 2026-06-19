"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import DropZone       from "@/components/DropZone";
import PipelineSteps  from "@/components/PipelineSteps";
import Viewer3D       from "@/components/Viewer3D";
import LogPanel       from "@/components/LogPanel";
import HistoryPane    from "@/components/HistoryPane";
import QueuePane      from "@/components/QueuePane";
import GpuBar         from "@/components/GpuBar";
import BackendStatus  from "@/components/BackendStatus";
import SettingsPanel  from "@/components/SettingsPanel";
import { startPipeline, listJobs, cancelJob, reorderQueue, type Job } from "@/lib/api";

const PIPELINE_NODES = [
  { label: "画像読込",      color: "text-yellow-400", dot: "bg-yellow-400" },
  { label: "Trellis 3D",   color: "text-purple-400", dot: "bg-purple-400" },
  { label: "Blender 後処理", color: "text-teal-400",  dot: "bg-teal-400"   },
  { label: "Godot 書き出し", color: "text-green-400", dot: "bg-green-400"  },
];

export default function Home() {
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab,  setMobileTab]  = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 全ジョブをポーリングする(キュー順を含む)
  const poll = useCallback(async () => {
    try {
      const all = await listJobs();
      setJobs(all);
    } catch {
      // バックエンド再起動などは無視(次のポーリングで復帰)
    }
  }, []);

  useEffect(() => {
    // 初回取得は then コールバック経由で行う(effect 本体での同期 setState を避ける)
    listJobs().then(setJobs).catch(() => {});
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [poll]);

  // 画像ドロップ/選択 → キューへ投入(複数可)
  const handleFile = useCallback(async (f: File) => {
    setError(null);
    try {
      const job = await startPipeline(f);
      setJobs((prev) => [...prev.filter((j) => j.job_id !== job.job_id), job]);
      setSelectedId(job.job_id);
      poll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [poll]);

  const handleCancel = useCallback(async (jobId: string) => {
    // 楽観更新: 即座にリストから除外(ポーリング待ちで残って見えるのを防ぐ)
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    try {
      await cancelJob(jobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      poll();
    }
  }, [poll]);

  const handleReorder = useCallback(async (order: string[]) => {
    // 楽観的更新: queued の並びをローカルで先に反映する
    setJobs((prev) => {
      const byId = new Map(prev.map((j) => [j.job_id, j]));
      const reordered = order.map((id) => byId.get(id)).filter((j): j is Job => !!j);
      const rest = prev.filter((j) => !order.includes(j.job_id));
      return [...reordered, ...rest];
    });
    try {
      await reorderQueue(order);
      poll();
    } catch {
      poll();
    }
  }, [poll]);

  const running = jobs.find((j) => j.status === "running") ?? null;
  const queued  = jobs.filter((j) => j.status === "queued");
  const history = jobs.filter((j) => j.status === "completed");

  const selectedJob = jobs.find((j) => j.job_id === selectedId) ?? running ?? null;
  const isProcessing = selectedJob?.status === "running" || selectedJob?.status === "queued";

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── HEADER ── */}
      <header className="h-10 min-h-10 bg-neutral-900 border-b border-neutral-800 flex items-center gap-2.5 px-3.5 flex-shrink-0">
        <span className="text-[13px] font-black tracking-[.18em] uppercase text-yellow-400">SpriteForge</span>
        <span className="text-[10px] text-neutral-700">(SF)</span>
        <span className="text-neutral-700 mx-1">|</span>
        <span className="text-[9px] uppercase tracking-widest text-neutral-600 hidden sm:block">2D スプライト → 3D モデル 全自動パイプライン</span>

        {/* pipeline breadcrumb */}
        <div className="hidden lg:flex items-center mx-auto gap-0.5">
          {PIPELINE_NODES.map((n, i) => {
            const step = selectedJob?.steps[i];
            const isLit = step?.status === "running";
            return (
              <div key={n.label} className="flex items-center gap-0.5">
                <div className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm ${n.color} ${isLit ? "bg-white/5" : ""}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${n.dot} ${isLit ? "animate-pulse" : "opacity-30"}`} />
                  {n.label}
                </div>
                {i < PIPELINE_NODES.length - 1 && <span className="text-neutral-700 text-[10px]">→</span>}
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <BackendStatus />
          <button
            onClick={() => setShowSettings(true)}
            className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 border border-neutral-700 bg-neutral-800 px-2.5 py-1 rounded hover:text-white transition-colors">
            ⚙ Config
          </button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANE ── */}
        <aside className={`w-[400px] min-w-[400px] bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-hidden ${mobileTab !== 0 ? "hidden lg:flex" : "flex"}`}>
          <div className="h-8 min-h-8 bg-neutral-900/80 border-b border-neutral-800 flex items-center px-3 gap-2 flex-shrink-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400">◈ Generation</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2">素材画像</p>
              <DropZone onFile={handleFile} currentFile={null} />
            </div>

            {/* error */}
            {error && (
              <div className="bg-red-400/8 border border-red-400/25 rounded p-3 text-[10px] text-red-400">
                ⚠ {error}
              </div>
            )}

            {/* queue */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                処理キュー {(running ? 1 : 0) + queued.length > 0 && <span className="text-neutral-600">({(running ? 1 : 0) + queued.length})</span>}
              </p>
              <QueuePane
                running={running}
                queued={queued}
                selectedId={selectedId}
                onSelect={(j) => setSelectedId(j.job_id)}
                onCancel={handleCancel}
                onReorder={handleReorder}
              />
            </div>

            {/* pipeline */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2">パイプライン進行状況</p>
              {selectedJob ? (
                <PipelineSteps steps={selectedJob.steps} />
              ) : (
                <p className="text-[9px] text-neutral-700 uppercase tracking-wider">処理待ち</p>
              )}
            </div>

            {/* progress bar */}
            {selectedJob && (
              <div>
                <div className="flex justify-between text-[9px] mb-1">
                  <span className="text-neutral-600">進捗</span>
                  <span className={isProcessing ? "text-blue-400 font-bold" : "text-green-400 font-bold"}>
                    {selectedJob.progress}%
                    {isProcessing && " — 処理中"}
                    {selectedJob.status === "completed" && " — 完了"}
                    {selectedJob.status === "cancelled" && " — 中止"}
                  </span>
                </div>
                <div className="h-1 bg-neutral-800 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all duration-500 ${
                      isProcessing ? "bg-blue-400" :
                      selectedJob.status === "completed" ? "bg-green-400" :
                      selectedJob.status === "cancelled" ? "bg-neutral-500" : "bg-red-400"
                    }`}
                    style={{ width: `${selectedJob.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── CENTER PANE ── */}
        <main className={`flex-1 bg-neutral-950 flex flex-col overflow-hidden min-w-0 ${mobileTab !== 1 ? "hidden lg:flex" : "flex"}`}>
          <div className="flex-1 overflow-hidden">
            <Viewer3D job={selectedJob} />
          </div>
          {/* log */}
          <div className="h-36 min-h-36 bg-neutral-900 border-t border-neutral-800 flex flex-col overflow-hidden">
            <div className="h-7 min-h-7 flex items-center px-3 gap-2 border-b border-neutral-800 flex-shrink-0">
              {isProcessing && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              <span className={`text-[9px] font-bold uppercase tracking-widest ${isProcessing ? "text-blue-400" : "text-neutral-600"}`}>実行ログ</span>
              {selectedJob && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-24 h-0.5 bg-neutral-800 rounded overflow-hidden">
                    <div className={`h-full rounded transition-all duration-500 ${isProcessing ? "bg-blue-400" : "bg-green-400"}`} style={{ width: `${selectedJob.progress}%` }} />
                  </div>
                  <span className={`text-[9px] font-bold ${isProcessing ? "text-blue-400" : "text-green-400"}`}>{selectedJob.progress}%</span>
                </div>
              )}
            </div>
            <LogPanel job={selectedJob} />
          </div>
        </main>

        {/* ── RIGHT PANE ── */}
        <aside className={`w-[348px] min-w-[348px] bg-neutral-900 border-l border-neutral-800 overflow-hidden ${mobileTab !== 2 ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
          <HistoryPane
            jobs={history}
            currentJob={running}
            selectedId={selectedId}
            onSelect={(j) => setSelectedId(j.job_id)}
          />
        </aside>

        {/* ── MOBILE SETTINGS PANE (タブ 3) ── */}
        <aside className={`lg:hidden flex-1 bg-neutral-900 overflow-hidden ${mobileTab === 3 ? "flex flex-col" : "hidden"}`}>
          <div className="h-8 min-h-8 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 flex-shrink-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400">⚙ 設定 (実効値)</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-20">
            <SettingsPanel />
          </div>
        </aside>
      </div>

      {/* ── GPU 右下フローティング (PCのみ・控えめ表示) ── */}
      <div className="hidden lg:block fixed bottom-0 right-0 z-40 w-[348px] bg-neutral-900/95 backdrop-blur border-t border-l border-neutral-800 rounded-tl-lg px-4 py-3 shadow-xl">
        <p className="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mb-2">GPU リソース</p>
        <GpuBar />
      </div>

      {/* ── 設定モーダル (デスクトップ Config ボタン) ── */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-black uppercase tracking-widest text-yellow-400">⚙ 設定 (実効値)</span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-neutral-500 hover:text-white text-sm leading-none px-1"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <SettingsPanel />
          </div>
        </div>
      )}

      {/* ── MOBILE NAV ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-neutral-900 border-t border-neutral-800 flex z-50">
        {[["◈", "生成"], ["▣", "3D"], ["≡", "履歴"], ["⚙", "設定"]].map(([icon, label], i) => (
          <button key={i} onClick={() => setMobileTab(i)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileTab === i ? "text-yellow-400" : "text-neutral-600"}`}>
            <span className="text-lg">{icon}</span>
            <span className="text-[8px] font-bold uppercase tracking-wider">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
