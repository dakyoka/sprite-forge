"""
GPU 適応プロファイルの解決ロジック (SSOT: config/settings.json)。

このモジュールは標準ライブラリのみに依存し (torch は遅延 import)、
バックエンド本体・推論サブプロセス(trellis_infer.py)の双方から再利用できる。

解決の優先順位 (高い順):
  1. CLI オーバーライド (trellis_infer.py の引数)
  2. settings.json の明示オーバーライド (trellis_steps / texture_size /
     bake_mode / trellis_fp16 が null でない場合)
  3. VRAM から自動選択したプリセット (gpu_preset="auto")
     ※ gpu_preset にプリセット名が指定されていればそれを強制
"""
import json
from pathlib import Path
from typing import Optional

_CONFIG_PATH = Path(__file__).parents[3] / "config" / "settings.json"

# settings.json が無い場合のフォールバックのみ。値の正本は settings.json。
_FALLBACK_PRESETS = {
    "low": {"max_vram_gb": 10, "trellis_steps": 6, "texture_size": 512, "bake_mode": "fast", "fp16": True},
    "standard": {"max_vram_gb": 16, "trellis_steps": 12, "texture_size": 1024, "bake_mode": "fast", "fp16": True},
    "high": {"max_vram_gb": None, "trellis_steps": 25, "texture_size": 2048, "bake_mode": "opt", "fp16": False},
}


def load_settings_dict() -> dict:
    """config/settings.json を素の dict として読む (pydantic 非依存)。"""
    if _CONFIG_PATH.exists():
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def detect_vram_gb() -> Optional[float]:
    """利用可能な GPU の総 VRAM(GB) を返す。検出不可なら None。"""
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            return props.total_memory / (1024 ** 3)
    except Exception:
        pass
    return None


def _sorted_presets(presets: dict):
    """max_vram_gb 昇順 (null は無限大扱い) で (name, preset) を返す。"""
    def key(item):
        cap = item[1].get("max_vram_gb")
        return (cap is None, float("inf") if cap is None else cap)
    return sorted(presets.items(), key=key)


def select_preset_name(vram_gb: Optional[float], presets: dict, forced: Optional[str] = None) -> str:
    """VRAM と強制指定からプリセット名を決定する。"""
    if forced and forced != "auto" and forced in presets:
        return forced
    ordered = _sorted_presets(presets)
    if not ordered:
        raise ValueError("gpu_presets が空です")
    if vram_gb is None:
        # 検出不可なら最も安全な(=最小 VRAM 帯の)プリセット
        return ordered[0][0]
    for name, p in ordered:
        cap = p.get("max_vram_gb")
        if cap is None or vram_gb <= cap:
            return name
    return ordered[-1][0]


def resolve_profile(
    settings: Optional[dict] = None,
    vram_gb="detect",
    forced_preset: Optional[str] = None,
    cli_overrides: Optional[dict] = None,
) -> dict:
    """
    実効プロファイルを解決して返す。

    返り値 dict のキー:
      trellis_steps, texture_size, bake_mode, fp16,
      preset_name, vram_gb
    """
    settings = settings if settings is not None else load_settings_dict()
    presets = settings.get("gpu_presets") or _FALLBACK_PRESETS

    forced = forced_preset or settings.get("gpu_preset", "auto")

    if vram_gb == "detect":
        vram_gb = detect_vram_gb()

    name = select_preset_name(vram_gb, presets, forced)
    base = presets[name]

    profile = {
        "trellis_steps": base["trellis_steps"],
        "texture_size": base["texture_size"],
        "bake_mode": base["bake_mode"],
        "fp16": base["fp16"],
        "preset_name": name,
        "vram_gb": vram_gb,
    }

    # settings.json の明示オーバーライド (null/未設定は無視)
    for pkey, skey in (
        ("trellis_steps", "trellis_steps"),
        ("texture_size", "texture_size"),
        ("bake_mode", "bake_mode"),
        ("fp16", "trellis_fp16"),
    ):
        val = settings.get(skey)
        if val is not None:
            profile[pkey] = val

    # CLI オーバーライド (最優先)
    if cli_overrides:
        for k, v in cli_overrides.items():
            if v is not None and k in profile:
                profile[k] = v

    return profile
