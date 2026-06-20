"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Job } from "@/lib/api";
import { outputUrl, inputUrl } from "@/lib/api";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ENVIRONMENTS, DEFAULT_ENV, type EnvId } from "./environments";

interface Props {
  job: Job | null;
}

// three / r3f はクライアント専用。SSR を避けるため動的 import する。
const ModelCanvas = dynamic(() => import("./ModelCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
    </div>
  ),
});

// 環境切り替えのクロム球サムネイル(r3f)。クライアント専用。
const EnvBall = dynamic(() => import("./EnvBall"), { ssr: false });

function fmtNum(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ダークテーマのコントロールチップ
const chipBase =
  "border px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors";
const chipIdle =
  "bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500";
const chipActive = "bg-purple-500 border-purple-500 text-white hover:bg-purple-600";

// ライティングのデフォルト値(初期状態でしっかり見えるように)
// 環境光は IBL(scene.environmentIntensity)の強さ。1.0 を基準にする。
const DEFAULT_AMBIENT = 1.0;
const DEFAULT_KEY = 2.6;
const DEFAULT_EXPOSURE = 1.0;

export default function Viewer3D({ job }: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 自動回転はデフォルト OFF。
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showLights, setShowLights] = useState(false);

  // ライティング(実際にレンダリングへ反映される値)
  const [ambient, setAmbient] = useState(DEFAULT_AMBIENT);
  const [keyLight, setKeyLight] = useState(DEFAULT_KEY);
  const [exposure, setExposure] = useState(DEFAULT_EXPOSURE);

  // 選択中の環境(IBL/背景)
  const [envId, setEnvId] = useState<EnvId>(DEFAULT_ENV);

  const handleReset = () => {
    // OrbitControls の保存状態(初回フレーミング)へ戻す。
    controlsRef.current?.reset();
  };

  const isCompleted = job?.status === "completed" && !!job.output_glb;

  return (
    <div className="w-full h-full bg-[#0a0a0a] relative overflow-hidden flex flex-col items-center justify-center">
      {/* badge */}
      <div className="absolute top-2.5 left-2.5 bg-purple-400/12 border border-purple-400/24 text-purple-400 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded z-10">
        ▣ 3D プレビュー
      </div>

      {/* controls */}
      <div className="absolute top-2.5 right-2.5 flex gap-1 z-10">
        {isCompleted && (
          <>
            <button
              onClick={() => setAutoRotate((v) => !v)}
              aria-pressed={autoRotate}
              title="自動回転"
              className={`${chipBase} ${autoRotate ? chipActive : chipIdle}`}
            >
              ↻ 自動回転
            </button>
            <button
              onClick={() => setWireframe((v) => !v)}
              aria-pressed={wireframe}
              title="ワイヤーフレーム表示"
              className={`${chipBase} ${wireframe ? chipActive : chipIdle}`}
            >
              Wireframe
            </button>
            <button onClick={handleReset} title="視点をリセット" className={`${chipBase} ${chipIdle}`}>
              Reset
            </button>
            <button
              onClick={() => setShowLights((v) => !v)}
              aria-pressed={showLights}
              title="ライティング設定"
              className={`${chipBase} ${showLights ? chipActive : chipIdle}`}
            >
              ☀ Light
            </button>
          </>
        )}
        {job?.output_glb && (
          <a
            href={outputUrl(job.job_id)}
            download
            className={`${chipBase} bg-purple-400/12 border-purple-400/40 text-purple-300 hover:bg-purple-400/20 hover:text-purple-200`}
          >
            GLB ↓
          </a>
        )}
      </div>

      {/* lighting panel */}
      {isCompleted && showLights && (
        <div className="absolute top-12 right-2.5 w-44 bg-neutral-900/90 border border-neutral-700 rounded-md p-3 z-20 backdrop-blur-sm flex flex-col gap-3 shadow-xl">
          <LightSlider
            label="環境光 (IBL)"
            value={ambient}
            min={0}
            max={3}
            step={0.05}
            onChange={setAmbient}
          />
          <LightSlider
            label="キーライト"
            value={keyLight}
            min={0}
            max={8}
            step={0.1}
            onChange={setKeyLight}
          />
          <LightSlider
            label="露出"
            value={exposure}
            min={0.1}
            max={3}
            step={0.05}
            onChange={setExposure}
          />
          <button
            onClick={() => {
              setAmbient(DEFAULT_AMBIENT);
              setKeyLight(DEFAULT_KEY);
              setExposure(DEFAULT_EXPOSURE);
            }}
            className="text-[9px] uppercase tracking-wider text-neutral-400 hover:text-white transition-colors self-end"
          >
            初期値に戻す
          </button>
        </div>
      )}

      {/* 環境切り替え(左端の縦ストリップ)。各環境を実際に映り込ませたクロム球
          サムネイル(EnvBall)で一目で判別できる。 */}
      {isCompleted && (
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
          {ENVIRONMENTS.map((env) => {
            const active = env.id === envId;
            return (
              <button
                key={env.id}
                onClick={() => setEnvId(env.id)}
                aria-pressed={active}
                title={env.label}
                className={`group relative w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                  active ? "scale-110" : ""
                }`}
              >
                <span
                  className={`block w-full h-full overflow-hidden rounded-full ring-1 shadow-md ${
                    active
                      ? "ring-2 ring-purple-400 shadow-purple-500/40"
                      : "ring-black/40 group-hover:ring-white/40"
                  }`}
                >
                  <EnvBall envId={env.id} />
                </span>
                <span className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-neutral-900/90 border border-neutral-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity">
                  {env.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

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

      {/* completed — react-three-fiber による実 3D 表示 */}
      {isCompleted && job && (
        <ModelCanvas
          key={job.job_id}
          url={outputUrl(job.job_id)}
          autoRotate={autoRotate}
          wireframe={wireframe}
          ambient={ambient}
          keyLight={keyLight}
          exposure={exposure}
          envId={envId}
          controlsRef={controlsRef}
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
      {isCompleted && job && (
        <div className="absolute bottom-2.5 left-2.5 flex gap-1.5 z-10">
          {([
            ["🔷", "頂点", fmtNum(job.vertices)],
            ["🔶", "ポリゴン", fmtNum(job.faces)],
            ["💾", "サイズ", fmtSize(job.glb_size)],
            ["📄", "形式", "GLB"],
          ] as const).map(([icon, label, value]) => (
            <div key={label} className="bg-neutral-900/85 border border-neutral-700 px-2 py-1 rounded text-center shadow-sm backdrop-blur-sm">
              <p className="text-[11px] font-bold text-neutral-100">{value}</p>
              <p className="text-[8px] text-neutral-400 uppercase tracking-wider">{icon} {label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LightSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[9px] uppercase tracking-wider text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-200 tabular-nums">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-purple-500 h-1 cursor-pointer"
      />
    </label>
  );
}
