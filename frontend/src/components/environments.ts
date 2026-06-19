/**
 * 3D プレビューで選択できる環境(IBL/背景)の定義。
 *
 * - `studio` だけは色被りのない中立(白〜グレー)の RoomEnvironment を使い、
 *   背景はダーク+グリッドのまま保つ。
 * - それ以外は @pmndrs/assets の HDRI(オフライン同梱)を環境マップ兼背景に使う。
 *
 * `ball` は左の切り替え UI に出すスフィアサムネイル(その環境を映した球)用の
 * CSS background。各環境の色味・明暗を一目で判別できるよう、光沢のある球に見える
 * グラデーションにしている。
 */
export type EnvId = "studio" | "sky" | "sunset" | "night" | "city";

export interface EnvDef {
  id: EnvId;
  label: string;
  /** 球サムネイル用 CSS background(複数レイヤをカンマ区切り)。 */
  ball: string;
}

// 左上から差し込む共通のスペキュラハイライト(球らしさを出す)。
const HILIGHT =
  "radial-gradient(circle at 32% 27%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 34%)";

export const ENVIRONMENTS: EnvDef[] = [
  {
    id: "studio",
    label: "スタジオ",
    ball: `${HILIGHT}, radial-gradient(circle at 50% 62%, #ededf0 0%, #9c9ca1 55%, #5b5b60 100%)`,
  },
  {
    id: "sky",
    label: "青空",
    ball: `${HILIGHT}, radial-gradient(circle at 50% 66%, #c9e8ff 0%, #51a6f1 50%, #1f6fd0 100%)`,
  },
  {
    id: "sunset",
    label: "夕焼け",
    ball: `${HILIGHT}, radial-gradient(circle at 50% 70%, #ffe9b6 0%, #ff9b54 44%, #d6485e 100%)`,
  },
  {
    id: "night",
    label: "夜",
    ball: `radial-gradient(circle at 30% 25%, rgba(160,190,255,0.6) 0%, rgba(160,190,255,0) 30%), radial-gradient(circle at 50% 60%, #2b3560 0%, #141a2c 55%, #05060c 100%)`,
  },
  {
    id: "city",
    label: "都市",
    ball: `${HILIGHT}, radial-gradient(circle at 50% 62%, #dbe1e7 0%, #8d99a5 50%, #4b535d 100%)`,
  },
];

export const DEFAULT_ENV: EnvId = "studio";
