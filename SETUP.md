# SpriteForge セットアップ手順（人間向け）

> AI エージェントに任せる場合は [AGENTS.md](./AGENTS.md) を渡すだけで OK。
> 以下は手動で進めたい人向けです。

## 必要なもの（事前インストール）

| ソフト | バージョン | 入手先 |
|---|---|---|
| Python | 3.10 以上 | https://www.python.org |
| Node.js | 20 LTS 以上 | https://nodejs.org |
| Git | 最新 | https://git-scm.com |
| NVIDIA ドライバ | 最新（CUDA 12.4 対応） | NVIDIA 公式 |
| Blender | 4.x（後処理ステップで使用、任意） | https://www.blender.org |

> GPU は **VRAM 12GB 以上を推奨**。8GB（例: RTX 3070）でも軽量プリセットで動作します。

---

## STEP 1 — クローン & 自動セットアップ

```powershell
git clone https://github.com/dakyoka/sprite-forge.git
cd sprite-forge
./setup.ps1
```

`setup.ps1` が以下を**冪等に**全自動実行します:

- `.env` 作成、`backend/.venv` 作成、軽量パッケージ
- **torch 2.6.0+cu124**（CPU 版が入っていたら入れ替え）
- TRELLIS ランタイム依存（`backend/requirements-trellis.txt`）
- prebuilt wheel: **nvdiffrast 0.4.0+...pt2.6.0cu124** / **diff_gaussian_rasterization 0.0.1+...pt2.6.0cu124**
- TRELLIS 本体の clone（`config/settings.json` の `trellis_path`、既定 `H:/TRELLIS`）+ submodule 更新
- TRELLIS パッチ適用（`scripts/apply_trellis_patches.py`）
- `frontend` の `npm install`

オプション:
- `./setup.ps1 -SkipTrellis` … 重い TRELLIS 段階を飛ばす
- `./setup.ps1 -SkipFrontend` … npm install を飛ばす
- `./setup.ps1 -NoPrompt` … 対話プロンプトを出さない（CI / AI 用）

マシン固有パスはパラメータで一括指定できます（`config/settings.json` に書き込まれます。
バックスラッシュは自動で `/` に正規化されます）:

```powershell
./setup.ps1 -GodotExportPath "C:\godot-project\assets\prototype\buildings" `
            -TrellisPath "H:\TRELLIS" `
            -BlenderExe "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
```

パラメータ無しなら、Godot / TRELLIS のパスを対話で尋ねます。

---

## STEP 2 — マシン固有パスの設定（正本: config/settings.json）

バックエンドは下記を `config/settings.json` からのみ読み込みます（`.env` の
`SF_GODOT_EXPORT_PATH` は使われません）。STEP 1 のパラメータで設定済みなら不要です。

| 設定 | キー | 必須 | 内容 |
|---|---|---|---|
| Godot 書き出し先 | `godot_export_path` | はい | Godot プロジェクトの `res://assets/.../buildings/` の絶対パス |
| TRELLIS の場所 | `trellis_path` | はい | TRELLIS を clone したフォルダ（既定 `H:/TRELLIS`） |
| Blender 実行ファイル | `blender_exe` | いいえ | 空＝自動検出。見つからなければ後処理ステップはスキップ |

---

## STEP 3 — 起動

```powershell
# Terminal 1
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --reload-dir app --port 8000

# Terminal 2
cd frontend
npm run dev
```

`http://localhost:3000` を開いて画像をドロップすると、パイプラインが進みます。

---

## GPU プリセット（VRAM 自動判定）

推論パラメータは VRAM から自動選択されます（正本: `config/settings.json` の `gpu_presets`）。

| プリセット | VRAM 帯 | steps | texture_size | bake mode | fp16 |
|---|---|---|---|---|---|
| low | 〜10GB | 6 | 512 | fast | true |
| standard | 10〜16GB | 12 | 1024 | fast | true |
| high | 16GB〜 | 25 | 2048 | opt | false |

手動で固定したい場合は `config/settings.json` を編集:

```json
{
  "gpu_preset": "standard",        // "auto" | "low" | "standard" | "high"
  "trellis_steps": null,           // 数値を入れるとプリセットより優先
  "texture_size": null,
  "bake_mode": null,               // "fast" | "opt"
  "trellis_fp16": null
}
```

---

## スマホから操作する（Tailscale）

1. PC とスマホに [Tailscale](https://tailscale.com) を入れてサインイン
2. PC の Tailscale IP（例 `100.x.x.x`）を確認
3. スマホで `http://100.x.x.x:3000` を開く

---

## トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `CUDA out of memory` / 極端に遅い（system RAM へスピル） | VRAM 不足。特に `bake_mode=opt` | `gpu_preset` を `low` に。`bake_mode` を `fast`、`texture_size` を 512/256 に下げる |
| `diff_gaussian_rasterization` 系の import/実行エラー | wheel の torch 版が不一致 | torch を 2.6.0+cu124 に揃え、`...pt2.6.0cu124` の wheel を `--force-reinstall --no-deps` で入れ直す |
| `No module named 'triton'` | triton 未導入 | **無害**。無視可 |
| onnxruntime `cublasLt` 警告 | onnxruntime-gpu の依存 DLL | **無害**。無視可 |
| `kaolin` 関連の import エラー | kaolin 未導入 | パッチ済みなら no-op フォールバックで動作。`scripts/apply_trellis_patches.py` を再実行 |
| TRELLIS の clone 先が違う | `trellis_path` 不一致 | `config/settings.json` の `trellis_path` を実際の場所に合わせる |
| `npm install` が `ERESOLVE` で失敗 | `@google/model-viewer` が古い `three` を peer 指定 | `npm install --legacy-peer-deps` を使う（`setup.ps1` は自動でこれを使用） |
| Godot にファイルが出力されない | `godot_export_path` 未設定/誤り | `config/settings.json` の `godot_export_path` を正しい絶対パスに（`.env` ではなく settings.json） |
| `Port 8000 already in use` | 別プロセス使用中 | `--port 8001` で起動 |

### prebuilt wheel について

`nvdiffrast` と `diff_gaussian_rasterization` は torch のバージョン・CUDA に
厳密一致した wheel が必要です（`...pt2.6.0cu124`）。torch を変えたら必ず
対応する wheel を入れ直してください。提供元: https://miropsota.github.io/torch_packages_builder

---

## 設定のカスタマイズ

すべての設定は `config/settings.json` が正本（SSOT）です。
このファイル以外に設定値をハードコードしないでください。
