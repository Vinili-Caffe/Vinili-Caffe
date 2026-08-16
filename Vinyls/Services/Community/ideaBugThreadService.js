const { PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const {
  addUserIdsToThread,
  hydrateGuildMembersForRolePings,
  collectHumanMemberIdsWithRolesOnGuild,
} = require("../../Utils/Discord/threadRoleMembers");

const IDEA_CHANNEL_IDS = new Set( [ "1502239449956745247", "1502238077303783545", "1502238193821552650", "1502238107829932104", "1502238135185309696"].map(String));
const BUG_CHANNEL_IDS = new Set([ "1472009888417845330", "1502239086503792713", "1502239002084773909", "1502239043692265483"].map(String));
/** Categoria test: nei thread entra solo High Staff (main) + autore messaggio. */
const HIGH_STAFF_ONLY_CATEGORY_ID = "1502238709196652584";
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

function normalizeSnowflake(value) {
  return String(value || "").trim();
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

function resolveParentCategoryId(channelLike) {
  if (!channelLike) return "";
  if (channelLike.isThread?.()) {
    const fromParent = normalizeSnowflake(channelLike.parent?.parentId || "");
    if (fromParent) return fromParent;
    // parent non in cache: non abbiamo la categoria qui (serve fetch async)
    return "";
  }
  return normalizeSnowflake(channelLike.parentId || channelLike.parent?.id || "");
}

async function resolveParentCategoryIdAsync(channelLike, guild) {
  const sync = resolveParentCategoryId(channelLike);
  if (sync) return sync;
  if (!channelLike?.isThread?.() || !guild?.channels?.fetch) return "";
  const parentId = normalizeSnowflake(channelLike.parentId || "");
  if (!parentId) return "";
  const parent =
    channelLike.parent ||
    guild.channels.cache.get(parentId) ||
    (await guild.channels.fetch(parentId).catch(() => null));
  return normalizeSnowflake(parent?.parentId || "");
}

function channelBelongsToOwnerPingCategory(channelLike, categoryId) {
  const category = String(categoryId || "").trim();
  if (!category || !channelLike) return false;
  return resolveParentCategoryId(channelLike) === category;
}

function channelBelongsToHighStaffOnlyCategory(channelLike) {
  return resolveParentCategoryId(channelLike) === HIGH_STAFF_ONLY_CATEGORY_ID;
}

async function channelBelongsToHighStaffOnlyCategoryAsync(channelLike, guild) {
  const categoryId = await resolveParentCategoryIdAsync(channelLike, guild);
  return categoryId === HIGH_STAFF_ONLY_CATEGORY_ID;
}

function isIdeaOrBugParentChannelId(channelId) {
  const id = String(channelId || "").trim();
  return IDEA_CHANNEL_IDS.has(id) || BUG_CHANNEL_IDS.has(id);
}

function resolveThreadParentChannel(thread) {
  if (!thread) return null;
  if (thread.isThread?.()) return thread.parent || null;
  return thread;
}

async function resolveMainGuild(client) {
  const mainId = normalizeSnowflake(IDs.guilds?.main);
  if (!mainId || !client?.guilds) return null;
  return client.guilds.cache.get(mainId) || (await client.guilds.fetch(mainId).catch(() => null));
}

async function collectHumanMemberIdsWithParentView(guild, parentChannel, opts = {}) {
  const parent = resolveThreadParentChannel(parentChannel) || parentChannel;
  if (!guild?.members?.cache || !parent?.permissionsFor) return [];
  const logTag = opts.logTag || "[IDEA BUG THREAD]";
  await hydrateGuildMembersForRolePings(guild, logTag);
  const ids = new Set();
  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    const perms = parent.permissionsFor(member);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) continue;
    const uid = String(member.id || "").trim();
    if (/^\d{16,22}$/.test(uid)) ids.add(uid);
  }
  return [...ids];
}

async function ensureBotJoinedThread(thread, guild) {
  if (!thread?.members?.add || !guild) return;
  const me = String(guild.members?.me?.id || guild.client?.user?.id || "").trim();
  if (!me) return;
  await thread.members.add(me).catch(() => null);
}

async function populateThreadViewers(thread, guild, opts = {}) {
  if (!thread?.members?.add || !guild) return { added: 0, failed: 0, skipped: 0 };
  const parent = resolveThreadParentChannel(thread);
  if (!parent) return { added: 0, failed: 0, skipped: 0 };
  await ensureBotJoinedThread(thread, guild);
  const memberIds = await collectHumanMemberIdsWithParentView(guild, parent, opts);
  if (!memberIds.length) return { added: 0, failed: 0, skipped: 0 };
  return addUserIdsToThread(thread, memberIds, {
    logTag: opts.logTag || "[IDEA BUG THREAD]",
    throttleEvery: 6,
    throttleMs: 40,
  });
}

/** High Staff del main (presenti sul server test) + autore del messaggio. */
async function populateHighStaffAndAuthor(thread, guild, authorId, opts = {}) {
  if (!thread?.members?.add || !guild) return { added: 0, failed: 0, skipped: 0 };
  await ensureBotJoinedThread(thread, guild);

  const highStaffRoleId = normalizeSnowflake(IDs.roles?.HighStaff);
  const mainGuild = await resolveMainGuild(guild.client || thread.client);
  let staffIds = [];
  if (mainGuild && highStaffRoleId) {
    staffIds = await collectHumanMemberIdsWithRolesOnGuild(mainGuild, guild, [highStaffRoleId], {
      logTag: opts.logTag || "[IDEA BUG THREAD]",
    });
  }

  const author = normalizeSnowflake(authorId);
  const ids = [...new Set([author, ...staffIds].filter((id) => /^\d{16,22}$/.test(id)))];
  if (!ids.length) return { added: 0, failed: 0, skipped: 0 };
  return addUserIdsToThread(thread, ids, {
    logTag: opts.logTag || "[IDEA BUG THREAD]",
    throttleEvery: 6,
    throttleMs: 40,
  });
}

function buildThreadOpeningPingPayload(guild, useOwnerPing) {
  if (useOwnerPing) {
    return {
      content: `<@${OWNER_PING_USER_ID}>`,
      allowedMentions: { users: [OWNER_PING_USER_ID] },
    };
  }
  const canMentionEveryone = Boolean(
    guild?.members?.me?.permissions?.has(PermissionsBitField.Flags.MentionEveryone),
  );
  if (!canMentionEveryone) return null;
  return {
    content: "@everyone",
    allowedMentions: { parse: ["everyone"] },
  };
}

async function sendThreadOpeningPing(thread, guild, opts = {}) {
  if (!thread?.isTextBased?.() || !guild) return null;
  cleanupBotThreadPingDedupe();
  const threadId = String(thread.id || "");
  if (threadId && botThreadPingSent.has(threadId)) return null;

  const authorId = normalizeSnowflake(opts.authorId || thread.ownerId || "");
  const highStaffOnly = await channelBelongsToHighStaffOnlyCategoryAsync(thread, guild);

  if (highStaffOnly) {
    await populateHighStaffAndAuthor(thread, guild, authorId, opts);
    // Niente @everyone: notificano già le system message di add (solo HS + autore).
    if (threadId) botThreadPingSent.set(threadId, Date.now());
    return null;
  }

  const categoryId = await resolveOwnerPingCategoryId(guild);
  const useOwnerPing = channelBelongsToOwnerPingCategory(thread, categoryId);

  await populateThreadViewers(thread, guild, opts);

  if (useOwnerPing) {
    await addUserIdsToThread(thread, [OWNER_PING_USER_ID], {
      logTag: "[IDEA BUG THREAD]",
      throttleEvery: 0,
      throttleMs: 0,
    });
  }

  const payload = buildThreadOpeningPingPayload(guild, useOwnerPing);
  if (!payload) {
    if (threadId) botThreadPingSent.set(threadId, Date.now());
    return null;
  }

  if (threadId) botThreadPingSent.set(threadId, Date.now());
  const pingMessage = await thread
    .send(payload)
    .catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] opening ping failed:", threadId, err?.message || err);
      return null;
    });
  if (pingMessage?.deletable !== false) {
    const timer = setTimeout(() => {
      pingMessage?.delete?.().catch(() => null);
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

  await sendThreadOpeningPing(thread, message.guild, { authorId: message.author.id });

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
  const parentId = String(thread.parentId || "");
  if (isIdeaOrBugParentChannelId(parentId)) return false;
  cleanupBotThreadPingDedupe();
  const threadId = String(thread.id || "");
  if (threadId && botThreadPingSent.has(threadId)) return false;

  if (await channelBelongsToHighStaffOnlyCategoryAsync(thread, thread.guild)) {
    await sendThreadOpeningPing(thread, thread.guild, {
      authorId: normalizeSnowflake(thread.ownerId),
    });
    return true;
  }

  const categoryId = await resolveOwnerPingCategoryId(thread.guild);
  if (!channelBelongsToOwnerPingCategory(thread, categoryId)) {
    // parent cache miss: ricontrolla owner category via fetch
    const parentCategory = await resolveParentCategoryIdAsync(thread, thread.guild);
    if (!parentCategory || parentCategory !== categoryId) return false;
  }
  await sendThreadOpeningPing(thread, thread.guild, {
    authorId: normalizeSnowflake(thread.ownerId),
  });
  return true;
}

module.exports = {
  BUG_CHANNEL_IDS,
  IDEA_CHANNEL_IDS,
  HIGH_STAFF_ONLY_CATEGORY_ID,
  OWNER_PING_CATEGORY_ANCHOR_CHANNEL_ID,
  OWNER_PING_USER_ID,
  EVERYONE_PING_DELETE_DELAY_MS,
  REACTIONS,
  handleIdeaBugMessage,
  handleIdeaBugCategoryThreadCreate,
};
