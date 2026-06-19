# SpriteForge セットアップ手順

> 新卒エンジニアでも迷わないよう、コマンドを一行ずつ書いています。

## 必要なもの（事前インストール）

| ソフト | バージョン | 入手先 |
|---|---|---|
| Python | 3.11 以上 | https://www.python.org |
| Node.js | 20 LTS 以上 | https://nodejs.org |
| Git | 最新 | https://git-scm.com |
| NVIDIA ドライバ | 535 以上 | NVIDIA 公式 |
| CUDA Toolkit | 12.x | https://developer.nvidia.com/cuda-downloads |
| Blender | 4.0 以上 | https://www.blender.org |

---

## STEP 1 — リポジトリのクローン

```bash
git clone https://github.com/dakyoka/sprite-forge.git
cd sprite-forge
```

---

## STEP 2 — 環境変数の設定

```bash
copy .env.example .env
```

`.env` をテキストエディタで開き、以下の行を自分の環境に合わせて変更してください：

```
SF_GODOT_EXPORT_PATH=C:/Users/あなたのユーザー名/godot-project/assets/prototype/buildings
```

> Godot プロジェクトの `res://assets/prototype/buildings/` に対応するフォルダのフルパスを書いてください。

---

## STEP 3 — TRELLIS のインストール

TRELLIS は Microsoft が公開しているローカル 3D 生成モデルです。
別途クローン・インストールが必要です。

```bash
# sprite-forge フォルダとは別の場所にクローンしてOK
git clone https://github.com/microsoft/TRELLIS.git
cd TRELLIS

# Python 仮想環境を作成（推奨）
python -m venv .venv
.venv\Scripts\activate

# 依存関係のインストール（時間がかかります：10〜30分）
pip install -e ".[train]"

# モデルの事前ダウンロード（約 8GB）
python -c "from trellis.pipelines import TrellisImageTo3DPipeline; TrellisImageTo3DPipeline.from_pretrained('microsoft/TRELLIS-image-large')"
```

> ⚠ RTX 3070 8GB の場合はメモリ不足でエラーになる可能性があります。
> RTX 3060 **12GB** 以上を推奨します。

---

## STEP 4 — バックエンドのセットアップ

```bash
cd sprite-forge/backend

# Python 仮想環境を作成
python -m venv .venv
.venv\Scripts\activate

# パッケージのインストール
pip install -r requirements.txt

# サーバー起動
uvicorn app.main:app --reload --port 8000
```

ターミナルに `Application startup complete.` と表示されれば OK です。

---

## STEP 5 — フロントエンドのセットアップ

新しいターミナルを開いて：

```bash
cd sprite-forge/frontend

npm install
npm run dev
```

`http://localhost:3000` と表示されれば OK です。

---

## STEP 6 — 動作確認

1. ブラウザで http://localhost:3000 を開く
2. 建物などの画像（PNG 推奨）をドロップ
3. パイプラインが自動で進み始めることを確認
4. 完了後、`config/settings.json` の `godot_export_path` フォルダに `.glb` が保存されていることを確認

---

## スマホから操作する（Tailscale）

1. [Tailscale](https://tailscale.com) をインストールしてアカウントを作成
2. PC とスマホの両方に Tailscale を入れてサインイン
3. Tailscale 管理画面で PC の IP アドレスを確認（例: `100.x.x.x`）
4. スマホのブラウザで `http://100.x.x.x:3000` を開く

---

## よくあるエラー

| エラー | 原因 | 対処 |
|---|---|---|
| `CUDA out of memory` | VRAM 不足 | `settings.json` の `trellis_steps` を 8 に下げる |
| `Blender が見つかりません` | Blender が PATH にない | Blender を再インストールし「PATH に追加」にチェック |
| `rembg` インポートエラー | onnxruntime 未インストール | `pip install onnxruntime-gpu` |
| `Port 8000 already in use` | 別プロセスが使用中 | `uvicorn ... --port 8001` で起動し `.env` の port も変更 |

---

## 設定のカスタマイズ

すべての設定は `config/settings.json` で管理しています：

```json
{
  "godot_export_path": "Godot フォルダのパス",
  "trellis_steps": 12,
  "trellis_fp16": true,
  "upscale_factor": 4
}
```

> ⚠ このファイル以外の場所に設定値をハードコードしないでください（SSOT ポリシー）。
