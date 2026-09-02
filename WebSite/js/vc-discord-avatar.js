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

  function buildFromParts(userId, avatarHash, size) {
    var id = String(userId || "").trim();
    var hash = String(avatarHash || "").trim();
    if (!id || !hash) return "";
    var ext = /^a_/i.test(hash) ? "gif" : "png";
    var n = Number(size) || 128;
    return "https://cdn.discordapp.com/avatars/" + id + "/" + hash + "." + ext + "?size=" + n;
  }

  function buildFromUser(user, size) {
    if (!user || !user.id) return "";
    if (user.avatar) return buildFromParts(user.id, user.avatar, size);
    try {
      if (typeof BigInt !== "undefined") {
        var idx = Number((BigInt(String(user.id)) >> 22n) % 6n);
        return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
      }
    } catch (eDef) {}
    return "";
  }

  function preferAnimatedUrl(url, size, avatarHash) {
    var raw = String(url || "").trim();
    if (!raw || !wantsMotion()) return raw;
    var hashHint = String(avatarHash || "").trim();
    try {
      var parsed = new URL(raw);
      if (!isDiscordCdnHost(parsed.hostname)) return raw;
      var path = String(parsed.pathname || "");
      var pathHash = hashFromDiscordAvatarPath(path);
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
      if (!/\/a_[^/?#]+\./i.test(raw) && !/^a_/i.test(hashHint)) return raw;
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

  function isCoarseMobile() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    return Number(navigator.maxTouchPoints || 0) > 0;
  }

  function isProfileHeroAvatar(img) {
    return /\bvc-user-profile-avatar\b/.test(String(img && img.className || ""));
  }

  function applyToImage(img, opts) {
    if (!isAvatarImage(img)) return false;
    if (img.getAttribute(STATIC_OPT) === "1") return false;
    var force = opts && opts.force;
    if (!force && img.dataset[APPLIED] === "1") return false;

    var src = String(img.getAttribute("src") || "").trim();
    if (!src || src.indexOf("data:") === 0) return false;

    var size = readSize(img);
        if (isCoarseMobile() && size <= 96) {
      img.dataset[APPLIED] = "1";
      return false;
    }
        if (isProfileHeroAvatar(img)) {
      var heroNext = preferAnimatedUrl(src, size, hashHint);
      if (heroNext && heroNext !== src) {
        img.removeAttribute("srcset");
        img.src = heroNext;
        img.dataset[APPLIED] = "1";
        return true;
      }
      img.dataset[APPLIED] = "1";
      return false;
    }

    var hashHint = String(img.getAttribute("data-avatar-hash") || "").trim();
    var next = preferAnimatedUrl(src, readSize(img), hashHint);
    if (!next || next === src) {
      if (isAnimatedDiscordAvatarUrl(src)) img.dataset[APPLIED] = "1";
      return false;
    }

    img.dataset[APPLIED] = "1";
    img.removeAttribute("srcset");
    img.src = next;
    return true;
  }

  function restartAnimation(img) {
    if (!img || img.tagName !== "IMG") return false;
    if (isProfileHeroAvatar(img)) return false;
    if (isCoarseMobile() && readSize(img) <= 96) return false;
    var src = String(img.currentSrc || img.getAttribute("src") || img.src || "").trim();
    if (!src) return false;
    applyToImage(img, { force: true });
    src = String(img.currentSrc || img.getAttribute("src") || img.src || "").trim();
    if (!/\.gif(?:$|[?#])/i.test(src)) return false;
    img.dataset[APPLIED] = "0";
    img.removeAttribute("srcset");
    img.src = "";
    void img.offsetWidth;
    img.src = src;
    img.dataset[APPLIED] = "1";
    return true;
  }

  function scan(root) {
    var base = root && root.querySelectorAll ? root : document;
    var imgs = base.querySelectorAll ? base.querySelectorAll("img") : [];
    var n = 0;
    for (var i = 0; i < imgs.length; i += 1) {
      if (applyToImage(imgs[i])) n += 1;
    }
    return n;
  }

  var api = {
    wantsMotion: wantsMotion,
    isAnimatedUrl: isAnimatedDiscordAvatarUrl,
    buildFromParts: buildFromParts,
    buildFromUser: buildFromUser,
    resolveUrl: resolveUrl,
    preferAnimatedUrl: preferAnimatedUrl,
    preferStaticUrl: preferStaticUrl,
    applyToImage: applyToImage,
    restartAnimation: restartAnimation,
    scan: scan,
  };

  window.VcDiscordAvatar = api;

  function boot() {
    scan(document);
    if (typeof MutationObserver !== "function") return;
    var timer = 0;
    var obs = new MutationObserver(function (mutations) {
      if (timer) return;
      timer = window.setTimeout(function () {
        timer = 0;
        for (var i = 0; i < mutations.length; i += 1) {
          var m = mutations[i];
          if (m.type === "attributes" && m.target && m.target.tagName === "IMG") {
            applyToImage(m.target, { force: true });
            continue;
          }
          for (var j = 0; j < (m.addedNodes || []).length; j += 1) {
            var node = m.addedNodes[j];
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === "IMG") applyToImage(node);
            else scan(node);
          }
        }
      }, 48);
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
