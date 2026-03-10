/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Hinweis:
 * - Alle UI-Texte laufen über HK.msg(...) und sind damit i18n-fähig.
 * - Für dynamisch erzeugtes HTML wird zusätzlich data-key gesetzt, damit eine nachträgliche Re-Übersetzung möglich ist,
 *   falls dein Projekt z.B. eine Funktion wie HK.applyLang() nutzt.
 */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  HK.hexToRgb = function hexToRgb(hex) {
    const h = String(hex || "").trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  };

  /**
   * Macht "bg-dark" zur gewünschten UI-Farbe (cfg.ui.color)
   * Optional auch primary (Buttons) angleichen.
   */
  HK.applyUiThemeFromConfig = function applyUiThemeFromConfig(cfg) {
    const hex = cfg && cfg.ui && cfg.ui.color;
    if (!hex) return;

    const rgb = HK.hexToRgb(hex);
    if (!rgb) {
      console.warn("[ui] invalid cfg.ui.color:", hex);
      return;
    }

    const root = document.documentElement;

    // ✅ bg-dark / text-bg-dark / etc. ändern
    root.style.setProperty("--bs-dark", hex);
    root.style.setProperty("--bs-dark-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

    // Optional: Body-Default (falls du irgendwann bg-dark entfernst)
    root.style.setProperty("--bs-body-bg", hex);
    root.style.setProperty("--bs-body-bg-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

    // Optional: "Primary" ebenfalls auf die UI-Farbe setzen (Buttons/Progress)
    root.style.setProperty("--bs-primary", hex);
    root.style.setProperty("--bs-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  };

  $(document).on("generalConfigLoaded", function (_e, cfg) {
  if (HK.applyUiThemeFromConfig) HK.applyUiThemeFromConfig(cfg);
});

$(document).on("input change", "#cfg_ui_color", function () {
  const hex = String(this.value || "");
  HK.applyUiThemeFromConfig({ ui: { color: hex } });
});

})(jQuery);