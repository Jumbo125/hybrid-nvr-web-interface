# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------

from __future__ import annotations

from typing import Any, Dict
import json
import os
import tempfile
import threading
import platform

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse

import cameras
from app.routers.go2rtc_sync import sync_go2rtc_from_settings

router = APIRouter(prefix="/api", tags=["config"])
_lock = threading.Lock()


# -----------------------------
# Public: GET /api/config
# -----------------------------
def _sanitize(obj: Any) -> Any:
    """
    Entfernt username/password rekursiv und setzt *_set Flags,
    damit UI "gesetzt" anzeigen kann ohne Secrets zu sehen.
    """
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if lk == "username":
                out["username_set"] = bool(v)
                continue
            if lk == "password":
                out["password_set"] = bool(v)
                continue
            out[k] = _sanitize(v)
        return out

    if isinstance(obj, list):
        return [_sanitize(x) for x in obj]

    return obj


@router.get("/config")
def api_config():
    settings_path = (
        getattr(cameras, "SETTINGS_PATH", None)
        or os.path.join(getattr(cameras, "BASE_DIR", "."), "settings.json")
    )

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        raw = getattr(cameras, "SETTINGS_RAW", None) or getattr(cameras, "settings", {}) or {}

    payload = _sanitize(raw)
    payload["cameras_resolved"] = _sanitize(getattr(cameras, "CAMERAS", {}))
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


# -----------------------------
# Atomic writes
# -----------------------------
def _atomic_write_json(path: str, data: Any) -> None:
    d = os.path.dirname(path)  or "."
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="settings_", suffix=".json", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass


# -----------------------------
# Deep merge for non-camera parts
# -----------------------------
def _deep_merge(dst: dict, src: dict) -> dict:
    """
    Rekursives Merge:
    - dict -> merge keys
    - list/scalar -> replace
    """
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst


# -----------------------------
# Cameras: replace list but preserve creds + keep unknown fields
# -----------------------------
def _replace_cameras_preserve_creds(old_settings: dict, new_settings: dict, patch: dict) -> None:
    """
    cameras wird ersetzt (IDs/Liste = Request ist Wahrheit),
    ABER pro Kamera:
      - starte mit alter Kamera-Konfig (damit unbekannte Felder erhalten bleiben)
      - übernehme neue Felder aus dem Patch
      - username/password nur überschreiben, wenn im Patch non-empty gesetzt
        ("" oder fehlend => alte Werte bleiben)
    """
    if "cameras" not in patch:
        return

    new_cams = patch.get("cameras")
    if new_cams is None:
        new_settings["cameras"] = {}
        return
    if not isinstance(new_cams, dict):
        raise HTTPException(status_code=400, detail="cameras must be an object")

    old_cams = old_settings.get("cameras") or {}
    if not isinstance(old_cams, dict):
        old_cams = {}

    replaced: Dict[str, dict] = {}

    for cam_id, cam_obj in new_cams.items():
        if not isinstance(cam_obj, dict):
            raise HTTPException(status_code=400, detail=f"cameras.{cam_id} must be an object")

        old = old_cams.get(cam_id)
        old = old if isinstance(old, dict) else {}

        merged = dict(old)  # alte Config übernehmen

        for k, v in cam_obj.items():
            lk = str(k).lower()

            # Flags aus /api/config niemals speichern
            if lk in ("username_set", "password_set"):
                continue

            if lk == "username":
                if str(v or "").strip():
                    merged["username"] = v
                continue

            if lk == "password":
                if str(v or "").strip():
                    merged["password"] = v
                continue

            merged[k] = v

        if not str(merged.get("name") or "").strip():
            merged["name"] = cam_id

        merged.setdefault("rtsp_port", 554)
        replaced[cam_id] = merged

    new_settings["cameras"] = replaced


def _normalize_cameras_inplace(settings_obj: dict) -> None:
    cams = settings_obj.get("cameras") or {}
    if not isinstance(cams, dict):
        return

    defaults = settings_obj.get("camera_defaults") or {}
    if not isinstance(defaults, dict):
        defaults = {}

    for cam_id, cam in cams.items():
        if not isinstance(cam, dict):
            continue

        cam.setdefault("name", cam_id)

        for dk, dv in defaults.items():
            if dv is not None:
                cam.setdefault(dk, dv)

        cam.setdefault("rtsp_port", 554)

        if "tracks" not in cam or not isinstance(cam.get("tracks"), dict):
            tracks = {}
            if "main" in cam:
                tracks["main"] = str(cam["main"])
            if "sub" in cam:
                tracks["sub"] = str(cam["sub"])
            if tracks:
                cam["tracks"] = tracks

        cam.setdefault("record_channel_id", cam.get("main") or cam.get("tracks", {}).get("main"))


# -----------------------------
# Validate ffmpeg path (ABSOLUTE ONLY)
# -----------------------------
def _validate_ffmpeg_absolute(settings_obj: dict) -> str:
    """
    ffmpeg Pfad MUSS absolut sein (settings.json).
    Kein PATH-"ffmpeg", kein relative join.
    """
    system_name = platform.system()
    ff = settings_obj.get("ffmpeg") or {}
    if not isinstance(ff, dict):
        raise HTTPException(status_code=400, detail="ffmpeg must be an object")

    v = ff.get("windows") if system_name == "Windows" else ff.get("linux")
    if not isinstance(v, str) or not v.strip():
        raise HTTPException(status_code=400, detail="ffmpeg.linux/windows missing in settings")

    p = os.path.normpath(v.strip())

    if not os.path.isabs(p):
        raise HTTPException(status_code=400, detail=f"ffmpeg path must be absolute: {p}")

    if not os.path.exists(p) or not os.path.isfile(p):
        raise HTTPException(status_code=400, detail=f"ffmpeg not found: {p}")

    return os.path.abspath(p)


def _refresh_runtime_state(new_settings: dict) -> None:
    """
    Best-effort runtime refresh:
    - SETTINGS_RAW aktualisieren
    - CAMERAS in-place ersetzen (wichtig für from cameras import CAMERAS)
    - FFMPEG_PATH best-effort aktualisieren
    """
    _normalize_cameras_inplace(new_settings)

    cameras.SETTINGS_RAW = new_settings

    cams_new = new_settings.get("cameras") or {}
    if not isinstance(cams_new, dict):
        cams_new = {}
    cameras.CAMERAS.clear()
    cameras.CAMERAS.update(cams_new)

    # ffmpeg runtime update (best-effort)
    try:
        cameras.FFMPEG_PATH = _validate_ffmpeg_absolute(new_settings)
    except Exception:
        pass


def _make_go2rtc_connection_url(old_settings: dict) -> str | None:
    go = old_settings.get("go2rtc") or {}
    if not isinstance(go, dict):
        return None

    url = str(go.get("url") or "").strip()
    if url:
        return url.rstrip("/")

    host = str(go.get("host") or "").strip()
    port = int(go.get("port", 1984))
    if host:
        return f"http://{host}:{port}"

    return f"http://127.0.0.1:{port}"


# -----------------------------
# PATCH /api/config
# -----------------------------
@router.patch("/config")
async def api_config_patch(
    request: Request,
    restart_go2rtc: bool = Query(True),
):
    patch = await request.json()
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object")

    patch.pop("cameras_resolved", None)

    settings_path = (
        getattr(cameras, "SETTINGS_PATH", None)
        or os.path.join(getattr(cameras, "BASE_DIR", "."), "settings.json")
    )

    with _lock:
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                old = json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cannot read settings.json: {e}")

        if not isinstance(old, dict):
            raise HTTPException(status_code=500, detail="settings.json invalid (root not object)")

        new_settings = json.loads(json.dumps(old))  # deep copy

        # alles außer cameras deep-merge
        patch_no_cams = dict(patch)
        patch_no_cams.pop("cameras", None)
        _deep_merge(new_settings, patch_no_cams)

        # cameras ersetzen mit preserve creds
        _replace_cameras_preserve_creds(old, new_settings, patch)

        # FFmpeg VOR ALLEM prüfen
        try:
            ffmpeg_path = _validate_ffmpeg_absolute(new_settings)
        except HTTPException as e:
            return JSONResponse(
                status_code=200,
                content={
                    "status": "warning",
                    "settings_saved": False,
                    "go2rtc_synced": False,
                    "message": f"settings.json nicht gespeichert: {e.detail}",
                },
            )

        # go2rtc sync vorbereiten
        conn_url = _make_go2rtc_connection_url(old)
        conn_settings = json.loads(json.dumps(new_settings))  # deep copy
        if conn_url:
            conn_settings.setdefault("go2rtc", {})
            if isinstance(conn_settings["go2rtc"], dict):
                conn_settings["go2rtc"]["url"] = conn_url

        # erst go2rtc synchronisieren
        try:
            sync_res = sync_go2rtc_from_settings(old, conn_settings, restart=restart_go2rtc)
        except Exception as e:
            return JSONResponse(
                status_code=200,
                content={
                    "status": "warning",
                    "settings_saved": False,
                    "go2rtc_synced": False,
                    "message": f"go2rtc sync fehlgeschlagen: {e}",
                    "ffmpeg_path": ffmpeg_path,
                },
            )

        # erst wenn go2rtc ok war -> settings.json schreiben
        try:
            _atomic_write_json(settings_path, new_settings)
        except Exception as e:
            # optionaler rollback go2rtc
            try:
                sync_go2rtc_from_settings(conn_settings, old, restart=True)
            except Exception:
                pass

            raise HTTPException(status_code=500, detail=f"Cannot write settings.json: {e}")

        # runtime state refresh
        _refresh_runtime_state(new_settings)

    return {
        "status": "ok",
        "settings_saved": True,
        "go2rtc_synced": True,
        "ffmpeg_path": ffmpeg_path,
        "go2rtc": sync_res,
    }