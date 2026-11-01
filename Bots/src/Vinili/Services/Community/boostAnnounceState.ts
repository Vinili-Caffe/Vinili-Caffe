/** Boost: annunci già fatti (doppioni, slot annunciati, conteggi nel canale). */
const { MessageType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, ensureBoostSlotsSynced, persistAnnouncedBoostSlotsToDb } = require("../../Utils/Community/boostSlotAnnounceTracker") as typeof import("../../Utils/Community/boostSlotAnnounceTracker");

const boostAnnounceCache = new Map();
const boostAnnounceHandledUntil = new Map();
const nativeBoostSeenByKey = new Map();
/* boostDedup1: contatore in-memory — Discord lagga sul fetch canale e i recover ripartevano a raffica */
const boostEmbedsSentRecently = new Map();
const BOOST_ANNOUNCE_HANDLED_TTL_MS = 3 * 60 * 1000;
const NATIVE_BOOST_SEEN_TTL_MS = 15 * 60 * 1000;
const BOOST_EMBEDS_RECENT_TTL_MS = 2 * 60 * 1000;

function clearBoostAnnounceHandled(boostKey?) {
  if (!boostKey) return;
  boostAnnounceHandledUntil.delete(String(boostKey));
}

function noteBoostEmbedsSentRecently(boostKey?, sentCount?) {
  const key = String(boostKey || "");
  const n = Math.max(0, Math.min(2, Math.floor(Number(sentCount || 0))));
  if (!key || n <= 0) return;
  const now = Date.now();
  const prev = boostEmbedsSentRecently.get(key);
  const prevCount =
    prev && now - Number(prev.at || 0) <= BOOST_EMBEDS_RECENT_TTL_MS
      ? Math.max(0, Number(prev.count || 0))
      : 0;
  boostEmbedsSentRecently.set(key, {
    at: now,
    count: Math.min(2, prevCount + n),
  });
  markBoostAnnounceHandled(key);
}

function recentBoostEmbedsSentCount(boostKey?) {
  const key = String(boostKey || "");
  const row = boostEmbedsSentRecently.get(key);
  if (!row) return 0;
  if (Date.now() - Number(row.at || 0) > BOOST_EMBEDS_RECENT_TTL_MS) {
    boostEmbedsSentRecently.delete(key);
    return 0;
  }
  return Math.max(0, Math.min(2, Number(row.count || 0)));
}

function nativeBoostSystemKind(message?) {
  const t = Number(message?.type);
  if (t === 9 || t === 10 || t === 11) return "tier";
  if (t === 8) return "boost";
  const text = String(message?.content || "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(due\s+volte|twice|\d{1,2}\s+volte|\d{1,2}\s+times?)\b/i.test(text)) return "multi";
  if (/(livello|level|tier)\s*\d/i.test(text) && /(potenziato|boosted)/i.test(text)) return "tier";
  return "boost";
}

function nativeBoostSeenSince(guildId?, userId?, sinceMs?) {
  const row = nativeBoostSeenByKey.get(`${String(guildId || "")}:${String(userId || "")}`);
  if (!row) return 0;
  const at = Number(row.at || 0);
  const minTs = Math.max(0, Number(sinceMs || 0) - 2000);
  if (!at || at < minTs) return 0;
  if (Date.now() - at > NATIVE_BOOST_SEEN_TTL_MS) {
    nativeBoostSeenByKey.delete(`${String(guildId || "")}:${String(userId || "")}`);
    return 0;
  }
  return Math.max(0, Number(row.slots || 0));
}

function resolveNativeBoostMessageUserId(message?, guild = null) {
  if (!message || parseNativeBoostSlotCount(message) <= 0) return "";
  const authorId = String(message.author?.id || "").trim();
  if (authorId && !message.author?.bot) return authorId;
  const interactionUserId = String(
    message.interactionMetadata?.user?.id ||
    message.interaction?.user?.id ||
    "",
  ).trim();
  if (interactionUserId) return interactionUserId;
  const memberId = String(message.member?.id || "").trim();
  if (memberId) return memberId;
  const users = message.mentions?.users;
  if (users?.size) {
    const first = users.first?.() || users.values?.()?.next?.()?.value;
    if (first?.id) return String(first.id);
  }
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const blob = [embed?.description, embed?.title, embed?.author?.name, embed?.footer?.text]
      .map((x?) => String(x || ""))
      .filter(Boolean)
      .join("\n");
    const mentionMatch = blob.match(/<@!?(\d{17,20})>/);
    if (mentionMatch) return mentionMatch[1];
  }
  const text = String(message.content || "").trim();
  const mentionMatch = text.match(/<@!?(\d{17,20})>/);
  if (mentionMatch) return mentionMatch[1];
  return resolveBoosterUserIdFromBoostContent(message, guild);
}

function resolveBoosterUserIdFromBoostContent(message?, guild?) {
  const chunks = [String(message?.content || "")];
  for (const embed of Array.isArray(message?.embeds) ? message.embeds : []) {
    chunks.push(
      embed?.description,
      embed?.title,
      embed?.author?.name,
      embed?.footer?.text,
    );
  }
  const text = chunks.map((x?) => String(x || "")).filter(Boolean).join("\n").trim();
  if (!text || !guild?.members?.cache) return "";
  const patterns = [
    /(.+?)\s+ha\s+appena\s+potenziato\s+il\s+server/i,
    /(.+?)\s+just\s+boosted\s+the\s+server/i,
    /(.+?)\s+boosted\s+the\s+server/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const label = m[1].replace(/\*\*/g, "").replace(/\s+\d+\s+volte.*$/i, "").trim();
    if (!label) continue;
    const lower = label.toLowerCase();
    let partial = "";
    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      const candidates = [
        String(member.displayName || ""),
        String(member.user?.globalName || ""),
        String(member.user?.username || ""),
      ].map((x?) => x.toLowerCase()).filter(Boolean);
      for (const candidate of candidates) {
        if (candidate === lower) return String(member.id);
        if (candidate.includes(lower) || lower.includes(candidate)) {
          partial = String(member.id);
        }
      }
    }
    if (partial) return partial;
  }
  return "";
}

function markBoostAnnounceHandled(boostKey?) {
  if (!boostKey) return;
  boostAnnounceHandledUntil.set(String(boostKey), Date.now() + BOOST_ANNOUNCE_HANDLED_TTL_MS);
}

function isBoostAnnounceHandled(boostKey?) {
  const until = Number(boostAnnounceHandledUntil.get(String(boostKey || "")) || 0);
  if (!until) return false;
  if (Date.now() > until) {
    boostAnnounceHandledUntil.delete(String(boostKey));
    return false;
  }
  return true;
}

function boostAnnounceLooksLikeBoost(text?) {
  return (
    /grazie\s+.*\s+per\s+il\s+boost/i.test(text) ||
    /per\s+il\s+doppio\s+boost/i.test(text) ||
    /per\s+il\s+boost/i.test(text) ||
    /ora\s+siamo\s+a\s+\d+\s+boost/i.test(text)
  );
}

function boostAnnounceSlotWeightFromText(text?) {
  const t = String(text || "");
  if (!boostAnnounceLooksLikeBoost(t)) return 0;
  if (/doppio\s+boost/i.test(t) || /PER IL DOPPIO BOOST/i.test(t)) return 2;
  return 1;
}

function messageBoostAnnounceSlotWeight(message?, uid?, botId?) {
  if (!messageMatchesBotBoostAnnounce(message, uid, botId)) return 0;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embedTexts = embeds.map((embed?) =>
    [embed?.title || "", embed?.description || "", embed?.footer?.text || ""].join("\n"),
  );
  const text = [message.content || "", ...embedTexts].join("\n");
  return boostAnnounceSlotWeightFromText(text);
}

function textMentionsUserId(text?, uid?) {
  const id = String(uid || "").trim();
  if (!id) return false;
  const t = String(text || "");
  return t.includes(`<@${id}>`) || t.includes(`<@!${id}>`) || t.includes(id);
}

function messageMatchesBotBoostAnnounce(message?, uid?, botId?) {
  if (botId && String(message?.author?.id || "") !== botId) return false;
  if (!botId && !message?.author?.bot) return false;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embedTexts = embeds.map((embed?) =>
    [embed?.title || "", embed?.description || "", embed?.footer?.text || ""].join("\n"),
  );
  const text = [message.content || "", ...embedTexts].join("\n");
  if (!textMentionsUserId(text, uid)) return false;
  return boostAnnounceLooksLikeBoost(text);
}

async function countRecentBotBoostAnnouncesForUser(channel?, userId?, opts: Record<string, any> = {}) {
  const uid = String(userId || "");
  if (!channel?.messages?.fetch || !uid) return 0;
  const botId = String(opts.botId || channel.client?.user?.id || "");
  const lookbackMs = Math.max(60_000, Number(opts.lookbackMs || 10 * 60 * 1000));
  const sinceMs = Number.isFinite(Number(opts.sinceMs))
    ? Math.max(0, Number(opts.sinceMs))
    : Date.now() - lookbackMs;
  const maxScan = Math.max(80, Math.min(1500, Number(opts.limit || opts.maxScan || 500)));
  let count = 0;
  let before;
  let scanned = 0;
  while (scanned < maxScan) {
    const batchSize = Math.min(100, maxScan - scanned);
    const fetchOpts: Record<string, any> = { limit: batchSize };
    if (before) fetchOpts.before = before;
    const batch = await channel.messages.fetch(fetchOpts).catch(() => null);
    if (!batch?.size) break;
    let oldestTs = Infinity;
    for (const message of batch.values()) {
      scanned += 1;
      const ts = Number(message?.createdTimestamp || 0);
      if (ts) oldestTs = Math.min(oldestTs, ts);
      if (!ts || ts < sinceMs) continue;
      count += messageBoostAnnounceSlotWeight(message, uid, botId);
      if (count >= 2) return 2;
    }
    if (Number.isFinite(oldestTs) && oldestTs < sinceMs) break;
    const oldest = batch.last();
    if (!oldest?.id || batch.size < batchSize) break;
    before = oldest.id;
  }
  return Math.min(2, count);
}

async function countRecentBotBoostAnnouncesForUserMulti(channel?, userId?, thresholds: Record<string, any> = {}) {
  const uid = String(userId || "");
  if (!channel?.messages?.fetch || !uid) {
    return { since: 0, period: 0, lookback: 0 };
  }
  const botId = String(thresholds.botId || channel.client?.user?.id || "");
  const sinceMs = Math.max(0, Number(thresholds.sinceMs || 0));
  const periodSinceMs = Math.max(0, Number(thresholds.periodSinceMs || 0));
  const lookbackSinceMs = Math.max(
    0,
    Date.now() - Math.max(60_000, Number(thresholds.lookbackMs || 10 * 60 * 1000)),
  );
  const cutoff = Math.min(
    sinceMs || Infinity,
    periodSinceMs || Infinity,
    lookbackSinceMs || Infinity,
  );
  const maxScan = Math.max(80, Math.min(1500, Number(thresholds.limit || thresholds.maxScan || 500)));
  let since = 0;
  let period = 0;
  let lookback = 0;
  let before;
  let scanned = 0;
  while (scanned < maxScan) {
    const batchSize = Math.min(100, maxScan - scanned);
    const fetchOpts: Record<string, any> = { limit: batchSize };
    if (before) fetchOpts.before = before;
    const batch = await channel.messages.fetch(fetchOpts).catch(() => null);
    if (!batch?.size) break;
    let oldestTs = Infinity;
    for (const message of batch.values()) {
      scanned += 1;
      const ts = Number(message?.createdTimestamp || 0);
      if (ts) oldestTs = Math.min(oldestTs, ts);
      if (!ts) continue;
      const w = messageBoostAnnounceSlotWeight(message, uid, botId);
      if (!w) continue;
      if (ts >= sinceMs) since += w;
      if (ts >= periodSinceMs) period += w;
      if (ts >= lookbackSinceMs) lookback += w;
    }
    if (Number.isFinite(oldestTs) && Number.isFinite(cutoff) && oldestTs < cutoff) break;
    const oldest = batch.last();
    if (!oldest?.id || batch.size < batchSize) break;
    before = oldest.id;
  }
  return {
    since: Math.min(2, since),
    period: Math.min(2, period),
    lookback: Math.min(2, lookback),
  };
}

async function resolveBoostAnnounceSyncState(guild?, userId?, channel?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  const sinceMs = Number.isFinite(Number(opts.sinceMs))
    ? Math.max(0, Number(opts.sinceMs))
    : Date.now() - Math.max(60_000, Number(opts.nativeLookbackMs || 10 * 60 * 1000));
  const nativeLookbackMs = Math.max(60_000, Number(opts.nativeLookbackMs || 10 * 60 * 1000));
  const knownNative = Math.max(0, Number(opts.knownNativeSlots || 0));
  const seenNative = nativeBoostSeenSince(gid, uid, sinceMs);
    const skipNativeScan = Boolean(opts.skipNativeScan) || Math.max(knownNative, seenNative) >= 2;
  const scannedNative = channel && !skipNativeScan
    ? await detectRecentNativeBoostEventsForUser(guild, channel, uid, nativeLookbackMs).catch(() => 0)
    : 0;
  const nativeBoostEvents = Math.max(knownNative, seenNative, scannedNative);
  const announcedSlots = channel
    ? await resolveEffectiveAnnouncedBoostSlots(gid, uid, channel, { sinceMs, lookbackMs: nativeLookbackMs }).catch(() => getAnnouncedBoostSlots(gid, uid))
    : getAnnouncedBoostSlots(gid, uid);
  return {
    nativeBoostEvents,
    announcedSlots,
    missing: Math.max(0, nativeBoostEvents - announcedSlots),
  };
}

async function markBoostAnnounceHandledIfSynced(guild?, userId?, channel?, opts: Record<string, any> = {}) {
  const sync = await resolveBoostAnnounceSyncState(guild, userId, channel, opts).catch(() => null);
  if (!sync || sync.missing > 0) return false;
  markBoostAnnounceHandled(`${String(guild?.id || "")}:${String(userId || "")}`);
  return true;
}

async function resolveEffectiveAnnouncedBoostSlots(guildId?, userId?, channel?, opts: Record<string, any> = {}) {
  await ensureBoostSlotsSynced(guildId, userId).catch(() => null);
  const tracked = getAnnouncedBoostSlots(guildId, userId);
  if (!channel) return tracked;
  const channelCount = await countRecentBotBoostAnnouncesForUser(channel, userId, opts).catch(() => 0);
  const safeChannel = Math.max(0, Number(channelCount || 0));
  if (safeChannel > 0 && safeChannel < tracked) {
    setAnnouncedBoostSlots(guildId, userId, safeChannel);
    await persistAnnouncedBoostSlotsToDb(guildId, userId).catch(() => null);
    return safeChannel;
  }
  return Math.max(tracked, safeChannel);
}

function normalizeBoostAnnounceEntry(raw?) {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw) && typeof raw.count === "number") {
    return {
      count: raw.count,
      premiumTs: raw.premiumTs != null ? Number(raw.premiumTs) : null,
    };
  }
  if (typeof raw === "number") return { count: raw, premiumTs: null };
  return null;
}

function rememberBoostAnnounce(boostKey?, guildPremiumCount?, premiumSinceTs?) {
  boostAnnounceCache.set(boostKey, {
    count: Number(guildPremiumCount || 0),
    premiumTs: premiumSinceTs != null ? Number(premiumSinceTs) : null,
  });
}

function resolveBoostSlotTarget(member?, announcedSlots?, nativeBoostEvents?, forcedSlots?, opts: Record<string, any> = {}) {
  if (Number(member?.premiumSinceTimestamp || 0) <= 0 && !forcedSlots && !opts.allowSecondRecovery) return 0;
  const announced = Math.max(0, Number(announcedSlots || 0));
  let target = Math.min(
    2,
    Math.max(
      Number(forcedSlots || 0),
      Number(nativeBoostEvents || 0),
      Number(opts.nativeSeenSlots || 0),
      Number(opts.expectedSlots || 0),
      announced,
    ),
  );
  /* boostFalseDouble2: announced+N SOLO se i nativi superano già gli announce.
     Prima messageCreate (1° boost) arrivava dopo memberUpdate (announced=1) con
     incremental → announced+1=2 → embed doppio + Double Booster a chi boostava 1 volta. */
  const nativeHint = Math.max(
    Number(forcedSlots || 0),
    Number(opts.nativeSeenSlots || 0),
    Number(opts.nativeEventSlots || 0),
    Number(nativeBoostEvents || 0),
  );
  if (opts.incrementalNativeEvent) {
    const eventSlots = Math.max(1, Math.min(2, Number(opts.nativeEventSlots || forcedSlots || 1)));
    if (nativeHint > announced || Boolean(opts.secondBoostConfirmed)) {
      target = Math.min(2, Math.max(target, announced + eventSlots, nativeHint));
    } else {
      target = Math.min(2, Math.max(target, nativeHint, eventSlots, announced));
    }
  }
  /* boostFalseDouble3: 2° slot SOLO con conferma dura (2° boost / testo multi / scan ≥2 dopo merge). */
  const hardDouble =
    Boolean(opts.secondBoostConfirmed) ||
    Boolean(opts.confirmedDoubleBurst) ||
    (Boolean(opts.allowSecondRecovery) && nativeHint >= 2 && Boolean(opts.nativeScanVerified));
  if (hardDouble && Number(member?.premiumSinceTimestamp || 0) > 0) {
    target = Math.min(2, Math.max(target, announced >= 1 ? 2 : Math.max(nativeHint, 2)));
  } else if (target >= 2 && !hardDouble && announced < 1) {
    /* niente DOPPIO al primo announce senza prova */
    target = 1;
  }
  return target;
}

function boostAnnouncePeriodSinceMs(member?, opts: Record<string, any> = {}, nativeLookbackMs = 10 * 60 * 1000) {
  const premiumSince = Number(member?.premiumSinceTimestamp || 0);
  if (premiumSince > 0) return Math.max(0, premiumSince - 1000);
  const recoveryStartedAt = Number(opts.startedAt);
  if (Number.isFinite(recoveryStartedAt) && recoveryStartedAt > 0) {
    return Math.max(0, recoveryStartedAt - 1000);
  }
  return Date.now() - Math.max(60_000, Number(nativeLookbackMs || 10 * 60 * 1000));
}

async function syncAnnouncedBoostSlotsFromChannelCount(guildId?, userId?, channelCount?) {
  const next = Math.max(0, Math.floor(Number(channelCount || 0)));
  const current = getAnnouncedBoostSlots(guildId, userId);
  if (next <= current) return current;
  setAnnouncedBoostSlots(guildId, userId, next);
  await persistAnnouncedBoostSlotsToDb(guildId, userId).catch(() => null);
  return next;
}

function shouldSkipDuplicateBoostAnnounce(boostKey?, countIncreased?, currentCount?, newBoostTs?) {
  if (!countIncreased) return false;
  const meta = normalizeBoostAnnounceEntry(boostAnnounceCache.get(boostKey));
  if (!meta || meta.count !== currentCount) return false;
  const ts = Number(newBoostTs || 0);
  if (meta.premiumTs != null && ts > 0) return meta.premiumTs === ts;
  if (meta.premiumTs == null && ts > 0) return true;
  return false;
}

function getBoostSystemMessageTypes() {
  return new Set(
    [
      MessageType?.GuildBoost,
      MessageType?.GuildBoostTier1,
      MessageType?.GuildBoostTier2,
      MessageType?.GuildBoostTier3,
      (MessageType as any)?.UserPremiumGuildSubscription,
      (MessageType as any)?.UserPremiumGuildSubscriptionTier1,
      (MessageType as any)?.UserPremiumGuildSubscriptionTier2,
      (MessageType as any)?.UserPremiumGuildSubscriptionTier3,
      8,
      9,
      10,
      11,
    ].filter((x?) => typeof x === "number"),
  );
}

function parseNativeBoostSlotCount(message?) {
  const boostTypes = getBoostSystemMessageTypes();
  const isBoostType = boostTypes.has(Number(message?.type));
  const raw = String(message?.content || "");
    const text = raw.replace(/\*/g, " ").replace(/\s+/g, " ").trim();
  const isBoostText = /(ha\s+appena\s+potenziato\s+il\s+server|just\s+boosted\s+the\s+server)/i.test(text);
  if (!isBoostType && !isBoostText) return 0;

  if (/\b(due\s+volte|twice)\b/i.test(text)) return 2;
  const countMatch =
    text.match(/\b(\d{1,2})\s+volte\b/i) ||
    text.match(/\b(\d{1,2})\s+times\b/i) ||
    text.match(/\b(\d{1,2})\s+time\b/i);
  if (countMatch) {
    const parsed = Number(countMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.min(10, Math.floor(parsed)));
  }
  if (isBoostType && /^\d{1,2}$/.test(text)) {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.min(10, Math.floor(parsed)));
  }
  return 1;
}

function mergeNativeBoostSlotEvents(events?) {
  const list = Array.isArray(events) ? events.slice() : [];
  list.sort((a?, b?) => Number(a?.ts || 0) - Number(b?.ts || 0));
  const merged = [];
  const seenIds = new Set();
  for (const ev of list) {
    const id = String(ev?.id || "");
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    const slots = Math.max(0, Math.min(2, Number(ev?.slots || 0)));
    const ts = Number(ev?.ts || 0);
    const kind = String(ev?.kind || "boost");
    if (slots <= 0) continue;
    const last = merged[merged.length - 1];
    /* boostFalseDouble3: boost+tier entro 5s = stesso boost (max).
       Due boost reali = due "boost"/"multi" distinti → somma. */
    if (last && ts && last.ts && Math.abs(ts - last.ts) <= 5000) {
      const sameId = Boolean(id && last.id && id === last.id);
      const boostTierPair =
        (last.kind === "boost" && kind === "tier") ||
        (last.kind === "tier" && kind === "boost") ||
        (last.kind === "tier" && kind === "tier");
      if (sameId || boostTierPair || !(id && last.id && id !== last.id)) {
        last.slots = Math.max(last.slots, slots);
        last.ts = Math.max(last.ts, ts);
        if (kind === "multi" || slots >= 2) last.slots = 2;
        if (kind === "boost" && last.kind === "tier") last.kind = "boost";
        continue;
      }
    }
    merged.push({ id, ts, slots: kind === "multi" ? Math.max(slots, 2) : slots, kind });
  }
  return Math.min(2, merged.reduce((sum?, row?) => sum + Number(row.slots || 0), 0));
}

async function collectNativeBoostSlotEventsForUser(guild?, primaryChannel?, userId?, opts: Record<string, any> = {}) {
  if (!userId) return [];
  const minTs = Math.max(0, Number(opts.minTs || 0));
  const limit = Math.max(20, Math.min(100, Number(opts.limit || 80)));
  const channels = await resolveBoostNativeScanChannelsAsync(guild, primaryChannel);
  const events = [];
  for (const channel of channels) {
    const recent = await channel.messages.fetch({ limit }).catch(() => null);
    if (!recent) continue;
    for (const m of recent.values()) {
      const messageUserId = resolveNativeBoostMessageUserId(m, guild);
      if (!messageUserId || String(messageUserId) !== String(userId)) continue;
      const ts = Number(m.createdTimestamp || 0);
      if (minTs > 0 && ts && ts < minTs) continue;
      const slots = parseNativeBoostSlotCount(m);
      if (slots > 0) {
        events.push({
          id: String(m.id || ""),
          ts,
          slots,
          kind: nativeBoostSystemKind(m),
        });
      }
    }
  }
  return events;
}

async function resolveBoostNativeScanChannelsAsync(guild?, primaryChannel?) {
  const list = [];
  const seen = new Set();
  function push(ch?) {
    if (!ch?.id) return;
    const sid = String(ch.id);
    if (seen.has(sid)) return;
    if (!ch.isTextBased?.()) return;
    seen.add(sid);
    list.push(ch);
  }
  push(primaryChannel);
  if (!guild) return list;
    const ids = [
    guild.systemChannelId,
    guild.publicUpdatesChannelId,
    guild.rulesChannelId,
    IDs.channels?.supporters,
  ].filter((x?) => x != null && String(x).length > 10);
  for (const rawId of ids) {
    const sid = String(rawId);
    let ch = guild.channels.cache.get(sid);
    if (!ch) ch = await guild.channels.fetch(sid).catch(() => null);
    push(ch);
  }
  return list;
}

async function detectRecentNativeBoostEventsForUser(guild?, primaryChannel?, userId?, windowMs = 10 * 60 * 1000) {
  if (!primaryChannel?.isTextBased?.() || !userId) return 0;
  const minTs = Date.now() - Math.max(60 * 1000, Number(windowMs || 0));
  const events = await collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, {
    minTs,
    limit: 80,
  }).catch(() => []);
  return mergeNativeBoostSlotEvents(events);
}

function extractBoostAnnounceTargetUserId(content?) {
  const m = String(content || "").match(/<@!?(\d{17,20})>/);
  return m ? m[1] : "";
}

function extractEmbedDescription(embed?) {
  if (!embed) return "";
  const fromData = embed.data && typeof embed.data.description === "string" ? embed.data.description : "";
  if (fromData) return fromData;
  return typeof embed.description === "string" ? embed.description : "";
}

async function buildBoostAnnounceEmbedIndex(channel?, botUid?, fetchLimit = 200) {
  const byUser = new Map();
  const batch = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!batch) return byUser;
  for (const msg of batch.values()) {
    if (String(msg.author?.id || "") !== botUid) continue;
    const uid = extractBoostAnnounceTargetUserId(msg.content);
    if (!uid) continue;
    const desc = extractEmbedDescription(msg.embeds?.[0]);
    const text = [msg.content || "", desc].join("\n");
    if (!boostAnnounceLooksLikeBoost(text)) continue;
    const row = byUser.get(uid) || { total: 0, hasDouble: false };
    row.total += 1;
    if (desc.includes("DOPPIO") && /boost/i.test(desc)) row.hasDouble = true;
    byUser.set(uid, row);
  }
  return byUser;
}

export = { boostAnnounceCache, nativeBoostSeenByKey, clearBoostAnnounceHandled, noteBoostEmbedsSentRecently, recentBoostEmbedsSentCount, nativeBoostSystemKind, nativeBoostSeenSince, resolveNativeBoostMessageUserId, resolveBoosterUserIdFromBoostContent, markBoostAnnounceHandled, isBoostAnnounceHandled, boostAnnounceLooksLikeBoost, textMentionsUserId, countRecentBotBoostAnnouncesForUser, countRecentBotBoostAnnouncesForUserMulti, resolveBoostAnnounceSyncState, markBoostAnnounceHandledIfSynced, rememberBoostAnnounce, resolveBoostSlotTarget, boostAnnouncePeriodSinceMs, syncAnnouncedBoostSlotsFromChannelCount, shouldSkipDuplicateBoostAnnounce, getBoostSystemMessageTypes, parseNativeBoostSlotCount, mergeNativeBoostSlotEvents, collectNativeBoostSlotEventsForUser, resolveBoostNativeScanChannelsAsync, extractBoostAnnounceTargetUserId, extractEmbedDescription, buildBoostAnnounceEmbedIndex };
