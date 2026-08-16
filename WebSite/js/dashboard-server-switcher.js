(function () {
  "use strict";

  // Guild page gestisce già lo switcher con hash/view; evita doppio bind.
  if (window.__VC_DASH_SWITCHER_OWNED) return;
  if (window.__vcDashServerSwitcherBooted) return;

  // Pagina lista /dashboard: lo switcher è ridondante (sei già sulla scelta server).
  try {
    var path = String(window.location.pathname || "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (path === "/dashboard" || path.endsWith("/dashboard")) {
      var homeSw = document.getElementById("vc-dash-server-switcher");
      if (homeSw) {
        homeSw.setAttribute("hidden", "");
        homeSw.remove();
      }
      return;
    }
  } catch (eHome) {}

  window.__vcDashServerSwitcherBooted = true;

  var CACHE_KEY = "vc_dash_switcher_guilds_v1";
  var loadPromise = null;
  var retryTimer = null;
  var failCount = 0;
  var guildsMem = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return window.__VC_SITE_DASHBOARD || {};
  }

  function i18n(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function apiBase() {
    var isLocal = false;
    try {
      isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    } catch (e0) {}
    var d = cfg();
    var raw = String(isLocal && d.apiUrlLocal ? d.apiUrlLocal : d.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (e) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e2) {
      return "";
    }
  }

  function dashboardListUrl() {
    var u = String(cfg().pageUrl || "/dashboard/").trim();
    return u || "/dashboard/";
  }

  function guildPageUrl(guildId) {
    var base = String(cfg().guildPageUrl || "/dashboard/guild/").trim();
    if (!base.endsWith("/")) base += "/";
    return base + "?id=" + encodeURIComponent(String(guildId || ""));
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(guilds) {
    try {
      if (!Array.isArray(guilds) || !guilds.length) return;
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(guilds));
    } catch (e) {}
  }

  function hideTip() {
    var tip = byId("vc-dash-server-switcher-tip");
    if (!tip) return;
    tip.hidden = true;
    tip.textContent = "";
    tip.style.left = "";
  }

  function showTip(anchorEl) {
    var tip = byId("vc-dash-server-switcher-tip");
    var inner = tip && tip.parentElement;
    if (!tip || !inner || !anchorEl) return;
    var label = String(anchorEl.getAttribute("data-server-name") || anchorEl.getAttribute("aria-label") || "").trim();
    if (!label) {
      hideTip();
      return;
    }
    tip.textContent = label;
    tip.hidden = false;
    var innerRect = inner.getBoundingClientRect();
    var anchorRect = anchorEl.getBoundingClientRect();
    var x = anchorRect.left + anchorRect.width / 2 - innerRect.left;
    tip.style.left = Math.max(12, Math.min(innerRect.width - 12, x)) + "px";
  }

  function resetDock(list) {
    if (!list) return;
    var items = list.querySelectorAll(".vc-dash-server-switcher__item");
    for (var i = 0; i < items.length; i++) {
      items[i].style.setProperty("--dock-scale", "1");
      items[i].classList.remove("is-dock-active");
    }
    hideTip();
  }

  function bindDock(list) {
    if (!list || list.dataset.dockBound === "1") return;
    list.dataset.dockBound = "1";
    var maxScale = 1.38;
    var range = 78;
    var finePointer = false;
    try {
      finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (eMq) {}

    function applyDock(clientX) {
      var items = list.querySelectorAll(".vc-dash-server-switcher__item");
      if (!items.length) return;
      var closest = null;
      var closestDist = Infinity;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var dist = Math.abs(clientX - cx);
        var t = Math.max(0, 1 - dist / range);
        var scale = 1 + (maxScale - 1) * (t * t * (3 - 2 * t));
        el.style.setProperty("--dock-scale", String(scale));
        el.classList.toggle("is-dock-active", false);
        if (dist < closestDist) {
          closestDist = dist;
          closest = el;
        }
      }
      if (closest && closestDist < range) {
        closest.classList.add("is-dock-active");
        showTip(closest);
      } else {
        hideTip();
      }
    }

    if (finePointer) {
      list.addEventListener("pointermove", function (e) {
        applyDock(e.clientX);
      });
      list.addEventListener("pointerleave", function () {
        resetDock(list);
      });
    }

    var root = byId("vc-dash-server-switcher");
    if (root && root.dataset.allTipBound !== "1") {
      root.dataset.allTipBound = "1";
      root.addEventListener("pointerover", function (e) {
        var allBtn = e.target && e.target.closest ? e.target.closest(".vc-dash-server-switcher__all") : null;
        if (!allBtn || !root.contains(allBtn)) return;
        if (finePointer) showTip(allBtn);
      });
      root.addEventListener("pointerout", function (e) {
        var allBtn = e.target && e.target.closest ? e.target.closest(".vc-dash-server-switcher__all") : null;
        if (!allBtn) return;
        hideTip();
      });
    }
  }

  function currentGuildId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var id = String(q.get("id") || "").trim();
      if (/^\d{17,22}$/.test(id)) return id;
    } catch (e) {}
    try {
      return String(sessionStorage.getItem("vc_dash_last_guild_id") || "").trim();
    } catch (e2) {
      return "";
    }
  }

  function render(guilds) {
    var root = byId("vc-dash-server-switcher");
    var list = byId("vc-dash-server-switcher-list");
    if (!root || !list) return;
    var rows = Array.isArray(guilds) ? guilds : [];
    if (rows.length < 2) {
      root.setAttribute("hidden", "");
      list.innerHTML = "";
      resetDock(list);
      return;
    }
    var current = currentGuildId();
    list.innerHTML = rows
      .map(function (row) {
        var id = String((row && row.id) || "").trim();
        if (!id) return "";
        var name = String((row && row.name) || "Server");
        var icon = String((row && row.iconUrl) || "").trim();
        var botPresent = row && row.botPresent === true;
        var isCurrent = id === current;
        var href = guildPageUrl(id);
        var initial = (name.trim().charAt(0) || "?").toUpperCase();
        var media = icon
          ? '<img src="' +
            esc(icon) +
            '" alt="" width="40" height="40" loading="lazy" decoding="async" />'
          : '<span class="vc-dash-server-switcher__fallback" aria-hidden="true">' + esc(initial) + "</span>";
        return (
          '<a class="vc-dash-server-switcher__item' +
          (isCurrent ? " is-current" : "") +
          (botPresent ? "" : " is-missing") +
          '" href="' +
          esc(href) +
          '" role="listitem"' +
          (isCurrent ? ' aria-current="page"' : "") +
          ' aria-label="' +
          esc(name) +
          '" data-server-name="' +
          esc(name) +
          '" style="--dock-scale: 1">' +
          '<span class="vc-dash-server-switcher__icon">' +
          media +
          "</span>" +
          "</a>"
        );
      })
      .join("");
    root.removeAttribute("hidden");
    var allBtn = root.querySelector(".vc-dash-server-switcher__all");
    if (allBtn) {
      allBtn.setAttribute("href", dashboardListUrl());
      if (!allBtn.getAttribute("data-server-name")) {
        allBtn.setAttribute("data-server-name", i18n("dash.switcherAll", "Tutti i server"));
      }
    }
    bindDock(list);
    resetDock(list);
    list.scrollLeft = 0;
  }

  function scheduleRetry(ms) {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      load({ force: true });
    }, Math.max(1500, Number(ms) || 4000));
  }

  async function load(opts) {
    opts = opts || {};
    var token = getToken();
    var root = byId("vc-dash-server-switcher");
    if (!token || !root) return;
    if (loadPromise && !opts.force) return loadPromise;

    if (!Array.isArray(guildsMem) || guildsMem.length < 2) {
      var cached = readCache();
      if (cached && cached.length >= 2) guildsMem = cached;
    }
    if (Array.isArray(guildsMem) && guildsMem.length >= 2) render(guildsMem);

    if (loadPromise && opts.force) {
      scheduleRetry(2500);
      return loadPromise;
    }

    loadPromise = (async function () {
      try {
        var res = await fetch(apiBase() + "/guilds", {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || !data || data.ok === false || !Array.isArray(data.guilds)) {
          if (Array.isArray(guildsMem) && guildsMem.length >= 2) render(guildsMem);
          else root.setAttribute("hidden", "");
          failCount += 1;
          scheduleRetry(failCount > 1 ? 12000 : 4000);
          return;
        }
        failCount = 0;
        guildsMem = data.guilds;
        writeCache(data.guilds);
        render(data.guilds);
        if (root.hasAttribute("hidden") && data.guilds.length < 2) scheduleRetry(8000);
      } catch (e) {
        if (Array.isArray(guildsMem) && guildsMem.length >= 2) render(guildsMem);
        else root.setAttribute("hidden", "");
        scheduleRetry(5000);
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function boot() {
    if (!byId("vc-dash-server-switcher")) return;
    if (getToken()) {
      load();
      return;
    }
    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev && ev.detail ? ev.detail.user : null;
      if (u) load({ force: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
