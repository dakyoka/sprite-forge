/**
 * SpriteForge API クライアント
 * 型定義は backend/app/models/job.py と同期すること（SSOT）
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export type JobStatus  = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PipelineStep {
  step_id:     string;
  label:       string;
  status:      StepStatus;
  detail:      string;
  started_at:  string | null;
  finished_at: string | null;
}

export interface Job {
  job_id:     string;
  filename:   string;
  status:     JobStatus;
  progress:   number;
  steps:      PipelineStep[];
  output_glb:  string | null;
  glb_size:    number | null;
  vertices:    number | null;
  faces:       number | null;
  input_image: string | null;
  logs:        string[];
  created_at:  string;
  updated_at:  string;
  error_msg:   string | null;
  favorite:    boolean;
}

/** GLB 配信 / ダウンロード用のバックエンド絶対 URL */
export function outputUrl(jobId: string): string {
  return `${BASE}/api/output/${jobId}`;
}

/** 入力画像配信用のバックエンド絶対 URL */
export function inputUrl(jobId: string): string {
  return `${BASE}/api/input/${jobId}`;
}

/**
 * バックエンドは naive UTC datetime(タイムゾーン無し)を返すため、
 * タイムゾーン指定が無い場合は "Z" を補ってから解釈する。
 */
export function parseTs(s: string | null): number | null {
  if (!s) return null;
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(s);
  return new Date(hasTz ? s : s + "Z").getTime();
}

export async function startPipeline(file: File): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/pipeline/start`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/api/pipeline/${jobId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listHistory(): Promise<Job[]> {
  const res = await fetch(`${BASE}/api/history/`);
  if (!res.ok) return [];
  return res.json();
}

/** 全ジョブ一覧(queued はキュー順、その他は新しい順)。 */
export async function listJobs(): Promise<Job[]> {
  const res = await fetch(`${BASE}/api/jobs/`);
  if (!res.ok) return [];
  return res.json();
}

/** キュー中/実行中ジョブを停止する。 */
export async function cancelJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/api/pipeline/${jobId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** ジョブを履歴から削除する(出力ファイルもサーバ側で削除)。 */
export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** お気に入りフラグを設定する。更新後のジョブを返す。 */
export async function setFavorite(jobId: string, favorite: boolean): Promise<Job> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/favorite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** GPU テレメトリ(/api/gpu)。GPU 不在時は available:false を返す。 */
export interface GpuInfo {
  available:      boolean;
  reason?:        string;
  util_pct?:      number | null;
  vram_used_mib?: number | null;
  vram_total_mib?: number | null;
  temp_c?:        number | null;
}

export async function getGpu(): Promise<GpuInfo> {
  const res = await fetch(`${BASE}/api/gpu`);
  if (!res.ok) return { available: false, reason: `HTTP ${res.status}` };
  return res.json();
}

/** 実効設定(/api/settings)。GPU プロファイル解決後の読み取り専用ビュー。 */
export interface EffectiveSettings {
  gpu_preset:          string;
  resolved_preset:     string;
  vram_gb:             number | null;
  trellis_steps:       number;
  texture_size:        number;
  bake_mode:           string;
  fp16:                boolean;
  trellis_model:       string;
  trellis_timeout_sec: number;
  godot_export_path:   string;
  blender_exe:         string | null;
  output_dir:          string;
}

export async function getSettings(): Promise<EffectiveSettings> {
  const res = await fetch(`${BASE}/api/settings`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** キュー中ジョブの並び替え。新しいキュー順を返す。 */
export async function reorderQueue(order: string[]): Promise<Job[]> {
  const res = await fetch(`${BASE}/api/queue/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
