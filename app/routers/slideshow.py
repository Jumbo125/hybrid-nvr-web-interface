# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter

router = APIRouter(prefix="/api/slideshow", tags=["slideshow"])

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = (BASE_DIR / "static").resolve()
SLIDESHOW_DIR = (STATIC_DIR / "slideshow").resolve()

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
}


@router.get("/images")
def api_slideshow_images():
    """
    Liest alle Bilddateien aus static/slideshow/
    und gibt öffentlich erreichbare URLs zurück.

    Beispiel:
    {
      "images": {
        "1": "/static/slideshow/a.jpg",
        "2": "/static/slideshow/b.png"
      },
      "count": 2
    }
    """
    images: dict[str, str] = {}

    if not SLIDESHOW_DIR.exists() or not SLIDESHOW_DIR.is_dir():
        return {
            "images": images,
            "count": 0,
            "directory": str(SLIDESHOW_DIR),
        }

    files = sorted(
        [
            p
            for p in SLIDESHOW_DIR.iterdir()
            if p.is_file()
            and not p.name.startswith(".")
            and p.suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
        ],
        key=lambda p: p.name.lower(),
    )

    for idx, file_path in enumerate(files, start=1):
        safe_name = quote(file_path.name)
        images[str(idx)] = f"/static/slideshow/{safe_name}"

    return {
        "images": images,
        "count": len(images),
    }