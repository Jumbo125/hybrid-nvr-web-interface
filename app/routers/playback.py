from __future__ import annotations

"""app.routers.playback"""

from typing import Optional

from fastapi import APIRouter
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
    video_url: str
    thumbnail_url: Optional[str] = None
    duration_s: int
    cached: bool = False
    message: str = ""


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

    return pb.start_playback(
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