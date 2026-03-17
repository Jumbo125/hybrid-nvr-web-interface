from __future__ import annotations

"""app.routers.playback"""

import asyncio
import json
import time
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services import playback as pb

router = APIRouter(prefix="/api/playback", tags=["playback"])


class PlaybackStartRequest(BaseModel):
    camera: Optional[str] = None
    date: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    jobid: Optional[str] = None
    token: Optional[str] = None  # legacy alias

    record_list_thumbnail: bool = True
    record_thumbnails_create_timeout_ms: int = Field(3000, ge=200, le=100000)

    # Historisch leider missverständlich benannt; Wert ist in Millisekunden.
    frame_from_ms: Optional[int] = Field(None, ge=0, le=24 * 3600 * 1000)
    frame_from_ms_sec: Optional[int] = Field(None, ge=0, le=24 * 3600 * 1000)

    width: int = Field(320, ge=64, le=1920)
    height: int = Field(180, ge=64, le=1080)


class PlaybackStartResponse(BaseModel):
    jobid: str
    status: str = "started"
    phase: str = "queued"
    message: str = ""

    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_s: Optional[int] = None
    cached: bool = False

    downloaded_bytes: int = 0
    total_bytes: Optional[int] = None
    percent: Optional[float] = None

    started_ts: Optional[float] = None
    elapsed_s: Optional[float] = None
    timeout_ms: Optional[int] = None

    error: Optional[str] = None
    done: bool = False
    updated_ts: Optional[float] = None


class PlaybackFrameRequest(BaseModel):
    camera: Optional[str] = None
    date: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    jobid: Optional[str] = None
    token: Optional[str] = None  # legacy alias


class PlaybackFrameResponse(BaseModel):
    jobid: str
    exists: bool = False
    thumbnail_url: Optional[str] = None


class PlaybackThumbnailRequest(BaseModel):
    camera: Optional[str] = None
    date: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    jobid: Optional[str] = None
    token: Optional[str] = None  # legacy alias

    timeout_ms: int = Field(3000, ge=200, le=100000)

    frame_from_ms: Optional[int] = Field(None, ge=0, le=24 * 3600 * 1000)
    frame_from_ms_sec: Optional[int] = Field(None, ge=0, le=24 * 3600 * 1000)

    width: int = Field(320, ge=64, le=1920)
    height: int = Field(180, ge=64, le=1080)

    force: bool = False


class PlaybackThumbnailResponse(BaseModel):
    jobid: str
    exists: bool = False
    thumbnail_url: Optional[str] = None
    cached: bool = False
    message: str = ""


@router.post("/start", response_model=PlaybackStartResponse)
def api_playback_start(req: PlaybackStartRequest):
    frame_from_ms = req.frame_from_ms
    if frame_from_ms is None:
        frame_from_ms = req.frame_from_ms_sec
    if frame_from_ms is None:
        frame_from_ms = 1000

    return pb.start_playback_async(
        jobid=(req.jobid or req.token),
        camera=req.camera,
        date=req.date,
        start=req.start,
        end=req.end,
        timeout_ms=req.record_thumbnails_create_timeout_ms,
        record_list_thumbnail=bool(req.record_list_thumbnail),
        frame_from_ms=int(frame_from_ms),
        width=req.width,
        height=req.height,
    )


@router.get("/events/{jobid}")
async def api_playback_events(jobid: str, request: Request):
    async def event_stream():
        last_version = -1
        last_heartbeat = 0.0

        yield "retry: 1000\n\n"

        while True:
            if await request.is_disconnected():
                break

            state = pb.get_playback_progress(jobid)
            version = int(state.get("version", 0) or 0)

            if version != last_version:
                payload = dict(state)
                payload.pop("version", None)
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                last_version = version

                if bool(state.get("done")):
                    break

            now = time.monotonic()
            if (now - last_heartbeat) >= 15.0:
                yield ": keep-alive\n\n"
                last_heartbeat = now

            await asyncio.sleep(0.5)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@router.post("/stop/{jobid}")
def api_playback_stop(jobid: str):
    return pb.stop_playback(jobid)


@router.post("/frame", response_model=PlaybackFrameResponse)
def api_playback_frame(req: PlaybackFrameRequest):
    return pb.get_frame_info(
        jobid=(req.jobid or req.token),
        camera=req.camera,
        date=req.date,
        start=req.start,
        end=req.end,
    )


@router.post("/thumbnail", response_model=PlaybackThumbnailResponse)
def api_playback_thumbnail(req: PlaybackThumbnailRequest):
    frame_from_ms = req.frame_from_ms
    if frame_from_ms is None:
        frame_from_ms = req.frame_from_ms_sec
    if frame_from_ms is None:
        frame_from_ms = 1000

    return pb.create_thumbnail_from_source(
        jobid=(req.jobid or req.token),
        camera=req.camera,
        date=req.date,
        start=req.start,
        end=req.end,
        timeout_ms=req.timeout_ms,
        frame_from_ms=int(frame_from_ms),
        width=req.width,
        height=req.height,
        force=bool(req.force),
    )


@router.post("/stop_all")
def api_playback_stop_all():
    return pb.stop_all()
