/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Live UI:
 * - Baut das Live-Grid aus der Config (Tiles pro Kamera)
 * - Startet pro Tile den Stream abhängig vom konfigurierten Modus
 * - Öffnet per Klick ein Modal mit dem konfigurierten Fullscreen-Stream
 * - Modal Controls: Lautstärke + Mute/Unmute
 * - Cleanup: Bei auto wird beim Modal-Schließen der Tile-Stream wieder gestartet
 *
 * i18n:
 * - Alle UI-Texte (Status, "Loading...", Titel "Live: ...", Warnungen) werden über HK.msg(...) bereitgestellt.
 * - Im dynamisch erzeugten HTML werden data-key/data-attr gesetzt, damit die DOM-Übersetzung (applyLanguageToDom)
 *   nachträglich angewendet werden kann.
 */

/* global bootstrap, $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  window.Live = window.Live || {};
  const Live = (HK.Live = window.Live);

  HK.liveUi = HK.liveUi || {};

  /**
   * Liefert die aktuelle Config.
   */
  HK.liveUi.getCfg = function () {
    return window.General_config || {};
  };

  /**
   * Liefert Kamera-Keys sortiert (order_number bevorzugt).
   */
  HK.liveUi.getCamKeysFromCfg = function (cfg) {
    const cams = (cfg && (cfg.cameras || cfg.cameras_resolved)) || cfg || {};
    const keys = Object.keys(cams);

    keys.sort(function (a, b) {
      const oa = Number(cams[a] && cams[a].order_number);
      const ob = Number(cams[b] && cams[b].order_number);

      const na = Number.isFinite(oa);
      const nb = Number.isFinite(ob);

      if (na && nb) {
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b);
      }

      if (na !== nb) return na ? -1 : 1;

      return a.localeCompare(b);
    });

    return keys;
  };

  /**
   * Stream-Namen je Kamera (sub/main).
   */
  HK.liveUi.streamNamesFor = function (camKey) {
    return { sub: `${camKey}_sub`, main: `${camKey}_main` };
  };

  /**
   * Liefert den Stream-Typ für die Gallery.
   */
  HK.liveUi.getGalleryStreamType = function (cfg) {
    return Live.getDesiredStreamType("gallery", cfg || HK.liveUi.getCfg());
  };

  /**
   * Liefert den Stream-Typ für den Fullscreen.
   */
  HK.liveUi.getFullscreenStreamType = function (cfg) {
    return Live.getDesiredStreamType("fullscreen", cfg || HK.liveUi.getCfg());
  };

  /**
   * Startet den konfigurierten Tile-Stream einer Kamera.
   */
  HK.liveUi.startTileStream = async function (camKey, cfg) {
    const tileEl = document.querySelector(`.live-tile[data-cam="${camKey}"]`);
    const videoEl = document.getElementById(`live_${camKey}`);
    if (!tileEl || !videoEl) return null;

    const streamType = HK.liveUi.getGalleryStreamType(cfg);
    const streamName = Live.getStreamNameForCam(camKey, streamType);

    tileEl.setAttribute("data-stream-type", streamType);

    Live.applyVideoDebugAttrs(videoEl, camKey, cfg || HK.liveUi.getCfg(), "gallery");

    return Live.startGo2rtcWebRTC(streamName, videoEl, {
      storeKey: camKey,
      streamType: streamType,
      isMuted: true,
      wantAudio: false,
      tileEl: tileEl,
      timeoutMs: 20000,
      onPlaying: function () {
        const sp = tileEl.querySelector(".spinner-overlay");
        if (sp) sp.classList.add("d-none");
        tileEl.classList.remove("loading");
      }
    });
  };

  /**
   * Spinner im Modal anzeigen/ausblenden.
   */
  HK.liveUi.setLiveModalSpinner = function (show) {
    const sp = document.querySelector("#liveModal .spinner-overlay.fullscreen");
    if (!sp) return;
    sp.classList.toggle("d-none", !show);
  };

  /**
   * Mute-Icon anhand des Video-Elements synchronisieren.
   */
  HK.liveUi.syncModalMuteUI = function (videoEl) {
    const icon = document.getElementById("modalMuteIcon");
    if (!icon || !videoEl) return;
    icon.className = videoEl.muted ? "bi bi-volume-mute-fill" : "bi bi-volume-up-fill";
  };

  /**
   * Initialisiert Lautstärke- und Mute-Controls im Modal.
   */
  HK.liveUi.initModalControls = function () {
    const modalVideo = document.getElementById("modalVideo");
    const $vol = $("#modalVolume");
    const $muteBtn = $("#modalMuteBtn");

    if ($vol.length && modalVideo) {
      modalVideo.volume = parseFloat($vol.val() || "0.5");

      $vol.off("input.liveui").on("input.liveui", function () {
        modalVideo.volume = parseFloat($(this).val() || "0.5");

        if (modalVideo.volume > 0 && modalVideo.muted) {
          modalVideo.muted = false;
          HK.liveUi.syncModalMuteUI(modalVideo);
        }
      });
    }

    if ($muteBtn.length && modalVideo) {
      $muteBtn.off("click.liveui").on("click.liveui", function () {
        modalVideo.muted = !modalVideo.muted;
        HK.liveUi.syncModalMuteUI(modalVideo);
        modalVideo.play().catch(function () {});
      });
    }

    HK.liveUi.syncModalMuteUI(modalVideo);
  };

  /**
   * Öffnet das Modal für eine Kamera:
   * - stoppt ggf. bestehenden Modal-PC
   * - bei auto: stoppt vorher den Tile-PC dieser Kamera und wartet kurz
   * - bei main/sub: Tile bleibt laufen, da kein Stream-Wechsel nötig ist
   *
   * Schutz gegen Race-Conditions:
   * - _modalBusy verhindert parallele openLiveModal()-Aufrufe
   * - _modalClosing blockt Klicks während des Schließens
   * - _modalSeq bleibt als zusätzliche Absicherung erhalten
   */
  HK.liveUi.openLiveModal = async function (camKey) {
    if (HK.liveUi._modalBusy || HK.liveUi._modalClosing) {
      return;
    }

    if (Live.modalCamKey === camKey && Live.modalPC) {
      return;
    }

    HK.liveUi._modalBusy = true;

    const modalEl = document.getElementById("liveModal");
    const modalVideo = document.getElementById("modalVideo");
    const titleEl = document.getElementById("liveModalTitle");

    if (!modalEl || !modalVideo) {
      HK.liveUi._modalBusy = false;
      return;
    }

    try {
      if (!Live.GO2RTC_BASE || typeof Live.startGo2rtcWebRTC !== "function") {
        console.warn(
          HK.msg(
            "live.ui_not_ready",
            "[UI] Live not ready yet (config not loaded?)"
          )
        );
        return;
      }

      const cfg = HK.liveUi.getCfg();
      const galleryType = HK.liveUi.getGalleryStreamType(cfg);
      const fullscreenType = HK.liveUi.getFullscreenStreamType(cfg);
      const needsSwitch = galleryType !== fullscreenType;
      const streamSwitchDelayMs = Live.getStreamSwitchDelayMs(cfg);

      HK.liveUi.setLiveModalSpinner(true);

      // Sequenznummer gegen Race-Conditions (zusätzliche Absicherung)
      HK.liveUi._modalSeq = (HK.liveUi._modalSeq || 0) + 1;
      const mySeq = HK.liveUi._modalSeq;

      // Vorheriges Modal schließen
      if (Live.modalPC) {
        Live.stopPC(Live.modalPC, modalVideo);
        Live.modalPC = null;
        Live.modalCamKey = null;
        Live.modalStreamType = null;
      }

      // Default: kein Tile-Restart notwendig
      Live.modalNeedsTileRestart = false;
      Live.modalStoppedTileCamKey = null;

      // Nur wenn wirklich ein Stream-Wechsel nötig ist (auto): Tile stoppen
      if (needsSwitch) {
        const tileVideo = document.getElementById(`live_${camKey}`);
        const entry =
          Live.livePCs && typeof Live.livePCs.get === "function"
            ? Live.livePCs.get(camKey)
            : null;

        if (entry && entry.pc) {
          Live.stopPC(entry.pc, entry.videoEl || tileVideo);
          Live.livePCs.delete(camKey);
          Live.modalNeedsTileRestart = true;
          Live.modalStoppedTileCamKey = camKey;

          // Delay aus General_config, damit Recorder/go2rtc die alte Session freigeben kann
          await Live.sleep(streamSwitchDelayMs);
        }
      }

      Live.modalCamKey = camKey;
      Live.modalStreamType = fullscreenType;

      // Titel setzen
      if (titleEl) {
        const titleTxt = HK.msg("live.modal_title", "Live: {cam}", { cam: camKey });
        titleEl.textContent = titleTxt;
        titleEl.setAttribute("data-key", "live.modal_title");
        titleEl.setAttribute("data-fallback", titleTxt);
      }

      bootstrap.Modal.getOrCreateInstance(modalEl).show();

      const streamName = Live.getStreamNameForCam(camKey, fullscreenType);
      Live.applyVideoDebugAttrs(modalVideo, camKey, cfg, "fullscreen");

      if (Live.DEBUG) {
        console.log("[UI] openLiveModal", {
          camKey: camKey,
          galleryType: galleryType,
          fullscreenType: fullscreenType,
          needsSwitch: needsSwitch,
          streamName: streamName,
          streamSwitchDelayMs: streamSwitchDelayMs
        });
      }

      modalVideo.muted = false;
      modalVideo.playsInline = true;
      modalVideo.autoplay = true;

      const pc = await Live.startGo2rtcWebRTC(streamName, modalVideo, {
        streamType: fullscreenType,
        isMuted: false,
        wantAudio: true,
        timeoutMs: 25000,
        onPlaying: function () {
          HK.liveUi.setLiveModalSpinner(false);
          HK.liveUi.syncModalMuteUI(modalVideo);
        }
      });

      // Wenn inzwischen ein anderer Modal-Start getriggert wurde, diesen PC sofort wieder schließen
      if (mySeq !== HK.liveUi._modalSeq) {
        if (pc) Live.stopPC(pc, modalVideo);
        return;
      }

      Live.modalPC = pc;

      modalVideo.play().catch(function () {});
      HK.liveUi.syncModalMuteUI(modalVideo);

      if (!Live.modalPC) {
        HK.liveUi.setLiveModalSpinner(false);
      }
    } finally {
      HK.liveUi._modalBusy = false;
    }
  };

  /**
   * Cleanup nach Modal-Schließen:
   * - Stoppt Modal-PC
   * - Nur bei auto: startet Tile-Stream erneut
   */
  HK.liveUi.closeLiveModalCleanup = async function () {
    const modalVideo = document.getElementById("modalVideo");

    if (Live.modalPC) {
      Live.stopPC(Live.modalPC, modalVideo);
      Live.modalPC = null;
    }

    HK.liveUi.setLiveModalSpinner(true);

    const cfg = HK.liveUi.getCfg();
    const streamSwitchDelayMs = Live.getStreamSwitchDelayMs(cfg);

    const mustRestartTile = !!Live.modalNeedsTileRestart;
    const camKey = Live.modalStoppedTileCamKey;

    Live.modalCamKey = null;
    Live.modalStreamType = null;
    Live.modalNeedsTileRestart = false;
    Live.modalStoppedTileCamKey = null;

    if (!mustRestartTile || !camKey) return;

    // Delay aus General_config nach Modal-Stop (Recorder/go2rtc Session-Freigabe)
    await Live.sleep(streamSwitchDelayMs);

    await HK.liveUi.startTileStream(camKey, cfg);
  };

  /**
   * Baut das Live-Grid (Tiles) aus der Config und startet Streams.
   */
  HK.liveUi.loadLiveGridFromCfg = async function (cfg) {
    const grid = document.getElementById("liveGrid");
    if (!grid) return;

    if (!Live.GO2RTC_BASE || typeof Live.startGo2rtcWebRTC !== "function") {
      console.warn(
        HK.msg(
          "live.ui_not_ready",
          "[UI] Live not ready yet (config not loaded?)"
        )
      );
      return;
    }

    if (typeof Live.stopAllLivePCs === "function") {
      Live.stopAllLivePCs();
    }

    grid.innerHTML = "";

    const camKeys = HK.liveUi.getCamKeysFromCfg(cfg);

    if (typeof Live.setGridLayout === "function") {
      Live.setGridLayout(camKeys.length);
    }

    for (const camKey of camKeys) {
      const streamType = HK.liveUi.getGalleryStreamType(cfg);

      if (Live.DEBUG) {
        console.log("[UI] start tile", { camKey: camKey, streamType: streamType });
      }

      const tLoading = HK.msg("live.loading", "Loading...");
      const tOffline = HK.msg("live.status_offline", "OFFLINE");

      grid.insertAdjacentHTML(
        "beforeend",
        `
        <div class="live-tile position-relative loading offline"
             data-cam="${camKey}"
             data-stream-type="${streamType}">
          <div class="spinner-overlay d-flex justify-content-center align-items-center">
            <div class="spinner-border text-light" role="status">
              <span class="visually-hidden"
                    data-key="live.loading"
                    data-fallback="${tLoading}">${tLoading}</span>
            </div>
          </div>

          <video id="live_${camKey}" autoplay muted playsinline></video>
          <div class="live-status"
               data-key="live.status_offline"
               data-fallback="${tOffline}">${tOffline}</div>
        </div>
      `
      );

      const $tileEl = $(grid).find(`.live-tile[data-cam="${camKey}"]`);

      if ($tileEl.length) {
        $tileEl.off("click.liveui").on("click.liveui", function () {
          const now = Date.now();

          // Mehrfachklick / Doppelklick kurz hintereinander ignorieren
          if (
            now - (HK.liveUi._lastModalClickTs || 0) <
            (HK.liveUi._modalClickCooldownMs || 400)
          ) {
            return;
          }

          // Während Öffnen/Schließen keine neuen Opens zulassen
          if (HK.liveUi._modalBusy || HK.liveUi._modalClosing) {
            return;
          }

          HK.liveUi._lastModalClickTs = now;

          HK.liveUi.openLiveModal(camKey).catch(function (err) {
            console.error("[UI] openLiveModal failed:", err);
          });
        });
      }

      await HK.liveUi.startTileStream(camKey, cfg);

      // Kleines Delay, um go2rtc nicht mit parallel-starts zu fluten
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
    }

    // Optional: Falls deine i18n-Engine nach DOM-Injection angewandt werden soll
    if (typeof HK.applyLanguageToDom === "function") {
      HK.applyLanguageToDom(window.CurrentLang || HK.defaultLang || "de");
    }
  };

  /**
   * Initialisiert Live UI:
   * - Modal Controls
   * - Reagiert auf Config-Loaded Event und baut Grid
   * - Modal Events: hide => Sofort-Stop, hidden => Cleanup, shown => Icon Sync
   * - beforeunload/pagehide/visibilitychange => Stop aller PCs
   */
  HK.liveUi.init = function () {
    // Klick-/Modal-Schutz
    HK.liveUi._modalBusy = false;
    HK.liveUi._modalClosing = false;
    HK.liveUi._lastModalClickTs = 0;
    HK.liveUi._modalClickCooldownMs = 400;
    HK.liveUi._modalSeq = 0;

    HK.liveUi.initModalControls();
    HK.liveUi.setLiveModalSpinner(true);

    $(document).on("generalConfigLoaded", async function (_, cfg) {
      await HK.liveUi.loadLiveGridFromCfg(cfg);

      const $modalEl = $("#liveModal");
      if ($modalEl.length) {
        $modalEl.off("hide.bs.modal.liveui");
        $modalEl.off("hidden.bs.modal.liveui");
        $modalEl.off("shown.bs.modal.liveui");

        // Sofort beim Start des Schließens stoppen (nicht erst nach Animation)
        $modalEl.on("hide.bs.modal.liveui", function () {
          HK.liveUi._modalClosing = true;

          const modalVideo = document.getElementById("modalVideo");
          if (Live.modalPC) {
            Live.stopPC(Live.modalPC, modalVideo);
            Live.modalPC = null;
          }
        });

        $modalEl.on("hidden.bs.modal.liveui", function () {
          HK.liveUi.closeLiveModalCleanup()
            .catch(function () {})
            .finally(function () {
              HK.liveUi._modalClosing = false;
              HK.liveUi._modalBusy = false;
            });
        });

        $modalEl.on("shown.bs.modal.liveui", function () {
          HK.liveUi.syncModalMuteUI(document.getElementById("modalVideo"));
        });
      }
    });

    $(window).on("beforeunload.liveui pagehide.liveui", function () {
      const modalVideo = document.getElementById("modalVideo");
      if (Live.modalPC) Live.stopPC(Live.modalPC, modalVideo);
      if (typeof Live.stopAllLivePCs === "function") Live.stopAllLivePCs();
    });

    // optional: wenn Tab in Hintergrund geht, lieber hart stoppen (verhindert "hängende" Sessions)
    $(document).on("visibilitychange.liveui", function () {
      if (document.visibilityState !== "hidden") return;

      const modalVideo = document.getElementById("modalVideo");
      if (Live.modalPC) Live.stopPC(Live.modalPC, modalVideo);
      if (typeof Live.stopAllLivePCs === "function") Live.stopAllLivePCs();
    });
  };

  $(function () {
    HK.liveUi.init();
  });

})(jQuery);