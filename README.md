# SpriteForge (SF)

> 2D スプライト画像 → 3D モデル (GLB) の全自動パイプライン  
> Godot Engine 向け建物・オブジェクト素材を一発生成する Web アプリ

```
画像ドロップ
  → アップスケール (Real-ESRGAN 4×)
    → 背景除去 (rembg)
      → 3D 生成 (Microsoft TRELLIS)
        → 後処理 (Blender: 原点・マテリアル正規化)
          → Godot フォルダへ自動書き出し (GLB)
```

## スタック

| 層 | 技術 |
|---|---|
| フロントエンド | Next.js 14 · TypeScript · Tailwind CSS |
| バックエンド | Python FastAPI · uvicorn |
| 3D 生成 | Microsoft TRELLIS (ローカル GPU) |
| アップスケール | Real-ESRGAN |
| 背景除去 | rembg |
| 後処理 | Blender 4.x (CLI) |
| モバイル | Tailscale でローカル LAN に接続 |

## 動作確認済み環境

- **開発機**: Windows 11 · NVIDIA RTX 3060 12GB (VRAM)
- **最低要件**: RTX 3060 12GB 以上（TRELLIS fp16 モード使用）
- RTX 3070 8GB はメモリ不足でエラーになる可能性があります

## クイックスタート

詳細は [SETUP.md](./SETUP.md) を参照してください。

```bash
# 1. リポジトリをクローン
git clone https://github.com/dakyoka/sprite-forge.git
cd sprite-forge

# 2. 環境変数を設定
cp .env.example .env
# .env の SF_GODOT_EXPORT_PATH を自分の Godot プロジェクトパスに変更

# 3. バックエンド起動
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 4. フロントエンド起動 (別ターミナル)
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開き、画像をドロップするだけです。

## ディレクトリ構成

```
sprite-forge/
├── frontend/          # Next.js フロントエンド
├── backend/           # FastAPI バックエンド
│   └── app/
│       ├── core/      # 設定 (SSOT)
│       ├── models/    # データ型定義 (SSOT)
│       ├── routes/    # API エンドポイント
│       └── services/  # パイプライン各ステップ
├── config/
│   └── settings.json  # 全設定の正本 (SSOT)
├── .env.example       # 環境変数テンプレート
└── SETUP.md           # セットアップ詳細手順
```

## SSOT ポリシー

- **設定値の正本**: `config/settings.json` のみ
- **データ型の正本**: `backend/app/models/` のみ
- **フロントエンド型**: `openapi-typescript` で API スキーマから自動生成
- 設定値を複数ファイルにハードコードすることを禁止

## ライセンス

MIT
