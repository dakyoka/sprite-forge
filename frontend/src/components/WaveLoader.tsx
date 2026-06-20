"use client";

/**
 * 生成中のローディング表示。スピナーの代わりに「下から湧き上がる波」を描く。
 * 水位は進捗 % に連動し、表面はサイン波が横へ流れて undulate する。
 * 進捗が不明(null)のときは水位をゆるやかに上下させる(indeterminate)。
 *
 * 純粋に見た目だけのコンポーネント。生成ロジック/ポーリングには一切関与しない。
 */

// 横幅 200% ぶんに同一周期を 2 つ並べた波。translateX(-50%) で 1 周期ぶん
// ずれるため、継ぎ目なくループする。上端が波打ち、下は塗りつぶし。
const WAVE_PATH =
  "M0,8 Q25,0 50,8 Q75,16 100,8 Q125,0 150,8 Q175,16 200,8 L200,100 L0,100 Z";

interface Props {
  /** 0〜100。null なら indeterminate(ゆるやかに上下)。 */
  progress: number | null;
  /** 直径(px)。 */
  size?: number;
  /** 波の色。 */
  color?: string;
  /** 進捗 % のラベルを中央に出すか。 */
  showLabel?: boolean;
}

export default function WaveLoader({ progress, size = 44, color = "#3b82f6", showLabel = true }: Props) {
  const determinate = progress != null;
  const level = determinate ? Math.max(6, Math.min(100, progress)) : 50;

  return (
    <div
      className="relative rounded-full overflow-hidden border border-white/15 shadow-inner"
      style={{ width: size, height: size, background: "rgba(255,255,255,0.05)" }}
      role="progressbar"
      aria-valuenow={determinate ? Math.round(progress) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* 水位コンテナ: determinate は height をトランジション、indeterminate は bob でアニメ。 */}
      <div
        className={`absolute inset-x-0 bottom-0 ${determinate ? "transition-[height] duration-700 ease-out" : "sf-wave-bob"}`}
        style={determinate ? { height: `${level}%` } : undefined}
      >
        {/* 流れる波の表面 + 塗り(幅 200% で横スクロール) */}
        <svg
          className="absolute inset-0 sf-wave-flow"
          style={{ width: "200%", height: "100%" }}
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          fill={color}
        >
          <path d={WAVE_PATH} opacity={0.85} />
          {/* 半透明の後ろ波(位相をずらして奥行きを出す) */}
          <path d={WAVE_PATH} opacity={0.4} transform="translate(35,3)" />
        </svg>
      </div>

      {showLabel && determinate && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white tabular-nums drop-shadow">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
}
