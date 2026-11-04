const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { extractUserId } = require("../../utils/prefixModeration") as typeof import("../../utils/prefixModeration");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../../shared/utils/ephemeralMessageTtl");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const DISCORD_BULK_DELETE_MAX = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BULK_DELETE_PAUSE_MS = 850;
const SINGLE_DELETE_CONCURRENCY = 5;
const SINGLE_DELETE_PAUSE_MS = 120;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function normalizeArgToken(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function isMentionToken(raw?) {
  return /^<@!?(\d+)>$/.test(String(raw || "").trim());
}

function pickAmountToken(args?) {
  if (!Array.isArray(args) || !args.length) {
    return { token: null, invalidToken: null };
  }

  let token = null;
  let invalidToken = null;

  for (const rawArg of args) {
    const raw = String(rawArg || "").trim();
    const normalized = normalizeArgToken(raw);
    if (!normalized) continue;
    if (isMentionToken(raw)) continue;
    if (/^\d{17,20}$/.test(normalized)) continue;
    if (normalized === "all") {
      token = "all";
      continue;
    }
    if (/^\d+$/.test(normalized)) {
      token = normalized;
      continue;
    }
    if (invalidToken === null) {
      invalidToken = normalized;
    }
  }

  return { token, invalidToken };
}

function pickExplicitTargetUserId(message?, args?) {
  const mentionedId = message?.mentions?.users?.first?.()?.id || null;
  if (mentionedId) return String(mentionedId);
  if (!Array.isArray(args) || !args.length) return null;
  for (const rawArg of args) {
    const raw = String(rawArg || "").trim();
    const normalized = normalizeArgToken(raw);
    if (!normalized || normalized === "all") continue;
    if (/^\d+$/.test(normalized) && !/^\d{17,20}$/.test(normalized)) continue;
    const extracted = extractUserId(raw, message);
    if (extracted) return String(extracted);
  }
  return null;
}

function messageMatchesPurgeFilter(msg?, triggerMessageId?, user?) {
  if (!msg || msg.id === triggerMessageId) return false;
  if (msg.pinned) return false;
  if (user && msg.author?.id !== user.id) return false;
  return true;
}

function rateLimitDelayMs(err?, attempt = 0) {
  const retryAfter =
    Number(err?.retry_after) ||
    Number(err?.rawError?.retry_after) ||
    Number(err?.data?.retry_after) ||
    0;
  if (retryAfter > 0) return Math.ceil(retryAfter * 1000) + 100;
  return Math.min(8000, 1000 * (attempt + 1));
}

async function bulkDeleteSafe(channel?, messages?) {
  if (!messages.length) return { deleted: 0, failed: [] };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const deleted = await channel.bulkDelete(messages, true);
      const gone = new Set(deleted ? [...deleted.keys()] : []);
      const failed = messages.filter((m?) => !gone.has(m.id));
      return { deleted: deleted?.size || 0, failed };
    } catch (err) {
      const status = Number(err?.status || err?.code || err?.httpStatus);
      if (status === 429) {
        await sleep(rateLimitDelayMs(err, attempt));
        continue;
      }
      global.logger?.warn?.("[purge] bulkDelete fallito:", err?.message || err);
      return { deleted: 0, failed: messages };
    }
  }
  return { deleted: 0, failed: messages };
}

async function deleteMessagesConcurrently(messages?, concurrency = SINGLE_DELETE_CONCURRENCY, pauseMs = SINGLE_DELETE_PAUSE_MS) {
  if (!messages.length) return 0;
  let deleted = 0;
  for (let i = 0; i < messages.length; i += concurrency) {
    const slice = messages.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(async (msg?) => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            await msg.delete();
            return true;
          } catch (err) {
            const status = Number(err?.status || err?.code || err?.httpStatus);
            if (status === 429) {
              await sleep(rateLimitDelayMs(err, attempt));
              continue;
            }
            return false;
          }
        }
        return false;
      }),
    );
    deleted += results.filter(Boolean).length;
    if (i + concurrency < messages.length) await sleep(pauseMs);
  }
  return deleted;
}

async function deletePurgeBatch(channel?, messages?) {
  if (!messages.length) return 0;
  const now = Date.now();
  const recent = [];
  const old = [];

  for (const msg of messages) {
    if (!msg.deletable) continue;
    if (now - msg.createdTimestamp < BULK_DELETE_MAX_AGE_MS) recent.push(msg);
    else old.push(msg);
  }

  let deletedCount = 0;
  const bulkable = recent.filter((m?) => m.bulkDeletable);
  const singleRecent = recent.filter((m?) => !m.bulkDeletable);

  if (bulkable.length) {
    const { deleted, failed } = await bulkDeleteSafe(channel, bulkable);
    deletedCount += deleted;
    if (failed.length) {
      deletedCount += await deleteMessagesConcurrently(failed, 3, 180);
    }
    if (bulkable.length) await sleep(BULK_DELETE_PAUSE_MS);
  }

  if (singleRecent.length) {
    deletedCount += await deleteMessagesConcurrently(singleRecent);
  }

  if (old.length) {
    deletedCount += await deleteMessagesConcurrently(old);
  }

  return deletedCount;
}

async function runPurge(channel?, options?) {
  const {
    targetCount,
    user,
    triggerMessageId,
    typingEveryRounds = 8,
  } = options;

  let deletedCount = 0;
  let identified = 0;
  let scanned = 0;
  let cursor = null;
  let rounds = 0;

  while (deletedCount < targetCount) {
    const batch = await channel.messages
      .fetch({
        limit: DISCORD_BULK_DELETE_MAX,
        ...(cursor ? { before: cursor } : {}),
      })
      .catch(() => null);

    if (!batch?.size) break;

    rounds += 1;
    scanned += batch.size;
    cursor = batch.last()?.id || null;

    const remainingNeeded = Number.isFinite(targetCount) ? Math.max(0, targetCount - identified) : Infinity;
    const matches = [];
    for (const msg of batch.values()) {
      if (!messageMatchesPurgeFilter(msg, triggerMessageId, user)) continue;
      matches.push(msg);
      if (matches.length >= remainingNeeded) break;
    }
    identified += matches.length;

    const remainingDelete = targetCount - deletedCount;
    const toDelete =
      Number.isFinite(targetCount) && remainingDelete < matches.length
        ? matches.slice(0, remainingDelete)
        : matches;

    if (toDelete.length) {
      deletedCount += await deletePurgeBatch(channel, toDelete);
    }

    if (!cursor) break;
    if (deletedCount >= targetCount && Number.isFinite(targetCount)) break;
    if (rounds % typingEveryRounds === 0) {
      await channel.sendTyping().catch(() => {});
    }
  }

  return { deletedCount, identified, scanned };
}

export = {
  name: "purge",
  fireAndForget: true,

  async execute(message?, args?, client?) {
    const channel = message.channel;
    const triggerMessageId = message.id;
    const deleteLater = (msg?) => {
      scheduleMessageDeletion(msg, EPHEMERAL_TTL_NORMAL_MS);
      return null;
    };
    const replyTemp = async (payload?) => {
      const msg = await channel.send({
        ...payload,
        allowedMentions: { repliedUser: false },
      });
      deleteLater(msg);
      return msg;
    };

    await channel.sendTyping().catch(() => {});
    await message.delete().catch(() => {});

    const targetUserId = pickExplicitTargetUserId(message, args);
    const user = targetUserId
      ? await message.client.users.fetch(targetUserId).catch(() => null)
      : null;

    const { token: amountToken, invalidToken } = pickAmountToken(args);
    const requestedRaw = normalizeArgToken(amountToken);
    const requestedAmount = Number(requestedRaw);
    const hasNumericAmount = Number.isFinite(requestedAmount) && requestedAmount > 0;

    if (
      (requestedRaw && requestedRaw !== "all" && !hasNumericAmount) ||
      (!requestedRaw && invalidToken)
    ) {
      await replyTemp({
        content:
          `${E.vegax} Quantità non valida. Usa un numero positivo oppure \`all\`.`,
      });
      return;
    }

    const targetCount = hasNumericAmount ? requestedAmount : Number.POSITIVE_INFINITY;

    try {
      const { deletedCount, identified, scanned } = await runPurge(channel, {
        targetCount,
        user,
        triggerMessageId,
      });

      if (!deletedCount) {
        await replyTemp({
          content: `${E.vegax} Nessun messaggio da eliminare.`,
        });
        return;
      }

      const summary = new EmbedBuilder()
        .setColor(client.config?.embedModLight || "#6f4e37")
        .setDescription(
          `#️⃣ **Channel:** <#${channel.id}>\n` +
            `👤 **Moderator:** <@${message.author.id}>\n` +
            `🗂️ **Messages Fetched:** ${scanned}\n` +
            `💬 **Purge Request:** ${Number.isFinite(targetCount) ? targetCount : "ALL"}\n` +
            `🧭 **Messages Identified:** ${identified}\n` +
            `🗑️ **Messages Purged:** ${deletedCount}`,
        );

      await replyTemp({ embeds: [summary] });
    } catch (err) {
      global.logger?.error?.("[purge] purge run failed:", err?.stack || err?.message || err);
      await replyTemp({
        content:
          `${E.vegax} Purge interrotto per un errore. Controlla i log del bot.`,
      }).catch(() => null);
    }
  },
};
