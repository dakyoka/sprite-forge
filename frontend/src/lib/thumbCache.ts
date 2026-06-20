/**
 * 履歴サムネイル(モデル正面キャプチャ PNG)のキャッシュ。
 *
 * - メモリ Map を一次キャッシュ、localStorage を永続キャッシュにする。
 * - localStorage はクォータ(~5MB)を超えると例外を投げるため、書き込みは
 *   握りつぶしてメモリのみで継続する(機能は劣化しない)。
 * - キーは job_id。ジョブ削除時は removeThumb で消す。
 */
const PREFIX = "sf_thumb_";
const mem = new Map<string, string>();

export function getThumb(jobId: string): string | null {
  const m = mem.get(jobId);
  if (m) return m;
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(PREFIX + jobId) : null;
    if (v) {
      mem.set(jobId, v);
      return v;
    }
  } catch {
    // localStorage 不可(プライベートモード等)は無視。
  }
  return null;
}

export function setThumb(jobId: string, dataUrl: string): void {
  mem.set(jobId, dataUrl);
  try {
    localStorage.setItem(PREFIX + jobId, dataUrl);
  } catch {
    // クォータ超過などは無視(メモリキャッシュは維持)。
  }
}

export function removeThumb(jobId: string): void {
  mem.delete(jobId);
  try {
    localStorage.removeItem(PREFIX + jobId);
  } catch {
    // 無視。
  }
}
