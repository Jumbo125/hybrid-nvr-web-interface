from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple
import json
import os
import platform


@dataclass(frozen=True)
class LoadedConfig:
    project_dir: Path
    settings_path: Path
    settings: Dict[str, Any]

    ffmpeg_path: str
    log_file: str

    cameras: Dict[str, Any]
    camera_defaults: Dict[str, Any]


def find_project_root(start_file: str | Path, env_key: str = "PROJECT_ROOT") -> Path:
    """
    Projekt-Root = Ordner der settings.json enthält.
    Optional: per ENV PROJECT_ROOT erzwingen.
    """
    env = os.getenv(env_key)
    if env:
        p = Path(env).expanduser().resolve()
        if not p.exists():
            raise FileNotFoundError(f"{env_key} zeigt auf einen nicht existierenden Pfad: {p}")
        if not (p / "settings.json").is_file():
            raise FileNotFoundError(f"{env_key} gesetzt, aber settings.json nicht gefunden in: {p}")
        return p

    here = Path(start_file).resolve()
    for p in [here.parent, *here.parents]:
        if (p / "settings.json").is_file():
            return p

    # fallback
    return here.parent


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("settings.json invalid: root is not an object")
    return data


def resolve_ffmpeg_path_abs_only(project_dir: Path, settings: Dict[str, Any]) -> str:
    """
    ffmpeg Pfad MUSS absolut sein (aus settings.json).
    """
    ff = settings.get("ffmpeg") or {}
    if not isinstance(ff, dict):
        raise ValueError("settings.ffmpeg must be an object")

    system_name = platform.system()
    v = ff.get("windows") if system_name == "Windows" else ff.get("linux")
    if not isinstance(v, str) or not v.strip():
        raise ValueError("ffmpeg.linux/windows missing in settings")

    p = os.path.normpath(v.strip())

    if not os.path.isabs(p):
        raise ValueError(f"ffmpeg path must be absolute (settings.json): {p}")

    # optional: auf Projektordner einschränken? (wenn du willst)
    # if not Path(p).resolve().is_relative_to(project_dir):
    #     raise ValueError(f"ffmpeg path must be inside project dir: {p}")

    if not os.path.exists(p):
        raise FileNotFoundError(f"ffmpeg not found: {p}")

    if not os.path.isfile(p):
        raise FileNotFoundError(f"ffmpeg path is not a file: {p}")

    return os.path.abspath(p)


def normalize_log_file(project_dir: Path, settings: Dict[str, Any]) -> str:
    logging_cfg = settings.get("logging", {}) or {}
    if not isinstance(logging_cfg, dict):
        logging_cfg = {}

    log_file = str(logging_cfg.get("file", "logs/server.log"))
    if not os.path.isabs(log_file):
        log_file = str(project_dir / log_file)
    return os.path.normpath(os.path.abspath(log_file))


def apply_camera_defaults_inplace(settings: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    cams = settings.get("cameras")
    if not isinstance(cams, dict):
        raise ValueError("settings.cameras must be an object")

    defaults = settings.get("camera_defaults", {}) or {}
    if not isinstance(defaults, dict):
        defaults = {}

    for key, cam in cams.items():
        if not isinstance(cam, dict):
            raise ValueError(f"Camera '{key}' muss ein Objekt/dict sein.")

        cam.setdefault("name", key)
        if not str(cam.get("name") or "").strip():
            raise ValueError(f"Camera '{key}': 'name' darf nicht leer sein.")

        for dk, dv in defaults.items():
            if dv is not None:
                cam.setdefault(dk, dv)

        cam.setdefault("rtsp_port", 554)

        if "tracks" not in cam or not isinstance(cam.get("tracks"), dict):
            tracks: Dict[str, str] = {}
            if "main" in cam:
                tracks["main"] = str(cam["main"])
            if "sub" in cam:
                tracks["sub"] = str(cam["sub"])
            if tracks:
                cam["tracks"] = tracks

        cam.setdefault("record_channel_id", cam.get("main") or cam.get("tracks", {}).get("main"))

    return cams, defaults


def load_settings(start_file: str | Path) -> LoadedConfig:
    project_dir = find_project_root(start_file)
    settings_path = project_dir / "settings.json"
    settings = _load_json(settings_path)

    ffmpeg_path = resolve_ffmpeg_path_abs_only(project_dir, settings)
    log_file = normalize_log_file(project_dir, settings)

    cams, defaults = apply_camera_defaults_inplace(settings)

    return LoadedConfig(
        project_dir=project_dir,
        settings_path=settings_path,
        settings=settings,
        ffmpeg_path=ffmpeg_path,
        log_file=log_file,
        cameras=cams,
        camera_defaults=defaults,
    )