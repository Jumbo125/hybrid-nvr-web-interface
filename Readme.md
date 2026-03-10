cat > README.md <<'EOF'
<p align="center">
  <img src="Logo/Logo.png" alt="Hikvision Hybrid NVR Web Interface Logo" width="180">
</p>

# hikvision-nvr-web-interface

Lightweight hybrid Hikvision NVR web interface for live view, record search and playback using go2rtc, FastAPI, ffmpeg and jQuery.

## Preview

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


## Why jQuery?

This project was intentionally built with **jQuery**.  
I can build this type of compact, touch-oriented local web interface faster, cleaner and more reliably with jQuery than with modern ES6+ frontend frameworks.

## Thanks

Special thanks to:

- **go2rtc** for efficient, low-latency live streaming
- **ffmpeg** for the powerful media processing and remuxing features used for playback and thumbnails

## Overview

This project is a lightweight, web-based camera and NVR interface for:

- live view
- record search
- playback
- touch-friendly local operation

It combines:

- **go2rtc** for efficient live streaming
- **FastAPI** for API, record search and playback logic
- **ffmpeg** for remuxing and thumbnail generation
- **Bootstrap + jQuery** for the frontend

The goal is a practical alternative to classic recorder web interfaces, especially for local monitoring systems, mini PCs and touchscreen setups.

## Core idea

The project is built around a strict separation of responsibilities.

### Live view

Live streams are handled by **go2rtc** and go directly to the browser.

```text
Camera -> go2rtc -> Browser
```

### Record search and playback

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
| Playback download/remux | ffmpeg + FastAPI |
| UI | Bootstrap + jQuery |

### Recommended architecture

```text
Live:
Camera -> go2rtc -> Browser

Records / Search / Playback:
Browser -> FastAPI -> NVR
```

### Not recommended

```text
Camera -> NVR -> RTSP -> go2rtc -> Browser
```

In practice, direct camera RTSP for live view is often more stable than going through the NVR RTSP path.

## Features

- live gallery for multiple cameras
- substream in gallery, mainstream in fullscreen/modal
- record search by camera and time range
- direct playback from search results
- thumbnail generation
- dynamic grid layout
- go2rtc sync from config
- touch-friendly browser usage
- Linux kiosk mode support
- systemd service support

## Tech stack

- Python 3
- FastAPI
- Uvicorn
- go2rtc
- ffmpeg
- Bootstrap
- jQuery

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/USERNAME/hikvision-nvr-web-interface.git
cd hikvision-nvr-web-interface
```

### 2. Install dependencies

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

### 3. Start the server

```bash
./start.sh
```

This starts the project using the local virtual environment and launches:

```bash
python -m app.main --workers 1
```

### Important note

`start.sh` currently mentions `install.sh`, while your installer file is named `1_install.sh`.

### 4. Open the UI

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
├─ 1_install.sh
├─ 2_install_systemd.sh
├─ start.sh
├─ webserver_oeffnen.sh
├─ webserver-kiosk.desktop
├─ cameras.py
├─ settings.json
└─ requirements.txt
```

## Runtime folders

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

## Playback workflow

The current playback flow is file-based and does **not** use HLS.

### Flow

1. Record search returns matches with start and end times.
2. If available, `playbackURI` is stored internally by `jobid`.
3. `/api/playback/start` downloads the recording from the NVR.
4. The raw file is stored locally.
5. `ffmpeg` remuxes it to a real MP4.
6. A thumbnail can optionally be generated.
7. The frontend receives direct URLs to MP4 and thumbnail.

### Advantages

- no HLS complexity
- no `.m3u8` / `.ts` handling
- direct MP4 playback
- simple caching per job

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

Starts or returns cached playback.

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

## Hikvision direct RTSP notes

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

## Notes on third-party components

For third-party binaries such as:

- `ffmpeg`
- `go2rtc`

it is usually better to **not** commit platform binaries directly into the repository. Document them in the README and let users place them locally.

What is fine to keep in the repository:

- your own Python, HTML, CSS and JS files
- your own SVG, PNG, ICO and image assets
- configuration examples
- ffmpeg command examples
- go2rtc configuration snippets

## Target use cases

This project is especially suited for:

- local camera monitoring
- mini PC touchscreen systems
- self-built NVR frontends
- replacement for unstable vendor web interfaces
- hybrid environments with direct camera live view and recorder-based playback

## License

Add your preferred license here, for example:

```text
GNU AGPL-3.0
```
EOF