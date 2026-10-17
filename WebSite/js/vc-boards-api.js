/**
 * Bacheca — API helpers + card rendering.
 */
(function (global) {
  "use strict";

  var CFG = global.__VC_BOARDS || {};
  var BASE = String(CFG.apiUrl || "/webhooks/site-boards").replace(/\/+$/, "") || "/webhooks/site-boards";

  function token() {
    try {
      if (typeof global.__vcDiscordGetAccessToken === "function") {
        return String(global.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (_) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function authHeaders(extra) {
    var h = Object.assign({ Accept: "application/json" }, extra || {});
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  async function parseJson(res) {
    var text = "";
    try {
      text = await res.text();
    } catch (_) {}
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    if (!data || typeof data !== "object") {
      data = { ok: false, status: res.status, error: "bad_json", message: "Risposta non valida." };
    }
    if (data.status == null) data.status = res.status;
    return data;
  }

  var BOARDS_CACHE_VER = "b2";

  function cacheableGetPath(path) {
    var p = String(path || "").split("?")[0];
    return p === "/listings" || p === "/config" || p === "/tags";
  }

  function boardsCacheKey(url) {
    try {
      if (global.VcApiCache && typeof global.VcApiCache.keyFor === "function") {
        return global.VcApiCache.keyFor(url, { scope: "boards", v: BOARDS_CACHE_VER });
      }
    } catch (_) {}
    return "boards:anon:" + BOARDS_CACHE_VER + ":" + String(url || "");
  }

  /* apiStaleFirst2: peek sync anche se VcApiCache non è ancora bootato (discord-auth defer) */
  /* apiStaleFirst1: peek sync anche se VcApiCache non è ancora bootato (discord-auth defer) */
  function peekStorageEntry(key) {
    var fullKeys = ["vc:apicache:" + key, "vc:apicache:local:" + key];
    var stores = [global.sessionStorage, global.localStorage];
    for (var s = 0; s < stores.length; s += 1) {
      for (var k = 0; k < fullKeys.length; k += 1) {
        try {
          var raw = stores[s] && stores[s].getItem(fullKeys[k]);
          if (!raw) continue;
          var entry = JSON.parse(raw);
          if (entry && entry.value) return entry.value;
        } catch (_) {}
      }
    }
    return null;
  }

  function normalizeCachedBody(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.body && typeof raw.body === "object") return raw.body;
    if (raw.ok === true) return raw;
    return null;
  }

  function peekCachedGet(path) {
    try {
      var url = BASE + path;
      var key = boardsCacheKey(url);
      if (global.VcApiCache && typeof global.VcApiCache.peekBody === "function") {
        var hit = global.VcApiCache.peekBody(key, {
          ttlMs: 45000,
          staleMs: 600000,
          persistMs: 45 * 60 * 1000,
        });
        if (hit && hit.body) return hit.body;
      }
      return normalizeCachedBody(peekStorageEntry(key));
    } catch (_) {
      return null;
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    var method = String(opts.method || "GET").toUpperCase();
    var url = BASE + path;
    var init = {
      method: method,
      headers: authHeaders(opts.json ? { "Content-Type": "application/json" } : {}),
      credentials: "omit",
      cache: "no-store",
    };
    if (opts.json) init.body = JSON.stringify(opts.json);

    /* apiStaleFirst1: GET pubblici via VcApiCache (stale → paint subito) */
    if (
      method === "GET" &&
      !opts.noCache &&
      cacheableGetPath(path) &&
      global.VcApiCache &&
      typeof global.VcApiCache.fetchWithCache === "function"
    ) {
      try {
        var key = boardsCacheKey(url);
        var wrapped = await global.VcApiCache.fetchWithCache(key, url, {
          ttlMs: path.indexOf("/config") === 0 ? 120000 : 45000,
          staleMs: 600000,
          persistMs: 45 * 60 * 1000,
          timeoutMs: opts.timeoutMs || 12000,
          fetchInit: init,
          onStale: function (cached) {
            var body = normalizeCachedBody(cached);
            if (body && typeof opts.onStale === "function") {
              try {
                opts.onStale(body);
              } catch (eOs) {}
            }
          },
        });
        var body = normalizeCachedBody(wrapped);
        if (body) {
          if (body.status == null && wrapped && wrapped.status != null) body.status = wrapped.status;
          return body;
        }
      } catch (eCache) {
        /* fall through to direct fetch */
      }
    }

    var res = await fetch(url, init);
    return parseJson(res);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* boardsDiscordMdUnify1: parser → VcDiscordMd (stesso ovunque) */
  function formatDescHtml(raw, opts) {
    opts = opts || {};
    try {
      if (global.VcDiscordMd && typeof global.VcDiscordMd.format === "function") {
        return global.VcDiscordMd.format(raw, {
          inline: opts.inline === true,
          classPrefix: "vc-boards-md",
          emojiClass: "vc-emoji vc-discord-emoji",
        });
      }
    } catch (eMd) {}
    return String(raw == null ? "" : raw)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  function wireBoardsMarkdownOnce() {
    try {
      if (global.VcDiscordMd && typeof global.VcDiscordMd.wire === "function") {
        global.VcDiscordMd.wire();
      }
    } catch (eW) {}
    if (global.__vcBoardsMdWired) return;
    global.__vcBoardsMdWired = 1;
  }
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireBoardsMarkdownOnce);
    } else {
      wireBoardsMarkdownOnce();
    }
  } catch (eWire) {}

  /* boardsPrettyPath1: server → /bacheca/server/<id>/ ; bot → /bacheca/bots/<id> */
  function listingKindKey(kind) {
    return String(kind || "").toLowerCase() === "bot" ? "bot" : "server";
  }

  function listingUrl(listingOrSlug, maybeOpts) {
    var kind = "server";
    var id = "";
    var review = false;
    var preview = false;
    if (listingOrSlug && typeof listingOrSlug === "object") {
      kind = listingKindKey(listingOrSlug.kind || listingOrSlug.boardKind);
      id = String(listingOrSlug.id || listingOrSlug._id || listingOrSlug.slug || "").trim();
      review = Boolean(listingOrSlug.review);
      preview = Boolean(listingOrSlug.preview);
    } else {
      id = String(listingOrSlug || "").trim();
      if (maybeOpts && typeof maybeOpts === "object") {
        kind = listingKindKey(maybeOpts.kind);
        if (maybeOpts.id) id = String(maybeOpts.id || "").trim();
        review = Boolean(maybeOpts.review);
        preview = Boolean(maybeOpts.preview);
      } else if (typeof maybeOpts === "string" && maybeOpts) {
        /* listingUrl(kind, id) */
        kind = listingKindKey(listingOrSlug);
        id = String(maybeOpts || "").trim();
      }
    }
    if (!id) return "/bacheca/";
    /* boardsRevLangPath1: review → scheda?id= (resiste a /en/… e parse path) */
    if (review && /^[a-f0-9]{24}$/i.test(id)) {
      return "/bacheca/scheda/?id=" + encodeURIComponent(id) + "&review=1";
    }
    var path =
      kind === "bot"
        ? "/bacheca/bots/" + encodeURIComponent(id)
        : "/bacheca/server/" + encodeURIComponent(id) + "/";
    if (review) path += (path.indexOf("?") >= 0 ? "&" : "?") + "review=1";
    else if (preview) path += (path.indexOf("?") >= 0 ? "&" : "?") + "preview=1";
    return path;
  }

  function kindLabel(kind) {
    return kind === "bot" ? "Bot" : "Server";
  }

  function statusLabel(st) {
    var map = {
      draft: "Bozza",
      pending: "In moderazione",
      approved: "Approvata",
      rejected: "Rifiutata",
      suspended: "Sospesa",
    };
    return map[st] || st || "—";
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    try {
      return n.toLocaleString("it-IT");
    } catch (_) {
      return String(n);
    }
  }

  /* boardsAnimIcon1/2 + boardsIconRingAnim2 + boardsIconCircleAnim1 + boardsFloatSearch1:
     a_* / animated → .gif; icons size 160 (scheda: 256)
     brandLogoGifEverywhere1 / boardsAnimIconForce1: forza .gif su hash a_* anche se ext statica */
  function animMediaUrl(url, opts) {
    var u = String(url || "").trim();
    if (!u) return "";
    opts = opts && typeof opts === "object" ? opts : {};
    var sizeWant = Number(opts.size) > 0 ? Math.round(Number(opts.size)) : 160;
    var hostOk =
      /(?:cdn\.discordapp\.com|cdn\.discord\.com|media\.discordapp\.net)\/(?:icons|banners|avatars|app-icons|guilds|embed\/avatars)\//i.test(
        u,
      );
    if (!hostOk) return u;
    var animated =
      /\/a_[a-f0-9]+\./i.test(u) ||
      /\.gif(?:$|[?#])/i.test(u) ||
      /[?&]animated=true(?:&|$)/i.test(u);
    if (!animated) return u;
    u = u.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
    /* togli still/format statici che Discord a volte mette in query */
    u = u.replace(/([?&])format=(?:png|webp|jpeg|jpg)(&|$)/gi, function (_m, sep, trail) {
      return trail === "&" ? sep : "";
    });
    u = u.replace(/([?&])animated=false(&|$)/gi, function (_m, sep, trail) {
      return trail === "&" ? sep : "";
    });
    if (/\/(?:icons|app-icons|avatars)\//i.test(u)) {
      if (/([?&])size=\d+/i.test(u)) u = u.replace(/([?&]size=)\d+/i, "$1" + String(sizeWant));
      else u += (u.indexOf("?") >= 0 ? "&" : "?") + "size=" + String(sizeWant);
    }
    return u;
  }

  /* boardsExploreChipFilter1: link a Esplora con filtro in query + testo ricerca */
  function exploreFilterUrl(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var kind = String(o.kind || "server").toLowerCase() === "bot" ? "bot" : "server";
    var params = new URLSearchParams();
    params.set("kind", kind);
    var qLabel = String(o.q != null ? o.q : o.label != null ? o.label : o.value || "").trim();
    var type = String(o.type || "").toLowerCase();
    var value = String(o.value || "").trim();
    if (type === "tag" && value) params.set("tag", value);
    else if (type === "category" && value) params.set("category", value);
    else if (type === "locale" && value) params.set("locale", value);
    else if ((type === "guildtag" || type === "guild_tag" || type === "discord") && value) {
      params.set("guildTag", value);
    }
    if (qLabel) params.set("q", qLabel);
    else if (value) params.set("q", value);
    return "/bacheca/?" + params.toString();
  }

  function filterChipHtml(className, href, innerHtml, title, meta) {
    meta = meta && typeof meta === "object" ? meta : {};
    var type = String(meta.type || "").trim();
    var value = String(meta.value || "").trim();
    return (
      '<a class="' +
      esc(className) +
      ' vc-boards-filter-chip vc-no-sfx" href="' +
      esc(href) +
      '"' +
      (title ? ' title="' + esc(title) + '"' : "") +
      (type ? ' data-filter-type="' + esc(type) + '"' : "") +
      (value ? ' data-filter-value="' + esc(value) + '"' : "") +
      ">" +
      innerHtml +
      "</a>"
    );
  }

  function cardHtml(item) {
    if (!item) return "";
    var bannerUrl = animMediaUrl(item.bannerUrl);
    var iconUrl = animMediaUrl(item.iconUrl);
    var banner = bannerUrl
      ? ' style="--bc-card-banner:url(' + esc(bannerUrl) + ");background-image:url(" + esc(bannerUrl) + ')"'
      : item.accent
        ? ' style="background:linear-gradient(120deg,' + esc(item.accent) + '66,#1a1410)"'
        : "";
    /* boardsIconCircleAnim1: cerchio + anello + GIF su card esplora */
    var icon = iconUrl
      ? '<img class="vc-boards-card__icon vc-no-sfx" src="' +
        esc(iconUrl) +
        '" alt="" width="56" height="56" loading="lazy" decoding="async" data-vc-anim-media="1" draggable="false" />'
      : '<span class="vc-boards-card__icon vc-boards-card__icon--empty vc-no-sfx" aria-hidden="true"><i class="fa fa-server"></i></span>';
    /* boardsAnimBannerClear1 + boardsExploreChipFilter1: tag fuori dal link scheda */
    var kindKey = String(item.kind || "server").toLowerCase() === "bot" ? "bot" : "server";
    var tags = (item.tags || [])
      .slice(0, 4)
      .map(function (t) {
        var raw = String(t || "").trim();
        if (!raw) return "";
        var href = exploreFilterUrl({ kind: kindKey, type: "tag", value: raw, q: "#" + raw });
        return filterChipHtml("vc-boards-tag", href, esc(raw), "Cerca tag #" + raw, {
          type: "tag",
          value: raw,
        });
      })
      .join("");
    var members =
      item.stats && item.stats.members != null
        ? '<span title="Membri"><i class="fa fa-users" aria-hidden="true"></i> ' + esc(fmtNum(item.stats.members)) + "</span>"
        : "";
    var votesMonth = Math.max(0, Math.round(Number(item.votesMonth) || 0));
    var voteHref =
      "/bacheca/vota/?" +
      (item.id ? "id=" + encodeURIComponent(item.id) : "slug=" + encodeURIComponent(item.slug || ""));
    var approved = String(item.status || "approved") === "approved" || !item.status;
    /* boardsVoteFlow1: Vota (N) mese corrente — solo schede approvate */
    return (
      '<article class="vc-boards-card">' +
      '<a class="vc-boards-card__link" href="' +
      esc(listingUrl(item)) +
      '">' +
      '<div class="vc-boards-card__banner"' +
      banner +
      "></div>" +
      '<div class="vc-boards-card__body">' +
      icon +
      '<div><span class="vc-boards-card__kind">' +
      esc(kindLabel(item.kind)) +
      "</span>" +
      '<h3 class="vc-boards-card__name">' +
      esc(item.name) +
      "</h3>" +
      (item.tagline
        ? '<p class="vc-boards-card__tagline vc-boards-md">' +
          formatDescHtml(item.tagline, { inline: true }) +
          "</p>"
        : "") +
      "</div>" +
      '<div class="vc-boards-card__foot">' +
      (members
        ? '<div class="vc-boards-card__meta">' + members + "</div>"
        : '<span class="vc-boards-card__meta"></span>') +
      "</div></div></a>" +
      (tags ? '<div class="vc-boards-card__tags">' + tags + "</div>" : "") +
      (approved
        ? '<a class="vc-boards-card__vote" href="' +
          esc(voteHref) +
          '"><i class="fa fa-thumbs-up" aria-hidden="true"></i> Vota <span>(' +
          esc(String(votesMonth)) +
          ")</span></a>"
        : "") +
      "</article>"
    );
  }

  function boardsNavItems() {
    return [
      {
        href: "/bacheca/",
        id: "browse",
        label: "Esplora",
        i18n: "boards.navExplore",
        icon: "fa-compass",
      },
      {
        href: "/bacheca/invia/",
        id: "submit",
        label: "Pubblica",
        i18n: "boards.navPublish",
        icon: "fa-plus",
      },
      {
        href: "/bacheca/le-mie/",
        id: "manage",
        label: "Le mie",
        i18n: "boards.navMine",
        icon: "fa-folder-o",
      },
    ];
  }

  function resolveBoardsNavActive(active) {
    var act = String(active == null ? "" : active)
      .trim()
      .toLowerCase();
    if (act === "submit" || act === "manage" || act === "browse") return act;
    if (
      act === "hub" ||
      act === "server" ||
      act === "servers" ||
      act === "bot" ||
      act === "bots" ||
      act === "view" ||
      act === "vote" ||
      act === "mod"
    ) {
      return "browse";
    }
    try {
      var page = String(
        (document.body && document.body.getAttribute("data-vc-boards-page")) || "",
      )
        .trim()
        .toLowerCase();
      if (page === "submit") return "submit";
      if (page === "manage") return "manage";
    } catch (_) {}
    return "browse";
  }

  /* boardsHeaderNav1: Esplora/Pubblica/Le mie nella navbar header (no switcher in-page) */
  function installBoardsHeaderNav(active) {
    var nav = null;
    try {
      nav =
        document.querySelector("header .vc-header-snav") ||
        document.querySelector(".vc-header-bar .vc-header-snav") ||
        document.querySelector("nav.vc-header-snav");
    } catch (_) {
      nav = null;
    }
    if (!nav) return false;
    var act = resolveBoardsNavActive(active);
    try {
      nav.classList.add("vc-header-snav--boards");
      nav.setAttribute("aria-label", "Bacheca");
      nav.setAttribute("data-i18n-attr", "aria-label:boards.navAria");
    } catch (_) {}
    nav.innerHTML = boardsNavItems()
      .map(function (it) {
        var on = it.id === act;
        return (
          '<a class="vc-snav-item' +
          (on ? " vc-snav-item--active" : "") +
          '" href="' +
          it.href +
          '"' +
          (on ? ' aria-current="page"' : "") +
          ' data-vc-boards-nav="' +
          it.id +
          '"><i class="fa ' +
          it.icon +
          '" aria-hidden="true"></i><span data-i18n="' +
          it.i18n +
          '">' +
          it.label +
          "</span></a>"
        );
      })
      .join("");
    try {
      if (document.body) document.body.classList.add("vc-boards-page");
      document.documentElement.classList.add("vc-boards-header-nav");
    } catch (_) {}
    try {
      if (global.VcI18n && typeof global.VcI18n.apply === "function") {
        global.VcI18n.apply(nav);
      } else if (typeof global.__vcApplyI18n === "function") {
        global.__vcApplyI18n(nav);
      }
    } catch (_) {}
    /* boardsHamPages1: sync hamburger con snav boards */
    try {
      if (typeof global.__vcMobileNavRebuild === "function") {
        global.__vcMobileNavRebuild();
      }
    } catch (_) {}
    return true;
  }

  function kindChromeHtml(kind, idPrefix) {
    var k = kind === "bot" ? "bot" : "server";
    var pref = idPrefix || "vc-boards-kind";
    return (
      '<nav class="vc-boards-chrome vc-boards-chrome--kind-only" aria-label="Tipo">' +
      '<div class="vc-boards-seg vc-boards-chrome__kind" role="tablist" aria-label="Tipo">' +
      '<button type="button" class="vc-boards-seg__btn vc-no-sfx' +
      (k === "server" ? " is-active" : "") +
      '" data-kind="server" id="' +
      pref +
      '-server">' +
      '<i class="fa fa-server" aria-hidden="true"></i>' +
      '<span data-i18n="boards.kindServer">Server</span></button>' +
      '<button type="button" class="vc-boards-seg__btn vc-no-sfx' +
      (k === "bot" ? " is-active" : "") +
      '" data-kind="bot" id="' +
      pref +
      '-bot">' +
      '<i class="fa fa-android" aria-hidden="true"></i>' +
      '<span data-i18n="boards.kindBot">Bot</span></button>' +
      "</div></nav>"
    );
  }

  function navHtml(active, opts) {
    /* boardsHeaderNav1: header = Esplora/Pubblica/Le mie; chrome = solo Server|Bot centrato */
    opts = opts || {};
    installBoardsHeaderNav(active);
    if (opts.hideKind) return "";
    if (!Object.prototype.hasOwnProperty.call(opts, "kind")) return "";
    return kindChromeHtml(opts.kind, opts.idPrefix);
  }

  function autoInstallBoardsHeaderNav() {
    try {
      if (!document.body || !document.body.classList.contains("vc-boards-page")) return;
      installBoardsHeaderNav(
        document.body.getAttribute("data-vc-boards-page") || "browse",
      );
    } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInstallBoardsHeaderNav);
  } else {
    autoInstallBoardsHeaderNav();
  }

  /* boardsMsgToast1: status → toast fisso (no barra inline) */
  function toastMsg(text, isErr) {
    var msg = String(text == null ? "" : text).trim();
    var T = global.VcSiteToast;
    if (!msg) {
      if (T && typeof T.hide === "function") T.hide();
      return;
    }
    if (T && typeof T.show === "function") {
      T.show(msg, !!isErr);
      return;
    }
    if (typeof global.__vcShowSiteToast === "function") {
      global.__vcShowSiteToast(msg, !!isErr);
    }
  }

  /* boardsScrollPath1 + schedaBootCue1: sblocca restore + sipario scheda */
  function markContentReady() {
    try {
      if (global.__vcBoardsContentReady) return;
      global.__vcBoardsContentReady = 1;
      if (document.documentElement) {
        document.documentElement.setAttribute("data-vc-boards-content-ready", "1");
        document.documentElement.classList.remove("vc-boards-view-pending");
        /* boardsLoadHold1c: ripristina scroll cue su esplora (non scheda) */
        try {
          var p = String((global.location && global.location.pathname) || "");
          var isScheda =
            /\/(?:bacheca|boards)\/scheda(?:\/|$)/i.test(p) ||
            /\/(?:bacheca|boards)\/view(?:\/|$)/i.test(p) ||
            (document.body &&
              String(document.body.getAttribute("data-vc-boards-page") || "").toLowerCase() ===
                "view");
          if (!isScheda) {
            document.documentElement.classList.remove("vc-scrollcue-away");
          }
        } catch (eCue) {}
      }
      document.dispatchEvent(new CustomEvent("vc:boards-content-ready"));
      try {
        if (typeof global.__vcMarkPageCineReady === "function") {
          global.__vcMarkPageCineReady(true);
        }
      } catch (eMark) {}
    } catch (eReady) {}
  }

  /* boardsLoginGate1: overlay login allineato a tickets/recensioni */
  function triggerDiscordLogin(visualBtn) {
    try {
      if (typeof global.__vcDiscordStartOAuthRedirect === "function") {
        global.__vcDiscordStartOAuthRedirect(visualBtn || null);
        return true;
      }
    } catch (_) {}
    try {
      if (typeof global.__vcDiscordLogin === "function") {
        global.__vcDiscordLogin();
        return true;
      }
    } catch (_) {}
    try {
      var btn =
        document.querySelector("header [data-vc-discord-login]") ||
        document.querySelector("#discord-login-btn");
      if (btn) {
        btn.click();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function bindBoardsGateLogin() {
    var cta = document.getElementById("vc-boards-gate-login-cta");
    if (!cta || cta.getAttribute("data-vc-boards-gate-bound") === "1") return;
    cta.setAttribute("data-vc-boards-gate-bound", "1");
    cta.addEventListener("click", function (ev) {
      try {
        ev.preventDefault();
      } catch (_) {}
      triggerDiscordLogin(cta);
    });
  }
  try {
    bindBoardsGateLogin();
  } catch (_) {}

  function dismissBoardsGate() {
    var g = document.getElementById("vc-boards-gate");
    if (!g) return;
    try {
      g.setAttribute("hidden", "");
      g.classList.add("vc-reviews-gate--dismissed");
      if (document.body) document.body.classList.remove("vc-boards-gate-open");
    } catch (_) {}
  }

  function showBoardsGate(opts) {
    opts = opts || {};
    var g = document.getElementById("vc-boards-gate");
    if (!g) return false;
    var mode = String(opts.mode || "login").toLowerCase();
    var titleEl = document.getElementById("vc-boards-gate-title");
    var subEl = document.getElementById("vc-boards-gate-sub");
    var cta = document.getElementById("vc-boards-gate-login-cta");
    var ico = g.querySelector(".vc-auth-required-icon i");
    var loggedIn = Boolean(token());
    if (titleEl) {
      titleEl.innerHTML =
        mode === "staff"
          ? "Accesso staff<br />richiesto"
          : "Accedi per<br />la Bacheca";
    }
    if (subEl) {
      subEl.textContent =
        mode === "staff"
          ? loggedIn
            ? "Questo account non ha i permessi staff per l’anteprima Bacheca."
            : "La Bacheca è in anteprima staff: accedi con Discord per continuare."
          : "Collega Discord per esplorare e gestire le schede della Bacheca.";
    }
    if (ico) {
      ico.className = mode === "staff" ? "fa fa-shield" : "fa fa-compass";
    }
    if (cta) {
      cta.hidden = mode === "staff" && loggedIn;
      cta.setAttribute("aria-hidden", cta.hidden ? "true" : "false");
    }
    try {
      g.removeAttribute("hidden");
      g.classList.remove("vc-reviews-gate--dismissed");
      if (document.body) document.body.classList.add("vc-boards-gate-open");
    } catch (_) {}
    bindBoardsGateLogin();
    return true;
  }

  /* boardsVoteSchedaLayout1: shell scheda (banner/accent/no-cine) condivisa view+vota */
  function parseListingAccent(raw) {
    var s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return ("#" + s).toLowerCase();
    return "";
  }

  function mixHex(accentHex, t, baseR, baseG, baseB) {
    var hex = parseListingAccent(accentHex);
    if (!hex) return "";
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return "";
    var tt = Math.max(0, Math.min(1, Number(t) || 0));
    var nr = Math.round(r * tt + baseR * (1 - tt));
    var ng = Math.round(g * tt + baseG * (1 - tt));
    var nb = Math.round(b * tt + baseB * (1 - tt));
    function to2(n) {
      return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    }
    return "#" + to2(nr) + to2(ng) + to2(nb);
  }

  function pageBaseFromAccent(accentHex) {
    return mixHex(accentHex, 0.12, 20, 15, 12) || "#1a120e";
  }

  function pageSoftFromAccent(accentHex) {
    return mixHex(accentHex, 0.2, 42, 32, 26) || "#3a2a20";
  }

  function applyListingPageBg(L) {
    try {
      var rootHtml = document.documentElement;
      rootHtml.classList.add(
        "vc-boards-detail-live",
        "vc-boards-listing-ui",
        "vc-boards-scheda-ui",
        "vc-boards-page-banner-bg",
        "vc-scrollcue-away",
      );
      rootHtml.classList.remove("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live");
      if (document.body) {
        document.body.classList.add(
          "vc-boards-detail-live",
          "vc-boards-listing-ui",
          "vc-boards-scheda-ui",
          "vc-boards-page-banner-bg",
          "vc-boards-page",
        );
        document.body.classList.remove("vc-page-cine-layout");
      }
      document.querySelectorAll(".vc-support-page-hero, .vc-page-cine-hero").forEach(function (pageHero) {
        try {
          pageHero.hidden = true;
          pageHero.setAttribute("hidden", "");
          pageHero.style.setProperty("display", "none", "important");
        } catch (_) {}
      });
      document.querySelectorAll(".vc-boards-chrome").forEach(function (nav) {
        try {
          nav.setAttribute("hidden", "");
          nav.style.setProperty("display", "none", "important");
        } catch (_) {}
      });
      var banner = animMediaUrl
        ? animMediaUrl((L && L.bannerUrl) || "")
        : String((L && L.bannerUrl) || "").trim();
      var customAccent = parseListingAccent((L && L.accent) || "");
      var accent = customAccent || "#d4a888";
      var base = pageBaseFromAccent(accent);
      var soft = pageSoftFromAccent(accent);
      var panel = mixHex(accent, 0.1, 22, 17, 14) || "#1c1612";
      var panel2 = mixHex(accent, 0.08, 26, 20, 16) || "#1a1510";
      var shell = mixHex(accent, 0.12, 16, 12, 10) || "#12100c";
      var line = mixHex(accent, 0.42, 90, 69, 54) || accent;
      var targets = [rootHtml];
      if (document.body) targets.push(document.body);
      rootHtml.classList.add("vc-boards-has-accent");
      if (document.body) document.body.classList.add("vc-boards-has-accent");
      targets.forEach(function (el) {
        el.style.setProperty("--vc-boards-page-accent", accent);
        el.style.setProperty("--vc-boards-page-base", base);
        el.style.setProperty("--bc-accent", accent);
        el.style.setProperty("--bc-accent-soft", soft);
        el.style.setProperty("--bc-panel", panel);
        el.style.setProperty("--bc-panel-2", panel2);
        el.style.setProperty("--bc-shell", shell);
        el.style.setProperty("--bc-line", line);
        el.style.setProperty(
          "--bc-shell-fill",
          "linear-gradient(175deg," +
            (mixHex(accent, 0.14, 23, 19, 15) || soft) +
            " 0%," +
            base +
            " 58%," +
            (mixHex(accent, 0.08, 14, 10, 8) || base) +
            " 100%)",
        );
        el.style.setProperty(
          "--bc-edge",
          "linear-gradient(135deg," +
            (mixHex(accent, 0.4, 247, 236, 223) || accent) +
            " 0%," +
            accent +
            " 45%," +
            (mixHex(accent, 0.35, 40, 24, 16) || base) +
            " 100%)",
        );
      });
      try {
        var rid = "vc-boards-page-bg-runtime";
        var runtime = document.getElementById(rid);
        if (!runtime) {
          runtime = document.createElement("style");
          runtime.id = rid;
          document.head.appendChild(runtime);
        }
        runtime.textContent =
          "html.vc-boards-page-banner-bg body.vc-boards-page," +
          "html.vc-boards-page-banner-bg.vc-site-polish body.vc-body.vc-boards-page," +
          'html.vc-site-polish[data-vc-theme="light"].vc-boards-page-banner-bg body.vc-body.vc-boards-page,' +
          'html.vc-site-polish[data-vc-theme="light"].vc-boards-page-banner-bg:not(.vc-soft-fx-off) body.vc-body.vc-boards-page,' +
          'html.vc-site-polish[data-vc-theme="light"].vc-boards-page-banner-bg:not(.vc-soft-fx-off) body.vc-body.vc-boards-page#top{' +
          "background-color:" +
          base +
          "!important;background-image:none!important;background-attachment:scroll!important;" +
          "transition:none!important;transition-property:none!important;}" +
          "html.vc-boards-page-banner-bg body.vc-boards-page::before," +
          'html.vc-site-polish[data-vc-theme="light"].vc-boards-page-banner-bg body.vc-body::before,' +
          'html.vc-site-polish[data-vc-theme="light"].vc-boards-page-banner-bg:not(.vc-soft-fx-off) body.vc-body::before{' +
          "display:none!important;opacity:0!important;content:none!important;background:none!important;}";
      } catch (_) {}
      if (document.body) {
        document.body.style.position = "relative";
        try {
          document.body.style.setProperty("transition", "none", "important");
          document.body.style.setProperty("transition-property", "none", "important");
          document.body.style.setProperty("background-color", base, "important");
          document.body.style.setProperty("background-image", "none", "important");
        } catch (_) {}
      }
      if (banner) {
        rootHtml.classList.add("vc-boards-detail-live--banner", "vc-boards-page-banner-bg--has");
        rootHtml.classList.remove("vc-boards-detail-live--default", "vc-boards-page-banner-bg--none");
        rootHtml.style.setProperty(
          "--vc-boards-page-banner",
          'url("' + banner.replace(/"/g, "%22") + '")',
        );
      } else {
        rootHtml.classList.add("vc-boards-detail-live--default", "vc-boards-page-banner-bg--none");
        rootHtml.classList.remove("vc-boards-detail-live--banner", "vc-boards-page-banner-bg--has");
        rootHtml.style.removeProperty("--vc-boards-page-banner");
      }
      var layer = document.getElementById("vc-boards-page-bg");
      if (!layer && document.body) {
        layer = document.createElement("div");
        layer.id = "vc-boards-page-bg";
        layer.className = "vc-boards-page-bg";
        layer.setAttribute("aria-hidden", "true");
        document.body.insertBefore(layer, document.body.firstChild);
      }
      if (layer) {
        layer.innerHTML =
          '<div class="vc-boards-page-bg__banner"' +
          (banner ? ' style="background-image:url(' + esc(banner) + ')"' : "") +
          '></div><div class="vc-boards-page-bg__fade" aria-hidden="true"></div>';
      }
      document.querySelectorAll(".vc-home-scrollcue, .vc-home-cine, .vc-blob").forEach(function (el) {
        try {
          el.remove();
        } catch (_) {
          try {
            el.style.setProperty("display", "none", "important");
          } catch (__) {}
        }
      });
    } catch (_) {}
  }

  global.VcBoards = {
    api: api,
    peekCachedGet: peekCachedGet,
    token: token,
    esc: esc,
    formatDescHtml: formatDescHtml,
    listingUrl: listingUrl,
    listingKindKey: listingKindKey,
    kindLabel: kindLabel,
    statusLabel: statusLabel,
    cardHtml: cardHtml,
    exploreFilterUrl: exploreFilterUrl,
    filterChipHtml: filterChipHtml,
    navHtml: navHtml,
    installBoardsHeaderNav: installBoardsHeaderNav,
    kindChromeHtml: kindChromeHtml,
    fmtNum: fmtNum,
    animMediaUrl: animMediaUrl,
    toastMsg: toastMsg,
    markContentReady: markContentReady,
    showBoardsGate: showBoardsGate,
    dismissBoardsGate: dismissBoardsGate,
    bindBoardsGateLogin: bindBoardsGateLogin,
    triggerDiscordLogin: triggerDiscordLogin,
    applyListingPageBg: applyListingPageBg,
    parseListingAccent: parseListingAccent,
    base: BASE,
  };
})(typeof window !== "undefined" ? window : globalThis);
/* boardsAnimIcon1 */
/* boardsAnimIcon2 */
/* boardsLoginGate1 */
/* boardsExploreChipFilter1 */
/* schedaBootCue1 */
