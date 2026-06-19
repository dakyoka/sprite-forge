"""
TRELLIS inference script (called as subprocess).
Adds TRELLIS_PATH to sys.path so 'import trellis' works without pip install.
"""
import argparse
import os
import sys
from pathlib import Path


def _setup_trellis_path():
    trellis_path = os.environ.get("TRELLIS_PATH", r"H:\TRELLIS")
    p = str(Path(trellis_path).resolve())
    if p not in sys.path:
        sys.path.append(p)
    # backend ルートを sys.path に追加し app.core.gpu_profile を import 可能にする
    backend_root = str(Path(__file__).resolve().parents[2])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    os.environ.setdefault("ATTN_BACKEND", "xformers")
    os.environ.setdefault("SPARSE_BACKEND", "spconv")
    os.environ.setdefault("SPCONV_ALGO", "native")
    # VRAM 断片化によるスピル悪化を緩和 (8GB 環境で特に効く)
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


_setup_trellis_path()


def to_glb_fast(app_rep, mesh, simplify=0.95, fill_holes=True,
                fill_holes_max_size=0.04, texture_size=512, nviews=40,
                render_resolution=512, fill_holes_resolution=512,
                fill_holes_num_views=200, verbose=True):
    """
    postprocessing_utils.to_glb 相当のロジックだが、テクスチャベイクを
    高速モード(mode='fast': 勾配最適化なし、ラスタライズ+scatter_add+inpaint)で行う。
    VRAM 8GB環境で opt モード(2500step最適化)のスピルを回避するための実装。
    TRELLIS本体は無改変で、関数を import して再利用する。

    オリジナルの bake_texture(mode='fast') にあるマスク選択バグ
    (全ビューで masks[0] を使ってしまう) をここで修正し、ビューごとの
    マスクを正しく使う。
    """
    import numpy as np
    import torch
    import utils3d
    import cv2
    from PIL import Image
    import trimesh
    import trimesh.visual
    from trellis.utils.postprocessing_utils import postprocess_mesh, parametrize_mesh
    from trellis.utils.render_utils import render_multiview

    vertices = mesh.vertices.cpu().numpy()
    faces = mesh.faces.cpu().numpy()

    # メッシュ後処理 (簡略化 + 不可視面除去 + 穴埋め)
    # fill_holes のビュー数/解像度は VRAM とレンダリング時間を最も食う箇所なので
    # 8GB 環境向けに大幅に下げる (品質はやや低下するが現実的な時間で完了させる)。
    print(f"[TRELLIS] postprocess_mesh (fill_holes views={fill_holes_num_views}, res={fill_holes_resolution})...", file=sys.stderr)
    vertices, faces = postprocess_mesh(
        vertices, faces,
        simplify=simplify > 0,
        simplify_ratio=simplify,
        fill_holes=fill_holes,
        fill_holes_max_hole_size=fill_holes_max_size,
        fill_holes_max_hole_nbe=int(250 * np.sqrt(1 - simplify)),
        fill_holes_resolution=fill_holes_resolution,
        fill_holes_num_views=fill_holes_num_views,
        debug=False,
        verbose=verbose,
    )

    # UV展開
    print("[TRELLIS] parametrize_mesh (UV unwrap)...", file=sys.stderr)
    vertices, faces, uvs = parametrize_mesh(vertices, faces)

    # マルチビュー観測をレンダリング
    print(f"[TRELLIS] render_multiview (nviews={nviews}, res={render_resolution})...", file=sys.stderr)
    observations, extrinsics, intrinsics = render_multiview(
        app_rep, resolution=render_resolution, nviews=nviews
    )
    masks = [np.any(obs > 0, axis=-1) for obs in observations]

    # 重い最適化前にVRAMを解放
    torch.cuda.empty_cache()

    # --- fast テクスチャベイク (ビューごとのマスクを正しく使用) ---
    t_vertices = torch.tensor(vertices).cuda()
    t_faces = torch.tensor(faces.astype(np.int32)).cuda()
    t_uvs = torch.tensor(uvs).cuda()
    t_obs = [torch.tensor(obs / 255.0).float().cuda() for obs in observations]
    t_masks = [torch.tensor(m > 0).bool().cuda() for m in masks]
    views = [utils3d.torch.extrinsics_to_view(torch.tensor(extr).cuda())
             for extr in extrinsics]
    projections = [
        utils3d.torch.intrinsics_to_perspective(torch.tensor(intr).cuda(), 0.1, 10.0)
        for intr in intrinsics
    ]

    texture = torch.zeros((texture_size * texture_size, 3),
                          dtype=torch.float32).cuda()
    texture_weights = torch.zeros((texture_size * texture_size),
                                  dtype=torch.float32).cuda()
    rastctx = utils3d.torch.RastContext(backend='cuda')
    from tqdm import tqdm
    for i in tqdm(range(len(t_obs)), disable=not verbose,
                  desc='Texture baking (fast)'):
        observation, view, projection, vmask = t_obs[i], views[i], projections[i], t_masks[i]
        with torch.no_grad():
            rast = utils3d.torch.rasterize_triangle_faces(
                rastctx, t_vertices[None], t_faces,
                observation.shape[1], observation.shape[0],
                uv=t_uvs[None], view=view, projection=projection
            )
            uv_map = rast['uv'][0].detach().flip(0)
            mask = rast['mask'][0].detach().bool() & vmask
        uv_map = (uv_map * texture_size).floor().long()
        obs = observation[mask]
        uv_map = uv_map[mask]
        idx = uv_map[:, 0] + (texture_size - uv_map[:, 1] - 1) * texture_size
        texture = texture.scatter_add(0, idx.view(-1, 1).expand(-1, 3), obs)
        texture_weights = texture_weights.scatter_add(
            0, idx, torch.ones((obs.shape[0]), dtype=torch.float32, device=texture.device)
        )

    w_mask = texture_weights > 0
    texture[w_mask] /= texture_weights[w_mask][:, None]
    texture_np = np.clip(
        texture.reshape(texture_size, texture_size, 3).cpu().numpy() * 255, 0, 255
    ).astype(np.uint8)
    inpaint_mask = (texture_weights == 0).cpu().numpy().astype(np.uint8).reshape(
        texture_size, texture_size)
    texture_np = cv2.inpaint(texture_np, inpaint_mask, 3, cv2.INPAINT_TELEA)
    texture_img = Image.fromarray(texture_np)

    # z-up -> y-up
    vertices = vertices @ np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
    material = trimesh.visual.material.PBRMaterial(
        roughnessFactor=1.0,
        baseColorTexture=texture_img,
        baseColorFactor=np.array([255, 255, 255, 255], dtype=np.uint8),
    )
    out_mesh = trimesh.Trimesh(
        vertices, faces,
        visual=trimesh.visual.TextureVisuals(uv=uvs, material=material),
    )
    return out_mesh


def _resolve_profile(args):
    """settings.json のプリセット + VRAM 検出 + CLI 引数から実効値を決める。"""
    cli_overrides = {
        "trellis_steps": args.steps,
        "texture_size": args.texture_size,
        "bake_mode": args.bake_mode,
        "fp16": args.fp16,
    }
    try:
        from app.core.gpu_profile import resolve_profile
        return resolve_profile(forced_preset=args.gpu_preset, cli_overrides=cli_overrides)
    except Exception as exc:  # gpu_profile が import できない等の保険
        print(f"WARNING: gpu_profile 解決に失敗、軽量既定値で続行: {exc}", file=sys.stderr)
        return {
            "trellis_steps": args.steps or 6,
            "texture_size": args.texture_size or 512,
            "bake_mode": args.bake_mode or "fast",
            "fp16": args.fp16 if args.fp16 is not None else True,
            "preset_name": "fallback",
            "vram_gb": None,
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model",  default="microsoft/TRELLIS-image-large")
    # 以下はすべて「指定された場合のみ」プリセットを上書き (既定は None)
    parser.add_argument("--steps", type=int, default=None)
    parser.add_argument("--texture-size", type=int, default=None)
    parser.add_argument("--bake-mode", choices=["fast", "opt"], default=None)
    parser.add_argument("--gpu-preset", default=None, help='"low"|"standard"|"high" でプリセット強制')
    parser.add_argument("--cfg-strength-sparse", type=float, default=7.5)
    parser.add_argument("--cfg-strength-slat",   type=float, default=3.0)
    parser.add_argument("--nviews", type=int, default=40)
    parser.add_argument("--render-resolution", type=int, default=512)
    parser.add_argument("--fp16",    dest="fp16", action="store_true",  default=None)
    parser.add_argument("--no-fp16", dest="fp16", action="store_false")
    args = parser.parse_args()

    profile = _resolve_profile(args)
    steps = profile["trellis_steps"]
    texture_size = profile["texture_size"]
    bake_mode = profile["bake_mode"]
    fp16 = bool(profile["fp16"])
    vram_str = f"{profile['vram_gb']:.1f}GB" if profile.get("vram_gb") else "unknown"
    print(
        f"[TRELLIS] GPU profile: preset={profile['preset_name']} vram={vram_str} "
        f"steps={steps} texture_size={texture_size} bake_mode={bake_mode} fp16={fp16}",
        file=sys.stderr,
    )

    try:
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
        from trellis.utils import postprocessing_utils
    except ImportError as exc:
        import traceback
        traceback.print_exc()
        print(f"ERROR: TRELLIS import failed: {exc}", file=sys.stderr)
        print("SETUP.md を参照して H:/TRELLIS をセットアップしてください。", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: CUDA not available, running on CPU (very slow)", file=sys.stderr)
        fp16 = False

    print(f"[TRELLIS] Loading model: {args.model} (device={device}, fp16={fp16})", file=sys.stderr)
    pipeline = TrellisImageTo3DPipeline.from_pretrained(args.model)
    # 重みは常に fp32 のまま保持する。以前は fp16 時に全モデルへ .half() を適用していたが、
    # mesh デコーダ (cube2mesh/flexicubes) の scatter_reduce が fp32 を前提としており
    # "scatter(): Expected self.dtype to be equal to src.dtype" でクラッシュしていた。
    # 代わりに fp16 はサンプリング段のみ autocast で適用し、デコードは fp32 で実行する。
    pipeline.to(device)

    from PIL import Image
    image = Image.open(args.input).convert("RGBA")

    use_fp16 = fp16 and device == "cuda"
    print(f"[TRELLIS] Running inference (steps={steps}, fp16={use_fp16}, device={device})...", file=sys.stderr)
    # run() 相当の処理を手動展開する。fp16 autocast はサンプリング段
    # (sample_sparse_structure / sample_slat) にのみ適用し、decode_slat は
    # fp32 で実行することで mesh デコーダの scatter_reduce dtype 不一致を回避する。
    # spconv を使う sample_slat も autocast 配下で動作することを確認済み
    # (両サンプリング段を fp16 化)。
    with torch.no_grad():
        # run() は preprocess_image=True が既定。その挙動を踏襲する。
        img = pipeline.preprocess_image(image)
        cond = pipeline.get_cond([img])
        torch.manual_seed(42)  # run() と同様にサンプリング前にシードを設定
        ss_params = {"steps": steps, "cfg_strength": args.cfg_strength_sparse}
        slat_params = {"steps": steps, "cfg_strength": args.cfg_strength_slat}
        if use_fp16:
            with torch.autocast(device_type="cuda", dtype=torch.float16):
                coords = pipeline.sample_sparse_structure(cond, 1, ss_params)
                slat = pipeline.sample_slat(cond, coords, slat_params)
        else:
            coords = pipeline.sample_sparse_structure(cond, 1, ss_params)
            slat = pipeline.sample_slat(cond, coords, slat_params)
        # デコードは fp32 (autocast なし) で実行し scatter dtype 不一致を防ぐ。
        # GLB 化に必要なのは mesh と gaussian のみ。radiance_field のデコードを
        # 省略して VRAM とデコード時間を削減する。
        outputs = pipeline.decode_slat(slat, formats=["mesh", "gaussian"])
    print("[TRELLIS] Sampling + decode done. Starting GLB export...", file=sys.stderr)
    if device == "cuda":
        torch.cuda.empty_cache()

    glb_path = Path(args.output)
    if bake_mode == "opt":
        # 高品質モード: TRELLIS 標準の勾配最適化ベイク (VRAM 多め)
        print(f"[TRELLIS] Exporting GLB (opt texture bake, size={texture_size}): {glb_path}", file=sys.stderr)
        mesh = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=0.95,
            texture_size=texture_size,
        )
    else:
        # 軽量モード: fast ベイク (低 VRAM・短時間)
        print(f"[TRELLIS] Exporting GLB (fast texture bake, size={texture_size}): {glb_path}", file=sys.stderr)
        mesh = to_glb_fast(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=0.95,
            texture_size=texture_size,
            nviews=args.nviews,
            render_resolution=args.render_resolution,
        )
    mesh.export(str(glb_path))
    print(f"OK: {glb_path}")


if __name__ == "__main__":
    main()
