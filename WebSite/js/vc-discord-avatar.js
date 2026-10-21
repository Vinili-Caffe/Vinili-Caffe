(function () {
  "use strict";
  
  var APPLIED = "vcAvatarAnimApplied";
  var STATIC_OPT = "vcAvatarStatic";
  var AVATAR_CLASS_RE = /(^|[-_])avatar($|[-_])|avatar/i;

  function wantsMotion() {
    /* navGifKeepMotion1: a_* GIF restano vive — reduce-motion non demote avatar Discord */
    try {
      if (navigator.connection && navigator.connection.saveData) return false;
    } catch (eSd) {}
    return true;
  }

  function isDiscordCdnHost(hostname) {
    return /(^|\.)discord(app)?\.(com|net)$/i.test(String(hostname || ""));
  }

  function hashFromDiscordAvatarPath(pathname) {
    var base = String(pathname || "").split("/").pop() || "";
    return base.replace(/\.[a-z0-9]+$/i, "");
  }

  function isAnimatedDiscordAvatarUrl(url) {
    var u = String(url || "").trim();
    if (!u) return false;
    try {
      var parsed = new URL(u);
      if (!isDiscordCdnHost(parsed.hostname)) return false;
      return /^a_/i.test(hashFromDiscordAvatarPath(parsed.pathname));
    } catch (e) {
      return /\/a_[^/?#]+\./i.test(u);
    }
  }

  function userIdFromDiscordAvatarUrl(url) {
    var u = String(url || "").trim();
    var match = u.match(/\/avatars\/(\d{5,24})\//) || u.match(/\/guilds\/\d+\/users\/(\d{5,24})\//);
    return match ? match[1] : "";
  }

  function isGuildMemberAvatarPath(pathnameOrUrl) {
    return /\/guilds\/\d+\/users\/\d+\/avatars\//i.test(String(pathnameOrUrl || ""));
  }

  /* boardsAnimIcon2: icone/banner guild Discord (a_*) sono media animabili, non avatar utente */
  /* reactEmojiNoAvatar1: /emojis/ID.webp (no slash dopo id) — prima il /\d+\/ non matchava
     e le custom emoji finivano in avatar circle+cover (reaction/picker ritagliate). */
  function isGuildIconOrBannerPath(pathnameOrUrl) {
    return /\/(?:icons|banners|app-icons|role-icons|emojis)\/\d+/i.test(String(pathnameOrUrl || ""));
  }

  /* avatarCdnSize1: Discord CDN accetta solo potenze di 2 (16…4096).
     size=34/38 dal menu → 400 Bad Request. Round-up al valido successivo. */
  var CDN_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
  function cdnSize(size) {
    var n = Math.max(1, Math.floor(Number(size) || 128));
    for (var i = 0; i < CDN_SIZES.length; i += 1) {
      if (n <= CDN_SIZES[i]) return CDN_SIZES[i];
    }
    return 4096;
  }
  function setUrlCdnSize(parsedOrSearch, size) {
    var n = cdnSize(size);
    if (parsedOrSearch && typeof parsedOrSearch === "object" && "search" in parsedOrSearch) {
      var parsed = parsedOrSearch;
      if (/[?&]size=\d+/i.test(parsed.search)) {
        parsed.search = parsed.search.replace(/([?&]size=)\d+/i, "$1" + n);
      } else {
        parsed.search += (parsed.search ? "&" : "?") + "size=" + n;
      }
      return n;
    }
    return n;
  }

  function buildFromParts(userId, avatarHash, size) {
    var id = String(userId || "").trim();
    var hash = String(avatarHash || "").trim();
    if (!id || !hash) return "";
    var ext = /^a_/i.test(hash) ? "gif" : "png";
    var n = cdnSize(size);
    return "https://cdn.discordapp.com/avatars/" + id + "/" + hash + "." + ext + "?size=" + n;
  }

  function buildGuildFromParts(guildId, userId, avatarHash, size) {
    var gid = String(guildId || "").trim();
    var id = String(userId || "").trim();
    var hash = String(avatarHash || "").trim();
    if (!gid || !id || !hash) return "";
    var ext = /^a_/i.test(hash) ? "gif" : "png";
    var n = cdnSize(size);
    return (
      "https://cdn.discordapp.com/guilds/" +
      gid +
      "/users/" +
      id +
      "/avatars/" +
      hash +
      "." +
      ext +
      "?size=" +
      n
    );
  }

  function defaultEmbedIndex(userId) {
    var id = String(userId || "").trim();
    if (/^\d{5,24}$/.test(id)) {
      try {
        if (typeof BigInt !== "undefined") return Number((BigInt(id) >> 22n) % 6n);
      } catch (eIdx) {}
    }
    var n = 0;
    for (var i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i)) % 6;
    return n;
  }

  /** @deprecated Prefer siteFallbackAvatarUrl — Discord embed defaults are banned on the site. */
  function defaultEmbedAvatarUrl(userId, size) {
    return siteFallbackAvatarUrl();
  }

  function isDiscordEmbedDefaultUrl(url) {
    return /cdn\.discordapp\.com\/embed\/avatars\//i.test(String(url || ""));
  }

  /** Site-themed silhouette (coffee gradient) — unique fallback for missing/broken avatars. */
  function siteFallbackAvatarUrl() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcCoffeeAv" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcCoffeeAv)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function isCoffeeFallbackUrl(url) {
    var u = String(url || "").trim();
    return !u || /^data:image\/svg\+xml/i.test(u);
  }

  function sanitizeCdnAvatarUrl(url) {
    var src = String(url || "").trim();
    if (!src || isDiscordEmbedDefaultUrl(src) || isCoffeeFallbackUrl(src)) return "";
    if (!/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(src)) return "";
    /* violKill4: riscrivi SEMPRE size non-potenza-di-2 (size=34 → 400) */
    try {
      var m = src.match(/[?&]size=(\d+)/i);
      if (m) {
        var want = cdnSize(m[1]);
        if (String(want) !== String(m[1])) {
          src = src.replace(/([?&]size=)\d+/i, "$1" + want);
        }
      }
    } catch (eSz) {}
    return src;
  }

  /**
   * avatarSilhouette1: paint coffee silhouette first; hydrate CDN only after preload OK.
   * Avoids empty pending flash and Discord embed default flash.
   */
  function hydrateCdnFromAttr(img) {
    if (!img || img.tagName !== "IMG") return false;
    var cdn = sanitizeCdnAvatarUrl(img.getAttribute("data-vc-avatar-cdn-url"));
    if (!cdn) {
      try {
        img.removeAttribute("data-vc-avatar-cdn-url");
      } catch (eRm) {}
      return false;
    }
    /* avatarReal1: metti subito il CDN come src (silhouette CSS sotto se pending). */
    try {
      img.removeAttribute("srcset");
      img.src = cdn;
      img.setAttribute("src", cdn);
      img.removeAttribute("data-vc-avatar-cdn-url");
      img.removeAttribute("data-vc-avatar-fallback");
      img.classList.add("vc-avatar", "vc-avatar--pending");
      img.classList.remove("vc-avatar-fallback-img", "vc-avatar--ready");
      delete img.dataset.vcAvatarFallbackFinal;
      delete img.dataset.vcAvatarHydrating;
    } catch (eSet) {}
    return true;
  }

  function paintSilhouette(img, keepCdnAttr) {
    if (!img || img.tagName !== "IMG") return;
    var coffee = siteFallbackAvatarUrl();
    var cur = String(img.getAttribute("src") || "").trim();
    if (!keepCdnAttr) {
      try {
        img.removeAttribute("data-vc-avatar-cdn-url");
      } catch (eK) {}
    }
    if (cur !== coffee) {
      img.removeAttribute("srcset");
      img.src = coffee;
      img.setAttribute("src", coffee);
    }
    try {
      img.classList.add("vc-avatar", "vc-avatar--ready", "vc-avatar-fallback-img");
      img.classList.remove("vc-avatar--pending");
      img.setAttribute("data-vc-avatar", "1");
      img.setAttribute("data-vc-avatar-fallback", "1");
      img.dataset.vcAvatarOk = "1";
      if (keepCdnAttr) {
        try {
          delete img.dataset.vcAvatarFallbackFinal;
        } catch (eF) {}
      } else {
        img.dataset.vcAvatarFallbackFinal = "1";
      }
    } catch (eP) {}
  }

  /** Normalize avatar img: empty/embed → silhouette; legacy cdn-url → hydrate; never replace a good CDN. */
  function ensureSilhouetteFirst(img) {
    if (!isAvatarImage(img)) return false;
    try {
      if (img.classList && img.classList.contains("vc-header-logo-img")) return false;
    } catch (eL) {}
    var cur = String(img.getAttribute("src") || "").trim();
    var existingCdn = sanitizeCdnAvatarUrl(img.getAttribute("data-vc-avatar-cdn-url"));
    /* Already showing a real Discord avatar — leave it. */
    // Already showing a real Discord avatar — leave it (no class thrash → no MO loop).
    if (sanitizeCdnAvatarUrl(cur) && img.naturalWidth > 0) {
      try {
        if (!img.classList.contains("vc-avatar--ready") || img.classList.contains("vc-avatar--pending")) {
          img.classList.add("vc-avatar", "vc-avatar--ready");
          img.classList.remove("vc-avatar--pending", "vc-avatar-fallback-img");
          img.dataset.vcAvatarOk = "1";
          img.removeAttribute("data-vc-avatar-fallback");
        }
      } catch (eOk) {}
      return false;
    }
    if (sanitizeCdnAvatarUrl(cur) && !img.classList.contains("vc-avatar--pending") && !img.classList.contains("vc-avatar--ready")) {
      /* CDN in src, still loading — keep CDN, don't demote to coffee. */
      try {
        img.classList.add("vc-avatar", "vc-avatar--pending");
      } catch (eP) {}
      return false;
    }
    if (isDiscordEmbedDefaultUrl(cur) || !cur) {
      if (existingCdn) {
        img.removeAttribute("srcset");
        img.src = existingCdn;
        img.setAttribute("src", existingCdn);
        img.classList.add("vc-avatar", "vc-avatar--pending");
        img.classList.remove("vc-avatar-fallback-img");
        img.removeAttribute("data-vc-avatar-fallback");
        return true;
      }
      paintSilhouette(img, false);
      return true;
    }
    if (existingCdn && (isCoffeeFallbackUrl(cur) || img.getAttribute("data-vc-avatar-fallback") === "1")) {
      /* Legacy markup: coffee + cdn-url → swap to CDN src. */
      img.removeAttribute("srcset");
      img.src = existingCdn;
      img.setAttribute("src", existingCdn);
      img.classList.add("vc-avatar", "vc-avatar--pending");
      img.classList.remove("vc-avatar-fallback-img", "vc-avatar--ready");
      img.removeAttribute("data-vc-avatar-fallback");
      img.removeAttribute("data-vc-avatar-cdn-url");
      return true;
    }
    return false;
  }

  function hydrateAllCdnAttrs(root) {
    var base = root && root.querySelectorAll ? root : document;
    var imgs = base.querySelectorAll("img[data-vc-avatar-cdn-url]");
    for (var i = 0; i < imgs.length; i += 1) {
      try {
        ensureSilhouetteFirst(imgs[i]);
      } catch (e1) {}
      try {
        hydrateCdnFromAttr(imgs[i]);
      } catch (e2) {}
    }
  }

  function buildFromUser(user, size) {
    if (!user || !user.id) return siteFallbackAvatarUrl();
    if (user.avatar) return buildFromParts(user.id, user.avatar, size);
    return siteFallbackAvatarUrl();
  }

  function escAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * avatarReal1: se c'è CDN → src CDN (pending + bg silhouette CSS anti-flash).
   * Silhouette solo se manca l'avatar. Hydrate resta per markup legacy con data-vc-avatar-cdn-url.
   */
  function imgHtml(opts) {
    var a = opts && typeof opts === "object" ? opts : {};
    var uid = String(a.userId || a.id || "").trim();
    var displayPx = Math.max(16, Number(a.width || a.height || a.size || 40) || 40);
    var size = cdnSize(a.size != null ? a.size : displayPx);
    var cls = String(a.className || a.class || "vc-avatar").trim() || "vc-avatar";
    if (!/\bvc-avatar\b/.test(cls)) cls += " vc-avatar";
    var loading = a.loading != null ? String(a.loading) : "lazy";
    var fetchPriority = a.fetchPriority ? String(a.fetchPriority) : "";
    var alt = a.alt != null ? String(a.alt) : "";
    var src = pickAvatarUrl(
      {
        id: uid,
        userId: uid,
        avatar: a.avatarHash || a.avatar || a.hash || "",
        memberAvatar: a.memberAvatar || a.guildAvatar || "",
        guildId: a.guildId || "",
        avatarUrl: a.url || a.avatarUrl || "",
        guildAvatarUrl: a.guildAvatarUrl || a.memberAvatarUrl || "",
      },
      size,
    );
    var cdn = sanitizeCdnAvatarUrl(src);
    if (cdn) {
      var isGuild = isGuildMemberAvatarPath(cdn);
      var hashHint = String(a.avatarHash || a.avatar || a.hash || "").trim();
      if (!hashHint && !isGuild) {
        try {
          var m = cdn.match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)/i);
          if (m) hashHint = String(m[1] || "").trim();
        } catch (eHash) {}
      }
      try {
        if (a.staticAvatar) cdn = preferStaticUrl(cdn, size) || cdn;
        else cdn = resolveUrl(cdn, size, isGuild ? "" : hashHint, uid) || cdn;
      } catch (eRes) {}
      cdn = sanitizeCdnAvatarUrl(cdn);
    }
    var coffee = siteFallbackAvatarUrl();
    var outSrc = cdn || coffee;
    var isGuildOut = cdn ? isGuildMemberAvatarPath(cdn) : false;
    var hashOut = String(a.avatarHash || a.avatar || a.hash || "").trim();
    if (!hashOut && cdn && !isGuildOut) {
      try {
        var m2 = cdn.match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)/i);
        if (m2) hashOut = String(m2[1] || "").trim();
      } catch (eH2) {}
    }
    cls = cls.replace(/\bvc-avatar--pending\b/g, " ").replace(/\bvc-avatar--ready\b/g, " ").replace(/\bvc-avatar-fallback-img\b/g, " ").replace(/\s+/g, " ").trim();
    if (cdn) cls += " vc-avatar--pending";
    else cls += " vc-avatar--ready vc-avatar-fallback-img";
    return (
      '<img class="' +
      escAttr(cls) +
      '" src="' +
      escAttr(outSrc) +
      '" alt="' +
      escAttr(alt) +
      '" width="' +
      displayPx +
      '" height="' +
      displayPx +
      '" loading="' +
      escAttr(loading) +
      '" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (cdn ? "" : ' data-vc-avatar-fallback="1"') +
      (fetchPriority ? ' fetchpriority="' + escAttr(fetchPriority) + '"' : "") +
      (uid ? ' data-user-id="' + escAttr(uid) + '"' : "") +
      (!isGuildOut && hashOut ? ' data-avatar-hash="' + escAttr(hashOut) + '"' : "") +
      (isGuildOut ? ' data-vc-guild-avatar="1"' : "") +
      (a.staticAvatar ? ' data-vc-avatar-static="1"' : "") +
      " />"
    );
  }

  function pickDisplayName(src, fallback) {
    var o = src && typeof src === "object" ? src : null;
    var candidates = o
      ? [
          o.displayName,
          o.nick,
          o.nickname,
          o.global_name,
          o.globalName,
          o.username,
          o.name,
        ]
      : [];
    for (var i = 0; i < candidates.length; i += 1) {
      var s = String(candidates[i] || "")
        .replace(/^\u0F04/u, "")
        .replace(/^༄/u, "")
        .trim();
      if (s) return s;
    }
    var fb = String(fallback || "").trim();
    return fb || "Utente";
  }

  function pickAvatarUrl(src, size) {
    var o = src && typeof src === "object" ? src : null;
    if (!o) return "";
    var n = Number(size) || 128;
    var guildUrl = String(o.guildAvatarUrl || o.memberAvatarUrl || "").trim();
    var apiUrl = String(o.avatarUrl || o.ownerAvatarUrl || "").trim();
    var prefer = "";
    if (isGuildMemberAvatarPath(guildUrl)) prefer = guildUrl;
    else if (isGuildMemberAvatarPath(apiUrl)) prefer = apiUrl;
    else if (/^https?:\/\//i.test(guildUrl) && !isDiscordEmbedDefaultUrl(guildUrl)) prefer = guildUrl;
    else if (/^https?:\/\//i.test(apiUrl) && !isDiscordEmbedDefaultUrl(apiUrl)) prefer = apiUrl;
    var memberHash = String(o.memberAvatar || o.guildAvatar || o.memberAvatarHash || "").trim();
    var userHash = String(o.avatar || o.ownerAvatar || "").trim();
    var uid = String(o.userId || o.id || o.ownerId || "").trim();
    var gid = String(o.guildId || "").trim();
    if (!prefer && gid && uid && memberHash) prefer = buildGuildFromParts(gid, uid, memberHash, n);
    if (prefer) {
      var hashForUrl = isGuildMemberAvatarPath(prefer) ? memberHash || hashFromDiscordAvatarPath(prefer) : userHash;
      return resolveUrl(prefer, n, hashForUrl, uid) || prefer;
    }
    if (uid && userHash) return buildFromParts(uid, userHash, n);
    return buildFromUser(o, n);
  }

  function prefersStaticAvatars() {
    try {
      // cpuHoverIdle1: GIF solo durante hover (flag temporaneo)
      if (window.__vcAvatarHoverAnim === 1) return false;
    } catch (eHov) {}
    try {
      if (navigator.connection && navigator.connection.saveData) return true;
    } catch (eStatic) {}
    // cpuHoverIdle1: default static ovunque (CPU); animate on hover
    return true;
  }

  function preferAnimatedUrl(url, size, avatarHash) {
    var raw = String(url || "").trim();
    if (!raw || !wantsMotion()) return raw;
    if (prefersStaticAvatars()) {
      return preferStaticUrl(raw, size) || raw;
    }
    // Default Discord embed avatars are not animatable — never rewrite to .gif.
    if (/\/embed\/avatars\//i.test(raw)) return raw;
    var hashHint = String(avatarHash || "").trim();
    try {
      var parsed = new URL(raw);
      if (!isDiscordCdnHost(parsed.hostname)) return raw;
      var path = String(parsed.pathname || "");
      if (/\/embed\/avatars\//i.test(path)) return raw;
      var pathHash = hashFromDiscordAvatarPath(path);
      var guildPath = isGuildMemberAvatarPath(path);
      var guildMediaPath = isGuildIconOrBannerPath(path);
      // guildFirstIdentity1: mai ricostruire URL utente da hash profilo su avatar server
      // boardsAnimIcon2: anche /icons/ e /banners/ a_* → .gif
      if (guildPath || guildMediaPath) {
        if (size > 0) setUrlCdnSize(parsed, size);
        else {
          try {
            var sm = String(parsed.search || "").match(/[?&]size=(\d+)/i);
            if (sm) setUrlCdnSize(parsed, Number(sm[1]) || 64);
          } catch (eSm) {}
        }
        if (!/^a_/i.test(pathHash)) return parsed.toString();
        parsed.pathname = path.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
        return parsed.toString();
      }
      // Only upgrade real user/guild avatar paths — never rebuild from embed using hashHint.
      if (!/\/avatars\/\d{5,24}\//i.test(path) && !guildPath) return raw;
      var animated = /^a_/i.test(pathHash) || /^a_/i.test(hashHint);
      if (!animated) return raw;
      if (!/^a_/i.test(pathHash) && hashHint && /^a_/i.test(hashHint)) {
        var uid = userIdFromDiscordAvatarUrl(raw) || "";
        if (uid) return buildFromParts(uid, hashHint, size);
      }
      parsed.pathname = path.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
      if (size > 0) setUrlCdnSize(parsed, size);
      return parsed.toString();
    } catch (e2) {
      if (/\/embed\/avatars\//i.test(raw)) return raw;
      if (isGuildMemberAvatarPath(raw)) {
        if (!/\/a_[^/?#]+\./i.test(raw)) return raw;
        var outG = raw.replace(/\.(png|webp|jpg|jpeg)(\?|#|$)/i, ".gif$2");
        if (size > 0 && !/[?&]size=\d+/i.test(outG)) {
          outG += (outG.indexOf("?") >= 0 ? "&" : "?") + "size=" + cdnSize(size);
        } else if (size > 0) {
          outG = outG.replace(/([?&]size=)\d+/i, "$1" + cdnSize(size));
        }
        return outG;
      }
      if (!/\/a_[^/?#]+\./i.test(raw) && !/^a_/i.test(hashHint)) return raw;
      if (!/\/avatars\/\d{5,24}\//i.test(raw)) return raw;
      if (!/\/a_[^/?#]+\./i.test(raw) && hashHint && /^a_/i.test(hashHint)) {
        var uid2 = userIdFromDiscordAvatarUrl(raw);
        if (uid2) return buildFromParts(uid2, hashHint, size);
      }
      var out = raw.replace(/\.(png|webp|jpg|jpeg)(\?|#|$)/i, ".gif$2");
      if (size > 0 && !/[?&]size=\d+/i.test(out)) {
        out += (out.indexOf("?") >= 0 ? "&" : "?") + "size=" + cdnSize(size);
      } else if (size > 0) {
        out = out.replace(/([?&]size=)\d+/i, "$1" + cdnSize(size));
      }
      return out;
    }
  }

  function normalizeDiscordCdnSize(url, size) {
    var raw = String(url || "").trim();
    if (!raw || !(size > 0)) return raw;
    try {
      var parsed = new URL(raw);
      if (!isDiscordCdnHost(parsed.hostname)) return raw;
      setUrlCdnSize(parsed, size);
      return parsed.toString();
    } catch (eNormSz) {
      var n = cdnSize(size);
      if (/[?&]size=\d+/i.test(raw)) return raw.replace(/([?&]size=)\d+/i, "$1" + n);
      return raw + (raw.indexOf("?") >= 0 ? "&" : "?") + "size=" + n;
    }
  }

  function resolveUrl(url, size, avatarHash, userId) {
    var raw = String(url || "").trim();
    var hash = String(avatarHash || "").trim();
    var uid = String(userId || userIdFromDiscordAvatarUrl(raw) || "").trim();
    if (!raw && hash && uid) return buildFromParts(uid, hash, size);
    if (!raw) return "";
    if (isGuildMemberAvatarPath(raw)) {
      return normalizeDiscordCdnSize(preferAnimatedUrl(raw, size, "") || raw, size);
    }
    var next = preferAnimatedUrl(raw, size, hash);
    return normalizeDiscordCdnSize(next || raw, size);
  }

  function preferStaticUrl(url, size) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      var parsed = new URL(raw);
      if (!isDiscordCdnHost(parsed.hostname)) return raw;
      parsed.pathname = String(parsed.pathname || "").replace(/\.(gif|webp|jpg|jpeg)(\?|$)/i, ".png$2");
      if (size > 0) setUrlCdnSize(parsed, size);
      return parsed.toString();
    } catch (e) {
      return raw.replace(/\.(gif|webp|jpe?g)(\?|#|$)/i, ".png$2");
    }
  }

  function isAvatarImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    try {
      if (img.classList && img.classList.contains("vc-header-logo-img")) return false;
      // boardsAnimIcon2: media bacheca gestiti da VcBoards.animMediaUrl, non demote/fallback avatar
      if (
        img.classList &&
        (img.classList.contains("vc-boards-detail__icon") ||
          img.classList.contains("vc-boards-card__icon") ||
          img.classList.contains("vc-boards-mine-card__icon") ||
          img.classList.contains("vc-boards-form-hero__img") ||
          img.classList.contains("vc-boards-vote__icon") ||
          img.classList.contains("vc-boards-guild-tag__badge"))
      ) {
        return false;
      }
    } catch (eLogo) {}
    if (img.getAttribute("data-vc-anim-media") === "1") return false;
    try {
      if (img.classList && img.classList.contains("vc-perks-role-ico")) return false;
      if (img.closest && img.closest(".vc-sponsor-mention img.vc-perks-role-ico, .vc-sponsor-mention")) {
        if (/role-icons|\/emojis\//i.test(String(img.getAttribute("src") || ""))) return false;
        if (img.classList && img.classList.contains("vc-perks-role-ico")) return false;
      }
    } catch (eRoleIco) {}
    var avMark = String(img.getAttribute("data-vc-avatar") || "").trim();
    if (avMark === "0" || avMark === "false") return false;
    if (avMark) return true;
    if (img.hasAttribute("data-vc-avatar-fallback")) return true;
    var cls = String(img.className || "");
    var src = String(img.getAttribute("src") || "");
    /* reactEmojiNoAvatar1 + ticketMsgEmojiFlat1: mai emoji chat/composer come avatar */
    if (
      /\b(?:vc-wt-reaction__emoji|vc-wfc-react__emoji|vc-wt-inline-emoji|vc-discord-emoji|vc-emoji|vc-twemoji|vc-wt-composer__emoji-token)\b/i.test(
        cls,
      )
    ) {
      return false;
    }
    try {
      if (
        img.closest &&
        img.closest(
          ".vc-emoji-picker__opt, .vc-wt-reaction, .vc-wfc-react, .vc-wt-msg__reactions, .vc-wfc-reactions, .vc-wt-msg__text, .vc-wt-msg__bubble, .vc-wt-composer__input, .vc-wfc-msg__text",
        )
      ) {
        return false;
      }
    } catch (eEmoji) {}
    if (isGuildIconOrBannerPath(src)) return false;
    if (/\/(?:role-icons|emojis)\//i.test(src)) return false;
    if (AVATAR_CLASS_RE.test(cls) && !/\bvc-perks-role-ico\b/i.test(cls)) return true;
    if (/\brounded(-full)?\b/i.test(cls)) return true;
    if (
      /(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(src) &&
      !/\/(?:role-icons|emojis)\//i.test(src)
    ) {
      return true;
    }
    return false;
  }

  function readSize(img) {
    var w = Number(img.getAttribute("width") || img.width || 0);
    if (w > 0) return w;
    var data = Number(img.getAttribute("data-avatar-size") || 0);
    return data > 0 ? data : 128;
  }

  function isMarkedStatic(img) {
    if (!img) return false;
    if (img.getAttribute(STATIC_OPT) === "1") return true;
    if (img.getAttribute("data-vc-avatar-static") === "1") return true;
    if (img.dataset && img.dataset.vcAvatarStatic === "1") return true;
    return false;
  }

  function applyToImage(img, opts) {
    if (!isAvatarImage(img)) return false;

    // avatarSiteFb1: demote Discord embed defaults → site silhouette (no mixed fallbacks).
    try {
      var curEmbed = String(img.getAttribute("src") || img.src || "").trim();
      if (isDiscordEmbedDefaultUrl(curEmbed)) {
        var siteSrc = siteFallbackAvatarUrl();
        if (curEmbed !== siteSrc) {
          img.removeAttribute("srcset");
          img.src = siteSrc;
          img.setAttribute("src", siteSrc);
          try {
            img.classList.add("vc-avatar", "vc-avatar--ready", "vc-avatar-fallback-img");
            img.classList.remove("vc-avatar--pending");
            img.dataset.vcAvatarOk = "1";
            img.dataset.vcAvatarFallbackFinal = "1";
          } catch (eEmbCls) {}
        }
      }
    } catch (eEmb) {}

    function settleReadyOrFallback() {
      try {
        img.classList.add("vc-avatar");
        if (img.complete && img.naturalWidth > 0) {
          img.classList.add("vc-avatar--ready");
          img.classList.remove("vc-avatar--pending");
          if (window.VcAvatarFallback && typeof window.VcAvatarFallback.markReady === "function") {
            window.VcAvatarFallback.markReady(img);
          }
          return;
        }
        if (img.complete && img.naturalWidth === 0 && String(img.getAttribute("src") || "").trim()) {
          if (window.VcAvatarFallback && typeof window.VcAvatarFallback.applyFallback === "function") {
            window.VcAvatarFallback.applyFallback(img);
          }
          return;
        }
        // inboxAvatarPending1: se non ancora complete, non lasciare opacity:0 forever
        if (!img.dataset.vcAvatarReadyBound) {
          img.dataset.vcAvatarReadyBound = "1";
          var onLoad = function () {
            try {
              img.removeEventListener("load", onLoad);
              img.removeEventListener("error", onErr);
            } catch (eRm) {}
            settleReadyOrFallback();
          };
          var onErr = function () {
            try {
              img.removeEventListener("load", onLoad);
              img.removeEventListener("error", onErr);
            } catch (eRm2) {}
            if (window.VcAvatarFallback && typeof window.VcAvatarFallback.applyFallback === "function") {
              window.VcAvatarFallback.applyFallback(img);
            } else {
              img.classList.remove("vc-avatar--pending");
              img.classList.add("vc-avatar--ready");
            }
          };
          img.addEventListener("load", onLoad);
          img.addEventListener("error", onErr);
        }
      } catch (eSettle) {}
    }

    // phoneAvatarFix1: su telefono resta PNG (niente GIF forzate).
    if (isMarkedStatic(img)) {
      settleReadyOrFallback();
      return false;
    }
    // Never fight the fallback chain (PNG → embed → svg) or re-animate demoted avatars.
    try {
      if (
        img.dataset.vcAvatarFallbackFinal === "1" ||
        img.dataset.vcAvatarFallbackApplied === "1" ||
        img.dataset.vcAvatarFallbackApplied === "2" ||
        img.dataset.vcAvatarFallbackApplied === "3" ||
        img.getAttribute("data-vc-avatar-fallback") === "1"
      ) {
        settleReadyOrFallback();
        return false;
      }
    } catch (eFb) {}

    // avatarKeepAnim1: se già paintato OK (GIF/PNG), non riscrivere src (evita flash→demote embed).
    // forceAnimRestart resta consentito per ripartire la GIF.
    // navBrandAnimEverywhere1: se hash a_* ma src ancora .png (navbar soft) → upgrade.
    try {
      var paintedOk =
        img.naturalWidth > 0 &&
        (img.dataset.vcAvatarOk === "1" ||
          (img.classList && img.classList.contains("vc-avatar--ready")));
      if (paintedOk && !(opts && opts.forceAnimRestart)) {
        var curPaint = String(img.getAttribute("src") || img.src || "");
        var hashPaint = String(img.getAttribute("data-avatar-hash") || "").trim();
        var needsGifUpgrade =
          !prefersStaticAvatars() &&
          wantsMotion() &&
          /^a_/i.test(hashPaint) &&
          /\.png(?:$|[?#])/i.test(curPaint) &&
          !/\/embed\/avatars\//i.test(curPaint);
        if (!needsGifUpgrade) {
          settleReadyOrFallback();
          return false;
        }
      }
    } catch (ePaint) {}

    var force = opts && opts.force;
    if (!force && img.dataset[APPLIED] === "1") {
      settleReadyOrFallback();
      return false;
    }

    var src = String(img.getAttribute("src") || "").trim();
    if (!src || src.indexOf("data:") === 0) {
      settleReadyOrFallback();
      return false;
    }

    // avatarReadyWatch1: embed / skip path must still clear pending
    if (/\/embed\/avatars\//i.test(src)) {
      settleReadyOrFallback();
      return false;
    }

    var hashHint = String(img.getAttribute("data-avatar-hash") || "").trim();
    if (isGuildMemberAvatarPath(src) || img.getAttribute("data-vc-guild-avatar") === "1") {
      hashHint = "";
    }
    var sz = readSize(img);
    var next = normalizeDiscordCdnSize(preferAnimatedUrl(src, sz, hashHint) || src, sz);
    if (!next || next === src) {
      if (isAnimatedDiscordAvatarUrl(src)) img.dataset[APPLIED] = "1";
      settleReadyOrFallback();
      return false;
    }

    img.dataset[APPLIED] = "1";
    img.removeAttribute("srcset");
    try {
      img.classList.add("vc-avatar");
      img.classList.add("vc-avatar--pending");
      img.classList.remove("vc-avatar--ready");
    } catch (ePend) {}
    img.src = next;
    // Se il browser ha già la GIF in cache, load potrebbe non rifire
    settleReadyOrFallback();
    return true;
  }

  function restartAnimation(img) {
    if (!img || img.tagName !== "IMG") return false;
    var src = String(img.currentSrc || img.getAttribute("src") || img.src || "").trim();
    if (!src) return false;
    applyToImage(img, { force: true, forceAnimRestart: true });
    src = String(img.currentSrc || img.getAttribute("src") || img.src || "").trim();
    if (!/\.gif(?:$|[?#])/i.test(src)) return false;
    // Evita src="" (su mobile triggera fallback/error e fa sparire l'avatar).
    var bust = src.replace(/([?&])_vcgif=\d+/i, "$1").replace(/[?&]$/, "");
    bust += (bust.indexOf("?") >= 0 ? "&" : "?") + "_vcgif=" + String(Date.now());
    img.dataset[APPLIED] = "1";
    img.removeAttribute("srcset");
    img.src = bust;
    return true;
  }

  function scan(root) {
    var base = root && root.querySelectorAll ? root : document;
    var imgs = base.querySelectorAll ? base.querySelectorAll("img") : [];
    var n = 0;
    for (var i = 0; i < imgs.length; i += 1) {
      try {
        ensureSilhouetteFirst(imgs[i]);
      } catch (eSil) {}
      if (applyToImage(imgs[i])) n += 1;
      try {
        hydrateCdnFromAttr(imgs[i]);
      } catch (eHyd) {}
    }
    try {
      hydrateAllCdnAttrs(base);
    } catch (eAll) {}
    return n;
  }

  var api = {
    wantsMotion: wantsMotion,
    isAnimatedUrl: isAnimatedDiscordAvatarUrl,
    isGuildMemberAvatarPath: isGuildMemberAvatarPath,
    defaultEmbedIndex: defaultEmbedIndex,
    defaultEmbedAvatarUrl: defaultEmbedAvatarUrl,
    isDiscordEmbedDefaultUrl: isDiscordEmbedDefaultUrl,
    siteFallbackAvatarUrl: siteFallbackAvatarUrl,
    defaultUrl: siteFallbackAvatarUrl,
    buildFromParts: buildFromParts,
    buildGuildFromParts: buildGuildFromParts,
    buildFromUser: buildFromUser,
    pickDisplayName: pickDisplayName,
    pickAvatarUrl: pickAvatarUrl,
    resolveUrl: resolveUrl,
    preferAnimatedUrl: preferAnimatedUrl,
    preferStaticUrl: preferStaticUrl,
    escAttr: escAttr,
    cdnSize: cdnSize,
    normalizeDiscordCdnSize: normalizeDiscordCdnSize,
    imgHtml: imgHtml,
    applyToImage: applyToImage,
    restartAnimation: restartAnimation,
    scan: scan,
    hydrateCdnFromAttr: hydrateCdnFromAttr,
    hydrateAllCdnAttrs: hydrateAllCdnAttrs,
    ensureSilhouetteFirst: ensureSilhouetteFirst,
    paintSilhouette: paintSilhouette,
  };

  window.VcDiscordAvatar = api;
  window.VcDiscordIdentity = {
    pickDisplayName: pickDisplayName,
    pickAvatarUrl: pickAvatarUrl,
    isGuildMemberAvatarPath: isGuildMemberAvatarPath,
  };

  function avatarHoverTarget(node) {
    if (!node || !node.closest) return null;
    try {
      var img = node.tagName === "IMG" ? node : node.closest("img");
      if (!img) return null;
      if (!(img.classList && (img.classList.contains("discord-avatar-img") || img.classList.contains("vc-avatar") || img.getAttribute("data-vc-avatar")))) {
        if (!AVATAR_CLASS_RE.test(String(img.className || "")) && img.getAttribute("data-vc-avatar") !== "1") {
          return null;
        }
      }
      var src = String(img.getAttribute("src") || img.currentSrc || "");
      var hash = String(img.getAttribute("data-avatar-hash") || "").trim();
      var canAnim =
        /^a_/i.test(hash) ||
        /\/a_[^/?#]+\./i.test(src) ||
        /\.gif(?:$|[?#])/i.test(src) ||
        String(img.getAttribute("data-vc-avatar-gif") || "");
      if (!canAnim && !hash) {
        /* store still; may still have a_* in cdn attr */
        var cdn = String(img.getAttribute("data-vc-avatar-cdn-url") || "");
        if (!/\/a_[^/?#]+\./i.test(cdn) && !/^a_/i.test(hash)) return null;
      }
      return img;
    } catch (eT) {
      return null;
    }
  }

  function setAvatarHoverAnim(img, on) {
    if (!img) return;
    try {
      if (on) {
        if (!img.getAttribute("data-vc-avatar-still")) {
          img.setAttribute("data-vc-avatar-still", String(img.getAttribute("src") || ""));
        }
        window.__vcAvatarHoverAnim = 1;
        try {
          img.removeAttribute("data-vc-avatar-static");
          if (img.dataset) img.dataset.vcAvatarStatic = "";
        } catch (eSt) {}
        applyToImage(img, { force: true, forceAnimRestart: true });
        window.__vcAvatarHoverAnim = 0;
      } else {
        window.__vcAvatarHoverAnim = 0;
        var still = String(img.getAttribute("data-vc-avatar-still") || "");
        var cur = String(img.getAttribute("src") || "");
        var next = preferStaticUrl(cur, readSize(img)) || still || cur;
        if (still && /\.(png|webp|jpg)(?:$|[?#])/i.test(still)) next = still;
        if (next && next !== cur) {
          try {
            img.setAttribute("data-vc-avatar-static", "1");
          } catch (eMk) {}
          img.src = next;
        } else {
          try {
            img.setAttribute("data-vc-avatar-static", "1");
          } catch (eMk2) {}
          applyToImage(img, { force: true });
        }
      }
    } catch (eHover) {
      try {
        window.__vcAvatarHoverAnim = 0;
      } catch (eZ) {}
    }
  }

  function armAvatarHoverOnly() {
    if (window.__vcAvatarHoverArmed) return;
    window.__vcAvatarHoverArmed = 1;
    var curHover = null;
    function onOver(ev) {
      try {
        if (document.hidden) return;
        var img = avatarHoverTarget(ev.target);
        if (!img || img === curHover) return;
        if (curHover && curHover !== img) setAvatarHoverAnim(curHover, false);
        curHover = img;
        setAvatarHoverAnim(img, true);
      } catch (eO) {}
    }
    function onOut(ev) {
      try {
        if (!curHover) return;
        var to = ev.relatedTarget;
        if (to && curHover.contains && curHover.contains(to)) return;
        if (to && to.closest) {
          var stillOn = avatarHoverTarget(to);
          if (stillOn === curHover) return;
        }
        setAvatarHoverAnim(curHover, false);
        curHover = null;
      } catch (eX) {}
    }
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
  }

  function boot() {
    /* violPass5: niente scan(document) sync al boot — solo header/avatar noti */
    try {
      armAvatarHoverOnly();
    } catch (eArmH) {}
    try {
      var early =
        document.querySelector("header") ||
        document.getElementById("discord-login-state") ||
        document.body;
      if (early) scan(early);
    } catch (eBootScan) {}
    if (typeof MutationObserver !== "function") return;
    var timer = 0;
    var dirty = false;
    var pending = [];

    function pushRoot(node) {
      if (!node) return;
      try {
        if (node.nodeType === 1) pending.push(node);
        else if (node.nodeType === 3 && node.parentElement) pending.push(node.parentElement);
      } catch (eP) {}
    }

    function flush() {
      timer = 0;
      if (!dirty && !pending.length) return;
      dirty = false;
      var roots = pending;
      pending = [];
      if (!roots.length) {
        /* violPass4: niente scan(document) sync — riprova al prossimo mutate */
        return;
      }
      /* troppe mutazioni → sample dei primi N, non full document sync */
      if (roots.length > 24) {
        roots = roots.slice(0, 24);
      }
      /* gestisciMenuAbove1 / avatarIdleSlice1 / violPass4: budget stretto, niente idle timeout */
      var seen = typeof WeakSet === "function" ? new WeakSet() : null;
      var i = 0;
      var budget = 2;
      function step() {
        var n = 0;
        while (i < roots.length && n < budget) {
          var root = roots[i++];
          n += 1;
          if (!root || !root.isConnected) continue;
          if (seen) {
            if (seen.has(root)) continue;
            seen.add(root);
          }
          try {
            scan(root);
          } catch (eSc) {}
        }
        if (i < roots.length) {
          window.setTimeout(step, 48);
        }
      }
      window.setTimeout(step, 48); /* violKillRest1: no setTimeout(0) */
    }

    function scheduleFlush() {
      if (timer) return;
      timer = 1;
      /* violPass4 / violPass7: solo setTimeout + flush yield (era 76–104ms) */
      window.setTimeout(function () {
        timer = 0;
        window.setTimeout(function () {
          try {
            flush();
          } catch (eFl) {}
        }, 0);
      }, 280);
    }

    var obs = new MutationObserver(function (muts) {
      /* cpuStormKill1b: tab hidden → ignore (era scan continuo anche in BG) */
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid) {}
      dirty = true;
      try {
        for (var i = 0; i < muts.length; i += 1) {
          var m = muts[i];
          if (!m) continue;
          if (m.type === "attributes" && m.target) pushRoot(m.target);
          var added = m.addedNodes;
          if (added && added.length) {
            for (var j = 0; j < added.length; j += 1) pushRoot(added[j]);
          }
        }
      } catch (eM) {}
      scheduleFlush();
    });
    /* cpuStormKill1b: NO "class" — classList.add in applyToImage riaccendeva MO forever */
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "data-vc-avatar-cdn-url", "data-vc-avatar"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
/* violPass4 */
/* violPass5 */
/* violPass7 */
/* boardsAnimIcon2 */
/* navAnimMarqueeKeep1 */
