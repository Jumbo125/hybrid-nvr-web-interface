/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Modul: Lock-Overlay
 * - Öffnet ein Lock-Modal/Overlay
 * - Schließt bei Klick auf den Hintergrund oder ESC
 *
 * i18n:
 * - Dieses Script enthält keine sichtbaren UI-Texte.
 * - Optional werden data-key Marker am Lock-Button/Modal gesetzt, falls du später Labels/Tooltips übersetzen willst.
 */

(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});
  HK.lock = HK.lock || {};

  /**
   * Öffnet das Lock-Overlay.
   */
 HK.lock.open = function () {
  $("#lockModal").removeClass("d-none");
  $("body").addClass("lock-active");

  if (HK.slideshow && typeof HK.slideshow.start === "function") {
    HK.slideshow.start();
  }
};



  /**
   * Schließt das Lock-Overlay.
   */
HK.lock.close = function () {
  if (HK.slideshow && typeof HK.slideshow.stop === "function") {
    HK.slideshow.stop();
  }

  $("#lockModal").addClass("d-none");
  $("body").removeClass("lock-active");
};

  /**
   * Initialisiert Event-Handler für Lock-Overlay.
   */
  HK.lock.init = function () {
    const $lock = $("#lockModal");
    if (!$lock.length) return;

    // Optional: i18n Marker setzen (nur Vorbereitung; Text ist typischerweise im HTML)
    const $btn = $("#lock_btn");
    if ($btn.length && !$btn.attr("data-key")) {
      $btn.attr("data-key", "lock.btn_open");
    }

    $("#lock_btn").on("click", function (e) {
      e.preventDefault();
      HK.lock.open();
    });

    // Klick auf den Hintergrund (Modal selbst) schließt
    $lock.on("click", function (e) {
      if (e.target === this) HK.lock.close();
    });

    // ESC schließt, wenn sichtbar
    $(document).on("keydown", function (e) {
      if (e.key === "Escape" && !$lock.hasClass("d-none")) {
        HK.lock.close();
      }
    });
  };

  $(function () {
    HK.lock.init();
  });

})(jQuery);