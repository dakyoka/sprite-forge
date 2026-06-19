"""
SSOT: 全設定はここと config/settings.json だけで管理する。
他のファイルで設定値をハードコードしないこと。
"""
import json
from pathlib import Path
from pydantic import BaseModel

_CONFIG_PATH = Path(__file__).parents[3] / "config" / "settings.json"


class Settings(BaseModel):
    godot_export_path: str = "C:/godot-project/assets/prototype/buildings"
    trellis_model: str = "microsoft/TRELLIS-image-large"
    trellis_steps: int = 12
    trellis_fp16: bool = True
    upscale_target_width: int = 2048
    upscale_target_height: int = 2048
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
