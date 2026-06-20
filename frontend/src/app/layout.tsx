import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpriteForge (SF)",
  description: "2D スプライト → 3D モデル 全自動パイプライン",
};

// モバイル/タブレットで正しくレンダリングするためのビューポート。
// これが無いと iPad Safari は 980px のデスクトップ幅で表示し、全体を縮小して
// 「PC 版と同じ見た目」になりタップ位置もずれる。width=device-width で実機幅に合わせる。
// viewportFit: "cover" でノッチ/ホームバーのセーフエリアにも対応する。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080808",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
