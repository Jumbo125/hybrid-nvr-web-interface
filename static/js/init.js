/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Zweck:
 * - Initialisiert die Start-Reihenfolge beim DOM Ready:
 *   1) Config laden
 *   2) Sprach-Dropdown initialisieren
 *   3) Sprach-Bundles laden
 *   4) Sprache auf DOM anwenden
 *
 * i18n:
 * - Dieses Script enthält keine UI-Texte, daher nur Struktur/Kommentare.
 */

/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  /**
   * Führt die Initialisierung beim DOM Ready aus.
   * Es wird bewusst mit jqXHR/Deferred gearbeitet, damit sowohl echte Promises
   * als auch jQuery-Promises funktionieren.
   */
HK.initOnReady = function () {
  $(document).ready(function () {
    const cfgPromise = HK.loadGeneralConfig
      ? HK.loadGeneralConfig()
      : $.Deferred().resolve().promise();

    cfgPromise.always(function () {
      const slidePromise = HK.loadSlideshowImages
        ? HK.loadSlideshowImages()
        : $.Deferred().resolve().promise();

      slidePromise.always(function () {
        const selPromise = HK.initLanguageSelect
          ? HK.initLanguageSelect()
          : $.Deferred().resolve().promise();

        selPromise.always(function () {
          const langPromise = HK.loadAllLanguages
            ? HK.loadAllLanguages()
            : $.Deferred().resolve().promise();

          langPromise.always(function () {
            if (HK.applyLanguageToDom) {
              HK.applyLanguageToDom(window.CurrentLang || HK.defaultLang || "de");
            }
          });
        });
      });
    });
  });
};

  HK.initOnReady();

})(jQuery);