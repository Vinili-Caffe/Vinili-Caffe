(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
  }

  function resolveApiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String((isLocal && c.apiUrlLocal) ? c.apiUrlLocal : (c.apiUrl || "")).trim();
    if (!raw || raw.indexOf("{{") !== -1) return "/webhooks/site-dashboard";
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function hasGuildsScope() {
    if (typeof window.__vcDiscordTokenHasScope === "function") {
      return window.__vcDiscordTokenHasScope("guilds");
    }
    /* Helper non ancora pronto: non bloccare (altrimenti lista vuota + errore). */
    return true;
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetRealAccessToken === "function") {
        var real = String(window.__vcDiscordGetRealAccessToken() || "").trim();
        if (real) return real;
      }
    } catch (eReal) {}
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      if (typeof window.__vcDiscordRawLocalStorageGetItem === "function") {
        var raw = String(window.__vcDiscordRawLocalStorageGetItem(ACCESS_TOKEN_KEY) || "").trim();
        if (raw) return raw;
      }
    } catch (eRaw) {}
    var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t2 || !exp || Date.now() >= exp) return "";
    return t2;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback != null ? fallback : key;
  }

  function guildPageUrl(guildId) {
    var c = cfg();
    var base = String(c.guildPageUrl || "/dashboard/guild/").trim();
    if (!base.endsWith("/")) base += "/";
    return base + "?id=" + encodeURIComponent(String(guildId || ""));
  }

  function homeUrl() {
    try {
      var a = window.__VC_AUTH || {};
      var u = String(a.homeUrl || "/").trim();
      if (u) return u;
    } catch (e) {}
    return "/";
  }

  function hasLikelySession() {
    try {
      var t = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!t) return false;
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (exp && Date.now() >= exp) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function accessPending() {
    try {
      var root = document.documentElement;
      return (
        root.classList.contains("vc-dash-access-pending") &&
        !root.classList.contains("vc-dash-access-ready")
      );
    } catch (e) {
      return false;
    }
  }

  /* Soft obscure: non kickare a / mentre auth/gate stanno ancora partendo */
  function softObscureDashboardUi() {
    try {
      /* Non cancellare una lista già caricata durante retry gate */
      if (lastGuilds && lastGuilds.length) return;
      var list = byId("vc-dashboard-guild-list");
      if (list) list.innerHTML = "";
      setLoading(true);
      setError("");
    } catch (eSoft) {}
  }

  window.__vcDashboardObscureIfUnauthorized = function () {
    /* Solo UI soft: il redirect a home lo fa il gate dopo deny confermato. */
    softObscureDashboardUi();
  };

  function obscureDashboard(opts) {
    opts = opts || {};
    if (!opts.force) {
      if (accessPending() || hasLikelySession()) {
        softObscureDashboardUi();
        return;
      }
    }
    softObscureDashboardUi();
    /* Niente location.replace("/") qui: race token/gate → kick falso alla home */
  }

  function hideGate() {
    var g = byId("vc-dashboard-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
  }

  function showGate() {
    obscureDashboard({ force: true });
  }

  function hideLocked() {
    var el = byId("vc-dashboard-locked");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.add("vc-reviews-gate--dismissed");
  }

  function showLocked() {
    obscureDashboard({ force: true });
  }

  function showApp() {
    hideLocked();
    var app = byId("vc-dashboard-app");
    if (app) app.hidden = false;
  }

  function showScopeNotice() {
    var el = byId("vc-dashboard-scope-notice");
    if (!el) return;
    el.hidden = false;
  }

  function setLoading(on) {
    var el = byId("vc-dashboard-loading");
    if (el) el.hidden = !on;
      }

  var errorTimer = null;
  var ERROR_AUTO_MS = 6000;

  function clearErrorTimer() {
    if (errorTimer) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
  }

  function setError(msg, opts) {
    var el = byId("vc-dashboard-error");
    clearErrorTimer();
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
    var text = String(msg || "").trim();
    // Errori dashboard → toast, non banner. setError("") chiude il toast.
    if (!text) {
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
          window.VcSiteToast.hide();
        }
      } catch (eHide) {}
      return;
    }
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(text, true, {
        sticky: Boolean(opts && opts.sticky) || undefined,
        ms: 4200,
      });
      return;
    }
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    if (!(opts && opts.sticky)) {
      errorTimer = setTimeout(function () {
        errorTimer = null;
        setError("");
      }, ERROR_AUTO_MS);
    }
  }

  function renderGuildCard(row) {
    var id = String(row && row.id || "");
    var name = esc(row && row.name || "Server");
    var icon = String(row && row.iconUrl || "").trim();
    var botPresent = row && row.botPresent === true;
    var isMain = row && row.isMainGuild === true;
    var isProtected = row && row.isProtectedGuild === true;
    var premiumActive = row && row.premiumActive === true;
    var href = guildPageUrl(id);
    var iconHtml = icon
      ? '<img src="' + esc(icon) + '" alt="" class="vc-dashboard-guild-card__icon" width="64" height="64" loading="lazy" decoding="async" />'
      : '<div class="vc-dashboard-guild-card__icon vc-dashboard-guild-card__icon--fallback" aria-hidden="true"><i class="fa fa-server"></i></div>';
    var badges = [];
    if (premiumActive) {
      badges.push(
        '<span class="vc-dashboard-badge vc-dashboard-badge--premium" title="' +
          esc(t("dash.badgePremiumTitle", "Vinili Premium attivo")) +
          '"><i class="fa fa-diamond" aria-hidden="true"></i> ' +
          esc(t("dash.badgePremium", "Premium")) +
          "</span>"
      );
    }
    if (botPresent) {
      badges.push(
        isMain
          ? '<span class="vc-dashboard-badge vc-dashboard-badge--main">' + esc(t("dash.badgeMain", "Server principale")) + "</span>"
          : isProtected
            ? '<span class="vc-dashboard-badge vc-dashboard-badge--main">' + esc(t("dash.badgeProtected", "Vinili")) + "</span>"
            : '<span class="vc-dashboard-badge vc-dashboard-badge--ok">' + esc(t("dash.badgeActive", "Bot attivo")) + "</span>"
      );
    } else {
      badges.push(
        '<span class="vc-dashboard-badge vc-dashboard-badge--warn">' + esc(t("dash.badgeInvite", "Invita il bot")) + "</span>"
      );
    }
    var meta = botPresent
      ? (isMain
          ? t("dash.metaMain", "Gestione community Vinili & Caffè")
          : isProtected
            ? t("dash.metaProtected", "Apri impostazioni")
            : t("dash.metaOpen", "Apri impostazioni"))
      : t("dash.metaMissing", "Il bot non è ancora in questo server");
    var iconWrap =
      '<span class="vc-dashboard-guild-card__icon-wrap">' +
      iconHtml +
      (premiumActive
        ? '<span class="vc-dashboard-guild-card__premium-mark" title="' +
          esc(t("dash.badgePremiumTitle", "Vinili Premium attivo")) +
          '" aria-hidden="true"><i class="fa fa-diamond"></i></span>'
        : "") +
      "</span>";
    return (
      '<a class="vc-dashboard-guild-card' + (premiumActive ? " is-premium" : "") + '" href="' + esc(href) + '">' +
      iconWrap +
      '<div class="vc-dashboard-guild-card__body">' +
      '<span class="vc-dashboard-guild-card__name">' + name + "</span>" +
      '<span class="vc-dashboard-guild-card__meta">' + esc(meta) + "</span>" +
      '<div class="vc-dashboard-guild-card__badges">' + badges.join("") + "</div>" +
      "</div>" +
      '<span class="vc-dashboard-guild-card__go" aria-hidden="true"><i class="fa fa-arrow-right"></i></span>' +
      "</a>"
    );
  }

  function renderGuilds(guilds) {
    var list = byId("vc-dashboard-guild-list");
    var empty = byId("vc-dashboard-empty");
    if (!list) return;
    var rows = Array.isArray(guilds) ? guilds : [];
    lastGuilds = rows;
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = rows.map(renderGuildCard).join("");
  }

  var lastGuilds = [];
  var loadSeq = 0;

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function normalizeFetchHeaders(headers) {
    var plain = { Accept: "application/json" };
    try {
      if (!headers) return plain;
      if (typeof headers.forEach === "function") {
        headers.forEach(function (v, k) {
          plain[String(k)] = String(v);
        });
        return plain;
      }
      Object.keys(headers).forEach(function (k) {
        plain[k] = String(headers[k]);
      });
    } catch (eNorm) {}
    return plain;
  }

  async function fetchDashboardJson(url, token, options) {
    var attempts = (options && options.attempts) || 3;
    var timeoutMs = Math.max(4000, Number(options && options.timeoutMs) || 14000);
    var lastRes = null;
    var lastData = {};
    for (var i = 0; i < attempts; i += 1) {
      var ctrl = null;
      var timer = null;
      try {
        var headers = {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        };
        try {
          if (window.VcViewAs && typeof window.VcViewAs.applyHeader === "function") {
            var patched = window.VcViewAs.applyHeader({ headers: headers });
            headers = normalizeFetchHeaders((patched && patched.headers) || headers);
            if (!headers.Authorization && !headers.authorization) {
              headers.Authorization = "Bearer " + token;
            }
          }
        } catch (eVa) {}
        // Bust cache + header plain (Headers object poteva perdere Authorization)
        var bustUrl = String(url || "");
        bustUrl += (bustUrl.indexOf("?") >= 0 ? "&" : "?") + "_=" + String(Date.now());
        ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (ctrl) {
          timer = setTimeout(function () {
            try {
              ctrl.abort();
            } catch (eAb) {}
          }, timeoutMs);
        }
        lastRes = await fetch(bustUrl, {
          method: "GET",
          headers: headers,
          cache: "no-store",
          credentials: "same-origin",
          signal: ctrl ? ctrl.signal : undefined,
        });
        var rawText = await lastRes.text().catch(function () {
          return "";
        });
        try {
          lastData = rawText ? JSON.parse(rawText) : {};
        } catch (eJson) {
          lastData = {};
        }
        if (lastRes.status === 429) {
          if (i < attempts - 1) {
            var ra = 0;
            try {
              ra = Number(lastRes.headers.get("Retry-After") || "0");
            } catch (eRa) {}
            await sleep(Math.max(800, (Number.isFinite(ra) && ra > 0 ? ra : 1.2) * 1000) * (i + 1));
            continue;
          }
        }
        if (lastRes.status === 502 || lastRes.status === 503 || lastRes.status === 504 || lastRes.status === 408) {
          if (i < attempts - 1) {
            await sleep(350 * (i + 1));
            continue;
          }
        }
        return { res: lastRes, data: lastData, raw: rawText };
      } catch (e) {
        if (aborted) {
          lastRes = { ok: false, status: 408 };
          lastData = {
            ok: false,
            error: "timeout",
            message: "Caricamento troppo lento. Riprova tra poco.",
          };
          return { res: lastRes, data: lastData, raw: "" };
        }
        if (i < attempts - 1) {
          await sleep(350 * (i + 1));
          continue;
        }
        throw e;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return { res: lastRes || { ok: false, status: 0 }, data: lastData, raw: "" };
  }

  function guildsPayloadOk(data) {
    if (!data || typeof data !== "object") return false;
    if (Array.isArray(data.guilds)) return data.ok !== false;
    return data.ok === true;
  }

  async function loadGuilds() {
    var token = getToken();
    if (!token) {
      obscureDashboard();
      return;
    }
    if (typeof window.__vcDashboardVerifyHighStaffAccess === "function") {
      var ok = await window.__vcDashboardVerifyHighStaffAccess();
      if (ok === false) return;
    }
    hideGate();
    showApp();
    if (!hasGuildsScope()) {
      showScopeNotice();
      return;
    }
    var seq = ++loadSeq;
    setLoading(true);
    setError("");
    try {
      var out = await fetchDashboardJson(resolveApiBase() + "/guilds", token, { attempts: 3 });
      if (seq !== loadSeq) return;
      var res = out.res || { ok: false, status: 0 };
      var data = out.data || {};
      var status = Number(res.status) || 0;
      if (status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
        showLocked();
        return;
      }
      if (status === 403 && data && data.error === "missing_guilds_scope") {
        showScopeNotice();
        return;
      }
      // Success se c'è guilds[] (anche se ok manca / body anomalo)
      if (guildsPayloadOk(data)) {
        setError("");
        showApp();
        renderGuilds(data.guilds || []);
        return;
      }
      if (!res.ok || data.ok === false || !out.raw) {
        var detail = "";
        try {
          if (data && data.error) detail = " (" + String(data.error) + ")";
          else if (status) detail = " (HTTP " + status + ")";
        } catch (eDet) {}
        setError(
          (data && data.message) ||
            t("dash.errLoadServers", "Impossibile caricare i server.") + detail,
        );
        return;
      }
      setError("");
      showApp();
      renderGuilds(data.guilds);
    } catch (e) {
      if (seq !== loadSeq) return;
      setError(t("dash.errNetworkServers", "Errore di rete durante il caricamento dei server."));
    } finally {
      if (seq === loadSeq) setLoading(false);
    }
  }

  function wireGateLogin() {
    var gateBtn = byId("vc-dashboard-gate-login");
    if (!gateBtn) return;
    gateBtn.addEventListener("click", function () {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(gateBtn);
      }
    });
    var scopeBtn = byId("vc-dashboard-scope-relogin");
    if (scopeBtn) {
      scopeBtn.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(scopeBtn);
        }
      });
    }
  }

  function boot() {
    wireGateLogin();
    var started = false;
    function startOnce() {
      if (started) return;
      started = true;
      if (getToken() || hasLikelySession()) {
        loadGuilds();
        return;
      }
      obscureDashboard({ force: true });
    }
    if (window.__VC_DASHBOARD_ACCESS_OK === true || document.documentElement.classList.contains("vc-dash-access-ready")) {
      startOnce();
    } else if (getToken() || hasLikelySession()) {
      /* aspetta il gate, ma non kickare */
      window.setTimeout(function () {
        if (!started) startOnce();
      }, 2800);
    } else {
      window.setTimeout(function () {
        if (!started) startOnce();
      }, 900);
    }
  }

  window.addEventListener("vc-dashboard-access", function (ev) {
    var d = ev && ev.detail;
    if (d && d.allowed === false) {
      obscureDashboard({ force: true });
      return;
    }
    if (getToken() || hasLikelySession()) loadGuilds();
  });

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      loadGuilds();
      return;
    }
    /* null durante refresh sessione ≠ logout */
    if (accessPending() || hasLikelySession()) return;
    obscureDashboard({ force: true });
  });

  document.addEventListener("vc:langchange", function () {
    if (lastGuilds && lastGuilds.length) renderGuilds(lastGuilds);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
