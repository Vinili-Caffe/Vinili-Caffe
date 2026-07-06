const IDEA_CHANNEL_IDS = new Set( [ "1502239449956745247", "1502238077303783545", "1502238193821552650", "1502238107829932104", "1502238135185309696"].map(String));
const BUG_CHANNEL_IDS = new Set([ "1472009888417845330", "1502239086503792713", "1502239002084773909", "1502239043692265483"].map(String));
const OWNER_PING_CATEGORY_ANCHOR_CHANNEL_ID = "1502257275270594670";
const OWNER_PING_USER_ID = "295500038401163264";
const BOT_THREAD_PING_DEDUPE_MS = 30_000;
const REACTIONS = [ "<a:VC_Verified:1482532479637127188>", "<a:VC_Cross:1482532424570376253>"];
const EVERYONE_PING_DELETE_DELAY_MS = 5000;
const botThreadPingSent = new Map();
let cachedOwnerPingCategoryId = "";

function cleanupBotThreadPingDedupe(now = Date.now()) {
  for (const [threadId, at] of botThreadPingSent.entries()) {
    if (now - Number(at || 0) > BOT_THREAD_PING_DEDUPE_MS) botThreadPingSent.delete(threadId);
  }
}

async function resolveOwnerPingCategoryId(guild) {
  const cached = String(cachedOwnerPingCategoryId || "").trim();
  if (cached) return cached;
  if (!guild?.channels?.fetch) return "";
  const channelId = String(OWNER_PING_CATEGORY_ANCHOR_CHANNEL_ID || "").trim();
  if (!channelId) return "";
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  const categoryId = String(channel?.parentId || "").trim();
  if (categoryId) cachedOwnerPingCategoryId = categoryId;
  return categoryId;
}

function channelBelongsToOwnerPingCategory(channelLike, categoryId) {
  const category = String(categoryId || "").trim();
  if (!category || !channelLike) return false;
  if (channelLike.isThread?.()) {
    const parent = channelLike.parent;
    return String(parent?.parentId || "") === category;
  }
  return String(channelLike.parentId || channelLike.parent?.id || "") === category;
}

function buildThreadOpeningPingPayload(useOwnerPing) {
  if (useOwnerPing) {
    return {
      content: `<@${OWNER_PING_USER_ID}>`,
      allowedMentions: { users: [OWNER_PING_USER_ID] },
    };
  }
  return {
    content: "@everyone",
    allowedMentions: { parse: ["everyone"] },
  };
}

async function sendThreadOpeningPing(thread, guild, opts = {}) {
  if (!thread?.isTextBased?.() || !guild) return null;
  cleanupBotThreadPingDedupe();
  const categoryId = await resolveOwnerPingCategoryId(guild);
  const useOwnerPing = channelBelongsToOwnerPingCategory(thread, categoryId);
  const payload = buildThreadOpeningPingPayload(useOwnerPing);
  const pingMessage = await thread
    .send(payload)
    .catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] opening ping failed:", thread?.id, err?.message || err);
      return null;
    });
  if (opts.markBotSent !== false && pingMessage?.id) {
    botThreadPingSent.set(String(thread.id), Date.now());
  }
  if (pingMessage?.deletable !== false) {
    const timer = setTimeout(() => {
      pingMessage.delete().catch(() => null);
    }, EVERYONE_PING_DELETE_DELAY_MS);
    timer.unref?.();
  }
  return pingMessage;
}

function getMessageKind(message) {
  const channelId = String(message?.channelId || message?.channel?.id || "");
  if (IDEA_CHANNEL_IDS.has(channelId)) return "Idea";
  if (BUG_CHANNEL_IDS.has(channelId)) return "Bug";
  return null;
}

function resolveAuthorName(message) {
  const raw =
    message?.member?.displayName ||
    message?.author?.globalName ||
    message?.author?.username ||
    "utente";
  return String(raw || "utente")
    .replace(/[@#:`*_~|<>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "utente";
}

function buildThreadName(kind, message) {
  const username = `@${resolveAuthorName(message)}`;
  if (kind === "Idea") return `Idea di ${username}`.slice(0, 100);
  if (kind === "Bug") return `Bug segnalato da ${username}`.slice(0, 100);
  return null;
}

async function addIdeaBugReactions(message) {
  for (const reaction of REACTIONS) {
    await message.react(reaction).catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] reaction failed:", message?.id, reaction, err?.message || err);
    });
  }
}

async function createIdeaBugThread(message, kind) {
  if (!message?.startThread || !message?.author?.id) return null;
  const name = buildThreadName(kind, message);
  if (!name) return null;

  const thread = await message
    .startThread({
      name,
      autoArchiveDuration: 10080,
      reason: kind === "Idea" ? "Thread automatico per idea" : "Thread automatico per bug",
    })
    .catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] create failed:", message?.id, err?.message || err);
      return null;
    });

  if (!thread?.isTextBased?.()) return thread;

  await sendThreadOpeningPing(thread, message.guild, { markBotSent: true });

  return thread;
}

async function handleIdeaBugMessage(message) {
  if (!message?.guild || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;

  const kind = getMessageKind(message);
  if (!kind) return false;

  await addIdeaBugReactions(message);
  await createIdeaBugThread(message, kind);
  return true;
}

async function handleIdeaBugCategoryThreadCreate(thread) {
  if (!thread?.guild || !thread?.isTextBased?.()) return false;
  cleanupBotThreadPingDedupe();
  const threadId = String(thread.id || "");
  const sentAt = Number(botThreadPingSent.get(threadId) || 0);
  if (sentAt && Date.now() - sentAt <= BOT_THREAD_PING_DEDUPE_MS) {
    botThreadPingSent.delete(threadId);
    return false;
  }
  const categoryId = await resolveOwnerPingCategoryId(thread.guild);
  if (!channelBelongsToOwnerPingCategory(thread, categoryId)) return false;
  await sendThreadOpeningPing(thread, thread.guild, { markBotSent: true });
  return true;
}

module.exports = { BUG_CHANNEL_IDS, IDEA_CHANNEL_IDS, OWNER_PING_CATEGORY_ANCHOR_CHANNEL_ID, OWNER_PING_USER_ID, EVERYONE_PING_DELETE_DELAY_MS, REACTIONS, handleIdeaBugMessage, handleIdeaBugCategoryThreadCreate };