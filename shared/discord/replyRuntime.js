function sanitizeEditPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "flags")) return payload;
  const next = { ...payload };
  delete next.flags;
  return next;
}

function isUnknownInteractionError(err) {
  return err?.code === 10062;
}

function isAlreadyAcknowledgedError(err) {
  return err?.code === 40060;
}

function isInteractionNotRepliedError(err) {
  return err?.code === "InteractionNotReplied";
}

function stripMessageReference(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...payload };
  delete next.reply;
  delete next.messageReference;
  delete next.failIfNotExists;
  if (next.allowedMentions && typeof next.allowedMentions === "object") next.allowedMentions = { ...next.allowedMentions, repliedUser: false };
  return next;
}

function isUnknownMessageReferenceError(err) {
  return err?.code === 50035 && Boolean(err?.rawError?.errors?.message_reference);
}

const AUTO_CLEANUP_ERROR_TTL_MS = 3000;
const ERROR_HINTS = [
  "errore",
  "error",
  "non valido",
  "invalid",
  "permesso",
  "permission",
  "non puoi",
  "impossibile",
  "attendi",
  "warning",
  "warn",
  "not found",
];

function normalizeLower(value) {
  return String(value || "").toLowerCase();
}

function textMatchesErrorHint(text, hint) {
  if (hint === "warn") {
    return /\bwarn(s)?\b(?!\s*points?\b)/i.test(text);
  }
  if (hint === "permission") {
    return /\bpermission\b/i.test(text);
  }
  return text.includes(hint);
}

function textLooksLikeError(value) {
  const text = normalizeLower(value);
  if (!text.trim()) return false;
  if (text.includes("vegax")) return true;
  return ERROR_HINTS.some((h) => textMatchesErrorHint(text, h));
}

function payloadLooksLikeError(payload) {
  if (!payload) return false;
  if (typeof payload === "object" && !Array.isArray(payload)) {
    const comps = payload.components;
    if (Array.isArray(comps) && comps.length > 0) return false;
  }
  if (typeof payload === "string") return textLooksLikeError(payload);
  if (typeof payload !== "object") return false;
  if (textLooksLikeError(payload.content)) return true;
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  return embeds.some((embed) => {
    if (!embed) return false;
    const title = embed.title || embed?.data?.title;
    const description = embed.description || embed?.data?.description;
    const color = embed.color ?? embed?.data?.color;
    if (textLooksLikeError(title) || textLooksLikeError(description)) return true;
    return String(color).toLowerCase() === "red";
  });
}

function scheduleDeleteMessage(messageLike, ttlMs = AUTO_CLEANUP_ERROR_TTL_MS) {
  if (!messageLike?.delete) return;
  const timer = setTimeout(() => {
    messageLike.delete().catch(() => {});
  }, ttlMs);
  timer.unref?.();
}

function maybeAutoCleanupErrorReply(sourceMessage, replyMessage, payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.skipAutoCleanup || payload.keepCommandMessage) return;
  }
  if (!payloadLooksLikeError(payload)) return;
  if (replyMessage) scheduleDeleteMessage(replyMessage, AUTO_CLEANUP_ERROR_TTL_MS);
  if (sourceMessage?.deletable) scheduleDeleteMessage(sourceMessage, AUTO_CLEANUP_ERROR_TTL_MS);
}

function logReplyError(scope, err) {
  if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return;
  if (global?.logger?.error) global.logger.error(`[REPLY:${scope}]`, err);
}

async function safeReply(interaction, payload) {
  if (!interaction) return null;
  const finalized = finalizeOutgoingPayload(payload, interaction);

  if (interaction.deferred && !interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(prepareDiscordPayload(finalized)));
    } catch (err) {
      if (isUnknownInteractionError(err)) return null;
      logReplyError("editReply(primary)", err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(prepareFreshCreatePayload(finalized));
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError("followUp(fallback)", followUpErr);
        }
      }
      try {
        return await interaction.reply(prepareFreshCreatePayload(finalized));
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError("reply(final-fallback)", replyErr);
        return null;
      }
    }
  }

  if (interaction.replied) {
    try {
      return await interaction.followUp(prepareFreshCreatePayload(finalized));
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      logReplyError("followUp(primary)", err);
      return null;
    }
  }

  try {
    return await interaction.reply(prepareFreshCreatePayload(finalized));
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError("reply(primary)", err);
    return null;
  }
}

async function safeEditReply(interaction, payload) {
  if (!interaction) return null;
  const resolvedPayload = prepareDiscordPayload(finalizeOutgoingPayload(payload, interaction));
  if (!interaction.deferred && !interaction.replied) return safeReply(interaction, resolvedPayload);

  if (interaction.deferred || interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(resolvedPayload));
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      if (isInteractionNotRepliedError(err)) return safeReply(interaction, resolvedPayload);
      logReplyError("editReply(primary)", err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(resolvedPayload);
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError("followUp(fallback)", followUpErr);
        }
      }
      try {
        return await interaction.reply(resolvedPayload);
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError("reply(final-fallback)", replyErr);
        return null;
      }
    }
  }

  try {
    return await interaction.reply(resolvedPayload);
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError("reply(fallback)", err);
    return null;
  }
}

function payloadWithReplyReference(payload, message) {
  if (!message?.id || !payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    reply: { messageReference: message.id, failIfNotExists: false },
  };
}

let pronounGenderApplier = null;
let tenantEmbedBrandingApplier = null;
let defaultFooterApplier = null;

function setPronounGenderApplier(fn) {
  pronounGenderApplier = typeof fn === "function" ? fn : null;
}

function setTenantEmbedBrandingApplier(fn) {
  tenantEmbedBrandingApplier = typeof fn === "function" ? fn : null;
}

function setDefaultFooterApplier(fn) {
  defaultFooterApplier = typeof fn === "function" ? fn : null;
}

function resolveMessageMember(message) {
  if (!message) return null;
  const direct = message.member;
  if (direct?.roles?.cache) return direct;
  const userId = message.author?.id;
  const guild = message.guild;
  if (userId && guild?.members?.cache) {
    return guild.members.cache.get(String(userId)) || direct || null;
  }
  return direct || null;
}

function resolveInteractionMember(interaction) {
  if (!interaction) return null;
  const direct = interaction.member;
  if (direct?.roles?.cache) return direct;
  const userId = interaction.user?.id;
  const guild = interaction.guild;
  if (userId && guild?.members?.cache) {
    return guild.members.cache.get(String(userId)) || direct || null;
  }
  return direct || null;
}

function maybeApplyPronounGender(payload, member) {
  if (!pronounGenderApplier || !member || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  try {
    return pronounGenderApplier(payload, member) || payload;
  } catch {
    return payload;
  }
}

function resolvePayloadGuildId(source) {
  if (!source || typeof source !== "object") return null;
  return (
    source.guild?.id ||
    source.guildId ||
    source.channel?.guild?.id ||
    source.channel?.guildId ||
    null
  );
}

function maybeApplyTenantEmbedBranding(payload, source) {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.__tenantBrandingApplied
  ) {
    return payload;
  }
  if (!tenantEmbedBrandingApplier || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const guildId = resolvePayloadGuildId(source);
  if (!guildId) return payload;
  const guild = source?.guild || source?.channel?.guild || null;
  const client = source?.client || guild?.client || source?.channel?.client || null;
  try {
    return tenantEmbedBrandingApplier(payload, { guildId, guild, client }) || payload;
  } catch {
    return payload;
  }
}

function stripTenantBrandingInternals(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...payload };
  let changed = false;
  for (const key of [
    "__tenantBrandingApplied",
    "__prefixDispatchBrandingDone",
    "includeBanner",
    "includeThumbnail",
    "includeAuthor",
    "__skipNoticeEmbed",
    "skipNoticeEmbed",
  ]) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : payload;
}

function maybeApplyDefaultFooter(payload, source) {
  if (!defaultFooterApplier || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (payload.__skipDefaultEmbedFooter) return payload;
  if (!Array.isArray(payload.embeds) || payload.embeds.length === 0) return payload;
  try {
    return defaultFooterApplier(payload, source) || payload;
  } catch {
    return payload;
  }
}

function stripDefaultFooterInternals(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...payload };
  let changed = false;
  if (Object.prototype.hasOwnProperty.call(next, "__defaultFooterApplied")) {
    delete next.__defaultFooterApplied;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, "__skipDefaultEmbedFooter")) {
    delete next.__skipDefaultEmbedFooter;
    changed = true;
  }
  return changed ? next : payload;
}

function markPrefixDispatchBrandingDone(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...payload, __prefixDispatchBrandingDone: true };
}

function prepareDiscordPayload(payload) {
  return stripTenantBrandingInternals(stripDefaultFooterInternals(payload));
}

function prepareFreshCreatePayload(payload, { stripReference = false } = {}) {
  let next = prepareDiscordPayload(payload);
  if (stripReference) next = stripMessageReference(next);
  if (!next || typeof next !== "object" || Array.isArray(next)) return next;
  next = { ...next };
  if (Array.isArray(next.files)) next.files = [...next.files];
  if (Array.isArray(next.embeds)) next.embeds = [...next.embeds];
  if (Array.isArray(next.components)) next.components = [...next.components];
  if (Array.isArray(next.stickers)) next.stickers = [...next.stickers];
  delete next.attachments;
  return next;
}

function resolveTenantBrandingHelpers() {
  try {
    return require("../../Vinyls/MultiGuild/utils/tenantEmbedBranding");
  } catch {
    return null;
  }
}

function collectExistingAttachmentRefs(source, { excludeNames = [] } = {}) {
  const message = source?.attachments ? source : source?.message || null;
  if (!message?.attachments) return [];
  const list =
    typeof message.attachments.values === "function"
      ? [...message.attachments.values()]
      : Array.isArray(message.attachments)
        ? message.attachments
        : [];
  const exclude = new Set(
    (excludeNames || [])
      .map((n) => String(n || "").trim().toLowerCase())
      .filter(Boolean),
  );
  return list
    .filter((att) => {
      const name = String(att?.name || "").trim().toLowerCase();
      if (exclude.size && name && exclude.has(name)) return false;
      return /^\d{17,22}$/.test(String(att?.id || "").trim());
    })
    .map((att) => ({ id: String(att.id) }));
}

function resolveOutgoingFileName(file) {
  if (!file) return "";
  const json = typeof file?.toJSON === "function" ? file.toJSON() : file;
  return String(file?.name || file?.data?.name || json?.name || "").trim();
}

function prepareMessageEditPayload(payload, source = null) {
  const outbound = prepareDiscordPayload(payload);
  if (!outbound || typeof outbound !== "object" || Array.isArray(outbound)) return outbound;

  const branding = resolveTenantBrandingHelpers();
  const bannerName = branding?.BRANDING_IMAGE_NAME || "tenant-standard.gif";
  const bannerAliases = [bannerName, "tenant-standard.gif", "standard.gif"];
  const hasFiles = Array.isArray(outbound.files) && outbound.files.length > 0;
  const hasBannerEmbed = branding?.payloadHasTenantBannerEmbed?.(outbound) ?? false;
  const hasExplicitAttachments = Object.prototype.hasOwnProperty.call(outbound, "attachments");
  const explicitAttachments = hasExplicitAttachments
    ? (Array.isArray(outbound.attachments) ? outbound.attachments : [])
    : null;

  const sourceHasBannerFile = (() => {
    const refs = collectExistingAttachmentRefs(source);
    if (!refs.length || !source) return false;
    const message = source?.attachments ? source : source?.message || null;
    const list =
      typeof message?.attachments?.values === "function"
        ? [...message.attachments.values()]
        : Array.isArray(message?.attachments)
          ? message.attachments
          : [];
    return list.some((att) => {
      const name = String(att?.name || "").trim().toLowerCase();
      return bannerAliases.some((alias) => name === String(alias).toLowerCase());
    });
  })();

    if (hasExplicitAttachments && explicitAttachments.length === 0) {
    return { ...outbound, attachments: [] };
  }

  if (hasFiles) {
    const incomingNames = outbound.files.map(resolveOutgoingFileName).filter(Boolean);
    const incomingHasBanner = incomingNames.some((n) =>
      bannerAliases.includes(String(n || "").trim().toLowerCase()),
    );
            const excludeNames = incomingHasBanner
      ? [...incomingNames, ...bannerAliases]
      : [...incomingNames];
    return {
      ...outbound,
      attachments:
        explicitAttachments ||
        collectExistingAttachmentRefs(source, { excludeNames }),
    };
  }

    if (hasBannerEmbed && source && !sourceHasBannerFile && branding?.createStandardGifAttachment) {
    const bannerFile = branding.createStandardGifAttachment();
    if (bannerFile) {
      const kept = collectExistingAttachmentRefs(source);
      return {
        ...outbound,
        files: [bannerFile],
        attachments: kept,
      };
    }
  }

    if (hasBannerEmbed) {
    return outbound;
  }

    if (!hasBannerEmbed && !hasFiles && source) {
    const kept = collectExistingAttachmentRefs(source, { excludeNames: bannerAliases });
    const allRefs = collectExistingAttachmentRefs(source);
    if (allRefs.length > kept.length) {
      return { ...outbound, attachments: kept };
    }
  }

    return outbound;
}

function maybeCoercePlainNoticeEmbed(payload, source) {
  if (payload == null) return payload;
  try {
    const { coercePlainContentToNoticePayload } = require("../../Vinyls/Utils/Embeds/simpleNoticeEmbed");
    const guild = source?.guild || source?.channel?.guild || null;
    return coercePlainContentToNoticePayload(payload, guild) || payload;
  } catch {
    return payload;
  }
}

function finalizeOutgoingPayload(payload, source) {
  let next = payload;
  try {
    const { applyEmergencyRoleRemapToOutgoingPayload } = require("../../Vinyls/Utils/Config/emergencyRoleIdRemap");
    next = applyEmergencyRoleRemapToOutgoingPayload(next);
  } catch (_) {}
  next = maybeCoercePlainNoticeEmbed(next, source);
  next = maybeApplyPronounGender(next, resolveMessageMember(source) || resolveInteractionMember(source));
  next = maybeApplyDefaultFooter(next, source);
  next = maybeApplyTenantEmbedBranding(next, source);
  return markPrefixDispatchBrandingDone(next);
}

function finalizeEditPayload(payload, source) {
  return prepareMessageEditPayload(
    sanitizeEditPayload(finalizeOutgoingPayload(payload, source)),
    source,
  );
}

function wrapPrototypeMethod(prototype, methodName, transformPayload, patchKey) {
  if (!prototype || typeof prototype[methodName] !== "function") return;
  if (prototype[patchKey]) return;
  const original = prototype[methodName];
  prototype[methodName] = function wrappedOutgoingEditMethod(payload, ...rest) {
    const resolved = transformPayload(payload, this);
    return original.call(this, resolved, ...rest);
  };
  prototype[patchKey] = true;
}

function installOutgoingEditBrandingPatch(discord) {
  if (!discord || discord.__viniliEditBrandingPatchInstalled) return;
  const { Message, Interaction } = discord;
  wrapPrototypeMethod(
    Message?.prototype,
    "edit",
    finalizeEditPayload,
    "__viniliEditBrandingPatched",
  );
  wrapPrototypeMethod(
    Interaction?.prototype,
    "update",
    finalizeEditPayload,
    "__viniliUpdateBrandingPatched",
  );
  discord.__viniliEditBrandingPatchInstalled = true;
}

async function findBotReplyToSourceMessage(message) {
  const channel = message?.channel;
  const clientId = message?.client?.user?.id;
  const sourceId = message?.id;
  if (!channel?.messages?.fetch || !clientId || !sourceId) return null;

  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!recent) return null;

  let best = null;
  for (const msg of recent.values()) {
    if (String(msg.author?.id) !== String(clientId)) continue;
    const refId = msg.reference?.messageId;
    if (String(refId) !== String(sourceId)) continue;
    if (!best || msg.createdTimestamp > best.createdTimestamp) best = msg;
  }
  return best;
}

async function safePrefixPanelReply(message, payload) {
  if (!message) return null;
  const resolvedPayload = finalizeOutgoingPayload(payload, message);

  if (message.__fromMessageUpdatePrefix) {
    const existing = await findBotReplyToSourceMessage(message);
    if (existing?.editable) {
      const editPayload = sanitizeEditPayload(
        prepareMessageEditPayload(stripMessageReference(resolvedPayload), existing),
      );
      const edited = await existing.edit(editPayload).catch(() => null);
      if (edited) {
        maybeAutoCleanupErrorReply(message, edited, resolvedPayload);
        return edited;
      }
    }
  }

  return safeMessageReply(message, resolvedPayload);
}

async function safeMessageReply(message, payload) {
  if (!message) return null;
  const resolvedPayload = finalizeOutgoingPayload(payload, message);
  if (typeof message.reply !== "function") {
    if (message.channel?.send) {
      try {
        const sent = await message.channel.send(
          payloadWithReplyReference(prepareFreshCreatePayload(resolvedPayload), message),
        );
        maybeAutoCleanupErrorReply(message, sent, resolvedPayload);
        return sent;
      } catch (err) {
        if (err?.code === 10008) return null;
        logReplyError("message.channel.send(fallback)", err);
        return null;
      }
    }
    return null;
  }
  try {
    const sent = await message.reply(prepareFreshCreatePayload(resolvedPayload));
    maybeAutoCleanupErrorReply(message, sent, resolvedPayload);
    return sent;
  } catch (err) {
    if (err?.code === 10008) return null;
    const canFallbackSend =
      isUnknownMessageReferenceError(err) ||
      err?.code === 50013 ||
      Number(err?.rawError?.code) === 50013;
    if (canFallbackSend && message.channel?.send) {
      try {
        const sent = await message.channel.send(prepareFreshCreatePayload(resolvedPayload));
        maybeAutoCleanupErrorReply(message, sent, resolvedPayload);
        return sent;
      } catch (fallbackErr) {
        if (fallbackErr?.code === 10008) return null;
        logReplyError("message.reply(send-fallback)", fallbackErr);
                if (
          (fallbackErr?.code === 50013 || Number(fallbackErr?.rawError?.code) === 50013) &&
          message.author &&
          typeof message.author.send === "function"
        ) {
          try {
            const dm = await message.author.send(prepareFreshCreatePayload(resolvedPayload));
            return dm;
          } catch (dmErr) {
            logReplyError("message.reply(dm-fallback)", dmErr);
          }
        }
        return null;
      }
    }
    logReplyError("message.reply", err);
  }
  return null;
}

async function safeDeferReply(interaction, payload) {
  if (!interaction) return null;
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply(payload);
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError("deferReply", err);
    return null;
  }
}

async function safeMessageEdit(targetMessage, payload, source = null) {
  if (!targetMessage?.edit) return null;
  const brandingSource = source || targetMessage;
  const resolvedPayload = prepareMessageEditPayload(
    sanitizeEditPayload(finalizeOutgoingPayload(payload, brandingSource)),
    targetMessage,
  );
  try {
    return await targetMessage.edit(resolvedPayload);
  } catch (err) {
    if (err?.code === 10008) return null;
    logReplyError("message.edit", err);
    return null;
  }
}

async function safeInteractionUpdate(interaction, payload) {
  if (!interaction) return false;
  const resolvedPayload = prepareMessageEditPayload(
    finalizeOutgoingPayload(payload, interaction),
    interaction.message || interaction,
  );
  return interaction.update(resolvedPayload).then(() => true).catch(() => false);
}

async function safePanelMessageUpdate(interaction, payload) {
  if (!interaction) return false;
  const resolvedPayload = prepareMessageEditPayload(
    finalizeOutgoingPayload(payload, interaction),
    interaction.message || interaction,
  );

  if (interaction.deferred || interaction.replied) {
    if (interaction.message?.edit) {
      return Boolean(await safeMessageEdit(interaction.message, payload, interaction));
    }
    if (interaction.editReply) {
      try {
        await interaction.editReply(sanitizeEditPayload(resolvedPayload));
        return true;
      } catch (err) {
        logReplyError("panel.editReply", err);
        return false;
      }
    }
    return false;
  }

  const updated = await safeInteractionUpdate(interaction, payload);
  if (updated) return true;
  if (interaction.message?.edit) {
    return Boolean(await safeMessageEdit(interaction.message, payload, interaction));
  }
  return false;
}

async function safeChannelSend(channel, payload) {
  if (!channel) return null;
  const resolvedPayload = finalizeOutgoingPayload(payload, channel);
  try {
    return await channel.send(prepareFreshCreatePayload(resolvedPayload));
  } catch (err) {
    if (err?.code === 10008) return null;
    if (isUnknownMessageReferenceError(err)) {
      try {
        return await channel.send(prepareFreshCreatePayload(resolvedPayload, { stripReference: true }));
      } catch (fallbackErr) {
        if (fallbackErr?.code === 10008) return null;
        logReplyError("channel.send(reference-fallback)", fallbackErr);
        return null;
      }
    }
    logReplyError("channel.send", err);
  }
  return null;
}

module.exports = {
  safeReply,
  safeEditReply,
  safeDeferReply,
  safeMessageReply,
  safeMessageEdit,
  safeInteractionUpdate,
  safePanelMessageUpdate,
  safePrefixPanelReply,
  safeChannelSend,
  installOutgoingEditBrandingPatch,
  setPronounGenderApplier,
  setTenantEmbedBrandingApplier,
  setDefaultFooterApplier,
};