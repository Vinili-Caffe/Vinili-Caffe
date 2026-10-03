(function () {
  "use strict";

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var CHIP_ID = "vc-dash-credits-chip";
  var POLL_MS = 45000;
  var loadSeq = 0;
  var loadTimer = 0;
  var blockedUntil = 0;
  var inFlight = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
  }

  function resolveApiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String(isLocal && c.apiUrlLocal ? c.apiUrlLocal : c.apiUrl || "").trim();
    if (!raw || raw.indexOf("{{") !== -1) return "/webhooks/site-dashboard";
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function creditsShopUrl() {
    var c = cfg();
    var fromCfg = String(c.premiumCreditsPageUrl || "").trim();
    if (fromCfg) return fromCfg;
    try {
      var base = String(c.premiumPageUrl || "").trim();
      if (base) {
        return base.replace(/\/?$/, "/") + "crediti/";
      }
    } catch (e) {}
    return "/dashboard/premium/crediti/";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (!t2 || !exp || Date.now() >= exp) return "";
      return t2;
    } catch (e) {
      return "";
    }
  }

  function t(key, vars, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback != null ? fallback : key;
    if (vars && typeof out === "string") {
      out = out.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : "{" + k + "}";
      });
    }
    return out;
  }

  function formatCredits(n) {
    var value = Math.max(0, Math.floor(Number(n) || 0));
    try {
      return value.toLocaleString(undefined);
    } catch (e) {
      return String(value);
    }
  }

  function placeChipBeforeBell(chip) {
    var actions = byId("header-quick-actions");
    if (!actions || !chip) return chip;
    var notif = byId("vc-notif-dropdown");
    if (notif && notif.parentNode === actions) {
      if (chip.nextElementSibling !== notif) actions.insertBefore(chip, notif);
      return chip;
    }
    var loginState = byId("discord-login-state");
    if (loginState && loginState.parentNode === actions) {
      actions.insertBefore(chip, loginState);
      return chip;
    }
    var loginBtn = byId("discord-login-btn");
    if (loginBtn && loginBtn.parentNode === actions) {
      actions.insertBefore(chip, loginBtn);
      return chip;
    }
    if (chip.parentNode !== actions) actions.appendChild(chip);
    return chip;
  }

  function ensureChip() {
    var existing = byId(CHIP_ID);
    if (existing) return placeChipBeforeBell(existing);

    var actions = byId("header-quick-actions");
    if (!actions) return null;

    var a = document.createElement("a");
    a.id = CHIP_ID;
    a.className = "vc-dash-credits-chip";
    a.href = creditsShopUrl();
    a.setAttribute("data-i18n-attr", "aria-label:dashCredits.aria,title:dashCredits.title");
    a.setAttribute("aria-label", t("dashCredits.aria", null, "I tuoi crediti Premium"));
    a.title = t("dashCredits.title", null, "Acquista crediti Premium");

    a.innerHTML =
      '<span class="vc-dash-credits-chip__ico" aria-hidden="true"><i class="fa fa-money"></i></span>' +
      '<span class="vc-dash-credits-chip__count" id="vc-dash-credits-count">…</span>' +
      '<span class="vc-dash-credits-chip__label" data-i18n="dashCredits.label">crediti</span>';

    placeChipBeforeBell(a);
    return a;
  }

  function setCount(credits) {
    var el = byId("vc-dash-credits-count");
    if (!el) return;
    el.textContent = formatCredits(credits);
  }

  function setVisible(show) {
    var chip = byId(CHIP_ID);
    if (!chip) return;
    chip.hidden = !show;
  }

  function refreshI18n() {
    var chip = byId(CHIP_ID);
    if (!chip) return;
    chip.setAttribute("aria-label", t("dashCredits.aria", null, "I tuoi crediti Premium"));
    chip.title = t("dashCredits.title", null, "Acquista crediti Premium");
    var label = chip.querySelector(".vc-dash-credits-chip__label");
    if (label) label.textContent = t("dashCredits.label", null, "crediti");
  }

  async function loadCredits() {
    var token = getToken();
    if (!token) {
      setVisible(false);
      return null;
    }
    if (Date.now() < blockedUntil) return null;
    if (inFlight) return inFlight;
    ensureChip();
    setVisible(true);
    var seq = ++loadSeq;
    inFlight = (async function () {
      var ctrl = null;
      var timer = null;
      try {
        ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (ctrl) {
          timer = setTimeout(function () {
            try {
              ctrl.abort();
            } catch (eAb) {}
          }, 6500);
        }
        var res = await fetch(resolveApiBase() + "/credits", {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
          },
          credentials: "omit",
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (seq !== loadSeq) return null;
        if (res && res.status === 429) {
          var ra = 0;
          try {
            ra = Number(res.headers.get("Retry-After") || "0");
          } catch (eRa) {}
          blockedUntil = Date.now() + Math.max(12000, (Number.isFinite(ra) && ra > 0 ? ra : 20) * 1000);
          setCount(0);
          return null;
        }
        if (!res || !res.ok) {
          setCount(0);
          scheduleLoadCredits(3500);
          return null;
        }
        var data = await res.json().catch(function () {
          return null;
        });
        if (seq !== loadSeq) return null;
        if (!data || data.ok !== true) {
          setCount(0);
          scheduleLoadCredits(3500);
          return null;
        }
        var credits = Math.max(0, Math.floor(Number(data.credits) || 0));
        setCount(credits);
        return credits;
      } catch (e) {
        if (seq === loadSeq) {
          setCount(0);
          scheduleLoadCredits(4000);
        }
        return null;
      } finally {
        if (timer) clearTimeout(timer);
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function scheduleLoadCredits(delayMs) {
    try {
      if (loadTimer) window.clearTimeout(loadTimer);
    } catch (eClr) {}
    loadTimer = window.setTimeout(function () {
      loadTimer = 0;
      loadCredits();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function emitChanged(credits) {
    try {
      window.dispatchEvent(
        new CustomEvent("vc:credits-changed", {
          detail: { credits: credits },
        }),
      );
    } catch (e) {}
  }

  function refresh(opts) {
    opts = opts || {};
    return loadCredits().then(function (credits) {
      if (opts.emit && credits != null) emitChanged(credits);
      return credits;
    });
  }

  function boot() {
    var path = String(window.location.pathname || "");
    var isDash =
      (document.body &&
        (document.body.classList.contains("vc-dashboard-page") ||
          document.body.classList.contains("vc-dashboard-premium-page"))) ||
      /\/dashboard(\/|$)/.test(path);
    if (!isDash) return;

    ensureChip();
    refreshI18n();
    scheduleLoadCredits(0);
    document.addEventListener("vc:langchange", refreshI18n);
    window.addEventListener("vc:credits-changed", function (ev) {
      var detail = ev && ev.detail;
      if (detail && detail.credits != null) {
        ensureChip();
        setVisible(Boolean(getToken()));
        setCount(detail.credits);
        return;
      }
      scheduleLoadCredits(180);
    });
    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev && ev.detail ? ev.detail.user : null;
      if (u) {
        ensureChip();
        scheduleLoadCredits(220);
      }
    });
    window.addEventListener("vc-dashboard-access", function (ev) {
      var d = ev && ev.detail;
      if (d && d.allowed) {
        ensureChip();
        scheduleLoadCredits(220);
      }
    });
    window.addEventListener("storage", function (ev) {
      if (!ev) return;
      if (ev.key === ACCESS_TOKEN_KEY || ev.key === ACCESS_EXPIRES_KEY) scheduleLoadCredits(120);
    });
    window.addEventListener("focus", function () {
      if (getToken()) scheduleLoadCredits(250);
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && getToken()) scheduleLoadCredits(250);
    });
    var loginBtn = byId("discord-login-btn");
    var loginState = byId("discord-login-state");
    if (window.MutationObserver && (loginBtn || loginState)) {
      var mo = new MutationObserver(function () {
        ensureChip();
        scheduleLoadCredits(400);
      });
      if (loginBtn) mo.observe(loginBtn, { attributes: true, attributeFilter: ["hidden", "class"] });
      if (loginState) mo.observe(loginState, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden", "class"] });
    }
    setInterval(function () {
      var token = getToken();
      var chip = byId(CHIP_ID);
      if (!token) {
        if (chip && !chip.hidden) setVisible(false);
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      ensureChip();
      scheduleLoadCredits(0);
    }, POLL_MS);
  }

  window.VcDashCredits = {
    refresh: refresh,
    setCount: setCount,
    load: loadCredits,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
