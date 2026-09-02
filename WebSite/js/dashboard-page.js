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
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t2 || !exp || Date.now() >= exp) return "";
    return t2;
  }

  function hasGuildsScope() {
    if (typeof window.__vcDiscordTokenHasScope === "function") {
      return window.__vcDiscordTokenHasScope("guilds");
    }
    return false;
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

  function obscureDashboard() {
    if (typeof window.__vcDashboardObscureIfUnauthorized === "function") {
      window.__vcDashboardObscureIfUnauthorized();
      return;
    }
    try {
      window.location.replace(homeUrl());
    } catch (e2) {
      window.location.href = homeUrl();
    }
  }

  function hideGate() {
    var g = byId("vc-dashboard-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
  }

  function showGate() {
        obscureDashboard();
  }

  function hideLocked() {
    var el = byId("vc-dashboard-locked");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.add("vc-reviews-gate--dismissed");
  }

  function showLocked() {
    obscureDashboard();
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
    if (!el) return;
    clearErrorTimer();
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
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
      setTimeout(resolve, ms);
    });
  }

  async function fetchDashboardJson(url, token, options) {
    var attempts = (options && options.attempts) || 3;
    var lastRes = null;
    var lastData = {};
    for (var i = 0; i < attempts; i += 1) {
      try {
        lastRes = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        lastData = await lastRes.json().catch(function () {
          return {};
        });
        if (lastRes.status === 502 || lastRes.status === 503 || lastRes.status === 504) {
          if (i < attempts - 1) {
            await sleep(350 * (i + 1));
            continue;
          }
        }
        return { res: lastRes, data: lastData };
      } catch (e) {
        if (i < attempts - 1) {
          await sleep(350 * (i + 1));
          continue;
        }
        throw e;
      }
    }
    return { res: lastRes || { ok: false, status: 0 }, data: lastData };
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
      var res = out.res;
      var data = out.data;
      if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
        showLocked();
        return;
      }
      if (res.status === 403 && data && data.error === "missing_guilds_scope") {
        showScopeNotice();
        return;
      }
      if (!res.ok || !data || data.ok === false) {
        setError((data && data.message) || t("dash.errLoadServers", "Impossibile caricare i server."));
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
    if (getToken()) {
      loadGuilds();
      return;
    }
    obscureDashboard();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      loadGuilds();
      return;
    }
    obscureDashboard();
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
