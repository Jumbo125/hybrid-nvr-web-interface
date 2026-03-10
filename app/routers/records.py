from __future__ import annotations

"""
routers/records.py
==================
Record-Search & DailyDistribution Endpoints.

Prinzip:
- Router enthält: Query/Body Params + Pydantic Models + Response Mapping.
- ISAPI Requests: app.services.isapi
- Token/Time/Track Helpers: app.services.playback

Wie erweitern?
--------------
- Neues JSON Feld in Response:
  1) Pydantic Model erweitern
  2) Parser ergänzen (wo matches gebaut werden)

- Neuer ISAPI Endpoint:
  1) Neues @router.get/@router.post
  2) cam = pb.get_record_cam(camera)
  3) xml_body bauen
  4) isapi_request(cam, METHOD, PATH, xml_body)
  5) XML parsen + JSON returnen
"""

import uuid
import html
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from cameras import CAMERAS, LOG_ENABLED, DEBUG_LOGGING
from app.services.isapi import isapi_request, strip_ns
from app.services import playback as pb
from app.logging_setup import get_logger

from pathlib import Path
from datetime import datetime, timezone
import re


logger = get_logger()
router = APIRouter(prefix="/api/records", tags=["records"])


class RecordSearchResponse(BaseModel):
    camera: str
    searchID: str
    startTime: str
    endTime: str
    maxResults: int
    searchResultPosition: int
    status: str
    numOfMatches: Optional[int] = None
    matches: List[Dict[str, Any]]
    nextPosition: Optional[int] = None


class DailyDistributionResponse(BaseModel):
    camera: str
    year: int
    month: int
    recordChannelId: str
    days: List[Dict[str, Any]]


def _find_text_any(parent: ET.Element, paths: List[str]) -> Optional[str]:
    for p in paths:
        n = parent.find(p)
        if n is not None and n.text:
            return n.text.strip()
    return None


SEARCH_LOG_ROOT = Path("search_log")

_rtsp_cred_re = re.compile(r"(rtsp://[^:\s/]+:)([^@\s]+)(@)", re.IGNORECASE)

def _safe_fs_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]+', "_", str(name)).strip(" .")


def _sanitize_for_log(text: str) -> str:
    return _rtsp_cred_re.sub(r"\1***\3", text)


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8", errors="replace")
    tmp.replace(path)


def dump_search_log(camera: str, search_id: str, request_xml: str, response_text: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = f"{ts}_{search_id}"
    folder = SEARCH_LOG_ROOT / _safe_fs_name(camera)

    req_path = folder / f"{base}_request.txt"
    resp_path = folder / f"{base}_response.txt"

    _write_text_atomic(req_path, _sanitize_for_log(request_xml))
    _write_text_atomic(resp_path, _sanitize_for_log(response_text))


def dump_search_request(camera: str, search_id: str, request_xml: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = f"{ts}_{search_id}"
    folder = SEARCH_LOG_ROOT / _safe_fs_name(camera)
    req_path = folder / f"{base}_request.txt"

    _write_text_atomic(req_path, _sanitize_for_log(request_xml))


@router.get("/search", response_model=RecordSearchResponse)
def api_record_search(
    camera: str = Query(...),
    date: Optional[str] = Query(None, description="YYYY-MM-DD -> 00:00:00–23:59:59"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    maxResults: int = Query(40, ge=1, le=400),
    position: int = Query(0, ge=0),
    searchID: Optional[str] = Query(None),
    includeToken: bool = Query(False),
):
    pb.cleanup_orphans()

    if camera not in CAMERAS:
        raise HTTPException(status_code=404, detail="Camera not found")

    cam = pb.get_record_cam(camera)

    if date and (not start and not end):
        start = f"{date}T00:00:00"
        end = f"{date}T23:59:59"
    if not start or not end:
        raise HTTPException(status_code=400, detail="Provide either date=YYYY-MM-DD or start+end")

    start = pb.normalize_time(start, cam)
    end = pb.normalize_time(end, cam)

    track = pb.get_track_id(camera, "main", source="record")
    sid = searchID or str(uuid.uuid4())

    pos_tag = cam.get("search_result_position_tag") or "searchResultPostion"
    search_xmlns = cam.get("search_xmlns")
    xmlns_attr = f' xmlns="{search_xmlns}"' if search_xmlns else ""

    xml_body = f"""
<CMSearchDescription{xmlns_attr}>
  <searchID>{sid}</searchID>
  <trackIDList>
    <trackID>{track}</trackID>
  </trackIDList>
  <timeSpanList>
    <timeSpan>
      <startTime>{start}</startTime>
      <endTime>{end}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>{maxResults}</maxResults>
  <{pos_tag}>{position}</{pos_tag}>
  <metadataList>
    <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
  </metadataList>
</CMSearchDescription>
""".strip()

    try:
        if cam.get("dump_search_log", True):
            dump_search_request(camera, sid, xml_body)
    except Exception as e:
        logger.warning(f"search request dump failed: {e}")

    xml_text = isapi_request(
        cam,
        "POST",
        "/ISAPI/ContentMgmt/search",
        xml_body,
        timeout=int(cam.get("timeout", 10)),
    )

    try:
        if cam.get("dump_search_log", True):
            dump_search_log(camera=camera, search_id=sid, request_xml=xml_body, response_text=xml_text)
    except Exception as e:
        logger.warning(f"search_log dump failed: {e}")

    try:
        root_xml = strip_ns(ET.fromstring(xml_text))
    except Exception:
        raise HTTPException(status_code=502, detail=f"ISAPI returned non-XML: {xml_text[:300]}")

    status = "OK"
    status_node = root_xml.find(".//responseStatusStrg")
    if status_node is not None and status_node.text:
        status = status_node.text.strip().upper()

    num_matches = None
    nm = root_xml.find(".//numOfMatches")
    if nm is not None and nm.text:
        try:
            num_matches = int(nm.text.strip())
        except Exception:
            num_matches = None

    matches: List[Dict[str, Any]] = []
    for item in root_xml.findall(".//searchMatchItem"):
        st = _find_text_any(item, [".//startTime"])
        et = _find_text_any(item, [".//endTime", ".//endTIme"])
        if not st or not et:
            continue

        entry: Dict[str, Any] = {"startTime": st, "endTime": et}

        sz = _find_text_any(item, [".//size", ".//Size"])
        if sz:
            entry["size"] = sz
        rt = _find_text_any(item, [".//recordType", ".//RecordType"])
        if rt:
            entry["type"] = rt

        pb_node = _find_text_any(item, [".//playbackURI"])
        playback_uri = html.unescape(pb_node) if pb_node else None

        jobid = pb.compute_jobid(camera, date, st, et, cam)
        entry["jobid"] = jobid

        if playback_uri:
            pb.save_playback_uri(jobid, playback_uri)

        if includeToken:
            entry["token"] = jobid

        matches.append(entry)

    next_pos = None
    if status == "MORE" or (len(matches) >= maxResults):
        next_pos = position + maxResults

    if LOG_ENABLED and DEBUG_LOGGING:
        logger.debug(
            f"RecordSearch camera={camera} status={status} pos={position} "
            f"max={maxResults} matches={len(matches)} next={next_pos}"
        )

    return RecordSearchResponse(
        camera=camera,
        searchID=sid,
        startTime=start,
        endTime=end,
        maxResults=maxResults,
        searchResultPosition=position,
        status=status,
        numOfMatches=num_matches,
        matches=matches,
        nextPosition=next_pos,
    )


@router.get("/days", response_model=DailyDistributionResponse)
def api_record_days(
    camera: str = Query(...),
    year: int = Query(..., ge=1970, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    pb.cleanup_orphans()

    if camera not in CAMERAS:
        raise HTTPException(status_code=404, detail="Camera not found")

    cam = pb.get_record_cam(camera)
    record_channel_id = pb.get_record_channel_id(camera)

    method = (cam.get("daily_distribution_method") or "PUT").upper()
    xmlns = cam.get("daily_distribution_xmlns") or "http://www.isapi.org/ver20/XMLSchema"

    xml_body = f"""
<trackDailyParam version="2.0" xmlns="{xmlns}">
  <year>{year}</year>
  <monthOfYear>{month}</monthOfYear>
</trackDailyParam>
""".strip()

    path = f"/ISAPI/ContentMgmt/record/tracks/{record_channel_id}/dailyDistribution"
    xml_text = isapi_request(cam, method, path, xml_body, timeout=int(cam.get("timeout", 10)))

    try:
        root_xml = strip_ns(ET.fromstring(xml_text))
    except Exception:
        raise HTTPException(status_code=502, detail=f"ISAPI returned non-XML: {xml_text[:300]}")

    days: List[Dict[str, Any]] = []
    for day in root_xml.findall(".//day"):
        dom = day.find(".//dayOfMonth")
        rec = day.find(".//record")
        rtype = day.find(".//recordType")
        if dom is None or not (dom.text or "").strip():
            continue
        d: Dict[str, Any] = {"dayOfMonth": int(dom.text.strip())}
        if rec is not None and rec.text:
            d["record"] = rec.text.strip().lower() == "true"
        if rtype is not None and rtype.text:
            d["recordType"] = rtype.text.strip()
        days.append(d)

    return DailyDistributionResponse(
        camera=camera,
        year=year,
        month=month,
        recordChannelId=str(record_channel_id),
        days=days,
    )