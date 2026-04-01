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

function textLooksLikeError(value) {
  const text = normalizeLower(value);
  if (!text.trim()) return false;
  if (text.includes("vegax")) return true;
  return ERROR_HINTS.some((hint) => text.includes(hint));
}

function payloadLooksLikeError(payload) {
  if (!payload) return false;
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

  if (interaction.deferred && !interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(payload));
    } catch (err) {
      if (isUnknownInteractionError(err)) return null;
      logReplyError("editReply(primary)", err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(payload);
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError("followUp(fallback)", followUpErr);
        }
      }
      try {
        return await interaction.reply(payload);
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError("reply(final-fallback)", replyErr);
        return null;
      }
    }
  }

  if (interaction.replied) {
    try {
      return await interaction.followUp(payload);
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      logReplyError("followUp(primary)", err);
      return null;
    }
  }

  try {
    return await interaction.reply(payload);
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError("reply(primary)", err);
    return null;
  }
}

async function safeEditReply(interaction, payload) {
  if (!interaction) return null;
  if (!interaction.deferred && !interaction.replied) return safeReply(interaction, payload);

  if (interaction.deferred || interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(payload));
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      if (isInteractionNotRepliedError(err)) return safeReply(interaction, payload);
      logReplyError("editReply(primary)", err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(payload);
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError("followUp(fallback)", followUpErr);
        }
      }
      try {
        return await interaction.reply(payload);
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError("reply(final-fallback)", replyErr);
        return null;
      }
    }
  }

  try {
    return await interaction.reply(payload);
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

async function safeMessageReply(message, payload) {
  if (!message) return null;
  if (typeof message.reply !== "function") {
    if (message.channel?.send) {
      try {
        const sent = await message.channel.send(payloadWithReplyReference(stripMessageReference(payload), message));
        maybeAutoCleanupErrorReply(message, sent, payload);
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
    const sent = await message.reply(payload);
    maybeAutoCleanupErrorReply(message, sent, payload);
    return sent;
  } catch (err) {
    if (err?.code === 10008) return null;
    if (isUnknownMessageReferenceError(err)) {
      try {
        const sent = await message.channel.send(payloadWithReplyReference(stripMessageReference(payload), message));
        maybeAutoCleanupErrorReply(message, sent, payload);
        return sent;
      } catch (fallbackErr) {
        if (fallbackErr?.code === 10008) return null;
        logReplyError("message.reply(reference-fallback)", fallbackErr);
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

async function safeChannelSend(channel, payload) {
  if (!channel) return null;
  try {
    return await channel.send(payload);
  } catch (err) {
    if (err?.code === 10008) return null;
    if (isUnknownMessageReferenceError(err)) {
      try {
        return await channel.send(stripMessageReference(payload));
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

module.exports = { safeReply, safeEditReply, safeDeferReply, safeMessageReply, safeChannelSend };