/*!
 * Autor: Andreas Rottmann
 * Lizenz: GNU AGPL-3.0
 *
 * Modul: Slideshow im Lock-Modal
 *
 * Zweck:
 * - Lädt eine serverseitig bereitgestellte Liste von Bild-URLs
 * - Speichert diese in window.General_config / HK.General_config
 * - Spielt die Bilder im #lockModal als einfache Diashow ab
 * - Unterstützt mehrere Slide-Richtungen und optional Zufallseffekte
 *
 * Technische Hinweise:
 * - Diese Version nutzt jQuery + GSAP für ruhige, saubere Übergänge.
 * - Die API liefert browserfähige Bild-URLs zurück.
 * - Es wird kein Ordnerpfad vom Frontend an die API gesendet.
 */

/* global $, gsap */
(function ($) {
  "use strict";

  const HK = (window.HK = window.HK || {});

  /**
   * Lädt die serverseitig bekannte Bildliste für die Slideshow.
   *
   * Erwartete API-Antwort:
   * - { images: {...} }
   *   oder
   * - direkt ein Objekt / Array mit Bild-URLs
   *
   * Die gelieferten Daten werden in:
   *   General_config.slideshow.images
   * gespeichert.
   *
   * @returns {jqXHR|Promise}
   */
  HK.loadSlideshowImages = function () {
    return $.ajax({
      url: "/api/slideshow/images",
      method: "GET",
      cache: false,
      dataType: "json",
      timeout: 15000
    })
      .done(function (res) {
        const targetCfg = window.General_config || HK.General_config || {};

        if (!targetCfg.slideshow) {
          targetCfg.slideshow = {};
        }

        targetCfg.slideshow.images = res && res.images ? res.images : (res || {});

        window.General_config = targetCfg;
        HK.General_config = targetCfg;

        $(document).trigger("slideshowImagesLoaded", [
          targetCfg.slideshow.images,
          targetCfg
        ]);
      })
      .fail(function (xhr, status, err) {
        console.error("[slideshow] image list load failed:", status, err, xhr.responseText);

        const targetCfg = window.General_config || HK.General_config || {};
        if (!targetCfg.slideshow) {
          targetCfg.slideshow = {};
        }

        targetCfg.slideshow.images = {};

        window.General_config = targetCfg;
        HK.General_config = targetCfg;
      });
  };

  HK.slideshow = HK.slideshow || {};

  (function (SS) {
    /**
     * Interner Laufzeitstatus.
     */
    SS.state = {
      running: false,
      index: 0,
      effectIndex: 0,
      images: [],
      nextTimer: null,
      token: 0,
      preloaded: {},
      isAnimating: false,
      timeline: null
    };

    /**
     * Liefert die aktuell verwendete General-Config.
     *
     * @returns {Object}
     */
    SS.getConfig = function () {
      return window.General_config || HK.General_config || {};
    };

    /**
     * Liefert die Slideshow-Teilkonfiguration.
     *
     * Erwartete Struktur:
     * {
     *   enabled: true/false,
     *   image_duration: 10,
     *   animation_duration: 500,
     *   animations: ["left", "right"]
     *      oder
     *   animations: { left: true, right: true, top: false, bottom: true },
     *   random_effect: true/false,
     *   images: {...} oder [...]
     * }
     *
     * @returns {Object}
     */
    SS.getSlideshowConfig = function () {
      const cfg = SS.getConfig();
      return cfg.slideshow || {};
    };

    /**
     * Prüft, ob GSAP verfügbar ist.
     *
     * @returns {boolean}
     */
    SS.hasGSAP = function () {
      return typeof gsap !== "undefined" && gsap;
    };

    /**
     * Sorgt dafür, dass der benötigte Container im Lock-Modal existiert.
     *
     * Struktur:
     * - ein Container
     * - ein "current" Layer
     * - ein "next" Layer
     *
     * @returns {jQuery|null}
     */
    SS.ensureContainer = function () {
      const $lock = $("#lockModal");
      if (!$lock.length) return null;

      let $container = $lock.children(".hk-slideshow-container");

      if (!$container.length) {
        $container = $(`
          <div class="hk-slideshow-container d-none" aria-hidden="true">
            <div class="hk-slideshow-layer hk-slideshow-current">
              <img alt="">
            </div>
            <div class="hk-slideshow-layer hk-slideshow-next">
              <img alt="">
            </div>
          </div>
        `);

        $lock.prepend($container);
      }

      return $container;
    };

    /**
     * Liefert Container + Layer in einem Zugriff.
     *
     * @returns {{ $container:jQuery, $current:jQuery, $next:jQuery }|null}
     */
    SS.getLayers = function () {
      const $container = SS.ensureContainer();
      if (!$container || !$container.length) return null;

      return {
        $container: $container,
        $current: $container.find(".hk-slideshow-current"),
        $next: $container.find(".hk-slideshow-next")
      };
    };

    /**
     * Wandelt die in der Config gespeicherten Bilder in ein Array um.
     *
     * Unterstützt:
     * - Arrays
     * - Objekte mit numerischen oder textuellen Keys
     *
     * @returns {string[]}
     */
    SS.getImagesArray = function () {
      const slideshow = SS.getSlideshowConfig();
      const raw = slideshow.images;

      if (!raw) return [];

      if (Array.isArray(raw)) {
        return raw.filter(Boolean);
      }

      if (typeof raw === "object") {
        return Object.keys(raw)
          .sort(function (a, b) {
            const na = parseInt(a, 10);
            const nb = parseInt(b, 10);

            if (!Number.isNaN(na) && !Number.isNaN(nb)) {
              return na - nb;
            }

            return String(a).localeCompare(String(b));
          })
          .map(function (k) {
            return raw[k];
          })
          .filter(Boolean);
      }

      return [];
    };

    /**
     * Stoppt alle aktiven Timer.
     */
    SS.clearTimers = function () {
      if (SS.state.nextTimer) {
        clearTimeout(SS.state.nextTimer);
        SS.state.nextTimer = null;
      }
    };

    /**
     * Stoppt eine evtl. laufende GSAP-Timeline.
     */
    SS.killAnimation = function () {
      if (SS.state.timeline) {
        SS.state.timeline.kill();
        SS.state.timeline = null;
      }
    };

    /**
     * Liest die konfigurierten Laufzeiten.
     *
     * @returns {{imageMs:number, animMs:number}}
     */
    SS.getDurations = function () {
      const slideshow = SS.getSlideshowConfig();

      const imageDuration = Math.max(parseInt(slideshow.image_duration || "10", 10), 1);
      const animationDuration = Math.max(parseInt(slideshow.animation_duration || "500", 10), 0);

      return {
        imageMs: imageDuration * 1000,
        animMs: animationDuration
      };
    };

    /**
     * Liefert die aktivierten Effekte.
     *
     * Unterstützt:
     * - Array: ["left", "right"]
     * - Objekt: { left:true, right:true, top:false, bottom:true }
     *
     * @returns {string[]}
     */
    SS.getEffects = function () {
      const slideshow = SS.getSlideshowConfig();
      const allowed = ["right", "top", "bottom", "left"];
      const raw = slideshow.animations;

      if (Array.isArray(raw)) {
        const filtered = raw.filter(function (v) {
          return allowed.includes(v);
        });
        return filtered.length ? filtered : ["right"];
      }

      if (raw && typeof raw === "object") {
        const filtered = Object.keys(raw).filter(function (key) {
          if (!allowed.includes(key)) return false;

          const val = raw[key];
          return (
            val === true ||
            val === 1 ||
            val === "1" ||
            String(val).toLowerCase() === "true"
          );
        });

        return filtered.length ? filtered : ["right"];
      }

      return ["right"];
    };

    /**
     * Wählt den nächsten Effekt.
     *
     * random_effect = true:
     *   zufälliger Effekt aus den aktivierten Effekten
     *
     * random_effect = false:
     *   zyklische Rotation
     *
     * @returns {string}
     */
    SS.pickEffect = function () {
      const slideshow = SS.getSlideshowConfig();
      const effects = SS.getEffects();

      if (slideshow.random_effect) {
        return effects[Math.floor(Math.random() * effects.length)];
      }

      const effect = effects[SS.state.effectIndex % effects.length];
      SS.state.effectIndex += 1;
      return effect;
    };

    /**
     * Liefert Startposition für einen Effekt.
     *
     * @param {string} effect
     * @returns {{xPercent:number, yPercent:number}}
     */
    SS.getEffectVector = function (effect) {
      switch (effect) {
        case "left":
          return { xPercent: -100, yPercent: 0 };
        case "right":
          return { xPercent: 100, yPercent: 0 };
        case "top":
          return { xPercent: 0, yPercent: -100 };
        case "bottom":
          return { xPercent: 0, yPercent: 100 };
        default:
          return { xPercent: 100, yPercent: 0 };
      }
    };

    /**
     * Setzt das Bild eines Layers.
     *
     * @param {jQuery} $layer
     * @param {string|null} src
     */
       /**
     * Setzt das Bild eines Layers.
     *
     * Zusätzlich werden automatisch Format-Klassen gesetzt:
     * - portrait
     * - landscape
     * - square
     *
     * @param {jQuery} $layer
     * @param {string|null} src
     */
    SS.setImage = function ($layer, src) {
      const $img = $layer.find("img");
      if (!$img.length) return;

      $img.off(".hkssOrientation");
      $img.removeClass("portrait landscape square");

      if (!src) {
        $img.removeAttr("src");
        return;
      }

      function applyOrientation() {
        SS.applyImageOrientationClass($img);
      }

      $img.on("load.hkssOrientation", function () {
        applyOrientation();
      });

      $img.on("error.hkssOrientation", function () {
        $img.removeClass("portrait landscape square");
      });

      $img.attr("src", src);

      if ($img[0].complete && $img[0].naturalWidth) {
        applyOrientation();
      }
    };

    /**
     * Setzt GSAP-Zustand der Layer zurück.
     *
     * @param {{ $current:jQuery, $next:jQuery }} layers
     */
    SS.resetLayerTransforms = function (layers) {
      if (!layers) return;

      if (SS.hasGSAP()) {
        gsap.set(layers.$current[0], {
          xPercent: 0,
          yPercent: 0,
          opacity: 1,
          clearProps: "x,y"
        });

        gsap.set(layers.$next[0], {
          xPercent: 0,
          yPercent: 0,
          opacity: 1,
          clearProps: "x,y"
        });
      } else {
        layers.$current.css({
          transform: "translate3d(0,0,0)",
          opacity: 1
        });

        layers.$next.css({
          transform: "translate3d(0,0,0)",
          opacity: 1
        });
      }
    };

    /**
     * Lädt ein Bild vor.
     *
     * @param {string} src
     * @returns {Promise}
     */
    SS.preloadImage = function (src) {
      const dfd = $.Deferred();

      if (!src) {
        dfd.reject(src);
        return dfd.promise();
      }

      if (SS.state.preloaded[src]) {
        dfd.resolve(src);
        return dfd.promise();
      }

      const img = new Image();

      img.onload = function () {
        SS.state.preloaded[src] = true;

        if (typeof img.decode === "function") {
          img.decode()
            .catch(function () {
              // decode kann fehlschlagen, onload reicht als Fallback
            })
            .finally(function () {
              dfd.resolve(src);
            });
        } else {
          dfd.resolve(src);
        }
      };

      img.onerror = function () {
        dfd.reject(src);
      };

      img.src = src;

      return dfd.promise();
    };

    /**
     * Lädt das nächste Bild vor.
     */
    SS.preloadNeighbors = function () {
      if (!SS.state.images.length) return;

      const nextIndex = (SS.state.index + 1) % SS.state.images.length;
      const nextSrc = SS.state.images[nextIndex];

      SS.preloadImage(nextSrc);
    };

    /**
     * Rendert das erste Bild ohne Animation.
     */
    SS.renderInitial = function () {
      const layers = SS.getLayers();
      if (!layers || !SS.state.images.length) return;

      SS.killAnimation();
      SS.resetLayerTransforms(layers);

      SS.setImage(layers.$current, SS.state.images[SS.state.index]);
      SS.setImage(layers.$next, null);

      layers.$container.removeClass("d-none");
      SS.preloadNeighbors();
    };

    /**
     * Plant den nächsten Bildwechsel.
     */
    SS.scheduleNext = function () {
      if (!SS.state.running) return;
      if (SS.state.isAnimating) return;

      const d = SS.getDurations();

      SS.clearTimers();

      SS.state.nextTimer = setTimeout(function () {
        SS.showNext();
      }, d.imageMs);
    };

    /**
     * Fallback ohne GSAP:
     * Sofortiger Bildwechsel ohne Richtungsanimation.
     *
     * @param {string} nextSrc
     * @param {Function} onDone
     */
    SS.swapWithoutGSAP = function (nextSrc, onDone) {
      const layers = SS.getLayers();
      if (!layers) {
        if (typeof onDone === "function") onDone();
        return;
      }

      SS.setImage(layers.$current, nextSrc);
      SS.setImage(layers.$next, null);
      SS.resetLayerTransforms(layers);

      if (typeof onDone === "function") {
        onDone();
      }
    };

    /**
     * Führt den Übergang zum nächsten Bild mit GSAP aus.
     *
     * @param {string} nextSrc
     * @param {string} effect
     * @param {Function} onDone
     */
    SS.animateToNext = function (nextSrc, effect, onDone) {
      const layers = SS.getLayers();
      if (!layers) {
        if (typeof onDone === "function") onDone();
        return;
      }

      if (!SS.hasGSAP()) {
        console.warn("[slideshow] GSAP not loaded - fallback without slide animation");
        SS.swapWithoutGSAP(nextSrc, onDone);
        return;
      }

      const d = SS.getDurations();
      const vec = SS.getEffectVector(effect);

      SS.killAnimation();
      SS.resetLayerTransforms(layers);

      SS.setImage(layers.$next, nextSrc);

      gsap.set(layers.$current[0], {
        xPercent: 0,
        yPercent: 0,
        opacity: 1
      });

      gsap.set(layers.$next[0], {
        xPercent: vec.xPercent,
        yPercent: vec.yPercent,
        opacity: 1
      });

      SS.state.timeline = gsap.timeline({
        defaults: {
          duration: d.animMs / 1000,
          ease: "power2.out"
        },
        onComplete: function () {
          SS.state.timeline = null;
          if (typeof onDone === "function") {
            onDone();
          }
        }
      });

      SS.state.timeline
        .to(layers.$current[0], {
          opacity: 0.82
        }, 0)
        .to(layers.$next[0], {
          xPercent: 0,
          yPercent: 0
        }, 0);
    };

    /**
     * Führt den Wechsel zum nächsten Bild aus.
     */
    SS.showNext = function () {
      if (!SS.state.running) return;
      if (!SS.state.images.length) return;
      if (SS.state.isAnimating) return;

      // Bei nur einem Bild aktiv bleiben, aber nichts animieren.
      if (SS.state.images.length === 1) {
        SS.scheduleNext();
        return;
      }

      const token = SS.state.token;
      const nextIndex = (SS.state.index + 1) % SS.state.images.length;
      const nextSrc = SS.state.images[nextIndex];
      const effect = SS.pickEffect();

      SS.state.isAnimating = true;
      SS.clearTimers();

      SS.preloadImage(nextSrc)
        .done(function () {
          if (!SS.state.running || SS.state.token !== token) {
            SS.state.isAnimating = false;
            return;
          }

          SS.animateToNext(nextSrc, effect, function () {
            if (!SS.state.running || SS.state.token !== token) {
              SS.state.isAnimating = false;
              return;
            }

            const layers = SS.getLayers();
            if (!layers) {
              SS.state.isAnimating = false;
              return;
            }

            SS.state.index = nextIndex;
            SS.state.isAnimating = false;

            SS.setImage(layers.$current, nextSrc);
            SS.setImage(layers.$next, null);
            SS.resetLayerTransforms(layers);

            SS.preloadNeighbors();
            SS.scheduleNext();
          });
        })
        .fail(function () {
          console.warn("[slideshow] preload failed:", nextSrc);
          SS.state.isAnimating = false;
          SS.scheduleNext();
        });
    };

    /**
     * Startet die Diashow im Lock-Modal.
     *
     * @returns {Promise}
     */
    SS.start = function () {
      const slideshow = SS.getSlideshowConfig();

      if (!slideshow.enabled) {
        SS.stop();
        return $.Deferred().resolve(null).promise();
      }

      let images = SS.getImagesArray();

      if (!images.length && typeof HK.loadSlideshowImages === "function") {
        return HK.loadSlideshowImages().done(function () {
          const isVisible = $("#lockModal").is(":visible");
          if (isVisible) {
            SS.start();
          }
        });
      }

      if (!images.length) {
        console.warn("[slideshow] no images available");
        SS.stop();
        return $.Deferred().resolve(null).promise();
      }

      SS.stop();

      SS.state.token += 1;
      SS.state.running = true;
      SS.state.index = 0;
      SS.state.effectIndex = 0;
      SS.state.images = images;
      SS.state.isAnimating = false;

      SS.preloadImage(images[0]).always(function () {
        if (!SS.state.running) return;

        SS.renderInitial();
        SS.scheduleNext();

        $(document).trigger("slideshowStarted", [images, SS.getConfig()]);
      });

      return $.Deferred().resolve(images).promise();
    };

    /**
     * Stoppt die Diashow vollständig.
     */
    SS.stop = function () {
      SS.state.token += 1;
      SS.state.running = false;
      SS.state.isAnimating = false;

      SS.clearTimers();
      SS.killAnimation();

      const $container = $("#lockModal .hk-slideshow-container");
      if ($container.length) {
        const $current = $container.find(".hk-slideshow-current");
        const $next = $container.find(".hk-slideshow-next");

        SS.setImage($current, null);
        SS.setImage($next, null);

        if (SS.hasGSAP()) {
          gsap.set($current[0], {
            xPercent: 0,
            yPercent: 0,
            opacity: 1,
            clearProps: "transform,opacity"
          });

          gsap.set($next[0], {
            xPercent: 0,
            yPercent: 0,
            opacity: 1,
            clearProps: "transform,opacity"
          });
        } else {
          $current.css({
            transform: "",
            opacity: ""
          });

          $next.css({
            transform: "",
            opacity: ""
          });
        }

        $container.addClass("d-none");
      }

      $(document).trigger("slideshowStopped");
    };

     /**
     * Setzt je nach echtem Bildformat eine CSS-Klasse auf das <img>.
     *
     * Klassen:
     * - portrait
     * - landscape
     * - square
     *
     * @param {jQuery} $img
     */
    SS.applyImageOrientationClass = function ($img) {
      const el = $img && $img[0];
      if (!el) return;

      $img.removeClass("portrait landscape square");

      const w = el.naturalWidth || 0;
      const h = el.naturalHeight || 0;

      if (!w || !h) return;

      if (h > w) {
        $img.addClass("portrait");
      } else if (w > h) {
        $img.addClass("landscape");
      } else {
        $img.addClass("square");
      }
    };

  })(HK.slideshow);

})(jQuery);