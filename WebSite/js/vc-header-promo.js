(function () {
  /* candPillNoFlash2: default hidden until eligibility decided (no FOUC for staff) */
  /* violKillIdle2 + violKillReflow1: yield + no write→read sync */
  var PROMO_VER = "20261008violWakeChunk1";
  var layoutLock = false;
  var layoutCooldownUntil = 0;
  var marqueeSettledUntil = 0;
  var staffHoldUntil = 0;
  var layoutRaf = 0;
  var lastCompactNav = null;

  function runLight(fn) {
    window.setTimeout(function () {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid) {}
      try {
        fn();
      } catch (eT) {}
    }, 0);
  }

  function readCfg() {
    try {
      return window.__VC_HEADER_PROMO || null;
    } catch (e) {
      return null;
    }
  }

  function hasStaffSiteAccess() {
    /* candPillGuest1: senza login Discord non nascondere (cache staff stale) */
    /* swLsStorm2: memo 2s — boot/MO rileggevano Storage a raffica */
    try {
      var memo = window.__vcPromoStaffMemo;
      if (memo && Date.now() - Number(memo.at || 0) < 2000) return Boolean(memo.v);
    } catch (eM) {}
    var out = false;
    if (!hasDiscordToken()) {
      try {
        window.__vcPromoStaffMemo = { v: false, at: Date.now() };
      } catch (e0) {}
      return false;
    }
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) out = true;
      else {
        var p = window.__VC_STAFF_PERMS;
        if (p && typeof p === "object" && p.ok === true) out = true;
        else {
          var raw =
            sessionStorage.getItem("vc_staff_access_ok_v2") ||
            localStorage.getItem("vc_staff_access_ok_v2_local");
          if (raw) {
            var data = JSON.parse(raw);
            if (data && data.ok === true && Number(data.exp || 0) > Date.now()) out = true;
          }
          if (!out) {
            var menuRaw =
              sessionStorage.getItem("vc_menu_staff_v1") || localStorage.getItem("vc_menu_staff_local_v1");
            if (menuRaw) {
              var menu = JSON.parse(menuRaw);
              if (menu && menu.allowed === true) out = true;
            }
          }
        }
      }
    } catch (e) {}
    try {
      window.__vcPromoStaffMemo = { v: out, at: Date.now() };
    } catch (e1) {}
    return out;
  }

  function hasDiscordToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var tFn = window.__vcDiscordGetAccessToken();
        if (tFn) return true;
      }
    } catch (eFn) {}
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (t && (!exp || Date.now() < exp)) return true;
    } catch (eTok) {}
    try {
      if (window.__VC_DISCORD_PROFILE) return true;
    } catch (eProf) {}
    return false;
  }

  function staffMenuDecisionKnown() {
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      if (window.__VC_STAFF_MENU_ALLOWED === false) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok === true) return true;
      var menuRaw =
        sessionStorage.getItem("vc_menu_staff_v1") || localStorage.getItem("vc_menu_staff_local_v1");
      if (menuRaw) {
        var menu = JSON.parse(menuRaw);
        if (menu && typeof menu.allowed === "boolean") return true;
      }
      var raw =
        sessionStorage.getItem("vc_staff_access_ok_v2") ||
        localStorage.getItem("vc_staff_access_ok_v2_local");
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.ok === true && Number(data.exp || 0) > Date.now()) return true;
      }
    } catch (e) {}
    return false;
  }

  /* Logged-in + staff check still in flight → keep pill hidden (no flash then hide). */
  function shouldHoldCandidatureReveal() {
    if (hasStaffSiteAccess()) return true;
    if (!hasDiscordToken()) return false;
    if (staffMenuDecisionKnown()) return false;
    if (!staffHoldUntil) staffHoldUntil = Date.now() + 4500;
    if (Date.now() > staffHoldUntil) return false;
    return true;
  }

  function setPromoHidden(btn, hidden) {
    if (!btn) return;
    if (hidden) {
      btn.hidden = true;
      btn.setAttribute("hidden", "");
      btn.setAttribute("aria-hidden", "true");
      btn.classList.add("vc-header-promo-btn--staff-hidden");
      btn.classList.remove("vc-header-promo-btn--ready");
      try {
        btn.style.setProperty("display", "none", "important");
      } catch (eDisp) {}
    } else {
      btn.classList.remove("vc-header-promo-btn--staff-hidden");
      btn.classList.add("vc-header-promo-btn--ready");
      btn.removeAttribute("aria-hidden");
      btn.hidden = false;
      btn.removeAttribute("hidden");
      try {
        btn.style.removeProperty("display");
      } catch (eDisp2) {}
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

  function isCandidaturePromo(btn) {
    return !!(btn && btn.classList.contains("vc-header-promo-btn--candidature"));
  }

  function shouldPromoMarquee(btn) {
    if (!btn) return false;
    if (isCandidaturePromo(btn)) return true;
    return isCompactNav();
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
      "vc-header-promo-btn--candidature-marquee",
    );
    btn.style.removeProperty("--vc-promo-marquee-distance");
    btn.style.removeProperty("--vc-promo-marquee-duration");
    btn.style.removeProperty("--vc-promo-marquee-gap");
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
      isCandidaturePromo(btn) ? "candidature" : "event",
      isCompactNav() ? "compact" : "wide",
    ].join("|");
  }

  function promoMarqueeStable(btn) {
    if (!btn || !btn.classList.contains("is-marquee")) return false;
    var track = btn.querySelector(".vc-header-promo-btn__track");
    var unit = track && track.querySelector(".vc-header-promo-btn__unit:not(.is-clone)");
    if (!track || !unit || !track.querySelector(".vc-header-promo-btn__unit.is-clone")) return false;
    if (promoMarqueeSignature(btn) !== btn.getAttribute("data-vc-promo-marquee-sig")) return false;
    var stored = Number(btn.getAttribute("data-vc-promo-marquee-dist") || 0);
    if (!Number.isFinite(stored) || stored <= 0) return false;
    /*
     * candPillMarqueeNoRestart1: una volta avviato con sig+clone ok,
     * NON ri-misurare larghezze (font/RO/boot pass facevano normalize → anim restart).
     * Rebuild solo se cambia sig (testo/mode/compact) o force esplicito.
     */
    return true;
  }

  function schedulePromoRetry(ms) {
    if (layoutLock) return;
    if (Date.now() < layoutCooldownUntil) return;
    var n = Number(window.__vcPromoRetryCount || 0);
    if (n > 24) return;
    window.__vcPromoRetryCount = n + 1;
    var delay = Number(ms);
    if (!Number.isFinite(delay) || delay < 0) delay = 120;
    window.clearTimeout(window.__vcPromoRetryT);
    window.__vcPromoRetryT = window.setTimeout(function () {
      boot({ layoutOnly: true });
    }, delay);
  }

  function layoutPromoMarquee(btn, opts) {
    opts = opts || {};
    if (!btn || btn.hidden) return;
    if (layoutLock) return;
    try {
      if (document.hidden || document.visibilityState === "hidden") return;
    } catch (eHid) {}

    if (!shouldPromoMarquee(btn)) {
      normalizePromoDom(btn);
      return;
    }

    if (!opts.force && promoMarqueeStable(btn)) return;

    /* violKillFinal2: write → __vcLight → read (no rAF nest = Violation 56ms+) */
    if (layoutRaf) return;
    layoutRaf = 1;
    var afterWrite = function () {
      layoutRaf = 0;
      if (!btn || btn.hidden || layoutLock) return;
      if (!opts.force && promoMarqueeStable(btn)) return;
      layoutLock = true;
      try {
        normalizePromoDom(btn);
      } catch (eNorm) {
        layoutLock = false;
        return;
      }
      var measure = function () {
        try {
          if (!btn || btn.hidden) return;
          if (!opts.force && promoMarqueeStable(btn)) return;
          var clip = btn.querySelector(".vc-header-promo-btn__clip");
          var track = clip && clip.querySelector(".vc-header-promo-btn__track");
          var unit = track && track.querySelector(".vc-header-promo-btn__unit:not(.is-clone)");
          if (!clip || !track || !unit) {
            schedulePromoRetry(220);
            return;
          }
          var clipW = Math.floor(Number(btn.getAttribute("data-vc-promo-cw") || 0));
          var unitW = Math.floor(Number(btn.getAttribute("data-vc-promo-uw") || 0));
          if (!(clipW > 8)) {
            clipW = Math.floor(clip.clientWidth || 0);
            if (clipW > 8) btn.setAttribute("data-vc-promo-cw", String(clipW));
          }
          if (!(unitW > 0)) {
            unitW = Math.ceil(unit.scrollWidth || 0);
            if (unitW > 0) btn.setAttribute("data-vc-promo-uw", String(unitW));
          }
          if (unitW <= 0) {
            schedulePromoRetry(280);
            return;
          }
          if (!isCandidaturePromo(btn) && unitW <= clipW + 2) return;

          var gap = 16;
          btn.style.setProperty("--vc-promo-marquee-gap", gap + "px");
          unit.style.paddingInlineEnd = gap + "px";
          var segment = Math.max(unitW + gap, 36);

          var cloneUnit = unit.cloneNode(true);
          cloneUnit.classList.add("is-clone");
          cloneUnit.setAttribute("aria-hidden", "true");
          cloneUnit.style.paddingInlineEnd = gap + "px";
          track.appendChild(cloneUnit);

          btn.style.setProperty("--vc-promo-marquee-distance", segment + "px");
          var duration = Math.max(7.5, Math.min(14, segment / 18));
          btn.style.setProperty("--vc-promo-marquee-duration", duration.toFixed(2) + "s");
          btn.classList.add("is-marquee");
          if (isCandidaturePromo(btn)) {
            btn.classList.add("vc-header-promo-btn--candidature-mobile-marquee");
            btn.classList.add("vc-header-promo-btn--candidature-marquee");
          }
          if (isCompactNav()) btn.classList.add("vc-header-promo-btn--mobile-marquee");
          btn.setAttribute("data-vc-promo-marquee-sig", promoMarqueeSignature(btn));
          btn.setAttribute("data-vc-promo-marquee-dist", String(segment));
          layoutCooldownUntil = Date.now() + 2400;
          marqueeSettledUntil = Date.now() + 12000;
        } finally {
          layoutLock = false;
        }
      };
      if (typeof window.__vcLight === "function") window.__vcLight(measure, 160);
      else window.setTimeout(measure, 160);
    };
    if (typeof window.__vcLight === "function") window.__vcLight(afterWrite, 120);
    else window.setTimeout(afterWrite, 120);
  }

  function applyMode(btn, cfg, mode) {
    if (!btn || !cfg) return;
    if (!mode || (mode === "candidature" && (hasStaffSiteAccess() || shouldHoldCandidatureReveal()))) {
      setPromoHidden(btn, true);
      if (mode === "candidature" && shouldHoldCandidatureReveal() && !hasStaffSiteAccess()) {
        scheduleFullBootRetry(220);
      }
      return;
    }
    setPromoHidden(btn, false);
    btn.hidden = false;
    btn.removeAttribute("hidden");
    var isEvent = mode === "event";
    var href = isEvent ? cfg.eventUrl : cfg.candidatureUrl;
    btn.href = href || (isEvent ? "/evento" : "/candidature");
    btn.classList.remove("vc-header-promo-btn--event", "vc-header-promo-btn--candidature", "vc-header-promo-btn--mobile-compact");
    btn.classList.add(isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature");
    var compact = isCompactNav();
    if (compact) btn.classList.add("vc-header-promo-btn--mobile-compact");
    btn.removeAttribute("aria-label");
    btn.setAttribute(
      "aria-label",
      isEvent ? t("header.promo.eventAria", "Evento Hogwarts attivo – vai al calendario") : t("header.promo.appsAria", "Candidature staff aperte"),
    );
    btn.setAttribute("data-i18n-attr", isEvent ? "aria-label:header.promo.eventAria" : "aria-label:header.promo.appsAria");
    var labelEls = btn.querySelectorAll(".vc-header-promo-btn__label");
    var badgeEls = btn.querySelectorAll(".vc-header-promo-btn__badge");
    var label = labelTextForMode(isEvent);
    var badge = badgeTextForMode(isEvent);
    var textChanged = false;
    var i;
    for (i = 0; i < labelEls.length; i += 1) {
      if (String(labelEls[i].textContent || "") !== label) {
        labelEls[i].textContent = label;
        textChanged = true;
      }
      labelEls[i].setAttribute("data-i18n", isEvent ? "header.promo.eventLabel" : "header.promo.appsLabel");
    }
    for (i = 0; i < badgeEls.length; i += 1) {
      if (String(badgeEls[i].textContent || "") !== badge) {
        badgeEls[i].textContent = badge;
        textChanged = true;
      }
      badgeEls[i].setAttribute(
        "data-i18n",
        isEvent ? "header.promo.eventBadgeShort" : "header.promo.appsBadge",
      );
    }
    try {
      var path = String(window.location.pathname || "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      var target = String(href || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
      if (path === target) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    } catch (eCur) {}

    var compactChanged = lastCompactNav !== null && lastCompactNav !== compact;
    lastCompactNav = compact;
    /* candPillMarqueeNoRestart1: non toccare il track se già in marquee stabile */
    if (textChanged || compactChanged || !promoMarqueeStable(btn)) {
      layoutPromoMarquee(btn, { force: textChanged || compactChanged });
    }
  }

  function buildPromoButtonShell(mode) {
    var isEvent = mode === "event";
    var modClass = isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature";
    var label = labelTextForMode(isEvent);
    var badge = badgeTextForMode(isEvent);
    var btn = document.createElement("a");
    btn.className = "vc-header-promo-btn " + modClass;
    btn.id = "vc-header-promo-btn";
    btn.hidden = true;
    btn.setAttribute("hidden", "");
    btn.setAttribute("aria-hidden", "true");
    btn.classList.add("vc-header-promo-btn--staff-hidden");
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

  function scheduleFullBootRetry(ms) {
    var n = Number(window.__vcPromoFullRetryCount || 0);
    if (n > 28) return;
    window.__vcPromoFullRetryCount = n + 1;
    var delay = Number(ms);
    if (!Number.isFinite(delay) || delay < 0) delay = 200;
    window.clearTimeout(window.__vcPromoFullRetryT);
    window.__vcPromoFullRetryT = window.setTimeout(function () {
      boot();
    }, delay);
  }

  function boot(opts) {
    opts = opts || {};
    var cfg = readCfg();
    var mode = cfg ? resolveMode(cfg) : "";
    var earlyBtn = document.getElementById("vc-header-promo-btn");
    if (earlyBtn && !earlyBtn.classList.contains("vc-header-promo-btn--ready")) {
      setPromoHidden(earlyBtn, true);
    }
    if (mode === "candidature" && (hasStaffSiteAccess() || shouldHoldCandidatureReveal())) {
      if (earlyBtn) setPromoHidden(earlyBtn, true);
      if (!hasStaffSiteAccess() && shouldHoldCandidatureReveal()) {
        scheduleFullBootRetry(240);
      }
      return;
    }
    var btn = ensurePromoButton(cfg, mode) || document.getElementById("vc-header-promo-btn");
    if (!btn) return;
    if (opts.layoutOnly) {
      if (btn.hidden || btn.classList.contains("vc-header-promo-btn--staff-hidden")) return;
      layoutPromoMarquee(btn);
      return;
    }
    if (cfg) applyMode(btn, cfg, mode);
    else layoutPromoMarquee(btn);
    syncBrandMarquee();
  }

  function ensurePromoVisibilityWatch(btn) {
    if (!btn || btn.__vcPromoRoBound) return;
    btn.__vcPromoRoBound = true;
    try {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          if (layoutLock || Date.now() < layoutCooldownUntil) return;
          if (promoMarqueeStable(btn)) return;
          schedulePromoRetry(160);
        });
        ro.observe(btn);
        btn.__vcPromoRo = ro;
      }
    } catch (eRo) {}
    try {
      if (typeof IntersectionObserver === "function") {
        var io = new IntersectionObserver(
          function (entries) {
            var hit = false;
            for (var i = 0; i < entries.length; i += 1) {
              if (entries[i] && entries[i].isIntersecting && entries[i].intersectionRatio > 0) {
                hit = true;
                break;
              }
            }
            if (!hit) return;
            if (layoutLock || Date.now() < layoutCooldownUntil) return;
            if (promoMarqueeStable(btn)) return;
            schedulePromoRetry(120);
          },
          { root: null, threshold: [0, 0.01, 1] },
        );
        io.observe(btn);
        btn.__vcPromoIo = io;
      }
    } catch (eIo) {}
  }

  function scheduleBootPasses() {
    var pre = document.getElementById("vc-header-promo-btn");
    if (pre) setPromoHidden(pre, true);
    boot();
    var btn0 = document.getElementById("vc-header-promo-btn");
    if (btn0) ensurePromoVisibilityWatch(btn0);
    /* handlerPerf1 + notif429Everywhere1: pochi pass, lavoro pesante fuori dal timer sync */
    [350, 1400, 4200].forEach(function (ms) {
      window.setTimeout(function () {
        runLight(function () {
          try {
            if (document.hidden || document.visibilityState === "hidden") return;
          } catch (eHid) {}
          var btn = document.getElementById("vc-header-promo-btn");
          if (btn) ensurePromoVisibilityWatch(btn);
          if (shouldHoldCandidatureReveal() || hasStaffSiteAccess()) {
            boot();
            return;
          }
          if (btn && promoMarqueeStable(btn)) return;
          if (btn && (btn.hidden || btn.classList.contains("vc-header-promo-btn--staff-hidden"))) {
            boot();
            return;
          }
          boot({ layoutOnly: true });
        });
      }, ms);
    });
    watchPersonalizzaGate();
  }

  function watchPersonalizzaGate() {
    if (window.__vcPromoGateWatch) return;
    window.__vcPromoGateWatch = true;
    try {
      var root = document.documentElement;
      if (!root || typeof MutationObserver !== "function") return;
      var mo = new MutationObserver(function () {
        var pending =
          root.classList.contains("vc-rank-customize-pending") ||
          root.classList.contains("vc-custom-profile-pending");
        if (pending) return;
        if (!root.classList.contains("vc-styles-ready") && !root.classList.contains("vc-page-cine-ready")) {
          return;
        }
        window.clearTimeout(window.__vcPromoGateBootT);
        /* violKillIdle2: boot + marquee spezzati (era setTimeout 650–1500ms) */
        window.__vcPromoGateBootT = window.setTimeout(function () {
          try {
            if (document.hidden || document.visibilityState === "hidden") return;
          } catch (eHidG) {}
          if (window.__vcPromoGateBootedOnce && promoMarqueeStable(document.getElementById("vc-header-promo-btn"))) {
            return;
          }
          window.__vcPromoRetryCount = 0;
          window.__vcPromoGateBootedOnce = true;
          /* violWakeChunk1: boot layout fuori dall’handler MO (era 392ms Violation) */
          function goPromo() {
            try {
              boot({ layoutOnly: true });
            } catch (eBoot) {}
            window.setTimeout(function () {
              try {
                if (document.hidden) return;
                syncBrandMarquee();
              } catch (eMq) {}
            }, 64);
          }
          if (typeof window.__vcLight === "function") window.__vcLight(goPromo, 80);
          else window.setTimeout(goPromo, 80);
        }, 900);
      });
      mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    } catch (eMo) {}
  }
  /* handlerPerf1 marker */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBootPasses);
  } else {
    scheduleBootPasses();
  }
  window.addEventListener("load", function () {
    window.setTimeout(boot, 80);
  });
  window.addEventListener("vc:langchange", boot);
  window.addEventListener("vc:auth-logout", function () {
    staffHoldUntil = 0;
    window.__vcPromoFullRetryCount = 0;
    boot();
  });
  window.addEventListener("vc:discord-auth", function () {
    staffHoldUntil = 0;
    window.__vcPromoFullRetryCount = 0;
    boot();
  });
  window.addEventListener("vc-discord-auth-ready", function () {
    boot();
  });
  window.addEventListener("vc-discord-profile", function () {
    boot();
  });
  window.addEventListener("vc:staff-access-ok", function () {
    boot();
  });
  window.addEventListener(
    "resize",
    function () {
      window.clearTimeout(window.__vcPromoResizeT);
      window.__vcPromoResizeT = window.setTimeout(function () {
        var compact = isCompactNav();
        var compactChanged = lastCompactNav !== null && lastCompactNav !== compact;
        lastCompactNav = compact;
        var btn = document.getElementById("vc-header-promo-btn");
        if (!btn || btn.hidden || btn.classList.contains("vc-header-promo-btn--staff-hidden")) {
          boot();
          return;
        }
        if (compact) btn.classList.add("vc-header-promo-btn--mobile-compact");
        else btn.classList.remove("vc-header-promo-btn--mobile-compact");
        /* rebuild solo se cambia breakpoint; altrimenti lascia correre l'animazione */
        if (compactChanged || !promoMarqueeStable(btn)) {
          layoutPromoMarquee(btn, { force: compactChanged });
        }
      }, 180);
    },
    { passive: true },
  );

  window.__VC_HEADER_PROMO_VER = PROMO_VER;
})();
