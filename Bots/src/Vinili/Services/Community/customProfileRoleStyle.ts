"use strict";

/** Custom profile: colore (solido/gradiente/holo) e icona del ruolo custom. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const axios = require("axios") as any;
const {
  HOLO,
  MAX_ROLE_ICON_BYTES,
  isSafeRoleIconUrl,
  memberHasGradientHoloAccess,
  okPersist,
  resolveCustomEmojiFromValue,
} = require("./customProfileShared") as typeof import("./customProfileShared");

async function setCustomRoleColor({ guild, member, ownerId, roleId, mode, hex, hex2 }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };

  let resolvedRoleId = String(roleId || "").trim();
  try {
    const { remapRoleIdForward } = require("../../Utils/Config/emergencyRoleIdRemap") as typeof import("../../Utils/Config/emergencyRoleIdRemap");
    const remapped = remapRoleIdForward(resolvedRoleId);
    if (remapped && remapped !== resolvedRoleId) resolvedRoleId = remapped;
  } catch {
    /* ignore */
  }

  let role = guild.roles.cache.get(resolvedRoleId) || (await guild.roles.fetch(resolvedRoleId).catch(() => null));
  if (!role || typeof role.edit !== "function") {
    role = await guild.roles.fetch(resolvedRoleId, { force: true }).catch(() => null);
  }
  if (!role || typeof role.edit !== "function") return { ok: false, reason: "role_not_found" };

  const me = guild.members?.me || guild.members?.cache?.get?.(guild.client?.user?.id);
  if (me?.permissions?.has && !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "edit_failed" };
  }
  if (me?.roles?.highest?.position != null && Number(role.position) >= Number(me.roles.highest.position)) {
    return { ok: false, reason: "edit_failed" };
  }

  const colorMode = String(mode || "solid").toLowerCase();
  const norm = (raw?) => {
    let s = String(raw || "")
      .trim()
      .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "");
    if (!s) return "";
    if (s.startsWith("#")) s = s.slice(1);
    s = s.replace(/[^0-9a-fA-F]/g, "");
    if (s.length === 3) {
      s = s
        .split("")
        .map((c?) => c + c)
        .join("");
    }
    if (s.length !== 6) return "";
    return `#${s.toLowerCase()}`;
  };
  const hexToInt = (h?) => {
    const n = norm(h);
    if (!n) return null;
    return parseInt(n.slice(1), 16);
  };

  const readLiveColors = async () => {
    const live = await guild.roles.fetch(resolvedRoleId, { force: true }).catch(() => null);
    if (!live) return null;
    const toInt = (raw?) => {
      if (raw === 0 || raw === "0") return 0;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
      return null;
    };
    let primary = toInt(live.colors?.primaryColor ?? live.color);
    if (primary == null) {
      const hex = String(live.hexColor || "").replace(/^#/, "").trim();
      if (/^[0-9a-fA-F]{6}$/.test(hex)) primary = parseInt(hex, 16);
    }
    const secondary = toInt(live.colors?.secondaryColor);
    const tertiary = toInt(live.colors?.tertiaryColor);
    return {
      primary: primary == null || !Number.isFinite(primary) ? null : primary,
      secondary: secondary == null || !Number.isFinite(secondary) ? null : secondary,
      tertiary: tertiary == null || !Number.isFinite(tertiary) ? null : tertiary,
    };
  };

  const sameColor = (a?, b?) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Number(a) === Number(b);
  };

  const confirmColors = async (want?) => {
    const live = await readLiveColors();
    if (!live || live.primary == null) return false;
    if (!sameColor(live.primary, want.primary)) return false;
    if (!sameColor(live.secondary, want.secondary ?? null)) return false;
    if (!sameColor(live.tertiary, want.tertiary ?? null)) return false;
    return true;
  };

  const editRole = async (payload?, reason?) => {
    try {
      if (typeof role.edit === "function") {
        await role.edit(payload, reason);
        return true;
      }
      if (typeof guild.roles?.edit === "function") {
        await guild.roles.edit(resolvedRoleId, payload, reason);
        return true;
      }
    } catch (err) {
      global.logger?.warn?.(
        "[customProfile] role color edit failed:",
        err?.message || err?.code || err,
      );
      return false;
    }
    return false;
  };

  if (colorMode === "gradient" || colorMode === "holo") {
    if (!memberHasGradientHoloAccess(member)) {
      return { ok: false, reason: "gradient_holo_denied" };
    }
  }

  if (colorMode === "holo") {
    const edited = await editRole({ colors: HOLO }, `Custom role holographic via sito da ${ownerId}`);
    const applied = await confirmColors({
      primary: HOLO.primaryColor,
      secondary: HOLO.secondaryColor,
      tertiary: HOLO.tertiaryColor,
    });
    if (!edited || !applied) {
      return {
        ok: false,
        reason: "edit_failed",
        message:
          "Discord non ha applicato lo stile olografico. Riprova tra poco (serve Enhanced Role Styles sul server).",
      };
    }
    return okPersist(guild, ownerId, "custom_role_color_holo", { ok: true, message: "Colore olografico applicato." });
  }

  if (colorMode === "gradient") {
    const h1 = norm(hex);
    const h2 = norm(hex2);
    if (!/^#[0-9a-fA-F]{6}$/.test(h1) || !/^#[0-9a-fA-F]{6}$/.test(h2)) {
      return { ok: false, reason: "invalid_hex" };
    }
    const p = hexToInt(h1);
    const s = hexToInt(h2);
    if (p == null || s == null) return { ok: false, reason: "invalid_hex" };
    const edited = await editRole(
      { colors: { primaryColor: p, secondaryColor: s, tertiaryColor: null } },
      `Custom role gradient via sito da ${ownerId}`,
    );
    const applied = await confirmColors({ primary: p, secondary: s, tertiary: null });
    if (!edited || !applied) {
      return {
        ok: false,
        reason: "edit_failed",
        message:
          "Discord non ha applicato il gradiente. Seleziona Gradiente (non Solido) e riprova.",
      };
    }
    return okPersist(guild, ownerId, "custom_role_color_gradient", { ok: true, message: "Gradiente aggiornato." });
  }

  const h = norm(hex);
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) {
    return { ok: false, reason: "invalid_hex" };
  }
  const p = hexToInt(h);
  if (p == null) return { ok: false, reason: "invalid_hex" };
  // Solid: clear secondary/tertiary so Discord doesn't keep old gradient/holo.
  const edited = await editRole(
    { colors: { primaryColor: p, secondaryColor: null, tertiaryColor: null } },
    `Custom role color via sito da ${ownerId}`,
  );
  const applied = await confirmColors({ primary: p, secondary: null, tertiary: null });
  if (!edited || !applied) {
    return {
      ok: false,
      reason: "edit_failed",
      message: "Non sono riuscito ad aggiornare il colore solido su Discord.",
    };
  }
  return okPersist(guild, ownerId, "custom_role_color", { ok: true, message: "Colore aggiornato su Discord." });
}

async function setCustomRoleIcon({ guild, member, ownerId, roleId, value }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const raw = String(value || "").trim();

  if (!raw || /^nessuno$/i.test(raw) || /^rimuovi$/i.test(raw)) {
    const edited = await role.edit({ unicodeEmoji: null, icon: null }, `Custom role icon cleared via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? okPersist(guild, ownerId, "custom_role_icon_clear", { ok: true }) : { ok: false, reason: "edit_failed" };
  }

  const isUrl = /^https?:\/\/\S+$/i.test(raw);
  if (isUrl) {
    if (!isSafeRoleIconUrl(raw)) return { ok: false, reason: "unsafe_url" };
    const iconBuffer = await axios.get(raw, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES, validateStatus: (s?) => s >= 200 && s < 300 }).then((r?) => Buffer.from(r.data)).catch(() => null);
    if (!iconBuffer) return { ok: false, reason: "url_unreachable" };
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? okPersist(guild, ownerId, "custom_role_icon", { ok: true }) : { ok: false, reason: "edit_failed" };
  }

  const resolvedEmoji = resolveCustomEmojiFromValue(raw);
  if (resolvedEmoji?.id) {
    const animated = Boolean(resolvedEmoji.animated);
    const emojiUrl = `https://cdn.discordapp.com/emojis/${resolvedEmoji.id}.${animated ? "gif" : "png"}?size=128&quality=lossless`;
    const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES }).then((r?) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null).catch(() => null);
    if (!iconBuffer) return { ok: false, reason: "emoji_load_failed" };
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? okPersist(guild, ownerId, "custom_role_icon", { ok: true }) : { ok: false, reason: "edit_failed" };
  }

  if (/[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(raw)) {
    const edited = await role.edit({ unicodeEmoji: raw, icon: null }, `Custom role emoji via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? okPersist(guild, ownerId, "custom_role_icon", { ok: true }) : { ok: false, reason: "edit_failed" };
  }

  return { ok: false, reason: "invalid_icon_value" };
}

export = {
  setCustomRoleColor,
  setCustomRoleIcon,
};
