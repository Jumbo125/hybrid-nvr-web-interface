/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Datei: app/static/js/reload.js
 * Zweck:
 * - Liest cfg.ui.reload oder cfg.ui.Reload aus /api/config (über window.General_config)
 * - reload == 0  -> Auto Reload deaktiviert
 * - reload > 0   -> Auto Reload aktiv, Intervall in Millisekunden
 * - Schreibt Status + Timer in <div id="autoreload"></div>
 *   - "HH:MM:SS – Auto Reload disabled"
 *   - "HH:MM:SS – Autoreload in: HH:MM:SS"
 *
 * - Seite per Button neu laden (#refresh_btn)
 * - Chromium per API-Aufruf beenden (#browser_close_btn)
 * - Bestätigungsdialog per Bootstrap-Modal
 *
 * Voraussetzungen:
 * - jQuery
 * - Bootstrap JS
 * - Optional: HK.msg(key, fallback)
 */

/* global $, bootstrap */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});
  HK.reload = HK.reload || {};

  HK.msg = HK.msg || function (_key, fallback) {
    return fallback;
  };

  let tickHandle = null;
  let reloadHandle = null;

  const pageStartTs = Date.now();
  let reloadEveryMs = 0;
  let nextReloadTs = 0;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatHMSFromSeconds(totalSec) {
    const t = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function formatHMS(ms) {
    return formatHMSFromSeconds(ms / 1000);
  }

  function setAutoReloadDiv(text) {
    const $el = $("#autoreload");
    if ($el.length) {
      $el.text(text);
    }
  }

  function clearTimers() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
    if (reloadHandle) {
      clearTimeout(reloadHandle);
      reloadHandle = null;
    }
  }

  function parseReloadValue(cfg) {
    const ui = cfg && cfg.ui ? cfg.ui : null;

    let v;
    if (ui && Object.prototype.hasOwnProperty.call(ui, "reload")) {
      v = ui.reload;
    } else if (ui && Object.prototype.hasOwnProperty.call(ui, "Reload")) {
      v = ui.Reload;
    } else {
      return 0;
    }

    if (v === null || v === undefined || v === "") {
      return 0;
    }

    if (typeof v === "string") {
      const n = Number(v.trim());
      return Number.isFinite(n) ? n : 0;
    }

    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }

    return 0;
  }

  function scheduleReload() {
    if (!reloadEveryMs || reloadEveryMs <= 0) {
      return;
    }

    nextReloadTs = Date.now() + reloadEveryMs;

    reloadHandle = setTimeout(function () {
      window.location.reload();
    }, reloadEveryMs);
  }

  function startTicker() {
    tickHandle = setInterval(function () {
      const now = Date.now();
      const uptime = formatHMS(now - pageStartTs);

      if (!reloadEveryMs || reloadEveryMs <= 0) {
        setAutoReloadDiv(
          `${uptime} – ${HK.msg("autoreload.disabled", "Auto Reload disabled")}`
        );
        return;
      }

      const remainingMs = Math.max(0, nextReloadTs - now);
      const remainingHMS = formatHMS(remainingMs);

      setAutoReloadDiv(
        `${uptime} – ${HK.msg("autoreload.next", "Autoreload in")}: ${remainingHMS}`
      );
    }, 1000);
  }

  function applyConfig(cfg) {
    clearTimers();

    reloadEveryMs = parseReloadValue(cfg);

    if (!reloadEveryMs || reloadEveryMs <= 0) {
      nextReloadTs = 0;
      startTicker();
      return;
    }

    scheduleReload();
    startTicker();
  }

  function ensureBrowserCloseModal() {
    if (document.getElementById("browserCloseConfirmModal")) {
      return;
    }

    const html = `
      <div class="modal fade" id="browserCloseConfirmModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                ${HK.msg("browser.close.confirm_title", "Close browser")}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="${HK.msg("common.close", "Close")}">
              </button>
            </div>

            <div class="modal-body">
              ${HK.msg("browser.close.confirm_text", "Do you really want to close Chromium?")}
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-outline-secondary"
                data-bs-dismiss="modal">
                ${HK.msg("common.cancel", "Cancel")}
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                data-bs-dismiss="modal">
                ${HK.msg("common.no", "No")}
              </button>

              <button
                type="button"
                class="btn btn-danger"
                id="browser_close_confirm_yes">
                ${HK.msg("common.yes", "Yes")}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    $("body").append(html);
  }

  function callBrowserClose() {
    return fetch("/api/browser/close", {
      method: "POST",
      headers: {
        "Accept": "application/json"
      },
      cache: "no-store",
      keepalive: true
    });
  }

  function handleRefreshClick() {
    window.location.reload();
  }

  function handleBrowserCloseClick() {
    const modalEl = document.getElementById("browserCloseConfirmModal");
    if (!modalEl) {
      return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  function handleBrowserCloseConfirmYes() {
    const modalEl = document.getElementById("browserCloseConfirmModal");
    const modal = modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const $yesBtn = $("#browser_close_confirm_yes");

    $yesBtn.prop("disabled", true);

    callBrowserClose()
      .then(async function (res) {
        let data = {};

        try {
          data = await res.json();
        } catch (_e) {
          data = {};
        }

        if (!res.ok) {
          throw new Error(
            data.detail || HK.msg("browser.close.error", "Browser could not be closed.")
          );
        }

        if (modal) {
          modal.hide();
        }
      })
      .catch(function (err) {
        const msg = (err && err.message)
          ? err.message
          : HK.msg("browser.close.error", "Browser could not be closed.");

        alert(msg);
      })
      .finally(function () {
        $yesBtn.prop("disabled", false);
      });
  }

  function bindEvents() {
    $(document).off(".hkReload");

    $(document).on("click.hkReload", "#refresh_btn", function () {
      handleRefreshClick();
    });

    $(document).on("click.hkReload", "#browser_close_btn", function () {
      handleBrowserCloseClick();
    });

    $(document).on("click.hkReload", "#browser_close_confirm_yes", function () {
      handleBrowserCloseConfirmYes();
    });

    $(document).on("hidden.bs.modal.hkReload", "#browserCloseConfirmModal", function () {
      $("#browser_close_confirm_yes").prop("disabled", false);
    });

    $(document).on("generalConfigLoaded.hkReload", function (_evt, cfg) {
      applyConfig(cfg);
    });
  }

  function init() {
    ensureBrowserCloseModal();
    bindEvents();

    if (window.General_config && Object.keys(window.General_config).length) {
      applyConfig(window.General_config);
    } else {
      setAutoReloadDiv(
        `00:00:00 – ${HK.msg("autoreload.disabled", "Auto Reload disabled")}`
      );
      startTicker();
    }
  }

  // Public API
  HK.reload.applyConfig = applyConfig;
  HK.reload.init = init;
  HK.reload.clearTimers = clearTimers;

  $(function () {
    init();
  });

})(jQuery);