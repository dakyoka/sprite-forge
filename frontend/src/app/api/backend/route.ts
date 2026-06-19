/**
 * バックエンド(FastAPI/uvicorn)の起動・状態確認用 API ルート。
 *
 * ブラウザから直接ローカルプロセスは起動できないため、Next.js のサーバー側
 * (Node ランタイム) で uvicorn を spawn する。フロントの「Backend 起動」
 * ボタンがこのエンドポイントを叩く。
 *
 *  GET  /api/backend  -> { running: boolean }
 *  POST /api/backend  -> uvicorn を起動して起動完了まで待つ
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

// localhost は環境によって IPv6(::1) に解決され、127.0.0.1 で待ち受ける
// uvicorn に届かないことがあるため 127.0.0.1 を明示する。
const HEALTH_URL = "http://127.0.0.1:8000/api/health";
const BACKEND_PORT = 8000;

// 同一プロセス内での POST 二重発火による多重起動を防ぐためのインフライトロック。
// (BackendStatus のポーリングや二重クリック、複数タブからの同時起動でも
//  バックエンドが 2 個立ち上がらないようにする。多重起動は 8GB GPU の VRAM
//  を奪い合い生成を著しく遅くするため、根本対策として重要。)
let startInFlight: Promise<unknown> | null = null;

function backendDir(): string {
  // frontend の一つ上が sprite-forge ルート、その下の backend
  return process.env.BACKEND_DIR ?? path.resolve(process.cwd(), "..", "backend");
}

// ポート 8000 で LISTEN しているプロセスがあるかを TCP 接続で確認する。
// ヘルスエンドポイントがまだ応答しない起動直後でも「既に存在する」ことを
// 検知でき、2 個目の uvicorn 起動を確実に防げる。
function portInUse(port = BACKEND_PORT, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (inUse: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function healthOk(timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// 「既に動いている」判定はヘルス OK か、ポートが既に使用中(=何かが bind 済み)
// のどちらかで真とする。これにより起動途中でも二重起動を防ぐ。
async function isRunning(): Promise<boolean> {
  if (await healthOk()) return true;
  return portInUse();
}

export async function GET() {
  return NextResponse.json({ running: await healthOk() });
}

export async function POST() {
  if (await isRunning()) {
    return NextResponse.json({ running: true, started: false, message: "already running" });
  }

  // 既に別の POST が起動処理中ならそれに相乗りし、新たに spawn しない。
  if (startInFlight) {
    await startInFlight;
    return NextResponse.json({ running: await healthOk(), started: false, message: "start already in progress" });
  }

  const dir = backendDir();
  // 必ず VENV の python を使って uvicorn を起動する。システム Python で起動すると
  // venv と二重に立ち上がり、GPU VRAM を奪い合って生成が遅くなる原因になる。
  const venvPython = path.join(
    dir,
    ".venv",
    "Scripts",
    process.platform === "win32" ? "python.exe" : "python",
  );
  if (!fs.existsSync(venvPython)) {
    return NextResponse.json(
      { running: false, started: false, error: `venv python not found: ${venvPython}. setup.ps1 を実行してください。` },
      { status: 500 },
    );
  }

  const run = (async () => {
    const child = spawn(
      venvPython,
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT), "--reload", "--reload-dir", "app"],
      { cwd: dir, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    // 起動完了 (ヘルスチェックが通る) まで最大 ~25 秒待つ
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await healthOk()) return true;
    }
    return false;
  })();

  startInFlight = run;
  try {
    const ok = await run;
    if (ok) {
      return NextResponse.json({ running: true, started: true });
    }
    return NextResponse.json(
      { running: false, started: true, message: "起動しましたが、まだ応答していません。数秒後に再確認してください。" },
      { status: 202 },
    );
  } catch (e) {
    return NextResponse.json({ running: false, started: false, error: String(e) }, { status: 500 });
  } finally {
    startInFlight = null;
  }
}
