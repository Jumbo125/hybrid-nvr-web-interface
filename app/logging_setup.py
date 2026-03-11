# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------


from __future__ import annotations

"""
logging_setup.py
================
Zentrale Stelle für:
- Logging-Konfiguration (RotatingFileHandler, uvicorn logger propagate)
- Masking von sensitiven Infos (token=..., JSON "password", RTSP creds)
- Body-Preview (für Debug-Logging)

Wie erweitern?
--------------
- Neue sensible Patterns: in mask_text(...) ergänzen.
- Anderes Log-Format: Formatter in setup_logging() ändern.
"""

import os
import re
import logging
from logging.handlers import RotatingFileHandler

from cameras import (
    LOG_ENABLED, DEBUG_LOGGING,
    LOG_FILE, LOG_MAX_BYTES, LOG_BACKUP_COUNT, LOG_REQUEST_BODY_LIMIT
)

_token_re = re.compile(r"(token=)([^&\s]+)", re.IGNORECASE)
_pwd_re = re.compile(r'("password"\s*:\s*")([^"]+)(")', re.IGNORECASE)
_auth_in_url_re = re.compile(r"(rtsp://[^:/\s]+:)([^@/\s]+)(@)", re.IGNORECASE)


def mask_text(s: str) -> str:
    if not s:
        return s
    s = _token_re.sub(r"\1***", s)
    s = _pwd_re.sub(r'\1***\3', s)
    s = _auth_in_url_re.sub(r"\1***\3", s)
    return s


def safe_body_preview(b: bytes, limit: int = LOG_REQUEST_BODY_LIMIT) -> str:
    if not b:
        return ""
    try:
        txt = b[:limit].decode("utf-8", errors="replace")
    except Exception:
        txt = str(b[:limit])
    return mask_text(txt)


_logger: logging.Logger | None = None


def setup_logging() -> logging.Logger:
    """Konfiguriert Root + App Logger. Einmal beim App-Start aufrufen."""
    global _logger
    if _logger is not None:
        return _logger

    log_dir = os.path.dirname(LOG_FILE) if LOG_FILE else "logs"
    os.makedirs(log_dir, exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if DEBUG_LOGGING else logging.INFO)

    if LOG_ENABLED:
        already = False
        for h in root_logger.handlers:
            if isinstance(h, RotatingFileHandler):
                try:
                    if os.path.abspath(getattr(h, "baseFilename", "")) == os.path.abspath(LOG_FILE):
                        already = True
                except Exception:
                    pass

        if not already:
            handler = RotatingFileHandler(
                LOG_FILE,
                maxBytes=LOG_MAX_BYTES,
                backupCount=LOG_BACKUP_COUNT,
                encoding="utf-8",
            )
            fmt = logging.Formatter(
                "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
            handler.setFormatter(fmt)
            root_logger.addHandler(handler)
    else:
        root_logger.addHandler(logging.NullHandler())

    logger = logging.getLogger("hybrid_nvr")
    logger.setLevel(logging.DEBUG if DEBUG_LOGGING else logging.INFO)

    # uvicorn loggers -> über root laufen lassen (damit FileHandler greift)
    for uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(uv_name)
        uv_logger.handlers = []
        uv_logger.propagate = True
        uv_logger.setLevel(logging.DEBUG if DEBUG_LOGGING else logging.INFO)

    _logger = logger
    return logger


def get_logger() -> logging.Logger:
    if _logger is None:
        return setup_logging()
    return _logger
