# SpriteForge — AI Agent Setup Instructions

このファイルを AI エージェント（Cursor Agent、Claude、GPT など）に渡すだけで、
ゼロからセットアップ → 起動まで全自動で実行してもらえます。

---

## あなた（AI エージェント）へのお願い

このリポジトリ `sprite-forge` を Windows PC でローカル起動できる状態にしてください。
最終的に `http://localhost:3000`（または 3001）で UI が開け、TRELLIS で
2D 画像 → 3D(GLB) 生成ができる状態がゴールです。

### 前提確認

まず以下を確認してください（無ければインストールを促す。自動インストールはしない）:

1. Python 3.10 以上（`py -3.11 --version` または `python --version`）
2. Node.js 20 以上（`node --version`）
3. Git（`git --version`）
4. NVIDIA GPU + ドライバ（`nvidia-smi`）。**VRAM 12GB 以上を推奨**（8GB でも軽量プリセットで動作）

---

## 実行してほしいこと

### 1. setup.ps1 を実行する（これだけでほぼ完了）

```powershell
cd <このリポジトリのフォルダ>
./setup.ps1
```

`setup.ps1` は **冪等**（再実行しても安全）で、以下を全自動で行います:

1. Python / Node.js / Git の確認
2. `.env` を `.env.example` から作成
3. `backend/.venv` 作成 + `requirements.txt`（軽量パッケージ）
4. **torch 2.6.0+cu124** をインストール（CPU 版が入っていれば入れ替え）
5. TRELLIS ランタイム依存（`backend/requirements-trellis.txt`）
6. **nvdiffrast** / **diff_gaussian_rasterization** の prebuilt wheel（torch 版厳密一致）
7. `config/settings.json` の `trellis_path`（既定 `H:/TRELLIS`）へ **TRELLIS を clone** + submodule 更新
8. **TRELLIS パッチを自動適用**（`scripts/apply_trellis_patches.py`、冪等）
9. `frontend` の `npm install` と `.env.local` 作成
10. Blender と TRELLIS import の動作確認

> 重い TRELLIS 段階を飛ばしたい場合: `./setup.ps1 -SkipTrellis`
> フロントを飛ばす場合: `./setup.ps1 -SkipFrontend`
> 対話プロンプトを出さない場合（AI/CI 用）: `-NoPrompt`

#### マシン固有パスをパラメータで渡す（推奨・非対話）

`setup.ps1` は以下のパラメータを受け取り、**`config/settings.json` に書き込みます**（SSOT）。
バックスラッシュは自動で `/` に正規化されるためエスケープ不要です:

```powershell
./setup.ps1 -NoPrompt `
  -GodotExportPath "C:\path\to\godot-project\assets\prototype\buildings" `
  -TrellisPath     "H:\TRELLIS" `
  -BlenderExe      "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
```

パラメータ無しで実行すると（`-NoPrompt` 無し）、Godot / TRELLIS のパスを対話で尋ねます。
**ユーザーに必ずパスを確認してから設定してください。**

### 2. パス設定（正本は config/settings.json）

| 設定 | settings.json のキー | 必須 | 既定 |
|---|---|---|---|
| Godot 書き出し先 | `godot_export_path` | はい（最終ステップで使用） | `C:/godot-project/...`（例） |
| TRELLIS の場所 | `trellis_path` | はい | `H:/TRELLIS` |
| Blender 実行ファイル | `blender_exe` | いいえ（空＝自動検出/スキップ） | `""` |

> バックエンドはこれらを `config/settings.json` からのみ読み込みます（`.env` の
> `SF_GODOT_EXPORT_PATH` は **使われません**）。上記の `setup.ps1` パラメータ、
> または `config/settings.json` を直接編集して設定してください。

### 3. 起動

```powershell
# Terminal 1 (backend)
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000

# Terminal 2 (frontend)
cd frontend
npm run dev
```

`Application startup complete.` と `Ready in` を確認し、
ブラウザで `http://localhost:3000` を開いて UI を確認してください。

### 4. 単体での TRELLIS 推論テスト（任意）

```powershell
cd backend
$env:TRELLIS_PATH = "H:\TRELLIS"; $env:ATTN_BACKEND = "xformers"; $env:SPARSE_BACKEND = "spconv"; $env:SPCONV_ALGO = "native"
.\.venv\Scripts\python app\services\trellis_infer.py --input <PNG> --output <out.glb>
```

steps / texture_size / bake_mode / fp16 は **VRAM から自動選択**されます（後述）。
明示指定したい場合のみ `--steps 12 --texture-size 1024 --bake-mode opt --fp16` 等を付けます。

---

## GPU 適応プリセット（重要）

推論パラメータは **VRAM を自動検出**して `config/settings.json` の `gpu_presets`
から選ばれます（SSOT）。プリセットは max_vram_gb の昇順で評価され、
`vram <= max_vram_gb` の最初の帯が採用されます。

| プリセット | VRAM 帯 | steps | texture_size | bake mode | fp16 |
|---|---|---|---|---|---|
| low | 〜10GB | 6 | 512 | fast | true |
| standard | 10〜16GB | 12 | 1024 | fast | true |
| high | 16GB〜 | 25 | 2048 | opt | false |

- **bake mode**: `fast` = ラスタライズ + scatter_add + inpaint（低 VRAM・短時間）。
  `opt` = 2500 step 勾配最適化（高品質だが VRAM 多消費。8GB では非推奨）。
- **手動上書き**: `config/settings.json` の `gpu_preset` にプリセット名を入れると強制。
  `trellis_steps` / `texture_size` / `bake_mode` / `trellis_fp16` に値（非 null）を入れると
  その項目だけプリセットより優先されます。CLI 引数は最優先。

---

## プロジェクト構成（参考）

```
sprite-forge/
├── setup.ps1                       <- 冪等セットアップ（UTF-8 BOM）
├── AGENTS.md                       <- このファイル
├── SETUP.md                        <- 人間向け手順 + トラブルシュート
├── scripts/
│   └── apply_trellis_patches.py    <- TRELLIS 本体への冪等パッチ
├── config/
│   └── settings.json               <- 全設定の正本（SSOT, GPU プリセット含む）
├── backend/
│   ├── requirements.txt            <- 軽量（FastAPI 等）
│   ├── requirements-trellis.txt    <- TRELLIS ランタイム依存
│   └── app/
│       ├── core/config.py          <- 設定読み込み（pydantic）
│       ├── core/gpu_profile.py     <- VRAM 検出 + プリセット解決
│       └── services/
│           ├── trellis_service.py  <- サブプロセス起動
│           └── trellis_infer.py    <- 推論本体（GPU 側でプロファイル解決）
└── frontend/                       <- Next.js
```

## SSOT ポリシー（厳守）

- **設定値の正本**: `config/settings.json` のみ（GPU プリセットもここ）
- **データ型の正本**: `backend/app/models/` のみ
- 設定値を複数ファイルにハードコードしない。`config.py` の既定値は
  「settings.json が無い場合のフォールバック」に過ぎない
- `.env` と `config/settings.json` の値は常に同期

## 注意（無害な警告）

- `ModuleNotFoundError: No module named 'triton'` は無害（最適化が一部無効になるだけ）
- onnxruntime の `cublasLt` 関連警告も無害
