/** Ruoli personalizzati: controlli e utilità (proprietario, colore, icona, pannello). */
const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getCustomReactionMax, memberHasCustomReactionRoleAccess, findEmojiByShortName, resolveStoredCustomEmojiFromClient } = require("../../Utils/Community/mentionReactionPanelUtils") as typeof import("../../Utils/Community/mentionReactionPanelUtils");
const axios = require("axios") as typeof import("axios").default;
const { resolveCustomRoleState, buildExpiryText } = require("../../Utils/Community/customRoleState") as typeof import("../../Utils/Community/customRoleState");
const { fetchGuildRole, replyEphemeral, refreshEmbedRoleLine } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const PRIVATE_FLAG = 1 << 6;
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;
const CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS = [ IDs?.roles?.VIP, IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, ].filter(Boolean);

async function getGuildMemberForOwner(interaction?, ownerId?) {
  if (interaction.member && String(interaction.member.id) === String(ownerId)) return interaction.member;
  return interaction.guild?.members?.fetch?.(ownerId).catch(() => null) || null;
}

function memberHasCustomRoleGradientHoloAccess(member?) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
}

function canManageRoleFromGuild(guild?, client?, role?) {
  const me = guild?.members?.me || guild?.members?.cache?.get(client?.user?.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return false;
  if (!role) return false;
  return role.position < me.roles.highest.position;
}

function isSafeRoleIconUrl(raw?) {
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

function extractMentionOrId(message?) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);
  const match = String(message?.content || "").match(/\d{16,20}/);
  return match ? String(match[0]) : "";
}

function normalizeHex(raw?) {
  const value = String(raw || "").trim();
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "";
}

const CUSTOM_EMOJI_TOKEN_RE = /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/;

function extractRoleIconInputFromMessage(message?) {
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

function resolveCustomEmojiFromInput(message?, value?) {
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

async function resolvePromptRole(message?, pending?) {
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

function customRolePanelSectionForRoleId(docOrState?, roleId?) {
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

async function applyRoleIconValue(message?, role?, rawValue?) {
  const value = String(rawValue || "").trim();
  const actor = message.author?.tag || message.author?.id || "profile prompt";
  const confirm = async (checkFn?) => {
    const liveRole = await fetchGuildRole(message.guild, role.id).catch(() => null);
    return Boolean((liveRole || role) && checkFn(liveRole || role));
  };
  if (!value || /^nessuno$/i.test(value) || /^rimuovi$/i.test(value)) {
    const edited = await role.edit({ unicodeEmoji: null, icon: null }, `Custom role icon cleared by ${actor}`).then(() => true).catch(() => false);
    return edited || await confirm((liveRole?) => !liveRole.icon && !liveRole.unicodeEmoji)
      ? { ok: true, content: "<:success:1461731530333229226> Icona rimossa." }
      : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito a rimuovere l'icona del ruolo." };
  }
  const isUrl = /^https?:\/\/\S+$/i.test(value);
  let iconBuffer = null;
  let successContent = "<:success:1461731530333229226> Icona ruolo aggiornata.";
  if (isUrl) {
    if (!isSafeRoleIconUrl(value)) return { ok: false, content: "<:VC_Attention:1482534443632558151> URL non sicuro o non supportato. Usa un link `https` pubblico." };
    iconBuffer = await axios.get(value, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES, validateStatus: (status?) => status >= 200 && status < 300 }).then((r?) => Buffer.from(r.data)).catch(() => null);
    if (!iconBuffer) return { ok: false, content: "<:VC_Attention:1482534443632558151> URL immagine non valida o non raggiungibile." };
  } else {
    const resolvedEmoji = resolveCustomEmojiFromInput(message, value);
    if (resolvedEmoji?.id) {
      const foundId = String(resolvedEmoji.id);
      const animated = Boolean(resolvedEmoji.animated);
      const emojiUrl = `https://cdn.discordapp.com/emojis/${foundId}.${animated ? "gif" : "png"}?size=128&quality=lossless`;
      iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_ROLE_ICON_BYTES, maxBodyLength: MAX_ROLE_ICON_BYTES }).then((r?) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null).catch(() => null);
      successContent = "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.";
      if (!iconBuffer) return { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Riprova o incolla un URL immagine." };
    }
  }
  if (iconBuffer) {
    const edited = await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon by ${actor}`).then(() => true).catch(() => false);
    return edited || await confirm((liveRole?) => Boolean(liveRole.icon))
      ? { ok: true, content: successContent }
      : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." };
  }
  if (!/[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(value)) {
    return { ok: false, content: "<:VC_Attention:1482534443632558151> Valore non valido. Usa un'emoji unicode, una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine." };
  }
  let editErr = null;
  const edited = await role.edit({ unicodeEmoji: value, icon: null }, `Custom role emoji by ${actor}`).then(() => true).catch((e?) => { editErr = e; return false; });
  const applied = edited || await confirm((liveRole?) => String(liveRole.unicodeEmoji || "") === value);
  const code = editErr?.code || editErr?.rawError?.code || null;
  const msg = String(editErr?.rawError?.message || editErr?.message || "");
  const hint = code === 50035 || /role icon|unicode|emoji/i.test(msg) ? " Prova con una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine." : "";
  return applied
    ? { ok: true, content: `<:success:1461731530333229226> Icona ruolo aggiornata: ${value}` }
    : { ok: false, content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." + hint };
}

async function checkOwnership(interaction?, ownerId?) {
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

async function ensureOwnerCustomRoleActive(interaction?, ownerId?, expectedRoleId = null) {
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

async function ensureOwnerCustomReactionAllowed(interaction?, ownerId?) {
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

async function ensureOwnerCustomVocAccess(interaction?, ownerId?, expectedChannelId = null) {
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

async function fetchRole(interaction?, roleId?) {
  const guild = interaction.guild;
  if (!guild) return null;
  return (
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

async function updatePanelMessage(interaction?, panelMessageId?, role?) {
  if (!panelMessageId || !interaction.channel) return;
  const msg = interaction.channel.messages.cache.get(panelMessageId) || (await interaction.channel.messages.fetch(panelMessageId).catch(() => null));
  if (!msg) return;
  const updated = refreshEmbedRoleLine(msg.embeds?.[0], role);
  await msg.edit({ embeds: [updated] }).catch(() => { });
}

export = { PRIVATE_FLAG, MAX_ROLE_ICON_BYTES, getGuildMemberForOwner, memberHasCustomRoleGradientHoloAccess, isSafeRoleIconUrl, extractMentionOrId, normalizeHex, extractRoleIconInputFromMessage, resolvePromptRole, customRolePanelSectionForRoleId, applyRoleIconValue, checkOwnership, ensureOwnerCustomRoleActive, ensureOwnerCustomReactionAllowed, ensureOwnerCustomVocAccess, fetchRole, updatePanelMessage };
