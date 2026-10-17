"use strict";

/**
 * discordRoleLook1: URL icona ruolo Discord con animazione se il hash è a_*.
 * Evita extension:"png" forzato (ammazza i webp animati).
 */
function isRoleIconHashAnimated(hash) {
  return String(hash || "").trim().startsWith("a_");
}

function ensureAnimatedRoleIconUrl(url, animated) {
  let u = String(url || "").trim();
  if (!u) return "";
  /* discordRoleLook2: CDN role-icons sempre webp (animati se a_*) */
  if (/cdn\.discordapp\.com\/role-icons\//i.test(u)) {
    u = u.replace(/\.(png|jpe?g|gif)(\?|$)/i, ".webp$2");
  } else if (animated && /\.png(\?|$)/i.test(u)) {
    u = u.replace(/\.png(\?|$)/i, ".webp$1");
  }
  if (animated && !/[?&]animated=/i.test(u)) {
    u += (u.includes("?") ? "&" : "?") + "animated=true";
  }
  return u;
}

function discordRoleIconUrl(role, { size = 64 } = {}) {
  if (!role) return { iconUrl: "", iconAnimated: false };
  const hash = String(role.icon || "").trim();
  const animated = isRoleIconHashAnimated(hash);
  let iconUrl = "";
  if (typeof role.iconURL === "function") {
    try {
      iconUrl = String(
        role.iconURL({
          size: Math.min(256, Math.max(16, Number(size) || 64)),
          extension: "webp",
          forceStatic: false,
        }) || "",
      ).trim();
    } catch (_) {
      iconUrl = "";
    }
  }
  if (!iconUrl && hash && role.id) {
    const ext = animated ? "webp" : "webp";
    iconUrl =
      `https://cdn.discordapp.com/role-icons/${encodeURIComponent(String(role.id))}/` +
      `${encodeURIComponent(hash)}.${ext}?size=${Math.min(256, Math.max(16, Number(size) || 64))}` +
      (animated ? "&animated=true" : "");
  }
  iconUrl = ensureAnimatedRoleIconUrl(iconUrl, animated);
  /* anche se discord.js omette a_ ma l'URL ha già animated/gif */
  const animGuess =
    animated ||
    /[?&]animated=true\b/i.test(iconUrl) ||
    /\/a_[a-f0-9]+\.(webp|gif)/i.test(iconUrl);
  if (animGuess && iconUrl) {
    iconUrl = ensureAnimatedRoleIconUrl(iconUrl, true);
  }
  return { iconUrl, iconAnimated: Boolean(animGuess && iconUrl) };
}

module.exports = {
  discordRoleIconUrl,
  isRoleIconHashAnimated,
  ensureAnimatedRoleIconUrl,
};
