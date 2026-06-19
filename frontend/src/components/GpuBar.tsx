interface Bar { label: string; value: number; max: number; unit: string; color: string; text: string }

// NOTE: 現状はプレースホルダー値。実測 GPU テレメトリ(nvidia-smi)に差し替え可能。
const bars: Bar[] = [
  { label: "専用 VRAM",  value: 8.4, max: 12,  unit: "GB",  color: "bg-blue-400",   text: "text-blue-400"   },
  { label: "GPU 使用率", value: 88,  max: 100, unit: "%",   color: "bg-purple-400", text: "text-purple-400" },
  { label: "温度",       value: 68,  max: 100, unit: "°C",  color: "bg-yellow-400", text: "text-yellow-400" },
];

export default function GpuBar() {
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
