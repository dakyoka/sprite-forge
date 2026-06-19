"""
ジョブストア(永続化)。

ジョブ履歴を JSON ファイルに保存し、バックエンド再起動後も復元できるようにする。
(以前はインメモリ dict のみで、再起動すると履歴が消えていた。)

- 正本はメモリ上の `jobs` dict。更新のたびに `save()` でファイルへ書き出す。
- 起動時に `load()` でファイルから復元する。
- 保存先は settings.output_dir/jobs.json。
"""
import json
import logging
from pathlib import Path

from app.models.job import Job
from app.core.config import settings

logger = logging.getLogger(__name__)

_STORE_FILE = Path(settings.output_dir) / "jobs.json"

# プロセス内のジョブ正本。各ルートはこの dict を共有する。
jobs: dict[str, Job] = {}


def load() -> None:
    """起動時にファイルからジョブを復元する。失敗しても起動は止めない。"""
    if not _STORE_FILE.exists():
        return
    try:
        data = json.loads(_STORE_FILE.read_text(encoding="utf-8"))
        for jid, jd in data.items():
            try:
                jobs[jid] = Job(**jd)
            except Exception as e:
                logger.warning(f"job restore skipped ({jid}): {e}")
    except Exception as e:
        logger.warning(f"job store load failed: {e}")


def save() -> None:
    """現在のジョブ一覧をファイルへ書き出す。I/O 失敗は握りつぶす(処理は継続)。"""
    try:
        _STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {jid: j.model_dump(mode="json") for jid, j in jobs.items()}
        _STORE_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning(f"job store save failed: {e}")


load()
