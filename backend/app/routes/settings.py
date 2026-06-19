"""
GET /api/settings — 実効設定(GPU プロファイル解決後)を返す読み取り専用ビュー。

SSOT は config/settings.json。ここでは値を変更せず、
gpu_profile.resolve_profile() で解決した実効値を返すだけ。
"""
from fastapi import APIRouter

from app.core.config import settings
from app.core import gpu_profile

router = APIRouter()


@router.get("")
async def get_effective_settings():
    profile = gpu_profile.resolve_profile()
    return {
        # GPU プリセット(強制指定 / 解決結果)
        "gpu_preset": settings.gpu_preset,
        "resolved_preset": profile["preset_name"],
        "vram_gb": profile["vram_gb"],
        # GPU プロファイルから解決された実効推論パラメータ
        "trellis_steps": profile["trellis_steps"],
        "texture_size": profile["texture_size"],
        "bake_mode": profile["bake_mode"],
        "fp16": profile["fp16"],
        # その他の主要設定
        "trellis_model": settings.trellis_model,
        "trellis_timeout_sec": settings.trellis_timeout_sec,
        "godot_export_path": settings.godot_export_path,
        "blender_exe": settings.blender_exe or None,
        "output_dir": settings.output_dir,
    }
