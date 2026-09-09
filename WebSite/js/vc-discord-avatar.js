(function () {
  "use strict";
  
  var APPLIED = "vcAvatarAnimApplied";
  var STATIC_OPT = "vcAvatarStatic";
  var AVATAR_CLASS_RE = /(^|[-_])avatar($|[-_])|avatar/i;

  function wantsMotion() {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    } catch (e) {}
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

  function buildFromParts(userId, avatarHash, size) {
    var id = String(userId || "").trim();
    var hash = String(avatarHash || "").trim();
    if (!id || !hash) return "";
    var ext = /^a_/i.test(hash) ? "gif" : "png";
    var n = Number(size) || 128;
    return "https://cdn.discordapp.com/avatars/" + id + "/" + hash + "." + ext + "?size=" + n;
  }

  function buildGuildFromParts(guildId, userId, avatarHash, size) {
    var gid = String(guildId || "").trim();
    var id = String(userId || "").trim();
    var hash = String(avatarHash || "").trim();
    if (!gid || !id || !hash) return "";
    var ext = /^a_/i.test(hash) ? "gif" : "png";
    var n = Number(size) || 128;
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
    if (sanitizeCdnAvatarUrl(cur) && img.naturalWidth > 0) {
      try {
        img.classList.add("vc-avatar", "vc-avatar--ready");
        img.classList.remove("vc-avatar--pending", "vc-avatar-fallback-img");
        img.dataset.vcAvatarOk = "1";
        img.removeAttribute("data-vc-avatar-fallback");
      } catch (eOk) {}
      return false;
    }
    if (sanitizeCdnAvatarUrl(cur) && !img.classList.contains("vc-avatar--pending")) {
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
    var size = Math.max(16, Number(a.size || a.width || a.height || 40) || 40);
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
      size +
      '" height="' +
      size +
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
      // avatarKeepAnim1: GIF sempre (anche mobile). Solo reduced-motion / save-data → static.
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      if (navigator.connection && navigator.connection.saveData) return true;
    } catch (eStatic) {}
    return false;
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
      // guildFirstIdentity1: mai ricostruire URL utente da hash profilo su avatar server
      if (guildPath) {
        if (!/^a_/i.test(pathHash)) return raw;
        parsed.pathname = path.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
        if (size > 0) {
          if (/[?&]size=\d+/i.test(parsed.search)) {
            parsed.search = parsed.search.replace(/([?&]size=)\d+/i, "$1" + size);
          } else {
            parsed.search += (parsed.search ? "&" : "?") + "size=" + size;
          }
        }
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
      if (size > 0) {
        if (/[?&]size=\d+/i.test(parsed.search)) {
          parsed.search = parsed.search.replace(/([?&]size=)\d+/i, "$1" + size);
        } else {
          parsed.search += (parsed.search ? "&" : "?") + "size=" + size;
        }
      }
      return parsed.toString();
    } catch (e2) {
      if (/\/embed\/avatars\//i.test(raw)) return raw;
      if (isGuildMemberAvatarPath(raw)) {
        if (!/\/a_[^/?#]+\./i.test(raw)) return raw;
        var outG = raw.replace(/\.(png|webp|jpg|jpeg)(\?|#|$)/i, ".gif$2");
        if (size > 0 && !/[?&]size=\d+/i.test(outG)) {
          outG += (outG.indexOf("?") >= 0 ? "&" : "?") + "size=" + size;
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
        out += (out.indexOf("?") >= 0 ? "&" : "?") + "size=" + size;
      }
      return out;
    }
  }

  function resolveUrl(url, size, avatarHash, userId) {
    var raw = String(url || "").trim();
    var hash = String(avatarHash || "").trim();
    var uid = String(userId || userIdFromDiscordAvatarUrl(raw) || "").trim();
    if (!raw && hash && uid) return buildFromParts(uid, hash, size);
    if (!raw) return "";
    if (isGuildMemberAvatarPath(raw)) {
      return preferAnimatedUrl(raw, size, "") || raw;
    }
    var next = preferAnimatedUrl(raw, size, hash);
    return next || raw;
  }

  function preferStaticUrl(url, size) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      var parsed = new URL(raw);
      if (!isDiscordCdnHost(parsed.hostname)) return raw;
      parsed.pathname = String(parsed.pathname || "").replace(/\.(gif|webp|jpg|jpeg)(\?|$)/i, ".png$2");
      if (size > 0) {
        if (/[?&]size=\d+/i.test(parsed.search)) {
          parsed.search = parsed.search.replace(/([?&]size=)\d+/i, "$1" + size);
        } else {
          parsed.search += (parsed.search ? "&" : "?") + "size=" + size;
        }
      }
      return parsed.toString();
    } catch (e) {
      return raw.replace(/\.(gif|webp|jpe?g)(\?|#|$)/i, ".png$2");
    }
  }

  function isAvatarImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    try {
      if (img.classList && img.classList.contains("vc-header-logo-img")) return false;
    } catch (eLogo) {}
    if (img.hasAttribute("data-vc-avatar")) return true;
    if (img.hasAttribute("data-vc-avatar-fallback")) return true;
    var cls = String(img.className || "");
    var src = String(img.getAttribute("src") || "");
    if (AVATAR_CLASS_RE.test(cls)) return true;
    if (/\brounded(-full)?\b/i.test(cls)) return true;
    if (/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(src)) return true;
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
    try {
      var paintedOk =
        img.naturalWidth > 0 &&
        (img.dataset.vcAvatarOk === "1" ||
          (img.classList && img.classList.contains("vc-avatar--ready")));
      if (paintedOk && !(opts && opts.forceAnimRestart)) {
        settleReadyOrFallback();
        return false;
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
    var next = preferAnimatedUrl(src, readSize(img), hashHint);
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

  function boot() {
    scan(document);
    if (typeof MutationObserver !== "function") return;
    var timer = 0;
    var dirty = false;
    function flush() {
      timer = 0;
      if (!dirty) return;
      dirty = false;
      try {
        scan(document);
      } catch (eSc) {}
      try {
        hydrateAllCdnAttrs(document);
      } catch (eHy) {}
    }
    var obs = new MutationObserver(function () {
      dirty = true;
      if (timer) return;
      timer = window.setTimeout(flush, 40);
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "class", "data-vc-avatar-cdn-url", "data-vc-avatar"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
