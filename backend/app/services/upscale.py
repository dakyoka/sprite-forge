"""
Step 2: 画像を TARGET_SIZE にリサイズ（アップスケール）
- realesrgan 等の外部 CLI に依存しない
- Pillow の LANCZOS フィルタで高品質リサイズ
- 既にターゲットサイズ以上の場合はスキップ
"""
import asyncio
from pathlib import Path
from PIL import Image

from app.core.config import settings
from app.models.job import Job

TARGET_W = settings.upscale_target_width
TARGET_H = settings.upscale_target_height


async def run(input_path: Path, job: Job) -> Path:
    # Pillow はブロッキングなので別スレッドで実行（イベントループを塞がない）
    return await asyncio.to_thread(_resize, input_path)


def _resize(input_path: Path) -> Path:
    out_path = input_path.parent / f"{input_path.stem}_upscaled.png"

    with Image.open(input_path) as img:
        w, h = img.size

        if img.mode not in ("RGBA", "RGB"):
            img = img.convert("RGBA")

        # アスペクト比を維持して TARGET_W×TARGET_H に収める（拡大・縮小どちらも対応）
        scale = min(TARGET_W / w, TARGET_H / h)
        new_w = max(1, round(w * scale))
        new_h = max(1, round(h * scale))

        if (new_w, new_h) == (w, h):
            # すでにちょうどターゲットサイズ → リサイズ不要
            img.save(out_path, "PNG")
        else:
            img = img.resize((new_w, new_h), Image.LANCZOS)
            img.save(out_path, "PNG")

    return out_path
