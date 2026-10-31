/** Ticket dal sito: reazioni ai messaggi ed emoji del server. */
const MAX_REACTION_KINDS = 20;
const MAX_REACTION_USERS = 80;
const EMOJI_CACHE_TTL_MS = 5 * 60 * 1000;

let guildEmojiCache = { guildId: "", at: 0, emojis: [] };

function customEmojiCdnUrl(emojiId?, animated?, size = 32) {
  const id = String(emojiId || "").trim();
  if (!id) return "";
  const sz = Number(size) > 0 ? Number(size) : 32;
    if (animated) {
    return `https://cdn.discordapp.com/emojis/${id}.webp?size=${sz}&animated=true`;
  }
  return `https://cdn.discordapp.com/emojis/${id}.webp?size=${sz}`;
}

function parseReactionInput(raw?, body?) {
  const fromBody = body && typeof body === "object" ? body : {};
  let s = String(raw != null ? raw : fromBody.emoji || fromBody.markup || "").trim().slice(0, 80);
  if (!s && fromBody.emojiId) {
    const id = String(fromBody.emojiId || "").trim();
    const name = String(fromBody.name || "emoji")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 64) || "emoji";
    const animated = fromBody.animated === true;
    if (!/^\d{5,32}$/.test(id)) return null;
    s = `<${animated ? "a" : ""}:${name}:${id}>`;
  }
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/.exec(s);
  if (custom) {
    return {
      key: `c:${custom[3]}`,
      emoji: s,
      emojiId: custom[3],
      name: custom[2],
      animated: custom[1] === "a",
    };
  }
  if (!s || s.length > 16 || /[<>\n\r]/.test(s)) return null;
  return {
    key: `u:${s}`,
    emoji: s,
    emojiId: null,
    name: "",
    animated: false,
  };
}

function normalizeReactionUsers(r?, nameMap?) {
  const fromUsers = Array.isArray(r?.users)
    ? r.users
        .map((u?) => ({
          id: String(u?.id || u?.userId || "").trim(),
          name: String(u?.name || "").trim(),
        }))
        .filter((u?) => u.id)
    : [];
  const byId = new Map();
  for (const u of fromUsers) {
    const mapped = nameMap?.get?.(u.id);
    byId.set(u.id, {
      id: u.id,
      name: u.name || mapped || "Utente",
    });
  }
  const ids = Array.isArray(r?.userIds)
    ? r.userIds.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];
  for (const id of ids) {
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      name: nameMap?.get?.(id) || "Utente",
    });
  }
  return Array.from(byId.values());
}

function serializeReactions(list?, nameMap?) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .map((r?) => {
      const users = normalizeReactionUsers(r, nameMap);
      if (!users.length) return null;
      const emojiId = r?.emojiId ? String(r.emojiId).trim() : "";
      const animated = Boolean(r?.animated);
      return {
        key: String(r?.key || "").trim(),
        emoji: String(r?.emoji || "").trim(),
        emojiId: emojiId || null,
        name: String(r?.name || "").trim() || null,
        animated,
        count: users.length,
        userIds: users.map((u?) => u.id),
        users,
        url: emojiId ? customEmojiCdnUrl(emojiId, animated, 32) : null,
      };
    })
    .filter((r?) => r && r.key && r.emoji);
}

function buildReactionNameMap(ticket?, messageDocs?) {
  const map = new Map();
  const put = (id?, name?) => {
    const uid = String(id || "").trim();
    const label = String(name || "").trim();
    if (!uid || !label) return;
    if (!map.has(uid) || map.get(uid) === "Utente") map.set(uid, label);
  };
  if (ticket) {
    put(ticket.userId, ticket.authorName);
    put(ticket.claimedBy, ticket.claimedByName);
    put(ticket.closedBy, ticket.closedByName);
  }
  for (const doc of Array.isArray(messageDocs) ? messageDocs : []) {
    put(doc?.authorId, doc?.authorName);
    const reactions = Array.isArray(doc?.reactions) ? doc.reactions : [];
    for (const r of reactions) {
      for (const u of normalizeReactionUsers(r)) {
        put(u.id, u.name);
      }
    }
  }
  return map;
}

async function listGuildEmojisCached(client?, guildId?, { force = false } = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const now = Date.now();
  if (
    !force &&
    guildEmojiCache.guildId === gid &&
    now - guildEmojiCache.at < EMOJI_CACHE_TTL_MS &&
    Array.isArray(guildEmojiCache.emojis)
  ) {
    return guildEmojiCache.emojis;
  }
  try {
    const { listGuildPickerData } = require("../../dashboard/siteDashboardPartnershipApi") as typeof import("../../dashboard/siteDashboardPartnershipApi");
    const pickers = await listGuildPickerData(client, gid, { force: force === true });
    const emojis = Array.isArray(pickers?.emojis) ? pickers.emojis : [];
    guildEmojiCache = { guildId: gid, at: now, emojis };
    return emojis;
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] listGuildEmojisCached:", err?.message || err);
    return guildEmojiCache.guildId === gid ? guildEmojiCache.emojis : [];
  }
}

export = { MAX_REACTION_KINDS, MAX_REACTION_USERS, parseReactionInput, normalizeReactionUsers, serializeReactions, buildReactionNameMap, listGuildEmojisCached };
