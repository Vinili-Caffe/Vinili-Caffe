(function () {
  var currentViewer = null;
  var lastRenderedProfile = null;
  var profileRankObjectUrl = "";
  var profileRankRenderToken = 0;
  var liveProfilePollTimer = null;
  var LIVE_PROFILE_POLL_MS = 60000;
  var PROFILE_CACHE_TTL_MS = 90000;
  var PROFILE_CACHE_LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var PROFILE_CACHE_LOCAL_PREFIX = "vc:profilecache-local:v3:";
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
  var profilePendingWatchdogTimer = null;
  var profilePendingWatchdogAttempts = 0;
  var profileMainInFlight = false;
  var profileBootSettled = false;
    var lockedCommunityUserId = "";
  var communityPaintSeq = 0;

  function armProfilePendingWatchdog() {
    if (profilePendingWatchdogTimer) return;
    profilePendingWatchdogTimer = window.setTimeout(function () {
      profilePendingWatchdogTimer = null;
      try {
        if (!document.documentElement.classList.contains("vc-user-profile-pending")) return;
        if (profileInitialLoadDone || profileBootSettled) {
          clearProfilePending();
          clearProfileLoading();
          return;
        }
        if (tryInstantProfileFromCache()) return;
        profilePendingWatchdogAttempts += 1;
        if (profilePendingWatchdogAttempts > 4) {
          profileBootGaveUp = true;
          try {
            window.__VC_PROFILE_GAVE_UP = true;
          } catch (eGave) {}
          var stuckRoot = byId("vc-user-profile-view");
          if (stuckRoot) {
            renderError(stuckRoot, "Il caricamento del profilo non risponde. Premi Riprova.");
          } else {
            clearProfilePending();
            clearProfileLoading();
          }
          return;
        }
        if (!parseProfileId()) {
          clearProfilePending();
          return;
        }
                        if (profileMainInFlight) {
          armProfilePendingWatchdog();
          return;
        }
        main({ force: false });
        armProfilePendingWatchdog();
      } catch (eWatch) {
        clearProfilePending();
      }
    }, 4000);
  }

  function isCoarseMobileProfile() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (eMob) {}
    return false;
  }

  function profileFetchTimeoutMs() {
    return isCoarseMobileProfile() ? 22000 : PROFILE_FETCH_TIMEOUT_MS;
  }

  function setProfilePageTitle(pageLabel) {
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.set === "function") {
        window.VcPageTitle.set(pageLabel);
        return;
      }
    } catch (eTitle) {}
    document.title = siteName() + " | " + String(pageLabel || "Profilo");
  }

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

  var PROFILE_BOOT_FAILSAFE_MS = Math.min(
    profileFetchTimeoutMs() * (PROFILE_FETCH_MAX_RETRIES + 1) + (isStandalonePwa() ? 8000 : 5000),
    isCoarseMobileProfile() ? 18000 : 24000,
  );

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

  function isUsableApiUrl(raw) {
    var api = String(raw || "").trim();
    if (!api || api === "#" || api.indexOf("{{") >= 0) return false;
    return true;
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && isUsableApiUrl(local)) return local;
    var api = String(c.apiUrl || "").trim();
    if (!isUsableApiUrl(api)) return "/webhooks/site-users";
    try {
      if (typeof window !== "undefined") {
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
    try {
      localStorage.setItem(
        PROFILE_CACHE_LOCAL_PREFIX + key,
        JSON.stringify({ expireAt: now + PROFILE_CACHE_LOCAL_TTL_MS, value: value })
      );
    } catch (eLocal) {}
  }

  function readLocalProfileCache(key, now) {
    try {
      var raw = localStorage.getItem(PROFILE_CACHE_LOCAL_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.expireAt) || parsed.expireAt <= now) {
        localStorage.removeItem(PROFILE_CACHE_LOCAL_PREFIX + key);
        return null;
      }
      return parsed.value;
    } catch (e) {
      return null;
    }
  }

  function clearProfileSessionCaches() {
    try {
      profileMemoryCache.clear();
    } catch (eMem) {}
    try {
      if (window.VcApiCache && typeof window.VcApiCache.invalidatePrefix === "function") {
        window.VcApiCache.invalidatePrefix("profile:");
      }
    } catch (eApi) {}
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

  function cachedJsonFetch(url, ttlMs, opts) {
    var ttl = Math.max(1, Number(ttlMs) || PROFILE_CACHE_TTL_MS);
    var bypass = Boolean(opts && opts.bypassCache);
    var fetchTimeoutMs = Math.max(profileFetchTimeoutMs() + 8000, 32000);
    if (window.VcApiCache && typeof window.VcApiCache.fetchHttpOk === "function") {
      var cacheKey = window.VcApiCache.keyFor(String(url || ""), { scope: "profile" });
      if (bypass) window.VcApiCache.invalidate(cacheKey);
      return window.VcApiCache
        .fetchHttpOk(String(url || ""), {
          scope: "profile",
          ttlMs: ttl,
          staleMs: Math.max(ttl * 8, 10 * 60 * 1000),
          persistMs: 30 * 60 * 1000,
          useCache: !bypass,
          timeoutMs: fetchTimeoutMs,
          fetchInit: { credentials: "omit", cache: "no-store" },
        })
        .then(function (row) {
          return { httpOk: Boolean(row && row.httpOk), body: row && row.body ? row.body : null };
        })
        .catch(function () {
          return { httpOk: false, body: null };
        });
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
      .catch(function () {
        return { httpOk: false, body: null };
      });
  }

  function resolvedPublicRankPreviewUrl(userId) {
    var base = resolvedApiUrl();
    var id = String(userId || "").trim();
    if (!base || !/^\d{17,20}$/.test(id)) return "";
    var root = base.split("?")[0];
    var endpoint = root.replace(/\/site-users\/?$/i, "/site-rank-card-public");
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
      profile.birthday
        ? String(profile.birthday.day || "") +
          "/" +
          String(profile.birthday.month || "") +
          ":" +
          String(profile.birthday.shortLabel || profile.birthday.label || "")
        : "",
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
        return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
  }

  function profileCustomizeUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/personalizza/?id=" + encodeURIComponent(id) + "&target=rank" : "/personalizza/?target=rank";
  }

  function profilePersonalizzaHubUrl(userId) {
    var id = String(userId || "").trim();
    return id ? "/personalizza/?id=" + encodeURIComponent(id) : "/personalizza/";
  }

  function customProfileEditorUrl(target) {
    var t = String(target || "primary").trim().toLowerCase();
    if (t !== "primary" && t !== "secondary" && t !== "voice") t = "primary";
    var q = new URLSearchParams();
    var uid = parseProfileId();
    if (!uid) {
      try {
        if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
          uid = String(window.__VC_DISCORD_PROFILE.id || "").trim();
        }
      } catch (eProf) {}
    }
    if (/^\d{17,20}$/.test(uid)) q.set("id", uid);
    q.set("target", t);
    return "/personalizza/?" + q.toString();
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

  function profileAvatarSrc(url, avatarHash, userId, size) {
    var raw = String(url || "").trim();
    var hash = String(avatarHash || "").trim();
    var uid = String(userId || "").trim();
    var n = Number(size) || 256;
    var resolved = "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
        resolved = window.VcDiscordAvatar.resolveUrl(raw, n, hash, uid) || "";
      }
    } catch (eAv) {}
    if (!resolved && raw) resolved = raw;
    if (!resolved && hash && uid) {
      var ext = hash.indexOf("a_") === 0 ? "gif" : "png";
      resolved = "https://cdn.discordapp.com/avatars/" + uid + "/" + hash + "." + ext + "?size=" + n;
    }
    if (!resolved) resolved = uid ? defaultEmbedAvatarUrl(uid) : "";
    return resolved;
  }

  function scanProfileAvatars(root) {
    try {
      if (!window.VcDiscordAvatar || typeof window.VcDiscordAvatar.scan !== "function") return;
      window.VcDiscordAvatar.scan(root || byId("vc-user-profile-view") || document);
    } catch (eScan) {}
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

  function fetchProfileBundle(userId, opts) {
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

    function emptyResult(timedOut) {
      return {
        ok: false,
        notFound: false,
        timedOut: Boolean(timedOut),
        profile: null,
        level: null,
        weekly: null,
        messages: null,
        voice: null,
      };
    }

    function directFetch() {
      return cachedJsonFetch(url, PROFILE_CACHE_TTL_MS, opts)
        .then(mapBody)
        .catch(function () {
          return emptyResult(false);
        });
    }

    function firstUsableProfileResult(promises) {
      return new Promise(function (resolve) {
        var pending = promises.length;
        var best = null;
        if (!pending) {
          resolve(emptyResult(false));
          return;
        }
        promises.forEach(function (promiseLike) {
          Promise.resolve(promiseLike)
            .then(function (result) {
              if (result && result.ok) {
                resolve(result);
                return;
              }
              if (result && !best) best = result;
              pending -= 1;
              if (pending <= 0) resolve(best || emptyResult(false));
            })
            .catch(function () {
              pending -= 1;
              if (pending <= 0) resolve(best || emptyResult(false));
            });
        });
      });
    }

    var sources = [directFetch()];
    try {
      var readyPrefetch = window.__VC_PROFILE_PREFETCH_RESULT;
      if (
        readyPrefetch &&
        readyPrefetch.httpOk &&
        readyPrefetch.body &&
        readyPrefetch.body.ok
      ) {
        sources.unshift(Promise.resolve(mapBody(readyPrefetch)));
      }
    } catch (eReadyPref) {}
    try {
      var prefetch = window.__VC_PROFILE_PREFETCH;
      if (
        prefetch &&
        String(prefetch.userId || "") === String(userId) &&
        prefetch.promise &&
        typeof prefetch.promise.then === "function"
      ) {
        window.__VC_PROFILE_PREFETCH = null;
        sources.unshift(
          prefetch.promise
            .then(function (out) {
              return mapBody(out);
            })
            .catch(function () {
              return emptyResult(false);
            }),
        );
      }
    } catch (ePref) {}

    var fetchPromise = firstUsableProfileResult(sources);
    var timeoutMs = Math.max(profileFetchTimeoutMs() + 8000, 32000);
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(emptyResult(true));
      }, timeoutMs);
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
          resolve(emptyResult(true));
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

  function unlockProfileChrome() {
    clearProfilePending();
    try {
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready", "vc-user-profile-route");
    } catch (eReady) {}
    try {
      if (document.body) {
        document.body.classList.add("vc-user-profile-page", "vc-user-profile-route");
      }
    } catch (eBody) {}
  }

  function profileViewLooksReady(root) {
    if (!root || root.hidden) return false;
    var shell = root.querySelector(":scope > .vc-user-profile-shell");
    if (
      shell &&
      shell.querySelector(
        ".vc-user-profile-hero, .vc-user-profile-notfound, .vc-user-profile-empty",
      )
    ) {
      return true;
    }
    var staffPane = root.querySelector(".vc-user-profile-staff-pane");
    if (
      staffPane &&
      !staffPane.hidden &&
      staffPane.querySelector(".vc-user-profile-hero, .vc-staff-profile-panel, .vc-user-profile-shell")
    ) {
      return true;
    }
    return false;
  }

    function communityShellLooksReadyFor(root, userId) {
    if (!root) return false;
    var want = String(userId || "").trim();
    var shell = root.querySelector(":scope > .vc-user-profile-shell");
    if (!shell) return false;
    if (shell.getAttribute("data-vc-community-stale") === "1") return false;
    var shellUser = String(shell.getAttribute("data-vc-community-user") || "").trim();
    if (want && shellUser !== want) return false;
    if (!shell.querySelector(".vc-user-profile-hero, .vc-user-profile-notfound, .vc-user-profile-empty")) {
      return false;
    }
    if (!want) return true;
    try {
      var idEl = shell.querySelector(".vc-user-profile-id");
      return Boolean(idEl && String(idEl.textContent || "").indexOf(want) !== -1);
    } catch (eId) {
      return false;
    }
  }

  function profileViewLooksBroken(root) {
    if (!root) return true;
    if (root.hidden) return true;
    if (profileViewLooksReady(root)) return false;
        var shell = root.querySelector(":scope > .vc-user-profile-shell");
    var hasOnlyBoot = Boolean(root.querySelector("[data-vc-profile-boot]")) && !shell;
    if (hasOnlyBoot) return true;
    if (!root.innerHTML || !String(root.innerHTML).trim()) return true;
    try {
      var body = document.body;
      var staffClass = body && body.classList.contains("vc-user-profile-staff-tab");
      var pendingStaff = document.documentElement.classList.contains("vc-user-profile-staff-tab-pending");
      if ((staffClass || pendingStaff) && shell && !root.querySelector(".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel")) {
        return true;
      }
    } catch (eBroken) {}
    return !shell && !root.querySelector(".vc-user-profile-staff-pane");
  }

  function clearProfileLoading() {
    var overlay = byId("vc-user-profile-loading");
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("hidden", "");
      overlay.remove();
    }
    try {
      var boots = document.querySelectorAll("[data-vc-profile-boot]");
      for (var i = 0; i < boots.length; i += 1) {
                if (boots[i].closest && boots[i].closest("[data-vc-profile-staff-pane]")) continue;
        if (boots[i].getAttribute && boots[i].getAttribute("data-vc-staff-loading")) continue;
        if (boots[i].id === "vc-user-profile-loading") continue;
        boots[i].remove();
      }
    } catch (eBoot) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") {
        window.__vcSyncLoaderBlockingLiveClass();
      }
    } catch (eLock) {}
  }

  function ensureProfileLoadGate() {
    try {
      document.documentElement.classList.add("vc-user-profile-pending", "vc-user-profile-route");
      document.documentElement.classList.remove("vc-page-cine-boot");
      hideLeaderOnlySections();
    } catch (eGate) {}
  }

  function renderInlineLoading(root, opts) {
    if (!root) return;
    opts = opts || {};
    var force = Boolean(opts.force);
    root.hidden = false;
    ensureProfileLoadGate();
    if (!force) {
      var bodyOverlay = byId("vc-user-profile-loading");
      if (bodyOverlay && !(bodyOverlay.hidden || bodyOverlay.hasAttribute("hidden"))) {
        return;
      }
    }
        var overlay = byId("vc-user-profile-loading");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "vc-user-profile-loading";
      document.body.appendChild(overlay);
    }
    overlay.className = "vc-user-profile-loader vc-user-profile-boot";
    overlay.setAttribute("data-vc-profile-boot", "1");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-label", "Caricamento profilo");
    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    overlay.innerHTML =
      '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
      '<p class="vc-user-profile-loader__title">Caricamento profilo</p>' +
      '<p class="vc-user-profile-loader__sub">Sto recuperando le statistiche dell\'utente...</p>';
        if (force || !profileViewLooksReady(root)) {
      root.innerHTML = "";
    }
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") {
        window.__vcSyncLoaderBlockingLiveClass();
      }
    } catch (eLock) {}
  }

  function parseWantsStaffTab() {
    try {
      return (
        String(new URLSearchParams(window.location.search || "").get("tab") || "")
          .trim()
          .toLowerCase() === "staff"
      );
    } catch (e) {
      return false;
    }
  }

  function renderLoading(root, opts) {
        clearProfileLoading();
    renderInlineLoading(root, opts);
  }

  function renderError(root, message) {
    clearProfileLoading();
    profileBootSettled = true;
    unlockProfileChrome();
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
    profileBootSettled = true;
    unlockProfileChrome();
    if (window.VcPageTitle) window.VcPageTitle.set("Profilo");
    else setProfilePageTitle("Profilo");
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

  var CUSTOM_VOC_SEPARATORS = ["\uFE32", "︲", "|", "│", "｜", "⠂", "•", "·", "—", "–"];

  function parseCustomVocName(rawName) {
    var name = String(rawName || "").trim();
    if (!name) return { emoji: "", baseName: "privata" };
    var i;
    for (i = 0; i < CUSTOM_VOC_SEPARATORS.length; i += 1) {
      var separator = CUSTOM_VOC_SEPARATORS[i];
      if (name.indexOf(separator) === -1) continue;
      var parts = name.split(separator);
      var left = String(parts.shift() || "")
        .replace(/^\u0F04/u, "")
        .replace(/^༄/u, "")
        .trim();
      var right = parts.join(separator).trim();
      return { emoji: left, baseName: right || "privata" };
    }
    return {
      emoji: "",
      baseName: name.replace(/^\u0F04/u, "").replace(/^༄/u, "").trim() || "privata",
    };
  }

  function isUsableProfileDisplayName(name) {
    var s = String(name || "")
      .replace(/^\u0F04/u, "")
      .replace(/^༄/u, "")
      .trim();
    if (!s || s.length < 2) return false;
    if (/^[\u0F00-\u0FFF\uFE00-\uFEFF\u200D\s]+$/u.test(s)) return false;
    return true;
  }

  function resolveProfileDisplayName(profile, level) {
    var profileObj = profile || {};
    var levelObj = level || {};
    var raw = String(
      profileObj.displayName || profileObj.username || levelObj.username || "",
    ).trim();
    if (!isUsableProfileDisplayName(raw)) {
      raw = String(profileObj.username || levelObj.username || "Utente").trim() || "Utente";
    }
    return raw;
  }

  function formatCustomVoiceTitleHtml(voice, fallbackName) {
    if (!voice) return esc(String(fallbackName || "Canale vocale privato"));
    var parsed = parseCustomVocName(voice.name);
    var emoji = String(voice.emoji || parsed.emoji || "").trim();
    var baseName = String(parsed.baseName || voice.name || fallbackName || "Canale vocale privato").trim();
    if (!emoji) return esc(baseName);
    return (
      '<span class="vc-user-profile-voice-title">' +
      '<span class="vc-user-profile-voice-title__emoji">' +
      esc(emoji) +
      "</span>" +
      '<span class="vc-user-profile-voice-title__sep" aria-hidden="true">\uFE32</span>' +
      '<span class="vc-user-profile-voice-title__name">' +
      esc(baseName) +
      "</span></span>"
    );
  }

  var PROFILE_BDAY_MONTHS_IT = [
    "",
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];
  var birthdayCalendarPopEl = null;
  var birthdayCalendarFetchToken = 0;

  function buildBirthdaysCalendarUrl(month, year) {
    var base = resolvedApiUrl();
    if (!base) return "";
    var root = base.split("?")[0];
    return (
      root +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "board=birthdays&month=" +
      encodeURIComponent(String(month)) +
      "&year=" +
      encodeURIComponent(String(year))
    );
  }

  function closeBirthdayCalendar() {
    if (birthdayCalendarPopEl && birthdayCalendarPopEl.parentNode) {
      birthdayCalendarPopEl.parentNode.removeChild(birthdayCalendarPopEl);
    }
    birthdayCalendarPopEl = null;
    try {
      document.documentElement.classList.remove("vc-user-profile-bday-open");
      document.body.classList.remove("vc-user-profile-bday-open");
    } catch (eClose) {}
  }

  function formatBirthdayBadgeLabel(birthday) {
    if (!birthday || !birthday.day || !birthday.month) return "";
    var day = Number(birthday.day) || 0;
    var month = Number(birthday.month) || 0;
    if (!day || !month) return "";
    var monthName = String(PROFILE_BDAY_MONTHS_IT[month] || "").trim();
    if (!monthName) return String(birthday.label || birthday.shortLabel || "").trim();
    var out = day + " " + monthName;
    var showYear = birthday.showAge !== false;
    var year = Number(birthday.birthYear);
    if (showYear && Number.isFinite(year) && year >= 1900) out += " " + year;
    return out;
  }

  function buildBirthdayBadgeHtml(birthday) {
    if (!birthday || !birthday.day || !birthday.month) return "";
    var label = formatBirthdayBadgeLabel(birthday);
    if (!label) return "";
    var todayClass = birthday.isToday ? " vc-user-profile-bday-badge--today" : "";
    var title = label;
    if (birthday.isToday) title = "Oggi è il compleanno — " + title;
    return (
      '<button type="button" class="vc-user-profile-bday-badge' +
      todayClass +
      '" data-vc-bday-badge aria-haspopup="dialog" aria-expanded="false" aria-label="Compleanno: ' +
      esc(title) +
      ' — apri calendario">' +
      '<span class="vc-user-profile-bday-badge__icon" aria-hidden="true"><i class="fa fa-birthday-cake"></i></span>' +
      '<span class="vc-user-profile-bday-badge__label">' +
      esc(label) +
      "</span></button>"
    );
  }

  function daysInCalendarMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function calendarLeadingBlanks(month, year) {
    var dow = new Date(year, month - 1, 1).getDay();
    return dow === 0 ? 6 : dow - 1;
  }

  function groupBirthdaysByDay(entries) {
    var map = {};
    (entries || []).forEach(function (entry) {
      var day = Number(entry && entry.day);
      if (!day) return;
      if (!map[day]) map[day] = [];
      map[day].push(entry);
    });
    return map;
  }

  function shiftCalendarMonth(month, year, delta) {
    var m = Number(month) + Number(delta);
    var y = Number(year);
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    return { month: m, year: y };
  }

  function formatBirthdayEntryMeta(entry, calendarYear) {
    var meta = String((entry && entry.label) || "").trim();
    if (!meta && entry && entry.day) {
      var monthIdx = Number(entry.month) || 0;
      meta = String(entry.day) + " " + String(PROFILE_BDAY_MONTHS_IT[monthIdx] || "").toLowerCase();
    }
    var showAge = !entry || entry.showAge !== false;
    var birthYear = Number(entry && entry.birthYear);
    var viewYear = Number(calendarYear);
    if (showAge && Number.isFinite(birthYear) && birthYear >= 1900 && Number.isFinite(viewYear)) {
      var turning = viewYear - birthYear;
      if (turning >= 0 && turning <= 120) {
        meta += " · compie " + turning + " anni";
      }
    }
    return meta;
  }

  function renderBirthdayCalendarHtml(data, highlightUserId) {
    var month = Number(data && data.month) || 1;
    var year = Number(data && data.year) || new Date().getFullYear();
    var monthLabel = String((data && data.monthLabel) || PROFILE_BDAY_MONTHS_IT[month] || month);
    var entries = Array.isArray(data && data.entries) ? data.entries : [];
    var byDay = groupBirthdaysByDay(entries);
    var totalDays = daysInCalendarMonth(month, year);
    var lead = calendarLeadingBlanks(month, year);
    var todayDay = Number(data && data.todayDay) || -1;
    var weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    var head = weekdays
      .map(function (w) {
        return '<span class="vc-user-profile-bday-pop__wd">' + esc(w) + "</span>";
      })
      .join("");
    var cells = "";
    var i;
    for (i = 0; i < lead; i += 1) {
      cells += '<span class="vc-user-profile-bday-pop__cell is-empty" aria-hidden="true"></span>';
    }
    for (i = 1; i <= totalDays; i += 1) {
      var dayEntries = byDay[i] || [];
      var isToday = i === todayDay;
      var hasMine = highlightUserId
        ? dayEntries.some(function (e) {
            return String(e.userId || "") === String(highlightUserId);
          })
        : false;
      var cellClass = "vc-user-profile-bday-pop__cell";
      if (isToday) cellClass += " is-today";
      if (dayEntries.length) cellClass += " has-birthdays";
      if (hasMine) cellClass += " is-profile-day";
      var listHtml = dayEntries
        .slice(0, 3)
        .map(function (entry) {
          var name = String(entry.displayName || entry.userId || "Utente").trim();
          var href = String(entry.profileUrl || "/user/?id=" + encodeURIComponent(entry.userId || ""));
          return (
            '<a class="vc-user-profile-bday-pop__person" href="' +
            esc(href) +
            '" title="' +
            esc(entry.label || name) +
            '">' +
            esc(name) +
            "</a>"
          );
        })
        .join("");
      if (dayEntries.length > 3) {
        listHtml +=
          '<span class="vc-user-profile-bday-pop__more">+' +
          esc(String(dayEntries.length - 3)) +
          "</span>";
      }
      cells +=
        '<div class="' +
        cellClass +
        '"><span class="vc-user-profile-bday-pop__daynum">' +
        esc(String(i)) +
        "</span>" +
        (listHtml ? '<div class="vc-user-profile-bday-pop__people">' + listHtml + "</div>" : "") +
        "</div>";
    }
    var listSection;
    if (entries.length) {
      listSection =
        '<div class="vc-user-profile-bday-pop__list"><p class="vc-user-profile-bday-pop__list-title">Compleanni in ' +
        esc(monthLabel) +
        "</p>" +
        entries
          .map(function (entry) {
            var name = String(entry.displayName || entry.userId || "Utente").trim();
            var href = String(entry.profileUrl || "/user/?id=" + encodeURIComponent(entry.userId || ""));
            var meta = formatBirthdayEntryMeta(entry, year);
            var mine =
              highlightUserId && String(entry.userId || "") === String(highlightUserId)
                ? " is-profile-user"
                : "";
            return (
              '<a class="vc-user-profile-bday-pop__row' +
              mine +
              '" href="' +
              esc(href) +
              '"><span class="vc-user-profile-bday-pop__row-name">' +
              esc(name) +
              '</span><span class="vc-user-profile-bday-pop__row-meta">' +
              esc(meta) +
              "</span></a>"
            );
          })
          .join("") +
        "</div>";
    } else {
      listSection =
        '<p class="vc-user-profile-bday-pop__empty">Nessun compleanno registrato per questo mese.</p>';
    }
    return (
      '<div class="vc-user-profile-bday-pop" role="dialog" aria-modal="true" aria-label="Calendario compleanni ' +
      esc(monthLabel) +
      " " +
      esc(String(year)) +
      '" data-vc-bday-month="' +
      esc(String(month)) +
      '" data-vc-bday-year="' +
      esc(String(year)) +
      '">' +
      '<div class="vc-user-profile-bday-pop__panel">' +
      '<div class="vc-user-profile-bday-pop__head">' +
      '<div class="vc-user-profile-bday-pop__head-main">' +
      '<button type="button" class="vc-user-profile-bday-pop__nav" data-vc-bday-prev aria-label="Mese precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<div class="vc-user-profile-bday-pop__title"><i class="fa fa-birthday-cake" aria-hidden="true"></i><span>' +
      esc(monthLabel) +
      " " +
      esc(String(year)) +
      "</span></div>" +
      '<button type="button" class="vc-user-profile-bday-pop__nav" data-vc-bday-next aria-label="Mese successivo"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>" +
      '<button type="button" class="vc-user-profile-bday-pop__close" data-vc-bday-close aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-user-profile-bday-pop__body">' +
      '<div class="vc-user-profile-bday-pop__grid" aria-label="Calendario mensile">' +
      head +
      cells +
      "</div>" +
      listSection +
      "</div></div></div>"
    );
  }

  function setBirthdayCalendarLoading(isLoading) {
    if (!birthdayCalendarPopEl) return;
    var panel = birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel");
    if (!panel) return;
    panel.classList.toggle("vc-user-profile-bday-pop__panel--loading-month", Boolean(isLoading));
    panel.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  function loadBirthdayCalendarMonth(month, year, profileUserId) {
    if (!birthdayCalendarPopEl) return;
    var url = buildBirthdaysCalendarUrl(month, year);
    if (!url) return;
    var token = ++birthdayCalendarFetchToken;
    birthdayCalendarPopEl.__vcBdayMonth = month;
    birthdayCalendarPopEl.__vcBdayYear = year;
    birthdayCalendarPopEl.__vcBdayProfileUserId = profileUserId;
    setBirthdayCalendarLoading(true);
    cachedJsonFetch(url, 60000)
      .then(function (out) {
        if (token !== birthdayCalendarFetchToken || !birthdayCalendarPopEl) return;
        var body = out && out.body ? out.body : {};
        if (!out || !out.httpOk || !body || body.ok !== true) {
          setBirthdayCalendarLoading(false);
          if (
            birthdayCalendarPopEl &&
            birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel--loading")
          ) {
            closeBirthdayCalendar();
          }
          return;
        }
        birthdayCalendarPopEl.innerHTML = renderBirthdayCalendarHtml(body, profileUserId);
        wireBirthdayCalendarPop(profileUserId);
        setBirthdayCalendarLoading(false);
      })
      .catch(function () {
        if (token !== birthdayCalendarFetchToken) return;
        setBirthdayCalendarLoading(false);
        if (
          birthdayCalendarPopEl &&
          birthdayCalendarPopEl.querySelector(".vc-user-profile-bday-pop__panel--loading")
        ) {
          closeBirthdayCalendar();
        }
      });
  }

  function wireBirthdayCalendarPop(profileUserId) {
    if (!birthdayCalendarPopEl) return;
    var closeBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-close]");
    if (closeBtn && !closeBtn.__vcBdayCloseWired) {
      closeBtn.__vcBdayCloseWired = true;
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        closeBirthdayCalendar();
      });
    }
    var prevBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-prev]");
    var nextBtn = birthdayCalendarPopEl.querySelector("[data-vc-bday-next]");
    if (prevBtn && !prevBtn.__vcBdayNavWired) {
      prevBtn.__vcBdayNavWired = true;
      prevBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var m = Number(birthdayCalendarPopEl.__vcBdayMonth) || 1;
        var y = Number(birthdayCalendarPopEl.__vcBdayYear) || new Date().getFullYear();
        var shifted = shiftCalendarMonth(m, y, -1);
        loadBirthdayCalendarMonth(shifted.month, shifted.year, profileUserId);
      });
    }
    if (nextBtn && !nextBtn.__vcBdayNavWired) {
      nextBtn.__vcBdayNavWired = true;
      nextBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var m = Number(birthdayCalendarPopEl.__vcBdayMonth) || 1;
        var y = Number(birthdayCalendarPopEl.__vcBdayYear) || new Date().getFullYear();
        var shifted = shiftCalendarMonth(m, y, 1);
        loadBirthdayCalendarMonth(shifted.month, shifted.year, profileUserId);
      });
    }
    if (!wireBirthdayCalendarPop._keydownWired) {
      wireBirthdayCalendarPop._keydownWired = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeBirthdayCalendar();
      });
    }
  }

  function wireBirthdayCalendarHost() {
    if (!birthdayCalendarPopEl || birthdayCalendarPopEl.__vcBackdropWired) return;
    birthdayCalendarPopEl.__vcBackdropWired = true;
    birthdayCalendarPopEl.addEventListener("click", function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains("vc-user-profile-bday-pop")) {
        closeBirthdayCalendar();
      }
    });
  }

  function openBirthdayCalendar(anchor, profileUserId) {
    if (!anchor) return;
    closeBirthdayCalendar();
    var now = new Date();
    var month = now.getMonth() + 1;
    var year = now.getFullYear();
    anchor.setAttribute("aria-expanded", "true");
    birthdayCalendarPopEl = document.createElement("div");
    birthdayCalendarPopEl.className = "vc-user-profile-bday-pophost";
    birthdayCalendarPopEl.__vcBdayAnchor = anchor;
    birthdayCalendarPopEl.__vcBdayMonth = month;
    birthdayCalendarPopEl.__vcBdayYear = year;
    birthdayCalendarPopEl.__vcBdayProfileUserId = profileUserId;
    birthdayCalendarPopEl.innerHTML =
      '<div class="vc-user-profile-bday-pop" role="dialog" aria-busy="true" aria-label="Calendario compleanni"><div class="vc-user-profile-bday-pop__panel vc-user-profile-bday-pop__panel--loading"><span>Caricamento calendario…</span></div></div>';
    document.body.appendChild(birthdayCalendarPopEl);
    document.documentElement.classList.add("vc-user-profile-bday-open");
    try {
      document.body.classList.add("vc-user-profile-bday-open");
    } catch (eBodyLock) {}
    wireBirthdayCalendarHost();
    loadBirthdayCalendarMonth(month, year, profileUserId);
  }

  function wireBirthdayBadge(root, profileUserId) {
    if (!root) return;
    var btn = root.querySelector("[data-vc-bday-badge]");
    if (!btn || btn.__vcBdayWired) return;
    btn.__vcBdayWired = true;
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (birthdayCalendarPopEl) {
        closeBirthdayCalendar();
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      openBirthdayCalendar(btn, profileUserId);
    });
  }

  var PROFILE_ROLE_IDS = {
    founder: "1442568886988963923",
    manager: "1521562607339704442",
    staffDelMese: "1442568895251611924",
    director: "1502322782602530977",
    highStaff: "1442568894349840435",
    staff: "1442568910070349985",
    partnerManager: "1442568905582317740",
    donator: "1442568916114346096",
    vip: "1442568950805430312",
    vipPlus: "1495472189347074119",
    serverBooster: "1329497467481493607",
    doubleBooster: "1494996567214788818",
    topWeeklyText: "1468674837957574757",
    topWeeklyVoc: "1468674787399172208",
    mvp: "1500843454014423101",
    memberOfTheMonth: "1500848813680758836",
  };

  function buildProfileBadges(rank, roles, birthday) {
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

    var hasFounder =
      hasRoleId(roles, PROFILE_ROLE_IDS.founder) ||
      includesAnyRole(names, ["founder", "fondatore"]);
    var hasManager =
      hasRoleId(roles, PROFILE_ROLE_IDS.manager) ||
        hasNormalizedRole(roleNames, function (name) {
          return name === "manager";
      });
    var hasStaffDelMese =
      hasRoleId(roles, PROFILE_ROLE_IDS.staffDelMese) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("staffer del mese") !== -1 || name.indexOf("staff del mese") !== -1;
      });
    var hasDirector =
      hasRoleId(roles, PROFILE_ROLE_IDS.director) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "director";
      });
    var hasHighStaff =
      hasRoleId(roles, PROFILE_ROLE_IDS.highStaff) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "high staff" || name.indexOf("high staff") !== -1;
      });
    var hasStaffRole =
      hasRoleId(roles, PROFILE_ROLE_IDS.staff) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "staff";
      });
    var hasPartnerManager =
      hasRoleId(roles, PROFILE_ROLE_IDS.partnerManager) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("partner manager") !== -1;
      });
    var hasMemberOfTheMonth =
      hasRoleId(roles, PROFILE_ROLE_IDS.memberOfTheMonth) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("member of the month") !== -1 || name.indexOf("membro del mese") !== -1;
      });
    var hasTopWeeklyText =
      hasRoleId(roles, PROFILE_ROLE_IDS.topWeeklyText) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("top weekly text") !== -1;
      });
    var hasTopWeeklyVoc =
      hasRoleId(roles, PROFILE_ROLE_IDS.topWeeklyVoc) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("top weekly voc") !== -1;
      });
    var hasMvp =
      hasRoleId(roles, PROFILE_ROLE_IDS.mvp) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "mvp";
      });
    var hasVipPlus =
      hasRoleId(roles, PROFILE_ROLE_IDS.vipPlus) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "vip+" || name === "vip plus";
      });
    var hasVip =
      !hasVipPlus &&
      (hasRoleId(roles, PROFILE_ROLE_IDS.vip) ||
        hasNormalizedRole(roleNames, function (name) {
          return name === "vip";
        }));
    var hasDoubleBooster =
      hasRoleId(roles, PROFILE_ROLE_IDS.doubleBooster) ||
      hasNormalizedRole(roleNames, function (name) {
        return name.indexOf("double booster") !== -1;
      });
    var hasServerBooster =
      hasRoleId(roles, PROFILE_ROLE_IDS.serverBooster) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "server booster" || name.indexOf("server booster") !== -1;
      });
    var hasDonator =
      hasRoleId(roles, PROFILE_ROLE_IDS.donator) ||
      hasNormalizedRole(roleNames, function (name) {
        return name === "donator" || name === "donatore";
      });

    if (hasFounder) add("founder", "fa-star-o", "Founder");
    if (hasManager) add("manager", "fa-briefcase", "Manager");
    if (hasStaffDelMese) add("sdm", "fa-trophy", "Staff del Mese");
    if (hasDirector) add("director", "fa-shield", "Director");
    if (hasHighStaff) add("highstaff", "fa-shield", "High Staff");
    if (
      hasStaffRole ||
      (!hasDirector &&
      !hasHighStaff &&
        includesAnyRole(names, ["admin", "mod", "moderator", "helper", "community manager"]))
    ) {
      add("staff", "fa-shield", "Staff");
    }
    if (hasPartnerManager) add("pm", "fa-handshake-o", "Partner Manager");
    if (hasMemberOfTheMonth) add("motm", "fa-calendar", "Member of The Month");
    if (hasTopWeeklyText) add("topweeklytext", "fa-comments-o", "Top Weekly Text");
    if (hasTopWeeklyVoc) add("topweeklyvoc", "fa-microphone", "Top Weekly Voc");
    if (hasMvp) add("mvp", "fa-star", "MVP");
    if (hasVipPlus) add("vipplus", "fa-diamond", "VIP+");
    if (hasVip) add("vip", "fa-diamond", "VIP");
    if (hasDoubleBooster) add("doublebooster", "fa-rocket", "Double Booster");
    if (hasServerBooster) add("booster", "fa-rocket", "Booster");
    if (hasDonator) add("donator", "fa-heart", "Donator");
    if (birthday && birthday.isToday) add("birthday", "fa-birthday-cake", "Compleanno");

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

  function renderProfile(root, userId, payload, opts) {
    opts = opts || {};
    clearProfileLoading();
    root.hidden = false;
    var wantsStaffTab = false;
    try {
      wantsStaffTab =
        String(new URLSearchParams(window.location.search || "").get("tab") || "")
          .trim()
          .toLowerCase() === "staff";
    } catch (eTab) {
      wantsStaffTab = false;
    }
        if (opts.communityOnly) wantsStaffTab = false;
            var savedStaffPane = null;
    try {
      var existingPane = root.querySelector("[data-vc-profile-staff-pane]");
      if (existingPane && wantsStaffTab) {
        var paneFor = String(existingPane.getAttribute("data-vc-staff-user") || "").trim();
        if (paneFor && paneFor === String(userId)) {
          savedStaffPane = existingPane.parentNode.removeChild(existingPane);
        }
      }
    } catch (eSave) {
      savedStaffPane = null;
    }
        if (!wantsStaffTab) {
      try {
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
        document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
      } catch (eTabClear) {}
    }
    var level = payload.level || {};
    var weekly = payload.weekly || {};
    var messages = payload.messages || {};
    var voice = payload.voice || {};
    var profile = payload.profile || {};
    var profileNick = resolveProfileDisplayName(profile, level);
    var profileHandle = String(profile.username || level.username || "").trim();
    var avatar = profileAvatarSrc(
      String(profile.avatarUrl || level.avatarUrl || "").trim(),
      String(profile.avatar || level.avatar || "").trim(),
      userId,
      256,
    );
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
        var avatarRingStyle = ' style="--vc-rank-ring:#e8c49c"';
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
    var badgesHtml = buildProfileBadges(level.rank, roles, profile.birthday || null);
    var birthdayBadgeHtml = buildBirthdayBadgeHtml(profile.birthday || null);
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
            var avatarUrl = profileAvatarSrc(String(member.avatarUrl || "").trim(), "", member.id, 128);
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
      var voiceTitleHtml = formatCustomVoiceTitleHtml(voice, name);
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
        voiceTitleHtml +
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
    else setProfilePageTitle("Profilo");
    root.innerHTML =
      '<section class="vc-user-profile-shell" data-vc-community-user="' +
      esc(userId) +
      '">' +
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap"' +
      avatarRingStyle +
      ">" +
      '<span class="vc-user-profile-avatarclip">' +
      (avatar
        ? '<img class="vc-user-profile-avatar" src="' +
          esc(avatar) +
          '" alt="" width="256" height="256" loading="eager" decoding="async" referrerpolicy="no-referrer" vcAvatarStatic="1" onerror="this.onerror=null;this.src=\'' +
          esc(defaultEmbedAvatarUrl(userId)) +
          '\'" />'
        : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user"></i></span>') +
      "</span>" +
      "</div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      '<span class="vc-user-profile-name__text">' +
      esc(profileNick) +
      "</span>" +
      birthdayBadgeHtml +
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
    if (savedStaffPane) {
      try {
        root.appendChild(savedStaffPane);
      } catch (eRe) {}
    }
    profileBootSettled = true;
    unlockProfileChrome();
    clearProfilePending();
    if (viewerOwns) wireProfileCustomCreate(root);
    wireBirthdayBadge(root, userId);
    if (opts.skipStaffSync) {
      try {
        if (
          window.VCUserProfileStaffTab &&
          typeof window.VCUserProfileStaffTab.paintCommunityChrome === "function"
        ) {
          window.VCUserProfileStaffTab.paintCommunityChrome(root, userId);
        }
      } catch (eChrome) {}
      scanProfileAvatars(root);
      return;
    }
    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
        window.VCUserProfileStaffTab.sync(userId, root);
      }
    } catch (eStaffTab) {}
    scanProfileAvatars(root);
  }

  function syncProfileStaffTab(userId, root) {
    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
        window.VCUserProfileStaffTab.sync(userId, root);
      }
    } catch (eStaffTab) {}
  }

  function releaseProfileRankObjectUrl() {
    if (!profileRankObjectUrl) return;
    try {
      window.URL.revokeObjectURL(profileRankObjectUrl);
    } catch (e) {}
    profileRankObjectUrl = "";
  }

  function communityShellUserId(root) {
    try {
      if (!root) root = byId("vc-user-profile-view");
      if (!root) return "";
      var shell = root.querySelector(":scope > .vc-user-profile-shell");
      return shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
    } catch (e) {
      return "";
    }
  }

  function setRankCardPreviewReady(img, ready) {
    var wrap = img && img.closest ? img.closest(".vc-rank-editor-preview__imagewrap") : null;
    if (wrap) wrap.classList.toggle("is-ready", Boolean(ready));
    if (img) {
      if (ready) img.removeAttribute("hidden");
      else img.setAttribute("hidden", "");
    }
  }

  function rankCardImgMatchesUser(img, userId) {
    if (!img) return false;
    var marked = String(img.getAttribute("data-vc-rank-for") || "").trim();
    return Boolean(marked && marked === String(userId || "").trim());
  }

  function loadProfileRankCardPreview(userId, options) {
    options = options || {};
    var force = Boolean(options.force);
    var img = byId("vc-user-rankcard-image");
    var status = byId("vc-user-rankcard-image-status");
    if (!img || !status) return;
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
        if (lockedCommunityUserId && lockedCommunityUserId !== uid) return;
    var now = Date.now();
    var markedFor = String(img.getAttribute("data-vc-rank-for") || "").trim();
    if (uid && markedFor && markedFor !== uid) {
      force = true;
      try {
        img.removeAttribute("src");
      } catch (eClrSrc) {}
      setRankCardPreviewReady(img, false);
      lastRankPreviewUserId = "";
      lastRankPreviewLoadedAt = 0;
    }
    var wrapReady = Boolean(img.closest && img.closest(".vc-rank-editor-preview__imagewrap.is-ready"));
    var hasSrc = Boolean(img.getAttribute("src"));
    if (
      !force &&
      uid &&
      lastRankPreviewUserId === uid &&
      rankCardImgMatchesUser(img, uid) &&
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
    try {
      img.setAttribute("data-vc-rank-for", uid);
    } catch (eMark) {}
    var myToken = ++profileRankRenderToken;
    function showImage(src, fromCache) {
      if (myToken !== profileRankRenderToken) return;
      if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
      img.onload = function () {
        if (myToken !== profileRankRenderToken) return;
        if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
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
        if (String(img.getAttribute("data-vc-rank-for") || "") !== uid) return;
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
    } else if (!hasSrc || force) {
      setRankCardPreviewReady(img, false);
      status.hidden = true;
      status.textContent = "";
      status.className = "vc-rank-editor-preview__imagestatus";
      img.classList.add("is-rendering");
    }
    var directUrl = url + (force ? (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now() : "");
    showImage(directUrl, false);
    fetch(url, { cache: "default", credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (myToken !== profileRankRenderToken) return;
        if (!blob || !blob.size) throw new Error("empty");
        if (blob.size < 380000) {
          blobToDataUrl(blob)
            .then(function (dataUrl) {
              if (dataUrl) saveCachedProfileRankPreview(userId, dataUrl);
            })
            .catch(function () {});
        }
      })
      .catch(function () {
        if (myToken !== profileRankRenderToken) return;
        if (img.getAttribute("src")) return;
        img.classList.remove("is-rendering");
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

        if (
      lockedCommunityUserId &&
      String(userId || "") !== lockedCommunityUserId &&
      !(
        document.body &&
        document.body.classList.contains("vc-user-profile-staff-tab")
      )
    ) {
      return false;
    }

    if (result && result.notFound) {
      if (silent) return false;
      renderEmpty(root, userId);
      return false;
    }

    if (!result || !result.ok) {
      if (silent) return false;
      if (profileInitialLoadDone) return false;
      if (
        root &&
        profileViewLooksReady(root) &&
        String(communityShellUserId(root) || "") === String(userId || "")
      ) {
        return false;
      }
      if (lastRenderedProfile && String(lastRenderedProfile.userId || "") === String(userId || "")) {
        return false;
      }
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
    var rankImg = root.querySelector("#vc-user-rankcard-image");
    var rankMismatch = Boolean(rankImg && !rankCardImgMatchesUser(rankImg, userId));
    var shellUserNow = communityShellUserId(root);
    var shellOk = shellUserNow === String(userId);

            var onStaffTab = Boolean(
      document.body && document.body.classList.contains("vc-user-profile-staff-tab"),
    );
    if (onStaffTab && silent) {
      lastProfileRenderSignature = nextSig;
      profileInitialLoadDone = true;
      profileBootSettled = true;
      return true;
    }

    var sameDom =
      silent && shellOk && nextSig === lastProfileRenderSignature && Boolean(rankImg);
    if (sameDom) {
      profileInitialLoadDone = true;
      profileBootSettled = true;
      if (rankMismatch || !rankImg.getAttribute("src")) {
        loadProfileRankCardPreview(userId, { force: true });
      }
      return true;
    }
    lastProfileRenderSignature = nextSig;
    try {
      var staffBusy =
        parseWantsStaffTab() &&
        onStaffTab &&
        !root.querySelector(
          ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel",
        );
      if (staffBusy && shellOk) {
        profileInitialLoadDone = true;
        profileBootSettled = true;
        try {
          if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.sync === "function") {
            window.VCUserProfileStaffTab.sync(userId, root);
          }
        } catch (eStaffDefer) {}
        return true;
      }
      renderProfile(root, userId, lastRenderedProfile.payload, {
        skipStaffSync: Boolean(lockedCommunityUserId),
        communityOnly: Boolean(lockedCommunityUserId),
      });
      profileInitialLoadDone = true;
      loadProfileRankCardPreview(userId, { force: true });
      try {
        document.documentElement.classList.remove("vc-user-profile-comm-switch");
      } catch (eGate) {}
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
    if (sess) {
      profileMemoryCache.set(key, { expireAt: now + PROFILE_CACHE_TTL_MS, value: sess });
      return sess;
    }
    var local = readLocalProfileCache(key, now);
    if (!local) return null;
    profileMemoryCache.set(key, { expireAt: now + PROFILE_CACHE_TTL_MS, value: local });
    return local;
  }

  function tryInstantProfileFromCache() {
    var userId = parseProfileId();
    if (!userId || profileInitialLoadDone) return false;
    var root = byId("vc-user-profile-view");
    if (!root) return false;
    if (profileViewLooksReady(root)) {
      profileInitialLoadDone = true;
      profileBootSettled = true;
      clearProfilePending();
      clearProfileLoading();
      unlockProfileChrome();
      root.hidden = false;
      return true;
    }
    var cachedOut = readCachedProfileBundle(userId);
    var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
    if (!(cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound)) return false;
    return applyProfileResult(
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
  }

  var profileMemberEnrichTimer = null;
  function scheduleProfileMemberEnrich(userId) {
    var id = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(id)) return;
    try {
      if (profileMemberEnrichTimer) window.clearTimeout(profileMemberEnrichTimer);
    } catch (eClr) {}
    profileMemberEnrichTimer = window.setTimeout(function () {
      profileMemberEnrichTimer = null;
      loadProfile({ silent: true, bypassCache: true });
    }, 700);
  }

  function loadProfile(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    var force = Boolean(options.force);
    var bypassCache = Boolean(options.bypassCache);
    var allowRetry = options.retry !== false;
    var retryCount = Math.max(0, Number(options.retryCount) || 0);
    if ((profileBootGaveUp || window.__VC_PROFILE_GAVE_UP) && !silent && !force) {
            profileBootGaveUp = false;
      try {
        window.__VC_PROFILE_GAVE_UP = false;
      } catch (eGave) {}
      options = Object.assign({}, options, { force: true });
      force = true;
    }
    var overrideId = String(options.userId || "").trim();
    var userId = /^\d{17,20}$/.test(overrideId) ? overrideId : parseProfileId();
    if (!userId) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }
    var root = byId("vc-user-profile-view");
    if (!root) {
      if (!silent) clearProfilePending();
      return Promise.resolve();
    }

    if (!silent) {
      root.hidden = false;
      try {
        hideLeaderOnlySections();
      } catch (eHideEarly) {}
    }

    if (!silent && force) {
      clearProfileSessionCaches();
    }

    if (!silent) {
      currentViewer = (typeof window !== "undefined" && window.__VC_DISCORD_PROFILE) || currentViewer;
      try {
        hideLeaderOnlySections();
      } catch (eHide) {}
      var keepVisible = profileViewLooksReady(root);
      if (lockedCommunityUserId) {
        keepVisible = communityShellLooksReadyFor(root, lockedCommunityUserId);
      }
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
        } else if (!profileInitialLoadDone && !keepVisible) {
          renderLoading(root);
        }
      } else if (!profileInitialLoadDone && !keepVisible) {
                renderLoading(root);
      }
    }

    return fetchProfileBundle(userId, bypassCache ? { bypassCache: true } : null)
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
              userId: userId,
            });
          });
        }
        var applied = applyProfileResult(root, userId, result, silent);
        if (applied && !silent && !bypassCache) {
          scheduleProfileMemberEnrich(userId);
        }
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
              userId: userId,
            });
          });
        }
        renderError(root);
        return false;
      })
      .finally(function () {
        if (silent || !parseProfileId()) return;
        var root = byId("vc-user-profile-view");
        if (profileInitialLoadDone || profileBootSettled) {
          clearProfilePending();
          clearProfileLoading();
        } else if (root && profileViewLooksReady(root)) {
          profileInitialLoadDone = true;
          profileBootSettled = true;
          clearProfilePending();
          clearProfileLoading();
        }
                try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock) {}
      });
  }

  function dismissCommunityBootOverlay() {
    try {
      var ul = byId("vc-ul-loading");
      if (ul) ul.hidden = true;
      document.documentElement.classList.remove("vc-user-leader-pending");
      document.documentElement.classList.remove("vc-page-cine-boot");
    } catch (eDismiss) {}
  }

  function main(options) {
    var force = Boolean(options && options.force);
    if (profileMainInFlight && !force) {
      return Promise.resolve();
    }
    if (force) profileMainInFlight = false;
    profileMainInFlight = true;
    if (parseProfileId()) dismissCommunityBootOverlay();
    armProfilePendingWatchdog();
    try {
      if (!(options && options.force) && tryInstantProfileFromCache()) {
        return loadProfile({ silent: true }).finally(function () {
          profileMainInFlight = false;
        });
      }
      return loadProfile(options || {}).finally(function () {
        profileMainInFlight = false;
      });
    } catch (eMain) {
      profileMainInFlight = false;
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

  function repairProfileAfterBack() {
    var userId = parseProfileId();
    if (!userId) return;
    var root = byId("vc-user-profile-view");
    if (!root) return;

    profileBootGaveUp = false;
    try {
      window.__VC_PROFILE_GAVE_UP = false;
    } catch (eGave) {}

    unlockProfileChrome();
    root.hidden = false;
    try {
      hideLeaderOnlySections();
    } catch (eHide) {}
    try {
      if (typeof window.__vcRepairNotifDropdownPortal === "function") {
        window.__vcRepairNotifDropdownPortal();
      } else if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
        window.__vcEnsureNotifDropdownInHeader(true);
      }
    } catch (eNotif) {}

    try {
      if (window.VCUserProfileStaffTab && typeof window.VCUserProfileStaffTab.repairAfterBack === "function") {
        window.VCUserProfileStaffTab.repairAfterBack(root, userId);
      }
    } catch (eStaff) {}

    var cachedOk =
      lastRenderedProfile &&
      String(lastRenderedProfile.userId) === String(userId) &&
      lastRenderedProfile.payload;
    var broken = profileViewLooksBroken(root);

    if (cachedOk && broken) {
      try {
        lastRenderedProfile.root = root;
        renderProfile(root, userId, lastRenderedProfile.payload);
        profileInitialLoadDone = true;
        loadProfileRankCardPreview(userId, { force: false });
      } catch (eRepaint) {
        profileInitialLoadDone = false;
      }
      loadProfile({ silent: true });
      return;
    }

    if (!broken && profileViewLooksReady(root)) {
      profileInitialLoadDone = true;
      if (cachedOk) lastRenderedProfile.root = root;
      try {
        syncProfileStaffTab(userId, root);
      } catch (eSync) {}
      loadProfile({ silent: true });
      return;
    }

        profileInitialLoadDone = false;
    main({ force: false });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var prevViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    currentViewer = ev && ev.detail ? ev.detail.user || null : null;
    var nextViewerId = currentViewer && currentViewer.id ? String(currentViewer.id) : "";
    if (!lastRenderedProfile || !lastRenderedProfile.root) return;
        if (prevViewerId === nextViewerId) return;
    var sig = profileRenderSignature(lastRenderedProfile.userId, lastRenderedProfile.payload, nextViewerId);
    if (sig === lastProfileRenderSignature && lastRenderedProfile.root.querySelector("#vc-user-rankcard-image")) {
      return;
    }
    lastProfileRenderSignature = sig;
    renderProfile(lastRenderedProfile.root, lastRenderedProfile.userId, lastRenderedProfile.payload);
    syncProfileStaffTab(lastRenderedProfile.userId, lastRenderedProfile.root);
    loadProfileRankCardPreview(lastRenderedProfile.userId, { force: false });
  });

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
    if (!parseProfileId()) return;
        if (ev && ev.persisted) {
      repairProfileAfterBack();
      return;
    }
        window.setTimeout(function () {
      if (!parseProfileId()) return;
      var r = byId("vc-user-profile-view");
      if (!r) return;
      var pending = false;
      var staleStaff = false;
      try {
        pending = document.documentElement.classList.contains("vc-user-profile-pending");
        staleStaff =
          (document.body && document.body.classList.contains("vc-user-profile-staff-tab")) ||
          document.documentElement.classList.contains("vc-user-profile-staff-tab-pending");
      } catch (eCls) {}
      if (pending && !profileInitialLoadDone) {
        main({ force: false });
        return;
      }
      if (pending) return;
      if (staleStaff && profileViewLooksBroken(r)) {
        repairProfileAfterBack();
        return;
      }
      if (profileInitialLoadDone && profileViewLooksBroken(r)) {
        repairProfileAfterBack();
      }
    }, 100);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!parseProfileId()) return;
    try {
      var root = byId("vc-user-profile-view");
      if (root && profileViewLooksBroken(root)) repairProfileAfterBack();
    } catch (eVis) {}
  });

  window.addEventListener("beforeunload", stopLiveProfilePolling);

  window.addEventListener("vc:profile-id-changed", function (ev) {
    var id = ev && ev.detail && ev.detail.userId ? String(ev.detail.userId) : "";
    if (!/^\d{17,20}$/.test(id)) return;
    if (!parseProfileId()) return;
    loadProfile({ silent: true });
  });

  window.addEventListener("popstate", function () {
    if (!parseProfileId()) return;
    var id = parseProfileId();
    if (
      window.VCUserProfileStaffTab &&
      typeof window.VCUserProfileStaffTab.sync === "function"
    ) {
      var root = byId("vc-user-profile-view");
      window.VCUserProfileStaffTab.sync(id, root);
    }
    loadProfile({ silent: true });
  });

  window.VCUserProfilePage = {
    isProfileMode: function () {
      return Boolean(parseProfileId());
    },
    profilePublicUrl: profilePublicUrl,
    repairAfterBack: repairProfileAfterBack,
        ensureCommunityFor: function (userId, root, opts) {
      var id = String(userId || "").trim();
      if (!/^\d{17,20}$/.test(id)) return false;
      if (!root) root = byId("vc-user-profile-view");
      if (!root) return false;
      opts = opts || {};
      var wipe = Boolean(opts.wipe);

      lockedCommunityUserId = id;
      communityPaintSeq += 1;
      var paintSeq = communityPaintSeq;

      var shell = root.querySelector(":scope > .vc-user-profile-shell");
      var shellUser = shell ? String(shell.getAttribute("data-vc-community-user") || "").trim() : "";
      var shellStale = Boolean(shell && shell.getAttribute("data-vc-community-stale") === "1");
      var heroIdOk = false;
      try {
        var idEl = shell && shell.querySelector(".vc-user-profile-id");
        heroIdOk = Boolean(idEl && String(idEl.textContent || "").indexOf(id) !== -1);
      } catch (eHero) {
        heroIdOk = false;
      }
      var shellReallyOk = Boolean(shell && shellUser === id && !shellStale && heroIdOk);

      if (shellReallyOk && !wipe) {
        try {
          document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
          if (document.body) {
            document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
          }
        } catch (eClsOk) {}
        try {
          shell.hidden = false;
          shell.removeAttribute("data-vc-community-stale");
          shell.setAttribute("aria-hidden", "false");
          shell.style.removeProperty("display");
          shell.style.removeProperty("visibility");
        } catch (eShow) {}
        loadProfileRankCardPreview(id, { force: true });
        try {
          document.documentElement.classList.remove("vc-user-profile-comm-switch");
        } catch (eGateOk) {}
        return true;
      }

      function paintFromPayload(payload) {
        if (paintSeq !== communityPaintSeq) return false;
        if (lockedCommunityUserId && lockedCommunityUserId !== id) return false;
        lastProfileRenderSignature = "";
        lastRenderedProfile = { root: root, userId: id, payload: payload };
                profileRankRenderToken += 1;
        lastRankPreviewUserId = "";
        lastRankPreviewLoadedAt = 0;
        renderProfile(root, id, payload, { skipStaffSync: true, communityOnly: true });
        loadProfileRankCardPreview(id, { force: true });
        try {
          document.documentElement.classList.remove("vc-user-profile-comm-switch");
        } catch (eGate) {}
        return true;
      }

            if (
        lastRenderedProfile &&
        String(lastRenderedProfile.userId || "") === id &&
        lastRenderedProfile.payload
      ) {
        try {
          if (paintFromPayload(lastRenderedProfile.payload)) return true;
        } catch (ePaint) {}
      }

      try {
        var cachedOut = readCachedProfileBundle(id);
        var cachedBody = cachedOut && cachedOut.body ? cachedOut.body : null;
        if (cachedOut && cachedOut.httpOk && cachedBody && cachedBody.ok && !cachedBody.notFound) {
          var payload = {
            profile: cachedBody.profile || {},
            level: cachedBody.rows && cachedBody.rows.level ? cachedBody.rows.level : {},
            weekly: cachedBody.rows && cachedBody.rows.weekly ? cachedBody.rows.weekly : {},
            messages: cachedBody.rows && cachedBody.rows.messages ? cachedBody.rows.messages : {},
            voice: cachedBody.rows && cachedBody.rows.voice ? cachedBody.rows.voice : {},
          };
          if (paintFromPayload(payload)) return true;
        }
      } catch (eCache) {}

            try {
        lastProfileRenderSignature = "";
        if (
          lastRenderedProfile &&
          String(lastRenderedProfile.userId || "") !== id
        ) {
          lastRenderedProfile = null;
        }
        profileRankRenderToken += 1;
        lastRankPreviewUserId = "";
        lastRankPreviewLoadedAt = 0;
        profileInitialLoadDone = false;
        renderLoading(root, { force: true });
      } catch (eLoad) {}

            try {
        document.documentElement.classList.remove("vc-user-profile-staff-tab-pending");
        if (document.body) {
          document.body.classList.remove("vc-user-profile-staff-tab", "vc-staff-profile-home");
        }
      } catch (eCls) {}

      loadProfile({ silent: false, force: true, userId: id });
      return false;
    },
    lockCommunityUser: function (userId) {
      lockedCommunityUserId = String(userId || "").trim();
    },
    unlockCommunityUser: function () {
      lockedCommunityUserId = "";
    },
  };
})();