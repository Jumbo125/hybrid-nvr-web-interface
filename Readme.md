<p align="center">
  <img src="Logo/Logo.png" alt="Hikvision Hybrid NVR Web Interface Logo" width="180">
</p>

# hikvision-nvr-web-interface

<p align="center">
  <a href="#english">English</a> | <a href="#deutsch">Deutsch</a>
</p>

---

## English

<a id="english"></a>

Lightweight hybrid Hikvision NVR web interface for live view, record search and playback using go2rtc, FastAPI, ffmpeg, jQuery and Server-Sent Events (SSE) for playback progress.

## Support

Donate with PayPal ☕ 
If this project helps you, feel free to buy me a coffee:

[![Donate with PayPal ☕](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://www.paypal.me/andreasrottmann92)

## Preview

> The following screenshots have been anonymized.

<p align="center">
  <img src="./preview/anonymized_01_gallery.webp" width="49%" alt="Gallery view" />
  <img src="./preview/anonymized_02_settings_overlay.webp" width="49%" alt="Settings overlay" />
</p>

<p align="center">
  <img src="./preview/anonymized_03_ui_settings.webp" width="49%" alt="UI settings" />
  <img src="./preview/anonymized_04_camera_settings.webp" width="49%" alt="Camera settings" />
</p>

<p align="center">
  <img src="./preview/anonymized_05_recordings.webp" width="49%" alt="Recordings view" />
  <img src="./preview/anonymized_06_single_camera.webp" width="49%" alt="Single camera view" />
</p>

## Why jQuery?

This project was intentionally built with **jQuery**.  
I can build this type of compact, touch-oriented local web interface faster, cleaner and more reliably with jQuery than with many modern frontend frameworks.

## Thanks

Special thanks to:

- **go2rtc** for efficient, low-latency live streaming
- **ffmpeg** for the powerful media processing and remuxing features used for playback and thumbnails

## Overview

This project is a lightweight web-based camera and NVR interface for:

- live view
- record search
- playback
- live playback progress feedback via SSE
- touch-friendly local operation

It combines:

- **go2rtc** for efficient live streaming
- **FastAPI** for API, record search, playback job handling and SSE progress streaming
- **ffmpeg** for remuxing and thumbnail generation
- **Bootstrap + jQuery** for the frontend

The goal is a practical alternative to classic recorder web interfaces, especially for local monitoring systems, mini PCs and touchscreen setups.

## Core Idea

The project is built around a strict separation of responsibilities.

### Live View

Live streams are handled by **go2rtc** and go directly to the browser.

```text
Camera -> go2rtc -> Browser
```

### Record Search and Playback

Recorded video search and playback are handled separately through the Python backend.

```text
Browser -> FastAPI -> Hikvision NVR / ISAPI -> ffmpeg -> MP4 -> Browser
```

This keeps the system modular, stable and lightweight.

## Architecture

### Responsibilities

| Area | Component |
|---|---|
| Live streaming | go2rtc |
| Record search | FastAPI |
| Playback job orchestration / SSE progress | FastAPI |
| Playback download/remux | ffmpeg + FastAPI |
| UI | Bootstrap + jQuery |

### Recommended Architecture

```text
Live:
Camera -> go2rtc -> Browser

Records / Search / Playback:
Browser -> FastAPI -> NVR
```

### Not Recommended

```text
Camera -> NVR -> RTSP -> go2rtc -> Browser
```

In practice, direct camera RTSP for live view is often more stable than going through the NVR RTSP path.

## Features

- live gallery for multiple cameras
- substream in gallery, mainstream in fullscreen/modal
- record search by camera and time range
- direct playback from search results
- live playback progress via SSE
- elapsed time and timeout display during playback preparation
- thumbnail generation
- dynamic grid layout
- go2rtc sync from config
- touch-friendly browser usage
- Linux kiosk mode support
- systemd service support

## Tech Stack

- Python 3
- FastAPI
- Uvicorn
- go2rtc
- ffmpeg
- Bootstrap
- jQuery
- Server-Sent Events (SSE)
- Server-Sent Events (SSE)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/USERNAME/hikvision-nvr-web-interface.git
cd hikvision-nvr-web-interface
```

### 2. Third-party software

The repository does **not** include all third-party software and bundled assets.

Depending on your setup, components such as:

- `go2rtc`
- `ffmpeg`
- `jQuery`
- `Bootstrap`
- other external runtime files

are **not included directly in the repository** and are instead expected to come from the **release package/files** or be installed/provided locally.

Please make sure these third-party components are available before starting the project.

### 3. Install Python dependencies

```bash
./1_install.sh
```

What this script does:

- checks whether `python3` exists
- tries to install Python automatically if needed
- supports multiple package managers
- creates or repairs a local `venv`
- ensures `pip` is available inside the venv
- upgrades `pip`
- installs dependencies from `requirements.txt`

### 4. Start the server

```bash
./start.sh
```

This starts the project using the local virtual environment and launches:

```bash
python -m app.main --workers 1
```

### Important Note

`start.sh` currently mentions `install.sh`, while your installer file is named `1_install.sh`.

### 5. Open the UI

Default local URL used by the kiosk launcher:

```text
http://127.0.0.1:9500
```

## Linux Service Setup

To install the app as a systemd service, use:

```bash
./2_install_systemd.sh
```

This script:

- creates a service named `nvr-ui`
- uses the current Linux user
- sets the project folder as `WorkingDirectory`
- starts the app via `start.sh`
- enables automatic restart
- enables the service on boot
- restarts it immediately after installation

### Useful commands

```bash
sudo systemctl status nvr-ui
journalctl -u nvr-ui -f
```

## Kiosk / Touchscreen Usage

For kiosk mode, the project includes:

- `webserver_oeffnen.sh`
- `webserver-kiosk.desktop`

### `webserver_oeffnen.sh`

This helper script:

- waits until `http://127.0.0.1:9500` is reachable
- detects `chromium` or `chromium-browser`
- starts Chromium in kiosk mode

Used flags:

- `--kiosk`
- `--incognito`
- `--no-first-run`
- `--disable-infobars`
- `--check-for-update-interval=31536000`

### `.desktop` launcher

The included desktop file starts the kiosk launcher automatically.  
You will likely need to adjust the `Exec=` path for your own system.

## Project Structure

```text
.
├─ app/
│  ├─ main.py
│  ├─ routers/
│  └─ services/
├─ static/
│  ├─ index.html
│  ├─ clips/
│  ├─ thumbs/
│  ├─ playback_meta/
│  └─ playback_logs/
├─ Logo/
│  └─ Logo.png
├─ preview/
├─ 1_install.sh
├─ 2_install_systemd.sh
├─ start.sh
├─ webserver_oeffnen.sh
├─ webserver-kiosk.desktop
├─ cameras.py
├─ settings.json
└─ requirements.txt
```

## Runtime Folders

The playback workflow uses these directories:

- `static/clips/` for finished MP4 clips
- `static/thumbs/` for generated thumbnails
- `static/playback_meta/` for internal playback metadata
- `static/playback_logs/` for internal playback logs
- `search_log/<camera>/` for optional record-search dumps

## Configuration

Main configuration is handled through `settings.json` and `/api/config`.

Typical sections include:

- `cameras`
- `camera_defaults`
- `ffmpeg`
- `go2rtc`
- `ui`
- `live`
- `record_settings`

### ffmpeg path

The ffmpeg path should be absolute.

```json
{
  "ffmpeg": {
    "windows": "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "linux": "/usr/bin/ffmpeg"
  }
}
```

### go2rtc

The go2rtc configuration supports:

- `go2rtc.url`
- or `go2rtc.host` + `go2rtc.port`
- optional `go2rtc.base_path`
- optional `go2rtc.username`
- optional `go2rtc.password`

## Playback Workflow

The current playback flow is file-based, uses **no HLS**, and now reports playback preparation progress via **SSE**.

### Flow

1. Record search returns matches with start and end times.
2. If available, `playbackURI` is stored internally by `jobid`.
3. `POST /api/playback/start` creates or resumes a playback preparation job and returns immediately.
4. The frontend opens `GET /api/playback/events/{jobid}` as an SSE stream.
5. FastAPI downloads the recording from the NVR in the background.
6. Download progress is reported live as downloaded bytes, total bytes if known, percent if available, elapsed time and configured timeout.
7. The raw file is stored locally.
8. `ffmpeg` remuxes it to a real MP4.
9. A thumbnail can optionally be generated from the local MP4.
10. When the job reaches `ready`, the SSE stream sends the final `video_url` and optional `thumbnail_url`.
11. The frontend then loads the finished MP4 directly into the `<video>` element.

### Status Phases

Typical playback phases are:

- `queued`
- `downloading`
- `remuxing`
- `ready`
- `error`
- `stopped`

### Advantages

- no HLS complexity
- no `.m3u8` / `.ts` handling
- direct MP4 playback
- simple caching per job
- visible progress during long downloads
- elapsed time and timeout feedback in the UI

## Playback Progress / SSE

Playback preparation is no longer a single long blocking request from the UI perspective.

### Frontend behavior

- `POST /api/playback/start` starts the job and returns a `jobid`
- `GET /api/playback/events/{jobid}` streams playback status via **Server-Sent Events**
- the browser updates the UI with:
  - current phase
  - downloaded bytes
  - total bytes if the NVR sends `Content-Length`
  - percent if calculable
  - elapsed time
  - configured timeout
- when the status becomes `ready`, the frontend loads the final MP4 URL

### Notes

- If the clip already exists locally, `/api/playback/start` may return a ready/cached response immediately.
- If the NVR does not provide `Content-Length`, progress is still shown as downloaded bytes, but percentage may remain unknown.
- If you are using a reverse proxy in front of FastAPI, make sure response buffering is disabled for the SSE endpoint so progress updates are delivered live.

## Main API Endpoints

### Static / Root

#### `GET /`

Redirects to:

```text
/static/index.html
```

#### `GET /static/...`

Serves frontend files.

Blocked from direct public delivery:

- `playback_meta/`
- `playback_logs/`
- `.txt`
- `.log`
- `.part`
- `.bin`
- `.tmp.mp4`
- `.tmp.jpg`

### Config

#### `GET /api/config`

Returns current configuration with sanitized secrets.

#### `PATCH /api/config`

Updates parts of the configuration and can optionally restart go2rtc sync.

### Language

#### `GET /api/lang`

Loads available language dictionaries.

#### `GET /api/lang/available`

Returns available language codes.

### Records

#### `GET /api/records/search`

Search recordings by camera and date/time range.

Typical parameters:

- `camera`
- `date`
- `start`
- `end`
- `maxResults`
- `position`
- `searchID`
- `includeToken`

#### `GET /api/records/days`

Returns day distribution for available recordings in a month.

### Playback

#### `POST /api/playback/start`

Starts or resumes playback preparation and returns the current job state.

#### `GET /api/playback/events/{jobid}`

Streams playback preparation progress via SSE.

#### `GET /api/playback/events/{jobid}`

Streamt den Fortschritt der Wiedergabevorbereitung per SSE.

#### `POST /api/playback/stop/{jobid}`

Removes temporary files for one job.

#### `POST /api/playback/frame`

Checks whether a thumbnail exists.

#### `POST /api/playback/thumbnail`

Generates a thumbnail.

#### `POST /api/playback/stop_all`

Removes temporary playback files globally.

### Jobs / System

#### `GET /api/jobs`

Returns known playback jobs.

#### `GET /api/system/stats`

Returns system stats.

#### `POST /api/browser/close`

Closes browser processes.

## Live vs Playback

### Live

Use the **camera IP directly** for live view.

Typical RTSP paths:

- mainstream: `.../Streaming/Channels/101`
- substream: `.../Streaming/Channels/102`

### Playback / Search

Use the **NVR / recorder** for:

- record search
- playback
- recorder channel based logic

Do not replace recorder-based playback logic with direct camera IPs if your backend is built around Hikvision NVR ISAPI records.

## Hikvision Direct RTSP Notes

For Hikvision setups with internal PoE camera networks, the recommended approach is:

1. switch camera adding mode from **Plug-and-Play** to **Manual**
2. set camera gateway correctly, e.g. `192.168.254.1`
3. add a static route on the Linux or Windows host
4. use direct camera RTSP for live
5. keep records and playback on the recorder

### Example direct RTSP streams

```yaml
streams:
  cam1_main:
    - rtsp://admin:password@192.168.254.2:554/Streaming/Channels/101
  cam1_sub:
    - rtsp://admin:password@192.168.254.2:554/Streaming/Channels/102
```

### Quick checks

```bash
nc -vz -w 3 192.168.254.2 80
nc -vz -w 3 192.168.254.2 554
```

```bash
ffprobe -hide_banner -rtsp_transport tcp \
  -i 'rtsp://admin:PASSWORT@192.168.254.2:554/Streaming/Channels/101'
```

## Notes on Third-Party Components

For third-party binaries and libraries such as:

- `ffmpeg`
- `go2rtc`
- `jQuery`
- `Bootstrap`

the repository may intentionally not include all bundled files.  
Please use the provided **release files/package** or add the required components locally.

What is fine to keep in the repository:

- your own Python, HTML, CSS and JS files
- your own SVG, PNG, ICO and image assets
- configuration examples
- ffmpeg command examples
- go2rtc configuration snippets

## Target Use Cases

This project is especially suited for:

- local camera monitoring
- mini PC touchscreen systems
- self-built NVR frontends
- replacement for unstable vendor web interfaces
- hybrid environments with direct camera live view and recorder-based playback

## Author

**Jumbo125**

## License

Author: **Andreas Rottmann**  
License: **GNU AGPL-3.0**

---

## Deutsch

<a id="deutsch"></a>

Leichtgewichtige hybride Hikvision-NVR-Weboberfläche für Live-Ansicht, Aufnahmesuche und Wiedergabe mit go2rtc, FastAPI, ffmpeg, jQuery und Server-Sent Events (SSE) für Wiedergabe-Fortschritt.


## Support

Donate with PayPal ☕
Wenn dir das Projekt hilft und du mir einen Kaffee ausgeben willst:

[![Donate with PayPal ☕](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://www.paypal.me/andreasrottmann92)

## Vorschau

> Die folgenden Screenshots sind anonymisiert.

<p align="center">
  <img src="./preview/anonymized_01_gallery.webp" width="49%" alt="Galerieansicht" />
  <img src="./preview/anonymized_02_settings_overlay.webp" width="49%" alt="Einstellungs-Overlay" />
</p>

<p align="center">
  <img src="./preview/anonymized_03_ui_settings.webp" width="49%" alt="UI-Einstellungen" />
  <img src="./preview/anonymized_04_camera_settings.webp" width="49%" alt="Kamera-Einstellungen" />
</p>

<p align="center">
  <img src="./preview/anonymized_05_recordings.webp" width="49%" alt="Aufnahmen-Ansicht" />
  <img src="./preview/anonymized_06_single_camera.webp" width="49%" alt="Einzelkamera-Ansicht" />
</p>

## Warum jQuery?

Dieses Projekt wurde bewusst mit **jQuery** umgesetzt.  
Solche kompakten, touch-orientierten lokalen Weboberflächen kann ich damit schneller, sauberer und zuverlässiger erstellen als mit vielen modernen Frontend-Frameworks.

## Dank

Besonderer Dank an:

- **go2rtc** für effizientes Live-Streaming mit geringer Latenz
- **ffmpeg** für die leistungsstarke Medienverarbeitung und das Remuxing für Wiedergabe und Vorschaubilder

## Überblick

Dieses Projekt ist eine leichtgewichtige webbasierte Kamera- und NVR-Oberfläche für:

- Live-Ansicht
- Aufnahmesuche
- Wiedergabe
- Live-Fortschrittsanzeige der Wiedergabevorbereitung per SSE
- touchfreundliche lokale Bedienung

Es kombiniert:

- **go2rtc** für effizientes Live-Streaming
- **FastAPI** für API, Aufnahmesuche, Wiedergabe-Jobsteuerung und SSE-Fortschrittsstream
- **ffmpeg** für Remuxing und Thumbnail-Erstellung
- **Bootstrap + jQuery** für das Frontend

Das Ziel ist eine praktische Alternative zu klassischen Recorder-Weboberflächen, besonders für lokale Überwachungssysteme, Mini-PCs und Touchscreen-Setups.

## Grundidee

Das Projekt basiert auf einer klaren Trennung der Zuständigkeiten.

### Live-Ansicht

Live-Streams werden von **go2rtc** verarbeitet und direkt an den Browser geliefert.

```text
Kamera -> go2rtc -> Browser
```

### Aufnahmesuche und Wiedergabe

Aufnahmesuche und Wiedergabe erfolgen getrennt über das Python-Backend.

```text
Browser -> FastAPI -> Hikvision NVR / ISAPI -> ffmpeg -> MP4 -> Browser
```

Dadurch bleibt das System modular, stabil und leichtgewichtig.

## Architektur

### Zuständigkeiten

| Bereich | Komponente |
|---|---|
| Live-Streaming | go2rtc |
| Aufnahmesuche | FastAPI |
| Wiedergabe-Jobsteuerung / SSE-Fortschritt | FastAPI |
| Wiedergabe-Download/Remux | ffmpeg + FastAPI |
| UI | Bootstrap + jQuery |

### Empfohlene Architektur

```text
Live:
Kamera -> go2rtc -> Browser

Aufnahmen / Suche / Wiedergabe:
Browser -> FastAPI -> NVR
```

### Nicht empfohlen

```text
Kamera -> NVR -> RTSP -> go2rtc -> Browser
```

In der Praxis ist direkter Kamera-RTSP für die Live-Ansicht oft stabiler als der Weg über den RTSP-Pfad des NVR.

## Funktionen

- Live-Galerie für mehrere Kameras
- Substream in der Galerie, Mainstream in Vollbild/Modal
- Aufnahmesuche nach Kamera und Zeitraum
- direkte Wiedergabe aus Suchergebnissen
- Live-Fortschritt der Wiedergabevorbereitung per SSE
- Anzeige von verstrichener Zeit und Timeout während der Bereitstellung
- Thumbnail-Erzeugung
- dynamisches Grid-Layout
- go2rtc-Sync aus der Konfiguration
- touchfreundliche Browser-Bedienung
- Linux-Kioskmodus-Unterstützung
- systemd-Service-Unterstützung

## Technologie-Stack

- Python 3
- FastAPI
- Uvicorn
- go2rtc
- ffmpeg
- Bootstrap
- jQuery
- Server-Sent Events (SSE)

## Schnellstart

### 1. Repository klonen

```bash
git clone https://github.com/USERNAME/hikvision-nvr-web-interface.git
cd hikvision-nvr-web-interface
```

### 2. Drittanbieter-Software

Das Repository enthält **nicht** alle Drittanbieter-Komponenten und gebündelten Dateien.

Je nach Setup sind Komponenten wie:

- `go2rtc`
- `ffmpeg`
- `jQuery`
- `Bootstrap`
- weitere externe Laufzeitdateien

**nicht direkt im Repository enthalten**, sondern werden über die **Release-Dateien / das Release-Paket** bereitgestellt oder müssen lokal ergänzt werden.

Bitte stelle vor dem Start sicher, dass diese Komponenten vorhanden sind.

### 3. Python-Abhängigkeiten installieren

```bash
./1_install.sh
```

Dieses Skript:

- prüft, ob `python3` vorhanden ist
- versucht Python bei Bedarf automatisch zu installieren
- unterstützt mehrere Paketmanager
- erstellt oder repariert ein lokales `venv`
- stellt sicher, dass `pip` im `venv` verfügbar ist
- aktualisiert `pip`
- installiert die Abhängigkeiten aus `requirements.txt`

### 4. Server starten

```bash
./start.sh
```

Dadurch wird das Projekt mit der lokalen virtuellen Umgebung gestartet und ausgeführt mit:

```bash
python -m app.main --workers 1
```

### Wichtiger Hinweis

`start.sh` verweist derzeit auf `install.sh`, während deine Installer-Datei `1_install.sh` heißt.

### 5. UI öffnen

Standard-URL für den lokalen Kiosk-Launcher:

```text
http://127.0.0.1:9500
```

## Linux-Service-Setup

Um die App als systemd-Service zu installieren, verwende:

```bash
./2_install_systemd.sh
```

Dieses Skript:

- erstellt einen Service mit dem Namen `nvr-ui`
- verwendet den aktuellen Linux-Benutzer
- setzt den Projektordner als `WorkingDirectory`
- startet die App über `start.sh`
- aktiviert automatischen Neustart
- aktiviert den Service beim Systemstart
- startet ihn direkt nach der Installation neu

### Nützliche Befehle

```bash
sudo systemctl status nvr-ui
journalctl -u nvr-ui -f
```

## Kiosk / Touchscreen-Nutzung

Für den Kioskmodus enthält das Projekt:

- `webserver_oeffnen.sh`
- `webserver-kiosk.desktop`

### `webserver_oeffnen.sh`

Dieses Hilfsskript:

- wartet, bis `http://127.0.0.1:9500` erreichbar ist
- erkennt `chromium` oder `chromium-browser`
- startet Chromium im Kioskmodus

Verwendete Flags:

- `--kiosk`
- `--incognito`
- `--no-first-run`
- `--disable-infobars`
- `--check-for-update-interval=31536000`

### `.desktop`-Launcher

Die enthaltene Desktop-Datei startet den Kiosk-Launcher automatisch.  
Wahrscheinlich musst du den `Exec=`-Pfad an dein System anpassen.

## Projektstruktur

```text
.
├─ app/
│  ├─ main.py
│  ├─ routers/
│  └─ services/
├─ static/
│  ├─ index.html
│  ├─ clips/
│  ├─ thumbs/
│  ├─ playback_meta/
│  └─ playback_logs/
├─ Logo/
│  └─ Logo.png
├─ preview/
├─ 1_install.sh
├─ 2_install_systemd.sh
├─ start.sh
├─ webserver_oeffnen.sh
├─ webserver-kiosk.desktop
├─ cameras.py
├─ settings.json
└─ requirements.txt
```

## Laufzeitordner

Der Wiedergabe-Workflow verwendet folgende Verzeichnisse:

- `static/clips/` für fertige MP4-Clips
- `static/thumbs/` für erzeugte Vorschaubilder
- `static/playback_meta/` für interne Wiedergabe-Metadaten
- `static/playback_logs/` für interne Wiedergabe-Logs
- `search_log/<camera>/` für optionale Aufnahmesuch-Dumps

## Konfiguration

Die Hauptkonfiguration erfolgt über `settings.json` und `/api/config`.

Typische Bereiche sind:

- `cameras`
- `camera_defaults`
- `ffmpeg`
- `go2rtc`
- `ui`
- `live`
- `record_settings`

### ffmpeg-Pfad

Der ffmpeg-Pfad sollte absolut sein.

```json
{
  "ffmpeg": {
    "windows": "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "linux": "/usr/bin/ffmpeg"
  }
}
```

### go2rtc

Die go2rtc-Konfiguration unterstützt:

- `go2rtc.url`
- oder `go2rtc.host` + `go2rtc.port`
- optional `go2rtc.base_path`
- optional `go2rtc.username`
- optional `go2rtc.password`

## Wiedergabe-Workflow

Der aktuelle Wiedergabe-Ablauf ist dateibasiert, verwendet **kein** HLS und meldet den Fortschritt der Bereitstellung jetzt über **SSE**.

### Ablauf

1. Die Aufnahmesuche liefert Treffer mit Start- und Endzeiten.
2. Falls vorhanden, wird `playbackURI` intern unter einer `jobid` gespeichert.
3. `POST /api/playback/start` erstellt oder übernimmt einen Wiedergabe-Job und antwortet sofort.
4. Das Frontend öffnet `GET /api/playback/events/{jobid}` als SSE-Stream.
5. FastAPI lädt die Aufnahme im Hintergrund vom NVR herunter.
6. Der Download-Fortschritt wird live gemeldet: geladene Bytes, Gesamtbytes falls bekannt, Prozent falls berechenbar, verstrichene Zeit und gesetztes Timeout.
7. Die Rohdatei wird lokal gespeichert.
8. `ffmpeg` remuxt sie zu einer echten MP4-Datei.
9. Optional kann ein Vorschaubild aus der lokalen MP4 erzeugt werden.
10. Sobald der Job `ready` erreicht, sendet der SSE-Stream die finale `video_url` und optional `thumbnail_url`.
11. Erst dann lädt das Frontend die fertige MP4-Datei direkt in das `<video>`-Element.

### Status-Phasen

Typische Wiedergabe-Phasen sind:

- `queued`
- `downloading`
- `remuxing`
- `ready`
- `error`
- `stopped`

### Vorteile

- keine HLS-Komplexität
- kein `.m3u8` / `.ts`-Handling
- direkte MP4-Wiedergabe
- einfaches Caching pro Job
- sichtbarer Fortschritt bei langen Downloads
- Anzeige von verstrichener Zeit und Timeout im UI

## Wiedergabe-Fortschritt / SSE

Die Wiedergabevorbereitung ist aus Sicht des Frontends nicht mehr nur ein einzelner langer blockierender Request.

### Verhalten im Frontend

- `POST /api/playback/start` startet den Job und liefert eine `jobid`
- `GET /api/playback/events/{jobid}` streamt den Status der Wiedergabevorbereitung per **Server-Sent Events**
- der Browser aktualisiert die UI mit:
  - aktueller Phase
  - bereits geladenen Bytes
  - Gesamtbytes, falls der NVR `Content-Length` mitsendet
  - Prozent, falls berechenbar
  - verstrichener Zeit
  - konfiguriertem Timeout
- sobald der Status `ready` ist, lädt das Frontend die finale MP4-URL

### Hinweise

- Falls der Clip lokal bereits existiert, kann `/api/playback/start` sofort einen fertigen/gecacheten Status zurückgeben.
- Falls der NVR kein `Content-Length` liefert, wird der Fortschritt trotzdem über geladene Bytes angezeigt, aber ohne sicheren Prozentwert.
- Wenn vor FastAPI ein Reverse Proxy verwendet wird, sollte Response-Buffering für den SSE-Endpunkt deaktiviert werden, damit Fortschrittsmeldungen live ankommen.

## Wichtige API-Endpunkte

### Statisch / Root

#### `GET /`

Leitet weiter zu:

```text
/static/index.html
```

#### `GET /static/...`

Liefert Frontend-Dateien aus.

Von direkter öffentlicher Auslieferung ausgenommen:

- `playback_meta/`
- `playback_logs/`
- `.txt`
- `.log`
- `.part`
- `.bin`
- `.tmp.mp4`
- `.tmp.jpg`

### Konfiguration

#### `GET /api/config`

Gibt die aktuelle Konfiguration mit bereinigten Secrets zurück.

#### `PATCH /api/config`

Aktualisiert Teile der Konfiguration und kann optional den go2rtc-Sync neu starten.

### Sprache

#### `GET /api/lang`

Lädt verfügbare Sprachdateien.

#### `GET /api/lang/available`

Gibt verfügbare Sprachcodes zurück.

### Aufnahmen

#### `GET /api/records/search`

Sucht Aufnahmen nach Kamera und Datums-/Zeitbereich.

Typische Parameter:

- `camera`
- `date`
- `start`
- `end`
- `maxResults`
- `position`
- `searchID`
- `includeToken`

#### `GET /api/records/days`

Gibt die Tagesverteilung vorhandener Aufnahmen in einem Monat zurück.

### Wiedergabe

#### `POST /api/playback/start`

Startet oder übernimmt die Wiedergabevorbereitung und gibt den aktuellen Job-Status zurück.

#### `GET /api/playback/events/{jobid}`

Streams playback preparation progress via SSE.

#### `GET /api/playback/events/{jobid}`

Streamt den Fortschritt der Wiedergabevorbereitung per SSE.

#### `POST /api/playback/stop/{jobid}`

Entfernt temporäre Dateien für einen Job.

#### `POST /api/playback/frame`

Prüft, ob ein Vorschaubild existiert.

#### `POST /api/playback/thumbnail`

Erzeugt ein Vorschaubild.

#### `POST /api/playback/stop_all`

Entfernt temporäre Wiedergabedateien global.

### Jobs / System

#### `GET /api/jobs`

Gibt bekannte Wiedergabe-Jobs zurück.

#### `GET /api/system/stats`

Gibt Systemstatistiken zurück.

#### `POST /api/browser/close`

Schließt Browser-Prozesse.

## Live vs Wiedergabe

### Live

Für die Live-Ansicht sollte **direkt die Kamera-IP** verwendet werden.

Typische RTSP-Pfade:

- Mainstream: `.../Streaming/Channels/101`
- Substream: `.../Streaming/Channels/102`

### Wiedergabe / Suche

Für folgende Funktionen sollte der **NVR / Recorder** verwendet werden:

- Aufnahmesuche
- Wiedergabe
- recorderbasierte Kanal-Logik

Ersetze recorderbasierte Wiedergabelogik nicht durch direkte Kamera-IPs, wenn dein Backend auf Hikvision-NVR-ISAPI-Aufnahmen basiert.

## Hinweise zu direktem Hikvision-RTSP

Für Hikvision-Setups mit internem PoE-Kameranetzwerk ist folgender Ansatz empfehlenswert:

1. Kamerahinzufügungsmodus von **Plug-and-Play** auf **Manual** umstellen
2. Kamera-Gateway korrekt setzen, z. B. `192.168.254.1`
3. statische Route auf dem Linux- oder Windows-Host hinzufügen
4. direkten Kamera-RTSP für Live verwenden
5. Aufnahmen und Wiedergabe weiter über den Recorder laufen lassen

### Beispiel für direkte RTSP-Streams

```yaml
streams:
  cam1_main:
    - rtsp://admin:password@192.168.254.2:554/Streaming/Channels/101
  cam1_sub:
    - rtsp://admin:password@192.168.254.2:554/Streaming/Channels/102
```

### Schnelltests

```bash
nc -vz -w 3 192.168.254.2 80
nc -vz -w 3 192.168.254.2 554
```

```bash
ffprobe -hide_banner -rtsp_transport tcp \
  -i 'rtsp://admin:PASSWORT@192.168.254.2:554/Streaming/Channels/101'
```

## Hinweise zu Drittanbieter-Komponenten

Für Drittanbieter-Binaries und Bibliotheken wie:

- `ffmpeg`
- `go2rtc`
- `jQuery`
- `Bootstrap`

kann es sein, dass das Repository bewusst **nicht alle gebündelten Dateien** enthält.  
Bitte verwende die bereitgestellten **Release-Dateien / das Release-Paket** oder ergänze die benötigten Komponenten lokal.

Im Repository sinnvoll enthalten sind:

- eigene Python-, HTML-, CSS- und JS-Dateien
- eigene SVG-, PNG-, ICO- und Bilddateien
- Konfigurationsbeispiele
- ffmpeg-Befehlsbeispiele
- go2rtc-Konfigurations-Snippets

## Zielanwendungen

Dieses Projekt eignet sich besonders für:

- lokale Kameraüberwachung
- Mini-PC-Touchscreen-Systeme
- selbst gebaute NVR-Frontends
- Ersatz für instabile Hersteller-Weboberflächen
- hybride Umgebungen mit direkter Kamera-Live-Ansicht und recorderbasierter Wiedergabe

## Autor

**Jumbo125**

## Lizenz

Autor: **Andreas Rottmann**  
Lizenz: **GNU AGPL-3.0**