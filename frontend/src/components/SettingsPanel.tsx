"use client";
import { useEffect, useState } from "react";
import { getSettings, type EffectiveSettings } from "@/lib/api";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-neutral-800/60">
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider flex-shrink-0">{label}</span>
      <span className="text-[10px] font-semibold text-neutral-200 text-right break-all">{value}</span>
    </div>
  );
}

/**
 * 実効設定の読み取り専用ビュー(SSOT は config/settings.json)。
 * GPU プロファイル解決後の値をバックエンド /api/settings から取得して表示する。
 */
export default function SettingsPanel() {
  const [s, setS] = useState<EffectiveSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((d) => { if (alive) setS(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  if (err) {
    return <div className="text-[10px] text-red-400">設定を取得できません: {err}</div>;
  }
  if (!s) {
    return <p className="text-[9px] text-neutral-600 uppercase tracking-wider">読み込み中…</p>;
  }

  const vram = s.vram_gb != null ? `${s.vram_gb.toFixed(1)} GB` : "検出不可";
  const presetLabel = s.gpu_preset === "auto"
    ? `auto → ${s.resolved_preset}`
    : `${s.gpu_preset}(強制)`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 mb-1.5">GPU プロファイル</p>
        <Row label="プリセット" value={presetLabel} />
        <Row label="検出 VRAM" value={vram} />
        <Row label="Trellis ステップ数" value={s.trellis_steps} />
        <Row label="テクスチャ解像度" value={`${s.texture_size}px`} />
        <Row label="ベイクモード" value={s.bake_mode} />
        <Row label="fp16" value={s.fp16 ? "有効" : "無効"} />
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 mb-1.5">パス / 実行設定</p>
        <Row label="Trellis モデル" value={s.trellis_model} />
        <Row label="タイムアウト" value={`${s.trellis_timeout_sec}s`} />
        <Row label="Blender" value={s.blender_exe ?? "未検出 (後処理スキップ)"} />
        <Row label="Godot 出力先" value={s.godot_export_path} />
        <Row label="出力ディレクトリ" value={s.output_dir} />
      </div>
      <p className="text-[8px] text-neutral-600 uppercase tracking-wider">
        値の編集は config/settings.json で行います (SSOT)
      </p>
    </div>
  );
}
