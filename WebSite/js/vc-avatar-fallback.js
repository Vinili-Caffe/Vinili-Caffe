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
    if (/\brounded-full\b/i.test(cls) && /\bobject-cover\b/i.test(cls)) return true;
    return /cdn\.discordapp\.com\/avatars\/\d+\//i.test(src) || /cdn\.discordapp\.com\/embed\/avatars\/\d+\.png/i.test(src);
  }

  function hashId(id) {
    var s = String(id || "");
    var n = 0;
    for (var i = 0; i < s.length; i += 1) n = (n + s.charCodeAt(i)) % 5;
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
      var attr = node.getAttribute && (node.getAttribute("data-user-id") || node.getAttribute("data-discord-id") || node.getAttribute("data-author-id"));
      if (/^\d{5,24}$/.test(String(attr || ""))) return String(attr);
      node = node.parentElement;
    }
    return "";
  }

  function defaultDiscordAvatarUrl(userId) {
    return "https://cdn.discordapp.com/embed/avatars/" + hashId(userId) + ".png";
  }

  function svgFallbackDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function applyFallback(img) {
    if (!isAvatarImage(img)) return;
    if (img.dataset[FINAL_MARK] === "1") return;
    if (img.dataset[FALLBACK_MARK] !== "1") {
      img.dataset[FALLBACK_MARK] = "1";
      img.classList.add("vc-avatar-fallback-img");
      img.removeAttribute("srcset");
      img.src = defaultDiscordAvatarUrl(userIdFromImage(img));
      return;
    }
    img.dataset[FINAL_MARK] = "1";
    img.classList.add("vc-avatar-fallback-img");
    img.removeAttribute("srcset");
    img.src = svgFallbackDataUri();
  }

  function scanExisting() {
    var imgs = document.querySelectorAll("img");
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) applyFallback(img);
    });
  }

  document.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target.tagName === "IMG") applyFallback(target);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanExisting, { once: true });
  } else {
    scanExisting();
  }
})();