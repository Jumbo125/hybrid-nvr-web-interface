from __future__ import annotations

"""app.services.playback

Neuer Playback-Workflow:
- Search liefert playbackURI und persistiert sie per jobid/hash
- /start lädt die Aufnahme direkt per ISAPI Download als Rohdatei herunter
- Danach wird die Datei per ffmpeg in echtes MP4 remuxt
- Danach wird optional genau ein Thumbnail aus der lokalen MP4 erzeugt
- Zusätzlich kann ein Thumbnail direkt aus dem Download-Stream erzeugt werden
- Kein HLS, kein m3u8, kein Status-Endpoint, keine finish/progress Dateien

WICHTIG:
- Für Playback/Search wird jetzt bewusst die Record-Quelle verwendet:
    record_ip
    record_rtsp_port
    record_main
    record_sub
- Fallback bleibt auf die alten Felder erhalten:
    ip
    rtsp_port
    main
    sub
"""

import hashlib
import html
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import HTTPException

import cameras
from app.logging_setup import get_logger, mask_text
from app.services.isapi import auth_for, isapi_url

logger = get_logger()

# Legacy-kompatibler Init-Name: main.py ruft aktuell init_hls_root(...) auf.
STATIC_ROOT: Optional[Path] = None
CLIPS_DIR: Optional[Path] = None
THUMBS_DIR: Optional[Path] = None
META_DIR: Optional[Path] = None
LOGS_DIR: Optional[Path] = None

PLAYBACK_URI_CACHE_TTL_S = 6 * 60 * 60
_playback_uri_cache: Dict[str, Tuple[float, str]] = {}
_playback_uri_lock = threading.Lock()

_download_locks: Dict[str, threading.Lock] = {}
_download_locks_guard = threading.Lock()

_last_cleanup_ts = 0.0
_cleanup_guard = threading.Lock()

_rtsp_cred_re = re.compile(r"(rtsp://[^:\s/]+:)([^@\s]+)(@)", re.IGNORECASE)


def init_hls_root(hls_root: str | Path) -> Path:
    """
    Legacy-kompatibel, obwohl kein HLS mehr verwendet wird.
    Wenn main.py weiter STATIC/hls übergibt, erzeugen wir daneben:
      static/clips
      static/thumbs
      static/playback_meta
      static/playback_logs
    """
    global STATIC_ROOT, CLIPS_DIR, THUMBS_DIR, META_DIR, LOGS_DIR

    base = Path(hls_root).resolve()
    static_root = base.parent if base.name.lower() == "hls" else base

    STATIC_ROOT = static_root
    CLIPS_DIR = (static_root / "clips").resolve()
    THUMBS_DIR = (static_root / "thumbs").resolve()
    META_DIR = (static_root / "playback_meta").resolve()
    LOGS_DIR = (static_root / "playback_logs").resolve()

    for p in (STATIC_ROOT, CLIPS_DIR, THUMBS_DIR, META_DIR, LOGS_DIR):
        p.mkdir(parents=True, exist_ok=True)

    return static_root


def _require_init() -> None:
    if not all([STATIC_ROOT, CLIPS_DIR, THUMBS_DIR, META_DIR, LOGS_DIR]):
        raise HTTPException(status_code=500, detail="Playback root not initialized")


def _sanitize_for_log(text: str) -> str:
    return _rtsp_cred_re.sub(r"\1***\3", text or "")


def _clip_path(jobid: str) -> Path:
    _require_init()
    assert CLIPS_DIR is not None
    return CLIPS_DIR / f"{jobid}.mp4"


def _raw_clip_path(jobid: str) -> Path:
    _require_init()
    assert CLIPS_DIR is not None
    return CLIPS_DIR / f"{jobid}.bin"


def _thumb_path(jobid: str) -> Path:
    _require_init()
    assert THUMBS_DIR is not None
    return THUMBS_DIR / f"{jobid}.jpg"


def _log_path(jobid: str) -> Path:
    _require_init()
    assert LOGS_DIR is not None
    return LOGS_DIR / f"{jobid}.log"


def _job_source_path(jobid: str) -> Path:
    _require_init()
    assert META_DIR is not None
    return META_DIR / f"{jobid}.playback_uri.txt"


def _write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8", errors="replace")
    tmp.replace(path)


def _append_log(jobid: str, message: str) -> None:
    try:
        p = _log_path(jobid)
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
        with p.open("a", encoding="utf-8", errors="replace") as fh:
            fh.write(f"[{ts}] {message.rstrip()}\n")
    except Exception:
        pass


def cleanup_orphans() -> None:
    now = time.time()
    with _playback_uri_lock:
        expired = [k for k, (ts, _) in _playback_uri_cache.items() if (now - ts) > PLAYBACK_URI_CACHE_TTL_S]
        for k in expired:
            _playback_uri_cache.pop(k, None)


def cleanup_old_files(force: bool = False) -> Dict[str, Any]:
    global _last_cleanup_ts

    _require_init()
    now = time.time()

    with _cleanup_guard:
        interval_s = max(60, int(cameras.PLAYBACK_CLEANUP_INTERVAL_SECONDS))
        if not force and (now - _last_cleanup_ts) < interval_s:
            return {"status": "skipped", "removed": 0, "failed": 0}

        finished_max_age = max(1, int(cameras.PLAYBACK_RETENTION_DAYS)) * 86400
        temp_max_age = max(1, int(cameras.PLAYBACK_TEMP_RETENTION_HOURS)) * 3600

        removed = 0
        failed = 0

        targets = []

        if CLIPS_DIR is not None:
            for pat in ("*.mp4",):
                targets.extend((p, finished_max_age) for p in CLIPS_DIR.glob(pat))
            for pat in ("*.bin", "*.part", "*.tmp.mp4"):
                targets.extend((p, temp_max_age) for p in CLIPS_DIR.glob(pat))

        if THUMBS_DIR is not None:
            for pat in ("*.jpg",):
                targets.extend((p, finished_max_age) for p in THUMBS_DIR.glob(pat))
            for pat in ("*.tmp.jpg",):
                targets.extend((p, temp_max_age) for p in THUMBS_DIR.glob(pat))

        if META_DIR is not None:
            for p in META_DIR.glob("*.txt"):
                targets.append((p, finished_max_age))

        if LOGS_DIR is not None:
            for p in LOGS_DIR.glob("*.log"):
                targets.append((p, finished_max_age))

        for path, max_age in targets:
            try:
                if not path.exists():
                    continue
                age = now - path.stat().st_mtime
                if age < max_age:
                    continue
                path.unlink()
                removed += 1
            except Exception:
                failed += 1

        _last_cleanup_ts = now
        return {"status": "ok", "removed": removed, "failed": failed}


def cache_playback_uri(jobid: str, uri: str) -> None:
    if not jobid or not uri:
        return
    with _playback_uri_lock:
        _playback_uri_cache[jobid] = (time.time(), uri.strip())


def get_cached_playback_uri(jobid: str) -> Optional[str]:
    if not jobid:
        return None
    now = time.time()
    with _playback_uri_lock:
        item = _playback_uri_cache.get(jobid)
        if not item:
            return None
        ts, uri = item
        if (now - ts) > PLAYBACK_URI_CACHE_TTL_S:
            _playback_uri_cache.pop(jobid, None)
            return None
        return uri


def save_playback_uri(jobid: str, uri: str) -> None:
    if not jobid or not uri:
        return
    _require_init()
    uri = uri.strip()
    cache_playback_uri(jobid, uri)
    try:
        _write_text_atomic(_job_source_path(jobid), uri + "\n")
    except Exception:
        pass


def load_playback_uri(jobid: str) -> Optional[str]:
    if not jobid:
        return None
    _require_init()
    p = _job_source_path(jobid)
    if p.exists():
        try:
            txt = p.read_text(encoding="utf-8", errors="replace").strip()
            if txt:
                return txt
        except Exception:
            pass
    return get_cached_playback_uri(jobid)


# --- time helpers ----------------------------------------------------------

def parse_iso_dt(s: str) -> Optional[datetime]:
    if not s:
        return None
    t = s.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(t)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def duration_seconds(start: str, end: str) -> int:
    a = parse_iso_dt(start)
    b = parse_iso_dt(end)
    if not a or not b:
        return 0
    return max(0, int((b - a).total_seconds()))


def normalize_time(t: str, cam: Dict[str, Any]) -> str:
    t = (t or "").strip()
    if not t:
        return t
    if cam.get("force_z") and not t.endswith("Z"):
        return t + "Z"
    return t


def format_rtsp_time(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return s

    suffix = ""
    if s[-1:] in ("Z", "z"):
        suffix = "Z"
        s = s[:-1]

    if re.match(r"^\d{8}[Tt]\d{6}(\.\d+)?$", s):
        return s.replace("t", "T") + suffix

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?$", s)
    if m:
        y, mo, d, hh, mm, ss, frac = m.groups()
        return f"{y}{mo}{d}T{hh}{mm}{ss}{frac or ''}{suffix}"

    cleaned = re.sub(r"[^0-9Tt\.]", "", s).replace("t", "T")
    return cleaned + suffix


def compute_jobid(camera: str, date: Optional[str], start: str, end: str, cam: Dict[str, Any]) -> str:
    start_n = normalize_time(start, cam)
    end_n = normalize_time(end, cam)
    date_n = (date or "").strip()
    if not date_n:
        dt = parse_iso_dt(start_n)
        if dt:
            date_n = dt.date().isoformat()

    key = f"{camera}|{date_n}|{start_n}|{end_n}".encode("utf-8")
    return hashlib.blake2b(key, digest_size=16).hexdigest()


# --- camera helpers --------------------------------------------------------

def _to_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def _extract_track_id(value: Any) -> str:
    s = str(value or "").strip()
    if not s:
        return ""
    m = re.search(r"(\d+)$", s)
    return m.group(1) if m else s


def get_live_cam(camera_key: str) -> Dict[str, Any]:
    if camera_key not in cameras.CAMERAS:
        raise HTTPException(status_code=404, detail="Camera not found")

    src = dict(cameras.CAMERAS[camera_key])
    out = dict(src)

    out["ip"] = str(src.get("live_ip") or src.get("ip") or "").strip()
    out["rtsp_port"] = _to_int(src.get("live_rtsp_port", src.get("rtsp_port", 554)), 554)
    out["main"] = str(src.get("live_main") or src.get("main") or "").strip()
    out["sub"] = str(src.get("live_sub") or src.get("sub") or "").strip()

    return out


def get_record_cam(camera_key: str) -> Dict[str, Any]:
    if camera_key not in cameras.CAMERAS:
        raise HTTPException(status_code=404, detail="Camera not found")

    src = dict(cameras.CAMERAS[camera_key])
    out = dict(src)

    out["ip"] = str(src.get("record_ip") or src.get("ip") or "").strip()
    out["rtsp_port"] = _to_int(src.get("record_rtsp_port", src.get("rtsp_port", 554)), 554)
    out["main"] = str(src.get("record_main") or src.get("main") or "").strip()
    out["sub"] = str(src.get("record_sub") or src.get("sub") or "").strip()

    out["tracks"] = {
        "main": out["main"],
        "sub": out["sub"],
    }

    if not out.get("record_channel_id"):
        out["record_channel_id"] = _extract_track_id(out.get("main"))

    return out


def get_track_id(camera_key: str, stream: str = "main", source: str = "record") -> str:
    if source == "record":
        cam = get_record_cam(camera_key)

        if stream == "sub":
            track = cam.get("sub")
        else:
            track = cam.get("main")

        track_id = str(track or "").strip()
        if not track_id:
            raise HTTPException(status_code=500, detail=f"Record track mapping missing for camera '{camera_key}'")
        return track_id

    cam = get_live_cam(camera_key)

    tracks = cam.get("tracks")
    if isinstance(tracks, dict) and stream in tracks and tracks[stream]:
        return str(tracks[stream]).strip()

    if stream == "sub":
        track = cam.get("sub")
    else:
        track = cam.get("main")

    track_id = str(track or "").strip()
    if not track_id:
        raise HTTPException(status_code=500, detail=f"Live track mapping missing for camera '{camera_key}'")

    return track_id


def get_record_channel_id(camera_key: str) -> str:
    cam = get_record_cam(camera_key)

    explicit = str(cam.get("record_channel_id") or "").strip()
    if explicit:
        return explicit

    track_id = _extract_track_id(cam.get("main"))
    if track_id:
        return track_id

    raise HTTPException(status_code=500, detail=f"Record channel mapping missing for camera '{camera_key}'")


def build_playback_rtsp(cam: Dict[str, Any], track: str, start: str, end: str) -> str:
    rtsp_port = cam.get("rtsp_port", 554)
    host = cam["ip"]

    st = format_rtsp_time(start)
    et = format_rtsp_time(end)

    prefix = "/ISAPI" if cam.get("rtsp_playback_isapi") else ""
    base = f"rtsp://{host}:{rtsp_port}{prefix}/Streaming/tracks/{track}/"
    return f"{base}?starttime={st}&endtime={et}"


# --- internal helpers ------------------------------------------------------

def _download_lock(jobid: str) -> threading.Lock:
    with _download_locks_guard:
        lock = _download_locks.get(jobid)
        if lock is None:
            lock = threading.Lock()
            _download_locks[jobid] = lock
        return lock


def _video_url(jobid: str) -> str:
    return f"/static/clips/{jobid}.mp4"


def _thumbnail_url(jobid: str) -> str:
    return f"/static/thumbs/{jobid}.jpg"


def _remaining_seconds(deadline: Optional[float], floor: float = 0.2) -> float:
    if deadline is None:
        return 3600.0
    remain = deadline - time.monotonic()
    if remain <= 0:
        raise HTTPException(status_code=504, detail="Playback preparation timeout")
    return max(floor, remain)


def _ensure_camera(camera: str) -> Dict[str, Any]:
    if not camera:
        raise HTTPException(status_code=400, detail="camera is required")

    cam = get_record_cam(camera)

    for k in ("ip", "username", "password"):
        if k not in cam or cam.get(k) in (None, ""):
            raise HTTPException(status_code=500, detail=f"Camera config missing key: {k}")

    return cam


def _resolve_jobid_and_cam(
    *,
    jobid: Optional[str],
    camera: Optional[str],
    date: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> Tuple[str, Optional[Dict[str, Any]], Optional[str], Optional[str], Optional[str]]:
    if jobid:
        if camera and camera in cameras.CAMERAS and start and end:
            cam = get_record_cam(camera)
            return jobid, cam, date, normalize_time(start, cam), normalize_time(end, cam)
        return jobid, None, date, start, end

    if not camera or not start or not end:
        raise HTTPException(status_code=400, detail="Provide jobid or camera + start + end")

    cam = _ensure_camera(camera)
    start_n = normalize_time(start, cam)
    end_n = normalize_time(end, cam)
    return compute_jobid(camera, date, start_n, end_n, cam), cam, date, start_n, end_n


def _download_clip_from_nvr(
    *,
    jobid: str,
    cam: Dict[str, Any],
    playback_uri: str,
    out_file: Path,
    deadline: Optional[float],
) -> None:
    xml_body = (
        '<downloadRequest xmlns="http://www.isapi.org/ver20/XMLSchema">'
        f"<playbackURI>{html.escape(playback_uri, quote=False)}</playbackURI>"
        "</downloadRequest>"
    )

    url = isapi_url(cam, "/ISAPI/ContentMgmt/download")
    tmp_file = out_file.with_suffix(out_file.suffix + ".part")

    _append_log(jobid, f"download start url={url}")

    if tmp_file.exists():
        try:
            tmp_file.unlink()
        except Exception:
            pass

    try:
        with requests.post(
            url,
            data=xml_body.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
            auth=auth_for(cam),
            timeout=(5, 30),
            stream=True,
        ) as resp:
            if resp.status_code in (401, 403):
                raise HTTPException(status_code=resp.status_code, detail="ISAPI auth failed (401/403)")
            if resp.status_code != 200:
                text = resp.text[:500] if resp.text else ""
                raise HTTPException(status_code=502, detail=f"ISAPI download error {resp.status_code}: {text}")

            with tmp_file.open("wb") as fh:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    _remaining_seconds(deadline)
                    if not chunk:
                        continue
                    fh.write(chunk)

        if not tmp_file.exists() or tmp_file.stat().st_size <= 0:
            raise HTTPException(status_code=502, detail="Downloaded clip is empty")

        tmp_file.replace(out_file)
        _append_log(jobid, f"download ok bytes={out_file.stat().st_size}")

    except HTTPException:
        try:
            tmp_file.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    except requests.exceptions.Timeout:
        try:
            tmp_file.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=504, detail="NVR timeout during clip download")
    except requests.exceptions.ConnectionError:
        try:
            tmp_file.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="NVR offline/connection error during clip download")
    except Exception as e:
        try:
            tmp_file.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Clip download failed: {e}")


def _remux_to_mp4(
    *,
    jobid: str,
    input_path: Path,
    output_path: Path,
    deadline: Optional[float],
) -> None:
    tmp_out = output_path.with_name(output_path.stem + ".tmp.mp4")
    if tmp_out.exists():
        try:
            tmp_out.unlink()
        except Exception:
            pass

    ff_level = "info" if cameras.DEBUG_LOGGING else "warning"
    cmd = [
        cameras.FFMPEG_PATH,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        ff_level,
        "-y",
        "-i",
        str(input_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(tmp_out),
    ]

    _append_log(jobid, f"remux start input={input_path.name} output={output_path.name}")

    try:
        timeout_s = _remaining_seconds(deadline, floor=0.5)
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="MP4 remux timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MP4 remux failed: {e}")

    if proc.returncode != 0:
        stderr = mask_text((proc.stderr or "")[:1200])
        _append_log(jobid, f"remux failed rc={proc.returncode} err={stderr}")
        try:
            tmp_out.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Downloaded file could not be remuxed to MP4")

    if not tmp_out.exists() or tmp_out.stat().st_size <= 0:
        _append_log(jobid, "remux failed empty output")
        try:
            tmp_out.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Remuxed MP4 is empty")

    tmp_out.replace(output_path)
    _append_log(jobid, f"remux ok bytes={output_path.stat().st_size}")


def _create_thumbnail_from_mp4(
    *,
    jobid: str,
    video_path: Path,
    thumb_path: Path,
    frame_from_ms: int,
    width: int,
    height: int,
    deadline: Optional[float],
) -> Optional[str]:
    if thumb_path.exists() and thumb_path.stat().st_size > 0:
        return _thumbnail_url(jobid)

    seek_s = max(0.0, float(frame_from_ms) / 1000.0)
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    )

    tmp_thumb = thumb_path.with_name(thumb_path.stem + ".tmp.jpg")
    if tmp_thumb.exists():
        try:
            tmp_thumb.unlink()
        except Exception:
            pass

    ff_level = "info" if cameras.DEBUG_LOGGING else "warning"
    cmd = [
        cameras.FFMPEG_PATH,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        ff_level,
        "-ss",
        f"{seek_s:.3f}",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        "-vf",
        vf,
        "-f",
        "image2",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "3",
        "-y",
        str(tmp_thumb),
    ]

    _append_log(jobid, f"thumbnail start offset_ms={frame_from_ms}")

    try:
        timeout_s = _remaining_seconds(deadline, floor=0.1)
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Thumbnail creation timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Thumbnail creation failed: {e}")

    if proc.returncode != 0:
        stderr = mask_text((proc.stderr or "")[:800])
        _append_log(jobid, f"thumbnail failed rc={proc.returncode} err={stderr}")
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        return None

    if not tmp_thumb.exists() or tmp_thumb.stat().st_size <= 0:
        _append_log(jobid, "thumbnail failed empty output")
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        return None

    tmp_thumb.replace(thumb_path)
    _append_log(jobid, f"thumbnail ok file={thumb_path.name}")
    return _thumbnail_url(jobid)


def _create_thumbnail_from_download_stream(
    *,
    jobid: str,
    cam: Dict[str, Any],
    playback_uri: str,
    thumb_path: Path,
    frame_from_ms: int,
    width: int,
    height: int,
    deadline: Optional[float],
) -> Optional[str]:
    xml_body = (
        '<downloadRequest xmlns="http://www.isapi.org/ver20/XMLSchema">'
        f"<playbackURI>{html.escape(playback_uri, quote=False)}</playbackURI>"
        "</downloadRequest>"
    )

    url = isapi_url(cam, "/ISAPI/ContentMgmt/download")

    seek_s = max(0.0, float(frame_from_ms) / 1000.0)
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    )

    tmp_thumb = thumb_path.with_name(thumb_path.stem + ".tmp.jpg")
    if tmp_thumb.exists():
        try:
            tmp_thumb.unlink()
        except Exception:
            pass

    ff_level = "info" if cameras.DEBUG_LOGGING else "warning"
    cmd = [
        cameras.FFMPEG_PATH,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        ff_level,
        "-i",
        "pipe:0",
        "-ss",
        f"{seek_s:.3f}",
        "-frames:v",
        "1",
        "-an",
        "-sn",
        "-dn",
        "-vf",
        vf,
        "-f",
        "image2",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "3",
        "-y",
        str(tmp_thumb),
    ]

    _append_log(jobid, f"thumbnail-stream start offset_ms={frame_from_ms} url={url}")

    proc = None
    try:
        with requests.post(
            url,
            data=xml_body.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
            auth=auth_for(cam),
            timeout=(5, 30),
            stream=True,
        ) as resp:
            if resp.status_code in (401, 403):
                raise HTTPException(status_code=resp.status_code, detail="ISAPI auth failed (401/403)")
            if resp.status_code != 200:
                text = resp.text[:500] if resp.text else ""
                raise HTTPException(status_code=502, detail=f"ISAPI download error {resp.status_code}: {text}")

            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )

            assert proc.stdin is not None

            for chunk in resp.iter_content(chunk_size=64 * 1024):
                _remaining_seconds(deadline)

                if proc.poll() is not None:
                    break

                if not chunk:
                    continue

                try:
                    proc.stdin.write(chunk)
                except BrokenPipeError:
                    break

            try:
                proc.stdin.close()
            except Exception:
                pass

            try:
                rc = proc.wait(timeout=_remaining_seconds(deadline, floor=0.2))
            except subprocess.TimeoutExpired:
                proc.kill()
                raise HTTPException(status_code=504, detail="Thumbnail creation timeout")

            stderr = ""
            try:
                if proc.stderr is not None:
                    stderr = proc.stderr.read().decode("utf-8", errors="replace")
            except Exception:
                pass

            if rc != 0:
                _append_log(jobid, f"thumbnail-stream failed rc={rc} err={mask_text(stderr[:800])}")
                try:
                    tmp_thumb.unlink(missing_ok=True)
                except Exception:
                    pass
                return None

    except HTTPException:
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    except requests.exceptions.Timeout:
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=504, detail="NVR timeout during thumbnail download")
    except requests.exceptions.ConnectionError:
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="NVR offline/connection error during thumbnail download")
    except Exception as e:
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Thumbnail streaming failed: {e}")
    finally:
        if proc is not None and proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass

    if not tmp_thumb.exists() or tmp_thumb.stat().st_size <= 0:
        _append_log(jobid, "thumbnail-stream failed empty output")
        try:
            tmp_thumb.unlink(missing_ok=True)
        except Exception:
            pass
        return None

    tmp_thumb.replace(thumb_path)
    _append_log(jobid, f"thumbnail-stream ok file={thumb_path.name}")
    return _thumbnail_url(jobid)


def create_thumbnail_from_source(
    *,
    jobid: Optional[str] = None,
    camera: Optional[str] = None,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    timeout_ms: int = 3000,
    frame_from_ms: int = 1000,
    width: int = 320,
    height: int = 180,
    force: bool = False,
) -> Dict[str, Any]:
    cleanup_orphans()
    try:
        cleanup_old_files(force=False)
    except Exception:
        pass
    _require_init()

    cam = _ensure_camera(str(camera or "")) if camera else None
    resolved_jobid, cam2, _, _, _ = _resolve_jobid_and_cam(
        jobid=jobid,
        camera=camera,
        date=date,
        start=start,
        end=end,
    )
    jobid = resolved_jobid
    cam = cam or cam2

    if cam is None:
        raise HTTPException(status_code=400, detail="camera is required when job metadata is missing")

    thumb_path = _thumb_path(jobid)

    if not force and thumb_path.exists() and thumb_path.stat().st_size > 0:
        return {
            "jobid": jobid,
            "exists": True,
            "thumbnail_url": _thumbnail_url(jobid),
            "cached": True,
            "message": "cached",
        }

    lock = _download_lock(jobid)
    with lock:
        if not force and thumb_path.exists() and thumb_path.stat().st_size > 0:
            return {
                "jobid": jobid,
                "exists": True,
                "thumbnail_url": _thumbnail_url(jobid),
                "cached": True,
                "message": "cached",
            }

        playback_uri = load_playback_uri(jobid)
        if not playback_uri:
            raise HTTPException(
                status_code=404,
                detail="playbackURI not found. Search the records again first."
            )

        deadline = time.monotonic() + max(0.2, float(timeout_ms) / 1000.0)

        thumb_url = _create_thumbnail_from_download_stream(
            jobid=jobid,
            cam=cam,
            playback_uri=playback_uri,
            thumb_path=thumb_path,
            frame_from_ms=frame_from_ms,
            width=width,
            height=height,
            deadline=deadline,
        )

        return {
            "jobid": jobid,
            "exists": bool(thumb_url),
            "thumbnail_url": thumb_url,
            "cached": False,
            "message": "created" if thumb_url else "failed",
        }


# --- public API ------------------------------------------------------------

def start_playback(
    *,
    jobid: Optional[str] = None,
    camera: Optional[str] = None,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    timeout_ms: int = 3000,
    record_list_thumbnail: bool = True,
    frame_from_ms: int = 1000,
    width: int = 320,
    height: int = 180,
) -> Dict[str, Any]:
    """
    Neuer Ablauf:
    - prüft ob MP4 schon existiert
    - wenn nein: Download per ISAPI /ContentMgmt/download als Rohdatei
    - danach Remux nach echtem MP4
    - danach optional Thumbnail aus lokaler MP4
    - Response enthält direkt video_url
    """
    cleanup_orphans()
    try:
        cleanup_old_files(force=False)
    except Exception:
        pass
    _require_init()

    cam = _ensure_camera(str(camera or "")) if camera else None
    resolved_jobid, cam2, _, start_n, end_n = _resolve_jobid_and_cam(
        jobid=jobid,
        camera=camera,
        date=date,
        start=start,
        end=end,
    )
    jobid = resolved_jobid
    cam = cam or cam2

    if cam is None:
        raise HTTPException(status_code=400, detail="camera is required when job metadata is missing")

    dur_s = duration_seconds(start_n or "", end_n or "")
    if dur_s <= 0:
        dur_s = 1

    video_path = _clip_path(jobid)
    raw_path = _raw_clip_path(jobid)
    thumb_path = _thumb_path(jobid)

    if video_path.exists() and video_path.stat().st_size > 0:
        thumb_url = None
        if record_list_thumbnail:
            try:
                thumb_url = _create_thumbnail_from_mp4(
                    jobid=jobid,
                    video_path=video_path,
                    thumb_path=thumb_path,
                    frame_from_ms=frame_from_ms,
                    width=width,
                    height=height,
                    deadline=(time.monotonic() + max(0.2, timeout_ms / 1000.0)),
                )
            except HTTPException:
                thumb_url = _thumbnail_url(jobid) if thumb_path.exists() else None

        return {
            "jobid": jobid,
            "video_url": _video_url(jobid),
            "thumbnail_url": _thumbnail_url(jobid) if thumb_path.exists() else thumb_url,
            "duration_s": dur_s,
            "cached": True,
            "message": "cached",
        }

    lock = _download_lock(jobid)
    with lock:
        if video_path.exists() and video_path.stat().st_size > 0:
            return {
                "jobid": jobid,
                "video_url": _video_url(jobid),
                "thumbnail_url": _thumbnail_url(jobid) if thumb_path.exists() else None,
                "duration_s": dur_s,
                "cached": True,
                "message": "cached",
            }

        playback_uri = load_playback_uri(jobid)
        if not playback_uri:
            raise HTTPException(
                status_code=404,
                detail="playbackURI not found. Search the records again first."
            )

        deadline = time.monotonic() + max(0.2, float(timeout_ms) / 1000.0)

        _append_log(jobid, f"prepare start camera={camera} duration_s={dur_s}")
        _append_log(jobid, f"playback_uri={_sanitize_for_log(playback_uri)}")

        try:
            try:
                raw_path.unlink(missing_ok=True)
            except Exception:
                pass

            _download_clip_from_nvr(
                jobid=jobid,
                cam=cam,
                playback_uri=playback_uri,
                out_file=raw_path,
                deadline=deadline,
            )

            _remux_to_mp4(
                jobid=jobid,
                input_path=raw_path,
                output_path=video_path,
                deadline=deadline,
            )

            try:
                raw_path.unlink(missing_ok=True)
            except Exception:
                pass

            thumb_url = None
            if record_list_thumbnail:
                thumb_url = _create_thumbnail_from_mp4(
                    jobid=jobid,
                    video_path=video_path,
                    thumb_path=thumb_path,
                    frame_from_ms=frame_from_ms,
                    width=width,
                    height=height,
                    deadline=deadline,
                )

            return {
                "jobid": jobid,
                "video_url": _video_url(jobid),
                "thumbnail_url": _thumbnail_url(jobid) if thumb_path.exists() else thumb_url,
                "duration_s": dur_s,
                "cached": False,
                "message": "downloaded",
            }

        except HTTPException as exc:
            _append_log(jobid, f"prepare error status={exc.status_code} detail={exc.detail}")
            raise
        except Exception as e:
            _append_log(jobid, f"prepare error {e}")
            raise HTTPException(status_code=500, detail=f"Playback preparation failed: {e}")


def get_frame_info(
    *,
    jobid: Optional[str] = None,
    camera: Optional[str] = None,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> Dict[str, Any]:
    cleanup_orphans()
    resolved_jobid, _, _, _, _ = _resolve_jobid_and_cam(
        jobid=jobid,
        camera=camera,
        date=date,
        start=start,
        end=end,
    )
    thumb_path = _thumb_path(resolved_jobid)
    exists = thumb_path.exists() and thumb_path.stat().st_size > 0
    return {
        "jobid": resolved_jobid,
        "exists": bool(exists),
        "thumbnail_url": _thumbnail_url(resolved_jobid) if exists else None,
    }


def stop_playback(jobid: str) -> Dict[str, Any]:
    cleanup_orphans()

    removed = []

    for p in (
        _raw_clip_path(jobid),
        _raw_clip_path(jobid).with_suffix(".bin.part"),
        _clip_path(jobid).with_name(_clip_path(jobid).stem + ".tmp.mp4"),
        _thumb_path(jobid).with_name(_thumb_path(jobid).stem + ".tmp.jpg"),
    ):
        if p.exists():
            try:
                p.unlink()
                removed.append(str(p.name))
            except Exception:
                pass

    return {"status": "noop", "jobid": jobid, "removed": removed}


def stop_all() -> Dict[str, Any]:
    cleanup_orphans()
    removed = 0

    if CLIPS_DIR is not None:
        for pat in ("*.bin", "*.part", "*.tmp.mp4"):
            for p in CLIPS_DIR.glob(pat):
                try:
                    p.unlink()
                    removed += 1
                except Exception:
                    pass

    if THUMBS_DIR is not None:
        for p in THUMBS_DIR.glob("*.tmp.jpg"):
            try:
                p.unlink()
                removed += 1
            except Exception:
                pass

    return {"status": "noop", "partial_files_removed": removed}


def list_jobs_info() -> Dict[str, Any]:
    cleanup_orphans()
    clips = []
    if CLIPS_DIR is not None:
        for p in sorted(CLIPS_DIR.glob("*.mp4")):
            clips.append(
                {
                    "jobid": p.stem,
                    "video_url": _video_url(p.stem),
                    "thumbnail_url": _thumbnail_url(p.stem) if _thumb_path(p.stem).exists() else None,
                    "size_bytes": p.stat().st_size,
                }
            )
    return {"count": len(clips), "jobs": clips}