from __future__ import annotations

from typing import Any, Dict, List
import os
import glob
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["lang"])


# -----------------------------
# Helpers
# -----------------------------
def _base_dir() -> str:
    # Immer das Verzeichnis, in dem diese Datei (lang.py) liegt
    return os.path.dirname(os.path.abspath(__file__))


def _lang_dir() -> str:
    # Unterordner "lang" relativ zu lang.py
    return os.path.join(_base_dir(), "lang")


def _iter_lang_files() -> List[str]:
    pattern = os.path.join(_lang_dir(), "lang_*.json")
    return sorted(glob.glob(pattern))


def _code_from_filename(path: str) -> str:
    fn = os.path.basename(path)  # z. B. lang_de.json
    if not (fn.startswith("lang_") and fn.endswith(".json")):
        return ""
    return fn[len("lang_") : -len(".json")].strip()


def _read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(path, "r", encoding="latin-1") as f:
            return f.read()


def _flatten_json(data: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    for k, v in data.items():
        key = f"{prefix}.{k}" if prefix else k

        if isinstance(v, dict):
            out.update(_flatten_json(v, key))
        else:
            out[key] = v

    return out


def _json_to_flat_object(path: str) -> Dict[str, Any]:
    """
    Ergebnis ist ein flaches dict:
      - top-level keys -> direkt
      - "lang" object -> ohne Prefix gemerged
      - andere verschachtelte Objekte -> "section.key"

    Beispiel:
    {
      "title": "Hallo",
      "lang": {
        "ok": "OK"
      },
      "menu": {
        "home": "Start"
      }
    }

    -> {
      "title": "Hallo",
      "ok": "OK",
      "menu.home": "Start"
    }
    """
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Language file not found: {path}")

    text = _read_text(path)
    if not text.strip():
        return {}

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"JSON parse error in {os.path.basename(path)}: {e}",
        )

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=500,
            detail=f"JSON root must be an object in {os.path.basename(path)}",
        )

    out: Dict[str, Any] = {}

    for k, v in data.items():
        if isinstance(v, dict):
            if k.lower() == "lang":
                out.update(_flatten_json(v))
            else:
                out.update(_flatten_json(v, k))
        else:
            out[k] = v

    return out


def _list_lang_codes() -> List[str]:
    codes: List[str] = []

    for path in _iter_lang_files():
        code = _code_from_filename(path)
        if code:
            codes.append(code)

    # de-dupe + stable sort
    return sorted(dict.fromkeys(codes))


# -----------------------------
# Endpoints
# -----------------------------
@router.get("/lang")
async def api_lang_all():
    """
    GET /api/lang
    -> { "lang": { "en": {...}, "de": {...}, ... } }
    """
    files = _iter_lang_files()
    if not files:
        raise HTTPException(status_code=404, detail=f"No language files found in: {_lang_dir()}")

    lang_obj: Dict[str, Dict[str, Any]] = {}

    for path in files:
        code = _code_from_filename(path)
        if not code:
            continue
        lang_obj[code] = _json_to_flat_object(path)

    if not lang_obj:
        raise HTTPException(status_code=404, detail=f"No valid language files found in: {_lang_dir()}")

    return JSONResponse({"lang": lang_obj})


@router.get("/lang/available")
async def api_lang_available():
    """
    GET /api/lang/available
    -> { "available": ["de", "en"] }
    """
    codes = _list_lang_codes()
    if not codes:
        raise HTTPException(status_code=404, detail=f"No language files found in: {_lang_dir()}")
    return JSONResponse({"available": codes})