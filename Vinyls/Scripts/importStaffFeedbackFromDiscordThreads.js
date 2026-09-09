"use strict";

/**
 * Import staff feedback (bugs + suggestions) from Discord thread/forum channels
 * into the site staff suggestions board (suggestionBoard=staff).
 *
 * Run on VPS (from /opt/bot):
 *   cd /opt/bot/Vinyls
 *   node Scripts/importStaffFeedbackFromDiscordThreads.js \
 *     --guild=1462458562507964584 \
 *     --auto-channels --dry-run
 *
 * Or list matched channels only:
 *   node Scripts/importStaffFeedbackFromDiscordThreads.js \
 *     --guild=1462458562507964584 --list-channels --auto-channels
 *
 * Env: loads /opt/bot/.env then Vinyls/../.env
 *   DISCORD_TOKEN (or config.json token)
 *   MONGO_URL_LOCAL / MONGO_URL
 *
 * Idempotent via dedupeKey:
 *   discord:thread:<threadId>   (forum posts / message threads)
 *   discord:message:<messageId> (plain channel messages without a thread)
 * Re-run with --refresh to update status + replace comments.
 *
 * Text channels often store bugs/ideas as plain messages (no thread). Those are
 * imported too; messages that already have a thread are skipped (thread path).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");

function loadEnv() {
  const candidates = [
    "/opt/bot/.env",
    path.join(REPO_ROOT, ".env"),
    path.join(ROOT, ".env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

loadEnv();
try {
  require("dotenv").config({ path: path.join(REPO_ROOT, ".env") });
} catch (_) {
  /* optional */
}

const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  Partials,
} = require("discord.js");

const IDs = require(path.join(ROOT, "Utils", "Config", "ids"));
const { buildMongoUrl } = require(path.join(ROOT, "Utils", "Database", "mongoConnect"));
const {
  SiteDocument,
  SITE_DOCUMENT_TYPE,
} = require(path.join(ROOT, "Schemas", "Community", "communitySchemas"));
const {
  userAvatarUrlStatic,
  userAvatarUrlDynamic,
} = require(path.join(ROOT, "Utils", "Discord", "guildDiscordIdentity"));

const SG = SITE_DOCUMENT_TYPE.SUGGESTION;
const MAX_SUGGESTION_LEN = 2000;
const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;
const DEFAULT_CROSS_EMOJI_ID = "1482532424570376253";
const IMPORT_REASON = "Importato da Discord (reazioni sul messaggio iniziale).";
const DEDUPE_PREFIX_THREAD = "discord:thread:";
const DEDUPE_PREFIX_MESSAGE = "discord:message:";
/** @deprecated use DEDUPE_PREFIX_THREAD */
const DEDUPE_PREFIX = DEDUPE_PREFIX_THREAD;

function argFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.includes(`-${name}`);
}

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length).trim();
}

function argAllValues(name) {
  const prefix = `--${name}=`;
  const out = [];
  for (const a of process.argv) {
    if (!a.startsWith(prefix)) continue;
    out.push(a.slice(prefix.length).trim());
  }
  return out.filter(Boolean);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseIdList(raw) {
  const parts = [];
  for (const chunk of [].concat(raw || [])) {
    for (const bit of String(chunk || "").split(/[,\s]+/)) {
      const id = bit.trim();
      if (/^\d{5,32}$/.test(id)) parts.push(id);
    }
  }
  return [...new Set(parts)];
}

function parseChannelKindMap(rawList) {
  /** @type {Map<string, "bug"|"suggestion">} */
  const map = new Map();
  for (const raw of [].concat(rawList || [])) {
    for (const bit of String(raw || "").split(/[,\s]+/)) {
      const m = /^(\d{5,32}):(bug|idea|suggestion|suggerimento)$/i.exec(bit.trim());
      if (!m) continue;
      const kind = /bug/i.test(m[2]) ? "bug" : "suggestion";
      map.set(m[1], kind);
    }
  }
  return map;
}

function normalizeKind(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (["bug", "bugs", "problema", "error", "errore"].includes(k)) return "bug";
  if (["suggestion", "suggerimento", "suggerimenti", "idea", "ideas"].includes(k)) {
    return "suggestion";
  }
  return "";
}

function normalizeTopicTag(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  const allowed = ["server", "staff", "sito", "bots", "eventi", "altro"];
  return allowed.includes(t) ? t : "staff";
}

function sanitizeBody(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function authorNameFromUser(user, member) {
  const n = String(
    member?.displayName || user?.globalName || user?.username || "",
  ).trim();
  return (n || "Utente").slice(0, 80);
}

function avatarFromUser(user, member) {
  try {
    if (member) {
      return (
        userAvatarUrlStatic(member, { size: 128 }) ||
        userAvatarUrlDynamic(member, { size: 128 }) ||
        ""
      );
    }
    if (user) {
      return (
        userAvatarUrlStatic(user, { size: 128 }) ||
        userAvatarUrlDynamic(user, { size: 128 }) ||
        ""
      );
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

function detectKindFromText(text) {
  const s = String(text || "").toLowerCase();
  if (!s) return "";
  if (/\bbug\b|bugs|problema|error[ei]?|crash|glitch/.test(s)) return "bug";
  if (/\bidea\b|suggeriment|suggestion|feature|miglior/.test(s)) return "suggestion";
  return "";
}

function detectKindFromChannel(channel) {
  const name = String(channel?.name || "");
  const fromName = detectKindFromText(name);
  if (fromName) return fromName;
  const topic = String(channel?.topic || "");
  return detectKindFromText(topic);
}

function normalizeChannelNameForMatch(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function isDecorativeSeparatorChannel(channel) {
  const raw = String(channel?.name || "").trim();
  if (!raw) return true;
  /* Skip separator / empty decorative channels (༄ only, punctuation-only, etc.). */
  const stripped = raw
    .replace(/[\s\u0F04\u0F05༄✦✧・‧•─━_|~*`'".,:;!?()[\]{}<>\\/\-]+/g, "")
    .replace(/[\u200b-\u200f\ufeff]/g, "");
  return stripped.length === 0;
}

function detectTopicTagFromChannel(channel, fallback = "staff") {
  const s = normalizeChannelNameForMatch(channel?.name);
  if (/sito|website|\bweb\b/.test(s)) return "sito";
  if (/\bbots?\b/.test(s)) return "bots";
  if (/eventi|\bevents?\b/.test(s)) return "eventi";
  if (/server/.test(s)) return "server";
  if (/staff/.test(s)) return "staff";
  if (fallback === "" || fallback == null) return "";
  return normalizeTopicTag(fallback);
}

/**
 * Match functional staff feedback channels from screenshots:
 *   idee + (eventi|server|staff|bots|sito) → kind suggestion
 *   bug  + (server|staff|bots|sito)         → kind bug  (no eventi expected)
 * Skips decorative separators.
 * @returns {{ kind: "bug"|"suggestion", topicTag: string } | null}
 */
function matchStaffFeedbackChannel(channel) {
  if (!channel || isDecorativeSeparatorChannel(channel)) return null;
  const s = normalizeChannelNameForMatch(channel.name);
  if (!s) return null;

  const hasIdee = /\bidee?\b|\bideas?\b/.test(s);
  const hasBug = /\bbugs?\b/.test(s);
  if (!hasIdee && !hasBug) return null;

  const topicTag = detectTopicTagFromChannel(channel, "");
  if (!topicTag) return null;

  /* Prefer explicit kind keyword; if both appear, earlier token wins. */
  let kind = "";
  if (hasIdee && hasBug) {
    const ideeIdx = s.search(/\bidee?\b|\bideas?\b/);
    const bugIdx = s.search(/\bbugs?\b/);
    kind =
      ideeIdx >= 0 && (bugIdx < 0 || ideeIdx <= bugIdx) ? "suggestion" : "bug";
  } else if (hasBug) {
    kind = "bug";
  } else {
    kind = "suggestion";
  }

  return { kind, topicTag };
}

/** @returns {Array<{ id: string, name: string, type: string, parent: string, kind: "bug"|"suggestion", topicTag: string }>} */
function discoverAutoStaffFeedbackChannels(guild) {
  const matched = [];
  for (const ch of guild.channels.cache.values()) {
    const type = ch.type;
    const isForum = type === ChannelType.GuildForum;
    const isText =
      type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
    if (!isForum && !isText) continue;
    const hit = matchStaffFeedbackChannel(ch);
    if (!hit) continue;
    matched.push({
      id: String(ch.id),
      name: String(ch.name || ""),
      type: isForum ? "forum" : "text",
      parent: ch.parent?.name || "",
      kind: hit.kind,
      topicTag: hit.topicTag,
    });
  }
  matched.sort((a, b) => {
    const ka = a.kind === "bug" ? 1 : 0;
    const kb = b.kind === "bug" ? 1 : 0;
    if (ka !== kb) return ka - kb;
    return String(a.name).localeCompare(String(b.name), "it");
  });
  return matched;
}

function detectKindFromForumTags(thread, parentChannel) {
  const ids = Array.isArray(thread?.appliedTags) ? thread.appliedTags : [];
  if (!ids.length || !parentChannel?.availableTags) return "";
  const tags = parentChannel.availableTags || [];
  for (const tagId of ids) {
    const tag = tags.find((t) => String(t.id) === String(tagId));
    const name = String(tag?.name || "");
    const hit = detectKindFromText(name);
    if (hit) return hit;
  }
  return "";
}

function extractStarterContent(message) {
  const parts = [];
  const content = String(message?.content || "").trim();
  if (content) parts.push(content);

  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const emb of embeds) {
    const title = String(emb?.title || "").trim();
    const desc = String(emb?.description || "").trim();
    const fields = Array.isArray(emb?.fields) ? emb.fields : [];
    if (title) parts.push(title);
    if (desc) parts.push(desc);
    for (const f of fields) {
      const n = String(f?.name || "").trim();
      const v = String(f?.value || "").trim();
      if (n && v) parts.push(`${n}: ${v}`);
      else if (v) parts.push(v);
    }
  }

  const atts = message?.attachments?.values?.()
    ? [...message.attachments.values()]
    : Array.isArray(message?.attachments)
      ? message.attachments
      : [];
  for (const a of atts) {
    const url = String(a?.url || a?.proxyURL || "").trim();
    if (url) parts.push(url);
  }

  return sanitizeBody(parts.join("\n\n"), MAX_SUGGESTION_LEN);
}

function extractKindHintsFromMessage(message) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const emb of embeds) {
    const hit = detectKindFromText(`${emb?.title || ""} ${emb?.description || ""}`);
    if (hit) return hit;
  }
  return detectKindFromText(message?.content || "");
}

function resolveKind({ channelKindMap, channel, thread, starter, defaultKind }) {
  const mapped = channelKindMap.get(String(channel.id));
  if (mapped) return mapped;
  const fromChannel = detectKindFromChannel(channel);
  if (fromChannel) return fromChannel;
  const fromTags = detectKindFromForumTags(thread, channel);
  if (fromTags) return fromTags;
  const fromMsg = extractKindHintsFromMessage(starter);
  if (fromMsg) return fromMsg;
  return normalizeKind(defaultKind) || "suggestion";
}

function buildEmojiMatchers({ successNames, crossNames, successIds, crossIds, guild }) {
  const successNameSet = new Set(successNames.map((n) => n.toLowerCase()));
  const crossNameSet = new Set(crossNames.map((n) => n.toLowerCase()));
  const successIdSet = new Set(successIds.filter(Boolean).map(String));
  const crossIdSet = new Set(crossIds.filter(Boolean).map(String));

  if (guild?.emojis?.cache) {
    for (const em of guild.emojis.cache.values()) {
      const name = String(em.name || "");
      const id = String(em.id || "");
      if (successNameSet.has(name.toLowerCase())) successIdSet.add(id);
      if (crossNameSet.has(name.toLowerCase())) crossIdSet.add(id);
    }
  }

  return { successNameSet, crossNameSet, successIdSet, crossIdSet };
}

function reactionMatches(reaction, nameSet, idSet) {
  const emoji = reaction?.emoji;
  if (!emoji) return false;
  const name = String(emoji.name || "").toLowerCase();
  const id = String(emoji.id || "");
  if (id && idSet.has(id)) return true;
  if (name && nameSet.has(name)) return true;
  return false;
}

function statusFromReactions(message, matchers) {
  const cache = message?.reactions?.cache;
  if (!cache || !cache.size) return "pending";

  let hasSuccess = false;
  let hasCross = false;
  for (const reaction of cache.values()) {
    if (reactionMatches(reaction, matchers.successNameSet, matchers.successIdSet)) {
      hasSuccess = true;
    }
    if (reactionMatches(reaction, matchers.crossNameSet, matchers.crossIdSet)) {
      hasCross = true;
    }
  }

  if (hasSuccess && hasCross) return "pending";
  if (hasSuccess) return "accepted";
  if (hasCross) return "rejected";
  return "pending";
}

function dedupeKeyForThread(threadId) {
  return `${DEDUPE_PREFIX_THREAD}${String(threadId)}`;
}

function dedupeKeyForMessage(messageId) {
  return `${DEDUPE_PREFIX_MESSAGE}${String(messageId)}`;
}

/**
 * Top-level text-channel messages that are NOT already covered by a thread.
 * Forum channels are skipped (posts are always threads).
 */
async function collectChannelRootMessages(channel, limit) {
  if (!channel || channel.type === ChannelType.GuildForum) return [];
  if (!channel.isTextBased?.() || typeof channel.messages?.fetch !== "function") return [];

  const out = [];
  let before;
  let guard = 0;
  const hardCap = limit > 0 ? Math.max(limit * 4, 80) : 500;
  while (out.length < hardCap && guard++ < 40) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch || !batch.size) break;
    const arr = [...batch.values()];
    for (const msg of arr) {
      if (!msg || msg.author?.bot) continue;
      if (msg.system) continue;
      /* Thread starters are imported via collectThreads / importThread. */
      if (msg.hasThread || msg.thread) continue;
      const content = extractStarterContent(msg);
      if (!content || content.length < 3) continue;
      out.push(msg);
    }
    before = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
    await sleep(120);
  }
  out.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
  if (limit > 0) return out.slice(0, limit);
  return out;
}

async function resolveDiscordClient() {
  let vinylsConfig = {};
  try {
    vinylsConfig = require(path.join(ROOT, "config.json"));
  } catch (_) {
    vinylsConfig = {};
  }
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    vinylsConfig?.token ||
    "";
  if (!token) {
    throw new Error("Token Discord mancante (DISCORD_TOKEN / Vinyls/config.json).");
  }
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  await client.login(token);
  await new Promise((resolve, reject) => {
    if (client.isReady()) return resolve();
    const t = setTimeout(() => reject(new Error("Discord ready timeout")), 45_000);
    const onReady = () => {
      clearTimeout(t);
      resolve();
    };
    client.once("clientReady", onReady);
    client.once("ready", onReady);
  });
  return client;
}

async function fetchAllThreadMessages(thread, hardCap = 400) {
  const out = [];
  let before;
  while (out.length < hardCap) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const batch = await thread.messages.fetch(opts).catch(() => null);
    if (!batch || !batch.size) break;
    const arr = [...batch.values()];
    out.push(...arr);
    before = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
    await sleep(120);
  }
  out.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return out;
}

async function collectThreads(channel, limit) {
  const byId = new Map();

  const add = (t) => {
    if (!t?.id) return;
    if (!byId.has(t.id)) byId.set(t.id, t);
  };

  if (channel.threads?.fetchActive) {
    const active = await channel.threads.fetchActive().catch(() => null);
    for (const t of active?.threads?.values?.() || []) add(t);
  }

  const fetchArchivedPages = async (options) => {
    let before;
    let guard = 0;
    while (guard++ < 30) {
      const opts = { ...options, limit: 100 };
      if (before) opts.before = before;
      const archived = await channel.threads.fetchArchived(opts).catch(() => null);
      const threads = archived?.threads;
      if (!threads?.size) break;
      for (const t of threads.values()) add(t);
      if (limit > 0 && byId.size >= limit * 3) break;
      if (!archived.hasMore) break;
      const last = [...threads.values()].pop();
      before = last?.id || last?.archiveTimestamp || undefined;
      if (!before) break;
      await sleep(150);
    }
  };

  if (channel.type === ChannelType.GuildForum) {
    await fetchArchivedPages({});
  } else if (channel.threads?.fetchArchived) {
    await fetchArchivedPages({ type: "public" });
    await fetchArchivedPages({ type: "private" });
  }

  let list = [...byId.values()].sort(
    (a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0),
  );
  if (limit > 0) list = list.slice(0, limit);
  return list;
}

async function listCandidateChannels(guild) {
  await guild.channels.fetch().catch(() => null);
  const rows = [];
  for (const ch of guild.channels.cache.values()) {
    const type = ch.type;
    const isForum = type === ChannelType.GuildForum;
    const isText =
      type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
    if (!isForum && !isText) continue;
    rows.push({
      id: ch.id,
      name: ch.name,
      type: isForum ? "forum" : "text",
      parent: ch.parent?.name || "",
    });
  }
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "it"));
  return rows;
}

function buildCommentsFromMessages(messages, starterId, memberCache) {
  const comments = [];
  for (const msg of messages) {
    if (!msg || String(msg.id) === String(starterId)) continue;
    if (msg.system) continue;
    const text = extractStarterContent(msg);
    if (!text || text.length < 1) continue;
    const user = msg.author;
    if (!user) continue;
    const member = memberCache?.get?.(user.id) || msg.member || null;
    comments.push({
      userId: String(user.id),
      authorName: authorNameFromUser(user, member),
      authorAvatarUrl: avatarFromUser(user, member),
      content: sanitizeBody(text, MAX_COMMENT_LEN),
      createdAt: msg.createdAt || new Date(msg.createdTimestamp),
      updatedAt: msg.createdAt || new Date(msg.createdTimestamp),
    });
    if (comments.length >= MAX_COMMENTS) break;
  }
  return comments;
}

async function importThread({
  thread,
  channel,
  guild,
  siteGuildId,
  topicTag,
  channelKindMap,
  defaultKind,
  matchers,
  dryRun,
  refresh,
}) {
  const threadId = String(thread.id);
  const key = dedupeKeyForThread(threadId);

  const existing = await SiteDocument.findOne({
    docType: SG,
    guildId: siteGuildId,
    dedupeKey: key,
  })
    .select("_id status comments content feedbackKind")
    .lean()
    .catch(() => null);

  if (existing && !refresh) {
    return { action: "skip", threadId, suggestionId: String(existing._id), reason: "already_imported" };
  }

  let starter = null;
  if (typeof thread.fetchStarterMessage === "function") {
    starter = await thread.fetchStarterMessage().catch(() => null);
  }

  const messages = await fetchAllThreadMessages(thread);
  if (!starter && messages.length) starter = messages[0];

  /* Starter deleted / empty: use first message with usable body for content+reactions. */
  let contentSource = starter;
  if (!extractStarterContent(contentSource) && messages.length) {
    contentSource =
      messages.find((m) => extractStarterContent(m).length >= 3) || contentSource || messages[0];
  }
  if (!contentSource && !starter) {
    return { action: "skip", threadId, reason: "no_starter" };
  }
  if (!starter) starter = contentSource;

  try {
    if (starter.partial) await starter.fetch();
    if (contentSource && contentSource.id !== starter.id && contentSource.partial) {
      await contentSource.fetch().catch(() => null);
    }
    if (starter.reactions?.cache && !starter.reactions.cache.size) {
      await starter.fetch().catch(() => null);
    }
  } catch (_) {
    /* ignore */
  }

  const reactionMessage =
    starter.reactions?.cache?.size > 0
      ? starter
      : contentSource?.reactions?.cache?.size > 0
        ? contentSource
        : starter;

  const kind = resolveKind({
    channelKindMap,
    channel,
    thread,
    starter: contentSource || starter,
    defaultKind,
  });
  const content = extractStarterContent(contentSource || starter);
  if (!content || content.length < 3) {
    return { action: "skip", threadId, reason: "empty_content" };
  }

  const status = statusFromReactions(reactionMessage, matchers);
  const reactionSummary = [...(reactionMessage.reactions?.cache?.values?.() || [])]
    .map((r) => `${r.emoji?.animated ? "a:" : ""}${r.emoji?.name || "?"}:${r.emoji?.id || "unicode"}x${r.count || 0}`)
    .join(", ");
  const author = (contentSource || starter).author;
  const member =
    guild.members.cache.get(author?.id) ||
    (author?.id ? await guild.members.fetch(author.id).catch(() => null) : null);

  const starterIdForComments = String((contentSource || starter).id);
  const comments = buildCommentsFromMessages(messages, starterIdForComments, guild.members.cache);
  const resolvedTopic =
    topicTag && topicTag !== "auto"
      ? topicTag
      : detectTopicTagFromChannel(channel, "staff");

  const createdAt =
    (contentSource || starter).createdAt ||
    new Date((contentSource || starter).createdTimestamp || Date.now());
  const payload = {
    docType: SG,
    guildId: siteGuildId,
    userId: String(author?.id || "0"),
    authorName: authorNameFromUser(author, member),
    authorAvatarUrl: avatarFromUser(author, member),
    content: sanitizeBody(content, MAX_SUGGESTION_LEN),
    feedbackKind: kind,
    topicTag: resolvedTopic,
    suggestionBoard: "staff",
    status,
    staffReason: status === "pending" ? "" : IMPORT_REASON,
    decidedAt: status === "pending" ? null : createdAt,
    comments,
    upvoterUserIds: [],
    downvoterUserIds: [],
    imageUrls: [],
    provider: "discord_thread",
    createdBy: "discord_import",
    dedupeKey: key,
    workflowChannelId: String(channel.id),
    workflowMessageId: String((contentSource || starter).id),
    createdAt,
    updatedAt: new Date(),
  };

  const preview = {
    threadId,
    name: thread.name || "",
    kind,
    topicTag: resolvedTopic,
    status,
    reactions: reactionSummary || "(none)",
    authorId: payload.userId,
    authorName: payload.authorName,
    comments: comments.length,
    contentPreview: payload.content.slice(0, 120).replace(/\n/g, " "),
  };

  if (dryRun) {
    return {
      action: existing ? "would_refresh" : "would_create",
      threadId,
      suggestionId: existing ? String(existing._id) : null,
      preview,
    };
  }

  if (existing && refresh) {
    await SiteDocument.updateOne(
      { _id: existing._id },
      {
        $set: {
          content: payload.content,
          feedbackKind: payload.feedbackKind,
          topicTag: payload.topicTag,
          suggestionBoard: "staff",
          status: payload.status,
          staffReason: payload.staffReason,
          decidedAt: payload.decidedAt,
          comments: payload.comments,
          authorName: payload.authorName,
          authorAvatarUrl: payload.authorAvatarUrl,
          provider: payload.provider,
          createdBy: payload.createdBy,
          workflowChannelId: payload.workflowChannelId,
          workflowMessageId: payload.workflowMessageId,
          updatedAt: new Date(),
        },
      },
    );
    return { action: "refreshed", threadId, suggestionId: String(existing._id), preview };
  }

  const doc = await SiteDocument.create(payload);
  return { action: "created", threadId, suggestionId: String(doc._id), preview };
}

async function importChannelMessage({
  message,
  channel,
  guild,
  siteGuildId,
  topicTag,
  channelKindMap,
  defaultKind,
  matchers,
  dryRun,
  refresh,
}) {
  const messageId = String(message.id);
  const key = dedupeKeyForMessage(messageId);

  const existing = await SiteDocument.findOne({
    docType: SG,
    guildId: siteGuildId,
    dedupeKey: key,
  })
    .select("_id status comments content feedbackKind")
    .lean()
    .catch(() => null);

  if (existing && !refresh) {
    return { action: "skip", messageId, suggestionId: String(existing._id), reason: "already_imported" };
  }

  try {
    if (message.partial) await message.fetch();
    if (message.reactions?.cache && !message.reactions.cache.size) {
      await message.fetch().catch(() => null);
    }
  } catch (_) {
    /* ignore */
  }

  const kind = resolveKind({
    channelKindMap,
    channel,
    thread: null,
    starter: message,
    defaultKind,
  });
  const content = extractStarterContent(message);
  if (!content || content.length < 3) {
    return { action: "skip", messageId, reason: "empty_content" };
  }

  const status = statusFromReactions(message, matchers);
  const reactionSummary = [...(message.reactions?.cache?.values?.() || [])]
    .map((r) => `${r.emoji?.animated ? "a:" : ""}${r.emoji?.name || "?"}:${r.emoji?.id || "unicode"}x${r.count || 0}`)
    .join(", ");
  const author = message.author;
  const member =
    guild.members.cache.get(author?.id) ||
    (author?.id ? await guild.members.fetch(author.id).catch(() => null) : null);

  const resolvedTopic =
    topicTag && topicTag !== "auto"
      ? topicTag
      : detectTopicTagFromChannel(channel, "staff");

  const createdAt = message.createdAt || new Date(message.createdTimestamp || Date.now());
  const payload = {
    docType: SG,
    guildId: siteGuildId,
    userId: String(author?.id || "0"),
    authorName: authorNameFromUser(author, member),
    authorAvatarUrl: avatarFromUser(author, member),
    content: sanitizeBody(content, MAX_SUGGESTION_LEN),
    feedbackKind: kind,
    topicTag: resolvedTopic,
    suggestionBoard: "staff",
    status,
    staffReason: status === "pending" ? "" : IMPORT_REASON,
    decidedAt: status === "pending" ? null : createdAt,
    comments: [],
    upvoterUserIds: [],
    downvoterUserIds: [],
    imageUrls: [],
    provider: "discord_message",
    createdBy: "discord_import",
    dedupeKey: key,
    workflowChannelId: String(channel.id),
    workflowMessageId: messageId,
    createdAt,
    updatedAt: new Date(),
  };

  const preview = {
    messageId,
    name: "",
    kind,
    topicTag: resolvedTopic,
    status,
    reactions: reactionSummary || "(none)",
    authorId: payload.userId,
    authorName: payload.authorName,
    comments: 0,
    contentPreview: payload.content.slice(0, 120).replace(/\n/g, " "),
  };

  if (dryRun) {
    return {
      action: existing ? "would_refresh" : "would_create",
      messageId,
      suggestionId: existing ? String(existing._id) : null,
      preview,
    };
  }

  if (existing && refresh) {
    await SiteDocument.updateOne(
      { _id: existing._id },
      {
        $set: {
          content: payload.content,
          feedbackKind: payload.feedbackKind,
          topicTag: payload.topicTag,
          suggestionBoard: "staff",
          status: payload.status,
          staffReason: payload.staffReason,
          decidedAt: payload.decidedAt,
          comments: payload.comments,
          authorName: payload.authorName,
          authorAvatarUrl: payload.authorAvatarUrl,
          provider: payload.provider,
          createdBy: payload.createdBy,
          workflowChannelId: payload.workflowChannelId,
          workflowMessageId: payload.workflowMessageId,
          updatedAt: new Date(),
        },
      },
    );
    return { action: "refreshed", messageId, suggestionId: String(existing._id), preview };
  }

  const doc = await SiteDocument.create(payload);
  return { action: "created", messageId, suggestionId: String(doc._id), preview };
}

function printUsage() {
  console.log(`Usage:
  node Scripts/importStaffFeedbackFromDiscordThreads.js \\
    --guild=1462458562507964584 \\
    [--auto-channels]            (default when no --channel) \\
    [--channel=<id>[,id...]]     (repeatable; disables auto unless also --auto-channels) \\
    [--site-guild=<main guild id>] \\
    [--kind=idea|bug] \\
    [--channel-kind=<channelId>:bug,<channelId>:idea] \\
    [--topic=staff|auto] \\
    [--success-emoji=VC_Success,VC_Verified] [--cross-emoji=VC_Cross] \\
    [--success-emoji-id=] [--cross-emoji-id=${DEFAULT_CROSS_EMOJI_ID}] \\
    [--limit=N] [--dry-run] [--refresh] [--list-channels]

Notes:
  - Status from starter reactions: Success/Verified only → accepted; Cross only → rejected;
    both or neither → pending (in valutazione). Live guild uses VC_Verified (no VC_Success).
  - Documents land on suggestionBoard=staff with dedupeKey discord:thread:<id> or
    discord:message:<id> (plain channel messages without a thread).
  - Default site guildId is IDs.guilds.main (site board), Discord source is --guild.
  - --topic=auto (default) infers topicTag from channel name (staff/sito/bots/server/eventi).
  - --auto-channels matches text/forum names with idee|bug + eventi|server|staff|bots|sito;
    skips decorative separators (༄ / empty). Maps kind+topicTag from the name.
  - Plain text-channel messages (common for bugs) are imported; thread starters are not
    double-imported.
  - --list-channels --auto-channels shows only matched feedback channels.
`);
}

async function main() {
  if (argFlag("help") || argFlag("h")) {
    printUsage();
    return;
  }

  const dryRun = argFlag("dry-run") || argFlag("dryrun");
  const refresh = argFlag("refresh");
  const listChannels = argFlag("list-channels");
  const autoChannelsFlag = argFlag("auto-channels") || argFlag("auto");
  const sourceGuildId =
    argValue("guild", String(IDs.guilds?.test || "1462458562507964584")) ||
    "1462458562507964584";
  const siteGuildId =
    argValue("site-guild", String(IDs.guilds?.main || "")) ||
    String(IDs.guilds?.main || "");
  if (!siteGuildId) {
    console.error("site-guild / IDs.guilds.main mancante.");
    process.exit(1);
  }

  let channelIds = parseIdList([...argAllValues("channel"), argValue("channels", "")]);
  const channelKindMap = parseChannelKindMap([
    ...argAllValues("channel-kind"),
    argValue("channel-kinds", ""),
  ]);
  /** @type {Map<string, string>} */
  const channelTopicMap = new Map();
  const useAutoChannels = autoChannelsFlag || (!channelIds.length && !listChannels);
  const defaultKind = normalizeKind(argValue("kind", "idea")) || "suggestion";
  const topicRaw = argValue("topic", "auto");
  const topicTag = topicRaw === "auto" ? "auto" : normalizeTopicTag(topicRaw);
  const limit = Math.max(0, Number(argValue("limit", "0")) || 0);

  const successNames = String(argValue("success-emoji", "VC_Success,VC_Verified"))
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const crossNames = String(argValue("cross-emoji", "VC_Cross"))
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const successIds = parseIdList([
    argValue("success-emoji-id", ""),
    process.env.VC_SUCCESS_EMOJI_ID || "",
  ]);
  const crossIds = parseIdList([
    argValue("cross-emoji-id", DEFAULT_CROSS_EMOJI_ID),
    process.env.VC_CROSS_EMOJI_ID || DEFAULT_CROSS_EMOJI_ID,
  ]);

  if (!listChannels && !channelIds.length && !useAutoChannels) {
    printUsage();
    console.error("Serve --channel=<id>, --auto-channels, oppure --list-channels.");
    process.exit(1);
  }

  const mongoUri = buildMongoUrl() || "";
  if (!mongoUri) {
    console.error("MONGO_URL_LOCAL / MONGO_URL mancante.");
    process.exit(1);
  }

  console.log(
    `[importStaffFeedback] Mongo: ${
      /127\.0\.0\.1|localhost/.test(mongoUri) ? "LOCAL" : "REMOTE"
    }`,
  );
  console.log(
    `[importStaffFeedback] Discord guild=${sourceGuildId} → site guild=${siteGuildId} board=staff dryRun=${dryRun} refresh=${refresh}`,
  );

  await mongoose.connect(mongoUri);
  const client = await resolveDiscordClient();

  try {
    const guild =
      client.guilds.cache.get(sourceGuildId) ||
      (await client.guilds.fetch(sourceGuildId).catch(() => null));
    if (!guild) {
      throw new Error(`Guild Discord non trovata: ${sourceGuildId}`);
    }
    await guild.emojis.fetch().catch(() => null);
    await guild.channels.fetch().catch(() => null);
    /* Avoid guild.members.fetch() — huge guilds hang; resolve authors per-thread. */

    const matchers = buildEmojiMatchers({
      successNames,
      crossNames,
      successIds,
      crossIds,
      guild,
    });
    console.log(
      `[importStaffFeedback] Emoji match: success names=${[...matchers.successNameSet].join(",") || "-"} ids=${[...matchers.successIdSet].join(",") || "-"} | cross names=${[...matchers.crossNameSet].join(",") || "-"} ids=${[...matchers.crossIdSet].join(",") || "-"}`,
    );
    const emojiNames = [...guild.emojis.cache.values()]
      .map((e) => e.name)
      .filter((n) => /success|cross|verified|check|ok/i.test(String(n || "")))
      .sort();
    if (emojiNames.length) {
      console.log(`[importStaffFeedback] Guild emoji candidates: ${emojiNames.join(", ")}`);
    }

    const autoMatched = discoverAutoStaffFeedbackChannels(guild);
    if (useAutoChannels) {
      for (const row of autoMatched) {
        if (!channelKindMap.has(row.id)) channelKindMap.set(row.id, row.kind);
        channelTopicMap.set(row.id, row.topicTag);
        if (!channelIds.includes(row.id)) channelIds.push(row.id);
      }
      if (!listChannels) {
        console.log(
          `[importStaffFeedback] Auto-channels: ${autoMatched.length} matched (idee/bug + topic)`,
        );
        for (const row of autoMatched) {
          console.log(
            `  ${row.id}\t${row.type}\t#${row.name}\tkind=${row.kind}\ttopic=${row.topicTag}${row.parent ? `\t(${row.parent})` : ""}`,
          );
        }
        if (!channelIds.length) {
          throw new Error("Nessun canale feedback auto-matchato (idee/bug + topic).");
        }
      }
    }

    if (listChannels) {
      if (autoChannelsFlag) {
        console.log(
          `[importStaffFeedback] Canali feedback auto-match (${autoMatched.length}):`,
        );
        for (const r of autoMatched) {
          console.log(
            `  ${r.id}\t${r.type}\t#${r.name}\tkind=${r.kind}\ttopic=${r.topicTag}${r.parent ? `  (${r.parent})` : ""}`,
          );
        }
      } else {
        const rows = await listCandidateChannels(guild);
        console.log(`[importStaffFeedback] Canali text/forum (${rows.length}):`);
        for (const r of rows) {
          const hit = matchStaffFeedbackChannel({ name: r.name, id: r.id });
          const mark = hit ? `\t[auto kind=${hit.kind} topic=${hit.topicTag}]` : "";
          console.log(
            `  ${r.id}\t${r.type}\t#${r.name}${r.parent ? `  (${r.parent})` : ""}${mark}`,
          );
        }
      }
      return;
    }

    const stats = {
      created: 0,
      refreshed: 0,
      skipped: 0,
      would_create: 0,
      would_refresh: 0,
      errors: 0,
      byChannel: {},
    };

    for (const channelId of channelIds) {
      const channel =
        guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel) {
        console.warn(`[importStaffFeedback] Canale non trovato: ${channelId}`);
        stats.errors += 1;
        continue;
      }

      const autoHit = matchStaffFeedbackChannel(channel);
      const mappedKind =
        channelKindMap.get(channelId) ||
        autoHit?.kind ||
        detectKindFromChannel(channel) ||
        defaultKind;
      if (!channelKindMap.has(channelId) && mappedKind) {
        channelKindMap.set(channelId, mappedKind === "bug" ? "bug" : "suggestion");
      }
      const channelTopic =
        topicTag !== "auto"
          ? topicTag
          : channelTopicMap.get(channelId) ||
            autoHit?.topicTag ||
            detectTopicTagFromChannel(channel, "staff");

      console.log(
        `[importStaffFeedback] Canale #${channel.name} (${channelId}) type=${channel.type} kind=${mappedKind} topic=${channelTopic}`,
      );

      const threads = await collectThreads(channel, limit);
      console.log(`[importStaffFeedback] Thread da processare: ${threads.length}`);
      const rootMessages = await collectChannelRootMessages(channel, limit);
      console.log(
        `[importStaffFeedback] Messaggi canale (senza thread) da processare: ${rootMessages.length}`,
      );
      stats.byChannel[`${channel.name}|${channelId}`] = {
        threads: threads.length,
        messages: rootMessages.length,
        kind: mappedKind,
        topic: channelTopic,
      };

      for (const thread of threads) {
        try {
          const result = await importThread({
            thread,
            channel,
            guild,
            siteGuildId,
            topicTag: channelTopic,
            channelKindMap,
            defaultKind: mappedKind,
            matchers,
            dryRun,
            refresh,
          });
          const action = result.action || "skip";
          if (stats[action] != null) stats[action] += 1;
          else if (action.startsWith("skip")) stats.skipped += 1;

          const p = result.preview;
          if (p) {
            console.log(
              `  [${action}] thread=${p.threadId} kind=${p.kind} tag=${p.topicTag} status=${p.status} rx=[${p.reactions}] comments=${p.comments} by=${p.authorName} | ${p.contentPreview}`,
            );
          } else {
            console.log(`  [${action}] thread=${result.threadId} ${result.reason || ""}`);
          }
        } catch (err) {
          stats.errors += 1;
          console.error(
            `  [error] thread=${thread.id}:`,
            err?.message || err,
          );
        }
        await sleep(80);
      }

      for (const message of rootMessages) {
        try {
          const result = await importChannelMessage({
            message,
            channel,
            guild,
            siteGuildId,
            topicTag: channelTopic,
            channelKindMap,
            defaultKind: mappedKind,
            matchers,
            dryRun,
            refresh,
          });
          const action = result.action || "skip";
          if (stats[action] != null) stats[action] += 1;
          else if (action.startsWith("skip")) stats.skipped += 1;

          const p = result.preview;
          if (p) {
            console.log(
              `  [${action}] message=${p.messageId} kind=${p.kind} tag=${p.topicTag} status=${p.status} rx=[${p.reactions}] by=${p.authorName} | ${p.contentPreview}`,
            );
          } else {
            console.log(`  [${action}] message=${result.messageId} ${result.reason || ""}`);
          }
        } catch (err) {
          stats.errors += 1;
          console.error(
            `  [error] message=${message.id}:`,
            err?.message || err,
          );
        }
        await sleep(80);
      }
    }

    console.log("[importStaffFeedback] Done:", stats);
    if (stats.byChannel && Object.keys(stats.byChannel).length) {
      console.log("[importStaffFeedback] Per-channel sample counts:");
      for (const [key, info] of Object.entries(stats.byChannel)) {
        console.log(
          `  ${key}: threads=${info.threads} messages=${info.messages || 0} kind=${info.kind} topic=${info.topic}`,
        );
      }
    }
  } finally {
    await client.destroy().catch(() => null);
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
