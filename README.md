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

## 動作環境（GPU 適応）

VRAM を自動検出して推論プリセットを切り替えます（正本: `config/settings.json` の `gpu_presets`）。

| プリセット | VRAM 帯 | steps | texture_size | bake mode | fp16 |
|---|---|---|---|---|---|
| low | 〜10GB | 6 | 512 | fast | true |
| standard | 10〜16GB | 12 | 1024 | fast | true |
| high | 16GB〜 | 25 | 2048 | opt | false |

- **推奨**: VRAM 12GB 以上。**8GB（RTX 3070 等）でも low プリセットで動作**します。
- torch 2.6.0+cu124  baseline。詳細・手動上書きは [SETUP.md](./SETUP.md) / [AGENTS.md](./AGENTS.md) 参照。

## クイックスタート

AI エージェントに任せるなら [AGENTS.md](./AGENTS.md) を渡すだけ。手動は [SETUP.md](./SETUP.md) を参照。

```powershell
git clone https://github.com/dakyoka/sprite-forge.git
cd sprite-forge
./setup.ps1          # Python/Node/torch/TRELLIS clone+patch/フロント を冪等に自動セットアップ
```

セットアップ後、`.env` と `config/settings.json` の Godot 書き出し先を設定し、
バックエンド（uvicorn）とフロントエンド（npm run dev）を起動。
ブラウザで http://localhost:3000 を開き、画像をドロップするだけです。

## ディレクトリ構成

```
sprite-forge/
├── setup.ps1          # 冪等セットアップ (UTF-8 BOM)
├── AGENTS.md          # AI エージェント向け手順
├── SETUP.md           # 人間向け手順 + トラブルシュート
├── scripts/
│   └── apply_trellis_patches.py  # TRELLIS 本体への冪等パッチ
├── frontend/          # Next.js フロントエンド
├── backend/           # FastAPI バックエンド
│   ├── requirements.txt          # 軽量依存
│   ├── requirements-trellis.txt  # TRELLIS ランタイム依存
│   └── app/
│       ├── core/      # 設定 (SSOT) + gpu_profile (VRAM 検出)
│       ├── models/    # データ型定義 (SSOT)
│       ├── routes/    # API エンドポイント
│       └── services/  # パイプライン各ステップ
├── config/
│   └── settings.json  # 全設定の正本 (SSOT, GPU プリセット含む)
└── .env.example       # 環境変数テンプレート
```

## SSOT ポリシー

- **設定値の正本**: `config/settings.json` のみ
- **データ型の正本**: `backend/app/models/` のみ
- **フロントエンド型**: `openapi-typescript` で API スキーマから自動生成
- 設定値を複数ファイルにハードコードすることを禁止

## ライセンス

MIT
