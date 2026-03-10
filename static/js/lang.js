/* global $ */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  // Globale Container
  window.Lang = window.Lang || {};               // { de: {...}, en: {...} }
  window.CurrentLang = window.CurrentLang || ""; // z.B. "de"

  // Deine Endpunkte
  HK.I18N_ENDPOINTS = HK.I18N_ENDPOINTS || {
    available: "/api/lang/available",
    bundles: "/api/lang"
  };

  HK.availableLangs = HK.availableLangs || []; // ["de","en",...]
  HK.defaultLang = HK.defaultLang || "de";

  // -----------------------------------
  // Helper: Key Lookup (flache dicts!)
  // 1) direct key lookup (für "a.b.c" als literal key)
  // 2) optional: nested fallback (falls du später nested JSON willst)
  // -----------------------------------
  function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = String(path).split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function lookup(pack, key) {
    if (!pack || !key) return undefined;
    // flache dict: key kann Punkte enthalten => zuerst direct prüfen
    if (Object.prototype.hasOwnProperty.call(pack, key)) return pack[key];
    // optional nested fallback
    return getByPath(pack, key);
  }

  // -----------------------------------
  // (1) verfügbare Sprachen holen + Dropdown befüllen
  // Endpoint: GET /api/lang/available -> { available: [...] }
  // -----------------------------------
  HK.initLanguageSelect = function initLanguageSelect(opts) {
    opts = opts || {};
    const url = opts.url || HK.I18N_ENDPOINTS.available;
    const $sel = $(opts.select || "#cfg_ui_lang");
    if (!$sel.length) return $.Deferred().resolve().promise();

    return $.ajax({
      url,
      method: "GET",
      cache: false,
      dataType: "json",
      timeout: opts.timeout || 8000
    })
      .done(function (res) {
        const codes = (res && res.available) || [];
        if (!Array.isArray(codes) || !codes.length) {
          console.warn("[lang] /available returned no codes:", res);
          return;
        }

        HK.availableLangs = codes.slice();

        // Default: General_config.ui.lang -> CurrentLang -> defaultLang -> erster Code
        let initial =
          (window.General_config && window.General_config.ui && window.General_config.ui.lang) ||
          window.CurrentLang ||
          HK.defaultLang ||
          codes[0];

        // Wenn initial nicht verfügbar ist -> fallback auf ersten
        if (codes.indexOf(initial) === -1) initial = codes[0];

        window.CurrentLang = initial;
        HK.defaultLang = HK.defaultLang || codes[0];

        // Dropdown befüllen (Label erstmal Code; du kannst später Labels liefern)
       $sel.empty();
codes.forEach(function (c) {
  $sel.append($("<option/>", {
    value: String(c),
    text: String(c).toUpperCase()
  }));
});
$sel.val(initial);

        // Change handler (optional abschaltbar)
        if (!opts.noBindChange) {
          $sel.off("change.hkLang").on("change.hkLang", function () {
            const code = String($(this).val() || "");
            if (!code) return;
            window.CurrentLang = code;

            // Wenn Bundles schon da -> direkt anwenden, sonst laden
            if (window.Lang && window.Lang[code]) {
              HK.applyLanguageToDom(code);
              $(document).trigger("languageChanged", [code]);
            } else {
              HK.loadAllLanguages().always(function () {
                HK.applyLanguageToDom(code);
                $(document).trigger("languageChanged", [code]);
              });
            }
          });
        }

        $(document).trigger("languageSelectReady", [codes, initial]);
      })
      .fail(function (xhr, status, err) {
        console.error("[lang] initLanguageSelect failed:", status, err, xhr.responseText);
      });
  };

  // -----------------------------------
  // (2) alle Sprachen holen -> window.Lang
  // Endpoint: GET /api/lang -> { lang: { de: {...}, en: {...} } }
  // -----------------------------------
  HK.loadAllLanguages = function loadAllLanguages(opts) {
    opts = opts || {};
    const url = opts.url || HK.I18N_ENDPOINTS.bundles;

    return $.ajax({
      url,
      method: "GET",
      cache: false,
      dataType: "json",
      timeout: opts.timeout || 8000
    })
      .done(function (res) {
        const langObj = (res && res.lang) || {};
        if (!langObj || typeof langObj !== "object") {
          console.warn("[lang] /api/lang returned invalid payload:", res);
          window.Lang = {};
        } else {
          window.Lang = langObj;
        }
        HK.Lang = window.Lang;

        $(document).trigger("languagesLoaded", [window.Lang]);
      })
      .fail(function (xhr, status, err) {
        console.error("[lang] loadAllLanguages failed:", status, err, xhr.responseText);
      });
  };

  // -----------------------------------
  // (3) DOM übersetzen via data-key
  // - data-key="foo.bar" -> pack["foo.bar"] (flach!)
  // Optional:
  // - data-attr="placeholder" / "title" / ...
  // - data-html="1" (setzt innerHTML)
  // - data-fallback="Text"
  // -----------------------------------
  HK.applyLanguageToDom = function applyLanguageToDom(langCode, root) {
  const code = langCode || window.CurrentLang || HK.defaultLang || "de";
  window.CurrentLang = code;

  const bundles = window.Lang || {};
  const pack = bundles[code] || {};
  const fallbackPack = bundles[HK.defaultLang || "de"] || {};

  const $root = root ? $(root) : $(document);

  //Wichtig: addBack übersetzt auch das root-Element, falls es data-key hat
  $root.find("[data-key]").addBack("[data-key]").each(function () {
    const $el = $(this);
    const key = String($el.attr("data-key") || "").trim();
    if (!key) return;

    let val = lookup(pack, key);
    if (val == null) val = lookup(fallbackPack, key);

    const fb = $el.attr("data-fallback");
    if (val == null && fb != null) val = fb;
    if (val == null) val = key;

    const attr = $el.attr("data-attr");
    const asHtml = $el.attr("data-html");

    if (attr) {
      $el.attr(attr, String(val));
    } else if (asHtml) {
      $el.html(String(val));
    } else {
      $el.text(String(val));
    }
  });

  $(document).trigger("languageApplied", [code]);
};

  // Optional: schnelle Übersetzungsfunktion für JS
  HK.t = function t(key, langCode) {
    const code = langCode || window.CurrentLang || HK.defaultLang || "de";
    const bundles = window.Lang || {};
    const pack = bundles[code] || {};
    const fallbackPack = bundles[HK.defaultLang || "de"] || {};
    let v = lookup(pack, key);
    if (v == null) v = lookup(fallbackPack, key);
    return v == null ? key : (typeof v === "string" ? v : String(v));
  };


  // JS-Message Helper: Übersetzung mit Default + optionalen Platzhaltern
HK.msg = function msg(key, defaultText, vars, langCode) {
  const code = langCode || window.CurrentLang || HK.defaultLang || "de";

  // Versuche Übersetzung zu holen
  let text = (HK.t && key) ? HK.t(key, code) : key;

  // Wenn HK.t den Key zurückgibt, gilt das als "nicht gefunden"
  if (!text || text === key) {
    text = defaultText != null ? String(defaultText) : String(key || "");
  }

  // Optional: {name} Platzhalter ersetzen
  if (vars && typeof vars === "object") {
    Object.keys(vars).forEach(function (k) {
      const re = new RegExp("\\{" + k + "\\}", "g");
      text = text.replace(re, String(vars[k]));
    });
  }

  return text;
};

})(jQuery);