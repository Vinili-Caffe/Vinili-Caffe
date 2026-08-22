"use strict";

const { PermissionsBitField, ChannelType, OverwriteType } = require("discord.js");
const axios = require("axios");
const { CustomRole, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveCustomRoleState } = require("../../Utils/Community/customRoleState");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest, memberHasCustomRolePanelAccess } = require("../../Utils/Community/customRoleSlots");
const { hasExtraCustomPerksUnlock } = require("../../Utils/Community/customPerksUnlock");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService");
const { fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../../Utils/Staff/partnerManagerTimedPerks");
const { buildCustomVocName, parseCustomVocName, sanitizeVoiceBaseName, normalizeCustomVocEmojiValue, findCustomVoiceByRole } = require("../../Utils/Interaction/customRoleUtils");
const { buildCustomVocCreateOverwrites, ensureCustomVocChannelBaseline, CUSTOM_VOC_MEMBER_PERMS, applyOverwrite } = require("../../Services/Community/customVocPermissionsService");
const { ensureCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils");
const { isCustomVocRecreationBlocked } = require("../../Services/Community/customVocWeeklyActivityService");
const { getLastSunday21BoundaryMsAtOrBefore } = require("../../Utils/Community/customVocWeeklyActivityUtils");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");
const IDs = require("../../Utils/Config/ids");

const ANCHOR_ROLE_ID = IDs?.roles?.separatore4 || "1469452890761596981";
const CUSTOM_VOC_CREATE_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"], IDs?.roles?.Level50].filter(Boolean);
const CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus].filter(Boolean);
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;
const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };

function trimRoleName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  const base = clean || "Custom Role";
  const prefixed = base.startsWith("༄") ? base : `༄ ${base}`;
  return prefixed.slice(0, 100).trim();
}

function memberCanCreateCustomVoc(member) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_VOC_CREATE_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function memberHasGradientHoloAccess(member) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function isSafeRoleIconUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
  return true;
}

function resolveCustomEmojiFromValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const customMatch = text.match(/<a?:([a-zA-Z0-9_~]{2,32}):(\d{16,22})>/);
  if (customMatch) {
    return { id: String(customMatch[2]), animated: /^<a:/i.test(customMatch[0]) };
  }
  return null;
}

// ─────────────────────────────────── CUSTOM ROLE ───────────────────────────────────

async function createCustomRole({ client, guild, member, ownerId, slot = "primary" }) {
  if (!guild || !member) return { ok: false, reason: "server_missing" };
  const targetSlot = String(slot || "primary").toLowerCase() === "secondary" ? "secondary" : "primary";

  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, ownerId),
    hasEventWeekWinnerGrant(guild.id, ownerId, 2).catch(() => false),
    hasEventWeekWinnerGrant(guild.id, ownerId, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(guild.id, ownerId),
  ]);
  const primarySlotUnlock = hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || partnerManagerCustomBundleActiveFromLean(pmPerkLean);

  if (targetSlot === "primary" && getCustomRoleSlotCapWithContest(member, primarySlotUnlock) < 1) {
    return { ok: false, reason: "missing_customrole_access" };
  }
  if (targetSlot === "secondary" && getCustomRoleSlotCapFromRoles(member) < 2) {
    return { ok: false, reason: "missing_secondary_access" };
  }

  const state = await resolveCustomRoleState({ guild, userId: ownerId, client, cleanupExpired: true }).catch(() => null);
  if (state?.status === "active") {
    if (targetSlot === "primary" && state?.role) return { ok: true, role: state.role, doc: state.doc || null };
    if (targetSlot === "secondary" && state?.secondaryRole) return { ok: true, role: state.secondaryRole, doc: state.doc || null };
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  if (targetSlot === "secondary") {
    const primaryRow = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { roleId: 1 }).lean().catch(() => null);
    if (!String(primaryRow?.roleId || "").trim()) {
      return { ok: false, reason: "primary_required" };
    }
  }

  const roleName = trimRoleName(accountUsername(member) || "Custom Role");
  const createdRole = await guild.roles.create({
    name: roleName,
    colors: { primaryColor: "#f4b6d7" },
    reason: `Custom role per ${member.user?.tag || ownerId}`,
  }).catch(() => null);
  if (!createdRole) return { ok: false, reason: "create_failed" };

  const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
  if (anchor?.position) {
    const customRoleDocs = await CustomRole.find({ guildId: guild.id }, { roleId: 1, secondaryRoleId: 1 }).lean().catch(() => []);
    const existingCustomPositions = (Array.isArray(customRoleDocs) ? customRoleDocs : [])
      .flatMap((doc) => [String(doc?.roleId || ""), String(doc?.secondaryRoleId || "")])
      .filter((id) => id && id !== createdRole.id)
      .map((id) => guild.roles.cache.get(id) || null)
      .filter((role) => role && Number(role.position) > 0 && Number(role.position) < Number(anchor.position))
      .map((role) => Number(role.position));
    const targetPosition = existingCustomPositions.length
      ? Math.min(Math.max(1, Number(anchor.position) - 1), Math.max(...existingCustomPositions) + 1)
      : Math.max(1, Number(anchor.position) - 1);
    if (createdRole.position !== targetPosition) {
      await createdRole.setPosition(targetPosition).catch(() => {});
    }
  }

  await member.roles.add(createdRole.id).catch(() => {});

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    { $set: targetSlot === "secondary" ? { guildId: guild.id, userId: ownerId, secondaryRoleId: createdRole.id, expiresAt: null } : { guildId: guild.id, userId: ownerId, roleId: createdRole.id, expiresAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return { ok: true, role: createdRole, doc };
}

async function deleteCustomRole({ client, guild, member, ownerId, slot = "primary" }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  const ownerDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null);
  if (!ownerDoc) return { ok: false, reason: "no_custom_role" };

  const targetSlot = String(slot || "primary").toLowerCase() === "secondary" ? "secondary" : "primary";
  const roleId = targetSlot === "secondary" ? String(ownerDoc.secondaryRoleId || "") : String(ownerDoc.roleId || "");
  if (!roleId) return { ok: false, reason: "no_custom_role" };

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (role) {
    const deleted = await role.delete(`Custom role eliminato via sito da ${ownerId}`).then(() => true).catch(() => false);
    if (!deleted) return { ok: false, reason: "delete_failed" };
  }

  const isSecondary = targetSlot === "secondary";
  const hadSecondary = Boolean(ownerDoc.secondaryRoleId);
  const updatePayload = isSecondary
    ? { $set: { secondaryRoleId: null } }
    : hadSecondary
      ? { $set: { roleId: ownerDoc.secondaryRoleId, secondaryRoleId: null } }
      : { $set: { roleId: null } };
  await CustomRole.updateOne({ guildId: guild.id, userId: ownerId }, updatePayload).catch(() => {});

  return { ok: true };
}

async function renameCustomRole({ guild, member, ownerId, roleId, name }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const newName = trimRoleName(String(name || "").trim() || accountUsername(member) || "Custom Role");
  const edited = await role.edit({ name: newName }, `Custom role rename via sito da ${ownerId}`).then(() => true).catch(() => false);
  return edited ? { ok: true, name: newName } : { ok: false, reason: "edit_failed" };
}

async function setCustomRoleColor({ guild, member, ownerId, roleId, mode, hex, hex2 }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };
  let role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role || typeof role.edit !== "function") {
    // Alcuni fetch restituiscono strutture non-Role: riprova da cache dopo fetch forzato.
    role = await guild.roles.fetch(roleId, { force: true }).catch(() => null);
  }
  if (!role || typeof role.edit !== "function") return { ok: false, reason: "role_not_found" };

  const colorMode = String(mode || "solid").toLowerCase();
  // Accetta #RGB / #RRGGBB, toglie spazi/ZWSP e caratteri spuri (copy-paste).
  const norm = (raw) => {
    let s = String(raw || "")
      .trim()
      .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "");
    if (!s) return "";
    if (s.startsWith("#")) s = s.slice(1);
    s = s.replace(/[^0-9a-fA-F]/g, "");
    if (s.length === 3) {
      s = s
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (s.length !== 6) return "";
    return `#${s.toLowerCase()}`;
  };

  const editRole = async (payload, reason) => {
    if (typeof role.edit === "function") {
      return role.edit(payload, reason).then(() => true).catch(() => false);
    }
    if (typeof guild.roles?.edit === "function") {
      return guild.roles.edit(roleId, payload, reason).then(() => true).catch(() => false);
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
    return edited ? { ok: true, message: "Colore olografico applicato." } : { ok: false, reason: "edit_failed" };
  }

  if (colorMode === "gradient") {
    const h1 = norm(hex);
    const h2 = norm(hex2);
    if (!/^#[0-9a-fA-F]{6}$/.test(h1) || !/^#[0-9a-fA-F]{6}$/.test(h2)) {
      return { ok: false, reason: "invalid_hex" };
    }
    const edited = await editRole(
      { colors: { primaryColor: h1, secondaryColor: h2 } },
      `Custom role gradient via sito da ${ownerId}`,
    );
    return edited ? { ok: true, message: "Gradiente aggiornato." } : { ok: false, reason: "edit_failed" };
  }

  // Solid
  const h = norm(hex);
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) {
    return { ok: false, reason: "invalid_hex" };
  }
  const edited = await editRole({ colors: { primaryColor: h } }, `Custom role color via sito da ${ownerId}`);
  return edited ? { ok: true, message: "Colore aggiornato." } : { ok: false, reason: "edit_failed" };
}

async function setCustomRoleIcon({ guild, member, ownerId, roleId, value }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const raw = String(value || "").trim();

  if (!raw || /^nessuno$/i.test(raw) || /^rimuovi$/i.test(raw)) {
    const edited = await role.edit({ unicodeEmoji: null, icon: null }, `Custom role icon cleared via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? { ok: true } : { ok: false, reason: "edit_failed" };
  }

  const isUrl = /^https?:\/\/\S+$/i.test(raw);
  if (isUrl) {
    if (!isSafeRoleIconUrl(raw)) return { ok: false, reason: "unsafe_url" };
    const iconBuffer = await axios.get(raw, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES, validateStatus: (s) => s >= 200 && s < 300 }).then((r) => Buffer.from(r.data)).catch(() => null);
    if (!iconBuffer) return { ok: false, reason: "url_unreachable" };
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? { ok: true } : { ok: false, reason: "edit_failed" };
  }

  const resolvedEmoji = resolveCustomEmojiFromValue(raw);
  if (resolvedEmoji?.id) {
    const animated = Boolean(resolvedEmoji.animated);
    const emojiUrl = `https://cdn.discordapp.com/emojis/${resolvedEmoji.id}.${animated ? "gif" : "png"}?size=128&quality=lossless`;
    const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null).catch(() => null);
    if (!iconBuffer) return { ok: false, reason: "emoji_load_failed" };
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? { ok: true } : { ok: false, reason: "edit_failed" };
  }

  if (/[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(raw)) {
    const edited = await role.edit({ unicodeEmoji: raw, icon: null }, `Custom role emoji via sito da ${ownerId}`).then(() => true).catch(() => false);
    return edited ? { ok: true } : { ok: false, reason: "edit_failed" };
  }

  return { ok: false, reason: "invalid_icon_value" };
}

async function removeCustomRoleMember({ guild, ownerId, roleId, memberId }) {
  if (!guild || !roleId || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi rimuovere te stesso: sei il proprietario del ruolo." };
  }
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const target = guild.members.cache.get(memberId) || (await guild.members.fetch(memberId).catch(() => null));
  if (!target) return { ok: false, reason: "member_not_found" };

  const removed = await target.roles.remove(roleId, `Custom role member revoke via sito da ${ownerId}`).then(() => true).catch(() => false);
  return removed ? { ok: true } : { ok: false, reason: "remove_failed" };
}

/**
 * Aggiunge un membro al ruolo custom inviando una richiesta in DM (come su Discord).
 * Il ruolo viene assegnato solo se l'utente accetta.
 */
async function addCustomRoleMember({ client, guild, ownerId, roleId, memberId }) {
  if (!guild || !roleId || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_add_owner", message: "Sei già il proprietario del ruolo." };
  }
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const target = guild.members.cache.get(memberId) || (await guild.members.fetch(memberId).catch(() => null));
  if (!target) return { ok: false, reason: "member_not_found" };

  if (target.roles.cache.has(roleId)) {
    return { ok: true, alreadyHad: true, message: "L'utente ha già questo ruolo." };
  }

  const { createCustomRoleGrantRequest } = require("../../Events/interaction/customRoleHandlers");
  const started = await createCustomRoleGrantRequest({
    client,
    guildId: guild.id,
    channelId: null,
    requesterId: ownerId,
    targetId: memberId,
    roleId,
    timeoutMs: 3 * 24 * 60 * 60 * 1000,
  });

  if (!started?.ok) {
    if (started?.error === "dm_closed") {
      return {
        ok: false,
        reason: "dm_closed",
        message: "Non posso inviare la DM: l'utente ha i messaggi privati chiusi.",
      };
    }
    return {
      ok: false,
      reason: "request_failed",
      message: "Non sono riuscito a inviare la richiesta in DM. Riprova tra poco.",
    };
  }

  return {
    ok: true,
    pending: true,
    message: "Richiesta inviata in DM: il ruolo verrà assegnato solo se l'utente accetta.",
  };
}

// ─────────────────────────────────── CUSTOM VOC ───────────────────────────────────

async function createCustomVoc({ client, guild, member, ownerId }) {
  if (!guild || !member) return { ok: false, reason: "server_missing" };
  const [hasExtraUnlock, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, ownerId),
    fetchPartnerManagerTimedPerkLean(guild.id, ownerId),
  ]);
  const pmBundle = partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  if (!memberCanCreateCustomVoc(member) && !hasExtraUnlock && !pmBundle) {
    return { ok: false, reason: "missing_customvoc_access" };
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { ok: false, reason: "no_manage_channels" };
  }

  const latestDoc =
    (await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null)) ||
    (await ActivityUserProfile.findOne({ guildId: guild.id, userId: ownerId })
      .select("profile.customRole")
      .lean()
      .then((row) => (row?.profile?.customRole ? { guildId: guild.id, userId: ownerId, ...row.profile.customRole } : null))
      .catch(() => null));

  if (isCustomVocRecreationBlocked(latestDoc)) {
    return { ok: false, reason: "customvoc_recreation_cooldown", until: latestDoc?.customVocRecreationBlockedUntil || null };
  }

  const existingChannelId = String(latestDoc?.customVocChannelId || "").trim();
  if (existingChannelId) {
    const existing = guild.channels?.cache?.get?.(existingChannelId) || (await guild.channels?.fetch?.(existingChannelId).catch(() => null));
    if (existing) return { ok: true, channel: existing, doc: latestDoc };
  }

  const category = await ensureCustomPrivateCategory(guild, client);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: "category_missing" };
  }

  const channelName = buildCustomVocName(
    latestDoc?.customVocEmoji || "🎧",
    accountUsername(member) || "privata",
  );

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    reason: `Canale vocale privato via sito per ${member.user?.tag || ownerId}`,
    permissionOverwrites: buildCustomVocCreateOverwrites(guild, ownerId, client.user.id),
  }).catch(() => null);
  if (!channel) return { ok: false, reason: "channel_create_failed" };
  await ensureCustomVocChannelBaseline(channel, ownerId, client.user.id).catch(() => {});

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    {
      $set: {
        customVocChannelId: channel.id,
        customVocFailedWeekStreak: 0,
        customVocLastEvaluatedWeekEndMs: getLastSunday21BoundaryMsAtOrBefore(),
        customVocRecreationBlockedUntil: null,
      },
    },
    { new: true, lean: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return { ok: true, channel, doc };
}

async function deleteCustomVoc({ client, guild, ownerId }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (channel?.delete) {
    await channel.delete(`Custom voice deleted via sito da ${ownerId}`).catch(() => {});
  }
  await CustomRole.updateOne(
    { guildId: guild.id, userId: ownerId },
    { $set: { customVocChannelId: null, customVocEligibilityLostAt: null, customVocFailedWeekStreak: 0 } },
  ).catch(() => {});

  return { ok: true };
}

async function renameCustomVoc({ guild, ownerId, baseName }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1, customVocEmoji: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const parsedCurrent = parseCustomVocName(channel.name || "");
  const preservedEmoji = parsedCurrent.emoji || vocDoc?.customVocEmoji || "🎧";
  // Se l'utente ha incollato il nome intero (emoji+separatore), ripulisci al solo base.
  const rawIn = String(baseName || "").trim();
  const parsedIn = parseCustomVocName(rawIn);
  const cleanedBase = sanitizeVoiceBaseName(parsedIn.baseName || rawIn) || parsedCurrent.baseName || "privata";
  const nextName = buildCustomVocName(preservedEmoji, cleanedBase);

  if (String(channel.name || "") === nextName) {
    return { ok: true, message: "Nome già aggiornato.", name: nextName };
  }

  try {
    await channel.edit({ name: nextName }, `Custom voc rename via sito da ${ownerId}`);
    return { ok: true, message: "Nome vocale aggiornato.", name: nextName };
  } catch (err) {
    const code = Number(err?.code || err?.status || 0);
    if (code === 429 || /rate.?limit/i.test(String(err?.message || ""))) {
      return { ok: false, reason: "discord_rate_limit" };
    }
    if (code === 50013 || code === 50001) {
      return { ok: false, reason: "no_manage_channels" };
    }
    global.logger?.warn?.("[customProfile] renameCustomVoc failed:", code, err?.message || err);
    return { ok: false, reason: "edit_failed", detail: String(err?.message || "").slice(0, 180) };
  }
}

async function setCustomVocEmoji({ guild, ownerId, emoji }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const normalized = normalizeCustomVocEmojiValue(emoji);
  if (!normalized) return { ok: false, reason: "invalid_emoji" };

  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  await CustomRole.updateOne({ guildId: guild.id, userId: ownerId }, { $set: { customVocEmoji: normalized } }).catch(() => {});

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return { ok: true, message: "Emoji salvata (canale non trovato per rinominare).", emoji: normalized };
  }

  const parsedCurrent = parseCustomVocName(channel.name || "");
  const currentBase = parsedCurrent.baseName || "privata";
  const nextName = buildCustomVocName(normalized, currentBase);
  if (String(channel.name || "") === nextName) {
    return { ok: true, message: "Emoji aggiornata.", emoji: normalized };
  }

  try {
    await channel.edit({ name: nextName }, `Custom voc emoji via sito da ${ownerId}`);
    return { ok: true, message: "Emoji vocale aggiornata.", emoji: normalized };
  } catch (err) {
    const code = Number(err?.code || err?.status || 0);
    // L'emoji è già in DB: se Discord rate-limita il rename, non mentire con "ok" generico.
    if (code === 429 || /rate.?limit/i.test(String(err?.message || ""))) {
      return {
        ok: false,
        reason: "discord_rate_limit",
        message:
          "Emoji salvata in database, ma Discord limita i rename del canale (circa 2 ogni 10 minuti). Riprova tra qualche minuto.",
      };
    }
    if (code === 50013 || code === 50001) {
      return { ok: false, reason: "no_manage_channels" };
    }
    global.logger?.warn?.("[customProfile] setCustomVocEmoji failed:", code, err?.message || err);
    return { ok: false, reason: "edit_failed", detail: String(err?.message || "").slice(0, 180) };
  }
}

async function addCustomVocMember({ guild, ownerId, memberId }) {
  if (!guild || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId) || String(memberId) === String(guild.client?.user?.id || "")) {
    return { ok: false, reason: "invalid_params", message: "Non puoi aggiungere proprietario o bot." };
  }
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const target = await guild.members.fetch({ user: memberId, force: true }).catch(() => null);
  if (!target) return { ok: false, reason: "member_not_found" };

  // create/edit con fallback (10009 Unknown Overwrite): stessa logica di +profile / customVocPermissionsService.
  const ok = await applyOverwrite(
    channel,
    memberId,
    CUSTOM_VOC_MEMBER_PERMS,
    `Custom voc grant via sito da ${ownerId}`,
    OverwriteType.Member,
  );
  if (!ok) {
    // applyOverwrite ritorna false anche se i permessi erano già ok — verifica overwrite presente.
    const existing = channel.permissionOverwrites?.cache?.get?.(String(memberId));
    if (existing) return { ok: true, message: "Accesso già presente." };
    return { ok: false, reason: "edit_failed" };
  }
  return { ok: true, message: "Accesso aggiunto." };
}

async function removeCustomVocMember({ guild, ownerId, memberId }) {
  if (!guild || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi toglierti l'accesso: sei il proprietario della vocale." };
  }
  const botId = String(guild.client?.user?.id || guild.members?.me?.id || "").trim();
  if (botId && String(memberId) === botId) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi rimuovere il bot dal canale." };
  }
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const deleted = await channel.permissionOverwrites
    .delete(memberId, `Custom voc revoke via sito da ${ownerId}`)
    .then(() => true)
    .catch((err) => {
      const code = Number(err?.code || 0);
      // Già assente = ok
      if (code === 10009) return true;
      global.logger?.warn?.("[customProfile] removeCustomVocMember failed:", code, err?.message || err);
      return false;
    });
  if (!deleted) return { ok: false, reason: "edit_failed" };
  return { ok: true, message: "Accesso rimosso." };
}

module.exports = {
  createCustomRole,
  deleteCustomRole,
  renameCustomRole,
  setCustomRoleColor,
  setCustomRoleIcon,
  removeCustomRoleMember,
  addCustomRoleMember,
  createCustomVoc,
  deleteCustomVoc,
  renameCustomVoc,
  setCustomVocEmoji,
  addCustomVocMember,
  removeCustomVocMember,
  memberHasGradientHoloAccess,
};
