# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------


from __future__ import annotations

"""
main.py
=======
FastAPI App Entry.

ARCHITEKTUR (für schnelle Erweiterungen)
----------------------------------------
1) Router-Schicht (app/routers/*.py)
   - FastAPI Endpunkte + Pydantic Models + Response Mapping
   - möglichst wenig Business-Logik

2) Service-Schicht (app/services/*.py)
   - ISAPI: services/isapi.py
   - Playback Download + Thumbnail: services/playback.py

3) Logging + Masking (app/logging_setup.py)
   - verhindert, dass Tokens/Passwörter im Log oder Frontend landen

NEUER PLAYBACK-WORKFLOW
-----------------------
- Kein HLS mehr
- Kein /hls Mount mehr
- Kein m3u8 / ts mehr
- Playback-Dateien liegen unter:
    static/clips/
    static/thumbs/
- Interne Playback-Metadaten/Logs liegen unter:
    static/playback_meta/
    static/playback_logs/
  und werden NICHT öffentlich ausgeliefert

STARTEN
-------
Aus Projekt-Root (wo cameras.py + static/ liegt):
  uvicorn app.main:app --host 0.0.0.0 --port <SERVER_PORT> --reload
"""

import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from cameras import SERVER_HOST, SERVER_PORT, SERVER_RELOAD, LOG_ENABLED, DEBUG_LOGGING
from app.logging_setup import setup_logging, get_logger, mask_text, safe_body_preview
from app.routers.records import router as records_router
from app.routers.playback import router as playback_router
from app.routers.jobs import router as jobs_router
from app.routers.config import router as config_router
from app.routers.lang import router as lang_router
from app.services import playback as pb
from app.routers.slideshow import router as slideshow_router



setup_logging()
logger = get_logger()

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = (BASE_DIR / "static").resolve()
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Legacy-Funktionsname im Service bleibt erhalten,
# nutzt aber nun STATIC_DIR als Basis für:
#   static/clips
#   static/thumbs
#   static/playback_meta
#   static/playback_logs
pb.init_hls_root(STATIC_DIR)

app = FastAPI()


@app.on_event("startup")
def on_startup():
    try:
        pb.cleanup_old_files(force=True)
    except Exception as e:
        logger.warning(f"startup cleanup failed: {e}")


# --- Static: /static ---
class SafeStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        norm = (path or "").replace("\\", "/").lstrip("/")

        # Interne Dateien/Ordner niemals direkt ausliefern
        blocked_prefixes = (
            "playback_meta/",
            "playback_logs/",
        )
        blocked_suffixes = (
            ".txt",
            ".log",
            ".part",
            ".bin",
            ".tmp.mp4",
            ".tmp.jpg",
        )

        if norm.startswith(blocked_prefixes) or norm.endswith(blocked_suffixes):
            return Response(status_code=404)

        resp = await super().get_response(norm, scope)

        if resp.status_code == 200:
            # Thumbnails eher nicht cachen, damit neue Bilder sofort sichtbar sind
            if norm.startswith("thumbs/"):
                resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
                resp.headers["Pragma"] = "no-cache"
                resp.headers["Expires"] = "0"

        return resp


app.mount("/static", SafeStaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Root redirect ---
@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


# --- Middleware: Request Logging ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if LOG_ENABLED:
        client = request.client.host if request.client else "-"
        logger.info(f"{client} {request.method} {request.url.path}?{mask_text(request.url.query)} -> IN")

    start_ts = time.time()
    client = request.client.host if request.client else "-"
    path = request.url.path
    query = mask_text(request.url.query)

    body_preview = ""
    if DEBUG_LOGGING and request.method in ("POST", "PUT", "PATCH"):
        try:
            body_bytes = await request.body()
            body_preview = safe_body_preview(body_bytes)
        except Exception:
            body_preview = "<body read error>"

    try:
        response = await call_next(request)
        ms = int((time.time() - start_ts) * 1000)

        if body_preview:
            logger.info(
                f'{client} {request.method} {path}?{query} -> {response.status_code} ({ms}ms) body="{body_preview}"'
            )
        else:
            logger.info(f"{client} {request.method} {path}?{query} -> {response.status_code} ({ms}ms)")

        return response

    except Exception as e:
        ms = int((time.time() - start_ts) * 1000)
        logger.exception(f"{client} {request.method} {path}?{query} -> EXCEPTION ({ms}ms) err={e}")
        raise


# --- Exception Handlers ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if LOG_ENABLED:
        logger.warning(
            f"HTTPException {exc.status_code} on {request.method} {request.url.path}: {mask_text(str(exc.detail))}"
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if LOG_ENABLED:
        logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# --- Routers ---
app.include_router(records_router)
app.include_router(playback_router)
app.include_router(jobs_router)
app.include_router(config_router)
app.include_router(lang_router)
app.include_router(slideshow_router)


if __name__ == "__main__":
    if LOG_ENABLED:
        logger.info("Server starting...")
    uvicorn.run(
        "app.main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=SERVER_RELOAD,
    )