# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------


from __future__ import annotations

from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote
import platform

import requests

# Optional (empfohlen): ruamel.yaml für bessere YAML-Ausgabe
# pip install ruamel.yaml
try:
    from ruamel.yaml import YAML  # type: ignore

    _YAML = YAML(typ="rt")
    _YAML.preserve_quotes = True
    _YAML.indent(mapping=2, sequence=4, offset=2)

    def yaml_load(text: str) -> Any:
        return _YAML.load(text) if text.strip() else {}

    def yaml_dump(data: Any) -> str:
        import io

        buf = io.StringIO()
        _YAML.dump(data, buf)
        return buf.getvalue()

except Exception:
    import yaml  # type: ignore

    def yaml_load(text: str) -> Any:
        return yaml.safe_load(text) if text.strip() else {}

    def yaml_dump(data: Any) -> str:
        return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)


_USERINFO_SAFE = "!$&'()*+,;=._~-"


def _rtsp_url(cam: dict, channel_id: str) -> str:
    ip = str(cam.get("ip") or "").strip()
    port = int(cam.get("rtsp_port", 554))

    user = str(cam.get("username") or "").strip()
    pwd = str(cam.get("password") or "").strip()

    path = f"/Streaming/Channels/{channel_id}"

    if user and pwd:
        u = quote(user, safe=_USERINFO_SAFE)
        p = quote(pwd, safe=_USERINFO_SAFE)
        return f"rtsp://{u}:{p}@{ip}:{port}{path}"
    return f"rtsp://{ip}:{port}{path}"


def build_desired_streams(settings_obj: dict) -> Dict[str, Any]:
    """
    go2rtc 'streams' mapping: key -> value
    Value setzen wir bewusst als Liste (erweiterbar).

    AKTUELL:
    - *_sub bleibt RTSP direkt
    - *_main bleibt ebenfalls direkt RTSP
      (wenn du später wieder ffmpeg: davor willst, unten anpassen)
    """
    cams = settings_obj.get("cameras") or {}
    if not isinstance(cams, dict):
        return {}

    out: Dict[str, Any] = {}
    for cam_id, cam in cams.items():
        if not isinstance(cam, dict):
            continue

        main = str(cam.get("main") or "").strip()
        sub = str(cam.get("sub") or "").strip()

        if sub:
            out[f"{cam_id}_sub"] = [_rtsp_url(cam, sub)]

        if main:
            main_url = _rtsp_url(cam, main)
            # Falls du main wieder via ffmpeg erzwingen willst:
            # out[f"{cam_id}_main"] = [f"ffmpeg:{main_url}"]
            out[f"{cam_id}_main"] = [main_url]

    return out


def _select_ffmpeg_bin(settings_obj: dict) -> str:
    """
    Erwartet:
    "ffmpeg": {
        "linux": "/pfad/zu/ffmpeg",
        "windows": "C:/pfad/ffmpeg.exe"
    }
    """
    ff = settings_obj.get("ffmpeg") or {}
    if not isinstance(ff, dict):
        return ""

    system_name = platform.system().lower()

    if system_name == "windows":
        return str(ff.get("windows") or "").strip()

    if system_name == "linux":
        return str(ff.get("linux") or "").strip()

    # Fallback
    return str(ff.get("linux") or ff.get("windows") or "").strip()


def build_desired_ffmpeg(settings_obj: dict) -> Dict[str, Any]:
    """
    go2rtc ffmpeg-Config aus settings["ffmpeg"].
    """
    ffmpeg_bin = _select_ffmpeg_bin(settings_obj)
    if not ffmpeg_bin:
        return {}

    return {"bin": ffmpeg_bin}


def _go2rtc_conn(settings_obj: dict) -> Tuple[str, str, Optional[Tuple[str, str]]]:
    """
    Liefert (base_url, api_prefix, auth)

    Unterstützt:
      go2rtc.url = "http://10.0.0.142:1984"
      go2rtc.host + go2rtc.port
      go2rtc.base_path (z.B. "/rtc")
      go2rtc.username/password (Basic Auth)
    """
    go = settings_obj.get("go2rtc") or {}
    if not isinstance(go, dict):
        go = {}

    url = str(go.get("url") or "").strip()
    if not url:
        host = str(go.get("host") or "127.0.0.1").strip()
        port = int(go.get("port", 1984))
        url = f"http://{host}:{port}"

    base_path = str(go.get("base_path") or "").strip()
    if base_path and not base_path.startswith("/"):
        base_path = "/" + base_path
    base_path = base_path.rstrip("/")

    user = str(go.get("username") or "").strip()
    pwd = str(go.get("password") or "").strip()
    auth = (user, pwd) if user and pwd else None

    return url.rstrip("/"), base_path, auth


def _req(settings_obj: dict, method: str, path: str, *, data: Optional[str] = None) -> requests.Response:
    base, prefix, auth = _go2rtc_conn(settings_obj)
    url = f"{base}{prefix}{path}"

    headers = {}
    body: Optional[bytes] = None

    if data is not None:
        headers["Content-Type"] = "application/yaml"
        body = data.encode("utf-8")

    r = requests.request(
        method=method,
        url=url,
        data=body,
        headers=headers,
        auth=auth,
        timeout=8,
    )
    return r


def get_go2rtc_config_yaml(settings_obj: dict) -> str:
    r = _req(settings_obj, "GET", "/api/config")
    if r.status_code == 404:
        return ""
    r.raise_for_status()
    return r.text


def patch_go2rtc_config(settings_obj: dict, patch_yaml: str) -> None:
    r = _req(settings_obj, "PATCH", "/api/config", data=patch_yaml)
    r.raise_for_status()


def rewrite_go2rtc_config(settings_obj: dict, full_yaml: str) -> None:
    r = _req(settings_obj, "POST", "/api/config", data=full_yaml)
    r.raise_for_status()


def restart_go2rtc(settings_obj: dict) -> None:
    r = _req(settings_obj, "POST", "/api/restart")
    r.raise_for_status()


def _dicts_equal(a: Any, b: Any) -> bool:
    return a == b


def sync_go2rtc_from_settings(
    old_settings: dict,
    new_settings: dict,
    *,
    restart: bool = True,
) -> Dict[str, Any]:
    """
    Synchronisiert aus App-Settings in die go2rtc Hauptconfig:

    - api.listen
    - streams
    - ffmpeg.bin
    """
    current_yaml = get_go2rtc_config_yaml(new_settings)
    current_obj = yaml_load(current_yaml) if current_yaml else {}
    if not isinstance(current_obj, dict):
        current_obj = {}

    desired_streams = build_desired_streams(new_settings)
    desired_ffmpeg = build_desired_ffmpeg(new_settings)

    old_ffmpeg_bin = _select_ffmpeg_bin(old_settings)
    new_ffmpeg_bin = _select_ffmpeg_bin(new_settings)

    old_cams = old_settings.get("cameras") or {}
    new_cams = new_settings.get("cameras") or {}
    old_ids = set(old_cams.keys()) if isinstance(old_cams, dict) else set()
    new_ids = set(new_cams.keys()) if isinstance(new_cams, dict) else set()
    manage_ids = old_ids.union(new_ids)

    def is_managed_key(k: str) -> bool:
        if k.endswith("_main") or k.endswith("_sub"):
            cam_id = k.rsplit("_", 1)[0]
            return cam_id in manage_ids
        return False

    cur_streams = current_obj.get("streams") or {}
    if not isinstance(cur_streams, dict):
        cur_streams = {}

    cur_api = current_obj.get("api") or {}
    if not isinstance(cur_api, dict):
        cur_api = {}

    cur_ffmpeg = current_obj.get("ffmpeg") or {}
    if not isinstance(cur_ffmpeg, dict):
        cur_ffmpeg = {}

    stale_stream_keys = [
        str(k)
        for k in cur_streams.keys()
        if is_managed_key(str(k)) and str(k) not in desired_streams
    ]

    go = new_settings.get("go2rtc") or {}
    port = int(go.get("port", 1984)) if isinstance(go, dict) else 1984
    listen_val = str(go.get("listen") or f":{port}") if isinstance(go, dict) else f":{port}"

    ffmpeg_bin_was_managed_before = bool(old_ffmpeg_bin)
    ffmpeg_bin_should_be_removed = ffmpeg_bin_was_managed_before and not new_ffmpeg_bin

    current_managed_streams = {
        str(k): v for k, v in cur_streams.items() if is_managed_key(str(k))
    }

    streams_changed = not _dicts_equal(current_managed_streams, desired_streams)
    api_changed = cur_api.get("listen") != listen_val
    ffmpeg_changed = (cur_ffmpeg.get("bin") != new_ffmpeg_bin) if new_ffmpeg_bin else False

    need_rewrite = bool(stale_stream_keys or ffmpeg_bin_should_be_removed)

    if not need_rewrite and not streams_changed and not api_changed and not ffmpeg_changed:
        return {
            "status": "ok",
            "mode": "noop",
            "restart": False,
            "stale_removed": 0,
            "ffmpeg_bin_removed": False,
        }

    changed = False
    mode = "noop"

    if need_rewrite:
        new_obj = dict(current_obj)

        api_obj = new_obj.get("api") or {}
        if not isinstance(api_obj, dict):
            api_obj = {}
        api_obj["listen"] = listen_val
        new_obj["api"] = api_obj

        merged_streams = dict(cur_streams)
        for k in list(merged_streams.keys()):
            if is_managed_key(str(k)):
                merged_streams.pop(k, None)
        for k, v in desired_streams.items():
            merged_streams[k] = v
        new_obj["streams"] = merged_streams

        ffmpeg_obj = new_obj.get("ffmpeg") or {}
        if not isinstance(ffmpeg_obj, dict):
            ffmpeg_obj = {}

        if new_ffmpeg_bin:
            ffmpeg_obj["bin"] = new_ffmpeg_bin
        elif ffmpeg_bin_should_be_removed:
            ffmpeg_obj.pop("bin", None)

        if ffmpeg_obj:
            new_obj["ffmpeg"] = ffmpeg_obj
        else:
            new_obj.pop("ffmpeg", None)

        full_yaml = yaml_dump(new_obj)
        rewrite_go2rtc_config(new_settings, full_yaml)

        changed = True
        mode = "rewrite"

    else:
        patch_obj: Dict[str, Any] = {
            "api": {"listen": listen_val},
            "streams": desired_streams,
        }

        if desired_ffmpeg:
            patch_obj["ffmpeg"] = desired_ffmpeg

        patch_yaml = yaml_dump(patch_obj)
        patch_go2rtc_config(new_settings, patch_yaml)

        changed = True
        mode = "patch"

    did_restart = False
    if restart and changed:
        restart_go2rtc(new_settings)
        did_restart = True

    return {
        "status": "ok",
        "mode": mode,
        "restart": did_restart,
        "stale_removed": len(stale_stream_keys),
        "ffmpeg_bin_removed": bool(ffmpeg_bin_should_be_removed),
    }