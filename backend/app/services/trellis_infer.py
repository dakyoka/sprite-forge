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
        sys.path.insert(0, p)
    os.environ.setdefault("ATTN_BACKEND", "xformers")
    os.environ.setdefault("SPARSE_BACKEND", "spconv")


_setup_trellis_path()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model",  default="microsoft/TRELLIS-image-large")
    parser.add_argument("--steps",  type=int, default=12)
    parser.add_argument("--fp16",   action="store_true")
    args = parser.parse_args()

    try:
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
        from trellis.utils import postprocessing_utils
    except ImportError as exc:
        print(f"ERROR: TRELLIS import failed: {exc}", file=sys.stderr)
        print("SETUP.md を参照して H:/TRELLIS をセットアップしてください。", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: CUDA not available, running on CPU (very slow)", file=sys.stderr)

    pipeline = TrellisImageTo3DPipeline.from_pretrained(args.model)
    pipeline = pipeline.to(device)

    from PIL import Image
    image = Image.open(args.input).convert("RGBA")

    outputs = pipeline.run(image, num_steps=args.steps)

    glb_path = Path(args.output)
    mesh = postprocessing_utils.to_glb(
        outputs["gaussian"][0],
        outputs["mesh"][0],
        simplify=0.95,
        texture_size=1024,
    )
    mesh.export(str(glb_path))
    print(f"OK: {glb_path}")


if __name__ == "__main__":
    main()
