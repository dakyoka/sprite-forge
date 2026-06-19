# SpriteForge — AI Agent Setup Instructions

このファイルを AI エージェント（Cursor Agent、Claude、GPT など）に渡すだけで、
セットアップを全自動で実行してもらえます。

---

## あなた（AI エージェント）へのお願い

このリポジトリ `sprite-forge` を Windows PC でローカル起動できる状態にしてください。
以下の手順をすべて実行し、最終的に `http://localhost:3000`（または 3001）でUIが開ける状態にしてください。

### 前提確認

まず以下を確認してください：

1. Python 3.11 以上が使えること（`py -3.11 --version` または `python --version`）
2. Node.js 20 以上が使えること（`node --version`）
3. Git がインストールされていること（`git --version`）

不足している場合は、インストールを促すメッセージを出してください（自動インストールはしない）。

### 実行してほしいこと

#### 1. setup.ps1 を実行する

```powershell
cd <このリポジトリのフォルダ>
./setup.ps1
```

これで以下が自動実行されます：
- `.env` ファイルの作成（`.env.example` からコピー）
- `backend/.venv` の作成（Python 3.11 仮想環境）
- `pip install -r backend/requirements.txt`
- `cd frontend && npm install`
- `frontend/.env.local` の作成

#### 2. .env のパス設定

`setup.ps1` 実行後、`.env` ファイルを開き：

```
SF_GODOT_EXPORT_PATH=
```

ユーザーに「Godot プロジェクトのフォルダパスを教えてください」と聞いて、そのパスを設定してください。

さらに `config/settings.json` の `godot_export_path` も同じ値に更新してください（SSOT ポリシー）。

#### 3. バックエンドを起動する

```powershell
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

`Application startup complete.` が出ることを確認してください。

#### 4. フロントエンドを起動する（別ターミナル）

```powershell
cd frontend
npm run dev
```

`Ready in` が出ることを確認してください。

#### 5. 動作確認

ブラウザで `http://localhost:3000`（または `http://localhost:3001`）を開き、
SpriteForge の UI が表示されることを確認してください。

#### 6. TRELLIS（オプション・後回しでOK）

TRELLIS は GPU メモリを多く使う 3D 生成モデルです。
RTX 3060 12GB 以上の場合のみ、以下を実行してください：

```bash
git clone https://github.com/microsoft/TRELLIS.git
cd TRELLIS
pip install -e ".[train]"
python -c "from trellis.pipelines import TrellisImageTo3DPipeline; TrellisImageTo3DPipeline.from_pretrained('microsoft/TRELLIS-image-large')"
```

TRELLIS がない場合でも、UI の表示と画像アップロードまでは動作します。

---

## プロジェクト構成（参考）

```
sprite-forge/
├── setup.ps1          ← このセットアップスクリプト
├── AGENTS.md          ← AI エージェント向けこのファイル
├── .env.example       ← 環境変数テンプレート（.env にコピーして使う）
├── config/
│   └── settings.json  ← 全設定の正本（SSOT）
├── backend/           ← Python FastAPI
│   ├── .venv/         ← Python 仮想環境（git 管理外）
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/config.py   ← 設定読み込み
│       ├── models/job.py    ← データ型定義
│       ├── routes/          ← API エンドポイント
│       └── services/        ← パイプライン各ステップ
└── frontend/          ← Next.js 14
    ├── node_modules/  ← npm パッケージ（git 管理外）
    ├── .env.local     ← API URL設定（git 管理外）
    └── src/
        ├── app/page.tsx          ← メインUI
        ├── components/           ← UIコンポーネント
        └── lib/api.ts            ← APIクライアント
```

## SSOT ポリシー（重要）

- **設定の正本**: `config/settings.json` のみ
- **型定義の正本**: `backend/app/models/` のみ
- 設定値を複数ファイルにハードコードしないこと
- `.env` と `config/settings.json` の値は常に同期すること
