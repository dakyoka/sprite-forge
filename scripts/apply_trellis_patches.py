"""
TRELLIS 本体 (このリポジトリ管理外) に必要なパッチを冪等に適用する。

clone 直後の upstream TRELLIS は RTX 30xx + 標準 graphdeco 版
diff_gaussian_rasterizer / kaolin 無し環境では動かないため、以下 2 つを当てる:

  1. trellis/representations/mesh/flexicubes/flexicubes.py
     kaolin import を try/except 化 (check_tensor を no-op フォールバック)
  2. trellis/renderers/gaussian_render.py
     標準ラスタライザ互換: GaussianRasterizationSettings._fields を見て
     kernel_size/subpixel_offset/antialiasing を出し分け、戻り値は out[0]/out[1] で受ける

既に適用済みなら二重適用しない (冪等)。

使い方:
  python scripts/apply_trellis_patches.py [--trellis-path H:\\TRELLIS]
TRELLIS の場所は (1)--trellis-path (2)環境変数 TRELLIS_PATH
(3)config/settings.json の trellis_path (4)既定 H:/TRELLIS の順で解決。
"""
import argparse
import json
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_SETTINGS = _REPO_ROOT / "config" / "settings.json"


def _resolve_trellis_path(cli_path):
    if cli_path:
        return Path(cli_path)
    env = os.environ.get("TRELLIS_PATH")
    if env:
        return Path(env)
    if _SETTINGS.exists():
        try:
            data = json.loads(_SETTINGS.read_text(encoding="utf-8"))
            if data.get("trellis_path"):
                return Path(data["trellis_path"])
        except Exception:
            pass
    return Path(r"H:/TRELLIS")


def _read(path: Path) -> str:
    # newline="" で改行コードをそのまま保持する
    return path.read_text(encoding="utf-8")


def _write(path: Path, text: str):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


# --- パッチ 1: flexicubes.py ---------------------------------------------------

_FLEXI_ORIG = "from kaolin.utils.testing import check_tensor"
_FLEXI_PATCHED = (
    "\n"
    "try:\n"
    "    from kaolin.utils.testing import check_tensor\n"
    "except ImportError:\n"
    "    def check_tensor(tensor, shape, throw=True):\n"
    "        return True"
)


def patch_flexicubes(trellis: Path) -> str:
    path = trellis / "trellis" / "representations" / "mesh" / "flexicubes" / "flexicubes.py"
    if not path.exists():
        return f"SKIP (not found): {path}"
    text = _read(path)
    if "def check_tensor(tensor, shape, throw=True):" in text:
        return f"OK (already patched): {path}"
    if _FLEXI_ORIG not in text:
        return f"WARN (anchor not found, manual check needed): {path}"
    text = text.replace(_FLEXI_ORIG, _FLEXI_PATCHED, 1)
    _write(path, text)
    return f"PATCHED: {path}"


# --- パッチ 2: gaussian_render.py ---------------------------------------------

_GR_SETTINGS_ORIG = """    raster_settings = GaussianRasterizationSettings(
        image_height=int(viewpoint_camera.image_height),
        image_width=int(viewpoint_camera.image_width),
        tanfovx=tanfovx,
        tanfovy=tanfovy,
        kernel_size=kernel_size,
        subpixel_offset=subpixel_offset,
        bg=bg_color,
        scale_modifier=scaling_modifier,
        viewmatrix=viewpoint_camera.world_view_transform,
        projmatrix=viewpoint_camera.full_proj_transform,
        sh_degree=pc.active_sh_degree,
        campos=viewpoint_camera.camera_center,
        prefiltered=False,
        debug=pipe.debug
    )"""

_GR_SETTINGS_PATCHED = """    _settings_kwargs = dict(
        image_height=int(viewpoint_camera.image_height),
        image_width=int(viewpoint_camera.image_width),
        tanfovx=tanfovx,
        tanfovy=tanfovy,
        bg=bg_color,
        scale_modifier=scaling_modifier,
        viewmatrix=viewpoint_camera.world_view_transform,
        projmatrix=viewpoint_camera.full_proj_transform,
        sh_degree=pc.active_sh_degree,
        campos=viewpoint_camera.camera_center,
        prefiltered=False,
        debug=pipe.debug,
    )
    # Support both the mip-splatting fork (kernel_size/subpixel_offset) and the
    # standard graphdeco rasterizer (antialiasing) by only passing supported fields.
    _supported = set(GaussianRasterizationSettings._fields)
    if "kernel_size" in _supported:
        _settings_kwargs["kernel_size"] = kernel_size
    if "subpixel_offset" in _supported:
        _settings_kwargs["subpixel_offset"] = subpixel_offset
    if "antialiasing" in _supported:
        _settings_kwargs["antialiasing"] = False
    raster_settings = GaussianRasterizationSettings(**_settings_kwargs)"""

_GR_CALL_ORIG = (
    "    # Rasterize visible Gaussians to image, obtain their radii (on screen). \n"
    "    rendered_image, radii = rasterizer("
)
_GR_CALL_PATCHED = (
    "    # Rasterize visible Gaussians to image, obtain their radii (on screen).\n"
    "    _raster_out = rasterizer("
)

_GR_CLOSE_ORIG = """        cov3D_precomp = cov3D_precomp
    )

    # Those Gaussians that were frustum culled or had a radius of 0 were not visible."""

_GR_CLOSE_PATCHED = """        cov3D_precomp = cov3D_precomp
    )
    # mip fork returns (image, radii); standard graphdeco returns (image, radii, depth)
    rendered_image, radii = _raster_out[0], _raster_out[1]

    # Those Gaussians that were frustum culled or had a radius of 0 were not visible."""


def patch_gaussian_render(trellis: Path) -> str:
    path = trellis / "trellis" / "renderers" / "gaussian_render.py"
    if not path.exists():
        return f"SKIP (not found): {path}"
    text = _read(path)
    if "_settings_kwargs" in text and "_raster_out" in text:
        return f"OK (already patched): {path}"

    changed = False
    notes = []

    if "_settings_kwargs" not in text:
        if _GR_SETTINGS_ORIG in text:
            text = text.replace(_GR_SETTINGS_ORIG, _GR_SETTINGS_PATCHED, 1)
            changed = True
        else:
            notes.append("settings anchor not found")

    if "_raster_out" not in text:
        if _GR_CALL_ORIG in text and _GR_CLOSE_ORIG in text:
            text = text.replace(_GR_CALL_ORIG, _GR_CALL_PATCHED, 1)
            text = text.replace(_GR_CLOSE_ORIG, _GR_CLOSE_PATCHED, 1)
            changed = True
        else:
            notes.append("rasterizer-call anchor not found")

    if changed:
        _write(path, text)
        suffix = (" [" + "; ".join(notes) + "]") if notes else ""
        return f"PATCHED: {path}{suffix}"
    if notes:
        return f"WARN ({'; '.join(notes)}, manual check needed): {path}"
    return f"OK (already patched): {path}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trellis-path", default=None)
    args = parser.parse_args()

    trellis = _resolve_trellis_path(args.trellis_path).resolve()
    print(f"[apply_trellis_patches] TRELLIS path: {trellis}")
    if not trellis.exists():
        print(f"ERROR: TRELLIS path が存在しません: {trellis}", file=sys.stderr)
        sys.exit(1)

    results = [
        patch_flexicubes(trellis),
        patch_gaussian_render(trellis),
    ]
    failed = False
    for r in results:
        print(f"  {r}")
        if r.startswith("WARN") or r.startswith("ERROR"):
            failed = True

    if failed:
        print("一部のパッチが当てられませんでした。TRELLIS のバージョンを確認してください。", file=sys.stderr)
        sys.exit(2)
    print("[apply_trellis_patches] done.")


if __name__ == "__main__":
    main()
