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
    btn.setAttribute(
      "aria-label",
      isEvent
        ? t("header.promo.eventAria", "Evento Hogwarts attivo – vai al calendario")
        : t("header.promo.appsAria", "Candidature staff aperte")
    );
    var labelEl = btn.querySelector(".vc-header-promo-btn__label");
    var badgeEl = btn.querySelector(".vc-header-promo-btn__badge");
    if (labelEl) labelEl.textContent = label;
    if (badgeEl) badgeEl.textContent = badge;
    try {
      var path = String(window.location.pathname || "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      var target = String(href || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      if (path === target) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    } catch (eCur) {}
  }

  function boot() {
    var cfg = readCfg();
    var btn = document.getElementById("vc-header-promo-btn");
    if (!cfg || !btn) return;
    applyMode(btn, cfg, resolveMode(cfg));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("vc:langchange", boot);
})();
