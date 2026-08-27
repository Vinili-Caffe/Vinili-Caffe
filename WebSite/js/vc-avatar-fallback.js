(function () {
  "use strict";

  var FALLBACK_MARK = "vcAvatarFallbackApplied";
  var FINAL_MARK = "vcAvatarFallbackFinal";
  var AVATAR_CLASS_RE = /(^|[-_])avatar($|[-_])|avatar/i;

  function isAvatarImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    if (img.hasAttribute("data-vc-avatar")) return true;
    var cls = String(img.className || "");
    var src = String(img.getAttribute("src") || "");
    if (AVATAR_CLASS_RE.test(cls)) return true;
    if (/\brounded(-full)?\b/i.test(cls)) return true;
    if (
      img.closest &&
      img.closest(
        [
          ".vc-staff-tools-person",
          ".vc-staff-tools-rank",
          ".vc-staff-profile-identity__avatar-wrap",
          ".vc-staff-hub-preview",
          ".vc-staff-avatar-wrap",
          ".vc-staff-inbox-item",
          ".vc-ul-avatar",
          ".vc-user-profile-avatarwrap",
          ".vc-user-profile-shared__avatar",
          ".discord-avatar-clip",
          ".vc-reviews-card__avatar",
          ".vc-tprof-thumb-wrap",
          ".vc-dash-bl__icon",
          ".vc-dash-lb-card__avatar",
          ".vc-dash-pm__avatar",
          ".vc-role-member-avatar",
          ".vc-vote-list-avatar",
          ".vc-vote-podium-avatar",
          ".vc-wfc-msg__av img",
          ".vc-wfc-avatar",
        ].join(", "),
      )
    ) {
      return true;
    }
    if (/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(src)) return true;
    return false;
  }

  function hashId(id) {
    var s = String(id || "").trim();
    if (/^\d{5,24}$/.test(s)) {
      try {
        return Number((BigInt(s) >> 22n) % 6n);
      } catch (e) {
        /* fall through */
      }
    }
    var n = 0;
    for (var i = 0; i < s.length; i += 1) n = (n + s.charCodeAt(i)) % 6;
    return n;
  }

  function userIdFromImage(img) {
    var explicit = String(img.getAttribute("data-user-id") || img.getAttribute("data-discord-id") || "").trim();
    if (/^\d{5,24}$/.test(explicit)) return explicit;
    var src = String(img.getAttribute("src") || "");
    var match = src.match(/\/avatars\/(\d{5,24})\//);
    if (match) return match[1];
    var node = img;
    for (var i = 0; i < 4 && node; i += 1) {
      var attr =
        node.getAttribute &&
        (node.getAttribute("data-user-id") || node.getAttribute("data-discord-id") || node.getAttribute("data-author-id"));
      if (/^\d{5,24}$/.test(String(attr || ""))) return String(attr);
      node = node.parentElement;
    }
    return "";
  }

  function defaultDiscordAvatarUrl(userId) {
    return "https://cdn.discordapp.com/embed/avatars/" + hashId(userId) + ".png";
  }

  function svgFallbackDataUri() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function staticPngFromDiscordAvatar(src) {
    var u = String(src || "").trim();
    var user = u.match(
      /^(https:\/\/cdn\.discordapp\.com\/avatars\/\d+\/(?:a_)?[a-f0-9]+)\.(gif|webp|jpg|jpeg)(\?.*)?$/i,
    );
    if (user) return user[1] + ".png" + (user[3] || "");
    var guild = u.match(
      /^(https:\/\/cdn\.discordapp\.com\/guilds\/\d+\/users\/\d+\/avatars\/(?:a_)?[a-f0-9]+)\.(gif|webp|jpg|jpeg)(\?.*)?$/i,
    );
    if (guild) return guild[1] + ".png" + (guild[3] || "");
    return "";
  }

  function setSrcOnce(img, next) {
    var target = String(next || "").trim();
    if (!target) return false;
    if (String(img.getAttribute("src") || "") === target) return false;
    img.removeAttribute("srcset");
    img.src = target;
    return true;
  }

  function applyFallback(img) {
    if (!isAvatarImage(img)) return;
    if (img.dataset[FINAL_MARK] === "1") return;

    var current = String(img.getAttribute("src") || "");
    var stage = Number(img.dataset[FALLBACK_MARK] || "0");
    var isGuildAvatar = /cdn\.discordapp\.com\/guilds\/\d+\/users\/\d+\/avatars\//i.test(current);

    // 1) gif/webp rotto → stesso hash in PNG statico (skip per guild: spesso 404 anche in png)
    if (stage < 1) {
      if (!isGuildAvatar) {
        var png = staticPngFromDiscordAvatar(current);
        if (png && png !== current) {
          img.dataset[FALLBACK_MARK] = "1";
          img.classList.add("vc-avatar-fallback-img");
          setSrcOnce(img, png);
          return;
        }
      }
      img.dataset[FALLBACK_MARK] = "1";
    }

    // 2) default Discord embed
    if (stage < 2) {
      var def = defaultDiscordAvatarUrl(userIdFromImage(img));
      if (def && def !== current) {
        img.dataset[FALLBACK_MARK] = "2";
        img.classList.add("vc-avatar-fallback-img");
        setSrcOnce(img, def);
        return;
      }
      img.dataset[FALLBACK_MARK] = "2";
    }

    // 3) SVG locale (niente altro network)
    img.dataset[FINAL_MARK] = "1";
    img.dataset[FALLBACK_MARK] = "3";
    img.classList.add("vc-avatar-fallback-img");
    setSrcOnce(img, svgFallbackDataUri());
  }

  function scanExisting() {
    var imgs = document.querySelectorAll("img");
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && String(img.getAttribute("src") || "")) {
        applyFallback(img);
      }
    });
  }

  document.addEventListener(
    "error",
    function (event) {
      var target = event.target;
      if (target && target.tagName === "IMG") applyFallback(target);
    },
    true,
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanExisting, { once: true });
  } else {
    scanExisting();
  }
})();
