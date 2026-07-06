(function initSiteSponsorAd() {
  var cfg = typeof window !== "undefined" ? window.__VC_SITE_SPONSOR_AD : null;
  if (!cfg || cfg.enabled !== true) return;

  function parseMs(value, endOfDay) {
    var d = String(value || "").trim();
    if (!d) return NaN;
    d = d.replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{2})$/, "T$1:$2:$3");
    if (d.indexOf("T") < 0 && endOfDay) return new Date(d + "T23:59:59.999").getTime();
    if (d.indexOf("T") < 0) return new Date(d + "T00:00:00").getTime();
    return new Date(d).getTime();
  }

  var startMs = Number(cfg.startMs);
  var untilMs = Number(cfg.untilMs);
  if (!Number.isFinite(startMs)) startMs = parseMs(cfg.startAt, false);
  if (!Number.isFinite(untilMs)) untilMs = parseMs(cfg.until, true);
  var now = Date.now();
  if (Number.isFinite(startMs) && now < startMs) return;
  if (Number.isFinite(untilMs) && now > untilMs) return;

  var adId = String(cfg.id || "site-sponsor").trim() || "site-sponsor";
  var DISMISS_KEY = "vc_site_sponsor_dismiss_v1";

  function getDismissedId() {
    try {
      return String(localStorage.getItem(DISMISS_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function setDismissedId(id) {
    var s = String(id || "").trim();
    if (!s) return;
    try {
      localStorage.setItem(DISMISS_KEY, s);
    } catch (e) {}
  }

  function clearDismissedId() {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch (e) {}
  }

  function ensureRoot() {
    var n = document.getElementById("vc-site-sponsor-ad-home");
    if (!n) {
      n = document.createElement("section");
      n.id = "vc-site-sponsor-ad-home";
      n.className = "vc-live-event-home vc-site-sponsor-ad-home";
      n.hidden = true;
      n.setAttribute("aria-live", "polite");
      n.setAttribute("role", "region");
      n.setAttribute("aria-label", "Sponsor in evidenza");
    }
    if (n.parentNode !== document.body) document.body.appendChild(n);
    n.innerHTML =
      '<div class="vc-live-event-inline vc-live-event-inline--sponsor">' +
      '<button type="button" class="vc-live-event-inline__x" data-vc-site-sponsor-dismiss aria-label="Nascondi sponsor">' +
      '<i class="fa fa-times" aria-hidden="true"></i>' +
      "</button>" +
      '<p class="vc-live-event-inline__badge"><i class="fa fa-handshake-o" aria-hidden="true"></i> <span id="vc-site-sponsor-badge"></span></p>' +
      '<h2 id="vc-site-sponsor-title" class="vc-live-event-inline__title"></h2>' +
      '<p id="vc-site-sponsor-desc" class="vc-live-event-inline__desc vc-site-sponsor-ad__desc"></p>' +
      '<div class="vc-live-event-inline__actions">' +
      '<a id="vc-site-sponsor-primary" class="vc-live-event-inline__btn vc-live-event-inline__btn--sponsor" href="#" target="_blank" rel="noopener noreferrer sponsored">Visita</a>' +
      "</div>" +
      "</div>";
    return n;
  }

  function ensureReopenButton() {
    var btn = document.getElementById("vc-site-sponsor-reopen");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-site-sponsor-reopen";
    btn.className = "vc-live-event-reopen vc-site-sponsor-reopen";
    btn.hidden = true;
    btn.setAttribute("aria-controls", "vc-site-sponsor-ad-home");
    btn.setAttribute("aria-label", "Riapri sponsor");
    btn.innerHTML = '<i class="fa fa-handshake-o" aria-hidden="true"></i><span>Sponsor</span>';
    document.body.appendChild(btn);
    return btn;
  }

  var root = ensureRoot();
  var reopenBtn = ensureReopenButton();
  var badgeEl = document.getElementById("vc-site-sponsor-badge");
  var titleEl = document.getElementById("vc-site-sponsor-title");
  var descEl = document.getElementById("vc-site-sponsor-desc");
  var prim = document.getElementById("vc-site-sponsor-primary");
  if (!root || !reopenBtn || !badgeEl || !titleEl || !descEl || !prim) return;

  document.body.classList.add("vc-site-sponsor-ad-active");

  function showAd() {
    badgeEl.textContent = String(cfg.badge || "Sponsor").trim() || "Sponsor";
    titleEl.textContent = String(cfg.title || "Server partner").trim() || "Server partner";
    descEl.textContent = String(cfg.description || "").trim();
    var url = String(cfg.buttonUrl || "").trim();
    var title = String(cfg.title || "Server partner").trim() || "Server partner";
    var label = String(cfg.buttonLabel || "").trim() || "Entra su " + title;
    if (url) prim.setAttribute("href", url);
    prim.textContent = label;
    prim.setAttribute("data-vc-preview-subtitle", "Entra su " + title);
    prim.setAttribute("aria-label", label + " (Discord, link esterno)");
    if (typeof window.__vcBindSocialPreview === "function") window.__vcBindSocialPreview(prim);

    if (getDismissedId() === adId) {
      root.hidden = true;
      reopenBtn.hidden = false;
      document.body.classList.remove("vc-site-sponsor-ad-visible");
      return;
    }

    root.hidden = false;
    reopenBtn.hidden = true;
    document.body.classList.add("vc-site-sponsor-ad-visible");
  }

  root.addEventListener("click", function (e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-vc-site-sponsor-dismiss]")) {
      setDismissedId(adId);
      root.hidden = true;
      reopenBtn.hidden = false;
      document.body.classList.remove("vc-site-sponsor-ad-visible");
    }
  });

  reopenBtn.addEventListener("click", function () {
    clearDismissedId();
    reopenBtn.hidden = true;
    showAd();
  });

  function boot() {
    showAd();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();