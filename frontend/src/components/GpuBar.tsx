"use client";
import { useEffect, useState } from "react";
import { getGpu, type GpuInfo } from "@/lib/api";

interface Bar { label: string; value: number; max: number; unit: string; color: string; text: string }

function buildBars(g: GpuInfo): Bar[] | null {
  if (!g.available) return null;
  const usedGb   = g.vram_used_mib  != null ? g.vram_used_mib  / 1024 : null;
  const totalGb  = g.vram_total_mib != null ? g.vram_total_mib / 1024 : null;
  const bars: Bar[] = [];
  if (usedGb != null && totalGb != null) {
    bars.push({ label: "専用 VRAM", value: +usedGb.toFixed(1), max: +totalGb.toFixed(1), unit: "GB", color: "bg-blue-400", text: "text-blue-400" });
  }
  if (g.util_pct != null) {
    bars.push({ label: "GPU 使用率", value: Math.round(g.util_pct), max: 100, unit: "%", color: "bg-purple-400", text: "text-purple-400" });
  }
  if (g.temp_c != null) {
    bars.push({ label: "温度", value: Math.round(g.temp_c), max: 100, unit: "°C", color: "bg-yellow-400", text: "text-yellow-400" });
  }
  return bars;
}

export default function GpuBar() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const g = await getGpu();
        if (alive) setGpu(g);
      } catch {
        if (alive) setGpu({ available: false, reason: "取得失敗" });
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (gpu === null) {
    return <p className="text-[9px] text-neutral-600 uppercase tracking-wider">読み込み中…</p>;
  }

  const bars = buildBars(gpu);
  if (!bars || bars.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold text-neutral-500">N/A</span>
        <span className="text-[8px] text-neutral-600 truncate">{gpu.reason ?? "GPU 情報を取得できません"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center justify-between mb-0.5 gap-1">
            <span className="text-[9px] text-neutral-400 truncate">{b.label}</span>
            <span className={`text-[9px] font-bold whitespace-nowrap ${b.text}`}>
              {b.value}
              <span className="text-neutral-500 font-normal"> / {b.max} {b.unit}</span>
            </span>
          </div>
          <div className="bg-neutral-800 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${b.color}`}
              style={{ width: `${Math.min(100, (b.value / b.max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
