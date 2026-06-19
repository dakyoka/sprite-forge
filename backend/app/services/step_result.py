"""
パイプライン各ステップの戻り値表現。

ステップ関数は従来どおり Path を返してもよい(= done 扱い)。
実質 no-op だった場合は StepResult(path, skipped=True, detail=...) を返すことで、
ランナーが「完了」ではなく「スキップ」として正直に記録できるようにする。
"""
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StepResult:
    path: Path
    skipped: bool = False
    detail: str = ""
