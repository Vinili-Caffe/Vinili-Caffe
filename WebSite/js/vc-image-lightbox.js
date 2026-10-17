/* 20260927compitiUx1 — in-site image viewer + compiti proofs gallery */
(function (global) {
  "use strict";

  if (global.VcImageLightbox && global.VcImageLightbox.__vcImgLightboxCompiti1) return;

  var ROOT_ID = "vc-image-lightbox";
  var CSS_HREF = "/css/vc-image-lightbox.css?v=20260927compitiUx1";
  var state = {
    open: false,
    items: [],
    index: 0,
    zoom: 1,
    lastFocus: null,
    keyHandler: null,
    touch: null,
  };

  var GALLERY_SEL =
    ".vc-wt-msg__gallery, .vc-bot-feedback-images, .vc-wfc-media, [data-vc-lightbox-gallery], #vc-compiti-proofs, .vc-compiti-proofs";
  var MEDIA_ANCHOR_SEL =
    "a.vc-wt-msg__img, a.vc-wt-msg__img-inline, a.vc-wfc-media__img, .vc-bot-feedback-images > a, a[data-vc-lightbox], a.vc-compiti-proof";
  var SKIP_SEL =
    [
      "a.vc-header-logo-link",
      ".vc-header-logo-img",
      ".vc-home-cine__photo",
      ".vc-avatar",
      "[data-vc-avatar]",
      ".vc-discord-login-emoji",
      ".vc-premium-footer__social",
      ".vc-wfc-react__emoji",
      ".vc-wt-mention-menu__av",
      ".vc-cmd-acc-avatar",
      ".vc-cmd-tab-avatar",
      ".vc-role-seg-switch__roleico",
      ".vc-candidature-role-card__ico",
      ".vc-role-modal-iconimg",
      "[data-vc-lightbox-ignore]",
      "button",
      "input",
      "textarea",
      "select",
      "label",
    ].join(",");

  function ensureCss() {
    try {
      var existing = document.getElementById("vc-image-lightbox-css");
      if (existing) {
        try {
          if (existing.getAttribute("href") && existing.getAttribute("href").indexOf("imgLightbox2") < 0) {
            existing.setAttribute("href", CSS_HREF);
          }
        } catch (eHref) {}
        return;
      }
      if (document.querySelector('link[href*="vc-image-lightbox.css"]')) return;
      var link = document.createElement("link");
      link.id = "vc-image-lightbox-css";
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      (document.head || document.documentElement).appendChild(link);
    } catch (eCss) {}
  }

  function isImageUrl(raw) {
    var u = String(raw || "").trim();
    if (!u || u === "#" || /^javascript:/i.test(u)) return false;
    if (/\.(gif|png|jpe?g|webp|avif|bmp|svg)(\?|#|$)/i.test(u)) return true;
    if (/cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments/i.test(u)) return true;
    if (/media\.tenor\.com|tenor\.com\/.*\.gif|giphy\.com\/media/i.test(u)) return true;
    if (/\/webhooks\/site-(?:web-tickets|bot-feedback|suggestions|[^/]+-workflow-chat)\/files\//i.test(u)) {
      return !/\.(mp4|webm|mov|mp3|wav|ogg|pdf|zip)(\?|#|$)/i.test(u);
    }
    if (/\/(?:uploads|files|attachments|media)\//i.test(u) && !/\.(mp4|webm|mov|mp3|wav|ogg|pdf|zip)(\?|#|$)/i.test(u)) {
      return true;
    }
    return false;
  }

  function isVideoUrl(raw) {
    return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(raw || ""));
  }

  function normalizeUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return "";
    try {
      return new URL(u, global.location && global.location.href).href;
    } catch (e) {
      return u;
    }
  }

  function shouldSkip(el) {
    if (!el || !el.closest) return true;
    if (el.closest(SKIP_SEL)) return true;
    if (el.closest(".vc-wt-msg__img--video")) return true;
    return false;
  }

  function linkImageHref(a) {
    if (!a || !a.getAttribute) return "";
    var href = a.getAttribute("href") || "";
    if (!isImageUrl(href) || isVideoUrl(href)) return "";
    return normalizeUrl(href);
  }

  function imgSource(img) {
    if (!img) return "";
    var src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (!isImageUrl(src) || isVideoUrl(src)) return "";
    return normalizeUrl(src);
  }

  function collectFromGallery(gallery, preferUrl) {
    var items = [];
    var seen = Object.create(null);
    var nodes = gallery.querySelectorAll("a[href], img");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (shouldSkip(node)) continue;
      var url = "";
      if (node.tagName === "A") {
        if (node.classList && node.classList.contains("vc-wt-msg__img--video")) continue;
        url = linkImageHref(node);
      } else {
        var wrap = node.closest && node.closest("a[href]");
        if (wrap && wrap.classList && wrap.classList.contains("vc-wt-msg__img--video")) continue;
        url = wrap ? linkImageHref(wrap) || imgSource(node) : imgSource(node);
      }
      if (!url || seen[url]) continue;
      seen[url] = 1;
      items.push({ url: url, alt: (node.getAttribute && node.getAttribute("alt")) || "" });
    }
    var index = 0;
    if (preferUrl) {
      for (var j = 0; j < items.length; j += 1) {
        if (items[j].url === preferUrl) {
          index = j;
          break;
        }
      }
    }
    return { items: items, index: index };
  }

  function resolveClickTarget(ev) {
    var t = ev.target;
    if (!t || !t.closest) return null;
    if (shouldSkip(t)) return null;

    var a = t.closest("a[href]");
    if (a) {
      if (shouldSkip(a)) return null;
      if (a.classList && a.classList.contains("vc-wt-msg__img--video")) return null;
      var href = linkImageHref(a);
      if (!href) return null;
      var gallery = a.closest(GALLERY_SEL);
      if (gallery) return collectFromGallery(gallery, href);
      var img = a.querySelector("img");
      return {
        items: [{ url: href, alt: (img && img.getAttribute("alt")) || a.getAttribute("aria-label") || "" }],
        index: 0,
      };
    }

    var imgOnly = t.closest("img");
    if (!imgOnly || shouldSkip(imgOnly)) return null;
    var gallery2 = imgOnly.closest(GALLERY_SEL);
    var src = imgSource(imgOnly);
    if (!src) return null;
    if (gallery2) return collectFromGallery(gallery2, src);
    if (
      imgOnly.hasAttribute("data-vc-lightbox") ||
      imgOnly.classList.contains("vc-lightboxable") ||
      imgOnly.closest(MEDIA_ANCHOR_SEL)
    ) {
      return { items: [{ url: src, alt: imgOnly.getAttribute("alt") || "" }], index: 0 };
    }
    return null;
  }

  function ensureRoot() {
    ensureCss();
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "vc-img-lb";
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<button type="button" class="vc-img-lb__backdrop" data-vc-lb="close" aria-label="Chiudi"></button>' +
      '<div class="vc-img-lb__stage" role="dialog" aria-modal="true" aria-label="Anteprima immagine">' +
      '<div class="vc-img-lb__toolbar">' +
      '<span class="vc-img-lb__counter" id="vc-img-lb-counter" aria-live="polite"></span>' +
      '<div class="vc-img-lb__actions">' +
      '<button type="button" class="vc-img-lb__btn" data-vc-lb="zoom-out" aria-label="Riduci zoom" title="Riduci">' +
      '<i class="fa fa-search-minus" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-img-lb__btn" data-vc-lb="zoom-in" aria-label="Ingrandisci" title="Ingrandisci">' +
      '<i class="fa fa-search-plus" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-img-lb__btn" data-vc-lb="zoom-reset" aria-label="Reimposta zoom" title="1:1">' +
      '<i class="fa fa-compress" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-img-lb__btn vc-img-lb__btn--close" data-vc-lb="close" aria-label="Chiudi" title="Chiudi (Esc)">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<button type="button" class="vc-img-lb__nav vc-img-lb__nav--prev" data-vc-lb="prev" aria-label="Precedente" hidden>' +
      '<i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-img-lb__nav vc-img-lb__nav--next" data-vc-lb="next" aria-label="Successiva" hidden>' +
      '<i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      '<div class="vc-img-lb__frame" id="vc-img-lb-frame">' +
      '<img class="vc-img-lb__img" id="vc-img-lb-img" alt="" draggable="false" />' +
      "</div></div>";
    document.body.appendChild(root);

    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-lb]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-vc-lb");
      if (action === "close") close();
      else if (action === "prev") show(state.index - 1);
      else if (action === "next") show(state.index + 1);
      else if (action === "zoom-in") setZoom(state.zoom + 0.25);
      else if (action === "zoom-out") setZoom(state.zoom - 0.25);
      else if (action === "zoom-reset") setZoom(1);
    });

    var frame = root.querySelector("#vc-img-lb-frame");
    if (frame) {
      frame.addEventListener(
        "wheel",
        function (ev) {
          if (!state.open) return;
          ev.preventDefault();
          setZoom(state.zoom + (ev.deltaY < 0 ? 0.15 : -0.15));
        },
        { passive: false },
      );
      frame.addEventListener(
        "dblclick",
        function () {
          if (!state.open) return;
          setZoom(state.zoom > 1.05 ? 1 : 2);
        },
        false,
      );
      frame.addEventListener(
        "touchstart",
        function (ev) {
          if (!state.open || !ev.touches || ev.touches.length !== 1) return;
          state.touch = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
        },
        { passive: true },
      );
      frame.addEventListener(
        "touchend",
        function (ev) {
          if (!state.touch || !ev.changedTouches || !ev.changedTouches.length) return;
          var dx = ev.changedTouches[0].clientX - state.touch.x;
          var dy = ev.changedTouches[0].clientY - state.touch.y;
          var dt = Date.now() - state.touch.t;
          state.touch = null;
          if (dt > 500 || Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          if (state.items.length < 2 || state.zoom > 1.05) return;
          if (dx < 0) show(state.index + 1);
          else show(state.index - 1);
        },
        { passive: true },
      );
    }
    return root;
  }

  function setZoom(z) {
    state.zoom = Math.max(1, Math.min(4, Number(z) || 1));
    var img = document.getElementById("vc-img-lb-img");
    if (img) img.style.transform = "scale(" + state.zoom + ")";
    var frame = document.getElementById("vc-img-lb-frame");
    if (frame) frame.classList.toggle("is-zoomed", state.zoom > 1.01);
  }

  function updateChrome() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    var n = state.items.length;
    var multi = n > 1;
    var prev = root.querySelector('[data-vc-lb="prev"]');
    var next = root.querySelector('[data-vc-lb="next"]');
    if (prev) prev.hidden = !multi;
    if (next) next.hidden = !multi;
    var counter = document.getElementById("vc-img-lb-counter");
    if (counter) counter.textContent = multi ? state.index + 1 + " / " + n : "";
  }

  function show(index) {
    if (!state.items.length) return;
    var n = state.items.length;
    state.index = ((index % n) + n) % n;
    var item = state.items[state.index];
    var img = document.getElementById("vc-img-lb-img");
    if (img) {
      img.alt = item.alt || "";
      img.removeAttribute("src");
      img.src = item.url;
    }
    setZoom(1);
    updateChrome();
  }

  function onKey(ev) {
    if (!state.open) return;
    var key = ev.key || "";
    if (key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    } else if (key === "ArrowLeft") {
      ev.preventDefault();
      show(state.index - 1);
    } else if (key === "ArrowRight") {
      ev.preventDefault();
      show(state.index + 1);
    } else if (key === "+" || key === "=") {
      ev.preventDefault();
      setZoom(state.zoom + 0.25);
    } else if (key === "-" || key === "_") {
      ev.preventDefault();
      setZoom(state.zoom - 0.25);
    } else if (key === "0") {
      ev.preventDefault();
      setZoom(1);
    }
  }

  function open(items, startIndex) {
    var list = Array.isArray(items)
      ? items
          .map(function (it) {
            if (!it) return null;
            if (typeof it === "string") return { url: normalizeUrl(it), alt: "" };
            var url = normalizeUrl(it.url || it.src || "");
            if (!url || !isImageUrl(url) || isVideoUrl(url)) return null;
            return { url: url, alt: String(it.alt || "") };
          })
          .filter(Boolean)
      : [];
    if (!list.length) return false;
    ensureRoot();
    state.items = list;
    state.index = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));
    state.lastFocus = document.activeElement;
    var root = document.getElementById(ROOT_ID);
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    try {
      document.documentElement.classList.add("vc-img-lb-open");
    } catch (eCls) {}
    try {
      if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll({ soft: true });
    } catch (ePin) {}
    state.open = true;
    if (!state.keyHandler) {
      state.keyHandler = onKey;
      document.addEventListener("keydown", state.keyHandler, true);
    }
    show(state.index);
    var closeBtn = root.querySelector(".vc-img-lb__btn--close");
    if (closeBtn && closeBtn.focus) {
      try {
        closeBtn.focus({ preventScroll: true });
      } catch (eF) {
        try {
          closeBtn.focus();
        } catch (eF2) {}
      }
    }
    return true;
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.items = [];
    state.touch = null;
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler, true);
      state.keyHandler = null;
    }
    var root = document.getElementById(ROOT_ID);
    if (root) {
      root.classList.remove("is-open");
      root.setAttribute("hidden", "");
      root.setAttribute("aria-hidden", "true");
    }
    try {
      document.documentElement.classList.remove("vc-img-lb-open");
    } catch (eCls2) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcUnpinPageScroll === "function") global.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    var img = document.getElementById("vc-img-lb-img");
    if (img) {
      img.removeAttribute("src");
      img.style.transform = "";
    }
    var focusEl = state.lastFocus;
    state.lastFocus = null;
    if (focusEl && focusEl.focus) {
      try {
        focusEl.focus({ preventScroll: true });
      } catch (eFocus) {}
    }
  }

  function onDocClick(ev) {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (state.open) return;
    var resolved = resolveClickTarget(ev);
    if (!resolved || !resolved.items || !resolved.items.length) return;
    try {
      ev.preventDefault();
    } catch (ePrev) {}
    try {
      ev.stopPropagation();
    } catch (eStop) {}
    try {
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    } catch (eImm) {}
    open(resolved.items, resolved.index);
  }

  function boot() {
    ensureCss();
    if (document.__vcImgLightboxBound2) return;
    document.__vcImgLightboxBound2 = true;
    /* Capture + early bind: must win over PWA _blank→assignInApp when possible. */
    document.addEventListener("click", onDocClick, true);
    /* perfRoiPack2: replay first click that triggered on-demand lazy load (stub sets
       window.__vcImgLightboxPendingClick before injecting this script). */
    try {
      var _pc = global.__vcImgLightboxPendingClick;
      if (_pc && _pc.target) {
        global.__vcImgLightboxPendingClick = null;
        var _pr = resolveClickTarget({ target: _pc.target, button: 0 });
        if (_pr && _pr.items && _pr.items.length) open(_pr.items, _pr.index);
      }
    } catch (_ePc) {}
  }

  var api = {
    __vcImgLightboxCompiti1: true,
    __vcImgLightbox2: true,
    __vcImgLightbox1: true,
    open: open,
    close: close,
    isOpen: function () {
      return state.open;
    },
    isImageUrl: isImageUrl,
  };
  global.VcImageLightbox = api;

  boot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureCss);
  }
})(typeof window !== "undefined" ? window : this);
