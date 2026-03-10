from __future__ import annotations

from typing import Any, Dict

from load_settings import load_settings


# --- Mutable container, damit "from cameras import CAMERAS" stabil bleibt ---
CAMERAS: Dict[str, Any] = {}

# --- Load einmalig beim Import ---
_loaded = load_settings(__file__)
settings = _loaded.settings

# --- Projekt-Root ---
BASE_DIR = str(_loaded.project_dir)

# --- settings.json Pfad ---
SETTINGS_PATH = str(_loaded.settings_path)

# --- Alle settings raw (für /api/config) ---
SETTINGS_RAW = settings

# --- Server ---
SERVER_HOST = settings["server"]["host"]
SERVER_PORT = settings["server"]["port"]
SERVER_RELOAD = settings["server"]["reload"]

# --- UI ---
_ui = settings.get("ui", {}) or {}
UI_HEADER = _ui.get("header", _ui.get("Header", "Hybrid NVR"))
UI_COLOR = _ui.get("color", _ui.get("Color", "#0d6efd"))

# --- Record UI/Behavior Settings ---
_rs = settings.get("record_settings", {}) or {}
RECORD_LIST_THUMBNAIL = bool(_rs.get("record_list_thumbnail", False))
RECORD_THUMBNAILS_CREATE_TIMEOUT_MS = int(
    _rs.get("record_thumbnails_create_timeout_ms", _rs.get("record_thumbnails_create_timeout", 3000))
)

# --- Playback Cleanup / Retention ---
PLAYBACK_RETENTION_DAYS = int(_rs.get("playback_retention_days", 7))
PLAYBACK_TEMP_RETENTION_HOURS = int(_rs.get("playback_temp_retention_hours", 2))
PLAYBACK_CLEANUP_INTERVAL_SECONDS = int(_rs.get("playback_cleanup_interval_seconds", 6 * 3600))

# --- Limits/TTL ---
_limits = settings.get("limits", {}) or {}
MAX_JOBS = int(_limits.get("max_jobs", 3))
JOB_TTL_SECONDS = int(_limits.get("job_ttl_seconds", 30 * 60))
RECORD_TOKEN_TTL = int(_limits.get("record_token_ttl", 10 * 60))

# --- Logging ---
_logging = settings.get("logging", {}) or {}
LOG_ENABLED = bool(_logging.get("enabled", True))
DEBUG_LOGGING = bool(_logging.get("debug", True))
LOG_FILE = _loaded.log_file
LOG_MAX_BYTES = int(_logging.get("max_bytes", 5_000_000))
LOG_BACKUP_COUNT = int(_logging.get("backup_count", 5))
LOG_REQUEST_BODY_LIMIT = int(_logging.get("request_body_limit", 2000))

# --- Camera Defaults ---
CAMERA_DEFAULTS = _loaded.camera_defaults

# --- ffmpeg (IMMER absolut, aus settings.json validiert) ---
FFMPEG_PATH = _loaded.ffmpeg_path

# --- go2rtc ---
_go2rtc = settings.get("go2rtc", {}) or {}
GO2RTC_PORT = int(_go2rtc.get("port", 1984))

# --- CAMERAS befüllen (mutiert das existierende Dict-Objekt) ---
CAMERAS.clear()
CAMERAS.update(_loaded.cameras)


def reload_settings() -> None:
    """
    Lädt settings.json neu und aktualisiert CAMERAS + SETTINGS_RAW + Scalars.
    """
    global settings
    global BASE_DIR, SETTINGS_PATH, SETTINGS_RAW
    global SERVER_HOST, SERVER_PORT, SERVER_RELOAD
    global UI_HEADER, UI_COLOR
    global RECORD_LIST_THUMBNAIL, RECORD_THUMBNAILS_CREATE_TIMEOUT_MS
    global PLAYBACK_RETENTION_DAYS, PLAYBACK_TEMP_RETENTION_HOURS, PLAYBACK_CLEANUP_INTERVAL_SECONDS
    global MAX_JOBS, JOB_TTL_SECONDS, RECORD_TOKEN_TTL
    global LOG_ENABLED, DEBUG_LOGGING, LOG_FILE, LOG_MAX_BYTES, LOG_BACKUP_COUNT, LOG_REQUEST_BODY_LIMIT
    global CAMERA_DEFAULTS, FFMPEG_PATH, GO2RTC_PORT

    loaded = load_settings(__file__)
    settings = loaded.settings

    BASE_DIR = str(loaded.project_dir)
    SETTINGS_PATH = str(loaded.settings_path)
    SETTINGS_RAW = settings

    SERVER_HOST = settings["server"]["host"]
    SERVER_PORT = settings["server"]["port"]
    SERVER_RELOAD = settings["server"]["reload"]

    _ui = settings.get("ui", {}) or {}
    UI_HEADER = _ui.get("header", _ui.get("Header", "Hybrid NVR"))
    UI_COLOR = _ui.get("color", _ui.get("Color", "#0d6efd"))

    _rs = settings.get("record_settings", {}) or {}
    RECORD_LIST_THUMBNAIL = bool(_rs.get("record_list_thumbnail", False))
    RECORD_THUMBNAILS_CREATE_TIMEOUT_MS = int(
        _rs.get("record_thumbnails_create_timeout_ms", _rs.get("record_thumbnails_create_timeout", 3000))
    )

    PLAYBACK_RETENTION_DAYS = int(_rs.get("playback_retention_days", 7))
    PLAYBACK_TEMP_RETENTION_HOURS = int(_rs.get("playback_temp_retention_hours", 2))
    PLAYBACK_CLEANUP_INTERVAL_SECONDS = int(_rs.get("playback_cleanup_interval_seconds", 6 * 3600))

    _limits = settings.get("limits", {}) or {}
    MAX_JOBS = int(_limits.get("max_jobs", 3))
    JOB_TTL_SECONDS = int(_limits.get("job_ttl_seconds", 30 * 60))
    RECORD_TOKEN_TTL = int(_limits.get("record_token_ttl", 10 * 60))

    _logging = settings.get("logging", {}) or {}
    LOG_ENABLED = bool(_logging.get("enabled", True))
    DEBUG_LOGGING = bool(_logging.get("debug", True))
    LOG_FILE = loaded.log_file
    LOG_MAX_BYTES = int(_logging.get("max_bytes", 5_000_000))
    LOG_BACKUP_COUNT = int(_logging.get("backup_count", 5))
    LOG_REQUEST_BODY_LIMIT = int(_logging.get("request_body_limit", 2000))

    CAMERA_DEFAULTS = loaded.camera_defaults
    FFMPEG_PATH = loaded.ffmpeg_path

    _go2rtc = settings.get("go2rtc", {}) or {}
    GO2RTC_PORT = int(_go2rtc.get("port", 1984))

    CAMERAS.clear()
    CAMERAS.update(loaded.cameras)