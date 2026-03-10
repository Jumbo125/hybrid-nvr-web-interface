/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Datei: app/static/js/config.js
 * Zweck:
 * - Lädt /api/config und schreibt es in window.General_config / HK.General_config
 * - Normalisiert Kameras auf live_* und record_* Felder
 * - Übernimmt ffmpeg.windows / ffmpeg.linux in die General Config
 * - Setzt UI-Titel/Farbe und befüllt Kamera-Dropdown
 * - Schaltet #uiPsutil je nach Config sichtbar/unsichtbar
 * - Wendet live_gallery_object_fit per CSS-Klasse auf die Live-Galerie an
 * - Triggert ein Event "generalConfigLoaded" für andere Module
 *
 * i18n:
 * - Statische Texte laufen über HK.msg(...)
 * - Für UI-Titel wird zusätzlich data-key verwendet, damit der Titel auch per Lang-Engine gesetzt werden kann,
 *   wenn cfg.ui.header leer ist.
 */

/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  /**
   * Minimaler Fallback für HK.msg, falls im Projekt noch nicht vorhanden.
   * Erwartet window.Lang[langCode][key].
   */
  if (typeof HK.msg !== "function") {
    HK.defaultLang = HK.defaultLang || "de";
    HK.msg = function (key, defaultText, vars, langCode) {
      const lang = langCode || window.CurrentLang || HK.defaultLang || "de";
      const dict =
        (window.Lang && (window.Lang[lang] || window.Lang[HK.defaultLang])) || {};

      let txt = (dict && dict[key]) || defaultText || key;

      if (vars && typeof vars === "object") {
        Object.keys(vars).forEach(function (k) {
          const val = String(vars[k]);
          txt = txt.replace(new RegExp("\\{" + k + "\\}", "g"), val);
        });
      }

      return txt;
    };
  }

  if (typeof HK.escapeHtml !== "function") {
    HK.escapeHtml = function (s) {
      return String(s ?? "").replace(/[&<>"']/g, function (c) {
        return ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[c];
      });
    };
  }

  HK.normalizeObjectFit =
    HK.normalizeObjectFit ||
    function (value, fallbackValue) {
      const fb = fallbackValue || "cover";
      const v = String(value || fb).trim().toLowerCase();
      return ["contain", "cover", "fill"].includes(v) ? v : fb;
    };

  window.General_config = window.General_config || {};
  HK.General_config = window.General_config;

  /**
   * Normalisiert einen Kamera-Eintrag auf getrennte live_* / record_* Felder.
   * Bleibt kompatibel zu alter Struktur mit ip/rtsp_port/main/sub.
   */
  HK.normalizeCameraEntry =
    HK.normalizeCameraEntry ||
    function (cam) {
      const src = Object.assign({}, cam || {});

      const liveIp = String(
        src.live_ip != null ? src.live_ip : (src.ip != null ? src.ip : "")
      ).trim();

      const liveRtspPortRaw =
        src.live_rtsp_port != null ? src.live_rtsp_port : src.rtsp_port;
      const liveRtspPort = parseInt(liveRtspPortRaw || "554", 10);

      const liveMain = String(
        src.live_main != null ? src.live_main : (src.main != null ? src.main : "")
      ).trim();

      const liveSub = String(
        src.live_sub != null ? src.live_sub : (src.sub != null ? src.sub : "")
      ).trim();

      const recordIp = String(
        src.record_ip != null
          ? src.record_ip
          : (src.nvr_ip != null
              ? src.nvr_ip
              : (src.ip != null ? src.ip : ""))
      ).trim();

      const recordRtspPortRaw =
        src.record_rtsp_port != null
          ? src.record_rtsp_port
          : (src.nvr_rtsp_port != null ? src.nvr_rtsp_port : liveRtspPort);

      const recordRtspPort = parseInt(recordRtspPortRaw || liveRtspPort || "554", 10);

      const recordMain = String(
        src.record_main != null
          ? src.record_main
          : (src.nvr_main != null
              ? src.nvr_main
              : (src.main != null ? src.main : ""))
      ).trim();

      const recordSub = String(
        src.record_sub != null
          ? src.record_sub
          : (src.nvr_sub != null
              ? src.nvr_sub
              : (src.sub != null ? src.sub : ""))
      ).trim();

      const out = Object.assign({}, src, {
        live_ip: liveIp,
        live_rtsp_port: Number.isFinite(liveRtspPort) ? liveRtspPort : 554,
        live_main: liveMain,
        live_sub: liveSub,

        record_ip: recordIp || liveIp,
        record_rtsp_port: Number.isFinite(recordRtspPort)
          ? recordRtspPort
          : (Number.isFinite(liveRtspPort) ? liveRtspPort : 554),
        record_main: recordMain || liveMain,
        record_sub: recordSub || liveSub
      });

      // Legacy-Aliase: alter Code darf weiter mit ip/main/sub arbeiten.
      out.ip = out.live_ip;
      out.rtsp_port = out.live_rtsp_port;
      out.main = out.live_main;
      out.sub = out.live_sub;

      return out;
    };

  HK.normalizeCameraMap =
    HK.normalizeCameraMap ||
    function (mapObj) {
      const src = mapObj || {};
      const out = {};

      Object.keys(src).forEach(function (id) {
        out[id] = HK.normalizeCameraEntry(src[id] || {});
      });

      return out;
    };

  /**
   * Normalisiert die gesamte Config.
   */
  HK.normalizeGeneralConfig =
    HK.normalizeGeneralConfig ||
    function (cfg) {
      const out = Object.assign({}, cfg || {});

      out.cameras = HK.normalizeCameraMap(out.cameras || {});

      if (out.cameras_resolved) {
        out.cameras_resolved = HK.normalizeCameraMap(out.cameras_resolved || {});
      }

      out.ffmpeg = Object.assign(
        {
          windows: "C:/Hikvison/ffmpeg/win/ffmpeg.exe",
          linux: "/home/user/Schreibtisch/Hikvison/ffmpeg/linux/ffmpeg"
        },
        out.ffmpeg || {}
      );

      return out;
    };

  /**
   * Liefert normalisierte Live-Daten einer Kamera.
   */
  HK.getCameraLive =
    HK.getCameraLive ||
    function (cam) {
      const c = HK.normalizeCameraEntry(cam || {});
      return {
        ip: c.live_ip,
        rtsp_port: c.live_rtsp_port,
        main: c.live_main,
        sub: c.live_sub
      };
    };

  /**
   * Liefert normalisierte Record-Daten einer Kamera.
   */
  HK.getCameraRecord =
    HK.getCameraRecord ||
    function (cam) {
      const c = HK.normalizeCameraEntry(cam || {});
      return {
        ip: c.record_ip,
        rtsp_port: c.record_rtsp_port,
        main: c.record_main,
        sub: c.record_sub
      };
    };

  /**
   * Fügt die benötigten CSS-Regeln für die Live-Galerie einmalig ein.
   */
  HK.ensureLiveGalleryFitStyles =
    HK.ensureLiveGalleryFitStyles ||
    function () {
      if (document.getElementById("hk-live-gallery-fit-style")) return;

      const style = document.createElement("style");
      style.id = "hk-live-gallery-fit-style";
      style.textContent = [
        "#liveGrid video { width: 100%; height: 100%; }",
        "#liveGrid.hk-live-fit-contain video { object-fit: contain; }",
        "#liveGrid.hk-live-fit-cover video { object-fit: cover; }",
        "#liveGrid.hk-live-fit-fill video { object-fit: fill; }"
      ].join("\n");

      document.head.appendChild(style);
    };

  /**
   * Wendet die Live-Galerie-Darstellung über Klassen auf #liveGrid an.
   */
  HK.applyLiveGalleryFitClass =
    HK.applyLiveGalleryFitClass ||
    function (value) {
      const fit = HK.normalizeObjectFit(value, "cover");
      HK.liveGalleryObjectFit = fit;

      HK.ensureLiveGalleryFitStyles();

      const $grid = $("#liveGrid");
      if ($grid.length) {
        $grid
          .removeClass("hk-live-fit-contain hk-live-fit-cover hk-live-fit-fill")
          .addClass("hk-live-fit-" + fit)
          .css("--hk-live-gallery-object-fit", fit);
      }

      $("#liveGrid video").css("object-fit", "");
      return fit;
    };

  /**
   * Setzt UI Titel / Browser-Titel aus Config.
   * Falls cfg.ui.header fehlt/leer ist, wird ein i18n-Fallback verwendet.
   */
  HK.setUiTitleFromConfig = function (cfg) {
    const fallbackHeader = HK.msg("ui.header", "Hybrid NVR");

    const header =
      cfg &&
      cfg.ui &&
      typeof cfg.ui.header === "string" &&
      cfg.ui.header.trim()
        ? cfg.ui.header.trim()
        : fallbackHeader;

    const $uiTitle = $("#uiTitle");
    if ($uiTitle.length) {
      if (
        !(cfg && cfg.ui && typeof cfg.ui.header === "string" && cfg.ui.header.trim())
      ) {
        $uiTitle.attr("data-key", "ui.header");
        $uiTitle.attr("data-fallback", fallbackHeader);
      } else {
        $uiTitle.removeAttr("data-key").removeAttr("data-fallback");
      }

      $uiTitle.text(header);
    }

    document.title = header;

    if (cfg && cfg.ui && typeof cfg.ui.color === "string" && cfg.ui.color.trim()) {
      if ($uiTitle.length) $uiTitle.css("color", cfg.ui.color.trim());
    }
  };

  /**
   * Blendet die PC-Auslastung im Header ein/aus.
   * Standard: sichtbar, außer cfg.ui.show_psutil === false
   */
  HK.applyPsutilVisibilityFromConfig = function (cfg) {
    const $ps = $("#uiPsutil");
    if (!$ps.length) return;

    const show = !cfg || !cfg.ui || cfg.ui.show_psutil !== false;
    $ps.css("display", show ? "inline-block" : "none");
  };

  /**
   * Wendet object-fit für die Live-Galerie an.
   * Standard: cover
   */
  HK.applyLiveGalleryObjectFitFromConfig = function (cfg) {
    HK.applyLiveGalleryFitClass(
      cfg && cfg.ui && cfg.ui.live_gallery_object_fit
    );
  };

  /**
   * Befüllt das Kamera-Dropdown aus der Config.
   * Hinweis: /api/config liefert KEIN username/password (serverseitig entfernt).
   */
  HK.populateCameraSelectFromConfig = function (cfg) {
    const cams = (cfg && (cfg.cameras_resolved || cfg.cameras)) || {};
    const $sel = $("#cameraSelect");
    if (!$sel.length) return;

    $sel.empty();

    Object.keys(cams).forEach(function (id) {
      const cam = HK.normalizeCameraEntry(cams[id] || {});
      const name = cam && cam.name ? cam.name : id;
      const safeId = HK.escapeHtml(id);
      const safeName = HK.escapeHtml(name);
      $sel.append(`<option value="${safeId}">${safeName}</option>`);
    });
  };

  /**
   * Hauptfunktion: Config laden
   */
  HK.loadGeneralConfig = function () {
    return $.ajax({
      url: "/api/config",
      method: "GET",
      cache: false,
      dataType: "json",
      timeout: 8000
    })
      .done(function (rawCfg) {
        const cfg = HK.normalizeGeneralConfig(rawCfg || {});

        window.General_config = cfg;
        HK.General_config = cfg;

        HK.setUiTitleFromConfig(cfg);
        HK.applyPsutilVisibilityFromConfig(cfg);
        HK.applyLiveGalleryObjectFitFromConfig(cfg);
        HK.populateCameraSelectFromConfig(cfg);

        $(document).trigger("generalConfigLoaded", [cfg]);
      })
      .fail(function (xhr, status, err) {
        console.error("[config] load failed:", status, err, xhr.responseText);
      });
  };

  $(function () {
    HK.ensureLiveGalleryFitStyles();

    $("#refresh_btn").on("click", function () {
      window.location.reload();
    });
  });

})(jQuery);