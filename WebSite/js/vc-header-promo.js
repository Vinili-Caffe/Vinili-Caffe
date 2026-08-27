(function () {
  function readCfg() {
    try {
      return window.__VC_HEADER_PROMO || null;
    } catch (e) {
      return null;
    }
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v != null && String(v) !== "" && String(v) !== key) return String(v);
      }
    } catch (e) {}
    return fallback;
  }

  function parseStartMs(value) {
    var d = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return NaN;
    var ms = new Date(d.indexOf("T") >= 0 ? d : d + "T00:00:00").getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function parseEndMs(value) {
    var d = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return NaN;
    var ms = new Date(d.indexOf("T") >= 0 ? d : d + "T23:59:59.999").getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function isEventHeaderPage() {
    try {
      if (document.body && document.body.classList.contains("vc-hw-page")) return true;
      var path = String(window.location.pathname || "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      return path === "/evento" || path.indexOf("/evento/") === 0;
    } catch (e) {
      return false;
    }
  }

  function resolveMode(cfg) {
    var event = cfg && cfg.event;
    if (!event || event.enabled === false) return isEventHeaderPage() ? "" : "candidature";
    if (event.previewMode === true) return isEventHeaderPage() ? "" : "candidature";
    var start = Number(event.startMs);
    var end = Number(event.endMs);
    if (!Number.isFinite(start)) {
      start = parseStartMs(event.sortingStartDate || event.startDate);
    }
    if (!Number.isFinite(end)) {
      end = parseEndMs(event.endDate);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return isEventHeaderPage() ? "" : "candidature";
    var now = Date.now();
    if (now < start || now > end) return isEventHeaderPage() ? "" : "candidature";
    return "event";
  }

  function clearPromoClone(trackEl) {
    if (!trackEl) return;
    var clone = trackEl.querySelector(".vc-header-promo-btn__unit.is-clone");
    if (clone) clone.remove();
  }

  function applyMarqueeMetrics(btn, clip, unitEl, trackEl) {
    if (!btn || btn.hidden) return;
    var clipW = Math.floor(clip.clientWidth || clip.getBoundingClientRect().width || 0);
    var unitW = Math.ceil(unitEl.getBoundingClientRect().width || unitEl.scrollWidth || 0);
    var active = btn.classList.contains("is-marquee");
    var overflow = clipW >= 4 && unitW > clipW + (active ? 4 : 8);
    if (!overflow) {
      btn.classList.remove("is-marquee");
      btn.style.removeProperty("--vc-promo-marquee-distance");
      btn.style.removeProperty("--vc-promo-marquee-duration");
      unitEl.style.paddingInlineEnd = "";
      clearPromoClone(trackEl);
      return;
    }
    ensureClone(trackEl, unitEl);
    unitEl.style.paddingInlineEnd = "2rem";
    var segmentW = Math.ceil(unitEl.getBoundingClientRect().width || unitW);
    if (segmentW < 8) segmentW = unitW;
    if (segmentW < 8) segmentW = 96;
    btn.style.setProperty("--vc-promo-marquee-distance", segmentW + "px");
    var duration = Math.max(8, Math.min(22, segmentW / 22));
    btn.style.setProperty("--vc-promo-marquee-duration", duration.toFixed(1) + "s");
    btn.classList.add("is-marquee");
  }

  function ensureClone(trackEl, unitEl) {
    var clone = trackEl.querySelector(".vc-header-promo-btn__unit.is-clone");
    if (!clone) {
      clone = unitEl.cloneNode(true);
      clone.classList.add("is-clone");
      clone.setAttribute("aria-hidden", "true");
      trackEl.appendChild(clone);
    }
    return clone;
  }

  function ensureMarquee(btn) {
    if (!btn || btn.hidden) return;
    var clip = btn.querySelector(".vc-header-promo-btn__clip");
    var label = btn.querySelector(".vc-header-promo-btn__label");
    var badge = btn.querySelector(".vc-header-promo-btn__badge");
    if (!label || !badge) return;
    if (!clip) {
      clip = document.createElement("span");
      clip.className = "vc-header-promo-btn__clip";
      var track = document.createElement("span");
      track.className = "vc-header-promo-btn__track";
      var unit = document.createElement("span");
      unit.className = "vc-header-promo-btn__unit";
      unit.appendChild(label);
      unit.appendChild(badge);
      track.appendChild(unit);
      clip.appendChild(track);
      var dot = btn.querySelector(".vc-header-promo-btn__dot");
      if (dot && dot.nextSibling) btn.insertBefore(clip, dot.nextSibling);
      else btn.appendChild(clip);
    }
    var trackEl = clip.querySelector(".vc-header-promo-btn__track");
    var unitEl = clip.querySelector(".vc-header-promo-btn__unit:not(.is-clone)");
    if (!trackEl || !unitEl) return;
    unitEl.style.paddingInlineEnd = "";
    btn.classList.remove("is-marquee");
    clearPromoClone(trackEl);

    function measure() {
      applyMarqueeMetrics(btn, clip, unitEl, trackEl);
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(measure);
    });
    window.setTimeout(measure, 80);
    window.setTimeout(measure, 240);
    window.setTimeout(measure, 640);
  }

  function applyMode(btn, cfg, mode) {
    if (!btn || !cfg) return;
    if (!mode) {
      btn.hidden = true;
      btn.setAttribute("hidden", "");
      return;
    }
    btn.hidden = false;
    btn.removeAttribute("hidden");
    var isEvent = mode === "event";
    var href = isEvent ? cfg.eventUrl : cfg.candidatureUrl;
    var label = isEvent
      ? t("header.promo.eventLabel", "Evento")
      : t("header.promo.appsLabel", "Candidature");
    var badge = isEvent
      ? t("header.promo.eventBadge", "ATTIVO")
      : t("header.promo.appsBadge", "APERTE");
    btn.href = href || (isEvent ? "/evento" : "/candidature");
    btn.classList.remove("vc-header-promo-btn--event", "vc-header-promo-btn--candidature");
    btn.classList.add(isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature");
    // Prefer visible label+badge for accessible name (avoids text-transform mismatch).
    btn.removeAttribute("aria-label");
    var labelEls = btn.querySelectorAll(".vc-header-promo-btn__label");
    var badgeEls = btn.querySelectorAll(".vc-header-promo-btn__badge");
    var i;
    for (i = 0; i < labelEls.length; i += 1) labelEls[i].textContent = label;
    for (i = 0; i < badgeEls.length; i += 1) badgeEls[i].textContent = badge;
    try {
      var path = String(window.location.pathname || "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      var target = String(href || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      if (path === target) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    } catch (eCur) {}
    ensureMarquee(btn);
  }

  function buildPromoButtonShell(mode) {
    var isEvent = mode === "event";
    var modClass = isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature";
    var label = isEvent ? t("header.promo.eventLabel", "Evento") : t("header.promo.appsLabel", "Candidature");
    var badge = isEvent ? t("header.promo.eventBadge", "ATTIVO") : t("header.promo.appsBadge", "APERTE");
    var btn = document.createElement("a");
    btn.className = "vc-header-promo-btn " + modClass;
    btn.id = "vc-header-promo-btn";
    btn.innerHTML =
      '<span class="vc-header-promo-btn__dot" aria-hidden="true"></span>' +
      '<span class="vc-header-promo-btn__clip"><span class="vc-header-promo-btn__track">' +
      '<span class="vc-header-promo-btn__unit"><span class="vc-header-promo-btn__label">' +
      label +
      '</span><span class="vc-header-promo-btn__badge">' +
      badge +
      "</span></span></span></span>";
    return btn;
  }

  function ensurePromoButton(cfg, mode) {
    var existing = document.getElementById("vc-header-promo-btn");
    if (existing) return existing;
    if (!cfg || !mode) return null;
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return null;
    var btn = buildPromoButtonShell(mode);
    var notif = document.getElementById("vc-notif-dropdown");
    if (notif && notif.parentElement === actions) actions.insertBefore(btn, notif);
    else actions.insertBefore(btn, actions.firstChild);
    return btn;
  }

  function boot() {
    var cfg = readCfg();
    var mode = cfg ? resolveMode(cfg) : "";
    var btn = ensurePromoButton(cfg, mode) || document.getElementById("vc-header-promo-btn");
    if (!btn) return;
    if (cfg) applyMode(btn, cfg, mode);
    else ensureMarquee(btn);
    if (!btn.__vcPromoMarqueeResize) {
      btn.__vcPromoMarqueeResize = true;
      var resizeTimer = 0;
      var onResize = function () {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          resizeTimer = 0;
          ensureMarquee(btn);
        }, 150);
      };
      window.addEventListener("resize", onResize, { passive: true });
      if (typeof ResizeObserver === "function") {
        try {
          var ro = new ResizeObserver(onResize);
          ro.observe(btn);
        } catch (eRo) {}
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          ensureMarquee(btn);
        }).catch(function () {});
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("vc:langchange", boot);
})();
