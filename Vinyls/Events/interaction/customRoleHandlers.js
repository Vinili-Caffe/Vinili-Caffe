const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, InteractionWebhook, OverwriteType, } = require("discord.js");
const { CustomRole, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas");
const { MAX_REACTIONS, getCustomReactionMax, parseReactionTokens, memberHasCustomReactionRoleAccess, findEmojiByShortName, resolveStoredCustomEmojiFromClient } = require("../../Utils/Community/mentionReactionPanelUtils");
const { safeMessageEdit } = require("../../../shared/discord/replyRuntime");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const { resolveCustomRoleState, buildExpiryText, } = require("../../Utils/Community/customRoleState");
const { getClientGuildCached, getGuildMemberCached, getGuildChannelCached, getUserCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { fetchGuildChannel, fetchGuildMember, fetchGuildRole, replyEphemeral, parseRoleActionId, parseVoiceActionId, canManageRole, refreshEmbedRoleLine, sanitizeVoiceBaseName, parseCustomVocName, buildCustomVocName, extractCustomVocEmojiFromMessage, normalizeCustomVocEmojiValue } = require("../../Utils/Interaction/customRoleUtils");
const { CUSTOM_VOC_MEMBER_PERMS, CUSTOM_VOC_OWNER_BASE_PERMS, applyOverwrite } = require("../../Services/Community/customVocPermissionsService");
const { buildPanelPayload } = require("../../Buttons/profile");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const pendingRoleGrants = new Map();
const pendingSiteRoleRequests = new Map();
const pendingProfilePrompts = new Map();
const PENDING_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "customRolePendingRequestsSnapshot.json");
let pendingLoaded = false;
const PRIVATE_FLAG = 1 << 6;
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;
const PROFILE_PROMPT_TTL_MS = 90_000;
/** Same TTL as site role join requests (createSiteRoleJoinRequest). */
const CUSTOM_ROLE_GRANT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const IDs = require("../../Utils/Config/ids");
const CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS = [ IDs?.roles?.VIP, IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, ].filter(Boolean);
const GRADIENT_HOLO_DENIED_MSG = "<:VC_Attention:1482534443632558151> **Gradiente** e **olografico** sono riservati a chi ha ruolo **VIP**, **Server Booster**, **Double Booster** o **VIP+**. Gli altri possono usare solo il **colore solido** (stesso menu → Solido).";
const PENDING_SITE_ROLE_DOC = SITE_DOCUMENT_TYPE.ROLE_REQUEST_PENDING;
const PENDING_ROLE_GRANT_DOC = SITE_DOCUMENT_TYPE.ROLE_GRANT_PENDING;

function mapPendingSiteRoleDoc(doc) {
  if (!doc) return null;
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    guildId: String(doc.guildId || ""),
    requesterId: String(doc.requesterId || ""),
    ownerId: String(doc.ownerId || ""),
    roleId: String(doc.roleId || ""),
    reason: String(doc.reason || doc.content || ""),
    dmChannelId: String(doc.dmChannelId || ""),
    dmMessageId: String(doc.dmMessageId || ""),
    expiresAt,
  };
}

async function persistPendingSiteRoleRequest(token, row) {
  const t = String(token || "").trim();
  if (!t || !row) return;
  await SiteDocument.findOneAndUpdate(
    { docType: PENDING_SITE_ROLE_DOC, requestToken: t },
    {
      $set: {
        guildId: String(row.guildId || ""),
        requesterId: String(row.requesterId || ""),
        ownerId: String(row.ownerId || ""),
        roleId: String(row.roleId || ""),
        reason: String(row.reason || "").slice(0, 500),
        dmChannelId: String(row.dmChannelId || ""),
        dmMessageId: String(row.dmMessageId || ""),
        expiresAt: new Date(Number(row.expiresAt) || Date.now()),
        status: "pending",
      },
      $setOnInsert: {
        docType: PENDING_SITE_ROLE_DOC,
        requestToken: t,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err) => {
    global.logger?.warn?.("[site-role-request] persist pending:", err?.message || err);
  });
}

async function loadPendingSiteRoleRequest(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await SiteDocument.findOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t })
    .lean()
    .catch(() => null);
  const mapped = mapPendingSiteRoleDoc(doc);
  if (!mapped) {
    if (doc) {
      await SiteDocument.deleteOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t }).catch(() => {});
    }
    return null;
  }
  return mapped;
}

async function deletePendingSiteRoleRequest(token) {
  const t = String(token || "").trim();
  if (!t) return;
  pendingSiteRoleRequests.delete(t);
  await SiteDocument.deleteOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t }).catch(() => {});
}

async function resolvePendingSiteRoleRequest(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  ensurePendingLoaded();
  let request = pendingSiteRoleRequests.get(t) || null;
  if (request && Number(request.expiresAt || 0) > Date.now()) return request;
  request = await loadPendingSiteRoleRequest(t);
  if (request) pendingSiteRoleRequests.set(t, request);
  return request;
}

function mapPendingRoleGrantDoc(doc) {
  if (!doc) return null;
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    guildId: String(doc.guildId || ""),
    channelId: String(doc.workflowChannelId || doc.channelId || "") || null,
    requesterId: String(doc.requesterId || ""),
    targetId: String(doc.userId || doc.targetId || ""),
    roleId: String(doc.roleId || ""),
    promptMessageId: String(doc.workflowMessageId || doc.promptMessageId || "") || null,
    dmChannelId: String(doc.dmChannelId || ""),
    dmMessageId: String(doc.dmMessageId || ""),
    expiresAt,
  };
}

async function persistPendingRoleGrant(token, row) {
  const t = String(token || "").trim();
  if (!t || !row) return;
  await SiteDocument.findOneAndUpdate(
    { docType: PENDING_ROLE_GRANT_DOC, requestToken: t },
    {
      $set: {
        guildId: String(row.guildId || ""),
        requesterId: String(row.requesterId || ""),
        userId: String(row.targetId || ""),
        roleId: String(row.roleId || ""),
        workflowChannelId: String(row.channelId || ""),
        workflowMessageId: String(row.promptMessageId || ""),
        dmChannelId: String(row.dmChannelId || ""),
        dmMessageId: String(row.dmMessageId || ""),
        expiresAt: new Date(Number(row.expiresAt) || Date.now()),
        status: "pending",
      },
      $setOnInsert: {
        docType: PENDING_ROLE_GRANT_DOC,
        requestToken: t,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err) => {
    global.logger?.warn?.("[custom-role-grant] persist pending:", err?.message || err);
  });
}

async function loadPendingRoleGrant(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await SiteDocument.findOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t })
    .lean()
    .catch(() => null);
  const mapped = mapPendingRoleGrantDoc(doc);
  if (!mapped) {
    if (doc) {
      await SiteDocument.deleteOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t }).catch(() => {});
    }
    return null;
  }
  return mapped;
}

async function deletePendingRoleGrant(token) {
  const t = String(token || "").trim();
  if (!t) return;
  pendingRoleGrants.delete(t);
  await SiteDocument.deleteOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t }).catch(() => {});
}

async function resolvePendingRoleGrant(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  ensurePendingLoaded();
  let request = pendingRoleGrants.get(t) || null;
  if (request && Number(request.expiresAt || 0) > Date.now()) return request;
  request = await loadPendingRoleGrant(t);
  if (request) pendingRoleGrants.set(t, request);
  return request;
}

function persistPendingNow() {
  const now = Date.now();
  const payload = { roleGrants: {}, siteRoleRequests: {} };
  for (const [token, row] of pendingRoleGrants.entries()) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    payload.roleGrants[token] = { ...row };
  }
  for (const [token, row] of pendingSiteRoleRequests.entries()) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    payload.siteRoleRequests[token] = { ...row };
  }
  writeSnapshotWithMeta({ filePath: PENDING_SNAPSHOT_PATH, walPath: `${PENDING_SNAPSHOT_PATH}.wal`, key: "vinyls_custom_role_pending", version: 1, payload, });
}

function ensurePendingLoaded() {
  if (pendingLoaded) return;
  pendingLoaded = true;
  const raw = readSnapshotWithMeta({ filePath: PENDING_SNAPSHOT_PATH, walPath: `${PENDING_SNAPSHOT_PATH}.wal`, key: "vinyls_custom_role_pending", version: 1, fallback: { roleGrants: {}, siteRoleRequests: {} }, });
  const now = Date.now();
  for (const [token, row] of Object.entries(raw?.roleGrants || {})) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    pendingRoleGrants.set(token, row);
  }
  for (const [token, row] of Object.entries(raw?.siteRoleRequests || {})) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    pendingSiteRoleRequests.set(token, row);
  }
}

async function getGuildMemberForOwner(interaction, ownerId) {
  if (interaction.member && String(interaction.member.id) === String(ownerId)) return interaction.member;
  return interaction.guild?.members?.fetch?.(ownerId).catch(() => null) || null;
}

function memberHasCustomRoleGradientHoloAccess(member) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function profilePromptKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function clearProfilePrompt(guildId, userId) {
  const key = profilePromptKey(guildId, userId);
  const old = pendingProfilePrompts.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  pendingProfilePrompts.delete(key);
}

async function cancelProfilePrompt(guildId, userId, client, content) {
  const key = profilePromptKey(guildId, userId);
  const pending = pendingProfilePrompts.get(key);
  if (!pending) return false;
  clearProfilePrompt(guildId, userId);
  if (client) {
    await editProfilePromptReply(
      client,
      pending,
      content || "<:cancel:1461730653677551691> Operazione annullata.",
    ).catch(() => { });
  }
  return true;
}

function hasPendingRoleGrantFor({ guildId, requesterId, targetId, roleId }) {
  ensurePendingLoaded();
  const now = Date.now();
  for (const req of pendingRoleGrants.values()) {
    if (now > Number(req.expiresAt || 0)) continue;
    if (String(req.guildId || "") !== String(guildId || "")) continue;
    if (String(req.requesterId || "") !== String(requesterId || "")) continue;
    if (String(req.targetId || "") !== String(targetId || "")) continue;
    if (String(req.roleId || "") !== String(roleId || "")) continue;
    return true;
  }
  return false;
}

function registerProfilePrompt(interaction, data) {
  const guildId = String(interaction.guild?.id || "");
  const userId = String(interaction.user?.id || "");
  if (!guildId || !userId) return;
  clearProfilePrompt(guildId, userId);
  const key = profilePromptKey(guildId, userId);
  const timerId = setTimeout(() => pendingProfilePrompts.delete(key), PROFILE_PROMPT_TTL_MS);
  timerId.unref?.();
  pendingProfilePrompts.set(key, {
    ...(data || {}),
    guildId,
    requesterId: userId,
    channelId: String(interaction.channelId || interaction.channel?.id || ""),
    panelMessageId: String(interaction.message?.id || ""),
    interactionApplicationId: interaction.applicationId ? String(interaction.applicationId) : "",
    interactionToken: interaction.token ? String(interaction.token) : "",
    expiresAt: Date.now() + PROFILE_PROMPT_TTL_MS,
    timerId,
  });
}

async function editProfilePromptReply(client, pending, content) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return false;
  const hook = new InteractionWebhook(client, appId, token);
  return hook.editMessage("@original", { content, embeds: [], components: [] }).then(() => true).catch(() => false);
}

async function refreshProfilePanelFromPrompt(message, pending, section) {
  const panelMessageId = String(pending?.panelMessageId || "");
  if (!panelMessageId || !message?.channel?.messages?.fetch) return;
  const panel = await message.channel.messages.fetch(panelMessageId).catch(() => null);
  if (!panel?.editable) return;
  const payload = await buildPanelPayload(message.guild, pending.ownerId, message.client, section).catch(() => null);
  if (payload) await panel.edit(payload).catch(() => {});
}

function canManageRoleFromGuild(guild, client, role) {
  const me = guild?.members?.me || guild?.members?.cache?.get(client?.user?.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return false;
  if (!role) return false;
  return role.position < me.roles.highest.position;
}

function isSafeRoleIconUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function extractMentionOrId(message) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);
  const match = String(message?.content || "").match(/\d{16,20}/);
  return match ? String(match[0]) : "";
}

function normalizeHex(raw) {
  const value = String(raw || "").trim();
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "";
}

const CUSTOM_EMOJI_TOKEN_RE = /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/;

function extractRoleIconInputFromMessage(message) {
  const content = String(message?.content || "").trim();
  if (content) {
    const customToken = content.match(CUSTOM_EMOJI_TOKEN_RE);
    if (customToken) return customToken[0];
    const compact = content.replace(/\s+/g, "");
    const nameOnly = compact.match(/^:([a-zA-Z0-9_~]{2,32}):$/);
    if (nameOnly) return `:${nameOnly[1]}:`;
    if (/^https?:\/\/\S+$/i.test(content)) return content;
    if (/^nessuno$/i.test(content) || /^rimuovi$/i.test(content)) return content;
    if (/[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(content)) return content;
    return content;
  }
  const attachment = message?.attachments?.first?.();
  if (attachment?.url && (String(attachment.contentType || "").startsWith("image/") || attachment.width || attachment.height)) {
    return String(attachment.url);
  }
  return "";
}

function resolveCustomEmojiFromInput(message, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const customMatch = text.match(/<a?:([a-zA-Z0-9_~]{2,32}):(\d{16,22})>/);
  if (customMatch) {
    return {
      id: String(customMatch[2]),
      animated: /^<a:/i.test(customMatch[0]),
    };
  }
  const nameMatch = text.match(/:([a-zA-Z0-9_~]{2,32}):/);
  if (nameMatch) {
    const found = findEmojiByShortName(message?.guild, nameMatch[1]);
    if (found) return { id: String(found.id), animated: Boolean(found.animated) };
  }
  if (/^\d{16,22}$/.test(text)) {
    const found = resolveStoredCustomEmojiFromClient(message?.client, text);
    if (found) return { id: String(found.id), animated: Boolean(found.animated) };
  }
  return null;
}

async function resolvePromptRole(message, pending) {
  const ownerId = String(pending?.ownerId || "");
  const roleId = String(pending?.roleId || "");
  const state = await resolveCustomRoleState({ guild: message.guild, userId: ownerId, client: message.client, cleanupExpired: true }).catch(() => null);
  if (state?.status !== "active") return { ok: false, reason: "role_missing" };
  const role =
    String(state?.role?.id || "") === roleId
      ? state.role
      : String(state?.secondaryRole?.id || "") === roleId
        ? state.secondaryRole
        : null;
  if (!role || (roleId && String(role.id) !== roleId)) return { ok: false, reason: "role_missing" };
  if (!canManageRoleFromGuild(message.guild, message.client, role)) return { ok: false, reason: "no_manage_role" };
  return { ok: true, role, state };
}

function customRolePanelSectionForRoleId(docOrState, roleId) {
  const rid = String(roleId || "").trim();
  if (!rid) return "customrole";
  const secondaryId = String(
    docOrState?.secondaryRoleId ||
      docOrState?.doc?.secondaryRoleId ||
      docOrState?.secondaryRole?.id ||
      "",
  ).trim();
  return secondaryId && rid === secondaryId ? "customrole_secondary" : "customrole";
}

async function applyRoleIconValue(message, role, rawValue) {
  const value = String(rawValue || "").trim();
  const actor = message.author?.tag || message.author?.id || "profile prompt";
  const confirm = async (checkFn) => {
    const liveRole = await fetchGuildRole(message.guild, role.id).catch(() => null);
    return Boolean((liveRole || role) && checkFn(liveRole || role));
  };
  if (!value || /^nessuno$/i.test(value) || /^rimuovi$/i.test(value)) {
    const edited = await role.edit({ unicodeEmoji: null, icon: null }, `Custom role icon cleared by ${actor}`).then(() => true).catch(() => false);
    return edited || await confirm((liveRole) => !liveRole.icon && !liveRole.unicodeEmoji)
      ? { ok: true, content: "<:success:1461731530333229226> Icona rimossa." }
      : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito a rimuovere l'icona del ruolo." };
  }
  const isUrl = /^https?:\/\/\S+$/i.test(value);
  let iconBuffer = null;
  let successContent = "<:success:1461731530333229226> Icona ruolo aggiornata.";
  if (isUrl) {
    if (!isSafeRoleIconUrl(value)) return { ok: false, content: "<:VC_Attention:1482534443632558151> URL non sicuro o non supportato. Usa un link `https` pubblico." };
    iconBuffer = await axios.get(value, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES, validateStatus: (status) => status >= 200 && status < 300 }).then((r) => Buffer.from(r.data)).catch(() => null);
    if (!iconBuffer) return { ok: false, content: "<:VC_Attention:1482534443632558151> URL immagine non valida o non raggiungibile." };
  } else {
    const resolvedEmoji = resolveCustomEmojiFromInput(message, value);
    if (resolvedEmoji?.id) {
      const foundId = String(resolvedEmoji.id);
      const animated = Boolean(resolvedEmoji.animated);
      const emojiUrl = `https://cdn.discordapp.com/emojis/${foundId}.${animated ? "gif" : "png"}?size=128&quality=lossless`;
      iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null).catch(() => null);
      successContent = "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.";
      if (!iconBuffer) return { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Riprova o incolla un URL immagine." };
    }
  }
  if (iconBuffer) {
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon by ${actor}`).then(() => true).catch(() => false);
    return edited || await confirm((liveRole) => Boolean(liveRole.icon))
      ? { ok: true, content: successContent }
      : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." };
  }
  if (!/[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(value)) {
    return { ok: false, content: "<:VC_Attention:1482534443632558151> Valore non valido. Usa un'emoji unicode, una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine." };
  }
  let editErr = null;
  const edited = await role.edit({ unicodeEmoji: value, icon: null }, `Custom role emoji by ${actor}`).then(() => true).catch((e) => { editErr = e; return false; });
  const applied = edited || await confirm((liveRole) => String(liveRole.unicodeEmoji || "") === value);
  const code = editErr?.code || editErr?.rawError?.code || null;
  const msg = String(editErr?.rawError?.message || editErr?.message || "");
  const hint = code === 50035 || /role icon|unicode|emoji/i.test(msg) ? " Prova con una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine." : "";
  return applied
    ? { ok: true, content: `<:success:1461731530333229226> Icona ruolo aggiornata: ${value}` }
    : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." + hint };
}

async function checkOwnership(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
          .setDescription("<:VC_Attention:1482534443632558151> Solo il proprietario del ruolo personalizzato può usare questo controllo."),
      ], flags: PRIVATE_FLAG }).catch(() => { });
  return false;
}

async function ensureOwnerCustomRoleActive(interaction, ownerId, expectedRoleId = null) {
  const state = await resolveCustomRoleState({ guild: interaction.guild, userId: ownerId, client: interaction.client, cleanupExpired: true, });

  if (state.status === "none") {
    await replyEphemeral(interaction, { content: "<:VC_Attention:1482534443632558151> Non hai un ruolo personalizzato attivo. Usa [Personalizza](https://www.viniliecaffe.it/personalizza/).", flags: PRIVATE_FLAG });
    return { ok: false, state };
  }

  if (state.status === "expired") {
    await replyEphemeral(interaction, {
      content: [
        "<a:VC_Alert:1482706673176150077> Il tuo ruolo personalizzato è scaduto.",
        `<:VC_Clock:1473359204189474886> Scadenza: ${buildExpiryText(state.doc)}`,
        "<:VC_InactiveStatus:1482526984234860574> Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) per crearne uno nuovo.",
      ].join("\n"),
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  if (state.status === "missing_role") {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Ruolo personalizzato non trovato, ricrealo con [Personalizza](https://www.viniliecaffe.it/personalizza/).",
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  if (
    expectedRoleId &&
    String(state.role?.id || "") !== String(expectedRoleId) &&
    String(state.secondaryRole?.id || "") !== String(expectedRoleId)
  ) {
    await replyEphemeral(interaction, { content: "<:vegax:1443934876440068179> Questo pannello non è più allineato al tuo ruolo personalizzato attuale. Riapri con [Personalizza](https://www.viniliecaffe.it/personalizza/).", flags: PRIVATE_FLAG });
    return { ok: false, state };
  }
  const resolvedRole = expectedRoleId && String(state.secondaryRole?.id || "") === String(expectedRoleId)
    ? state.secondaryRole
    : state.role || null;
  return { ok: true, state: { ...state, resolvedRole } };
}

async function ensureOwnerCustomReactionAllowed(interaction, ownerId) {
  const member =
    interaction.member && String(interaction.member.id) === String(ownerId)
      ? interaction.member
      : await interaction.guild?.members?.fetch?.(ownerId).catch(() => null);
  if (memberHasCustomReactionRoleAccess(member)) {
    return { ok: true, member, maxReactions: getCustomReactionMax(member) };
  }
  await replyEphemeral(interaction, {
    content: "<:VC_Attention:1482534443632558151> Serve VIP/VIP+, Booster o il livello 70 per usare le reaction personalizzate.", flags: PRIVATE_FLAG });
  return { ok: false, member, maxReactions: getCustomReactionMax(member) };
}

async function ensureOwnerCustomVocAccess(interaction, ownerId, expectedChannelId = null) {
  const doc = await CustomRole.findOne(
    { guildId: interaction.guild?.id, userId: String(ownerId) },
    { customVocChannelId: 1, customVocEmoji: 1 },
  )
    .lean()
    .catch(() => null);
  const storedChannelId = String(doc?.customVocChannelId || "").trim();
  if (!storedChannelId) {
    await replyEphemeral(interaction, {content: "<:VC_Attention:1482534443632558151> Non hai una custom voc attiva. Usa [Personalizza](https://www.viniliecaffe.it/personalizza/).", flags: PRIVATE_FLAG });
    return { ok: false, doc: null, channelId: "" };
  }
  if (expectedChannelId && String(storedChannelId) !== String(expectedChannelId)) {
    await replyEphemeral(interaction, { content: "<:vegax:1443934876440068179> Questo pannello non è più allineato alla tua custom voc. Riapri con [Personalizza](https://www.viniliecaffe.it/personalizza/).", flags: PRIVATE_FLAG });
    return { ok: false, doc, channelId: storedChannelId };
  }
  return { ok: true, doc, channelId: storedChannelId };
}

async function fetchRole(interaction, roleId) {
  const guild = interaction.guild;
  if (!guild) return null;
  return (
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

async function updatePanelMessage(interaction, panelMessageId, role) {
  if (!panelMessageId || !interaction.channel) return;
  const msg = interaction.channel.messages.cache.get(panelMessageId) || (await interaction.channel.messages.fetch(panelMessageId).catch(() => null));
  if (!msg) return;
  const updated = refreshEmbedRoleLine(msg.embeds?.[0], role);
  await msg.edit({ embeds: [updated] }).catch(() => { });
}

async function createCustomRoleGrantRequest({ client, guildId, channelId, requesterId, targetId, roleId, timeoutMs = CUSTOM_ROLE_GRANT_TTL_MS }) {
  const guild = await getClientGuildCached(client, guildId);
  const channel = channelId ? await fetchGuildChannel(guild, channelId) : null;
  const targetMember = await fetchGuildMember(guild, targetId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
    if (!guild || !targetMember || !requesterMember || !role) {
    return { ok: false, error: "invalid_context" };
  }
  if (channelId && !channel) {
    return { ok: false, error: "channel_missing" };
  }

  const token = crypto.randomBytes(16).toString("hex");
  const dmRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji("<:vegacheckmark:1443666279058772028>")
    .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
  const dmEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta ruolo personalizzato")
    .setDescription(
      `${requesterMember} vuole aggiungerti il ruolo **${role.name}** nel server. Accetti?`,
    );

  const targetUser = targetMember.user || (await getUserCached(client, targetId));
  const dmSent =
    targetUser && typeof targetUser.send === "function"
      ? await targetUser.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => null)
      : null;
  if (!dmSent) {
    if (channel) {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<a:VC_Alert:1482706673176150077> Impossibile inviare DM")
              .setDescription(
                `<:vegax:1443934876440068179> Non posso inviare il messaggio privato a ${targetMember}.`,
              ),
          ],
        })
        .catch(() => null);
    }
    return { ok: false, error: "dm_closed" };
  }

  const waitingEmbed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<a:VC_pixeltime:1482535344103620771> In attesa di conferma")
    .setDescription(
      `<a:VC_Timer:1482527426557775954> Sto aspettando che ${targetMember} accetti di ricevere il ruolo **${role.name}**.`,
    );
  let promptMsg = null;
  if (channel) {
    promptMsg = await channel.send({ embeds: [waitingEmbed] }).catch(() => null);
    if (!promptMsg) {
      await dmSent.edit({ components: [] }).catch(() => {});
      return { ok: false, error: "channel_send_failed" };
    }
  }

  ensurePendingLoaded();
  const grantTtlMs = Math.max(15_000, Number(timeoutMs || CUSTOM_ROLE_GRANT_TTL_MS) || CUSTOM_ROLE_GRANT_TTL_MS);
  pendingRoleGrants.set(token, {
    guildId,
    channelId: channelId ? String(channelId) : null,
    requesterId,
    targetId,
    roleId,
    promptMessageId: promptMsg?.id || null,
    dmChannelId: dmSent.channelId,
    dmMessageId: dmSent.id,
    expiresAt: Date.now() + grantTtlMs,
  });
  persistPendingNow();
  await persistPendingRoleGrant(token, pendingRoleGrants.get(token));

  const expiryTimer = setTimeout(
    async () => {
      ensurePendingLoaded();
      const req = (await resolvePendingRoleGrant(token)) || pendingRoleGrants.get(token);
      if (!req) return;
      await deletePendingRoleGrant(token);
      persistPendingNow();
      const g = await getClientGuildCached(client, req.guildId);
      if (req.channelId && req.promptMessageId) {
        const ch = await fetchGuildChannel(g, req.channelId);
        const msg =
          ch?.messages?.cache?.get(req.promptMessageId) ||
          (await ch?.messages?.fetch(req.promptMessageId).catch(() => null));
        if (msg) {
          await msg
            .edit({
              embeds: [
                new EmbedBuilder()
                  .setColor("#e67e22")
                  .setTitle("<:VC_update:1478721333096349817> Scaduto")
                  .setDescription(`<a:VC_Timer:1482527426557775954> <@${req.targetId}> non ha risposto in tempo.`),
              ],
            })
            .catch(() => {});
        }
      }

      const user = await getUserCached(client, req.targetId);
      const dmChannel = user?.dmChannel || (await user?.createDM().catch(() => null));
      const dmMsg =
        dmChannel?.messages?.cache?.get(req.dmMessageId) ||
        (await dmChannel?.messages?.fetch(req.dmMessageId).catch(() => null));
      if (dmMsg) {
        await dmMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#e67e22")
                .setTitle("<:VC_update:1478721333096349817> Scaduto")
                .setDescription("<a:VC_Timer:1482527426557775954> Tempo scaduto: la richiesta non è più valida."),
            ],
            components: [],
          })
          .catch(() => {});
      }
    },
    grantTtlMs,
  );
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true, promptMessageId: promptMsg?.id || null, dmOnly: !channel };
}

function buildSiteRoleRequestButtons(token, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:approve`)
      .setLabel("Approva")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:reject`)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function createSiteRoleJoinRequest({ client, guildId, requesterId, ownerId, roleId, reason, timeoutMs = 3 * 24 * 60 * 60 * 1000 }) {
  const guild = await getClientGuildCached(client, guildId);
  const ownerMember = await fetchGuildMember(guild, ownerId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
  if (!guild || !ownerMember || !requesterMember || !role) {
    return { ok: false, error: "invalid_context" };
  }

  const now = Date.now();
  for (const [pendingToken, request] of pendingSiteRoleRequests.entries()) {
    if (!request) continue;
    if (Number(request.expiresAt || 0) <= now) {
      ensurePendingLoaded();
      await deletePendingSiteRoleRequest(pendingToken);
      persistPendingNow();
      continue;
    }
    if (
      String(request.guildId || "") === String(guildId) &&
      String(request.requesterId || "") === String(requesterId) &&
      String(request.ownerId || "") === String(ownerId) &&
      String(request.roleId || "") === String(roleId)
    ) {
      return { ok: false, error: "already_pending" };
    }
  }
  const mongoPending = await SiteDocument.findOne({
    docType: PENDING_SITE_ROLE_DOC,
    guildId: String(guildId),
    requesterId: String(requesterId),
    ownerId: String(ownerId),
    roleId: String(roleId),
    expiresAt: { $gt: new Date(now) },
  })
    .lean()
    .catch(() => null);
  if (mongoPending) return { ok: false, error: "already_pending" };

  const token = crypto.randomBytes(16).toString("hex");
  const ownerUser = ownerMember.user || (await getUserCached(client, ownerId));
  const requesterUser = requesterMember.user || (await getUserCached(client, requesterId));
  if (!ownerUser || typeof ownerUser.send !== "function") {
    return { ok: false, error: "dm_closed" };
  }
  const requesterMention = `<@${requesterId}>`;
  const dmEmbed = new EmbedBuilder()
    .setColor("#8b5cf6")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta di accesso al tuo ruolo")
    .setDescription(
      [
        `${requesterMention} vuole ottenere il tuo ruolo personalizzato **${role.name}**.`,
        "",
        `**Utente:** ${requesterMention} (\`${requesterId}\`)`,
                `**Ruolo:** **${role.name}** (\`${role.id}\`)`,
        "",
        "**Motivazione**",
        String(reason || "Nessuna motivazione."),
      ].join("\n"),
    )
    .setFooter({ text: "Puoi approvare o rifiutare direttamente da qui." })
    .setTimestamp(new Date());
  const reqThumb = userAvatarUrlDynamic(requesterUser, { size: 256 });
  if (reqThumb) dmEmbed.setThumbnail(reqThumb);

    const dmSent = await ownerUser
    .send({
      embeds: [dmEmbed],
      components: [buildSiteRoleRequestButtons(token, false)],
    })
    .catch(() => null);
  if (!dmSent) {
    return { ok: false, error: "dm_closed" };
  }

  ensurePendingLoaded();
  pendingSiteRoleRequests.set(token, { guildId, requesterId, ownerId, roleId, reason: String(reason || ""), dmChannelId: dmSent.channelId, dmMessageId: dmSent.id, expiresAt: now + Math.max(15_000, Number(timeoutMs || 0)), });
  persistPendingNow();
  await persistPendingSiteRoleRequest(token, pendingSiteRoleRequests.get(token));

  const expiryTimer = setTimeout(async () => {
    ensurePendingLoaded();
    const request = (await resolvePendingSiteRoleRequest(token)) || pendingSiteRoleRequests.get(token);
    if (!request) return;
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    let dmMsg = null;
    const channelId = String(request.dmChannelId || "").trim();
    const messageId = String(request.dmMessageId || "").trim();
    if (channelId && messageId) {
      const dmChannel =
        (await getGuildChannelCached(client, channelId).catch(() => null)) ||
        (typeof client?.channels?.fetch === "function" ? await client.channels.fetch(channelId).catch(() => null) : null);
      dmMsg =
        dmChannel?.messages?.cache?.get(messageId) ||
        (await dmChannel?.messages?.fetch?.(messageId).catch(() => null));
    }
    if (!dmMsg) {
      const owner = await getUserCached(client, request.ownerId);
      const dmChannel =
        owner?.dmChannel ||
        (typeof owner?.createDM === "function" ? await owner.createDM().catch(() => null) : null) ||
        (typeof client?.users?.createDM === "function" ? await client.users.createDM(request.ownerId).catch(() => null) : null);
      dmMsg =
        dmChannel?.messages?.cache?.get(request.dmMessageId) ||
        (await dmChannel?.messages?.fetch?.(request.dmMessageId).catch(() => null));
    }
    if (dmMsg) {
      await dmMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:VC_update:1478721333096349817> Richiesta scaduta")
              .setDescription("La richiesta del ruolo non è più valida: tempo scaduto."),
          ],
          components: [buildSiteRoleRequestButtons(token, true)],
        })
        .catch(() => { });
    }
  }, Math.max(15_000, Number(timeoutMs || 0)));
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true };
}

async function handleRoleActionButton(interaction) {
  if (!interaction.isButton()) return false;
  if (String(interaction.customId || "").startsWith("customrole_grant:"))
    return false;
  const parsed = parseRoleActionId(interaction.customId);
  if (!parsed || !parsed.head.startsWith("customrole_")) return false;

  const { head, ownerId, roleId } = parsed;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const modalHeads = new Set([ "customrole_color_solid", "customrole_color_gradient" ]);
  if (modalHeads.has(head)) {
    let modalId = null;
    let title = null;
    let label = null;
    let placeholder = null;
    const panelMessageId = interaction.message?.id || "";

    if (head === "customrole_name") {
      modalId = `customrole_modal_name:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Modifica nome ruolo";
      label = "Nuovo nome";
      placeholder = "Es: AstroFam";
    } else if (head === "customrole_color_solid") {
      modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Colore solido";
      label = "Colore HEX";
      placeholder = "Es: #ff66cc";
    } else if (head === "customrole_color_gradient") {
      const member = await getGuildMemberForOwner(interaction, ownerId);
      if (!memberHasCustomRoleGradientHoloAccess(member)) {
        await replyEphemeral(interaction, { content: GRADIENT_HOLO_DENIED_MSG, flags: PRIVATE_FLAG });
        return true;
      }
      modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Colore gradiente";
    } else if (head === "customrole_emoji") {
      modalId = `customrole_modal_emoji:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Imposta emoji o icona ruolo";
      label = "Emoji / icona (unicode, URL, :nome:, <:...:...>)";
      placeholder = "Es: :VC_PandaExcited: oppure <:VC_PandaExcited:123> oppure https://.../icon.png";
    }

    if (!modalId) return true;
    const rows = [];
    if (head === "customrole_color_gradient") {
      const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
      const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
      rows.push(new ActionRowBuilder().addComponents(input1));
      rows.push(new ActionRowBuilder().addComponents(input2));
    } else {
      const input = new TextInputBuilder().setCustomId("value").setLabel(String(label || "").slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(head !== "customrole_emoji").setPlaceholder(placeholder).setMaxLength(4000);
      rows.push(new ActionRowBuilder().addComponents(input));
    }

    const modal = new ModalBuilder().setCustomId(modalId).setTitle(String(title || "").slice(0, 45)).addComponents(...rows);
    const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
  if (!ownerState.ok) return true;

  const role = ownerState.state.resolvedRole || (await fetchRole(interaction, roleId));
  if (!role) {
    await CustomRole.updateOne(
      { guildId: interaction.guild.id, userId: ownerId },
      String(roleId) === String(ownerState.state.doc?.secondaryRoleId || "")
        ? { $set: { secondaryRoleId: null } }
        : { $set: { roleId: null } },
    ).catch(() => { });
    await interaction
      .reply({
        content:
          "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con [Personalizza](https://www.viniliecaffe.it/personalizza/).",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (head === "customrole_delete") {
    if (!canManageRole(interaction, role)) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non posso eliminare questo ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const ownerDoc = await CustomRole.findOne({ guildId: interaction.guild.id, userId: ownerId, }).lean().catch(() => null);
    const isSecondary = String(roleId) === String(ownerDoc?.secondaryRoleId || "");
    const hadSecondary = Boolean(ownerDoc?.secondaryRoleId);
    
    const roleName = role.name;
    const roleDeleted = await role
      .delete(`Ruolo personalizzato eliminato da ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    if (!roleDeleted) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito a eliminare il ruolo. Controlla gerarchia e permessi.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const updatePayload = isSecondary
      ? { $set: { secondaryRoleId: null } }
      : hadSecondary
        ? { $set: { roleId: ownerDoc.secondaryRoleId, secondaryRoleId: null } }
        : { $set: { roleId: null } };
    await CustomRole.updateOne(
      { guildId: interaction.guild.id, userId: ownerId },
      updatePayload,
    ).catch(() => { });

    const panelSection = isSecondary ? "customrole_secondary" : "customrole";
    const panelPayload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, panelSection);
    const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
    if (deferred) {
      await interaction.message?.edit?.(panelPayload).catch(() => { });
    } else {
      const updated = await interaction.update(panelPayload).then(() => true).catch(() => false);
      if (!updated) await interaction.message?.edit?.(panelPayload).catch(() => { });
    }
    const doneMsg = `<:vegacheckmark:1443666279058772028> Il ruolo **${roleName}** è stato eliminato.`;
    await interaction.followUp({ content: doneMsg, flags: PRIVATE_FLAG }).catch(() => {
      return interaction.reply({ content: doneMsg, flags: PRIVATE_FLAG }).catch(() => { });
    });
    return true;
  }

  if (head === "customrole_name") {
    registerProfilePrompt(interaction, { type: "role_name", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia il nuovo nome del custom role in questo canale.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_emoji") {
    registerProfilePrompt(interaction, { type: "role_emoji", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia l'emoji/icona del ruolo. Puoi usare emoji unicode, `<:nome:id>`, `:nome:`, URL immagine oppure `nessuno` per rimuoverla.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_color") {
    registerProfilePrompt(interaction, { type: "role_color", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia un colore HEX (`#ff66cc`). Se hai accesso a gradiente puoi inviare due HEX (`#ff66cc #6f4e37`) oppure `olografico`.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_members") {
    registerProfilePrompt(interaction, { type: "role_add", ownerId, roleId });
    await interaction.reply({ content: "✏️ Menziona l'utente a cui vuoi inviare la richiesta per il custom role.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_members_remove") {
    registerProfilePrompt(interaction, { type: "role_remove", ownerId, roleId });
    await interaction.reply({ content: "✏️ Menziona l'utente da rimuovere dal tuo custom role.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  let modalId = null;
  let title = null;
  let label = null;
  let placeholder = null;
  const panelMessageId = interaction.message?.id || "";

  if (head === "customrole_name") {
    modalId = `customrole_modal_name:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Modifica nome ruolo";
    label = "Nuovo nome";
    placeholder = "Es: AstroFam";
  } else if (head === "customrole_color_solid") {
    modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Colore solido";
    label = "Colore HEX";
    placeholder = "Es: #ff66cc";
  } else if (head === "customrole_color_gradient") {
    modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Colore gradiente";
  } else if (head === "customrole_emoji") {
    modalId = `customrole_modal_emoji:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Imposta emoji o icona ruolo";
    label = "Emoji / icona (unicode, URL, :nome:, <:...:...>)";
    placeholder = "Es: :VC_PandaExcited: oppure <:VC_PandaExcited:123> oppure https://.../icon.png";
  } else if (head === "customrole_color_holo") {
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await replyEphemeral(interaction, { content: GRADIENT_HOLO_DENIED_MSG, flags: PRIVATE_FLAG });
      return true;
    }
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
    const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${interaction.user.tag}`).then(() => true).catch(() => false);
    const applied =
      edited &&
      (await confirmRoleState((liveRole) => {
        const p = Number(liveRole.colors?.primaryColor ?? NaN);
        const s = Number(liveRole.colors?.secondaryColor ?? NaN);
        const t = Number(liveRole.colors?.tertiaryColor ?? NaN);
        return p === HOLO.primaryColor && s === HOLO.secondaryColor && t === HOLO.tertiaryColor;
      }));
    if (!applied) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare lo stile olografico.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction.reply({ content: "<:success:1461731530333229226> Stile olografico applicato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (!modalId) return true;

  const rows = [];
  if (head === "customrole_color_gradient") {
    const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
    rows.push(new ActionRowBuilder().addComponents(input1));
    rows.push(new ActionRowBuilder().addComponents(input2));
  } else {
    const input = new TextInputBuilder().setCustomId("value").setLabel(String(label || "").slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(head !== "customrole_emoji").setPlaceholder(placeholder).setMaxLength(4000);
    rows.push(new ActionRowBuilder().addComponents(input));
  }

  const modal = new ModalBuilder().setCustomId(modalId).setTitle(String(title || "").slice(0, 45)).addComponents(...rows);
  const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
  if (!shown) {
    await replyEphemeral(interaction, {
      content:
        "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
      flags: 1 << 6,
    });
  }
  return true;
}

async function handleRoleActionModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!String(interaction.customId || "").startsWith("customrole_modal_"))
    return false;

  const modalBody = String(interaction.customId).replace("customrole_modal_", "",);
  const modalParts = modalBody.split(":");
  if (modalParts.length < 4) return false;
  const [action, ownerId, roleId, panelMessageId] = modalParts;
  if (!action || !ownerId || !roleId) return false;
  if (!(await checkOwnership(interaction, ownerId))) return true;
  const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
  if (!ownerState.ok) return true;

  const role = ownerState.state.resolvedRole || (await fetchRole(interaction, roleId));
  if (!role) {
    await CustomRole.updateOne(
      { guildId: interaction.guild.id, userId: ownerId },
      String(roleId) === String(ownerState.state.doc?.secondaryRoleId || "")
        ? { $set: { secondaryRoleId: null } }
        : { $set: { roleId: null } },
    ).catch(() => { });
    await interaction
      .reply({
        content:
          "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con [Personalizza](https://www.viniliecaffe.it/personalizza/).",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (!canManageRole(interaction, role)) {
    await interaction
      .reply({
        content:
          "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  let value = "";
  try {
    value = interaction.fields.getTextInputValue("value")?.trim() || "";
  } catch (err) {}

  async function confirmRoleState(checkFn) {
    const refreshedRole = await fetchRole(interaction, roleId);
    const roleToCheck = refreshedRole || role;
    return Boolean(roleToCheck && checkFn(roleToCheck));
  }

  if (action === "name") {
    const cleaned = String(value).replace(/\s+/g, " ").trim();
    const name = (cleaned.startsWith("༄") ? cleaned : `༄ ${cleaned}`).slice(0, 100).trim();
    if (!name) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Nome non valido.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const edited = await role
      .edit({ name }, `Custom role rename by ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    const renameApplied = edited || await confirmRoleState((liveRole) => String(liveRole.name || "") === name);
    if (!renameApplied) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il nome del ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Nome aggiornato: **${name}**`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (action === "color" || action === "color_solid") {
    const hex = value.startsWith("#") ? value : `#${value}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await interaction
        .reply({
          content:
            "<:vegax:1443934876440068179> Colore HEX non valido. Esempio: `#ff66cc`.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const edited = await role
      .edit(
        { colors: { primaryColor: hex, secondaryColor: null, tertiaryColor: null } },
        `Custom role color by ${interaction.user.tag}`,
      )
      .then(() => true)
      .catch(() => false);
    const colorApplied =
      edited &&
      (await confirmRoleState((liveRole) => {
        const primaryOk = String(liveRole.hexColor || "").toUpperCase() === hex.toUpperCase();
        const secondary = liveRole.colors?.secondaryColor;
        const tertiary = liveRole.colors?.tertiaryColor;
        return primaryOk && (secondary == null || secondary === 0) && (tertiary == null || tertiary === 0);
      }));
    if (!colorApplied) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il colore del ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Colore aggiornato: \`${hex}\``,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (action === "color_gradient") {
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.reply({ content: GRADIENT_HOLO_DENIED_MSG, flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const raw1 = interaction.fields.getTextInputValue("value1")?.trim() || "";
    const raw2 = interaction.fields.getTextInputValue("value2")?.trim() || "";
    const hex1 = raw1.startsWith("#") ? raw1 : `#${raw1}`;
    const hex2 = raw2.startsWith("#") ? raw2 : `#${raw2}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex1) || !/^#?[0-9a-fA-F]{6}$/.test(hex2)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Colori HEX non validi. Esempio: `#ff66cc`.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const edited = await role
      .edit(
        { colors: { primaryColor: hex1, secondaryColor: hex2, tertiaryColor: null } },
        `Custom role gradient by ${interaction.user.tag}`,
      )
      .then(() => true)
      .catch(() => false);
    const applied =
      edited &&
      (await confirmRoleState((liveRole) => {
        const p = Number(liveRole.colors?.primaryColor ?? liveRole.color ?? NaN);
        const s = Number(liveRole.colors?.secondaryColor ?? NaN);
        const t = liveRole.colors?.tertiaryColor;
        const wantP = parseInt(hex1.replace(/^#/, ""), 16);
        const wantS = parseInt(hex2.replace(/^#/, ""), 16);
        return p === wantP && s === wantS && (t == null || t === 0);
      }));
    if (!applied) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare il gradiente.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction.reply({ content: `<:success:1461731530333229226> Gradiente aggiornato: \`${hex1}\` → \`${hex2}\``, flags: 1 << 6 }).catch(() => { });
    return true;
  }

  if (action === "emoji") {
    if (!value) {
      const cleared = await role
        .edit(
          { unicodeEmoji: null, icon: null },
          `Custom role icon cleared by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const clearApplied = cleared || await confirmRoleState((liveRole) => !liveRole.icon && !liveRole.unicodeEmoji);
      if (!clearApplied) {
        await interaction
          .reply({
            content: "<:VC_Attention:1482534443632558151> Non sono riuscito a rimuovere icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content: "<:success:1461731530333229226> Icona rimossa.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const isUrl = /^https?:\/\/\S+$/i.test(value);
    if (isUrl) {
      if (!isSafeRoleIconUrl(value)) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> URL non sicuro o non supportato. Usa un link `https` pubblico.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const iconBuffer = await axios
        .get(value, {
          responseType: "arraybuffer",
          timeout: 15000,
          maxContentLength: MAX_ROLE_ICON_BYTES,
          maxBodyLength: MAX_ROLE_ICON_BYTES,
          validateStatus: (status) => status >= 200 && status < 300,
        })
        .then((r) => Buffer.from(r.data))
        .catch(() => null);
      if (!iconBuffer) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> URL immagine non valida o non raggiungibile.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content:
            "<:success:1461731530333229226> Icona ruolo aggiornata.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const nameOnlyMatch = String(value || "").trim().match(/^:([a-zA-Z0-9_]{2,32}):$/);
    if (nameOnlyMatch) {
      const emojiName = String(nameOnlyMatch[1] || "");
      const found = interaction.guild?.emojis?.cache?.find?.((e) => String(e?.name || "") === emojiName) || null;
      if (!found?.id) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non trovo questa custom emoji nel server. Incolla l'emoji completa `<:nome:id>` oppure usa un URL.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      const ext = found.animated ? "gif" : "png";
      const emojiUrl = `https://cdn.discordapp.com/emojis/${found.id}.${ext}?size=128&quality=lossless`;
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
      if (!iconBuffer) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Riprova o incolla un URL immagine.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon (emoji name) by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction.reply({ content: "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const customEmojiMatch = String(value || "").trim().match(/^<(?:(a):)?[a-zA-Z0-9_]+:(\d+)>$/);
    if (customEmojiMatch) {
      const animated = Boolean(customEmojiMatch[1]);
      const emojiId = String(customEmojiMatch[2] || "");
      const ext = animated ? "gif" : "png";
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`;
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
      if (!iconBuffer) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Assicurati che sia una custom emoji valida e accessibile.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon (emoji) by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content:
            "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const looksLikeUnicodeEmoji = /[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(String(value || ""));
    if (!looksLikeUnicodeEmoji) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Valore non valido. Usa un'emoji unicode (es. `🐼`), una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    let edited = false;
    let editErr = null;
    try {
      await role.edit(
        { unicodeEmoji: value, icon: null },
        `Custom role emoji by ${interaction.user.tag}`,
      );
      edited = true;
    } catch (e) {
      editErr = e;
    }
    const emojiApplied = edited || await confirmRoleState((liveRole) => String(liveRole.unicodeEmoji || "") === value);
    if (!emojiApplied) {
      const code = editErr?.code || editErr?.rawError?.code || null;
      const message = String(editErr?.rawError?.message || editErr?.message || "");
      const hint = code === 50035 || /role icon|unicode|emoji/i.test(message)
        ? " Probabile che il server non abbia i requisiti per le icone ruolo oppure che l'emoji non sia supportata. Prova con una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine."
        : "";
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." + hint,
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Icona ruolo aggiornata: ${value}`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  return true;
}

async function handleRoleColorTypeSelect(interaction) {
  if (!interaction.isStringSelectMenu?.() || !interaction.guild) return false;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith("customrole_color_type_select:")) return false;

  const parts = customId.split(":");
  if (parts.length < 4) return true;
  const [, ownerId, roleId, panelMessageId] = parts;
  const choice = String(interaction.values?.[0] || "");
  if (!(await checkOwnership(interaction, ownerId))) return true;

  if (choice === "solid") {
    const modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId || ""}`;
    const input = new TextInputBuilder().setCustomId("value").setLabel("Colore HEX").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Colore solido").addComponents(new ActionRowBuilder().addComponents(input));
    const shown = await interaction.showModal(modal).then(() => true).catch((err) => {
      global.logger?.warn?.("[customrole] showModal solid failed:", err?.code || err?.message || err);
      return false;
    });
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  if (choice === "gradient") {
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.update({ content: GRADIENT_HOLO_DENIED_MSG, embeds: [], components: [] }).catch(() => { });
      return true;
    }
    const modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId || ""}`;
    const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Colore gradiente").addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
    const shown = await interaction.showModal(modal).then(() => true).catch((err) => {
      global.logger?.warn?.("[customrole] showModal gradient failed:", err?.code || err?.message || err);
      return false;
    });
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  if (choice === "holo") {
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.update({ content: GRADIENT_HOLO_DENIED_MSG, embeds: [], components: [] }).catch(() => { });
      return true;
    }
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;
    if (!canManageRole(interaction, role)) {
      await interaction.update({ content: "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.", embeds: [], components: [] }).catch(() => { });
      return true;
    }
    const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
    const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${interaction.user.tag}`).then(() => true).catch(() => false);
    await interaction.update({ content: edited ? "<:success:1461731530333229226> Stile olografico applicato." : "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare lo stile olografico.", embeds: [], components: [] }).catch(() => { });
    if (edited) await updatePanelMessage(interaction, panelMessageId, role);
    return true;
  }

  await interaction.update({ content: "<:vegax:1443934876440068179> Scelta non valida.", embeds: [], components: [] }).catch(() => { });
  return true;
}

async function handleAddRemoveSelectMenus(interaction) {
  if (
    interaction.isUserSelectMenu &&
    interaction.isUserSelectMenu() &&
    String(interaction.customId || "").startsWith("customrole_add_select:")
  ) {
    const addParts = String(interaction.customId).split(":");
    if (addParts.length !== 3) return true;
    const [, ownerId, roleId] = addParts;
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
    if (!ownerState.ok) return true;

    const targetId = interaction.values?.[0];
    const role = ownerState.state.resolvedRole || (await fetchRole(interaction, roleId));
    if (!targetId || !role) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Target o ruolo non valido.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const started = await createCustomRoleGrantRequest({ client: interaction.client, guildId: interaction.guild.id, channelId: interaction.channel.id, requesterId: ownerId, targetId, roleId });

    if (!started?.ok) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non sono riuscito ad avviare la richiesta (DM chiusi o errore).",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:success:1461731530333229226> Richiesta inviata")
            .setDescription(`<:thumbsup:1471292172145004768> Ho inviato la richiesta in DM a <@${targetId}>.`),
        ],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "").startsWith("customrole_remove_select:")
  ) {
    const removeParts = String(interaction.customId).split(":");
    if (removeParts.length !== 3) return true;
    const [, ownerId, roleId] = removeParts;
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
    if (!ownerState.ok) return true;

    const role = ownerState.state.resolvedRole || (await fetchRole(interaction, roleId));
    if (!role) {
      await CustomRole.updateOne(
        { guildId: interaction.guild.id, userId: ownerId },
        String(roleId) === String(ownerState.state.doc?.secondaryRoleId || "")
          ? { $set: { secondaryRoleId: null } }
          : { $set: { roleId: null } },
      ).catch(() => { });
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con [Personalizza](https://www.viniliecaffe.it/personalizza/).",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    if (!canManageRole(interaction, role)) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const targetId = interaction.values?.[0];
    if (targetId === ownerId) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non puoi rimuovere il tuo stesso ruolo con questo comando.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, targetId);
    if (!targetMember) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Utente non trovato.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    if (
      hasPendingRoleGrantFor({
        guildId: interaction.guild.id,
        requesterId: ownerId,
        targetId,
        roleId: role.id,
      })
    ) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> C'è ancora una richiesta in attesa di accettazione per questo utente. Attendi la risposta.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    await targetMember.roles
      .remove(role.id, `Custom role member removal by ${interaction.user.tag}`)
      .catch(() => { });

    await targetMember.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setTitle("<:VC_Attention:1482534443632558151> Ruolo Rimosso")
          .setDescription(`Sei stato rimosso dal ruolo personalizzato **${role.name}** in **${interaction.guild.name}**.`),
      ],
    }).catch(() => { });
    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:cancel:1461730653677551691> Utente Rimosso")
            .setDescription(
              `<:thumbsdown:1471292163957457013> L'utente ${targetMember} è stato rimosso dal tuo ruolo.`,
            ),
        ],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (
    interaction.isUserSelectMenu &&
    interaction.isUserSelectMenu() &&
    String(interaction.customId || "").startsWith("customvoc_add_select:")
  ) {
    const addParts = String(interaction.customId).split(":");
    if (addParts.length !== 3) return true;
    const [, ownerId, channelId] = addParts;
    if (!ownerId || !channelId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const vocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!vocState.ok) return true;
    const channel =
      interaction.guild?.channels?.cache?.get(channelId) ||
      (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    const targetId = String(interaction.values?.[0] || "").trim();
    if (!/^\d{16,20}$/.test(targetId)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Utente non valido.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await channel.permissionOverwrites.edit(
      targetId,
      CUSTOM_VOC_MEMBER_PERMS,
      {
        reason: `Custom voc grant by ${interaction.user?.tag || interaction.user?.id}`,
        type: OverwriteType.Member,
      },
    ).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("<:success:1461731530333229226> Utente aggiunto")
          .setDescription(`<:thumbsup:1471292172145004768> <@${targetId}> ora può accedere alla tua custom voc.`),
      ],
      components: [],
    }).catch(() => {});
    return true;
  }

  if (
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "").startsWith("customvoc_remove_select:")
  ) {
    const removeParts = String(interaction.customId).split(":");
    if (removeParts.length !== 3) return true;
    const [, ownerId, channelId] = removeParts;
    if (!ownerId || !channelId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const vocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!vocState.ok) return true;
    const channel =
      interaction.guild?.channels?.cache?.get(channelId) ||
      (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    const targetId = String(interaction.values?.[0] || "").trim();
    if (!/^\d{16,20}$/.test(targetId)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Utente non valido.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await channel.permissionOverwrites.delete(targetId, `Custom voc revoke by ${interaction.user?.tag || interaction.user?.id}`).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Utente rimosso")
          .setDescription(`<:thumbsdown:1471292163957457013> <@${targetId}> non ha più accesso alla tua custom voc.`),
      ],
      components: [],
    }).catch(() => {});
    return true;
  }

  return false;
}

async function refreshProfileCustomReactionPanel(interaction, ownerId, { updateInteraction = false } = {}) {
  const payload = await buildPanelPayload(
    interaction.guild,
    ownerId,
    interaction.client,
    "customreaction",
  ).catch(() => null);
  if (!payload) return false;
  if (updateInteraction) {
    await interaction.update(payload).catch(async () => {
      if (interaction.message) {
        await safeMessageEdit(interaction.message, payload, interaction).catch(() => {});
      }
    });
    return true;
  }
  if (interaction.message) {
    await safeMessageEdit(interaction.message, payload, interaction).catch(() => {});
  }
  return true;
}

async function handleCustomReactionButton(interaction) {
  if (!interaction.isButton()) return false;
  const id = String(interaction.customId || "");
  const match = id.match(/^customreaction_(add|remove|clear):(\d{16,20})$/);
  if (!match) return false;
  const [, action, ownerId] = match;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;

  const guildId = interaction.guild?.id;
  if (!guildId) return true;

  if (action === "add" || action === "remove") {
    const isAdd = action === "add";
    const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;
    const promptText = isAdd 
      ? `<:VC_Mention:1482526855289634997> Manda da 1 a ${maxReactions} emoji che vuoi **aggiungere**:` 
      : `<:VC_Mention:1482526855289634997> Manda da 1 a ${maxReactions} emoji che vuoi **rimuovere**:`;

    await interaction.reply({
      content: promptText,
      flags: PRIVATE_FLAG,
    }).catch(() => {});

    const filter = (m) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on("collect", async (m) => {
      const tokens = parseReactionTokens(m.content, maxReactions, interaction.guild);
      
      if (!tokens.length) {
        await interaction.followUp({
          content: "<:vegax:1443934876440068179> Nessuna emoji valida trovata. Riprova cliccando di nuovo il bottone.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return;
      }

      const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
      let current = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
      let next;

      if (isAdd) {
        next = Array.from(new Set([...current, ...tokens])).slice(0, maxReactions);
      } else {
        const toRemove = new Set(tokens);
        next = current.filter(t => !toRemove.has(t));
      }

      if (next.length === 0 && !isAdd) {
        await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
      } else {
        await MentionReaction.findOneAndUpdate(
          { guildId, userId: ownerId },
          { $set: { reactions: next } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => {});
      }

            await refreshProfileCustomReactionPanel(interaction, ownerId);

            await m.delete().catch(() => {});
      await interaction.deleteReply().catch(() => {});
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time" && collected.size === 0) {
        await interaction.editReply({
          content: "<:VC_Clock:1473359204189474886> Tempo scaduto. Clicca di nuovo il bottone per riprovare.",
        }).catch(() => {});
      }
    });

    return true;
  }

  if (action === "clear") {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
    await refreshProfileCustomReactionPanel(interaction, ownerId, { updateInteraction: true });
    return true;
  }

  return false;
}

async function handleCustomReactionModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith("customreaction_modal_add:")) return false;
  const parts = customId.split(":");
  const ownerId = parts[1];
  if (!ownerId) return true;
  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Non puoi modificare queste impostazioni.",
      flags: PRIVATE_FLAG,
    });
    return true;
  }

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;
  const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;

  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

  const raw = interaction.fields.getTextInputValue("value") || "";
  const tokens = parseReactionTokens(raw, maxReactions, interaction.guild);
  if (!tokens.length) {
    await interaction.editReply({
      content:
        "<:vegax:1443934876440068179> Nessuna reaction valida. Usa emoji unicode, `<:nome:id>` (anche da altri server dove il bot è presente) o `:nome:` risolto su questo server o su altri server del bot.",
    }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.editReply({ content: "<:vegax:1443934876440068179> Errore server." }).catch(() => {});
    return true;
  }

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const current = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
  const next = Array.from(new Set([...current, ...tokens])).slice(0, maxReactions);

  if (!next.length) {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
  } else {
    await MentionReaction.findOneAndUpdate(
      { guildId, userId: ownerId },
      { $set: { reactions: next } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
  }

  await interaction.editReply({
    content: "<:vegacheckmark:1443666279058772028> Reaction aggiornate.",
  }).catch(() => {});

  await refreshProfileCustomReactionPanel(interaction, ownerId);
  return true;
}

async function handleCustomReactionSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  const id = String(interaction.customId || "");
  const prefix = "customreaction_remove_pick:";
  if (!id.startsWith(prefix)) return false;
  const rest = id.slice(prefix.length);
  const seg = rest.split(":");
  if (seg.length < 2) return false;
  const ownerId = seg[0];
  const panelMessageId = seg[1];
  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Non puoi modificare queste impostazioni.",
      flags: PRIVATE_FLAG,
    });
    return true;
  }

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;
  const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;

  const token = interaction.values?.[0];
  if (!token) {
    await interaction.update({ content: "<:vegax:1443934876440068179> Selezione non valida.", components: [] }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) return true;

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const list = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
  const next = list.filter((t) => String(t) !== String(token));

  if (!next.length) {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
  } else {
    await MentionReaction.findOneAndUpdate(
      { guildId, userId: ownerId },
      { $set: { reactions: next } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
  }

  await interaction.update({
    content: "<:vegacheckmark:1443666279058772028> Reaction rimossa.",
    components: [],
  }).catch(() => {});

  const ch = interaction.channel;
  if (ch?.messages?.fetch) {
    const panelMessage = await ch.messages.fetch(panelMessageId).catch(() => null);
    if (panelMessage) {
      const payload = await buildPanelPayload(
        interaction.guild,
        ownerId,
        interaction.client,
        "customreaction",
      ).catch(() => null);
      if (payload) await safeMessageEdit(panelMessage, payload, interaction).catch(() => {});
    }
  }
  return true;
}

async function handleCustomVocButton(interaction) {
  if (!interaction.isButton()) return false;
  const parsed = parseVoiceActionId(interaction.customId);
  if (!parsed) return false;

  const { head, ownerId, channelId } = parsed;
  if (interaction.user.id !== ownerId) {
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
            .setDescription(
              "<a:VC_Alert:1482706673176150077> Solo il proprietario della vocale privata può usare questo controllo.",
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  const ownerVocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
  if (!ownerVocState.ok) return true;

  const channel = interaction.guild?.channels?.cache?.get(channelId) || (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction
      .reply({
        content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (head === "customvoc_add") {
    registerProfilePrompt(interaction, { type: "voc_add", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Menziona l'utente da aggiungere alla custom voc.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_remove") {
    registerProfilePrompt(interaction, { type: "voc_remove", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Menziona l'utente da rimuovere dalla custom voc.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_name") {
    registerProfilePrompt(interaction, { type: "voc_name", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Invia il nuovo nome della custom voc in questo canale.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_emoji") {
    registerProfilePrompt(interaction, { type: "voc_emoji", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Invia **un'emoji standard** (es. 🎧 🔥) in questo canale. Nel nome vocale non funzionano le emoji custom del server (`<:nome:id>`).", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  const modal = new ModalBuilder().setCustomId(`${head === "customvoc_emoji" ? "customvoc_modal_emoji" : "customvoc_modal_name"}:${ownerId}:${channelId}`,
  )
    .setTitle(
      head === "customvoc_emoji"
        ? "Imposta emoji vocale"
        : "Modifica nome vocale",
    );
  const input = new TextInputBuilder().setCustomId("value").setLabel(head === "customvoc_emoji" ? "Emoji" : "Nuovo nome").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(head === "customvoc_emoji" ? "Es: ?" : "Es: privata - lore").setMaxLength(head === "customvoc_emoji" ? 32 : 90);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
  if (!shown) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Impossibile aprire il modulo, riprova.",
      flags: 1 << 6,
    });
  }
  return true;
}

async function handleCustomVocModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  const customId = String(interaction.customId || "");
  const isNameModal = customId.startsWith("customvoc_modal_name:");
  const isEmojiModal = customId.startsWith("customvoc_modal_emoji:");
  if (!isNameModal && !isEmojiModal) return false;
  const vocParts = customId.split(":");
  if (vocParts.length !== 3) return true;
  const [, ownerId, channelId] = vocParts;
  if (!ownerId || !channelId) return true;

  const send = async (payload) => { if (interaction.deferred || interaction.replied) { return interaction.editReply(payload).catch(() => { }); } return interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => { }); };

  try {
    if (interaction.user.id !== ownerId) {
      await send({
        content:
          "<:VC_Attention:1482534443632558151> Non puoi modificare questo canale.",
      });
      return true;
    }

    const ownerVocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!ownerVocState.ok) return true;

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });

    const channel = interaction.guild?.channels?.cache?.get(channelId) || (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await send({
        content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.",
      });
      return true;
    }

    const me = interaction.guild?.members?.me || interaction.guild?.members?.cache?.get(interaction.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      await send({
        content:
          "<:VC_Attention:1482534443632558151> Mi serve il permesso Gestisci Canali.",
      });
      return true;
    }

    const raw = interaction.fields.getTextInputValue("value") || "";
    const ownerCustomRoleDoc = ownerVocState.doc || null;

    if (isEmojiModal) {
      const emoji = normalizeCustomVocEmojiValue(raw);
      if (!emoji) {
        await send({
          content: /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/.test(String(raw || ""))
            ? "<:VC_Attention:1482534443632558151> Nel nome della vocale puoi usare solo **emoji standard** (es. 🎧 🔥), non quelle custom del server (`<:nome:id>`)."
            : "<:vegax:1443934876440068179> Emoji non valida. Invia un'emoji standard (unicode), es. 🎧",
        });
        return true;
      }
      if (ownerCustomRoleDoc) {
        await CustomRole.updateOne(
          { guildId: interaction.guild.id, userId: ownerId },
          { $set: { customVocEmoji: emoji } },
        ).catch(() => { });
      }
      const parsedCurrent = parseCustomVocName(channel.name || "");
      const currentBase = parsedCurrent.baseName || "privata";
      const nextNameFromEmoji = buildCustomVocName(emoji, currentBase);
      await channel
        .edit(
          { name: nextNameFromEmoji },
          `Custom voc emoji by ${interaction.user.tag}`,
        )
        .catch(() => { });
      await send({
        content: `<:success:1461731530333229226> Emoji aggiornata: ${emoji}`,
      });
      return true;
    }

    const parsedCurrent = parseCustomVocName(channel.name || "");
    const preservedEmoji = parsedCurrent.emoji || ownerCustomRoleDoc?.customVocEmoji || "🎧";
    const nextName = buildCustomVocName(preservedEmoji, raw);
    await channel
      .edit({ name: nextName }, `Custom voc rename by ${interaction.user.tag}`)
      .catch(() => { });
    await send({
      content: `<:success:1461731530333229226> Nome aggiornato: \`${nextName}\``,
    });
    return true;
  } catch (error) {
    global.logger.error(error);
    await send({
      content:
        "<:vegax:1443934876440068179> Errore durante la modifica della vocale.",
    });
    return true;
  }
}
async function handleGrantButtons(interaction) {
  if (
    !interaction.isButton() ||
    !String(interaction.customId || "").startsWith("customrole_grant:")
  )
    return false;

  const grantParts = String(interaction.customId).split(":");
  if (grantParts.length !== 3) return false;
  const [, token, action] = grantParts;
  if (action !== "yes" && action !== "no") {
    await interaction
      .reply({
        content:
          "<:vegax:1443934876440068179> Azione richiesta non valida.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  ensurePendingLoaded();
  const request = await resolvePendingRoleGrant(token);
  if (!request) {
    await interaction
      .reply({
        content:
          "<:vegax:1443934876440068179> Questa richiesta non è più valida.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (interaction.user.id !== request.targetId) {
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
            .setDescription(
              "<a:VC_Alert:1482706673176150077>Solo l'utente invitato può rispondere a questa richiesta.",
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (Date.now() > request.expiresAt) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    await interaction
      .reply({ content: "<:VC_Refresh:1473359252276904203> Richiesta scaduta.", flags: 1 << 6 })
      .catch(() => { });
    return true;
  }

  await interaction.deferUpdate().catch(() => { });
  const updateGrantMessage = async (payload) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  const guild = await getClientGuildCached(interaction.client, request.guildId);
  const channel = request.channelId ? await fetchGuildChannel(guild, request.channelId) : null;
  const role = await fetchGuildRole(guild, request.roleId);
  const requester = await fetchGuildMember(guild, request.requesterId);
  const targetMember = await fetchGuildMember(guild, request.targetId);
  const promptMsg =
    request.promptMessageId && channel
      ? channel?.messages?.cache?.get(request.promptMessageId) ||
        (await channel?.messages?.fetch(request.promptMessageId).catch(() => null))
      : null;

  const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji("<:vegacheckmark:1443666279058772028>")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  if (action === "no") {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
              .setDescription(
                `<:vegax:1443934876440068179> ${targetMember || `<@${request.targetId}>`} ha rifiutato il ruolo ${role ? `**${role.name}**` : ""}.`,
              ),
          ],
        })
        .catch(() => { });
    }
    const rejectedEmbed = new EmbedBuilder()
      .setColor("#e67e22")
      .setTitle("<:cancel:1461730653677551691> Ruolo rifiutato")
      .setDescription(
        `<:vegax:1443934876440068179> ${targetMember || `<@${request.targetId}>`} ha rifiutato di ricevere il ruolo ${role ? `**${role.name}**` : ""}.`,
      );
    if (channel) {
      await channel.send({ embeds: [rejectedEmbed] }).catch(() => { });
    } else if (requester?.user && typeof requester.user.send === "function") {
      await requester.user.send({ embeds: [rejectedEmbed] }).catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
          .setDescription("<:vegax:1443934876440068179> Hai rifiutato il ruolo."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (!guild || !role || !targetMember || !requester) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    await updateGrantMessage({
      content:
        "<:vegax:1443934876440068179> Errore: dati richiesta non validi.",
      embeds: [],
      components: [disabledRow],
    });
    return true;
  }
  const me = guild.members.me || guild.members.cache.get(interaction.client.user.id);
  if (
    !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
              .setDescription(
                "<a:VC_Alert:1482706673176150077> Non posso assegnare questo ruolo per permessi/gerarchia.",
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("<a:VC_Alert:1482706673176150077> Il bot non può assegnare questo ruolo."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const grantApplied = await targetMember.roles
    .add(role.id, `Custom role accepted from ${requester.user.tag}`)
    .then(() => true)
    .catch(() => false);
  await deletePendingRoleGrant(token);
  persistPendingNow();
  const refreshedTargetMember = grantApplied
    ? await fetchGuildMember(guild, request.targetId).catch(() => null)
    : null;
  const rolePresentAfterGrant = Boolean(
    refreshedTargetMember?.roles?.cache?.has(role.id) ||
    targetMember.roles.cache.has(role.id),
  );
  if (!grantApplied || !rolePresentAfterGrant) {
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
              .setDescription(
                "<a:VC_Alert:1482706673176150077> L'assegnazione del ruolo non è andata a buon fine.",
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("<a:VC_Alert:1482706673176150077> Il bot non è riuscito ad assegnare questo ruolo."),
      ],
      components: [disabledRow],
    });
    return true;
  }
  if (promptMsg) {
    await promptMsg
      .edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:success:1461731530333229226> Ruolo Concesso")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> ${targetMember} ha accettato il ruolo **${role.name}**.`,
            ),
        ],
      })
      .catch(() => { });
  }
  const grantedEmbed = new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("<:success:1461731530333229226> Ruolo Concesso")
    .setDescription(
      `<:vegacheckmark:1443666279058772028> Il ruolo **${role.name}** è stato assegnato a ${targetMember}.`,
    );
  if (channel) {
    await channel.send({ embeds: [grantedEmbed] }).catch(() => { });
  } else if (requester?.user && typeof requester.user.send === "function") {
    // Grant da sito/DM-only: niente canale guild → avvisa il richiedente in DM
    await requester.user.send({ embeds: [grantedEmbed] }).catch(() => { });
  }
  await updateGrantMessage({
    embeds: [
      new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("<:success:1461731530333229226> Richiesta accettata")
        .setDescription(`<:vegacheckmark:1443666279058772028> Hai accettato il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  return true;
}

async function handleSiteRoleRequestButtons(interaction) {
  if (!interaction.isButton()) return false;
  if (!String(interaction.customId || "").startsWith("siterolerequest:")) return false;

  const parts = String(interaction.customId || "").split(":");
  const token = String(parts[1] || "").trim();
  const action = String(parts[2] || "").trim().toLowerCase();
  const request = await resolvePendingSiteRoleRequest(token);
  if (!request) {
    await interaction
      .reply({ content: "<:VC_Refresh:1473359252276904203> Questa richiesta non è più disponibile.", flags: PRIVATE_FLAG })
      .catch(() => { });
    return true;
  }

  if (String(interaction.user?.id || "") !== String(request.ownerId || "")) {
    await interaction
      .reply({
        content: "<:VC_Attention:1482534443632558151> Solo il proprietario del ruolo può rispondere a questa richiesta.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => { });
    return true;
  }

  const disabledRow = buildSiteRoleRequestButtons(token, true);
  const updateMessage = async (payload) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  if (Date.now() > Number(request.expiresAt || 0)) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:VC_update:1478721333096349817> Richiesta scaduta")
          .setDescription("La richiesta del ruolo non è più valida: tempo scaduto."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  await interaction.deferUpdate().catch(() => { });

  const guild = await getClientGuildCached(interaction.client, request.guildId);
  const role = await fetchGuildRole(guild, request.roleId);
  const requesterMember = await fetchGuildMember(guild, request.requesterId);
  const ownerMember = await fetchGuildMember(guild, request.ownerId);
  const requesterUser = await getUserCached(interaction.client, request.requesterId);

  if (action === "reject") {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
          .setDescription(
            `${requesterMember || `<@${request.requesterId}>`} non riceverà il ruolo ${role ? `**${role.name}**` : "richiesto"}.`,
          ),
      ],
      components: [disabledRow],
    });
    await requesterUser
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#e67e22")
            .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
            .setDescription(
              `La tua richiesta per il ruolo ${role ? `**${role.name}**` : "custom"} è stata rifiutata dal proprietario.`,
            ),
        ],
      })
      .catch(() => { });
    return true;
  }

  if (!guild || !role || !requesterMember || !ownerMember) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("Non riesco più a recuperare i dati di questa richiesta."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (requesterMember.roles.cache.has(role.id)) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#60a5fa")
          .setTitle("<:VC_Refresh:1473359252276904203> Richiesta già soddisfatta")
          .setDescription(`<@${request.requesterId}> possiede già il ruolo **${role.name}**.`),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const me = guild.members.me || guild.members.cache.get(interaction.client.user.id);
  if (
    !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
          .setDescription("Il bot non può assegnare questo ruolo per permessi o gerarchia."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const granted = await requesterMember.roles
    .add(role.id, `Custom role request approved by ${ownerMember.user?.tag || request.ownerId}`)
    .then(() => true)
    .catch(() => false);
  await deletePendingSiteRoleRequest(token);
  persistPendingNow();

  if (!granted) {
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("Non sono riuscito ad assegnare il ruolo all'utente richiesto."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  await updateMessage({
    embeds: [
      new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("<:success:1461731530333229226> Richiesta approvata")
        .setDescription(`<@${request.requesterId}> ha ricevuto il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  await requesterUser
    ?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("<:success:1461731530333229226> Richiesta approvata")
          .setDescription(`Il proprietario ha approvato la tua richiesta: ora hai il ruolo **${role.name}**.`),
      ],
    })
    .catch(() => { });
  return true;
}

async function handleCustomRoleInteraction(interaction) {
  if (await handleCustomReactionButton(interaction)) return true;
  if (await handleCustomReactionModal(interaction)) return true;
  if (await handleCustomReactionSelect(interaction)) return true;
  if (await handleCustomVocButton(interaction)) return true;
  if (await handleCustomVocModal(interaction)) return true;
  if (await handleAddRemoveSelectMenus(interaction)) return true;
  if (await handleGrantButtons(interaction)) return true;
  if (await handleSiteRoleRequestButtons(interaction)) return true;
  if (await handleRoleColorTypeSelect(interaction)) return true;
  if (await handleRoleActionButton(interaction)) return true;
  if (await handleRoleActionModal(interaction)) return true;
  return false;
}

async function handleCustomProfilePromptMessage(message) {
  if (!message?.guild || message.author?.bot || message.webhookId || message.system) return false;
  const key = profilePromptKey(message.guild.id, message.author.id);
  const pending = pendingProfilePrompts.get(key);
  if (!pending) return false;
  if (Date.now() > Number(pending.expiresAt || 0)) {
    clearProfilePrompt(message.guild.id, message.author.id);
    return false;
  }
  if (String(message.channelId || "") !== String(pending.channelId || "")) return false;
  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;
  if (/^annulla$/i.test(rawLine)) {
    clearProfilePrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editProfilePromptReply(message.client, pending, "<:cancel:1461730653677551691> Operazione annullata.");
    return true;
  }

  const done = async (content, refreshSection = null) => {
    clearProfilePrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    if (refreshSection) await refreshProfilePanelFromPrompt(message, pending, refreshSection);
    const edited = await editProfilePromptReply(message.client, pending, content);
    if (!edited) await message.channel.send({ content }).catch(() => {});
    return true;
  };

  const type = String(pending.type || "");
  if (type.startsWith("role_")) {
    const resolved = await resolvePromptRole(message, pending);
    if (!resolved.ok) {
      return done(resolved.reason === "no_manage_role" ? "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo." : "<:VC_Attention:1482534443632558151> Ruolo non trovato, riapri [Personalizza](https://www.viniliecaffe.it/personalizza/).");
    }
    const role = resolved.role;
    const refreshSection = customRolePanelSectionForRoleId(resolved.state, pending.roleId);
    if (type === "role_name") {
      const cleaned = rawLine.replace(/\s+/g, " ").trim();
      const name = (cleaned.startsWith("༄") ? cleaned : `༄ ${cleaned}`).slice(0, 100).trim();
      if (!name) return false;
      const edited = await role.edit({ name }, `Custom role rename by ${message.author?.tag || message.author?.id}`).then(() => true).catch(() => false);
      return done(edited ? `<:success:1461731530333229226> Nome aggiornato: **${name}**` : "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il nome del ruolo.", refreshSection);
    }
    if (type === "role_color") {
      const member = await message.guild.members.fetch(pending.ownerId).catch(() => null);
      if (/^olografico$/i.test(rawLine) || /^holo$/i.test(rawLine)) {
        if (!memberHasCustomRoleGradientHoloAccess(member)) return done(GRADIENT_HOLO_DENIED_MSG);
        const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
        const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${message.author?.tag || message.author?.id}`).then(() => true).catch(() => false);
        return done(edited ? "<:success:1461731530333229226> Stile olografico applicato." : "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare lo stile olografico.", refreshSection);
      }
      const hexes = rawLine.match(/#?[0-9a-fA-F]{6}/g) || [];
      const hex1 = normalizeHex(hexes[0]);
      const hex2 = normalizeHex(hexes[1]);
      if (!hex1) return false;
      if (hex2) {
        if (!memberHasCustomRoleGradientHoloAccess(member)) return done(GRADIENT_HOLO_DENIED_MSG);
        const edited = await role.edit({ colors: { primaryColor: hex1, secondaryColor: hex2 } }, `Custom role gradient by ${message.author?.tag || message.author?.id}`).then(() => true).catch(() => false);
        return done(edited ? `<:success:1461731530333229226> Gradiente aggiornato: \`${hex1}\` → \`${hex2}\`` : "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare il gradiente.", refreshSection);
      }
      const edited = await role.edit({ colors: { primaryColor: hex1 } }, `Custom role color by ${message.author?.tag || message.author?.id}`).then(() => true).catch(() => false);
      return done(edited ? `<:success:1461731530333229226> Colore aggiornato: \`${hex1}\`` : "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il colore del ruolo.", refreshSection);
    }
    if (type === "role_emoji") {
      const input = extractRoleIconInputFromMessage(message) || rawLine;
      if (!input) return false;
      const result = await applyRoleIconValue(message, role, input);
      return done(result.content, refreshSection);
    }
    if (type === "role_add" || type === "role_remove") {
      const targetId = extractMentionOrId(message);
      if (!targetId) return false;
      if (targetId === String(pending.ownerId || "")) {
        return done("<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso.");
      }
      const targetMember = await getGuildMemberCached(message.guild, targetId);
      if (!targetMember || targetMember.user?.bot) return done("<:vegax:1443934876440068179> Utente non valido.");
      if (type === "role_add") {
        const started = await createCustomRoleGrantRequest({ client: message.client, guildId: message.guild.id, channelId: message.channel.id, requesterId: pending.ownerId, targetId, roleId: role.id });
        return done(started?.ok ? `<:thumbsup:1471292172145004768> Ho inviato la richiesta in DM a <@${targetId}>.` : "<:VC_Attention:1482534443632558151> Non sono riuscito ad avviare la richiesta (DM chiusi o errore).");
      }
      if (
        hasPendingRoleGrantFor({
          guildId: message.guild.id,
          requesterId: pending.ownerId,
          targetId,
          roleId: role.id,
        })
      ) {
        return done(
          "<:VC_Attention:1482534443632558151> C'è ancora una richiesta in attesa di accettazione per questo utente. Attendi la risposta o scrivi `annulla`.",
        );
      }
      await targetMember.roles.remove(role.id, `Custom role member removal by ${message.author?.tag || message.author?.id}`).catch(() => {});
      await targetMember.send({ embeds: [new EmbedBuilder().setColor("#e74c3c").setTitle("<:VC_Attention:1482534443632558151> Ruolo Rimosso").setDescription(`Sei stato rimosso dal ruolo personalizzato **${role.name}** in **${message.guild.name}**.`)] }).catch(() => {});
      return done(`<:thumbsdown:1471292163957457013> L'utente ${targetMember} è stato rimosso dal tuo ruolo.`);
    }
  }

  if (type.startsWith("voc_")) {
    const ownerId = String(pending.ownerId || "");
    const channelId = String(pending.vocChannelId || "");
    const channel = message.guild?.channels?.cache?.get(channelId) || (await message.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) return done("<:VC_Attention:1482534443632558151> Canale vocale non trovato.", "customvoc");
    const ownerDoc = await CustomRole.findOne({ guildId: message.guild.id, userId: ownerId }, { customVocEmoji: 1, customVocChannelId: 1 }).lean().catch(() => null);
    const linkedInDb = String(ownerDoc?.customVocChannelId || "").trim() === channelId;
    const ownerOverwrite = channel.permissionOverwrites?.cache?.get?.(ownerId);
    const looksLikeOwner =
      Boolean(ownerOverwrite?.allow?.has(PermissionsBitField.Flags.ManageChannels)) ||
      Boolean(ownerOverwrite?.allow?.has(PermissionsBitField.Flags.MoveMembers));
        if (!linkedInDb && !looksLikeOwner) {
      return done("<:VC_Attention:1482534443632558151> Questa vocale non risulta più collegata al tuo profilo.", "customvoc");
    }
    if (linkedInDb && !looksLikeOwner) {
      await applyOverwrite(channel, ownerId, CUSTOM_VOC_OWNER_BASE_PERMS, "Custom voc: ripristino permessi proprietario").catch(() => false);
    }
    const me = message.guild?.members?.me || message.guild?.members?.cache?.get(message.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return done("<:VC_Attention:1482534443632558151> Mi serve il permesso Gestisci Canali.");
    if (type === "voc_name") {
      const parsedCurrent = parseCustomVocName(channel.name || "");
      const preservedEmoji = parsedCurrent.emoji || ownerDoc?.customVocEmoji || "🎧";
      const nextName = buildCustomVocName(preservedEmoji, rawLine);
      await channel.edit({ name: nextName }, `Custom voc rename by ${message.author?.tag || message.author?.id}`).catch(() => {});
      return done(`<:success:1461731530333229226> Nome aggiornato: \`${nextName}\``, "customvoc");
    }
    if (type === "voc_emoji") {
      const emoji = extractCustomVocEmojiFromMessage(message) || normalizeCustomVocEmojiValue(rawLine);
      if (!emoji) {
        const hadCustom = /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/.test(String(message.content || ""));
        if (hadCustom) {
          return done(
            "<:VC_Attention:1482534443632558151> Nel nome della vocale puoi usare solo **emoji standard** (es. 🎧 🔥), non quelle custom del server. Invia l'emoji dal picker unicode di Discord.",
          );
        }
        return false;
      }
      const parsedCurrent = parseCustomVocName(channel.name || "");
      const nextName = buildCustomVocName(emoji, parsedCurrent.baseName || "privata");
      const edited = await channel
        .edit({ name: nextName }, `Custom voc emoji by ${message.author?.tag || message.author?.id}`)
        .then(() => true)
        .catch(() => false);
      if (!edited) {
        return done("<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il nome della vocale. Prova con un'altra emoji standard.");
      }
      await CustomRole.updateOne({ guildId: message.guild.id, userId: ownerId }, { $set: { customVocEmoji: emoji } }).catch(() => {});
      return done(`<:success:1461731530333229226> Emoji aggiornata: ${emoji}`, "customvoc");
    }
    if (type === "voc_add" || type === "voc_remove") {
      const targetId = extractMentionOrId(message);
      if (!targetId) return false;
      if (targetId === ownerId || targetId === String(message.client.user?.id || "")) return done("<:VC_Attention:1482534443632558151> Non puoi usare questa azione su proprietario o bot.");
      if (type === "voc_add") {
        await channel.permissionOverwrites.edit(targetId, CUSTOM_VOC_MEMBER_PERMS, {
          reason: `Custom voc grant by ${message.author?.tag || message.author?.id}`,
          type: OverwriteType.Member,
        }).catch(() => {});
        return done(`<:thumbsup:1471292172145004768> <@${targetId}> ora può accedere alla tua custom voc.`);
      }
      await channel.permissionOverwrites.delete(targetId, `Custom voc revoke by ${message.author?.tag || message.author?.id}`).catch(() => {});
      return done(`<:thumbsdown:1471292163957457013> <@${targetId}> non ha più accesso alla tua custom voc.`);
    }
  }

  return false;
}

function getPendingRoleGrantByToken(token) {
  if (!token) return null;
  ensurePendingLoaded();
  return pendingRoleGrants.get(String(token)) || null;
}

module.exports = {
  handleCustomRoleInteraction,
  handleCustomProfilePromptMessage,
  createCustomRoleGrantRequest,
  createSiteRoleJoinRequest,
  getPendingRoleGrantByToken,
  clearProfilePrompt,
  cancelProfilePrompt,
};