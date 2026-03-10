/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Modul: Zoom/Pan im Live-Modal (Video)
 * - Pointer-Events für Drag (Pan) und Pinch (Zoom)
 * - Mausrad-Zoom
 * - Reset per Button / Doppelklick / Modal Show/Hide
 *
 * i18n:
 * - Dieses Script enthält keine sichtbaren UI-Texte.
 * - Optional wird der Reset-Button mit data-key versehen, falls das HTML keinen Text setzt oder
 *   du Tooltips/Labels internationalisieren willst.
 */

/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  HK.zoomPan = HK.zoomPan || {};

  HK.zoomPan.init = function () {
    const $wrap = $("#modalVideoWrap");
    const $vid = $("#modalVideo");
    const $modal = $("#liveModal");

    if (!$wrap.length || !$vid.length || !$modal.length) return;

    // Pointer-Gesten sollen nicht vom Browser (Scroll/Zoom) übernommen werden
    $wrap.css("touch-action", "none");

    // Transformationen werden relativ zur linken oberen Ecke gerechnet
    $vid.css("transform-origin", "0 0");

    let scale = 1;
    let tx = 0;
    let ty = 0;

    const MIN = 1;
    const MAX = 6;

    // Pointer-ID -> letzte Position (für Drag/Pinch)
    const pointers = new Map();
    let lastPinchDist = 0;

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    /**
     * Aktiviert/Deaktiviert den Reset-Button abhängig davon, ob Zoom aktiv ist.
     */
    function updateResetBtn() {
      $("#modalResetZoomBtn").prop("disabled", scale <= 1.001);
    }

    /**
     * Wendet die aktuelle Transformation auf das Video an.
     */
    function apply() {
      $vid.css("transform", `translate(${tx}px, ${ty}px) scale(${scale})`);
      updateResetBtn();
    }

    /**
     * Setzt Zoom/Pan zurück auf Standardzustand.
     */
    function resetZoom() {
      scale = 1;
      tx = 0;
      ty = 0;
      lastPinchDist = 0;
      pointers.clear();
      apply();
    }

    /**
     * Zoomt um einen bestimmten Punkt (clientX/clientY) mit einem Faktor.
     * Die Position unter dem Cursor soll dabei stabil bleiben.
     */
    function zoomAt(clientX, clientY, factor) {
      const rect = $wrap[0].getBoundingClientRect();

      // Scale clampen
      const newScale = clamp(scale * factor, MIN, MAX);

      // Faktor neu berechnen, falls clamp aktiv wurde
      factor = newScale / scale;

      // Koordinate im "Content Space" berechnen (vor Zoom)
      const x = (clientX - rect.left - tx) / scale;
      const y = (clientY - rect.top - ty) / scale;

      // Translation so anpassen, dass (x,y) unter dem Cursor bleibt
      tx = (clientX - rect.left) - x * newScale;
      ty = (clientY - rect.top) - y * newScale;
      scale = newScale;

      apply();
    }

    /**
     * Pointer Down: Pointer erfassen und Capture setzen.
     */
    function pointerDown(e) {
      const ev = e.originalEvent;
      $wrap[0].setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      lastPinchDist = 0;
    }

    /**
     * Pointer Move:
     * - 1 Pointer => Pan
     * - 2 Pointer => Pinch Zoom (Zoom um Mittelpunkt)
     */
    function pointerMove(e) {
      const ev = e.originalEvent;
      if (!pointers.has(ev.pointerId)) return;

      const prev = pointers.get(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (pointers.size === 1) {
        // Pan
        const dx = ev.clientX - prev.x;
        const dy = ev.clientY - prev.y;
        tx += dx;
        ty += dy;
        apply();
        return;
      }

      if (pointers.size === 2) {
        // Pinch
        const pts = Array.from(pointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);

        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        if (lastPinchDist > 0) {
          const f = dist / lastPinchDist;
          zoomAt(midX, midY, f);
        }

        lastPinchDist = dist;
      }
    }

    /**
     * Pointer Up/Cancel: Pointer entfernen, Pinch-State zurücksetzen.
     */
    function pointerEnd(e) {
      const ev = e.originalEvent;
      pointers.delete(ev.pointerId);
      lastPinchDist = 0;
    }

    /**
     * Wheel Zoom: Zoom um Mausposition.
     */
    function wheelZoom(e) {
      e.preventDefault();
      const ev = e.originalEvent;
      const factor = ev.deltaY < 0 ? 1.12 : 0.89;
      zoomAt(ev.clientX, ev.clientY, factor);
    }

    /**
     * Doppelklick im Wrapper => Reset.
     */
    function dblReset() {
      resetZoom();
    }

    /**
     * Reset-Button => Reset.
     */
    function clickReset() {
      resetZoom();
    }

    /**
     * Modal show/hide => Reset (damit jedes Öffnen sauber startet).
     */
    function modalShown() {
      resetZoom();
    }
    function modalHidden() {
      resetZoom();
    }

    // Events registrieren
    $wrap.on("pointerdown", pointerDown);
    $wrap.on("pointermove", pointerMove);
    $wrap.on("pointerup pointercancel", pointerEnd);
    $wrap.on("wheel", wheelZoom);
    $wrap.on("dblclick", dblReset);

    $("#modalResetZoomBtn").on("click", clickReset);

    $modal.on("shown.bs.modal", modalShown);
    $modal.on("hidden.bs.modal", modalHidden);

    // Optional: i18n Marker für Reset Button (falls du z.B. ein Label/Tooltip im HTML hast)
    // Hinweis: Der Button-Text selbst wird meist im HTML gesetzt; hier nur eine Vorbereitung.
    $("#modalResetZoomBtn").attr("data-key", $("#modalResetZoomBtn").attr("data-key") || "live.zoom_reset");

    // Initialzustand
    resetZoom();
  };

  $(function () {
    HK.zoomPan.init();
  });

})(jQuery);