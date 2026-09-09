(function () {
  "use strict";

  var FALLBACK_MARK = "vcAvatarFallbackApplied";
  var FINAL_MARK = "vcAvatarFallbackFinal";
  var AVATAR_CLASS_RE = /(^|[-_])avatar($|[-_])|avatar/i;

  function isAvatarImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    // Brand logo navbar: never treat as Discord avatar (no static fallback).
    try {
      if (img.classList && img.classList.contains("vc-header-logo-img")) return false;
    } catch (eLogo) {}
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
          ".vc-cpf-members__av",
          ".vc-staff-list-pop__av",
          ".discord-avatar-clip",
          ".vc-reviews-card__avatar",
          ".vc-tprof-thumb-wrap",
          ".vc-dash-bl__icon",
          ".vc-dash-lb-card__avatar",
          ".vc-dash-pm__avatar",
          ".vc-role-member-avatar",
          ".vc-role-card-owneravatar",
          ".vc-vote-list-avatar",
          ".vc-vote-podium-avatar",
          ".vc-wfc-msg__av img",
          ".vc-staff-organico-hist__av",
          ".vc-staff-organico-hist__av img",
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
    // avatarSiteFb1: never use Discord colored embed defaults on the site.
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eDef) {}
    return svgFallbackDataUri();
  }

  function markPending(img) {
    if (!img || img.tagName !== "IMG") return;
    try {
      img.classList.add("vc-avatar");
      img.classList.add("vc-avatar--pending");
      img.classList.remove("vc-avatar--ready");
    } catch (eP) {}
  }

  function markReady(img) {
    if (!img || img.tagName !== "IMG") return;
    try {
      img.classList.add("vc-avatar");
      img.classList.add("vc-avatar--ready");
      img.classList.remove("vc-avatar--pending");
      img.dataset.vcAvatarOk = "1";
    } catch (eR) {}
  }

  function svgFallbackDataUri() {
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eSvg) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcCoffeeAvFb" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcCoffeeAvFb)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function paintCoffeeNow(img, cdnKeep) {
    if (!img || img.tagName !== "IMG") return;
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.paintSilhouette === "function") {
        window.VcDiscordAvatar.paintSilhouette(img, Boolean(cdnKeep));
        if (cdnKeep && cdnKeep !== true) {
          img.setAttribute("data-vc-avatar-cdn-url", String(cdnKeep));
          if (typeof window.VcDiscordAvatar.hydrateCdnFromAttr === "function") {
            window.VcDiscordAvatar.hydrateCdnFromAttr(img);
          }
        }
        return;
      }
    } catch (ePaint) {}
    var coffee = svgFallbackDataUri();
    img.removeAttribute("srcset");
    img.src = coffee;
    img.setAttribute("src", coffee);
    markReady(img);
    img.classList.add("vc-avatar-fallback-img");
    img.setAttribute("data-vc-avatar-fallback", "1");
  }

  function staticPngFromDiscordAvatar(src) {
    if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.preferStaticUrl === "function") {
      return window.VcDiscordAvatar.preferStaticUrl(src, 0) || "";
    }
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
    markPending(img);
    img.removeAttribute("srcset");
    img.src = target;
    return true;
  }

  function markAvatarOk(img) {
    if (!img || img.tagName !== "IMG") return;
    if (!isAvatarImage(img)) return;
    // staffProfBoot1: mark ready also from IO/mutation for cached imgs
    if (img.naturalWidth > 0) {
      markReady(img);
      try {
        delete img.dataset.vcAvatarRetry;
      } catch (eClr) {}
      return;
    }
    // avatarReadyWatch1: load/complete con nw=0 (CDN morto / decode fail) → fallback, non opacity:0 forever
    if (img.complete && String(img.getAttribute("src") || "").trim()) {
      applyFallback(img);
    }
  }

  function sweepStuckPendingAvatars() {
    var imgs = document.querySelectorAll("img.vc-avatar--pending, img[data-vc-avatar].vc-avatar--pending");
    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      if (!isAvatarImage(img)) continue;
      if (img.naturalWidth > 0) {
        markReady(img);
        continue;
      }
      if (img.complete && String(img.getAttribute("src") || "").trim()) {
        applyFallback(img);
      }
    }
  }

  function kickDeferredImg(img) {
    if (!img || img.tagName !== "IMG") return;
    try {
      img.loading = "eager";
      img.setAttribute("loading", "eager");
    } catch (eLoad) {}
    var src = String(img.getAttribute("src") || "").trim();
    if (!src) return;
    if (img.complete && img.naturalWidth > 0) return;
    img.dataset.vcWaking = "1";
    img.removeAttribute("srcset");
    try {
      img.removeAttribute("src");
      img.setAttribute("src", src);
    } catch (eSrc) {
      img.src = src;
    }
    try {
      delete img.dataset.vcWaking;
    } catch (eClr) {
      img.removeAttribute("data-vc-waking");
    }
  }

  function wakeDeferredMedia(root) {
    var base = root && root.querySelectorAll ? root : null;
    if (!base) return;
    var imgs = base.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i += 1) kickDeferredImg(imgs[i]);
  }

  window.VcWakeDeferredMedia = wakeDeferredMedia;

  function applyFallback(img) {
    if (!isAvatarImage(img)) return;
    if (img.dataset.vcWaking === "1") return;
    if (img.dataset[FINAL_MARK] === "1") return;

    var current = String(img.getAttribute("src") || "");

    // avatarSilhouette1: empty / Discord embed → silhouette caffè subito (mai flash).
    if (!current || /\/embed\/avatars\//i.test(current)) {
      img.dataset[FINAL_MARK] = "1";
      img.dataset[FALLBACK_MARK] = "3";
      paintCoffeeNow(img, false);
      return;
    }

    // Already painted once: restore static PNG if needed, never demote to embed/svg.
    if (img.dataset.vcAvatarOk === "1") {
      if (img.naturalWidth > 0 && !/\/embed\/avatars\//i.test(current) && !/^data:/i.test(current)) {
        return;
      }
      var restore = staticPngFromDiscordAvatar(current);
      if (restore && restore !== current) {
        img.dataset[FALLBACK_MARK] = "1";
        img.classList.add("vc-avatar-fallback-img");
        setSrcOnce(img, restore);
        return;
      }
      if (/\/embed\/avatars\//i.test(current) || /^data:/i.test(current) || img.naturalWidth === 0) {
        img.dataset[FINAL_MARK] = "1";
        img.dataset[FALLBACK_MARK] = "3";
        paintCoffeeNow(img, false);
      }
      return;
    }

    if (img.naturalWidth > 0 && !/\/embed\/avatars\//i.test(current) && !/^data:/i.test(current)) {
      img.dataset.vcAvatarOk = "1";
      markReady(img);
      return;
    }

    if (
      /(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(current) &&
      img.dataset[FALLBACK_MARK] !== "1" &&
      img.dataset[FALLBACK_MARK] !== "2" &&
      img.dataset[FALLBACK_MARK] !== "3" &&
      img.dataset.vcAvatarRetry !== "1"
    ) {
      /* avatarReal1: NON sostituire il CDN con silhouette mentre carica — aspetta. */
      img.dataset.vcAvatarRetry = "1";
      var softMs = 2800;
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) softMs = 4500;
      } catch (eSoft) {}
      window.setTimeout(function () {
        if (!img || !img.isConnected) return;
        if (img.naturalWidth > 0) {
          img.dataset.vcAvatarOk = "1";
          try {
            delete img.dataset.vcAvatarRetry;
          } catch (eClr) {}
          markReady(img);
          return;
        }
        applyFallback(img);
      }, softMs);
      return;
    }

    var stage = Number(img.dataset[FALLBACK_MARK] || "0");
    var isGuildAvatar = /cdn\.discordapp\.com\/guilds\/\d+\/users\/\d+\/avatars\//i.test(current);

    if (stage < 1) {
      if (!isGuildAvatar) {
        var png = staticPngFromDiscordAvatar(current);
        if (png && png !== current && !/^data:/i.test(current)) {
          img.dataset[FALLBACK_MARK] = "1";
          img.classList.add("vc-avatar-fallback-img");
          setSrcOnce(img, png);
          return;
        }
      } else {
        var uidGuild = userIdFromImage(img);
        var userHash = String(img.getAttribute("data-avatar-hash") || "").trim();
        if (!userHash) {
          try {
            var sess = window.__VC_DISCORD_PROFILE;
            if (sess && String(sess.id || "") === uidGuild && sess.avatar) {
              userHash = String(sess.avatar).trim();
            }
          } catch (eS) {}
        }
        if (uidGuild && userHash && !/\/guilds\//i.test(userHash)) {
          var ext = /^a_/i.test(userHash) ? "gif" : "png";
          var userUrl =
            "https://cdn.discordapp.com/avatars/" + uidGuild + "/" + userHash + "." + ext + "?size=256";
          img.dataset[FALLBACK_MARK] = "1";
          paintCoffeeNow(img, userUrl);
          return;
        }
      }
      img.dataset[FALLBACK_MARK] = "1";
    }

    if (stage < 2) {
      var png2 = staticPngFromDiscordAvatar(current);
      if (png2 && png2 !== current && img.dataset.vcAvatarPngRetry !== "1" && !/^data:/i.test(current)) {
        img.dataset.vcAvatarPngRetry = "1";
        img.dataset[FALLBACK_MARK] = "1";
        setSrcOnce(img, png2);
        return;
      }
      img.dataset[FALLBACK_MARK] = "2";
    }

    img.dataset[FINAL_MARK] = "1";
    img.dataset[FALLBACK_MARK] = "3";
    paintCoffeeNow(img, false);
  }

  function scanExisting() {
    var imgs = document.querySelectorAll("img");
    imgs.forEach(function (img) {
      if (!isAvatarImage(img)) return;
      try {
        img.classList.add("vc-avatar");
      } catch (eCls) {}
      try {
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.ensureSilhouetteFirst === "function") {
          window.VcDiscordAvatar.ensureSilhouetteFirst(img);
        }
      } catch (eSil) {}
      var src0 = String(img.getAttribute("src") || "").trim();
      if (!src0 || /\/embed\/avatars\//i.test(src0)) {
        paintCoffeeNow(img, false);
        return;
      }
      if (img.complete && img.naturalWidth > 0 && !/^data:/i.test(src0)) {
        markAvatarOk(img);
        return;
      }
      try {
        if (img.classList && img.classList.contains("vc-avatar--ready") && img.dataset.vcAvatarOk === "1") {
          return;
        }
      } catch (eReady) {}
      if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(src0) && img.classList.contains("vc-avatar--pending")) {
        /* Keep CDN pending — coffee bg CSS covers flash; don't demote. */
        return;
      }
      markPending(img);
      if (img.complete && img.naturalWidth === 0 && src0) {
        applyFallback(img);
      }
    });
  }

  window.VcAvatarFallback = {
    scan: scanExisting,
    applyFallback: applyFallback,
    defaultDiscordAvatarUrl: defaultDiscordAvatarUrl,
    isAvatarImage: isAvatarImage,
    markPending: markPending,
    markReady: markReady,
    sweepStuckPending: sweepStuckPendingAvatars,
  };

  document.addEventListener(
    "error",
    function (event) {
      var target = event.target;
      if (target && target.tagName === "IMG") applyFallback(target);
    },
    true,
  );

  document.addEventListener(
    "load",
    function (event) {
      var target = event.target;
      if (target && target.tagName === "IMG") markAvatarOk(target);
    },
    true,
  );

  document.addEventListener(
    "toggle",
    function (event) {
      var t = event.target;
      if (!t || t.tagName !== "DETAILS" || !t.open) return;
      wakeDeferredMedia(t);
      window.requestAnimationFrame(function () {
        wakeDeferredMedia(t);
      });
    },
    true,
  );

  document.addEventListener(
    "click",
    function () {
      var coarse = false;
      try {
        coarse = Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      } catch (eCoarse) {}
      if (!coarse) return;
      window.setTimeout(function () {
        var nodes = document.querySelectorAll(
          "details[open], .is-open, .vc-px-select__panel.is-portaled, .vc-px-select.is-open .vc-px-select__panel",
        );
        for (var i = 0; i < nodes.length; i += 1) wakeDeferredMedia(nodes[i]);
      }, 60);
    },
    true,
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanExisting, { once: true });
  } else {
    scanExisting();
  }

  // avatarReadyWatch1: safety net for pending stuck after GIF/CDN races
  try {
    window.setTimeout(sweepStuckPendingAvatars, 900);
    window.setTimeout(sweepStuckPendingAvatars, 2200);
    window.setTimeout(sweepStuckPendingAvatars, 4800);
    if (typeof window.setInterval === "function") {
      var sweepN = 0;
      var sweepId = window.setInterval(function () {
        sweepStuckPendingAvatars();
        sweepN += 1;
        if (sweepN >= 8) {
          try {
            window.clearInterval(sweepId);
          } catch (eClr) {}
        }
      }, 1200);
    }
  } catch (eSweep) {}

  try {
    if (typeof IntersectionObserver === "function") {
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (!entry || !entry.isIntersecting) continue;
            var img = entry.target;
            if (!img || img.tagName !== "IMG") continue;
            kickDeferredImg(img);
            if (img.complete && img.naturalWidth > 0) {
              markAvatarOk(img);
            } else if (img.complete && img.naturalWidth === 0 && String(img.getAttribute("src") || "")) {
              applyFallback(img);
            }
            try {
              io.unobserve(img);
            } catch (eUn) {}
          }
        },
        { root: null, rootMargin: "180px 0px", threshold: 0.01 },
      );
      function observeAvatar(img) {
        if (!isAvatarImage(img)) return;
        try {
          io.observe(img);
        } catch (eOb) {}
      }
      function observeAll(root) {
        var base = root && root.querySelectorAll ? root : document;
        var imgs = base.querySelectorAll("img");
        for (var i = 0; i < imgs.length; i += 1) observeAvatar(imgs[i]);
      }
      observeAll(document);
      if (typeof MutationObserver === "function") {
        new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i += 1) {
            var nodes = muts[i].addedNodes || [];
            for (var j = 0; j < nodes.length; j += 1) {
              var n = nodes[j];
              if (!n) continue;
              if (n.tagName === "IMG") {
                observeAvatar(n);
                if (isAvatarImage(n) && n.complete && n.naturalWidth > 0) markAvatarOk(n);
              } else if (n.querySelectorAll) {
                observeAll(n);
                var nested = n.querySelectorAll("img");
                for (var k = 0; k < nested.length; k += 1) {
                  if (isAvatarImage(nested[k]) && nested[k].complete && nested[k].naturalWidth > 0) {
                    markAvatarOk(nested[k]);
                  }
                }
              }
            }
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  } catch (eIo) {}
})();
