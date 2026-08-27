(function () {
  var currentViewer = null;
  var lastRenderedProfile = null;
  var profileRankObjectUrl = "";
  var profileRankRenderToken = 0;
  var liveProfilePollTimer = null;
  var LIVE_PROFILE_POLL_MS = 60000;
  var PROFILE_CACHE_TTL_MS = 90000;
  var PROFILE_FETCH_TIMEOUT_MS = 20000;
  var PROFILE_FETCH_MAX_RETRIES = 2;
  var PROFILE_RANK_PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
  var PROFILE_RANK_PREVIEW_CACHE_PREFIX = "vc:profile-rank-preview:";
  var profileMemoryCache = new Map();
  var lastProfileRenderSignature = "";
  var lastRankPreviewUserId = "";
  var lastRankPreviewLoadedAt = 0;
  var RANK_PREVIEW_RELOAD_MIN_MS = 5 * 60 * 1000;
  var profileBootGaveUp = false;

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e1) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e2) {}
    try {
      if (navigator.standalone) return true;
    } catch (e3) {}
    return false;
  }

  var PROFILE_BOOT_FAILSAFE_MS =
    PROFILE_FETCH_TIMEOUT_MS * (PROFILE_FETCH_MAX_RETRIES + 1) + (isStandalonePwa() ? 12000 : 8000);

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_USER_LEADER) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    var api = String(c.apiUrl || "").trim();
    try {
      if (api && typeof window !== "undefined") {
        var u = new URL(api, window.location.origin);
        var currentHost = String(window.location.hostname || "").replace(/^www\./i, "").toLowerCase();
        var apiHost = String(u.hostname || "").replace(/^www\./i, "").toLowerCase();
        if (currentHost && apiHost && currentHost === apiHost) {
          return window.location.origin + u.pathname + u.search;
        }
      }
    } catch (e) {}
    return api;
  }

  function readSessionCache(key, now) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.expireAt) || parsed.expireAt <= now) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.value;
    } catch (e) {
      return null;
    }
  }

  function writeSessionCache(key, value, ttlMs, now) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ expireAt: now + Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS), value: value })
      );
    } catch (e) {}
  }

  function clearProfileSessionCaches() {
    try {
      profileMemoryCache.clear();
    } catch (eMem) {}
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i += 1) {
        var k = sessionStorage.key(i);
        if (k && (k.indexOf("vc:profilecache:") === 0 || k.indexOf(PROFILE_RANK_PREVIEW_CACHE_PREFIX) === 0)) {
          keys.push(k);
        }
      }
      for (var j = 0; j < keys.length; j += 1) {
        sessionStorage.removeItem(keys[j]);
      }
    } catch (eSess) {}
  }

  function cachedJsonFetch(url, ttlMs) {
    var key = "vc:profilecache:" + String(url || "");
    var now = Date.now();
    var mem = profileMemoryCache.get(key);
    if (mem && Number.isFinite(mem.expireAt) && mem.expireAt > now) {
      return Promise.resolve(mem.value);
    }
    var sess = readSessionCache(key, now);
    if (sess) {
      profileMemoryCache.set(key, { expireAt: now + Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS), value: sess });
      return Promise.resolve(sess);
    }
    var fetchOpts = { credentials: "omit", cache: "no-store" };
    return fetch(url, fetchOpts)
      .then(function (r) {
        return r.json().then(
          function (body) {
            return { httpOk: r.ok, body: body };
          },
          function () {
            return { httpOk: false, body: null };
          },
        );
      })
      .then(function (payload) {
        var body = payload && payload.body ? payload.body : null;
        var success = Boolean(payload && payload.httpOk && body && body.ok === true);
        if (success) {
          var ttl = Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS);
          profileMemoryCache.set(key, { expireAt: now + ttl, value: payload });
          try {
            var approx = JSON.stringify(payload || {}).length;
            if (approx > 0 && approx < 120000) {
              writeSessionCache(key, payload, ttl, now);
            }
          } catch (eCache) {}
        } else {
          try {
            profileMemoryCache.delete(key);
          } catch (eMemDel) {}
          try {
            sessionStorage.removeItem(key);
          } catch (eSessDel) {}
        }
        return payload;
      })
      .catch(function () {
        try {
          profileMemoryCache.delete(key);
        } catch (eMemDel) {}
        try {
          sessionStorage.removeItem(key);
        } catch (eSessDel) {}
        return { httpOk: false, body: null };
      });
  }

  function resolvedPublicRankPreviewUrl(userId) {
    var base = resolvedApiUrl();
    var id = String(userId || "").trim();
    if (!base || !/^\d{17,20}$/.test(id)) return "";
    var root = base.split("?")[0];
    var endpoint = root.replace(/\/site-users\/?$/i, "/site-rank-card-public");
    // niente Date.now(): altrimenti ogni poll/auth event rifà fetch + flash della card
    return endpoint + "?userId=" + encodeURIComponent(id);
  }

  function profileRenderSignature(userId, payload, viewerId) {
    var p = payload || {};
    var level = p.level || {};
    var weekly = p.weekly || {};
    var messages = p.messages || {};
    var voice = p.voice || {};
    var profile = p.profile || {};
    var custom = profile.customProfile || {};
    var role = custom.role || null;
    var secondary = custom.secondaryRole || null;
    var cvoice = custom.voice || null;
    return [
      String(userId || ""),
      String(viewerId || ""),
      String(level.level || 0),
      String(level.exp || 0),
      String(level.rank || ""),
      String(weekly.weeklyExp || 0),
      String(weekly.weeklyRank || ""),
      String(messages.messagesTotal || 0),
      String(messages.messagesWeekly || 0),
      String(messages.messagesDaily || 0),
      String(voice.voiceTotalSeconds || 0),
      String(voice.voiceWeeklySeconds || 0),
      String(voice.voiceDailySeconds || 0),
      role ? String(role.id || "") + ":" + String(role.name || "") + ":" + String(role.color || "") + ":" + String(role.memberCount || 0) : "",
      secondary ? String(secondary.id || "") + ":" + String(secondary.name || "") + ":" + String(secondary.memberCount || 0) : "",
      cvoice ? String(cvoice.id || "") + ":" + String(cvoice.name || "") + ":" + String(cvoice.memberCount || 0) : "",
      String((profile.displayName || profile.username || "")),
      String(profile.avatarUrl || ""),
      String(profile.expMultiplierResolved || weekly.expMultiplier || ""),
      Array.isArray(profile.weeklyMultiplierSources)
        ? profile.weeklyMultiplierSources
            .map(function (s) {
              return String((s && s.key) || "") + ":" + String((s && s.multiplier) || "") + ":" + String((s && s.active) || "");
            })
            .join(",")
        : "",
    ].join("|");
  }

  function profileRankPreviewCacheKey(userId) {
    return PROFILE_RANK_PREVIEW_CACHE_PREFIX + String(userId || "").trim();
  }

  function loadCachedProfileRankPreview(userId) {
    var key = profileRankPreviewCacheKey(userId);
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return "";
      var parsed = JSON.parse(raw);
      var now = Date.now();
      if (
        !parsed ||
        typeof parsed.dataUrl !== "string" ||
        !parsed.dataUrl ||
        !Number.isFinite(parsed.updatedAt) ||
        now - parsed.updatedAt > PROFILE_RANK_PREVIEW_CACHE_TTL_MS
      ) {
        sessionStorage.removeItem(key);
        return "";
      }
      return parsed.dataUrl;
    } catch (e) {
      return "";
    }
  }

  function saveCachedProfileRankPreview(userId, dataUrl) {
    var key = profileRankPreviewCacheKey(userId);
    try {
      if (!dataUrl || typeof dataUrl !== "string") return;
      sessionStorage.setItem(
        key,
        JSON.stringify({
          updatedAt: Date.now(),
          dataUrl: dataUrl,
        }),
      );
    } catch (e) {}
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(typeof reader.result === "string" ? reader.result : "");
        };
        reader.onerror = function () {
          reject(new Error("blob_to_data_url_failed"));
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Per url('…') in CSS custom property: non usare esc() HTML (rompe data:/SVG con &). */
  function escForSingleQuotedCssUrl(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function isUnexpandedPlaceholder(s) {
    return /^\{\{[A-Z0-9_]+\}\}$/.test(String(s || "").trim());
  }

  function siteName() {
    try {
      var metaSite = document.querySelector('meta[name="author"]');
      if (metaSite) {
        var mv = String(metaSite.getAttribute("content") || "").trim();
        if (mv && !isUnexpandedPlaceholder(mv)) return mv;
      }
      var brand = document.querySelector('header a[aria-label*="homepage"]');
      if (brand) {
        var bn = String(brand.textContent || "").replace(/\s+/g, " ").trim();
        if (bn && !isUnexpandedPlaceholder(bn)) return bn;
      }
      var t = String(document.title || "").trim();
      if (t.indexOf("|") > -1) {
        var parts = t.split("|");
        for (var i = 0; i < parts.length; i++) {
          var piece = String(parts[i] || "").trim();
          if (piece && !isUnexpandedPlaceholder(piece) && !/^\{\{/.test(piece)) return piece;
        }
      }
      if (t && !isUnexpandedPlaceholder(t) && !/^\{\{/.test(t)) return t;
    } catch (e) {}
    return "Vinili & Caffè";
  }

  function parseProfileId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var fromQuery = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(fromQuery)) return fromQuery;
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  function profilePublicUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function profileCustomizeUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/user/personalizza/?id=" + encodeURIComponent(id) + "&target=rank" : "/user/personalizza/?target=rank";
  }

  function profilePersonalizzaHubUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/user/personalizza/?id=" + encodeURIComponent(id) : "/user/personalizza/";
  }

  function customProfileEditorUrl(target) {
    var t = String(target || "primary").trim().toLowerCase();
    if (t !== "primary" && t !== "secondary" && t !== "voice") t = "primary";
    return "/user/personalizza/?target=" + encodeURIComponent(t);
  }

  function getDiscordToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function customProfileApiUrl() {
    var c = (typeof window !== "undefined" && window.__VC_CUSTOM_PROFILE) || {};
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.apiUrl || "/webhooks/site-custom-profile").trim() || "/webhooks/site-custom-profile";
  }

  function createCustomCardHtml(target, title, meta) {
    return (
      '<div class="vc-user-profile-createcard" data-vc-cpf-create="' +
      esc(target) +
      '">' +
      '<div class="vc-user-profile-createcard__copy">' +
      '<strong class="vc-user-profile-createcard__title">' +
      esc(title) +
      "</strong>" +
      '<span class="vc-user-profile-createcard__meta">' +
      esc(meta) +
      "</span>" +
      "</div>" +
      '<button type="button" class="vc-user-profile-createcard__btn" data-vc-cpf-create-btn="' +
      esc(target) +
      '">Crea</button>' +
      "</div>"
    );
  }

  async function createCustomFromProfile(target) {
    var token = getDiscordToken();
    if (!token) {
      window.alert("Effettua il login Discord per creare ruolo o vocale.");
      return;
    }
    var t = String(target || "").trim().toLowerCase();
    if (t !== "primary" && t !== "secondary" && t !== "voice") return;
    var btn = document.querySelector('[data-vc-cpf-create-btn="' + t + '"]');
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(customProfileApiUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        credentials: "omit",
        body: JSON.stringify({ target: t, action: "create" }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!data || data.ok !== true) {
        window.alert((data && data.message) || "Creazione non riuscita.");
        if (btn) btn.disabled = false;
        return;
      }
      window.location.href = customProfileEditorUrl(t);
    } catch (e) {
      window.alert("Errore di rete. Riprova.");
      if (btn) btn.disabled = false;
    }
  }

  function wireProfileCustomCreate(root) {
    if (!root || root._vcCpfCreateWired) return;
    root._vcCpfCreateWired = true;
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-cpf-create-btn]") : null;
      if (!btn) return;
      ev.preventDefault();
      createCustomFromProfile(btn.getAttribute("data-vc-cpf-create-btn"));
    });
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function formatHoursIt(sec) {
    var s = Number(sec);
    if (!Number.isFinite(s) || s < 0) return "0,0h";
    return String((s / 3600).toFixed(1)).replace(".", ",") + "h";
  }

  function formatPct(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0%";
    return String(Math.max(0, Math.min(100, Math.round(x)))) + "%";
  }

  function formatMult(n) {
    var x = Number(n);
    if (!Number.isFinite(x) || x <= 0) x = 1;
    return "x" + String(x.toFixed(1));
  }

  /** Match WebSite/js/user-rank-customize-page.js previewStatIcon (+rank canvas uses same shapes). */
  function rankCardStatIcon(type) {
    var svg = "";
    if (type === "trophy") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M8 6h16l-2 10c-1.2 3-4.1 5-6 5s-4.8-2-6-5L8 6Z" fill="currentColor"></path>' +
        '<path d="M6 8c-2.9.4-4.8 2-4.8 4.7 0 3.4 2.8 5.8 6.7 5.8M26 8c2.9.4 4.8 2 4.8 4.7 0 3.4-2.8 5.8-6.7 5.8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"></path>' +
        '<rect x="14" y="20" width="4" height="6" rx="1" fill="currentColor"></rect>' +
        '<rect x="8" y="26" width="16" height="3.6" rx="1.6" fill="currentColor"></rect>' +
        "</svg>";
    } else if (type === "bolt") {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="M19 1 8 16h7l-3 15 12-17h-7l2-13Z" fill="currentColor"></path>' +
        "</svg>";
    } else {
      svg =
        '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
        '<path d="m16 2 3.8 8 8.7 1-6.5 5.7 1.8 8.5L16 21l-7.8 5.2 1.8-8.5L3.5 11l8.7-1L16 2Z" fill="currentColor"></path>' +
        "</svg>";
    }
    return (
      '<span class="vc-rank-editor-preview__icon vc-rank-editor-preview__icon--' +
      esc(type) +
      '">' +
      svg +
      "</span>"
    );
  }

  function hexToRgbList(hex) {
    var raw = String(hex || "").trim();
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return "";
    return (
      parseInt(body.slice(0, 2), 16) +
      ", " +
      parseInt(body.slice(2, 4), 16) +
      ", " +
      parseInt(body.slice(4, 6), 16)
    );
  }

  function resolvedRankBoxDisplayColor(src) {
    var rb = String(src.rankBoxBorderColor || "").trim();
    if (rb && rb.charAt(0) !== "#") rb = "#" + rb;
    var value = String(src.valueColor || "#f2f2f2").trim();
    if (value && value.charAt(0) !== "#") value = "#" + value;
    if (rb.toLowerCase() === "#ffcb05") return value;
    if (/^#[0-9a-fA-F]{6}$/.test(rb)) return rb;
    return value;
  }

  function rankCardStyleVars(theme, resolvedWallpaper) {
    var src = theme && typeof theme === "object" ? theme : {};
    var panel = String(src.panelColor || "#202225").trim();
    var primary = String(src.primaryTextColor || "#ffcb05").trim();
    var label = String(src.labelColor || "#a8acb8").trim();
    var secondary = String(src.secondaryTextColor || label || "#a8acb8").trim();
    var value = String(src.valueColor || "#f2f2f2").trim();
    var mult = String(src.multiplierColor || "#ffb400").trim();
    var pStart = String(src.progressStartColor || primary || "#ffcb05").trim();
    var pEnd = String(src.progressEndColor || primary || "#ffcb05").trim();
    var ring = String(src.ringColor || primary || "#ffcb05").trim();
    var rankBox = resolvedRankBoxDisplayColor(src);
    var opacity = src.overlayOpacity != null && src.overlayOpacity !== "" ? Number(src.overlayOpacity) : 0.8;
    if (!isFinite(opacity)) opacity = 0.8;
    opacity = Math.max(0, Math.min(1, opacity));
    var rgb = hexToRgbList(panel);
    var out = [
      "--vc-rank-panel:" + esc(panel),
      "--vc-rank-panel-rgb:" + esc(rgb || "32, 34, 37"),
      "--vc-rank-primary:" + esc(primary),
      "--vc-rank-secondary:" + esc(secondary),
      "--vc-rank-multiplier:" + esc(mult),
      "--vc-rank-value:" + esc(value),
      "--vc-rank-label:" + esc(label),
      "--vc-rank-progress-start:" + esc(pStart),
      "--vc-rank-progress-end:" + esc(pEnd),
      "--vc-rank-ring:" + esc(ring),
      "--vc-rank-rankbox:" + esc(rankBox),
      "--vc-rank-opacity:" + esc(String(opacity)),
    ];
    if (resolvedWallpaper) {
      out.push("--vc-rank-wallpaper:url('" + escForSingleQuotedCssUrl(resolvedWallpaper) + "')");
    }
    return ' style="' + out.join(";") + '"';
  }

  function formatDateIt(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!isFinite(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    } catch (e) {
      return d.toLocaleDateString("it-IT");
    }
  }

  function defaultEmbedAvatarUrl(userId) {
    var idx = 0;
    if (/^\d{17,20}$/.test(String(userId || ""))) {
      try {
        idx = Number((BigInt(String(userId)) >> BigInt(22)) % BigInt(6));
      } catch (e) {
        idx = 0;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  function hideLeaderOnlySections() {
    var nodes = document.querySelectorAll("[data-vc-leader-only]");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].hidden = true;
      nodes[i].style.setProperty("display", "none", "important");
    }
    document.documentElement.classList.add("vc-user-profile-route");
    document.documentElement.classList.remove("vc-page-cine-boot");
    document.documentElement.classList.add("vc-page-cine-ready");
    document.body.classList.add("vc-user-profile-page", "vc-user-profile-route");
    document.body.classList.remove("vc-page-cine-layout");
    try {
      delete document.body.dataset.vcPageCineLayout;
    } catch (eData) {}
    var cineHeroes = document.querySelectorAll(".vc-page-cine-hero, .vc-home-cine-hero");
    for (var h = 0; h < cineHeroes.length; h += 1) {
      cineHeroes[h].classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
      cineHeroes[h].style.setProperty("display", "none", "important");
      cineHeroes[h].style.setProperty("min-height", "0", "important");
    }
    var leftover = document.getElementById("vc-page-content");
    if (leftover && leftover.querySelector("[data-vc-leader-only]")) {
      leftover.hidden = true;
      leftover.style.setProperty("display", "none", "important");
    }
    var pager = byId("vc-ul-pager");
    if (pager) {
      pager.hidden = true;
      pager.style.setProperty("display", "none", "important");
    }
  }

  function buildApiUrl(board, userId) {
    var base = resolvedApiUrl();
    if (!base) return "";
    return (
      base.split("?")[0] +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "board=" +
      encodeURIComponent(board) +
      "&userId=" +
      encodeURIComponent(userId) +
      "&perPage=1"
    );
  }

  function fetchBoard(board, userId) {
    var url = buildApiUrl(board, userId);
    if (!url) return Promise.resolve({ ok: false, board: board, rows: [] });
    return cachedJsonFetch(url, PROFILE_CACHE_TTL_MS)
      .then(function (out) {
        var b = out && out.body ? out.body : {};
        return {
          ok: Boolean(out && out.httpOk && b && b.ok === true),
          board: board,
          notFound: Boolean(b && b.notFound),
          rows: Array.isArray(b && b.rows) ? b.rows : [],
          profile: b && b.profile ? b.profile : null,
        };
      })
      .catch(function () {
        return { ok: false, board: board, rows: [] };
      });
  }

  function fetchProfileBundle(userId) {
    var url = buildApiUrl("profile", userId);
    if (!url) {
      return Promise.resolve({
        ok: false,
        notFound: false,
        profile: null,
        level: null,
        weekly: null,
        messages: null,
        voice: null,
      });
    }

    function mapBody(out) {
      var b = out && out.body ? out.body : {};
      var rows = b && b.rows && typeof b.rows === "object" ? b.rows : {};
      return {
        ok: Boolean(out && out.httpOk && b && b.ok === true),
        notFound: Boolean(b && b.notFound),
        profile: b && b.profile ? b.profile : null,
        level: rows.level || null,
        weekly: rows.weekly || null,
        messages: rows.messages || null,
        voice: rows.voice || null,
      };
    }

    var prefetch = null;
    try {
      prefetch = window.__VC_PROFILE_PREFETCH;
      if (
        prefetch &&
        String(prefetch.userId || "") === String(userId) &&
        prefetch.promise &&
        typeof prefetch.promise.then === "function"
      ) {
        window.__VC_PROFILE_PREFETCH = null;
        var fetchPromise = prefetch.promise
          .then(function (out) {
            return mapBody(out);
          })
          .catch(function () {
            return cachedJsonFetch(url, PROFILE_CACHE_TTL_MS).then(mapBody);
          });
        return new Promise(function (resolve) {
          var settled = false;
          var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            resolve({
              ok: false,
              notFound: false,
              timedOut: true,
              profile: null,
              level: null,
              weekly: null,
              messages: null,
              voice: null,
            });
          }, PROFILE_FETCH_TIMEOUT_MS);
          fetchPromise
            .then(function (result) {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(result);
            })
            .catch(function () {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve({
                ok: false,
                notFound: false,
                timedOut: true,
                profile: null,
                level: null,
                weekly: null,
                messages: null,
                voice: null,
              });
            });
        });
      }
    } catch (ePref) {}

    var fetchPromise = cachedJsonFetch(url, PROFILE_CACHE_TTL_MS)
      .then(mapBody)
      .catch(function () {
        return {
          ok: false,
          notFound: false,
          profile: null,
          level: null,
          weekly: null,
          messages: null,
          voice: null,
        };
      });
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          notFound: false,
          timedOut: true,
          profile: null,
          level: null,
          weekly: null,
          messages: null,
          voice: null,
        });
      }, PROFILE_FETCH_TIMEOUT_MS);
      fetchPromise
        .then(function (result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            ok: false,
            notFound: false,
            timedOut: true,
            profile: null,
            level: null,
            weekly: null,
            messages: null,
            voice: null,
          });
        });
    });
  }

  function clearProfilePending() {
    try {
      document.documentElement.classList.remove("vc-user-profile-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
    } catch (e) {}
    try {
      var html = document.documentElement;
      var body = document.body;
      if (html) {
        html.style.removeProperty("overflow");
        html.style.removeProperty("overflow-x");
        html.style.removeProperty("overflow-y");
        html.style.removeProperty("height");
        html.style.removeProperty("max-height");
        html.style.removeProperty("touch-action");
      }
      if (body) {
        body.style.removeProperty("position");
        body.style.removeProperty("inset");
        body.style.removeProperty("top");
        body.style.removeProperty("right");
        body.style.removeProperty("bottom");
        body.style.removeProperty("left");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overflow-x");
        body.style.removeProperty("overflow-y");
        body.style.removeProperty("height");
        body.style.removeProperty("max-height");
        body.style.removeProperty("touch-action");
      }
    } catch (eStyle) {}
  }

  function clearProfileLoading() {
    var overlay = byId("vc-user-profile-loading");
    if (overlay) overlay.remove();
    try {
      var boots = document.querySelectorAll("[data-vc-profile-boot]");
      for (var i = 0; i < boots.length; i += 1) {
        boots[i].remove();
      }
    } catch (eBoot) {}
  }

  function renderInlineLoading(root) {
    if (!root) return;
    root.hidden = false;
    if (root.querySelector("[data-vc-profile-boot]")) return;
    root.innerHTML =
      '<div class="vc-user-profile-loader vc-user-profile-boot vc-user-profile-boot--inline" data-vc-profile-boot role="status" aria-live="polite" aria-label="Caricamento profilo">' +
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">Caricamento profilo</p>' +
      '<p class="vc-user-profile-loader__sub">Sto recuperando le statistiche dell\'utente...</p>' +
      "</div>";
  }

  function renderLoading(root) {
    clearProfileLoading();
    renderInlineLoading(root);
  }

  function renderError(root, message) {
    clearProfileLoading();
    root.hidden = false;
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<div class="vc-user-profile-empty">' +
      '<div class="vc-user-profile-empty__emoji" aria-hidden="true">!</div>' +
      '<h1 class="vc-user-profile-empty__title">Profilo non disponibile</h1>' +
      '<p class="vc-user-profile-empty__text">' +
      esc(message || "Non sono riuscito a caricare i dati del profilo in questo momento.") +
      "</p>" +
      '<div class="vc-user-profile-empty__actions">' +
      '<button type="button" class="vc-user-profile-empty__cta" id="vc-user-profile-retry">Riprova</button>' +
      '<a class="vc-user-profile-empty__cta vc-user-profile-empty__cta--ghost" href="/user">Torna alla Community</a>' +
      "</div></div></section>";
    clearProfilePending();
    var retryBtn = byId("vc-user-profile-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        profileBootGaveUp = false;
        window.__VC_PROFILE_GAVE_UP = false;
        profileInitialLoadDone = false;
        clearProfileSessionCaches();
        main({ force: true });
      });
    }
  }

  function renderEmpty(root, userId) {
    clearProfileLoading();
    if (window.VcPageTitle) window.VcPageTitle.set("Profilo");
    else document.title = siteName() + " | Profilo";
    root.hidden = false;
    root.innerHTML =
      '<section class="vc-user-profile-shell vc-user-profile-shell--notfound">' +
      '<div class="vc-user-profile-notfound">' +
      '<div class="vc-user-profile-notfound__emoji" aria-hidden="true">&#128532;</div>' +
      '<h1 class="vc-user-profile-notfound__title">Utente non trovato</h1>' +
      '<a class="vc-user-profile-notfound__cta" href="/user">Torna alla Community</a>' +
      "</div></section>";
    clearProfilePending();
  }

  function includesAnyRole(roleText, terms) {
    for (var i = 0; i < terms.length; i += 1) {
      if (roleText.indexOf(terms[i]) !== -1) return true;
    }
    return false;
  }

  function normalizeRoleName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/<a?:[^:]+:\d+>/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasRoleId(roles, id) {
    var want = String(id || "");
    if (!want || !Array.isArray(roles)) return false;
    for (var i = 0; i < roles.length; i += 1) {
      if (String((roles[i] && roles[i].id) || "") === want) return true;
    }
    return false;
  }

  function hasNormalizedRole(roleNames, matcher) {
    for (var i = 0; i < roleNames.length; i += 1) {
      if (matcher(roleNames[i])) return true;
    }
    return false;
  }

  function leaderboardBadgeLabel(rank) {
    var n = Number(rank || 0);
    if (n === 1) return "Primo in classifica";
    if (n === 2) return "Secondo in classifica";
    if (n === 3) return "Terzo in classifica";
    return "#" + formatIntIt(n) + " in classifica";
  }

  function leaderboardBadgeClass(rank) {
    var n = Number(rank || 0);
    if (n === 1) return "rank1";
    if (n === 2) return "rank2";
    if (n === 3) return "rank3";
    return "rank";
  }

  function profileBadgeMarkup(kind, icon, label) {
    return (
      '<span class="vc-user-profile-badge vc-user-profile-badge--' +
      esc(kind) +
      '">' +
      '<span class="vc-user-profile-badge__icon"><i class="fa ' +
      esc(icon) +
      '" aria-hidden="true"></i></span>' +
      '<span class="vc-user-profile-badge__label">' +
      esc(label) +
      "</span></span>"
    );
  }

  function buildProfileBadges(rank, roles) {
    var out = [];
    var seen = {};
    var names = Array.isArray(roles)
      ? roles
          .map(function (role) {
            return String((role && role.name) || "").toLowerCase();
          })
          .join(" | ")
      : "";

    function add(kind, icon, label) {
      if (seen[kind]) return;
      seen[kind] = true;
      out.push(profileBadgeMarkup(kind, icon, label));
    }

    if (Number(rank || 0) > 0) {
      add(leaderboardBadgeClass(rank), "fa-trophy", leaderboardBadgeLabel(rank));
    }

    var roleNames = Array.isArray(roles)
      ? roles
          .map(function (role) {
            return normalizeRoleName(role && role.name);
          })
          .filter(Boolean)
      : [];
    var hasFounder = includesAnyRole(names, ["founder", "fondatore"]);
    if (hasFounder) add("founder", "fa-star-o", "Founder");

    var hasPartnerManager =
      hasRoleId(roles, "1442568905582317740") ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("partner manager") !== -1;
      });
    var hasStaffManager =
      hasRoleId(roles, "1521562607339704442") ||
      (!hasPartnerManager &&
        hasNormalizedRole(roleNames, function (name) {
          return name === "manager";
        }));
    if (hasPartnerManager) add("pm", "fa-handshake-o", "Partner Manager");
    if (hasStaffManager) add("manager", "fa-briefcase", "Manager");

    if (includesAnyRole(names, ["high staff", "staff", "admin", "mod", "moderator", "helper", "community manager"])) {
      add("staff", "fa-shield", "Staff");
    }

    if (includesAnyRole(names, ["booster", "boost"])) {
      add("booster", "fa-rocket", "Booster");
    }

    if (
      includesAnyRole(names, [
        "donator",
        "donatore",
        "vip",
      ])
    ) {
      add("donator", "fa-heart", "Donator");
    }

    return out.length ? '<div class="vc-user-profile-badges">' + out.join("") + "</div>" : "";
  }

  function formatMultiplierX(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) n = 1;
    return "×" + n.toFixed(1);
  }

  function cleanMultiplierLabel(label, type) {
    var s = String(label == null ? "" : label).trim();
    if (String(type || "") === "role") {
      s = s.replace(/^[\s\u00a0]*(?:༄|✦|✧|★|☆|◆|◇|•|·|❖|✵)+[\s\u00a0]*/g, "").trim();
    }
    return s || "Fonte";
  }

  function buildMultiplierSourcesHtml(sources, totalMultiplier) {
    var raw = Array.isArray(sources) ? sources.slice() : [];
    var list = [];
    var baseMult = 1;
    for (var i = 0; i < raw.length; i += 1) {
      var row = raw[i] || {};
      var type = String(row.type || "").toLowerCase();
      if (type === "global" || type === "server" || type === "event") {
        var g = Number(row.multiplier);
        if (Number.isFinite(g) && g > baseMult) baseMult = g;
        continue;
      }
      if (type === "base") {
        var b = Number(row.multiplier);
        if (Number.isFinite(b) && b > 0) baseMult = Math.max(baseMult, b);
        continue;
      }
      list.push(row);
    }
    list.unshift({
      key: "base",
      label: "Base",
      type: "base",
      multiplier: baseMult > 0 ? baseMult : 1,
      active: true,
    });
    var rows = list
      .map(function (src) {
        var type = String((src && src.type) || "");
        var label = cleanMultiplierLabel((src && src.label) || "Fonte", type);
        var mult = Number(src && src.multiplier);
        if (!Number.isFinite(mult) || mult <= 0) mult = 1;
        var color = String((src && src.color) || "").trim();
        var isRole = type === "role";
        var isActive = Boolean(src && (src.active || src.applied));
        var accent = color || (isRole ? "#e8c49c" : "#94a3b8");
        return (
          '<div class="vc-user-profile-multisource' +
          (isActive && isRole ? " is-active" : "") +
          (type === "base" ? " is-base" : "") +
          '" style="--vc-multi-accent:' +
          esc(accent) +
          '">' +
          '<span class="vc-user-profile-multisource__label">' +
          '<span class="vc-user-profile-multisource__dot" aria-hidden="true"></span>' +
          "<span>" +
          esc(label) +
          "</span></span>" +
          '<span class="vc-user-profile-multisource__value">' +
          esc(formatMultiplierX(mult)) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<details class="vc-user-profile-multiplier">' +
      '<summary class="vc-user-profile-multiplier__summary">' +
      '<span class="vc-user-profile-multiplier__left"><i class="fa fa-bolt" aria-hidden="true"></i> Moltiplicatore EXP</span>' +
      '<span class="vc-user-profile-multiplier__right"><strong class="vc-user-profile-multiplier__total">' +
      esc(formatMultiplierX(totalMultiplier)) +
      '</strong><i class="fa fa-angle-down vc-user-profile-multiplier__chev" aria-hidden="true"></i></span>' +
      "</summary>" +
      '<div class="vc-user-profile-multiplier__body">' +
      rows +
      "</div></details>"
    );
  }

  function renderProfile(root, userId, payload) {
    clearProfileLoading();
    root.hidden = false;
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    var voice = payload.voice || {};
    var profile = payload.profile || {};
    var profileNick = String(profile.displayName || profile.username || level.username || "Utente").trim() || "Utente";
    var profileHandle = String(profile.username || level.username || "").trim();
    var avatar = String(profile.avatarUrl || level.avatarUrl || "").trim();
    var progressPct = formatPct(level.progressPercent || 0);
    var rankText = level.rank ? "#" + formatIntIt(level.rank) : "-";
    var weeklyRankText = weekly.rank ? "#" + formatIntIt(weekly.rank) : "-";
    var currentLevelExp = Number(level.currentLevelExp || 0);
    var nextLevelExp = Number(level.nextLevelExp || 0);
    var currentXp = Math.max(0, Number(level.exp || 0) - currentLevelExp);
    var targetXp = Math.max(1, nextLevelExp - currentLevelExp);
    var viewerOwns = Boolean(currentViewer && String(currentViewer.id || "") === String(userId));
    var roles = Array.isArray(profile.roles) ? profile.roles : [];
    var customProfile = profile.customProfile || null;
    var customRole = customProfile && customProfile.role ? customProfile.role : null;
    var customSecondaryRole = customProfile && customProfile.secondaryRole ? customProfile.secondaryRole : null;
    var customVoice = customProfile && customProfile.voice ? customProfile.voice : null;
    var rankCardTheme = profile.rankCard || {};
    var avatarRing = String(rankCardTheme.ringColor || rankCardTheme.primaryTextColor || "").trim();
    if (avatarRing && avatarRing.charAt(0) !== "#") avatarRing = "#" + avatarRing;
    if (!/^#[0-9a-fA-F]{6}$/i.test(avatarRing)) avatarRing = "";
    var avatarRingStyle = avatarRing
      ? ' style="--vc-rank-ring:' + esc(avatarRing) + '"'
      : "";
    var multiplier = Number(
      (weekly && weekly.expMultiplier != null && weekly.expMultiplier !== "" ? weekly.expMultiplier : null) ||
        profile.expMultiplierResolved ||
        1,
    );
    if (!Number.isFinite(multiplier) || multiplier <= 0) multiplier = 1;
    var multiplierSources = Array.isArray(profile.weeklyMultiplierSources)
      ? profile.weeklyMultiplierSources
      : [];
    var multiplierHtml = buildMultiplierSourcesHtml(multiplierSources, multiplier);
    var badgesHtml = buildProfileBadges(level.rank, roles);
    var customRoleCount = (customRole ? 1 : 0) + (customSecondaryRole ? 1 : 0);
    var customRoleIconHtml = customRole
      ? customRole.iconUrl
        ? '<img class="vc-user-profile-customicon__img" src="' +
          esc(customRole.iconUrl) +
          '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
        : customRole.emoji
          ? '<span class="vc-user-profile-customicon__emoji">' + esc(customRole.emoji) + "</span>"
          : '<i class="fa fa-star" aria-hidden="true"></i>'
      : "";
    var customVoiceName = customVoice ? String(customVoice.name || "Canale vocale privato").trim() : "";

    function sharedMembersMarkup(members, count, label) {
      var list = Array.isArray(members) ? members : [];
      var total = Number(count || list.length || 0);
      if (!list.length) {
        return (
          '<details class="vc-user-profile-shared">' +
          '<summary class="vc-user-profile-shared__summary"><span><i class="fa fa-users" aria-hidden="true"></i> ' +
          esc(label || "Condiviso con") +
          '</span><strong>' +
          esc(formatIntIt(total)) +
          '</strong><i class="fa fa-angle-down vc-user-profile-shared__chev" aria-hidden="true"></i></summary>' +
          '<div class="vc-user-profile-shared__empty">Nessun utente mostrabile.</div>' +
          "</details>"
        );
      }
      return (
        '<details class="vc-user-profile-shared">' +
        '<summary class="vc-user-profile-shared__summary"><span><i class="fa fa-users" aria-hidden="true"></i> ' +
        esc(label || "Condiviso con") +
        '</span><strong>' +
        esc(formatIntIt(total)) +
        '</strong><i class="fa fa-angle-down vc-user-profile-shared__chev" aria-hidden="true"></i></summary>' +
        '<div class="vc-user-profile-shared__list">' +
        list
          .map(function (member) {
            var name = String(member.displayName || member.username || "Utente").trim() || "Utente";
            var username = String(member.username || "").trim();
            var href = profilePublicUrl(member.id);
            var avatarUrl = String(member.avatarUrl || "").trim();
            return (
              '<a class="vc-user-profile-shared__user" href="' +
              esc(href) +
              '">' +
              (avatarUrl
                ? '<img class="vc-user-profile-shared__avatar" src="' + esc(avatarUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
                : '<span class="vc-user-profile-shared__avatar vc-user-profile-shared__avatar--fallback"><i class="fa fa-user" aria-hidden="true"></i></span>') +
              '<span class="vc-user-profile-shared__name">' +
              esc(name) +
              "</span>" +
              (username && username !== name ? '<span class="vc-user-profile-shared__tag">@' + esc(username) + "</span>" : "") +
              "</a>"
            );
          })
          .join("") +
        "</div>" +
        (total > list.length ? '<p class="vc-user-profile-shared__more">+' + esc(formatIntIt(total - list.length)) + " altri utenti</p>" : "") +
        "</details>"
      );
    }

    function voiceStatsHtml(voice) {
      if (!voice) return "";
      var vid = String(voice.id || "").trim();
      var count = Math.max(0, Number(voice.memberCount || 0));
      var created = voice.createdAt ? formatDateIt(voice.createdAt) : "—";
      var name = String(voice.name || customVoiceName || "Canale vocale privato").trim() || "Canale vocale privato";
      var cardOpen = viewerOwns
        ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--link" href="' +
          esc(customProfileEditorUrl("voice")) +
          '" title="Vocale privata">'
        : '<article class="vc-user-profile-customcard">';
      var cardClose = viewerOwns ? "</a>" : "</article>";
      return (
        cardOpen +
        '<div class="vc-user-profile-customcard__main">' +
        '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--voice">' +
        '<i class="fa fa-microphone" aria-hidden="true"></i>' +
        "</span>" +
        '<div class="vc-user-profile-customcard__copy">' +
        '<strong class="vc-user-profile-customcard__title">' +
        esc(name) +
        "</strong>" +
        '<span class="vc-user-profile-customcard__meta vc-user-profile-customcard__meta--id">ID ' +
        esc(vid || "—") +
        "</span>" +
        "</div>" +
        "</div>" +
        '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
        esc(created) +
        "</strong></span>" +
        cardClose +
        sharedMembersMarkup(voice.sharedMembers, count, "Utenti con accesso")
      );
    }

    var rolesHtml = roles.length
      ? roles
          .map(function (role) {
            var style = role.color ? ' style="--vc-role-chip:' + esc(role.color) + '"' : "";
            return '<span class="vc-user-profile-role"' + style + ">" + esc(role.name) + "</span>";
          })
          .join("")
      : '<span class="vc-user-profile-role vc-user-profile-role--muted">Nessun ruolo mostrabile</span>';

    var customEconomyHtml =
      customRole || customSecondaryRole || customVoice || viewerOwns
        ? '<section class="vc-user-profile-block vc-user-profile-block--custom">' +
          '<div class="vc-user-profile-sectioneyebrow"><i class="fa fa-diamond" aria-hidden="true"></i> Ruoli & Vocale Custom</div>' +
          '<details class="vc-user-profile-accordion vc-user-profile-accordion--role"' +
              (viewerOwns ? " open" : "") +
              ">" +
              '<summary class="vc-user-profile-accordion__summary">' +
              '<span class="vc-user-profile-accordion__icon"><i class="fa fa-star" aria-hidden="true"></i></span>' +
              '<span class="vc-user-profile-accordion__copy">' +
              '<span class="vc-user-profile-accordion__title">Ruoli Personalizzati</span>' +
              '<span class="vc-user-profile-accordion__sub">' +
              (customRole && customSecondaryRole
                ? "Ruolo principale + 1 ruolo secondario"
                : customRole
                  ? "Ruolo principale"
                  : customSecondaryRole
                    ? "1 ruolo secondario"
                    : viewerOwns
                      ? "Crea il tuo ruolo custom"
                      : "Nessun ruolo custom") +
              "</span>" +
              "</span>" +
              '<span class="vc-user-profile-accordion__badge">' +
              esc(formatIntIt(customRoleCount)) +
              "</span>" +
              '<i class="fa fa-angle-down vc-user-profile-accordion__chev" aria-hidden="true"></i>' +
              "</summary>" +
              '<div class="vc-user-profile-accordion__body">' +
              (customRole
                ? (viewerOwns ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--link" href="' + esc(customProfileEditorUrl("primary")) + '" title="Ruolo principale">' : '<article class="vc-user-profile-customcard">') +
                  '<div class="vc-user-profile-customcard__main">' +
                  '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--role"' +
                  (customRole.color ? ' style="--vc-custom-dot:' + esc(customRole.color) + '"' : "") +
                  ">" +
                  customRoleIconHtml +
                  "</span>" +
                  '<div class="vc-user-profile-customcard__copy">' +
                  '<strong class="vc-user-profile-customcard__title">' +
                  esc((customRole.emoji ? customRole.emoji + " " : "") + (customRole.name || "Ruolo personalizzato")) +
                  "</strong>" +
                  '<span class="vc-user-profile-customcard__meta">Ruolo Principale</span>' +
                  "</div>" +
                  "</div>" +
                  '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
                  esc(formatDateIt(customRole.createdAt)) +
                  "</strong></span>" +
                  (viewerOwns ? "</a>" : "</article>")
                : viewerOwns
                  ? createCustomCardHtml("primary", "Ruolo principale", "Crea direttamente dal profilo")
                  : "") +
              (customSecondaryRole
                ? (viewerOwns ? '<a class="vc-user-profile-customcard vc-user-profile-customcard--secondary vc-user-profile-customcard--link" href="' + esc(customProfileEditorUrl("secondary")) + '" title="Ruolo secondario">' : '<article class="vc-user-profile-customcard vc-user-profile-customcard--secondary">') +
                  '<div class="vc-user-profile-customcard__main">' +
                  '<span class="vc-user-profile-customcard__dot vc-user-profile-customcard__dot--voice">' +
                  (customSecondaryRole.iconUrl
                    ? '<img class="vc-user-profile-customicon__img" src="' + esc(customSecondaryRole.iconUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
                    : customSecondaryRole.emoji
                      ? '<span class="vc-user-profile-customicon__emoji">' + esc(customSecondaryRole.emoji) + "</span>"
                      : '<i class="fa fa-star" aria-hidden="true"></i>') +
                  "</span>" +
                  '<div class="vc-user-profile-customcard__copy">' +
                  '<strong class="vc-user-profile-customcard__title">' +
                  esc((customSecondaryRole.emoji ? customSecondaryRole.emoji + " " : "") + (customSecondaryRole.name || "Ruolo personalizzato secondario")) +
                  "</strong>" +
                  '<span class="vc-user-profile-customcard__meta">Ruolo Secondario</span>' +
                  "</div>" +
                  "</div>" +
                  '<span class="vc-user-profile-customcard__date"><i class="fa fa-calendar-o" aria-hidden="true"></i>Creato<br><strong>' +
                  esc(formatDateIt(customSecondaryRole.createdAt)) +
                  "</strong></span>" +
                  (viewerOwns ? "</a>" : "</article>")
                : viewerOwns && customRole
                  ? createCustomCardHtml("secondary", "Ruolo secondario", "Serve VIP+ / Double Booster / Lv 120")
                  : "") +
              (customRole ? sharedMembersMarkup(customRole.sharedMembers, customRole.memberCount, "Condiviso con") : "") +
              (customSecondaryRole ? sharedMembersMarkup(customSecondaryRole.sharedMembers, customSecondaryRole.memberCount, "Secondario condiviso con") : "") +
              "</div>" +
              "</details>" +
          (customVoice
            ? '<details class="vc-user-profile-accordion vc-user-profile-accordion--voice"' +
              (viewerOwns ? " open" : "") +
              ">" +
              '<summary class="vc-user-profile-accordion__summary">' +
              '<span class="vc-user-profile-accordion__icon"><i class="fa fa-microphone" aria-hidden="true"></i></span>' +
              '<span class="vc-user-profile-accordion__copy">' +
              '<span class="vc-user-profile-accordion__title">Canale vocale privato</span>' +
              '<span class="vc-user-profile-accordion__sub">' +
              esc(customVoiceName || "1 canale vocale") +
              "</span>" +
              "</span>" +
              '<span class="vc-user-profile-accordion__badge">1</span>' +
              '<i class="fa fa-angle-down vc-user-profile-accordion__chev" aria-hidden="true"></i>' +
              "</summary>" +
              '<div class="vc-user-profile-accordion__body">' +
              voiceStatsHtml(customVoice) +
              "</div>" +
              "</details>"
            : viewerOwns
              ? '<details class="vc-user-profile-accordion vc-user-profile-accordion--voice" open>' +
                '<summary class="vc-user-profile-accordion__summary">' +
                '<span class="vc-user-profile-accordion__icon"><i class="fa fa-microphone" aria-hidden="true"></i></span>' +
                '<span class="vc-user-profile-accordion__copy">' +
                '<span class="vc-user-profile-accordion__title">Canale vocale privato</span>' +
                '<span class="vc-user-profile-accordion__sub">Crea la tua stanza</span>' +
                "</span>" +
                '<span class="vc-user-profile-accordion__badge">0</span>' +
                '<i class="fa fa-angle-down vc-user-profile-accordion__chev" aria-hidden="true"></i>' +
                "</summary>" +
                '<div class="vc-user-profile-accordion__body">' +
                createCustomCardHtml("voice", "Vocale privata", "Gestisci nome, emoji e accesso") +
                "</div></details>"
              : "") +
          "</section>"
        : "";

    if (window.VcPageTitle) window.VcPageTitle.set("Profilo");
    else document.title = siteName() + " | Profilo";
    root.innerHTML =
      '<section class="vc-user-profile-shell">' +
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap"' +
      avatarRingStyle +
      ">" +
      '<span class="vc-user-profile-avatarclip">' +
      (avatar
        ? '<img class="vc-user-profile-avatar" src="' +
          esc(avatar) +
          '" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
          esc(defaultEmbedAvatarUrl(userId)) +
          '\'" />'
        : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</span>" +
      "</div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      esc(profileNick) +
      "</h1>" +
      (profileHandle
        ? '<p class="vc-user-profile-handle">@' + esc(profileHandle) + "</p>"
        : "") +
      '<p class="vc-user-profile-id">ID: ' +
      esc(userId) +
      "</p>" +
      "</div>" +
      (viewerOwns
        ? '<a class="vc-user-profile-customize vc-user-profile-customize--pill" href="' +
          esc(profilePersonalizzaHubUrl(userId)) +
          '" title="Personalizza profilo"><i class="fa fa-paint-brush" aria-hidden="true"></i><span>Personalizza</span></a>'
        : "") +
      "</div>" +
      '<div class="vc-user-profile-levelbar" aria-label="Progresso livello">' +
      '<div class="vc-user-profile-levelbar__meta">' +
      "<span>Livello " +
      esc(String(level.level != null ? level.level : 0)) +
      "</span>" +
      "<span>" +
      esc(formatIntIt(currentXp)) +
      " / " +
      esc(formatIntIt(targetXp)) +
      " EXP</span>" +
      "</div>" +
      '<div class="vc-user-profile-levelbar__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      esc(String(progressPct)) +
      '"><span class="vc-user-profile-levelbar__fill" style="width:' +
      esc(String(progressPct)) +
      '%"></span></div>' +
      "</div>" +
      badgesHtml +
      '<div class="vc-user-profile-stats">' +
      '<article class="vc-user-profile-stat vc-user-profile-stat--level"><span class="vc-user-profile-stat__label">Livello</span><span class="vc-user-profile-stat__value">' +
      esc(String(level.level != null ? level.level : 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--exp"><span class="vc-user-profile-stat__label">EXP totale</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(level.exp || 0)) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--rank"><span class="vc-user-profile-stat__label">Rank</span><span class="vc-user-profile-stat__value">' +
      esc(rankText) +
      "</span></article>" +
      '<article class="vc-user-profile-stat vc-user-profile-stat--weekly"><span class="vc-user-profile-stat__label">EXP weekly</span><span class="vc-user-profile-stat__value">' +
      esc(formatIntIt(weekly.weeklyExp || 0)) +
      "</span></article>" +
      "</div>" +
      "</section>" +
      (viewerOwns
        ? '<details class="vc-user-profile-block vc-user-profile-block--messages vc-user-profile-disclosure">' +
          '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche messaggi</span><span class="vc-user-profile-block__sub">' +
          esc(formatIntIt(messages.messagesTotal || 0)) +
          ' messaggi totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Totali</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesTotal || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Settimanali</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesWeekly || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Giornaliere</span><span class="vc-user-profile-mini__value">' +
          esc(formatIntIt(messages.messagesDaily || 0)) +
          "</span></div>" +
          "</div></details>"
        : "") +
      (viewerOwns
        ? '<details class="vc-user-profile-block vc-user-profile-block--voice vc-user-profile-disclosure">' +
          '<summary class="vc-user-profile-disclosure__summary"><span class="vc-user-profile-block__title">Statistiche voice chat</span><span class="vc-user-profile-block__sub">' +
          esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
          ' totali</span><i class="fa fa-angle-down vc-user-profile-disclosure__chev" aria-hidden="true"></i></summary>' +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore totali</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceTotalSeconds || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore settimanali</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceWeeklySeconds || 0)) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Ore giornaliere</span><span class="vc-user-profile-mini__value">' +
          esc(formatHoursIt(voice.voiceDailySeconds || 0)) +
          "</span></div>" +
          "</div></details>"
        : "") +
      '<section class="vc-user-profile-block vc-user-profile-block--rankcard">' +
      '<div class="vc-user-profile-block__head">' +
      '<span class="vc-user-profile-block__title">Rank card <code class="vc-user-profile-inlinecmd">+rank</code></span>' +
      (viewerOwns
        ? '<a class="vc-user-profile-customize" href="' +
          esc(profileCustomizeUrl(userId)) +
          '" aria-label="Personalizza rank card" title="Personalizza"><i class="fa fa-paint-brush" aria-hidden="true"></i></a>'
        : "") +
      "</div>" +
      '<div id="vc-user-rankcard-wrap" class="vc-user-rankcard-preview vc-rank-editor-preview__imagewrap">' +
      '<div class="vc-rankcard-ph" aria-hidden="true">' +
      '<div class="vc-rankcard-ph__hero">' +
      '<span class="vc-rankcard-ph__avatar"></span>' +
      '<span class="vc-rankcard-ph__copy"><span></span><span></span></span>' +
      '<span class="vc-rankcard-ph__rank"></span>' +
      "</div>" +
      '<div class="vc-rankcard-ph__stats"><span></span><span></span><span></span></div>' +
      "</div>" +
      '<img id="vc-user-rankcard-image" class="vc-rank-editor-preview__image" alt="" decoding="async" hidden />' +
      '<p id="vc-user-rankcard-image-status" class="vc-rank-editor-preview__imagestatus" hidden></p>' +
      "</div>" +
      multiplierHtml +
      "</section>" +
      customEconomyHtml +
      '<section class="vc-user-profile-block vc-user-profile-block--roles">' +
      '<div class="vc-user-profile-block__head"><span class="vc-user-profile-block__title">Ruoli</span><span class="vc-user-profile-block__sub">' +
      esc(String(roles.length)) +
      " presenti</span></div>" +
      '<div class="vc-user-profile-roles">' +
      rolesHtml +
      "</div></section>" +
      "</section>";
    clearProfilePending();
    if (viewerOwns) wireProfileCustomCreate(root);
  }

  function releaseProfileRankObjectUrl() {
    if (!profileRankObjectUrl) return;
    try {
      window.URL.revokeObjectURL(profileRankObjectUrl);
    } catch (e) {}
    profileRankObjectUrl = "";
  }

  function setRankCardPreviewReady(img, ready) {
    var wrap = img && img.closest ? img.closest(".vc-rank-editor-preview__imagewrap") : null;
    if (wrap) wrap.classList.toggle("is-ready", Boolean(ready));
    if (img) {
      if (ready) img.removeAttribute("hidden");
      else img.setAttribute("hidden", "");
    }
  }

  function loadProfileRankCardPreview(userId, options) {
    options = options || {};
    var force = Boolean(options.force);
    var img = byId("vc-user-rankcard-image");
    var status = byId("vc-user-rankcard-image-status");
    if (!img || !status) return;
    var uid = String(userId || "").trim();
    var now = Date.now();
    var wrapReady = Boolean(img.closest && img.closest(".vc-rank-editor-preview__imagewrap.is-ready"));
    var hasSrc = Boolean(img.getAttribute("src"));
    if (
      !force &&
      uid &&
      lastRankPreviewUserId === uid &&
      hasSrc &&
      wrapReady &&
      now - lastRankPreviewLoadedAt < RANK_PREVIEW_RELOAD_MIN_MS
    ) {
      return;
    }
    var url = resolvedPublicRankPreviewUrl(userId);
    if (!url) {
      status.hidden = false;
      status.textContent = "Anteprima non disponibile.";
      status.className = "vc-rank-editor-preview__imagestatus is-error";
      return;
    }
    var myToken = ++profileRankRenderToken;
    function showImage(src, fromCache) {
      if (myToken !== profileRankRenderToken) return;
      img.onload = function () {
        if (myToken !== profileRankRenderToken) return;
        img.classList.remove("is-rendering");
        setRankCardPreviewReady(img, true);
        lastRankPreviewUserId = uid;
        lastRankPreviewLoadedAt = Date.now();
        status.hidden = true;
        status.textContent = "";
        status.className = "vc-rank-editor-preview__imagestatus";
      };
      img.onerror = function () {
        if (myToken !== profileRankRenderToken) return;
        img.classList.remove("is-rendering");
        if (fromCache && hasSrc) {
          setRankCardPreviewReady(img, true);
          status.hidden = true;
          return;
        }
        setRankCardPreviewReady(img, false);
        status.hidden = false;
        status.textContent = "Anteprima non disponibile al momento.";
        status.className = "vc-rank-editor-preview__imagestatus is-error";
      };
      img.alt = "Rank card";
      if (img.getAttribute("src") === src) {
        img.classList.remove("is-rendering");
        setRankCardPreviewReady(img, true);
        lastRankPreviewUserId = uid;
        lastRankPreviewLoadedAt = Date.now();
        status.hidden = true;
        return;
      }
      img.src = src;
    }
    var cachedDataUrl = loadCachedProfileRankPreview(userId);
    if (cachedDataUrl) {
      releaseProfileRankObjectUrl();
      showImage(cachedDataUrl, true);
      // soft refresh in background without blanking the card
    } else if (!hasSrc || force) {
      setRankCardPreviewReady(img, false);
      status.hidden = true;
      status.textContent = "";
      status.className = "vc-rank-editor-preview__imagestatus";
      img.classList.add("is-rendering");
    }
    fetch(url, { cache: "default", credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.blob();
      })
      .then(function (blob) {
        return blobToDataUrl(blob).then(function (dataUrl) {
          return { blob: blob, dataUrl: dataUrl };
        });
      })
      .then(function (out) {
        if (myToken !== profileRankRenderToken) return;
        var blob = out && out.blob;
        var dataUrl = out && out.dataUrl;
        if (!blob || !blob.size) throw new Error("empty");
        var nextObjectUrl = window.URL.createObjectURL(blob);
        var prevObjectUrl = profileRankObjectUrl;
        profileRankObjectUrl = nextObjectUrl;
        showImage(nextObjectUrl, false);
        if (dataUrl) saveCachedProfileRankPreview(userId, dataUrl);
        if (prevObjectUrl) {
          try {
            window.URL.revokeObjectURL(prevObjectUrl);
          } catch (eRevoke) {}
        }
      })
      .catch(function () {
        if (myToken !== profileRankRenderToken) return;
        img.classList.remove("is-rendering");
        if (img.getAttribute("src")) {
          setRankCardPreviewReady(img, true);
          status.hidden = true;
          status.textContent = "";
          return;
        }
        setRankCardPreviewReady(img, false);
        status.hidden = false;
        status.textContent = "Anteprima non disponibile al momento.";
        status.className = "vc-rank-editor-preview__imagestatus is-error";
      });
  }

  var profileInitialLoadDone = false;

  function applyProfileResult(root, userId, result, silent) {
    var level = result && result.level ? result.level : null;
    var weekly = result && result.weekly ? result.weekly : null;
    var messages = result && result.messages ? result.messages : null;
    var voice = result && result.voice ? result.voice : null;
    var profile = (result && result.profile ? result.profile : {}) || {};

    if (result && result.notFound) {
      if (silent) return false;
      renderEmpty(root, userId);
      return false;
    }

    if (!result || !result.ok) {
      if (silent) return false;
      if (profileInitialLoadDone) return false;
      renderError(
        root,
        result && result.timedOut
          ? "Il server impiega troppo tempo a rispondere. Riprova tra qualche secondo."
          : undefined,
      );
      return false;
    }

    var hasStats =
      (level && Number(level.exp) > 0) ||
      (weekly && Number(weekly.weeklyExp) > 0) ||
      (messages && Number(messages.messagesTotal) > 0) ||
      (voice && Number(voice.voiceTotalSeconds) > 0);
    var hasProfileShell =
      Boolean(profile.customProfile) ||
      Boolean(String(profile.displayName || profile.username || "").trim()) ||
      (Array.isArray(profile.roles) && profile.roles.length > 0);
    var hasAny = Boolean(level || weekly || messages || voice) && (hasStats || hasProfileShell);

    if (!hasAny && hasProfileShell) {
      hasAny = true;
    }

    if (!hasAny) {
      if (silent) return false;
      renderEmpty(root, userId);
      return false;
    }

    lastRenderedProfile = {
      root: root,
      userId: userId,
      payload: {
        profile: profile || {},
        level: level || {},
        weekly: weekly || {},
        messages: messages || {},
        voice: voice || {},
      },
    };

    var viewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    var nextSig = profileRenderSignature(userId, lastRenderedProfile.payload, viewerId);
    var sameDom = silent && nextSig === lastProfileRenderSignature && root.querySelector("#vc-user-rankcard-image");
    if (sameDom) {
      profileInitialLoadDone = true;
      return true;
    }
    lastProfileRenderSignature = nextSig;
    try {
      renderProfile(root, userId, lastRenderedProfile.payload);
      profileInitialLoadDone = true;
      loadProfileRankCardPreview(userId, { force: !silent });
      return true;
    } catch (eRender) {
      if (!silent) {
        try {
          renderError(root);
        } catch (eErr) {
          clearProfilePending();
        }
      }
      return false;
    }
  }

  function readCachedProfileBundle(userId) {
    var url = buildApiUrl("profile", userId);
    if (!url) return null;
    var key = "vc:profilecache:" + String(url || "");
    var now = Date.now();
    var mem = profileMemoryCache.get(key);
    if (mem && Number.isFinite(mem.expireAt) && mem.expireAt > now && mem.value) {
      return mem.value;
    }
    var sess = readSessionCache(key, now);
    if (!sess) return null;
    profileMemoryCache.set(key, { expireAt: now + PROFILE_CACHE_TTL_MS, value: sess });
    return sess;
  }

  function loadProfile(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    var force = Boolean(options.force);
    var allowRetry = options.retry !== false;
    var retryCount = Math.max(0, Number(options.retryCount) || 0);
    if (profileBootGaveUp && !silent) {
      return Promise.resolve();
    }
    if (window.__VC_PROFILE_GAVE_UP && !silent) {
      profileBootGaveUp = true;
      return Promise.resolve();
    }
    var userId = parseProfileId();
    if (!userId) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }
    var root = byId("vc-user-profile-view");
    if (!root) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }

    if (!silent && force) {
      clearProfileSessionCaches();
    }

    if (!silent) {
      currentViewer = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || currentViewer;
      try {
        hideLeaderOnlySections();
      } catch (eHide) {}
      if (!force && retryCount === 0) {
        var cachedOut = readCachedProfileBundle(userId);
        var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
        if (cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound) {
          applyProfileResult(
            root,
            userId,
            {
              ok: true,
              notFound: false,
              profile: cachedBody.profile || null,
              level: cachedBody.rows && cachedBody.rows.level ? cachedBody.rows.level : null,
              weekly: cachedBody.rows && cachedBody.rows.weekly ? cachedBody.rows.weekly : null,
              messages: cachedBody.rows && cachedBody.rows.messages ? cachedBody.rows.messages : null,
              voice: cachedBody.rows && cachedBody.rows.voice ? cachedBody.rows.voice : null,
            },
            false,
          );
        } else if (!profileInitialLoadDone) {
          renderLoading(root);
        }
      } else if (!profileInitialLoadDone) {
        renderLoading(root);
      }
    }

    return fetchProfileBundle(userId)
      .then(function (result) {
        if (
          !silent &&
          allowRetry &&
          retryCount < PROFILE_FETCH_MAX_RETRIES &&
          result &&
          !result.ok &&
          !result.notFound
        ) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 400 + retryCount * 500);
          }).then(function () {
            return loadProfile({
              silent: false,
              retry: false,
              retryCount: retryCount + 1,
              force: true,
            });
          });
        }
        var applied = applyProfileResult(root, userId, result, silent);
        return applied;
      })
      .catch(function () {
        if (silent) return false;
        if (profileInitialLoadDone) return false;
        if (allowRetry && retryCount < PROFILE_FETCH_MAX_RETRIES) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 400 + retryCount * 500);
          }).then(function () {
            return loadProfile({
              silent: false,
              retry: false,
              retryCount: retryCount + 1,
              force: true,
            });
          });
        }
        renderError(root);
        return false;
      });
  }

  function main(options) {
    try {
      return loadProfile(options || {});
    } catch (eMain) {
      try {
        var root = byId("vc-user-profile-view");
        if (root) renderError(root);
        else {
          clearProfilePending();
          clearProfileLoading();
        }
      } catch (eErr) {
        clearProfilePending();
      }
      return Promise.resolve();
    }
  }

  function refreshProfileSilently() {
    if (!profileInitialLoadDone || !lastRenderedProfile) return;
    loadProfile({ silent: true });
  }

  function stopLiveProfilePolling() {
    if (liveProfilePollTimer) {
      clearInterval(liveProfilePollTimer);
      liveProfilePollTimer = null;
    }
  }

  function startLiveProfilePolling() {
    stopLiveProfilePolling();
    liveProfilePollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      if (!parseProfileId()) return;
      refreshProfileSilently();
    }, LIVE_PROFILE_POLL_MS);
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var prevViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    currentViewer = ev && ev.detail ? ev.detail.user || null : null;
    var nextViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    if (!lastRenderedProfile || !lastRenderedProfile.root) return;
    // Solo se cambia ownership (login/logout): evita re-render continuo della rank card
    if (prevViewerId === nextViewerId) return;
    var sig = profileRenderSignature(lastRenderedProfile.userId, lastRenderedProfile.payload, nextViewerId);
    if (sig === lastProfileRenderSignature && lastRenderedProfile.root.querySelector("#vc-user-rankcard-image")) {
      return;
    }
    lastProfileRenderSignature = sig;
    renderProfile(lastRenderedProfile.root, lastRenderedProfile.userId, lastRenderedProfile.payload);
    loadProfileRankCardPreview(lastRenderedProfile.userId, { force: false });
  });

  // Failsafe: se il boot resta appeso (JS parziale / API morta / PWA Brave), sblocca la UI.
  try {
    window.setTimeout(function () {
      try {
        if (!document.documentElement.classList.contains("vc-user-profile-pending")) return;
        if (profileInitialLoadDone) {
          clearProfilePending();
          clearProfileLoading();
          return;
        }
        profileBootGaveUp = true;
        window.__VC_PROFILE_GAVE_UP = true;
        var root = byId("vc-user-profile-view");
        if (root) {
          renderError(root, "Il caricamento si è bloccato (cache app). Premi Riprova o svuota i dati del sito su Brave.");
        } else {
          clearProfilePending();
          clearProfileLoading();
        }
      } catch (eFs) {
        clearProfilePending();
      }
    }, PROFILE_BOOT_FAILSAFE_MS);
  } catch (eFsTimer) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

  startLiveProfilePolling();

  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted && parseProfileId()) {
      profileBootGaveUp = false;
      profileInitialLoadDone = false;
      clearProfileSessionCaches();
      main({ force: true });
    }
  });

  window.addEventListener("beforeunload", stopLiveProfilePolling);

  window.VCUserProfilePage = {
    isProfileMode: function () {
      return Boolean(parseProfileId());
    },
    profilePublicUrl: profilePublicUrl,
  };
})();