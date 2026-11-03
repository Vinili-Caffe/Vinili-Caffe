/** Repost: pulsanti dei messaggi in bacheca sempre aggiornati. */
const { GuildRepost } = require("../schemas/guildBoardPostSchema") as typeof import("../schemas/guildBoardPostSchema");
const { ensureMongoReady, withMongoTimeout } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { REPOST_REMOVE_PREFIX, buildBoardMessageComponents, buildRepostRemovedEmbed } = require("./repostEmbeds") as typeof import("./repostEmbeds");

const REPOST_DB_MS = 7000;
const REPOST_DB_READY_MS = 2500;

async function ensureRepostDbReady() {
  return ensureMongoReady({ maxWaitMs: REPOST_DB_READY_MS });
}

function timedRepostQuery(queryPromise?, label?) {
  const q = queryPromise?.maxTimeMS?.(REPOST_DB_MS) || queryPromise;
  return withMongoTimeout(q, REPOST_DB_MS + 500, label);
}

function flattenBoardCustomIds(rows?) {
  return (rows || [])
    .flatMap((row?) => row.components || [])
    .map((comp?) => String(comp.customId || "").trim())
    .filter(Boolean);
}

function boardCustomIdSet(rows?) {
  return new Set(flattenBoardCustomIds(rows));
}

function componentsMatchBoardState(existingComponents?, expectedComponents?) {
  const a = flattenBoardCustomIds(existingComponents).sort().join("|");
  const b = flattenBoardCustomIds(expectedComponents).sort().join("|");
  return a === b;
}

function boardNeedsRemoveButtonRefresh(existingComponents?, expectedComponents?) {
  const existing = boardCustomIdSet(existingComponents);
  const expected = boardCustomIdSet(expectedComponents);
  for (const id of expected) {
    if (!existing.has(id)) return true;
  }
  for (const id of existing) {
    if ((id as any).startsWith(REPOST_REMOVE_PREFIX) && !expected.has(id)) return true;
  }
  const hasModernRemove = [...existing].some((id?) => /^repost_remove:[a-f0-9]{24}$/i.test((id as any)));
  const expectsRemove = [...expected].some((id?: any) => id.startsWith(REPOST_REMOVE_PREFIX));
  if (expectsRemove && !hasModernRemove) return true;
    const existingLabels = new Set(
    (existingComponents || [])
      .flatMap((row?) => row.components || [])
      .filter((comp?) => String(comp.customId || "").startsWith(REPOST_REMOVE_PREFIX))
      .map((comp?) => String(comp.label || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedLabels = new Set(
    (expectedComponents || [])
      .flatMap((row?) => row.components || [])
      .filter((comp?) => String(comp.customId || "").startsWith(REPOST_REMOVE_PREFIX))
      .map((comp?) => String(comp.label || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (expectedLabels.size) {
    for (const label of expectedLabels) {
      if (!existingLabels.has(label)) return true;
    }
  }
  return !componentsMatchBoardState(existingComponents, expectedComponents);
}

async function resolveBoardMessageComponents(guild?, boardChannelId?, boardMessageId?) {
  const gid = String(guild?.id || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!gid || !bc || !bm) return [];
  const docs = await timedRepostQuery(
    GuildRepost.find({ guildId: gid, boardChannelId: bc, boardMessageId: bm }).sort({ createdAt: -1 }).lean(),
    "repost board docs",
  ).catch(() => []);
  if (!docs?.length) return [];
  const primary = docs[0];
  return buildBoardMessageComponents(String(primary._id), primary);
}

function isUnknownDiscordResourceError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
    return code === 10003 || code === 10008;
}

function attachmentKeepRefs(message?) {
  const list =
    typeof message?.attachments?.values === "function"
      ? [...message.attachments.values()]
      : Array.isArray(message?.attachments)
        ? message.attachments
        : [];
  return list
    .map((att?) => String(att?.id || "").trim())
    .filter((id?) => /^\d{17,22}$/.test(id))
    .map((id?) => ({ id }));
}

async function editBoardMessageKeepAttachments(boardMsg?, patch?) {
  if (!boardMsg?.edit) return false;
  const keep = attachmentKeepRefs(boardMsg);
  const payload = { ...(patch || {}) };
    if (keep.length) payload.attachments = keep;
  const edited = await boardMsg.edit(payload).then(() => true).catch(() => false);
  return edited;
}

async function syncBoardMessageComponentsDetailed(guild?, boardChannelId?, boardMessageId?) {
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessageId || "").trim();
  if (!guild || !cid || !mid) return { ok: false, reason: "bad_args" };

  let channelErr = null;
  const channel =
    guild.channels.cache.get(cid) ||
    (await guild.channels.fetch(cid).catch((err?) => {
      channelErr = err;
      return null;
    }));
  if (!channel?.isTextBased?.()) {
    if (channelErr && isUnknownDiscordResourceError(channelErr)) {
      return { ok: false, reason: "channel_missing", orphan: true, code: Number(channelErr.code || 0) };
    }
    return { ok: false, reason: channelErr ? "channel_fetch_failed" : "channel_not_text", code: Number(channelErr?.code || 0) || undefined };
  }

  let messageErr = null;
  const boardMsg = await channel.messages.fetch(mid).catch((err?) => {
    messageErr = err;
    return null;
  });
  if (!boardMsg) {
    if (messageErr && isUnknownDiscordResourceError(messageErr)) {
      return { ok: false, reason: "message_missing", orphan: true, code: Number(messageErr.code || 0) };
    }
    return { ok: false, reason: "message_fetch_failed", code: Number(messageErr?.code || 0) || undefined };
  }

  const components = await resolveBoardMessageComponents(guild, cid, mid);
  if (!components.length) return { ok: false, reason: "empty_components" };
  if (!boardNeedsRemoveButtonRefresh(boardMsg.components, components)) return { ok: true, reason: "already_current" };

  let editErr = null;
  const edited = await editBoardMessageKeepAttachments(boardMsg, { components })
    .then((ok?) => ok)
    .catch((err?) => {
      editErr = err;
      return false;
    });
  if (edited) return { ok: true, reason: "edited" };
  return { ok: false, reason: "edit_failed", code: Number(editErr?.code || 0) || undefined };
}

async function syncBoardMessageComponents(guild?, boardChannelId?, boardMessageId?) {
  const result = await syncBoardMessageComponentsDetailed(guild, boardChannelId, boardMessageId);
  return Boolean(result?.ok);
}

async function ensureBoardRepostaButton(guild?, boardChannelId?, boardMessageId?, repostId?) {
  await syncBoardMessageComponents(guild, boardChannelId, boardMessageId);
}

async function applyBoardMessageRemovedState(guild?, boardChannelId?, boardMessageId?, userId?, isClip?) {
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessageId || "").trim();
  if (!guild || !cid || !mid) return;
  const channel =
    guild.channels.cache.get(cid) ||
    (await guild.channels.fetch(cid).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const boardMsg = await channel.messages.fetch(mid).catch(() => null);
  if (!boardMsg) return;
  const removedEmbed = buildRepostRemovedEmbed({ userId, isClip });
  await boardMsg
    .edit({ embeds: [removedEmbed], components: [], files: [], attachments: [] })
    .catch(() => boardMsg.delete().catch(() => null));
}

export = { REPOST_DB_MS, ensureRepostDbReady, timedRepostQuery, editBoardMessageKeepAttachments, syncBoardMessageComponents, ensureBoardRepostaButton, applyBoardMessageRemovedState };
