/** Ruoli personalizzati: risposte scritte in chat dopo un pulsante del profilo. */
const { EmbedBuilder, PermissionsBitField, ChannelType, InteractionWebhook, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { parseCustomVocName, buildCustomVocName, extractCustomVocEmojiFromMessage, normalizeCustomVocEmojiValue } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { CUSTOM_VOC_MEMBER_PERMS, CUSTOM_VOC_OWNER_BASE_PERMS, applyOverwrite } = require("../../Services/Community/customVocPermissionsService") as typeof import("../../Services/Community/customVocPermissionsService");
const { hasPendingRoleGrantFor } = require("./customRolePending") as typeof import("./customRolePending");
const { memberHasCustomRoleGradientHoloAccess, extractMentionOrId, normalizeHex, extractRoleIconInputFromMessage, resolvePromptRole, customRolePanelSectionForRoleId, applyRoleIconValue } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { createCustomRoleGrantRequest } = require("./customRoleRequests") as typeof import("./customRoleRequests");

const pendingProfilePrompts = new Map();
const PROFILE_PROMPT_TTL_MS = 90_000;
const GRADIENT_HOLO_DENIED_MSG = "<:VC_Attention:1482534443632558151> **Gradiente** e **olografico** sono riservati a chi ha ruolo **VIP**, **Server Booster**, **Double Booster** o **VIP+**. Gli altri possono usare solo il **colore solido** (stesso menu → Solido).";

function profilePromptKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function clearProfilePrompt(guildId?, userId?) {
  const key = profilePromptKey(guildId, userId);
  const old = pendingProfilePrompts.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  pendingProfilePrompts.delete(key);
}

async function cancelProfilePrompt(guildId?, userId?, client?, content?) {
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

function registerProfilePrompt(interaction?, data?) {
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

async function editProfilePromptReply(client?, pending?, content?) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return false;
  const hook = new InteractionWebhook(client, appId, token);
  return hook.editMessage("@original", { content, embeds: [], components: [] }).then(() => true).catch(() => false);
}

async function refreshProfilePanelFromPrompt(..._args: any[]) {
  return;
}

async function handleCustomProfilePromptMessage(message?) {
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

  const done = async (content?, refreshSection = null) => {
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
    /* vocOwnerNoPerms1: il proprietario non ha più permessi Discord sulla vocale, la riconosce solo il database */
    const linkedInDb = String(ownerDoc?.customVocChannelId || "").trim() === channelId;
    if (!linkedInDb) {
      return done("<:VC_Attention:1482534443632558151> Questa vocale non risulta più collegata al tuo profilo.", "customvoc");
    }
    await applyOverwrite(channel, ownerId, CUSTOM_VOC_OWNER_BASE_PERMS, "Custom voc: ripristino permessi proprietario").catch(() => false);
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

export = { GRADIENT_HOLO_DENIED_MSG, clearProfilePrompt, cancelProfilePrompt, registerProfilePrompt, handleCustomProfilePromptMessage };
