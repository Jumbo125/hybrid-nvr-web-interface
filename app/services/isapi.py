from __future__ import annotations

"""
services/isapi.py
=================
ISAPI Client (Hikvision/NVR).

Enthält:
- auth_for(cam): Digest/Basic
- isapi_url(cam, path): URL builder
- isapi_request(...): request + Fehler-Mapping + Logging
- strip_ns(root): XML Namespace entfernen (einfacheres .find)

Wie erweitern?
--------------
- Neue ISAPI Endpunkte: im Router xml_body bauen und isapi_request(...) aufrufen.
"""

import xml.etree.ElementTree as ET
from typing import Any, Dict

import requests
from fastapi import HTTPException
from requests.auth import HTTPDigestAuth, HTTPBasicAuth

from app.logging_setup import get_logger, mask_text
from cameras import LOG_ENABLED, DEBUG_LOGGING

logger = get_logger()


def strip_ns(root: ET.Element) -> ET.Element:
    for el in root.iter():
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def auth_for(cam: Dict[str, Any]):
    mode = (cam.get("auth") or "digest").lower()
    if mode == "basic":
        return HTTPBasicAuth(cam["username"], cam["password"])
    return HTTPDigestAuth(cam["username"], cam["password"])


def isapi_url(cam: Dict[str, Any], path: str) -> str:
    scheme = cam.get("scheme", "http")
    port = cam.get("port")
    host = cam["ip"]
    if port:
        return f"{scheme}://{host}:{port}{path}"
    return f"{scheme}://{host}{path}"


def isapi_request(cam: Dict[str, Any], method: str, path: str, xml_body: str, timeout: int = 10) -> str:
    url = isapi_url(cam, path)
    m = (method or "POST").upper()

    if LOG_ENABLED and DEBUG_LOGGING:
        logger.debug(f"ISAPI {m} {url} timeout={timeout}s body_len={len(xml_body)}")

    try:
        r = requests.request(
            m,
            url,
            data=xml_body.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
            auth=auth_for(cam),
            timeout=timeout,
        )
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="NVR timeout (ISAPI)")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail="NVR offline/connection error (ISAPI)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ISAPI request error: {e}")

    if r.status_code in (401, 403):
        raise HTTPException(status_code=r.status_code, detail="ISAPI auth failed (401/403)")
    if r.status_code != 200:
        if LOG_ENABLED:
            logger.error(f"ISAPI error {r.status_code} url={url} body={mask_text(r.text[:500])}")
        raise HTTPException(status_code=502, detail=f"ISAPI error {r.status_code}: {r.text[:500]}")

    return r.text
