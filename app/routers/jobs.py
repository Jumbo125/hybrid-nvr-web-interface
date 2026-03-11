# ---------------------
#  Autor: Andreas Rottmann
#  Lizenz: GNU AGPL-3.0
# --------------------


from __future__ import annotations

import platform
import subprocess
import time

import psutil
from fastapi import APIRouter, HTTPException
from app.services import playback as pb

router = APIRouter(tags=["jobs"])


def _is_windows() -> bool:
    return platform.system() == "Windows"


def _get_cpu_temp_c() -> float | None:
    """
    Liest CPU-Temperatur auf Linux/Raspberry Pi.
    Unter Windows absichtlich None.
    """
    if _is_windows():
        return None

    # Standard Linux thermal zone
    thermal_path = "/sys/class/thermal/thermal_zone0/temp"
    try:
        with open(thermal_path, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        return round(int(raw) / 1000.0, 1)
    except Exception:
        pass

    # Fallback für Raspberry Pi mit vcgencmd
    try:
        r = subprocess.run(
            ["vcgencmd", "measure_temp"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if r.returncode == 0 and r.stdout:
            # Beispiel: temp=42.8'C
            out = r.stdout.strip()
            val = out.replace("temp=", "").replace("'C", "")
            return round(float(val), 1)
    except Exception:
        pass

    return None


def _browser_names_for_current_os() -> list[str]:
    """
    Prozessnamen je OS.
    """
    if _is_windows():
        return ["chrome.exe", "chromium.exe"]
    return ["chromium", "chromium-browser"]


@router.get("/api/jobs")
def api_jobs():
    return pb.list_jobs_info()


@router.get("/api/system/stats")
def api_system_stats():
    """
    Gibt aktuelle Systemwerte als Objekt zurück:
    - cpu_percent
    - ram_percent
    - temp_c

    Unter Windows absichtlich alles None.
    """
    try:
        if _is_windows():
            return {
                "cpu_percent": None,
                "ram_percent": None,
                "temp_c": None,
            }

        cpu_percent = psutil.cpu_percent(interval=0.2)
        ram = psutil.virtual_memory()
        temp_c = _get_cpu_temp_c()

        return {
            "cpu_percent": round(cpu_percent, 1),
            "ram_percent": round(ram.percent, 1),
            "temp_c": temp_c,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/browser/close")
def api_browser_close():
    """
    Beendet Browser-Prozesse je nach Betriebssystem.
    Linux: chromium / chromium-browser
    Windows: chrome.exe / chromium.exe

    Achtung: funktioniert nur für Prozesse, die der Service-User beenden darf.
    """
    names = {n.lower() for n in _browser_names_for_current_os()}

    try:
        found = []
        denied_pids = []

        for proc in psutil.process_iter(["pid", "name"]):
            try:
                pname = (proc.info.get("name") or "").strip().lower()
                if pname in names:
                    found.append(proc)
            except (psutil.NoSuchProcess, psutil.ZombieProcess):
                continue
            except psutil.AccessDenied:
                pid = getattr(proc, "pid", None)
                if pid is not None:
                    denied_pids.append(pid)

        found_pids = sorted({p.pid for p in found if p.is_running()})

        # freundlich beenden
        sigterm_pids = []
        for proc in found:
            try:
                proc.terminate()
                sigterm_pids.append(proc.pid)
            except (psutil.NoSuchProcess, psutil.ZombieProcess):
                pass
            except psutil.AccessDenied:
                denied_pids.append(proc.pid)

        # kurz warten
        gone, alive = psutil.wait_procs(found, timeout=1.0)

        # was noch lebt -> kill
        sigkill_pids = []
        for proc in alive:
            try:
                proc.kill()
                sigkill_pids.append(proc.pid)
            except (psutil.NoSuchProcess, psutil.ZombieProcess):
                pass
            except psutil.AccessDenied:
                denied_pids.append(proc.pid)

        # optional noch kurzer Moment
        time.sleep(0.2)

        denied_pids = sorted(set(denied_pids))

        return {
            "ok": True,
            "os": platform.system(),
            "browser_names": sorted(names),
            "found_pids": found_pids,
            "sigterm_pids": sorted(set(sigterm_pids)),
            "sigkill_pids": sorted(set(sigkill_pids)),
            "denied_pids": denied_pids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))