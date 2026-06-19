/**
 * SpriteForge API クライアント
 * 型定義は backend/app/models/job.py と同期すること（SSOT）
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type StepStatus = "pending" | "running" | "done" | "error";
export type JobStatus  = "queued" | "running" | "completed" | "failed";

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
  output_glb: string | null;
  created_at: string;
  updated_at: string;
  error_msg:  string | null;
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
