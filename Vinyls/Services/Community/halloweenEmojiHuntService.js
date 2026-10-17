const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const {
  isHalloweenEventLive,
  resolveHalloweenEventConfig,
  createUtcFromRomeLocal,
} = require("../../Utils/Web/halloweenEventConfig");
const { addHalloweenCandy, resolveEventKey } = require("./halloweenCandyService");

const DOC_TYPE = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const DOC_OWNER = "__halloween_emoji_hunt__";
const DOC_DEDUPE = "halloween_emoji_hunt_state_v1";
const loopState = new WeakSet();
const claimLocks = new Set();

const DEFAULTS = {
  enabled: true,
  emoji: "<:VC_Halloween:1558964785113206824>",
  hourStart: 8,
  hourEnd: 24,
  slotMinutes: 30,
  activeDurationMs: 15 * 60 * 1000,
  rewardCandy: 1,
  messageHistoryLimit: 40,
  minCandidateAgeMs: 30 * 1000,
  maxCandidateAgeMs: 6 * 60 * 60 * 1000,
};

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getConfig(client) {
  const raw =
    client?.config?.halloweenEmojiHunt && typeof client.config.halloweenEmojiHunt === "object"
      ? client.config.halloweenEmojiHunt
      : {};
  const out = { ...DEFAULTS, ...raw };
  out.enabled = out.enabled !== false;
  out.channelId = normalizeId(out.channelId || IDs.channels?.chat);
  out.emoji = normalizeId(out.emoji) || DEFAULTS.emoji;
  out.hourStart = safeInt(out.hourStart, DEFAULTS.hourStart, 0, 23);
  out.hourEnd = safeInt(out.hourEnd, DEFAULTS.hourEnd, 1, 24);
  out.slotMinutes = safeInt(out.slotMinutes, DEFAULTS.slotMinutes, 5, 60);
  out.activeDurationMs = safeInt(out.activeDurationMs, DEFAULTS.activeDurationMs, 60_000, 60 * 60_000);
  out.rewardCandy = safeInt(out.rewardCandy, DEFAULTS.rewardCandy, 0, 50);
  out.messageHistoryLimit = safeInt(out.messageHistoryLimit, DEFAULTS.messageHistoryLimit, 10, 100);
  out.minCandidateAgeMs = safeInt(out.minCandidateAgeMs, DEFAULTS.minCandidateAgeMs, 0, 24 * 60 * 60_000);
  out.maxCandidateAgeMs = safeInt(out.maxCandidateAgeMs, DEFAULTS.maxCandidateAgeMs, out.minCandidateAgeMs + 1000, 48 * 60 * 60_000);
  return out;
}

function resolveHuntChannelIdForGuild(guildId, baseChannelId) {
  const gid = normalizeId(guildId);
  const base = normalizeId(baseChannelId);
  if (!gid || !base) return base;
  try {
    const { remapChannelIdForGuild, isTestMirrorGuild } = require("../../Utils/Config/testGuildMirrorRemap");
    if (isTestMirrorGuild(gid)) return remapChannelIdForGuild(gid, base) || base;
  } catch (_) {}
  return base;
}

function listHuntTargets(client, cfg) {
  const targets = [];
  const mainId = normalizeId(IDs.guilds?.main);
  const testId = normalizeId(IDs.guilds?.test);
  const baseChannelId = normalizeId(cfg.channelId);
  if (mainId && isHalloweenEventLive(client, Date.now(), mainId) && baseChannelId) {
    targets.push({ guildId: mainId, channelId: baseChannelId });
  }
  if (testId && isHalloweenEventLive(client, Date.now(), testId)) {
    const mapped = resolveHuntChannelIdForGuild(testId, baseChannelId);
    if (mapped) targets.push({ guildId: testId, channelId: mapped });
  }
  return targets;
}

function getRomeParts(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function romeLocalToUtcMs(y, m, d, hour, minute, second = 0) {
  return createUtcFromRomeLocal(y, m, d, hour, minute, second, 0).getTime();
}

function slotKeyFromRome(parts, slotMinutes) {
  const slotMin = Math.floor(parts.minute / slotMinutes) * slotMinutes;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(slotMin).padStart(2, "0")}`;
}

function isWithinHuntHours(parts, cfg) {
  const minutes = parts.hour * 60 + parts.minute;
  const start = cfg.hourStart * 60;
  const end = cfg.hourEnd * 60;
  if (end <= start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}

function parseEmojiTarget(emoji) {
  const raw = normalizeId(emoji);
  const custom = raw.match(/^<a?:([\w~]+):(\d+)>$/);
  if (custom) return { id: custom[2], name: custom[1], animated: raw.startsWith("<a:"), raw };
  return { id: null, name: raw, animated: false, raw };
}

function reactionMatches(reaction, emojiCfg) {
  const target = parseEmojiTarget(emojiCfg);
  const id = normalizeId(reaction?.emoji?.id);
  const name = normalizeId(reaction?.emoji?.name);
  if (target.id) return id === target.id;
  return name && name === target.name;
}

async function loadState(guildId) {
  const gid = normalizeId(guildId);
  if (!gid) return null;
  return SiteDocument.findOne({ guildId: gid, docType: DOC_TYPE, dedupeKey: DOC_DEDUPE }).lean().catch(() => null);
}

async function saveState(guildId, patch) {
  const gid = normalizeId(guildId);
  if (!gid) return null;
  /* userId solo in $setOnInsert: $set+$setOnInsert sullo stesso path → Mongo conflict */
  return SiteDocument.findOneAndUpdate(
    { guildId: gid, docType: DOC_TYPE, dedupeKey: DOC_DEDUPE },
    {
      $set: {
        ...Object.fromEntries(Object.entries(patch || {}).map(([k, v]) => [`rawWebhook.${k}`, v])),
        updatedAt: new Date(),
      },
      $setOnInsert: { guildId: gid, docType: DOC_TYPE, userId: DOC_OWNER, dedupeKey: DOC_DEDUPE },
    },
    { upsert: true, new: true },
  ).catch((err) => {
    global.logger?.warn?.("[HALLOWEEN-HUNT] saveState failed:", err?.message || err);
    return null;
  });
}

function readState(doc) {
  const raw = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  return {
    lastSlotKey: normalizeId(raw.lastSlotKey),
    scheduledSlotKey: normalizeId(raw.scheduledSlotKey),
    scheduledAtMs: Number(raw.scheduledAtMs) || 0,
    activeMessageId: normalizeId(raw.activeMessageId),
    activeChannelId: normalizeId(raw.activeChannelId),
    activeEndsAtMs: Number(raw.activeEndsAtMs) || 0,
    winnerUserId: normalizeId(raw.winnerUserId),
  };
}

function pickNextSpawnAtMs(nowMs, cfg) {
  const parts = getRomeParts(nowMs);
  const slotMin = Math.floor(parts.minute / cfg.slotMinutes) * cfg.slotMinutes;
  let hour = parts.hour;
  let day = parts.day;
  let month = parts.month;
  let year = parts.year;
  let candidateSlot = slotMin;

  const currentSlotStart = romeLocalToUtcMs(year, month, day, hour, candidateSlot, 0);
  const jitter = Math.floor(Math.random() * cfg.slotMinutes * 60 * 1000);
  let spawnAt = currentSlotStart + jitter;
  const key = slotKeyFromRome({ year, month, day, hour, minute: candidateSlot }, cfg.slotMinutes);

  if (spawnAt <= nowMs + 5_000 || !isWithinHuntHours({ hour, minute: candidateSlot }, cfg)) {
    candidateSlot += cfg.slotMinutes;
    if (candidateSlot >= 60) {
      candidateSlot = 0;
      hour += 1;
      if (hour >= 24) {
        hour = 0;
        const next = new Date(romeLocalToUtcMs(year, month, day, 12, 0, 0) + 24 * 60 * 60_000);
        const np = getRomeParts(next.getTime());
        year = np.year;
        month = np.month;
        day = np.day;
      }
    }
    while (!isWithinHuntHours({ hour, minute: candidateSlot }, cfg)) {
      candidateSlot += cfg.slotMinutes;
      if (candidateSlot >= 60) {
        candidateSlot = 0;
        hour += 1;
        if (hour >= 24) {
          hour = 0;
          const next = new Date(romeLocalToUtcMs(year, month, day, 12, 0, 0) + 24 * 60 * 60_000);
          const np = getRomeParts(next.getTime());
          year = np.year;
          month = np.month;
          day = np.day;
        }
      }
    }
    const nextStart = romeLocalToUtcMs(year, month, day, hour, candidateSlot, 0);
    spawnAt = nextStart + Math.floor(Math.random() * cfg.slotMinutes * 60 * 1000);
    return {
      spawnAtMs: spawnAt,
      slotKey: slotKeyFromRome({ year, month, day, hour, minute: candidateSlot }, cfg.slotMinutes),
    };
  }
  return { spawnAtMs: spawnAt, slotKey: key };
}

async function pickRandomChatMessage(channel, cfg) {
  if (!channel?.messages?.fetch) return null;
  const fetched = await channel.messages.fetch({ limit: cfg.messageHistoryLimit }).catch(() => null);
  if (!fetched?.size) return null;
  const now = Date.now();
  const candidates = [...fetched.values()].filter((msg) => {
    if (!msg || msg.system || msg.webhookId) return false;
    if (msg.author?.bot) return false;
    const age = now - (msg.createdTimestamp || 0);
    if (age < cfg.minCandidateAgeMs || age > cfg.maxCandidateAgeMs) return false;
    if (!normalizeId(msg.content) && !(msg.attachments?.size > 0) && !(msg.embeds?.length > 0)) return false;
    return true;
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function spawnHunt(client, cfg, guildId, slotKey, channelIdOverride = null) {
  const channelId = normalizeId(channelIdOverride || cfg.channelId);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return false;
  const message = await pickRandomChatMessage(channel, cfg);
  if (!message) return false;
  const emoji = parseEmojiTarget(cfg.emoji);
  const reactArg = emoji.id ? { id: emoji.id, name: emoji.name } : emoji.raw;
  await message.react(reactArg).catch((err) => {
    global.logger?.warn?.("[HALLOWEEN-HUNT] react failed:", err?.message || err);
  });
  const endsAt = Date.now() + cfg.activeDurationMs;
  await saveState(guildId, {
    lastSlotKey: slotKey,
    scheduledSlotKey: slotKey,
    scheduledAtMs: Date.now(),
    activeMessageId: message.id,
    activeChannelId: channel.id,
    activeEndsAtMs: endsAt,
    winnerUserId: "",
  });
  return true;
}

async function expireActiveIfNeeded(guildId, state) {
  if (!state?.activeMessageId) return state;
  if (state.winnerUserId) return state;
  if (state.activeEndsAtMs && Date.now() < state.activeEndsAtMs) return state;
  await saveState(guildId, {
    activeMessageId: "",
    activeChannelId: "",
    activeEndsAtMs: 0,
  });
  return { ...state, activeMessageId: "", activeChannelId: "", activeEndsAtMs: 0 };
}

async function runHalloweenEmojiHuntTickForTarget(client, cfg, target) {
  const guildId = normalizeId(target?.guildId);
  const channelId = normalizeId(target?.channelId);
  if (!guildId || !channelId) return;
  if (!isHalloweenEventLive(client, Date.now(), guildId)) return;

  let state = readState(await loadState(guildId));
  state = await expireActiveIfNeeded(guildId, state);

  const now = Date.now();
  if (state.activeMessageId && state.activeEndsAtMs > now && !state.winnerUserId) return;

  const parts = getRomeParts(now);
  if (!isWithinHuntHours(parts, cfg)) return;

  const currentKey = slotKeyFromRome(parts, cfg.slotMinutes);
  if (state.lastSlotKey === currentKey) return;

  if (state.scheduledSlotKey === currentKey && state.scheduledAtMs > now) {
    return;
  }

  if (state.scheduledSlotKey !== currentKey || !state.scheduledAtMs || state.scheduledAtMs <= now - 60_000) {
    const plan = pickNextSpawnAtMs(now, cfg);
    if (plan.slotKey !== currentKey) {
      await saveState(guildId, {
        scheduledSlotKey: plan.slotKey,
        scheduledAtMs: plan.spawnAtMs,
      });
      return;
    }
    if (plan.spawnAtMs > now + 2_000) {
      await saveState(guildId, {
        scheduledSlotKey: plan.slotKey,
        scheduledAtMs: plan.spawnAtMs,
      });
      return;
    }
  }

  if (state.scheduledAtMs && state.scheduledAtMs > now + 2_000 && state.scheduledSlotKey === currentKey) {
    return;
  }

  await spawnHunt(client, cfg, guildId, currentKey, channelId);
}

async function runHalloweenEmojiHuntTick(client) {
  const cfg = getConfig(client);
  if (!cfg.enabled || !cfg.channelId) return;
  const targets = listHuntTargets(client, cfg);
  for (const target of targets) {
    await runHalloweenEmojiHuntTickForTarget(client, cfg, target);
  }
}

async function handleHalloweenEmojiHuntReaction(client, reaction, user) {
  if (!client || user?.bot) return false;
  const cfg = getConfig(client);
  if (!cfg.enabled) return false;
  if (!reactionMatches(reaction, cfg.emoji)) return false;

  let message = reaction.message;
  if (message?.partial) message = await message.fetch().catch(() => null);
  if (!message?.guild) return false;

  const guildId = normalizeId(message.guild.id);
  if (!isHalloweenEventLive(client, Date.now(), guildId)) return false;
  const state = readState(await loadState(guildId));
  if (!state.activeMessageId || state.activeMessageId !== normalizeId(message.id)) return false;
  if (state.activeChannelId && state.activeChannelId !== normalizeId(message.channelId || message.channel?.id)) return false;
  if (state.winnerUserId) return true;
  if (state.activeEndsAtMs && Date.now() > state.activeEndsAtMs) return true;

  const lockKey = `${guildId}:${message.id}`;
  if (claimLocks.has(lockKey)) return true;
  claimLocks.add(lockKey);
  try {
    const fresh = readState(await loadState(guildId));
    if (fresh.winnerUserId || fresh.activeMessageId !== normalizeId(message.id)) return true;
    const eventKey = resolveEventKey(client);
    const candy = cfg.rewardCandy > 0
      ? await addHalloweenCandy({
          guildId,
          userId: user.id,
          amount: cfg.rewardCandy,
          eventKey,
          reason: "halloween_emoji_hunt",
          source: "emoji_hunt",
          client,
        })
      : { ok: true, balance: 0 };
    await saveState(guildId, {
      winnerUserId: normalizeId(user.id),
      activeMessageId: "",
      activeChannelId: "",
      activeEndsAtMs: 0,
    });
    const chatId = resolveHuntChannelIdForGuild(guildId, cfg.channelId);
    const chat = await client.channels.fetch(chatId).catch(() => null);
    if (chat?.send) {
      const first = candy?.firstAward;
      let candyBit = "";
      if (cfg.rewardCandy > 0) {
        if (candy?.ok && first?.name) {
          candyBit = ` +<:VC_Halloween:1558964785113206824> **${first.name}** · **${candy.ownedCount}/${candy.total}**`;
        } else if (candy?.code === "collection_complete") {
          candyBit = ` · collezione completa **${candy.ownedCount}/${candy.total}**`;
        }
      }
      const payload = {
        content: `🎃 <@${user.id}> ha trovato l'emoji Halloween${candyBit}!`,
        allowedMentions: { users: [user.id] },
      };
      if (first?.imageUrl) {
        const { EmbedBuilder } = require("discord.js");
        payload.embeds = [
          new EmbedBuilder()
            .setColor(0xf97316)
            .setThumbnail(String(first.imageUrl))
            .setDescription("Nuova caramella nella collezione profilo."),
        ];
      }
      await chat.send(payload).catch(() => {});
    }
    return true;
  } finally {
    claimLocks.delete(lockKey);
  }
}

function startHalloweenEmojiHuntLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = async () => {
    try {
      await runHalloweenEmojiHuntTick(client);
    } catch (err) {
      global.logger?.warn?.("[HALLOWEEN-HUNT] tick:", err?.message || err);
    }
  };
  const schedule = () => {
    const timer = setTimeout(async () => {
      await tick();
      schedule();
    }, 20_000);
    timer.unref?.();
    client._halloweenEmojiHuntTimer = timer;
  };
  if (client.isReady?.()) {
    setTimeout(() => void tick(), 15_000).unref?.();
  } else {
    client.once("ready", () => setTimeout(() => void tick(), 15_000).unref?.());
  }
  schedule();
}

module.exports = {
  getHalloweenEmojiHuntConfig: getConfig,
  runHalloweenEmojiHuntTick,
  handleHalloweenEmojiHuntReaction,
  startHalloweenEmojiHuntLoop,
  resolveHalloweenEventConfig,
  spawnHunt,
  listHuntTargets,
  resolveHuntChannelIdForGuild,
};
