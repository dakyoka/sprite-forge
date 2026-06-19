"""
SSOT: 全設定はここと config/settings.json だけで管理する。
他のファイルで設定値をハードコードしないこと。

GPU 適応設計:
- 値の正本は config/settings.json の `gpu_presets`。
- 実行時の VRAM 検出とプリセット選択ロジックは `app.core.gpu_profile` に集約。
- `trellis_steps` / `texture_size` / `bake_mode` / `trellis_fp16` は
  「明示オーバーライド」。null の場合は VRAM から選んだプリセット値を使う。
"""
import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

_CONFIG_PATH = Path(__file__).parents[3] / "config" / "settings.json"


class GpuPreset(BaseModel):
    """VRAM 帯ごとの推論パラメータ。値の正本は settings.json。"""
    max_vram_gb: Optional[float] = None  # この帯の上限 VRAM(GB)。null は無制限(最上位)
    trellis_steps: int
    texture_size: int
    bake_mode: str  # "fast" | "opt"
    fp16: bool


# settings.json が存在しない場合のフォールバック定義のみ。
# 実運用での正本は config/settings.json。
_DEFAULT_PRESETS = {
    "low": GpuPreset(max_vram_gb=10, trellis_steps=6, texture_size=512, bake_mode="fast", fp16=True),
    "standard": GpuPreset(max_vram_gb=16, trellis_steps=12, texture_size=1024, bake_mode="fast", fp16=True),
    "high": GpuPreset(max_vram_gb=None, trellis_steps=25, texture_size=2048, bake_mode="opt", fp16=False),
}


class Settings(BaseModel):
    godot_export_path: str = "C:/godot-project/assets/prototype/buildings"
    trellis_path: str = "H:/TRELLIS"
    trellis_model: str = "microsoft/TRELLIS-image-large"

    # --- GPU 適応プリセット ---
    gpu_preset: str = "auto"  # "auto" | プリセット名で強制
    gpu_presets: dict[str, GpuPreset] = _DEFAULT_PRESETS

    # --- 明示オーバーライド (null = プリセットに従う) ---
    trellis_steps: Optional[int] = None
    texture_size: Optional[int] = None
    bake_mode: Optional[str] = None
    trellis_fp16: Optional[bool] = None

    trellis_timeout_sec: int = 3600

    blender_exe: str = ""
    upscale_target_width: int = 2048
    upscale_target_height: int = 2048
    rembg_enabled: bool = False  # 背景除去済み画像を使う場合は False のまま
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
    ]
    cors_origin_regex: str = r"http://(localhost|127\.0\.0\.1):\d+"
    output_dir: str = "output"
    log_level: str = "INFO"

    @classmethod
    def load(cls) -> "Settings":
        if _CONFIG_PATH.exists():
            data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            return cls(**data)
        return cls()


settings = Settings.load()
