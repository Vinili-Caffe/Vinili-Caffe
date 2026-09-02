(function () {
  var PROMO_VER = "20260902headerMarqueeFix5";

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

  function isCompactNav() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 1199.98px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    return false;
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
    if (isEventHeaderPage()) return "";
    return "event";
  }

  function labelTextForMode(isEvent) {
    if (isEvent) return t("header.promo.eventLabel", "Evento");
    return t("header.promo.appsLabel", "Candidature");
  }

  function badgeTextForMode(isEvent) {
    if (isCompactNav()) {
      return isEvent
        ? t("header.promo.eventBadgeShort", "LIVE")
        : t("header.promo.appsBadge", "APERTE");
    }
    return isEvent ? t("header.promo.eventBadgeShort", "ATTIVO") : t("header.promo.appsBadge", "APERTE");
  }

  function normalizePromoDom(btn) {
    if (!btn) return;
    btn.classList.remove(
      "is-marquee",
      "vc-header-promo-btn--event-mobile-split",
      "vc-header-promo-btn--event-marquee-full",
      "vc-header-promo-btn--mobile-marquee",
      "vc-header-promo-btn--candidature-mobile-marquee",
    );
    btn.style.removeProperty("--vc-promo-marquee-distance");
    btn.style.removeProperty("--vc-promo-marquee-duration");
    btn.style.removeProperty("max-width");

    var clip = btn.querySelector(".vc-header-promo-btn__clip");
    var track = clip && clip.querySelector(".vc-header-promo-btn__track");
    var unit = track && track.querySelector(".vc-header-promo-btn__unit:not(.is-clone)");
    var label = btn.querySelector(".vc-header-promo-btn__label");
    var badge = btn.querySelector(".vc-header-promo-btn__badge");
    if (!clip || !track || !unit || !label || !badge) return;

    var clone = track.querySelector(".vc-header-promo-btn__unit.is-clone");
    if (clone) clone.remove();

    if (label.parentElement !== unit) unit.insertBefore(label, unit.firstChild || badge);
    if (badge.parentElement !== unit) unit.appendChild(badge);

    label.hidden = false;
    label.removeAttribute("hidden");
    label.style.removeProperty("display");
    badge.hidden = false;
    badge.removeAttribute("hidden");
    badge.removeAttribute("aria-hidden");
    badge.style.removeProperty("display");

    track.style.transform = "";
    unit.style.paddingInlineEnd = "";
    btn.removeAttribute("data-vc-promo-marquee-sig");
    btn.removeAttribute("data-vc-promo-marquee-dist");
  }

  function promoMarqueeSignature(btn) {
    var label = btn.querySelector(".vc-header-promo-btn__label");
    var badge = btn.querySelector(".vc-header-promo-btn__badge");
    return [
      label ? String(label.textContent || "").trim() : "",
      badge ? String(badge.textContent || "").trim() : "",
      isCompactNav() ? "compact" : "wide",
    ].join("|");
  }

  function promoMarqueeStable(btn) {
    if (!btn || !btn.classList.contains("is-marquee")) return false;
    var track = btn.querySelector(".vc-header-promo-btn__track");
    if (!track || !track.querySelector(".vc-header-promo-btn__unit.is-clone")) return false;
    if (promoMarqueeSignature(btn) !== btn.getAttribute("data-vc-promo-marquee-sig")) return false;
    var stored = Number(btn.getAttribute("data-vc-promo-marquee-dist") || 0);
    if (!Number.isFinite(stored) || stored <= 0) return false;
    void track.offsetWidth;
    var liveDist = Math.max(Math.round(track.scrollWidth / 2), 36);
    return Math.abs(liveDist - stored) <= 3;
  }

  function layoutPromoMarquee(btn) {
    if (!btn || btn.hidden) return;

    if (!isCompactNav()) {
      normalizePromoDom(btn);
      return;
    }

    if (promoMarqueeStable(btn)) return;

    normalizePromoDom(btn);

    var clip = btn.querySelector(".vc-header-promo-btn__clip");
    var track = clip && clip.querySelector(".vc-header-promo-btn__track");
    var unit = track && track.querySelector(".vc-header-promo-btn__unit:not(.is-clone)");
    if (!clip || !track || !unit) return;

    void btn.offsetWidth;
    var clipW = Math.floor(clip.getBoundingClientRect().width || clip.clientWidth || 0);
    var unitW = Math.ceil(unit.scrollWidth || unit.getBoundingClientRect().width || 0);
    if (unitW <= 0) return;
    if (!isCompactNav() && unitW <= clipW + 2) return;

    var gap = 10;
    unit.style.paddingInlineEnd = gap + "px";
    var cloneUnit = unit.cloneNode(true);
    cloneUnit.classList.add("is-clone");
    cloneUnit.setAttribute("aria-hidden", "true");
    track.appendChild(cloneUnit);

    void track.offsetWidth;
    var distance = Math.max(Math.round(track.scrollWidth / 2), 36);
    btn.style.setProperty("--vc-promo-marquee-distance", distance + "px");
    btn.style.setProperty("--vc-promo-marquee-duration", Math.max(5.5, distance / 22) + "s");
    btn.classList.add("is-marquee");
    btn.setAttribute("data-vc-promo-marquee-sig", promoMarqueeSignature(btn));
    btn.setAttribute("data-vc-promo-marquee-dist", String(distance));
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
    btn.href = href || (isEvent ? "/evento" : "/candidature");
    btn.classList.remove("vc-header-promo-btn--event", "vc-header-promo-btn--candidature", "vc-header-promo-btn--mobile-compact");
    btn.classList.add(isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature");
    if (isCompactNav()) btn.classList.add("vc-header-promo-btn--mobile-compact");
    btn.removeAttribute("aria-label");
    var labelEls = btn.querySelectorAll(".vc-header-promo-btn__label");
    var badgeEls = btn.querySelectorAll(".vc-header-promo-btn__badge");
    var label = labelTextForMode(isEvent);
    var badge = badgeTextForMode(isEvent);
    var i;
    for (i = 0; i < labelEls.length; i += 1) labelEls[i].textContent = label;
    for (i = 0; i < badgeEls.length; i += 1) badgeEls[i].textContent = badge;
    try {
      var path = String(window.location.pathname || "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      var target = String(href || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      if (path === target) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    } catch (eCur) {}

    layoutPromoMarquee(btn);
  }

  function buildPromoButtonShell(mode) {
    var isEvent = mode === "event";
    var modClass = isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature";
    var label = labelTextForMode(isEvent);
    var badge = badgeTextForMode(isEvent);
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

  function syncBrandMarquee() {
    try {
      if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
        window.__vcSyncHeaderSiteNameMarquee(document);
      }
    } catch (eMar) {}
  }

  function boot() {
    var cfg = readCfg();
    var mode = cfg ? resolveMode(cfg) : "";
    var btn = ensurePromoButton(cfg, mode) || document.getElementById("vc-header-promo-btn");
    if (!btn) return;
    if (cfg) applyMode(btn, cfg, mode);
    else layoutPromoMarquee(btn);
    syncBrandMarquee();
  }

  function scheduleBootPasses() {
    boot();
    [180, 450, 1200, 2400].forEach(function (ms) {
      window.setTimeout(function () {
        var btn = document.getElementById("vc-header-promo-btn");
        if (btn && promoMarqueeStable(btn)) return;
        boot();
      }, ms);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBootPasses);
  } else {
    scheduleBootPasses();
  }
  window.addEventListener("load", function () {
    window.setTimeout(boot, 80);
  });
  window.addEventListener("vc:langchange", boot);
  window.addEventListener(
    "resize",
    function () {
      window.clearTimeout(window.__vcPromoResizeT);
      window.__vcPromoResizeT = window.setTimeout(boot, 120);
    },
    { passive: true },
  );

  window.__VC_HEADER_PROMO_VER = PROMO_VER;
})();
