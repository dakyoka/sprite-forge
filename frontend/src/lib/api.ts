/**
 * SpriteForge API クライアント
 * 型定義は backend/app/models/job.py と同期すること（SSOT）
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type StepStatus = "pending" | "running" | "done" | "error";
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
