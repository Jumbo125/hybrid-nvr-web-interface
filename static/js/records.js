/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Modul: Recordings / Playback
 * - Sucht Aufnahmen pro Kamera + Datum (Paging)
 * - Startet Backend-Download und spielt danach MP4 direkt im <video>-Tag ab
 * - Prüft vorhandene Vorschaubilder über /api/playback/frame
 *
 * i18n:
 * - Alle sichtbaren Texte laufen über HK.msg(...)
 */

/* global bootstrap, $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});
  HK.records = HK.records || {};

  HK.records.escapeHtml = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  };

  HK.records.RECORDS_PAGE_SIZE = 40;

  HK.records.recordSearchState = {
    camera: null,
    date: null,
    searchID: null,
    position: 0,
    nextPosition: null,
    prevPositions: []
  };

  HK.records.recordPlaybackModal = null;
  HK.records.currentJobId = null;

  HK.records.thumbAbortCtrl = null;
  HK.records.playbackAbortCtrl = null;
  HK.records.playbackBusy = false;

  HK.records.THUMB_PLACEHOLDER_SRC = "img/thumb_placeholder.webp";
  HK.records.THUMB_FAIL_SRC = "img/black.webp";

  HK.records.getRecordSettings = function () {
    return (window.General_config && window.General_config.record_settings)
      ? window.General_config.record_settings
      : {};
  };

  HK.records.fetchWithTimeout = async function (url, options, timeoutMs, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(250, Number(timeoutMs) || 3000));

    const onOuterAbort = function () { ctrl.abort(); };
    if (outerSignal) outerSignal.addEventListener("abort", onOuterAbort, { once: true });

    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
    }
  };

  HK.records.isThumbsEnabled = function () {
    const rs = HK.records.getRecordSettings();
    return !!rs.record_list_thumbnail;
  };

  HK.records.getThumbnailTimeoutMs = function () {
    const rs = HK.records.getRecordSettings();
    return Number(rs.record_thumbnails_create_timeout_ms ?? 3000);
  };

  HK.records.getFrameOffsetMs = function () {
    const rs = HK.records.getRecordSettings();
    const v = rs.frame_from_ms_sec ?? rs.frame_from_ms ?? 1000;
    return Math.max(0, Number(v) || 1000);
  };

  HK.records.stopThumbnailLoading = function () {
    if (HK.records.thumbAbortCtrl) {
      try { HK.records.thumbAbortCtrl.abort(); } catch (e) {}
      HK.records.thumbAbortCtrl = null;
    }
  };

  HK.records.abortPlaybackRequest = function () {
    if (HK.records.playbackAbortCtrl) {
      try { HK.records.playbackAbortCtrl.abort(); } catch (e) {}
      HK.records.playbackAbortCtrl = null;
    }
  };

  HK.records.setPlayButtonsDisabled = function (disabled) {
    HK.records.playbackBusy = !!disabled;
    $("#recordTable .playRecordBtn").prop("disabled", !!disabled);
  };

  HK.records.loadThumbnailsSequential = async function () {
  if (!HK.records.isThumbsEnabled()) return;
  if (typeof AbortController === "undefined") return;

  const backendTimeoutMs = HK.records.getThumbnailTimeoutMs();
  const requestTimeoutMs = backendTimeoutMs + 800;
  const frameOffsetMs = HK.records.getFrameOffsetMs();

  const camera = String(HK.records.recordSearchState.camera || "");
  const date = String(HK.records.recordSearchState.date || "");

  HK.records.stopThumbnailLoading();
  HK.records.thumbAbortCtrl = new AbortController();

  const buttons = document.querySelectorAll("#recordTable .playRecordBtn[data-jobid]");

  for (const btn of buttons) {
    if (!HK.records.thumbAbortCtrl || HK.records.thumbAbortCtrl.signal.aborted) {
      break;
    }

    const tr = btn.closest("tr");
    const img = tr ? tr.querySelector("img.record-thumb") : null;

    const jobid = String(btn.dataset.jobid || "").trim();
    const startIso = String(btn.dataset.start || "").trim();
    const endIso = String(btn.dataset.end || "").trim();

    if (!img) continue;

    img.src = HK.records.THUMB_PLACEHOLDER_SRC;

    if (!jobid || !camera || !date || !startIso || !endIso) {
      img.src = HK.records.THUMB_FAIL_SRC;
      continue;
    }

    try {
      const resp = await HK.records.fetchWithTimeout(
        "/api/playback/thumbnail",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobid: jobid,
            camera: camera,
            date: date,
            start: startIso,
            end: endIso,
            timeout_ms: backendTimeoutMs,
            frame_from_ms: frameOffsetMs,
            frame_from_ms_sec: frameOffsetMs,
            width: 320,
            height: 180,
            force: false
          })
        },
        requestTimeoutMs,
        HK.records.thumbAbortCtrl.signal
      );

      if (!resp.ok) {
        img.src = HK.records.THUMB_FAIL_SRC;
        continue;
      }

      const data = await resp.json().catch(function () { return null; });

      if (!data || !data.exists || !data.thumbnail_url) {
        img.src = HK.records.THUMB_FAIL_SRC;
        continue;
      }

      const url = new URL(String(data.thumbnail_url), window.location.origin);
      url.searchParams.set("cb", String(Date.now()));
      img.src = url.toString();
    } catch (e) {
      if (HK.records.thumbAbortCtrl && HK.records.thumbAbortCtrl.signal.aborted) {
        break;
      }
      img.src = HK.records.THUMB_FAIL_SRC;
    }
  }
};

  HK.records.closeRecordModal = function () {
    $("#recordModal").removeClass("open");
    HK.records.stopThumbnailLoading();
    HK.records.stopRecordPlaybackAll();
  };

  HK.records.showRecordAlert = function (msg) {
    const $a = $("#recordAlert");
    if (!msg) return $a.addClass("d-none").text("");
    $a.removeClass("d-none").text(msg);
  };

  HK.records.showRecordPlaybackAlert = function (msg) {
    const $a = $("#recordPlaybackAlert");
    if (!msg) return $a.addClass("d-none").text("");
    $a.removeClass("d-none").text(msg);
  };

  HK.records.setRecordSpinner = function (show) {
    $("#recordSpinner").toggleClass("d-none", !show);
  };

  HK.records.setPlaybackState = function (txt) {
    $("#recordPlaybackState").text(txt || "");
  };

  HK.records.timePart = function (iso) {
    const m = (iso || "").match(/T(\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : (iso || "");
  };

  HK.records.parseIsoToMs = function (iso) {
    const t = Date.parse(iso);
    return isNaN(t) ? null : t;
  };

  HK.records.computeDurationSec = function (startIso, endIso) {
    const a = HK.records.parseIsoToMs(startIso);
    const b = HK.records.parseIsoToMs(endIso);
    if (a == null || b == null) return 0;
    return Math.max(0, (b - a) / 1000);
  };

  HK.records.formatDuration = function (sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  HK.records.updatePagingUI = function () {
    const st = HK.records.recordSearchState;
    $("#prevPageBtn").prop("disabled", st.prevPositions.length === 0);
    $("#nextPageBtn").prop("disabled", st.nextPosition == null);

    const sid = st.searchID ? st.searchID.slice(0, 8) : "-";
    $("#pageInfo").text(
      HK.msg("records.page_info", "Pos {pos} | SID {sid}", { pos: st.position, sid: sid })
    );
  };

  HK.records.fetchRecordsPage = async function ({ camera, date, position, searchID }) {
    HK.records.stopThumbnailLoading();
    HK.records.showRecordAlert("");

    const tLoading = HK.msg("records.loading", "Lade…");
    $("#recordTable")
      .empty()
      .append(`<tr><td colspan="4" class="text-secondary">${HK.records.escapeHtml(tLoading)}</td></tr>`);

    const params = {
      camera,
      date,
      maxResults: HK.records.RECORDS_PAGE_SIZE,
      position: position || 0
    };
    if (searchID) params.searchID = searchID;

    try {
      const data = await $.getJSON("/api/records/search", params);

      const st = HK.records.recordSearchState;
      st.camera = camera;
      st.date = date;
      st.searchID = data.searchID;
      st.position = data.searchResultPosition || 0;
      st.nextPosition = data.nextPosition != null ? data.nextPosition : null;

      HK.records.renderRecordsTable(data.matches || []);
      HK.records.updatePagingUI();
    } catch (e) {
      $("#recordTable").empty();
      HK.records.showRecordAlert(
        HK.msg("records.err_fetch_records", "Fehler beim Abrufen der Aufnahmen. (NVR offline / Auth / Timeout?)")
      );
      HK.records.recordSearchState.nextPosition = null;
      HK.records.updatePagingUI();
    }
  };

  HK.records.renderRecordsTable = function (matches) {
    const $tb = $("#recordTable");
    $tb.empty();

    if (!matches || matches.length === 0) {
      HK.records.showRecordAlert(HK.msg("records.no_records", "Keine Aufnahmen für diesen Tag gefunden."));
      return;
    }

    const thumbsEnabled = HK.records.isThumbsEnabled();

    matches.forEach(function (m) {
      const st = m.startTime || "";
      const et = m.endTime || "";
      const dur = HK.records.computeDurationSec(st, et);
      const jobid = String(m.hash || m.jobid || m.token || "");

      const thumbHtml = thumbsEnabled
        ? `<img class="record-thumb rounded me-2" alt="thumbnail" src="${HK.records.escapeHtml(HK.records.THUMB_PLACEHOLDER_SRC)}"
              style="width:96px;height:54px;object-fit:cover;" loading="lazy">`
        : "";

      $tb.append(`
        <tr>
          <td>${thumbHtml}${HK.records.escapeHtml(HK.records.timePart(st))}</td>
          <td>${HK.records.escapeHtml(HK.records.timePart(et))}</td>
          <td>${HK.records.escapeHtml(HK.records.formatDuration(dur))}</td>
          <td class="text-end">
            <button class="btn btn-success btn-sm playRecordBtn"
              data-jobid="${HK.records.escapeHtml(jobid)}"
              data-start="${HK.records.escapeHtml(st)}"
              data-end="${HK.records.escapeHtml(et)}"
              data-dur="${HK.records.escapeHtml(dur)}"
              aria-label="${HK.records.escapeHtml(HK.msg("records.btn_play", "Abspielen"))}">
              <i class="bi bi-play-fill"></i>
            </button>
          </td>
        </tr>
      `);
    });

    if (typeof HK.applyLanguageToDom === "function") {
      HK.applyLanguageToDom(window.CurrentLang || HK.defaultLang || "de");
    }

    if (thumbsEnabled) {
      HK.records.loadThumbnailsSequential();
    }
  };

  HK.records.destroyRecordVideo = function () {
    const video = document.getElementById("recordVideo");
    if (!video) return;

    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (e) {}
  };

  HK.records.stopRecordPlaybackAll = function () {
    HK.records.abortPlaybackRequest();
    HK.records.destroyRecordVideo();
    HK.records.setRecordSpinner(false);
    HK.records.showRecordPlaybackAlert("");
    HK.records.setPlaybackState("");
    HK.records.currentJobId = null;
    HK.records.setPlayButtonsDisabled(false);
    $("#recordJobInfo").text("");
  };

  HK.records.extractErrorText = async function (resp) {
    try {
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const data = await resp.json();
        return data.detail || data.error || JSON.stringify(data);
      }
      const txt = await resp.text();
      return txt || `HTTP ${resp.status}`;
    } catch (e) {
      return `HTTP ${resp.status}`;
    }
  };

  HK.records.startPlaybackFromRange = async function (camera, date, startIso, endIso, durationSec, jobid) {
    HK.records.showRecordPlaybackAlert("");
    HK.records.setRecordSpinner(true);
    HK.records.setPlaybackState(HK.msg("records.preparing_video", "Video wird bereitgestellt…"));
    HK.records.setPlayButtonsDisabled(true);

    HK.records.currentJobId = jobid || "";
    const shortId = String(HK.records.currentJobId || "").slice(0, 8);
    $("#recordJobInfo").text(shortId ? HK.msg("records.job_info", "Job: {id}", { id: shortId }) : "");

    HK.records.abortPlaybackRequest();
    HK.records.playbackAbortCtrl = new AbortController();

    const timeoutMs = HK.records.getThumbnailTimeoutMs();
    const frameOffsetMs = HK.records.getFrameOffsetMs();

    let resp;
    try {
      resp = await HK.records.fetchWithTimeout(
        "/api/playback/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobid: String(jobid || ""),
            camera: String(camera),
            date: String(date),
            start: String(startIso),
            end: String(endIso),
            record_thumbnails_create_timeout_ms: timeoutMs,
            frame_from_ms_sec: frameOffsetMs,
            frame_from_ms: frameOffsetMs
          })
        },
        timeoutMs,
        HK.records.playbackAbortCtrl.signal
      );
    } catch (e) {
      if (HK.records.playbackAbortCtrl && HK.records.playbackAbortCtrl.signal.aborted) {
        HK.records.setRecordSpinner(false);
        HK.records.setPlayButtonsDisabled(false);
        return;
      }

      HK.records.setRecordSpinner(false);
      HK.records.setPlayButtonsDisabled(false);
      HK.records.showRecordPlaybackAlert(
        HK.msg("records.playback_start_failed", "Playback Start fehlgeschlagen (Video konnte nicht bereitgestellt werden).")
      );
      HK.records.setPlaybackState(HK.msg("records.playback_start_failed", "Playback Start fehlgeschlagen (Video konnte nicht bereitgestellt werden)."));
      return;
    } finally {
      HK.records.playbackAbortCtrl = null;
    }

    if (!resp.ok) {
      const errText = await HK.records.extractErrorText(resp);
      HK.records.setRecordSpinner(false);
      HK.records.setPlayButtonsDisabled(false);
      HK.records.showRecordPlaybackAlert(
        HK.msg("records.playback_start_failed_detail", "Playback fehlgeschlagen: {detail}", { detail: errText })
      );
      HK.records.setPlaybackState(errText);
      return;
    }

    const data = await resp.json().catch(function () { return null; });
    const rawVideoUrl = data && (data.video_url || data.path || data.url || "");
    const videoUrl = rawVideoUrl ? new URL(String(rawVideoUrl), window.location.origin).toString() : "";

    if (!videoUrl) {
      HK.records.setRecordSpinner(false);
      HK.records.setPlayButtonsDisabled(false);
      HK.records.showRecordPlaybackAlert(
        HK.msg("records.playback_no_video_url", "Kein Video-Pfad vom Server erhalten.")
      );
      HK.records.setPlaybackState(HK.msg("records.playback_no_video_url", "Kein Video-Pfad vom Server erhalten."));
      return;
    }

    if (data.jobid) {
      HK.records.currentJobId = String(data.jobid);
      const shortId2 = HK.records.currentJobId.slice(0, 8);
      $("#recordJobInfo").text(shortId2 ? HK.msg("records.job_info", "Job: {id}", { id: shortId2 }) : "");
    }

    HK.records.setPlaybackState(HK.msg("records.video_ready", "Video bereit."));
    HK.records.destroyRecordVideo();

    const video = document.getElementById("recordVideo");
    if (!video) {
      HK.records.setRecordSpinner(false);
      HK.records.setPlayButtonsDisabled(false);
      HK.records.showRecordPlaybackAlert(
        HK.msg("records.player_missing", "Video-Element nicht gefunden.")
      );
      HK.records.setPlaybackState(HK.msg("records.player_missing", "Video-Element nicht gefunden."));
      return;
    }

  const onReady = function () {
  video.removeEventListener("loadeddata", onReady);
  video.removeEventListener("error", onError);
  HK.records.setRecordSpinner(false);
  HK.records.setPlayButtonsDisabled(false);
  video.play().catch(function () {});
};

const onError = function () {
  video.removeEventListener("loadeddata", onReady);
  video.removeEventListener("error", onError);
  HK.records.setRecordSpinner(false);
  HK.records.setPlayButtonsDisabled(false);
  HK.records.showRecordPlaybackAlert(
    HK.msg("records.video_load_failed", "MP4 konnte nicht geladen werden.")
  );
  HK.records.setPlaybackState(HK.msg("records.video_load_failed", "MP4 konnte nicht geladen werden."));
};

video.addEventListener("loadeddata", onReady, { once: true });
video.addEventListener("error", onError, { once: true });
video.src = videoUrl;
video.load();
  
  };

  HK.records.onReady = function () {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    $("#recordDate").val(`${yyyy}-${mm}-${dd}`);

    $("#openRecords").on("click", function () {
      $("#recordModal").addClass("open");
    });

    $("#closeRecords").on("click", HK.records.closeRecordModal);

    $("#searchBtn").on("click", function () {
      const camera = $("#cameraSelect").val();
      const date = $("#recordDate").val();

      if (!date) {
        HK.records.showRecordAlert(HK.msg("records.select_date", "Bitte ein Datum auswählen."));
        return;
      }

      HK.records.recordSearchState = {
        camera,
        date,
        searchID: null,
        position: 0,
        nextPosition: null,
        prevPositions: []
      };

      HK.records.fetchRecordsPage({ camera, date, position: 0, searchID: null });
    });

    $("#nextPageBtn").on("click", function () {
      const st = HK.records.recordSearchState;
      if (st.nextPosition == null) return;
      st.prevPositions.push(st.position);

      HK.records.fetchRecordsPage({
        camera: st.camera,
        date: st.date,
        position: st.nextPosition,
        searchID: st.searchID
      });
    });

    $("#prevPageBtn").on("click", function () {
      const st = HK.records.recordSearchState;
      if (st.prevPositions.length === 0) return;
      const prevPos = st.prevPositions.pop();

      HK.records.fetchRecordsPage({
        camera: st.camera,
        date: st.date,
        position: prevPos,
        searchID: st.searchID
      });
    });

    const el = document.getElementById("recordPlaybackModal");
    if (el) HK.records.recordPlaybackModal = bootstrap.Modal.getOrCreateInstance(el);
  };

  HK.records.onPlayRecordClick = function () {
    if (HK.records.playbackBusy) return;

    const startIso = String($(this).data("start") || "");
    const endIso = String($(this).data("end") || "");
    const dur = parseFloat($(this).data("dur")) || HK.records.computeDurationSec(startIso, endIso);
    const jobid = String($(this).data("jobid") || "");

    const camera = String(HK.records.recordSearchState.camera || "");
    const date = String(HK.records.recordSearchState.date || "");

    if (!camera || !date || !startIso || !endIso) {
      HK.records.showRecordAlert(
        HK.msg("records.no_selection", "Fehlende Daten (camera/date/start/end). Bitte Suche erneut starten.")
      );
      return;
    }

    if (!jobid) {
      HK.records.showRecordAlert(
        HK.msg("records.no_hash", "Fehlender Hash/JobID für diese Aufnahme. Bitte Suche erneut starten.")
      );
      return;
    }

    HK.records.stopThumbnailLoading();
    HK.records.stopRecordPlaybackAll();

    const cam = camera.toUpperCase();
    $("#recordPlaybackTitle").text(HK.msg("records.playback_title", "Playback: {camera}", { camera: cam }));

    const subTxt = HK.msg(
      "records.playback_sub",
      "{date} | {start}–{end} | {dur}",
      {
        date: date,
        start: HK.records.timePart(startIso),
        end: HK.records.timePart(endIso),
        dur: HK.records.formatDuration(dur)
      }
    );
    $("#recordPlaybackSub").text(subTxt);

    HK.records.setRecordSpinner(true);
    HK.records.setPlaybackState(HK.msg("records.preparing_video", "Video wird bereitgestellt…"));
    HK.records.setPlayButtonsDisabled(true);

    const el = document.getElementById("recordPlaybackModal");
    if (el) HK.records.recordPlaybackModal = bootstrap.Modal.getOrCreateInstance(el);

    if (HK.records.recordPlaybackModal && typeof HK.records.recordPlaybackModal.show === "function") {
      HK.records.recordPlaybackModal.show();
    }

    HK.records.startPlaybackFromRange(camera, date, startIso, endIso, dur, jobid);
  };

  HK.records.onPlaybackModalHidden = function () {
    HK.records.stopThumbnailLoading();
    HK.records.stopRecordPlaybackAll();
  };

  HK.records.onBeforeUnload = function () {
    HK.records.stopThumbnailLoading();
    HK.records.stopRecordPlaybackAll();
  };

  HK.records.init = function () {
    $(function () {
      HK.records.onReady();
    });

    $(document).on("click", ".playRecordBtn", HK.records.onPlayRecordClick);
    $(document).on("hidden.bs.modal", "#recordPlaybackModal", HK.records.onPlaybackModalHidden);
    window.addEventListener("beforeunload", HK.records.onBeforeUnload);
  };

  HK.records.init();

})(jQuery);