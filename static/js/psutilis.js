/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Datei: app/static/js/psutil.js
 * Zweck:
 * - Pollt jede Sekunde /api/system/stats
 * - Erwartet ein Objekt wie:
 *   {
 *     "cpu_percent": 18.4,
 *     "ram_percent": 22.7,
 *     "temp_c": 41.3
 *   }
 * - Schreibt die Werte nach #uiPsutil
 * - Nutzt Bootstrap Icons (falls vorhanden), sonst bleibt der Text trotzdem sichtbar
 */

/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});
  HK.psutil = HK.psutil || {};

  let timerHandle = null;
  const POLL_MS = 1000;
  const ENDPOINT = "/api/system/stats";

  function fmtPercent(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "–";
  }

  function fmtTemp(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toFixed(1)}°C` : "–";
  }

  function render(stats) {
    const $el = $("#uiPsutil");
    if (!$el.length) return;

    const cpu = fmtPercent(stats && stats.cpu_percent);
    const ram = fmtPercent(stats && stats.ram_percent);
    const temp = fmtTemp(stats && stats.temp_c);

    $el.html(`
      <span class="me-3" title="CPU">
        <i class="bi bi-cpu"></i> CPU: <strong>${cpu}</strong>
      </span>
      <span class="me-3" title="Temperatur">
        <i class="bi bi-thermometer-half"></i> Temp: <strong>${temp}</strong>
      </span>
      <span class="me-3" title="RAM">
        <i class="bi bi-memory"></i> RAM: <strong>${ram}</strong>
      </span>
    `);
  }

  function renderError() {
    const $el = $("#uiPsutil");
    if (!$el.length) return;

    $el.html(`
      <span class="me-3" title="CPU">
        <i class="bi bi-cpu"></i> CPU: <strong>–</strong>
      </span>
      <span class="me-3" title="Temperatur">
        <i class="bi bi-thermometer-half"></i> Temp: <strong>–</strong>
      </span>
      <span class="me-3" title="RAM">
        <i class="bi bi-memory"></i> RAM: <strong>–</strong>
      </span>
    `);
  }

  function fetchStats() {
    $.ajax({
      url: ENDPOINT,
      method: "GET",
      cache: false,
      dataType: "json"
    })
      .done(function (data) {
        render(data || {});
      })
      .fail(function () {
        renderError();
      });
  }

  function start() {
    stop();
    fetchStats(); // sofort einmal laden
    timerHandle = setInterval(fetchStats, POLL_MS);
  }

  function stop() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  HK.psutil.start = start;
  HK.psutil.stop = stop;
  HK.psutil.fetchStats = fetchStats;

  $(function () {
    renderError();
    start();
  });
})(jQuery);