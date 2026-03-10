/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Live/WebRTC (go2rtc):
 * - Baut go2rtc Base-URL aus Config
 * - Erstellt Stream-Namen aus Kameras (main/sub)
 * - Startet WebRTC über go2rtc /api/webrtc und setzt Tile-Status (CONNECTING/LIVE/OFFLINE)
 * - Reagiert auf Event "generalConfigLoaded"
 *
 * i18n:
 * - Status-Texte und relevante Warn-/Fehlertexte laufen über HK.msg(...)
 */

/* global RTCPeerConnection */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  window.Live = window.Live || {};
  const Live = (HK.Live = window.Live);

  // Debug-Flag für Konsolen-Ausgaben
  Live.DEBUG = true;

  // Interne Zustände
  Live._inited = false;
  // key -> { pc: RTCPeerConnection, videoEl: HTMLVideoElement|null, streamName: string, streamType: string|null }
  Live.livePCs = Live.livePCs || new Map();
  Live.modalPC = Live.modalPC || null;
  Live.modalCamKey = Live.modalCamKey || null;
  Live.modalStreamType = Live.modalStreamType || null;
  Live.modalNeedsTileRestart = Live.modalNeedsTileRestart || false;
  Live.modalStoppedTileCamKey = Live.modalStoppedTileCamKey || null;

  /**
   * Liefert die aktuelle General Config (falls vorhanden).
   */
  Live.cfg = function () {
    return window.General_config || {};
  };

  /**
   * Baut die Base-URL für go2rtc aus Config:
   * - Wenn go2rtc.url gesetzt ist, wird diese genutzt
   * - Sonst: proto://host:port + optional base_path
   */
  Live.buildGo2rtcBaseFromConfig = function (cfgObj) {
    const go = cfgObj && cfgObj.go2rtc ? cfgObj.go2rtc : {};

    if (typeof go.url === "string" && go.url.trim()) {
      return go.url.trim().replace(/\/$/, "");
    }

    const proto =
      location.protocol === "http:" || location.protocol === "https:"
        ? location.protocol
        : "http:";

    const host =
      typeof go.host === "string" && go.host.trim()
        ? go.host.trim()
        : location.hostname || "127.0.0.1";

    const port = go.port != null ? Number(go.port) : 1984;

    const basePath =
      typeof go.base_path === "string" && go.base_path.trim()
        ? go.base_path.trim().startsWith("/")
          ? go.base_path.trim()
          : "/" + go.base_path.trim()
        : "";

    return `${proto}//${host}:${port}${basePath}`.replace(/\/$/, "");
  };

  /**
   * Erzeugt aus der Config ein Kamera-Mapping:
   * { camId: { sub: "camId_sub", main: "camId_main" } }
   */
  Live.buildCamsFromConfig = function (cfgObj) {
    const cams =
      cfgObj && (cfgObj.cameras_resolved || cfgObj.cameras)
        ? cfgObj.cameras_resolved || cfgObj.cameras
        : {};

    const out = {};
    Object.keys(cams).forEach(function (id) {
      out[id] = { sub: `${id}_sub`, main: `${id}_main` };
      if (Live.DEBUG) console.log("[Live] cam mapping", id, out[id]);
    });

    return out;
  };

  /**
   * Liefert den konfigurierten Live-Modus.
   * Erlaubte Werte: auto | main | sub
   */
  Live.getStreamMode = function (cfgObj) {
    const live = cfgObj && cfgObj.live ? cfgObj.live : {};
    const raw = String(live.stream_mode || "").trim().toLowerCase();

    if (raw === "main" || raw === "sub" || raw === "auto") return raw;
    return "auto";
  };

  /**
   * Liefert die Wartezeit zwischen zwei Stream-Wechseln in ms.
   * Config:
   *   live.stream_switch_delay_ms
   */
  Live.getStreamSwitchDelayMs = function (cfgObj) {
    const live = cfgObj && cfgObj.live ? cfgObj.live : {};
    const raw = Number(live.stream_switch_delay_ms);

    if (Number.isFinite(raw) && raw >= 0) return raw;
    return 1000;
  };

  /**
   * Kleiner Promise-Wrapper für Delays.
   */
  Live.sleep = function (ms) {
    const waitMs = Math.max(0, Number(ms) || 0);
    return new Promise(function (resolve) {
      setTimeout(resolve, waitMs);
    });
  };

  /**
   * Liefert den gewünschten Stream-Typ für gallery/fullscreen.
   * - main => immer main
   * - sub  => immer sub
   * - auto => gallery=sub, fullscreen=main
   */
  Live.getDesiredStreamType = function (target, cfgObjOrMode) {
    const mode =
      typeof cfgObjOrMode === "string"
        ? cfgObjOrMode
        : Live.getStreamMode(cfgObjOrMode);

    if (mode === "main") return "main";
    if (mode === "sub") return "sub";
    return target === "fullscreen" ? "main" : "sub";
  };

  /**
   * Liefert den go2rtc Stream-Namen für eine Kamera und einen Typ.
   */
  Live.getStreamNameForCam = function (camKey, streamType) {
    const cams = Live.cams || {};

    if (cams[camKey] && cams[camKey][streamType]) {
      return cams[camKey][streamType];
    }
    return `${camKey}_${streamType}`;
  };

  Live.buildWebrtcUrl = function (streamName) {
    if (!Live.GO2RTC_BASE || !streamName) return "";
    return `${Live.GO2RTC_BASE}/api/webrtc?src=${encodeURIComponent(streamName)}`;
  };

  Live.getDebugStreamUrlsForCam = function (camKey, cfgObjOrMode) {
    const galleryType = Live.getDesiredStreamType("gallery", cfgObjOrMode);
    const fullscreenType = Live.getDesiredStreamType("fullscreen", cfgObjOrMode);

    const galleryName = Live.getStreamNameForCam(camKey, galleryType);
    const fullscreenName = Live.getStreamNameForCam(camKey, fullscreenType);

    return {
      galleryType,
      fullscreenType,
      galleryName,
      fullscreenName,
      galleryUrl: Live.buildWebrtcUrl(galleryName),
      fullscreenUrl: Live.buildWebrtcUrl(fullscreenName)
    };
  };

  Live.applyVideoDebugAttrs = function (videoEl, camKey, cfgObjOrMode, currentTarget) {
    if (!videoEl || !camKey) return;

    const dbg = Live.getDebugStreamUrlsForCam(camKey, cfgObjOrMode);
    const current =
      currentTarget === "fullscreen" ? dbg.fullscreenUrl : dbg.galleryUrl;

    videoEl.setAttribute("data-live-gallery", dbg.galleryUrl || "");
    videoEl.setAttribute("data-live-fullscreen", dbg.fullscreenUrl || "");
    videoEl.setAttribute("data-live-current", current || "");
    videoEl.setAttribute("data-live-gallery-type", dbg.galleryType || "");
    videoEl.setAttribute("data-live-fullscreen-type", dbg.fullscreenType || "");
  };

  /**
   * Einfacher Check, ob go2rtc erreichbar ist.
   */
  Live.healthcheck = async function (base) {
    try {
      const url = `${base}/api/streams`;
      if (Live.DEBUG) console.log("[go2rtc] healthcheck GET", url);

      const r = await fetch(url, { method: "GET" });
      if (Live.DEBUG) console.log("[go2rtc] healthcheck status", r.status, r.ok);

      return r.ok;
    } catch (e) {
      console.warn("[go2rtc] healthcheck FAILED", e && e.name, e && e.message);
      return false;
    }
  };

  /**
   * Spinner im Tile anzeigen.
   */
  Live.showSpinnerIn = function (tileEl) {
    const sp = tileEl ? tileEl.querySelector(".spinner-overlay") : null;
    if (sp) sp.classList.remove("d-none");
    if (tileEl) tileEl.classList.add("loading");
  };

  /**
   * Spinner im Tile ausblenden.
   */
  Live.hideSpinnerIn = function (tileEl) {
    const sp = tileEl ? tileEl.querySelector(".spinner-overlay") : null;
    if (sp) sp.classList.add("d-none");
    if (tileEl) tileEl.classList.remove("loading");
  };

  /**
   * Setzt den Text-Status eines Tiles und markiert offline/online über CSS-Klasse.
   */
  Live.setTileStatus = function (tileEl, text, online) {
    if (!tileEl) return;
    const st = tileEl.querySelector(".live-status");
    if (st) st.textContent = text;
    tileEl.classList.toggle("offline", !online);
  };

  /**
   * Stoppt Video/Tracks sicher (ohne Fehler nach außen zu werfen).
   */
  Live.safeStopMedia = function (videoEl) {
    if (!videoEl) return;
    try {
      const so = videoEl.srcObject;

      try {
        videoEl.pause();
      } catch (e) {}
      try {
        videoEl.srcObject = null;
      } catch (e) {}
      try {
        videoEl.removeAttribute("src");
      } catch (e) {}
      try {
        videoEl.load();
      } catch (e) {}

      if (so && so.getTracks) {
        so.getTracks().forEach(function (t) {
          try {
            t.stop();
          } catch (e) {}
        });
      }
    } catch (e) {}
  };

  /**
   * Setzt ein einfaches Grid-Layout je nach Anzahl Tiles.
   */
  Live.setGridLayout = function (count) {
    const grid = document.getElementById("liveGrid");
    if (!grid) return;

    const cols = count <= 3 ? count : 3;
    const rows = count <= 3 ? 1 : Math.ceil(count / cols);

    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.style.gap = "10px";
  };

  /**
   * Wartet, bis ICE Gathering abgeschlossen ist (oder Timeout erreicht).
   * go2rtc kommt oft besser zurecht, wenn Kandidaten bereits gesammelt sind.
   */
  Live.waitIceGatheringComplete = async function (pc, timeoutMs) {
    const tms = typeof timeoutMs === "number" ? timeoutMs : 4000;
    if (pc.iceGatheringState === "complete") return;

    await new Promise(function (resolve) {
      let doneCalled = false;

      const done = function () {
        if (doneCalled) return;
        doneCalled = true;
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      };

      const onChange = function () {
        if (pc.iceGatheringState === "complete") done();
      };

      pc.addEventListener("icegatheringstatechange", onChange);
      setTimeout(done, tms);
    });
  };

  /**
   * Startet WebRTC via go2rtc:
   * - Erstellt RTCPeerConnection
   * - POST offer SDP an go2rtc /api/webrtc?src=<streamName>
   * - Setzt answer SDP als RemoteDescription
   * - Optional: speichert PC in Live.livePCs unter storeKey
   */
  Live.startGo2rtcWebRTC = async function (streamName, videoEl, opts) {
    const o = opts || {};
    const storeKey = o.storeKey != null ? o.storeKey : null;
    const tileEl = o.tileEl != null ? o.tileEl : null;
    const timeoutMs = typeof o.timeoutMs === "number" ? o.timeoutMs : 20000;
    const isMuted = o.isMuted !== false; // default true
    const wantAudio = o.wantAudio !== false; // default true
    const onPlaying = typeof o.onPlaying === "function" ? o.onPlaying : null;
    const streamType = o.streamType || null;

    const base = Live.GO2RTC_BASE;
    if (!base) {
      console.warn(
        HK.msg(
          "live.go2rtc_base_missing",
          "GO2RTC_BASE fehlt (Config noch nicht geladen?)"
        )
      );
      return null;
    }

    const pc = new RTCPeerConnection();

    if (videoEl) {
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = !!isMuted;
    }

    // Empfangsrichtung (wir senden nichts)
    pc.addTransceiver("video", { direction: "recvonly" });
    if (wantAudio) pc.addTransceiver("audio", { direction: "recvonly" });

    const ms = new MediaStream();
    let playingHooked = false;

    // Tracks in MediaStream sammeln und im Video abspielen
    pc.ontrack = function (event) {
      try {
        ms.addTrack(event.track);
      } catch (e) {}

      if (!videoEl) return;

      videoEl.srcObject = ms;
      videoEl.play().catch(function () {});

      if (onPlaying && !playingHooked) {
        playingHooked = true;

        const once = function () {
          videoEl.removeEventListener("playing", once);
          try {
            onPlaying();
          } catch (e) {}
        };

        videoEl.addEventListener("playing", once);
      }
    };

    try {
      if (tileEl) {
        Live.showSpinnerIn(tileEl);
        Live.setTileStatus(
          tileEl,
          HK.msg("live.status_connecting", "CONNECTING…"),
          false
        );
      }

      // Offer erstellen und lokal setzen
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Kandidaten sammeln (bis timeout)
      await Live.waitIceGatheringComplete(pc, 4000);

      // go2rtc Endpoint
      const url = `${base}/api/webrtc?src=${encodeURIComponent(streamName)}`;

      // Timeout für fetch
      const controller = new AbortController();
      const t = setTimeout(function () {
        controller.abort();
      }, timeoutMs);

      const sdpOffer = (pc.localDescription && pc.localDescription.sdp) || offer.sdp;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: sdpOffer,
        signal: controller.signal
      }).finally(function () {
        clearTimeout(t);
      });

      if (!resp.ok) {
        const body = await resp.text().catch(function () {
          return "";
        });

        const bodySuffix = body ? " - " + body : "";

        throw new Error(
          HK.msg(
            "live.webrtc_failed",
            "go2rtc WebRTC fehlgeschlagen: {status} {statusText}{body}",
            {
              status: resp.status,
              statusText: resp.statusText,
              body: bodySuffix
            }
          )
        );
      }

      // Answer SDP übernehmen
      const answerSdp = await resp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Optional: PC unter Key merken (vorherigen sicher stoppen)
      if (storeKey) {
        const old = Live.livePCs.get(storeKey);
        if (old && old.pc) {
          Live.stopPC(old.pc, old.videoEl);
        }
        Live.livePCs.set(storeKey, {
          pc,
          videoEl: videoEl || null,
          streamName,
          streamType
        });
      }

      if (tileEl) {
        Live.setTileStatus(tileEl, HK.msg("live.status_live", "LIVE"), true);
        if (!onPlaying) Live.hideSpinnerIn(tileEl);
      }

      return pc;
    } catch (err) {
      console.warn("[go2rtc] WebRTC start failed:", err);

      try {
        pc.close();
      } catch (e) {}

      Live.safeStopMedia(videoEl);

      if (tileEl) {
        Live.setTileStatus(
          tileEl,
          HK.msg("live.status_offline", "OFFLINE"),
          false
        );
        Live.hideSpinnerIn(tileEl);
      }

      return null;
    }
  };

  /**
   * Stoppt eine einzelne RTCPeerConnection und das zugehörige Video.
   */
  Live.stopPC = function (pc, videoEl) {
    if (Live.DEBUG) console.log("[go2rtc] STOP PC", { hasPc: !!pc, hasVideo: !!videoEl });
    try {
      if (pc) {
        // Einige Browser geben Ressourcen schneller frei, wenn wir Transceiver/Receiver stoppen
        try {
          pc.getTransceivers &&
            pc.getTransceivers().forEach(function (t) {
              try {
                t.stop && t.stop();
              } catch (e) {}
            });
        } catch (e) {}

        try {
          pc.getReceivers &&
            pc.getReceivers().forEach(function (r) {
              try {
                r.track && r.track.stop && r.track.stop();
              } catch (e) {}
            });
        } catch (e) {}

        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;

        pc.close();
      }
    } catch (e) {}
    Live.safeStopMedia(videoEl);
  };

  /**
   * Stoppt alle laufenden Live-Connections.
   */
  Live.stopAllLivePCs = function () {
    for (const entry of Live.livePCs.values()) {
      try {
        if (entry && entry.pc) Live.stopPC(entry.pc, entry.videoEl);
      } catch (e) {}
    }
    Live.livePCs.clear();
  };

  /**
   * Stoppt eine gespeicherte Live-Session (storeKey), inkl. Video cleanup.
   */
  Live.stopLiveByKey = function (storeKey) {
    const entry = Live.livePCs.get(storeKey);
    if (!entry) return;
    Live.stopPC(entry.pc, entry.videoEl);
    Live.livePCs.delete(storeKey);
  };

  /**
   * Initialisiert Live-Modul aus Config (Base URL + Kamera-Mapping + Healthcheck).
   */
  Live.initFromConfig = async function (cfgObj) {
    Live.GO2RTC_BASE = Live.buildGo2rtcBaseFromConfig(cfgObj);
    Live.cams = Live.buildCamsFromConfig(cfgObj);

    if (Live.DEBUG) {
      console.log("[Live] init", {
        GO2RTC_BASE: Live.GO2RTC_BASE,
        cams: Live.cams,
        streamMode: Live.getStreamMode(cfgObj),
        streamSwitchDelayMs: Live.getStreamSwitchDelayMs(cfgObj)
      });
    }

    await Live.healthcheck(Live.GO2RTC_BASE);

    Live._inited = true;
  };

  /**
   * Handler: wird gefeuert, wenn generalConfigLoaded getriggert wurde.
   */
  Live.onGeneralConfigLoaded = function (_, cfgObj) {
    Live.initFromConfig(cfgObj);
  };

  // Auf Config-Event reagieren
  $(document).on("generalConfigLoaded", Live.onGeneralConfigLoaded);

  // Falls Config bereits vorhanden ist, direkt initialisieren
  if (Live.cfg() && Object.keys(Live.cfg()).length) {
    Live.initFromConfig(Live.cfg());
  }

  // Optionaler Alias (kompatibel zu bestehendem Code)
  window.NVR = window.NVR || Live;

})(jQuery);