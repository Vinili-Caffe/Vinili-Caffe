/** Boost: messaggi di sistema di Discord ('ha boostato il server'). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { nativeBoostSeenByKey, clearBoostAnnounceHandled, nativeBoostSystemKind, nativeBoostSeenSince, resolveNativeBoostMessageUserId, parseNativeBoostSlotCount, mergeNativeBoostSlotEvents, collectNativeBoostSlotEventsForUser, resolveBoostNativeScanChannelsAsync } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");

const { noteNativeBoostMessage } = require("./boostNativeAlign") as typeof import("./boostNativeAlign");

const NATIVE_BOOST_ACCUMULATE_MS = 60_000;

function noteNativeBoostSeen(guildId?, userId?, slotCount = 1, messageId = "", kind = "boost") {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const key = `${gid}:${uid}`;
  const at = Date.now();
  const slots = Math.max(1, Math.min(2, Number(slotCount || 1)));
  const mid = String(messageId || "").trim();
  const msgKind = String(kind || "boost");
  const prev = nativeBoostSeenByKey.get(key);
  /* boostAlign1: ogni messaggio di boost nuovo (non il "livello raggiunto") sblocca il suo embed */
  if (msgKind !== "tier" && !(mid && Array.isArray(prev?.ids) && prev.ids.includes(mid))) {
    noteNativeBoostMessage(key, msgKind === "multi" ? 2 : slots);
  }
  const ids = new Set(Array.isArray(prev?.ids) ? prev.ids : []);
  const kinds = new Set(Array.isArray(prev?.kinds) ? prev.kinds : []);
  let nextSlots = slots;
  let slotsIncreased = false;
  if (mid && ids.has(mid)) {
    nextSlots = Math.max(Number(prev?.slots || 0), slots);
  } else if (prev && at - Number(prev.at || 0) < NATIVE_BOOST_ACCUMULATE_MS) {
    /* boostFalseDouble3: boost+tier (id diversi <5s) = STESSO boost → max, non somma.
       Due boost reali = due msg "boost"/"multi" (o testo "2 volte"). */
    const wasNewId = Boolean(mid && !ids.has(mid));
    if (mid) ids.add(mid);
    const dt = at - Number(prev.at || 0);
    const prevKinds = kinds;
    const sameBoostPair =
      wasNewId &&
      dt < 5000 &&
      slots < 2 &&
      Number(prev.slots || 0) < 2 &&
      ((prevKinds.has("boost") && msgKind === "tier") ||
        (prevKinds.has("tier") && msgKind === "boost") ||
        (prevKinds.has("tier") && msgKind === "tier"));
    if (slots >= 2 || msgKind === "multi") nextSlots = 2;
    else if (sameBoostPair) nextSlots = Math.max(Number(prev.slots || 0), slots);
    else if (wasNewId) nextSlots = Math.min(2, Number(prev.slots || 0) + slots);
    else if (dt < 5000) nextSlots = Math.max(Number(prev.slots || 0), slots);
    else nextSlots = Math.min(2, Number(prev.slots || 0) + slots);
    slotsIncreased = nextSlots > Number(prev?.slots || 0);
  } else {
    ids.clear();
    kinds.clear();
    if (mid) ids.add(mid);
    nextSlots = slots >= 2 || msgKind === "multi" ? Math.min(2, slots) : slots;
    slotsIncreased = true;
  }
  if (mid) ids.add(mid);
  kinds.add(msgKind);
  nativeBoostSeenByKey.set(key, {
    at,
    slots: nextSlots,
    ids: [...ids].slice(-8),
    kinds: [...kinds].slice(-8),
  });
  /* boostDedup1: clear handled solo se i slot nativi sono aumentati (nuovo boost), non ad ogni messaggio */
  if (slotsIncreased) clearBoostAnnounceHandled(key);
}

function handleNativeBoostSystemMessage(message?) {
  const guildId = String(message?.guild?.id || "").trim();
  const mainId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !mainId || guildId !== mainId) return null;
  const userId = resolveNativeBoostMessageUserId(message, message?.guild || null);
  if (!userId) return null;
  const slots = parseNativeBoostSlotCount(message);
  const kind = nativeBoostSystemKind(message);
  noteNativeBoostSeen(guildId, userId, slots, message?.id, kind);
  const accumulated = nativeBoostSeenSince(guildId, userId, Date.now() - NATIVE_BOOST_ACCUMULATE_MS);
  return {
    guildId,
    userId,
    slots: Math.max(slots, accumulated),
    kind,
    messageSlots: slots,
  };
}

function channelIdIsBoostNativeRecoveryTarget(guild?, channelId?) {
  if (!guild || String(guild.id) !== String(IDs.guilds?.main || "")) return false;
  const id = String(channelId || "");
  if (!id) return false;
  if (id === String(IDs.channels?.supporters || "")) return true;
  if (guild.systemChannelId && id === String(guild.systemChannelId)) return true;
  if (guild.publicUpdatesChannelId && id === String(guild.publicUpdatesChannelId)) return true;
  if (guild.rulesChannelId && id === String(guild.rulesChannelId)) return true;
  return false;
}

async function collectRecentNativeBoosterCandidates(guild?, primaryChannel?, opts: Record<string, any> = {}) {
  const maxWindowMs = opts.longWindow
    ? Math.max(60_000, Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.maxWindowMs || 48 * 60 * 60 * 1000)))
    : 10 * 60 * 1000;
  const windowMs = Math.max(60_000, Math.min(maxWindowMs, Number(opts.windowMs || 3 * 60 * 1000)));
  const fetchLimit = Math.max(60, Math.min(100, Number(opts.messageLimit || 100)));
  const minTs = Date.now() - windowMs;
  const channels = await resolveBoostNativeScanChannelsAsync(guild, primaryChannel);
  const eventsByUser = new Map();
  for (const channel of channels) {
    const recent = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
    if (!recent) continue;
    for (const message of recent.values()) {
      const ts = Number(message.createdTimestamp || 0);
      if (!ts || ts < minTs) continue;
      const slots = parseNativeBoostSlotCount(message);
      if (slots <= 0) continue;
      const uid = resolveNativeBoostMessageUserId(message, guild);
      if (!uid) continue;
      const list = eventsByUser.get(uid) || [];
      list.push({
        id: String(message.id || ""),
        ts,
        slots,
        kind: nativeBoostSystemKind(message),
      });
      eventsByUser.set(uid, list);
    }
  }
  const byUser = new Map();
  for (const [uid, events] of eventsByUser.entries()) {
    const slots = mergeNativeBoostSlotEvents(events);
    if (slots <= 0) continue;
    let firstTs = Number.POSITIVE_INFINITY;
    let lastTs = 0;
    for (const ev of events) {
      const ts = Number(ev?.ts || 0);
      if (!ts) continue;
      firstTs = Math.min(firstTs, ts);
      lastTs = Math.max(lastTs, ts);
    }
    byUser.set(uid, {
      slots,
      lastTs,
      firstTs: Number.isFinite(firstTs) ? firstTs : lastTs,
    });
  }
  return { byUser, windowMs, minTs };
}

async function countNativeBoostSlotsInRecentMessages(guild?, primaryChannel?, userId?, opts: Record<string, any> = {}) {
  if (!primaryChannel?.isTextBased?.() || !userId) return 0;
  const perChannelLimit = Math.max(20, Math.min(100, Number(opts.perChannelLimit || 100)));
  const minTs = Number.isFinite(Number(opts.sinceMs)) ? Math.max(0, Number(opts.sinceMs)) : 0;
  const events = await collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, {
    minTs,
    limit: perChannelLimit,
  }).catch(() => []);
  return mergeNativeBoostSlotEvents(events);
}

export = { NATIVE_BOOST_ACCUMULATE_MS, noteNativeBoostSeen, handleNativeBoostSystemMessage, channelIdIsBoostNativeRecoveryTarget, collectRecentNativeBoosterCandidates, countNativeBoostSlotsInRecentMessages };
