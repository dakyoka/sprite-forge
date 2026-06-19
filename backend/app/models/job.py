"""
SSOT: ジョブのデータ構造はここだけで定義する。
フロントエンドの型は openapi-typescript で自動生成する。
"""
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class StepStatus(str, Enum):
    pending  = "pending"
    running  = "running"
    done     = "done"
    error    = "error"


class PipelineStep(BaseModel):
    step_id:   str
    label:     str
    status:    StepStatus = StepStatus.pending
    detail:    str = ""
    started_at:  datetime | None = None
    finished_at: datetime | None = None


class JobStatus(str, Enum):
    queued     = "queued"
    running    = "running"
    completed  = "completed"
    failed     = "failed"


class Job(BaseModel):
    job_id:      str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename:    str
    status:      JobStatus = JobStatus.queued
    progress:    int = 0  # 0-100
    steps:       list[PipelineStep] = Field(default_factory=lambda: [
        PipelineStep(step_id="upload",    label="画像読み込み"),
        PipelineStep(step_id="upscale",   label="アップスケール"),
        PipelineStep(step_id="rembg",     label="背景除去"),
        PipelineStep(step_id="trellis",   label="Trellis 3D 生成"),
        PipelineStep(step_id="blender",   label="Blender 後処理"),
        PipelineStep(step_id="godot",     label="Godot 書き出し"),
    ])
    output_glb:  str | None = None
    glb_size:    int | None = None   # GLB ファイルサイズ(bytes)
    vertices:    int | None = None   # 頂点数
    faces:       int | None = None   # 面(ポリゴン)数
    created_at:  datetime = Field(default_factory=datetime.utcnow)
    updated_at:  datetime = Field(default_factory=datetime.utcnow)
    error_msg:   str | None = None
