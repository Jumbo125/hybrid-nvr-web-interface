/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Hinweis:
 * - Alle UI-Texte laufen über HK.msg(...) und sind damit i18n-fähig.
 * - Für dynamisch erzeugtes HTML wird zusätzlich data-key gesetzt, damit eine nachträgliche Re-Übersetzung möglich ist.
 */

/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  HK.cfgModal = null;
  HK.camSortable = null;

  /**
   * Zeigt eine Status-/Fehlermeldung im Config-Alert an.
   */
  HK.showCfgAlert = function (msg) {
    const $a = $("#cfgAlert");
    $a.removeClass("d-none").text(msg);
  };

  /**
   * Blendet den Config-Alert aus und leert den Inhalt.
   */
  HK.hideCfgAlert = function () {
    $("#cfgAlert").addClass("d-none").text("");
  };

  /**
   * Lädt die aktuelle Konfiguration vom Backend.
   */
  HK.getCfg = function () {
    return $.ajax({
      url: "/api/config",
      method: "GET",
      cache: false,
      dataType: "json",
      timeout: 8000
    });
  };

  /**
   * Setzt den Wert eines Inputs, falls vorhanden.
   */
  HK.setVal = function (id, v) {
    const $el = $(id);
    if (!$el.length) return;
    $el.val(v == null ? "" : v);
  };

  /**
   * Setzt den Checked-Status einer Checkbox, falls vorhanden.
   */
  HK.setChk = function (id, v) {
    const $el = $(id);
    if (!$el.length) return;
    $el.prop("checked", !!v);
  };

  /**
   * Setzt eine Radio-Button-Gruppe anhand ihres Namens.
   */
  HK.setRadioByName = function (name, value, fallbackValue) {
    const v = String(value || fallbackValue || "").trim().toLowerCase();
    const allowed = new Set(["auto", "main", "sub"]);
    const finalValue = allowed.has(v) ? v : (fallbackValue || "auto");

    $(`input[name="${name}"]`).prop("checked", false);
    $(`input[name="${name}"][value="${finalValue}"]`).prop("checked", true);
  };

  /**
   * Liest den selektierten Wert einer Radio-Button-Gruppe.
   */
  HK.getRadioByName = function (name, fallbackValue) {
    const v = String($(`input[name="${name}"]:checked`).val() || fallbackValue || "")
      .trim()
      .toLowerCase();

    return ["auto", "main", "sub"].includes(v) ? v : (fallbackValue || "auto");
  };

  /**
   * Setzt den Wert eines <select>. Falls Option noch nicht existiert,
   * kann sie optional angelegt werden.
   */
  HK.setSelectVal = function (id, v, createIfMissing, triggerChange) {
    const $el = $(id);
    if (!$el.length) return;

    const val = v == null ? "" : String(v);

    if (createIfMissing == null) createIfMissing = false;
    if (triggerChange == null) triggerChange = false;

    if (!$el.is("select")) {
      $el.val(val);
      return;
    }

    if (createIfMissing && val !== "") {
      let exists = false;
      $el.find("option").each(function () {
        if (this.value === val) {
          exists = true;
          return false;
        }
      });

      if (!exists) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        $el.append(opt);
      }
    }

    $el.val(val);

    if (triggerChange) $el.trigger("change");
  };

  HK.normalizeObjectFit =
    HK.normalizeObjectFit ||
    function (value, fallbackValue) {
      const fb = fallbackValue || "cover";
      const v = String(value || fb).trim().toLowerCase();
      return ["contain", "cover", "fill"].includes(v) ? v : fb;
    };

  /**
   * Escaped HTML, um XSS/HTML-Injection zu vermeiden.
   */
  HK.escapeHtml =
    HK.escapeHtml ||
    function (s) {
      return String(s ?? "").replace(/[&<>"']/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
      });
    };

  /**
   * Baut ein Kamera-Objekt für die UI, ohne sensible Felder.
   * Normalisiert auf getrennte live_* / record_* Felder.
   */
  HK.camerasForSettingsUi = function (cfg) {
    const base = cfg && cfg.cameras ? cfg.cameras : {};
    const resolved = cfg && cfg.cameras_resolved ? cfg.cameras_resolved : null;

    const normalizeCam = function (cam) {
      const src = Object.assign({}, cam || {});

      const live_ip = String(
        src.live_ip != null ? src.live_ip : (src.ip != null ? src.ip : "")
      ).trim();

      const live_rtsp_port = parseInt(
        src.live_rtsp_port != null ? src.live_rtsp_port : (src.rtsp_port != null ? src.rtsp_port : 554),
        10
      );

      const live_main = String(
        src.live_main != null ? src.live_main : (src.main != null ? src.main : "")
      ).trim();

      const live_sub = String(
        src.live_sub != null ? src.live_sub : (src.sub != null ? src.sub : "")
      ).trim();

      const record_ip = String(
        src.record_ip != null ? src.record_ip : live_ip
      ).trim();

      const record_rtsp_port = parseInt(
        src.record_rtsp_port != null ? src.record_rtsp_port : live_rtsp_port,
        10
      );

      const record_main = String(
        src.record_main != null ? src.record_main : live_main
      ).trim();

      const record_sub = String(
        src.record_sub != null ? src.record_sub : live_sub
      ).trim();

      const out = Object.assign({}, src, {
        live_ip: live_ip,
        live_rtsp_port: Number.isFinite(live_rtsp_port) ? live_rtsp_port : 554,
        live_main: live_main,
        live_sub: live_sub,
        record_ip: record_ip || live_ip,
        record_rtsp_port: Number.isFinite(record_rtsp_port) ? record_rtsp_port : 554,
        record_main: record_main || live_main,
        record_sub: record_sub || live_sub
      });

      // Legacy-Aliase weiter auf Live zeigen lassen
      out.ip = out.live_ip;
      out.rtsp_port = out.live_rtsp_port;
      out.main = out.live_main;
      out.sub = out.live_sub;

      delete out.username;
      delete out.password;

      return out;
    };

    if (!resolved) {
      const out = {};
      Object.keys(base).forEach(function (id) {
        out[id] = normalizeCam(base[id] || {});
      });
      return out;
    }

    const out = {};
    const ids = new Set([].concat(Object.keys(base), Object.keys(resolved)));

    ids.forEach(function (id) {
      const b = base[id] || {};
      const r = resolved[id] || {};
      const merged = Object.assign({}, b, r);

      if (merged.order_number == null && b.order_number != null) {
        merged.order_number = b.order_number;
      }

      out[id] = normalizeCam(merged);
    });

    return out;
  };

  /**
   * Setzt Order-Nummern anhand der DOM-Reihenfolge (1..n).
   */
  HK.renumberOrders = function () {
    const $items = $("#cfgCameraAccordion .cfg-cam-item");
    $items.each(function (i) {
      $(this).attr("data-cam-idx", i);
      $(this).find(".cfg_cam_order").val(i + 1);
    });
  };

  /**
   * Initialisiert SortableJS für die Kamera-Liste.
   */
  HK.initCameraSortable = function () {
    const el = document.getElementById("cfgCameraAccordion");
    if (!el) return;

    if (HK.camSortable && typeof HK.camSortable.destroy === "function") {
      HK.camSortable.destroy();
      HK.camSortable = null;
    }

    if (!window.Sortable) {
      console.warn(
        HK.msg(
          "cfg.sortable_missing",
          "SortableJS nicht geladen. Bitte Script-Tag einbinden."
        )
      );
      return;
    }

    HK.camSortable = window.Sortable.create(el, {
      animation: 150,
      handle: ".cfg-drag-handle",
      draggable: ".cfg-cam-item",
      ghostClass: "cfg-sort-ghost",
      chosenClass: "cfg-sort-chosen",
      dragClass: "cfg-sort-drag",
      onEnd: function () {
        HK.renumberOrders();
      }
    });
  };

  /**
   * Baut das HTML für einen Kamera-Accordion-Item.
   */
  HK.cameraItemHtml = function (camId, camObj, idx, isNew) {
    const safeId = "cam_" + idx + "_" + Math.random().toString(16).slice(2);
    const collapseId = "cfgCamCollapse_" + safeId;
    const headerId = "cfgCamHead_" + safeId;

    const name = camObj.name || camId;

    const liveIp = camObj.live_ip || camObj.ip || "";
    const liveRtsp = camObj.live_rtsp_port ?? camObj.rtsp_port ?? 554;
    const liveMain = camObj.live_main || camObj.main || "";
    const liveSub = camObj.live_sub || camObj.sub || "";

    const recordIp = camObj.record_ip || liveIp || "";
    const recordRtsp = camObj.record_rtsp_port ?? liveRtsp ?? 554;
    const recordMain = camObj.record_main || liveMain || "";
    const recordSub = camObj.record_sub || liveSub || "";

    const uSet = !!camObj.username_set;
    const pSet = !!camObj.password_set;

    const orderNumber = camObj.order_number ?? (idx + 1);

    const tDragSortTitle = HK.msg("cfg.drag_sort_title", "Ziehen zum Sortieren");
    const tBadgeUserSet = HK.msg("cfg.badge_user_set", "User gesetzt");
    const tBadgePassSet = HK.msg("cfg.badge_pass_set", "Pass gesetzt");

    const tLabelCamId = HK.msg("cfg.label_cam_id", "Kamera ID");
    const tHelpCamIdFixed = HK.msg(
      "cfg.help_cam_id_fixed",
      "ID bestehender Kameras ist fix (Rename später möglich)."
    );

    const tLabelName = HK.msg("cfg.label_name", "Name");
    const tLabelOrder = HK.msg("cfg.label_order", "Reihenfolge");
    const tHelpOrder = HK.msg("cfg.help_order_dragdrop", "Reihenfolge (Drag & Drop)");

    const tSectionLive = HK.msg("cfg.section_live", "Live (Direktkamera)");
    const tSectionRecord = HK.msg("cfg.section_record", "Record / Playback (NVR)");

    const tLabelLiveIp = HK.msg("cfg.label_live_ip", "Live IP");
    const tLabelLiveRtsp = HK.msg("cfg.label_live_rtsp_port", "Live RTSP Port");
    const tLabelLiveMain = HK.msg("cfg.label_live_main", "Live Track Main");
    const tLabelLiveSub = HK.msg("cfg.label_live_sub", "Live Track Sub");

    const tLabelRecordIp = HK.msg("cfg.label_record_ip", "Record IP");
    const tLabelRecordRtsp = HK.msg("cfg.label_record_rtsp_port", "Record RTSP Port");
    const tLabelRecordMain = HK.msg("cfg.label_record_main", "Record Track Main");
    const tLabelRecordSub = HK.msg("cfg.label_record_sub", "Record Track Sub");

    const tLabelUserKeep = HK.msg(
      "cfg.label_username_keep",
      "Username (leer lassen = behalten)"
    );
    const tLabelPassKeep = HK.msg(
      "cfg.label_password_keep",
      "Password (leer lassen = behalten)"
    );

    const tPhSetNotShown = HK.msg("cfg.placeholder_set_not_shown", "gesetzt (nicht angezeigt)");
    const tPhNotSet = HK.msg("cfg.placeholder_not_set", "nicht gesetzt");

    const tBtnRemove = HK.msg("cfg.btn_remove", "Entfernen");

    const userPh = uSet ? tPhSetNotShown : tPhNotSet;
    const passPh = pSet ? tPhSetNotShown : tPhNotSet;

    return `
      <div class="accordion-item bg-dark border-secondary cfg-cam-item" data-cam-idx="${idx}">
        <h2 class="accordion-header d-flex align-items-stretch" id="${headerId}">
          <div class="cfg-drag-handle d-flex align-items-center px-2 text-secondary"
               title="${HK.escapeHtml(tDragSortTitle)}" role="button" tabindex="0"
               data-key="cfg.drag_sort_title" data-attr="title" data-fallback="${HK.escapeHtml(tDragSortTitle)}">
            <i class="bi bi-grip-vertical"></i>
          </div>

          <button class="accordion-button collapsed bg-dark text-light border-secondary flex-grow-1" type="button"
                  data-bs-toggle="collapse" data-bs-target="#${collapseId}">
            <div class="d-flex w-100 justify-content-between align-items-center">
              <div>
                <strong>${HK.escapeHtml(camId)}</strong> <span class="text-secondary">(${HK.escapeHtml(name)})</span>
              </div>
              <div class="d-flex gap-2">
                ${uSet
        ? `<span class="badge bg-secondary" data-key="cfg.badge_user_set" data-fallback="${HK.escapeHtml(tBadgeUserSet)}">${HK.escapeHtml(tBadgeUserSet)}</span>`
        : ""}
                ${pSet
        ? `<span class="badge bg-secondary" data-key="cfg.badge_pass_set" data-fallback="${HK.escapeHtml(tBadgePassSet)}">${HK.escapeHtml(tBadgePassSet)}</span>`
        : ""}
              </div>
            </div>
          </button>
        </h2>

        <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#cfgCameraAccordion">
          <div class="accordion-body text-white">

            <div class="row g-2 mb-2">
              <div class="col-12 col-md-3">
                <label class="form-label" data-key="cfg.label_cam_id" data-fallback="${HK.escapeHtml(tLabelCamId)}">${HK.escapeHtml(tLabelCamId)}</label>
                <input class="form-control cfg_cam_id" type="text" value="${HK.escapeHtml(camId)}" ${isNew ? "" : "readonly"}>
                ${isNew
        ? ""
        : `<div class="small text-secondary" data-key="cfg.help_cam_id_fixed" data-fallback="${HK.escapeHtml(tHelpCamIdFixed)}">${HK.escapeHtml(tHelpCamIdFixed)}</div>`}
              </div>

              <div class="col-12 col-md-3">
                <label class="form-label" data-key="cfg.label_name" data-fallback="${HK.escapeHtml(tLabelName)}">${HK.escapeHtml(tLabelName)}</label>
                <input class="form-control cfg_cam_name" type="text" value="${HK.escapeHtml(name)}">
              </div>

              <div class="col-12 col-md-3">
                <label class="form-label" data-key="cfg.label_order" data-fallback="${HK.escapeHtml(tLabelOrder)}">${HK.escapeHtml(tLabelOrder)}</label>
                <input class="form-control cfg_cam_order" type="number" min="1" value="${HK.escapeHtml(orderNumber)}" readonly>
                <div class="small text-secondary" data-key="cfg.help_order_dragdrop" data-fallback="${HK.escapeHtml(tHelpOrder)}">${HK.escapeHtml(tHelpOrder)}</div>
              </div>

              <div class="col-12 col-md-3"></div>
            </div>

            <div class="border rounded border-secondary p-2 mb-3">
              <div class="fw-semibold mb-2" data-key="cfg.section_live" data-fallback="${HK.escapeHtml(tSectionLive)}">${HK.escapeHtml(tSectionLive)}</div>

              <div class="row g-2">
                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_live_ip" data-fallback="${HK.escapeHtml(tLabelLiveIp)}">${HK.escapeHtml(tLabelLiveIp)}</label>
                  <input class="form-control cfg_cam_live_ip" type="text" value="${HK.escapeHtml(liveIp)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_live_rtsp_port" data-fallback="${HK.escapeHtml(tLabelLiveRtsp)}">${HK.escapeHtml(tLabelLiveRtsp)}</label>
                  <input class="form-control cfg_cam_live_rtsp" type="number" min="1" max="65535" value="${HK.escapeHtml(liveRtsp)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_live_main" data-fallback="${HK.escapeHtml(tLabelLiveMain)}">${HK.escapeHtml(tLabelLiveMain)}</label>
                  <input class="form-control cfg_cam_live_main" type="text" value="${HK.escapeHtml(liveMain)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_live_sub" data-fallback="${HK.escapeHtml(tLabelLiveSub)}">${HK.escapeHtml(tLabelLiveSub)}</label>
                  <input class="form-control cfg_cam_live_sub" type="text" value="${HK.escapeHtml(liveSub)}">
                </div>
              </div>
            </div>

            <div class="border rounded border-secondary p-2 mb-3">
              <div class="fw-semibold mb-2" data-key="cfg.section_record" data-fallback="${HK.escapeHtml(tSectionRecord)}">${HK.escapeHtml(tSectionRecord)}</div>

              <div class="row g-2">
                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_record_ip" data-fallback="${HK.escapeHtml(tLabelRecordIp)}">${HK.escapeHtml(tLabelRecordIp)}</label>
                  <input class="form-control cfg_cam_record_ip" type="text" value="${HK.escapeHtml(recordIp)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_record_rtsp_port" data-fallback="${HK.escapeHtml(tLabelRecordRtsp)}">${HK.escapeHtml(tLabelRecordRtsp)}</label>
                  <input class="form-control cfg_cam_record_rtsp" type="number" min="1" max="65535" value="${HK.escapeHtml(recordRtsp)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_record_main" data-fallback="${HK.escapeHtml(tLabelRecordMain)}">${HK.escapeHtml(tLabelRecordMain)}</label>
                  <input class="form-control cfg_cam_record_main" type="text" value="${HK.escapeHtml(recordMain)}">
                </div>

                <div class="col-12 col-md-3">
                  <label class="form-label" data-key="cfg.label_record_sub" data-fallback="${HK.escapeHtml(tLabelRecordSub)}">${HK.escapeHtml(tLabelRecordSub)}</label>
                  <input class="form-control cfg_cam_record_sub" type="text" value="${HK.escapeHtml(recordSub)}">
                </div>
              </div>
            </div>

            <div class="row g-2 mb-2">
              <div class="col-12 col-md-6">
                <label class="form-label" data-key="cfg.label_username_keep" data-fallback="${HK.escapeHtml(tLabelUserKeep)}">${HK.escapeHtml(tLabelUserKeep)}</label>
                <input class="form-control cfg_cam_user" type="text" value=""
                       placeholder="${HK.escapeHtml(userPh)}"
                       data-key="${uSet ? "cfg.placeholder_set_not_shown" : "cfg.placeholder_not_set"}"
                       data-attr="placeholder"
                       data-fallback="${HK.escapeHtml(userPh)}">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" data-key="cfg.label_password_keep" data-fallback="${HK.escapeHtml(tLabelPassKeep)}">${HK.escapeHtml(tLabelPassKeep)}</label>
                <input class="form-control cfg_cam_pass" type="password" value=""
                       placeholder="${HK.escapeHtml(passPh)}"
                       data-key="${uSet ? "cfg.placeholder_set_not_shown" : "cfg.placeholder_not_set"}"
                       data-attr="placeholder"
                       data-fallback="${HK.escapeHtml(passPh)}">
              </div>
            </div>

            <div class="d-flex justify-content-end">
              <button type="button" class="btn btn-outline-danger btn-sm cfgRemoveCam"
                      data-key="cfg.btn_remove" data-fallback="${HK.escapeHtml(tBtnRemove)}">
                <i class="bi bi-dash-lg"></i> ${HK.escapeHtml(tBtnRemove)}
              </button>
            </div>

          </div>
        </div>
      </div>
    `;
  };

  /**
   * Rendert alle Kameras in das Accordion.
   */
  HK.renderCamerasAccordion = function (cfg) {
    const cams = cfg.cameras || {};
    const ids = Object.keys(cams);

    ids.sort(function (a, b) {
      const oa = Number(cams[a]?.order_number);
      const ob = Number(cams[b]?.order_number);

      const na = Number.isFinite(oa);
      const nb = Number.isFinite(ob);

      if (na && nb && oa !== ob) return oa - ob;
      if (na !== nb) return na ? -1 : 1;
      return a.localeCompare(b);
    });

    const $acc = $("#cfgCameraAccordion").empty();
    ids.forEach(function (camId, i) {
      $acc.append(HK.cameraItemHtml(camId, cams[camId] || {}, i, false));
    });

    HK.initCameraSortable();

    if (typeof HK.applyLang === "function") HK.applyLang();
  };

  /**
   * Befüllt das Formular aus der geladenen Konfiguration.
   */
  HK.fillForm = function (cfg) {
    HK.hideCfgAlert();

    HK.setVal("#cfg_ui_header", (cfg.ui && (cfg.ui.header || cfg.ui.Header)) || "");
    HK.setVal("#cfg_ui_color", (cfg.ui && (cfg.ui.color || cfg.ui.Color)) || "#212529");
    HK.setVal("#cfg_ui_reload", (cfg.ui && (cfg.ui.reload || cfg.ui.Reload)) || 0);
    HK.setSelectVal(
      "#cfg_ui_lang",
      (cfg.ui && cfg.ui.lang) || window.CurrentLang || HK.defaultLang || "de",
      false,
      false
    );

    HK.setRadioByName(
      "cfg_live_stream_mode",
      cfg.live && cfg.live.stream_mode,
      "auto"
    );

    HK.setChk("#cfg_record_list_thumbnail", !!(cfg.record_settings && cfg.record_settings.record_list_thumbnail));
    HK.setVal(
      "#cfg_thumb_timeout_ms",
      (cfg.record_settings &&
        (cfg.record_settings.record_thumbnails_create_timeout_ms ||
          cfg.record_settings.record_thumbnails_create_timeout)) ||
      3000
    );
    HK.setVal(
      "#cfg_thumb_frame_second",
      (cfg.record_settings && cfg.record_settings.frame_from_ms_sec) || 1000
    );

    HK.setVal("#cfg_max_jobs", (cfg.limits && cfg.limits.max_jobs) || 3);
    HK.setVal("#cfg_job_ttl", (cfg.limits && cfg.limits.job_ttl_seconds) || 1800);
    HK.setVal("#cfg_server_host", (cfg.server && cfg.server.host) || "0.0.0.0");
    HK.setVal("#cfg_server_port", (cfg.server && cfg.server.port) || 8000);
    HK.setChk("#cfg_server_reload", !!(cfg.server && cfg.server.reload));

    HK.setVal(
      "#cfg_stream_switch_delay_ms",
      cfg.live && cfg.live.stream_switch_delay_ms != null
        ? cfg.live.stream_switch_delay_ms
        : 1000
    );

    HK.setVal("#cfg_go2rtc_port", (cfg.go2rtc && cfg.go2rtc.port) || 1984);

    HK.setVal(
      "#cfg_ffmpeg_linux",
      (cfg.ffmpeg && cfg.ffmpeg.linux) || "/Schreibtisch/Hikvison/ffmpeg/linux/ffmpeg"
    );
    HK.setVal(
      "#cfg_ffmpeg_windows",
      (cfg.ffmpeg && cfg.ffmpeg.windows) || "ffmpeg/win/ffmpeg.exe"
    );

    HK.setVal(
      "#cfg_playback_retention_days",
      (cfg.record_settings && cfg.record_settings.playback_retention_days) || 7
    );

    HK.setVal(
      "#cfg_playback_temp_retention_hours",
      (cfg.record_settings && cfg.record_settings.playback_temp_retention_hours) || 2
    );

    HK.setVal(
      "#cfg_playback_cleanup_interval_seconds",
      (cfg.record_settings && cfg.record_settings.playback_cleanup_interval_seconds) || 21600
    );

    HK.setChk(
      "#cfg_ui_show_psutil",
      !cfg.ui || cfg.ui.show_psutil !== false
    );

    HK.setSelectVal(
      "#cfg_ui_live_gallery_object_fit",
      HK.normalizeObjectFit(cfg.ui && cfg.ui.live_gallery_object_fit, "cover")
    );

    HK.setChk("#cfg_slideshow_enabled", !!(cfg.slideshow && cfg.slideshow.enabled));

    HK.setVal(
      "#cfg_slideshow_image_duration",
      (cfg.slideshow && cfg.slideshow.image_duration) || 10
    );

    HK.setVal(
      "#cfg_slideshow_animation_duration",
      (cfg.slideshow && cfg.slideshow.animation_duration) || 500
    );

    const slideshowAnimations = (cfg.slideshow && Array.isArray(cfg.slideshow.animations))
      ? cfg.slideshow.animations
      : ["right"];

    HK.setChk("#cfg_slideshow_anim_right", slideshowAnimations.includes("right"));
    HK.setChk("#cfg_slideshow_anim_top", slideshowAnimations.includes("top"));
    HK.setChk("#cfg_slideshow_anim_bottom", slideshowAnimations.includes("bottom"));
    HK.setChk("#cfg_slideshow_anim_left", slideshowAnimations.includes("left"));

    HK.setChk(
      "#cfg_slideshow_random_effect",
      !!(cfg.slideshow && cfg.slideshow.random_effect)
    );

    HK.setVal(
      "#cfg_slideshow_folder",
      "slideshow/"
    );

    if (typeof HK.applyLiveGalleryFitClass === "function") {
      HK.applyLiveGalleryFitClass(cfg.ui && cfg.ui.live_gallery_object_fit);
    }

    const camsUi = HK.camerasForSettingsUi(cfg);
    HK.renderCamerasAccordion({ cameras: camsUi });
  };

  /**
   * Liest das Formular aus und baut ein Patch-Objekt.
   */
  HK.collectPatchFromForm = function () {
    const ui = {
      header: $("#cfg_ui_header").val(),
      color: $("#cfg_ui_color").val(),
      reload: $("#cfg_ui_reload").val(),
      show_psutil: $("#cfg_ui_show_psutil").is(":checked"),
      lang: $("#cfg_ui_lang").val(),
      live_gallery_object_fit: HK.normalizeObjectFit(
        $("#cfg_ui_live_gallery_object_fit").val(),
        "cover"
      )
    };

    const live = {
      stream_mode: HK.getRadioByName("cfg_live_stream_mode", "auto"),
      stream_switch_delay_ms: parseInt($("#cfg_stream_switch_delay_ms").val() || "1000", 10)
    };

    const record_settings = {
      record_list_thumbnail: $("#cfg_record_list_thumbnail").is(":checked"),
      record_thumbnails_create_timeout_ms: parseInt($("#cfg_thumb_timeout_ms").val() || "3000", 10),
      frame_from_ms_sec: parseInt($("#cfg_thumb_frame_second").val() || "1000", 10),
      playback_retention_days: parseInt($("#cfg_playback_retention_days").val() || "7", 10),
      playback_temp_retention_hours: parseInt($("#cfg_playback_temp_retention_hours").val() || "2", 10),
      playback_cleanup_interval_seconds: parseInt($("#cfg_playback_cleanup_interval_seconds").val() || "21600", 10)
    };

    const limits = {
      max_jobs: parseInt($("#cfg_max_jobs").val() || "3", 10),
      job_ttl_seconds: parseInt($("#cfg_job_ttl").val() || "1800", 10)
    };

    const server = {
      host: $("#cfg_server_host").val(),
      port: parseInt($("#cfg_server_port").val() || "8000", 10),
      reload: $("#cfg_server_reload").is(":checked")
    };

    const go2rtc = {
      port: parseInt($("#cfg_go2rtc_port").val() || "1984", 10)
    };

    const ffmpeg = {
      linux: String($("#cfg_ffmpeg_linux").val() || "").trim() || "/Schreibtisch/Hikvison/ffmpeg/linux/ffmpeg",
      windows: String($("#cfg_ffmpeg_windows").val() || "").trim() || "ffmpeg/win/ffmpeg.exe"
    };

    const slideshowAnimations = [];

    if ($("#cfg_slideshow_anim_right").is(":checked")) slideshowAnimations.push("right");
    if ($("#cfg_slideshow_anim_top").is(":checked")) slideshowAnimations.push("top");
    if ($("#cfg_slideshow_anim_bottom").is(":checked")) slideshowAnimations.push("bottom");
    if ($("#cfg_slideshow_anim_left").is(":checked")) slideshowAnimations.push("left");

    const slideshow = {
      enabled: $("#cfg_slideshow_enabled").is(":checked"),
      image_duration: parseInt($("#cfg_slideshow_image_duration").val() || "10", 10),
      animation_duration: parseInt($("#cfg_slideshow_animation_duration").val() || "500", 10),
      animations: slideshowAnimations,
      random_effect: $("#cfg_slideshow_random_effect").is(":checked"),
      folder: "slideshow/"
    };

    const cameras = {};
    const seen = new Set();

    $("#cfgCameraAccordion .cfg-cam-item").each(function () {
      const $it = $(this);

      const camId = String($it.find(".cfg_cam_id").val() || "").trim();
      if (!camId) return;

      if (seen.has(camId)) {
        throw new Error(
          HK.msg("cfg.err_duplicate_cam_id", "Doppelte Kamera ID: {id}", { id: camId })
        );
      }
      seen.add(camId);

      const live_ip = String($it.find(".cfg_cam_live_ip").val() || "").trim();
      const live_rtsp_port = parseInt($it.find(".cfg_cam_live_rtsp").val() || "554", 10);
      const live_main = String($it.find(".cfg_cam_live_main").val() || "").trim();
      const live_sub = String($it.find(".cfg_cam_live_sub").val() || "").trim();

      let record_ip = String($it.find(".cfg_cam_record_ip").val() || "").trim();
      let record_rtsp_port = parseInt($it.find(".cfg_cam_record_rtsp").val() || "", 10);
      let record_main = String($it.find(".cfg_cam_record_main").val() || "").trim();
      let record_sub = String($it.find(".cfg_cam_record_sub").val() || "").trim();

      if (!record_ip) record_ip = live_ip;
      if (!Number.isFinite(record_rtsp_port)) record_rtsp_port = live_rtsp_port;
      if (!record_main) record_main = live_main;
      if (!record_sub) record_sub = live_sub;

      const cam = {
        name: String($it.find(".cfg_cam_name").val() || "").trim() || camId,

        live_ip: live_ip,
        live_rtsp_port: Number.isFinite(live_rtsp_port) ? live_rtsp_port : 554,
        live_main: live_main,
        live_sub: live_sub,

        record_ip: record_ip,
        record_rtsp_port: Number.isFinite(record_rtsp_port) ? record_rtsp_port : 554,
        record_main: record_main,
        record_sub: record_sub
      };

      // Legacy live-Aliase für bestehenden Code
      cam.ip = cam.live_ip;
      cam.rtsp_port = cam.live_rtsp_port;
      cam.main = cam.live_main;
      cam.sub = cam.live_sub;

      const order = parseInt($it.find(".cfg_cam_order").val() || "", 10);
      if (!Number.isNaN(order)) cam.order_number = order;

      const u = String($it.find(".cfg_cam_user").val() || "").trim();
      const p = String($it.find(".cfg_cam_pass").val() || "").trim();
      if (u) cam.username = u;
      if (p) cam.password = p;

      cameras[camId] = cam;
    });

    Object.keys(cameras).forEach(function (id) {
      const cam = cameras[id];

      if (!cam.live_ip) {
        throw new Error(
          HK.msg("cfg.err_cam_live_ip_missing", "Live-IP fehlt bei Kamera: {id}", { id: id })
        );
      }

      if (!cam.live_main) {
        throw new Error(
          HK.msg("cfg.err_cam_live_main_missing", "Live main Track fehlt bei Kamera: {id}", { id: id })
        );
      }

      if (!cam.record_ip) {
        throw new Error(
          HK.msg("cfg.err_cam_record_ip_missing", "Record-IP fehlt bei Kamera: {id}", { id: id })
        );
      }

      if (!cam.record_main) {
        throw new Error(
          HK.msg("cfg.err_cam_record_main_missing", "Record main Track fehlt bei Kamera: {id}", { id: id })
        );
      }
    });

    return { ui, live, record_settings, limits, server, go2rtc, ffmpeg, slideshow, cameras };
  };

  /**
   * Speichert das Patch-Objekt via PATCH /api/config.
   */
  HK.savePatch = function (patchObj) {
    return $.ajax({
      url: "/api/config",
      method: "PATCH",
      contentType: "application/json; charset=utf-8",
      dataType: "json",
      data: JSON.stringify(patchObj),
      timeout: 15000
    });
  };

  /**
   * Fügt eine neue Kamera-UI-Box hinzu.
   */
  HK.addNewCamera = function () {
    const $acc = $("#cfgCameraAccordion");
    const idx = $acc.find(".cfg-cam-item").length;
    const camId = "cam_new" + (idx + 1);

    let maxOrder = 0;
    $acc.find(".cfg_cam_order").each(function () {
      const v = parseInt($(this).val() || "", 10);
      if (!Number.isNaN(v)) maxOrder = Math.max(maxOrder, v);
    });

    const camObj = {
      name: camId,

      live_ip: "",
      live_rtsp_port: 554,
      live_main: "",
      live_sub: "",

      record_ip: "",
      record_rtsp_port: 554,
      record_main: "",
      record_sub: "",

      order_number: maxOrder + 1
    };

    $acc.append(HK.cameraItemHtml(camId, camObj, idx, true));

    HK.renumberOrders();
    HK.initCameraSortable();

    if (typeof HK.applyLang === "function") HK.applyLang();
  };

  $(function () {
    const modalEl = document.getElementById("configModal");
    if (!modalEl) return;

    HK.cfgModal = new bootstrap.Modal(modalEl);

    $("#cfgCameraAccordion").on("click", ".cfg-drag-handle", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });

    $("#cfgCameraAccordion").on("keydown", ".cfg-drag-handle", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    $("#openConfig").on("click", function () {
      HK.cfgModal.show();
    });

    $("#cfgReloadBtn").on("click", function () {
      HK.hideCfgAlert();
      HK.getCfg()
        .done(HK.fillForm)
        .fail(function (xhr) {
          const err = xhr.responseText || xhr.status;
          HK.showCfgAlert(
            HK.msg("cfg.load_failed", "Konnte Einstellungen nicht laden: {err}", { err: err })
          );
        });
    });

    $("#configModal").on("shown.bs.modal", function () {
      $("#cfgReloadBtn").trigger("click");
    });

    $("#cfgAddCamera").on("click", function () {
      HK.addNewCamera();
    });

    $("#cfgCameraAccordion").on("click", ".cfgRemoveCam", function () {
      $(this).closest(".cfg-cam-item").remove();
      HK.renumberOrders();
    });

    $("#cfg_ui_live_gallery_object_fit").on("change", function () {
      const fit = HK.normalizeObjectFit($(this).val(), "cover");
      if (typeof HK.applyLiveGalleryFitClass === "function") {
        HK.applyLiveGalleryFitClass(fit);
      }
    });

    $("#cfgSaveBtn").on("click", function () {
      HK.hideCfgAlert();

      let patch;
      try {
        HK.renumberOrders();
        patch = HK.collectPatchFromForm();
      } catch (e) {
        HK.showCfgAlert(e.message || String(e));
        return;
      }

      HK.savePatch(patch)
        .done(function () {
          if (HK.loadGeneralConfig) HK.loadGeneralConfig();

          HK.showCfgAlert(HK.msg("cfg.alert_saved", "Gespeichert ✓"));

          $("#cfgAlert")
            .removeClass("alert-warning")
            .addClass("alert-success")
            .removeClass("d-none");
        })
        .fail(function (xhr) {
          const err = xhr.responseText || xhr.status;
          HK.showCfgAlert(
            HK.msg("cfg.save_failed", "Speichern fehlgeschlagen: {err}", { err: err })
          );
        });
    });
  });

})(jQuery);