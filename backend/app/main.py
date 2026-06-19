"""
SpriteForge — FastAPI Backend
Entry point. All pipeline logic is delegated to services/.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes import pipeline, jobs, history
from app.core.config import settings

app = FastAPI(
    title="SpriteForge API",
    description="2D スプライト → 3D モデル 全自動パイプライン",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(jobs.router,     prefix="/api/jobs",     tags=["jobs"])
app.include_router(history.router,  prefix="/api/history",  tags=["history"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": app.version}
