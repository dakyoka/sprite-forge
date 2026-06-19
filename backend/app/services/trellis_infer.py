"""
TRELLIS 推論スクリプト（サブプロセスとして呼び出される）
TRELLIS のインストールが完了していることが前提。
SETUP.md の手順に従い trellis/ をクローン・セットアップすること。
"""
import argparse
import sys
from pathlib import Path

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
        from trellis.utils import render_utils, postprocessing_utils
    except ImportError:
        print("ERROR: TRELLIS がインストールされていません。SETUP.md を参照してください。", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype  = torch.float16 if (args.fp16 and device == "cuda") else torch.float32

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
