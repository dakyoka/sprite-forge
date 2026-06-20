/**
 * 3D プレビューで選択できる環境(IBL/背景)の定義。
 *
 * - `studio` だけは色被りのない中立(白〜グレー)の RoomEnvironment を使い、
 *   背景はダーク+グリッドのまま保つ。
 * - それ以外は public/hdris/ に同梱した 2k Poly Haven HDRI(CC0)を環境マップ
 *   兼背景に使い、drei の地面投影(ground projection)で「その環境の中」に
 *   モデルを立たせる。
 *
 * 切り替え UI のサムネイルは、各 HDRI を実際に映り込ませたクロム(金属)球を
 * 小さな r3f キャンバスでレンダリングする(EnvBall.tsx)。`hdri` がその正本。
 */
export type EnvId = "studio" | "sky" | "sunset" | "night" | "city";

export interface EnvDef {
  id: EnvId;
  label: string;
  /**
   * 環境マップ兼背景に使う HDRI(public/ 配下の URL)。
   * studio は中立 RoomEnvironment を使うため null。
   */
  hdri: string | null;
}

export const ENVIRONMENTS: EnvDef[] = [
  { id: "studio", label: "スタジオ", hdri: null },
  { id: "sky", label: "青空", hdri: "/hdris/sky.hdr" },
  { id: "sunset", label: "夕焼け", hdri: "/hdris/sunset.hdr" },
  { id: "night", label: "夜", hdri: "/hdris/night.hdr" },
  { id: "city", label: "都市", hdri: "/hdris/city.hdr" },
];

export const DEFAULT_ENV: EnvId = "studio";

/** 環境 ID から HDRI の URL を引く。studio など背景を持たない環境は null。 */
export function hdriFor(id: EnvId): string | null {
  return ENVIRONMENTS.find((e) => e.id === id)?.hdri ?? null;
}
