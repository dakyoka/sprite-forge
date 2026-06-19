import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpriteForge (SF)",
  description: "2D スプライト → 3D モデル 全自動パイプライン",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
