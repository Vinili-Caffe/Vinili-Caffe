/** Caccia al tesoro: emoji del server, reazioni del bot (con riprova e alternative) e scelta della coppia. */
const { getTreasureHuntEmojiPairs } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { isBenignDiscordMinigameError, warnMinigame, logMinigameDebug } = require("./minigameLog") as typeof import("./minigameLog");
const { pickRandomItem, sleepMs } = require("./minigameUtils") as typeof import("./minigameUtils");
const { pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");

const TREASURE_HUNT_REACT_FALLBACKS = ["\u2693", "\u{1F48E}", "\u2728", "\u{1F3AF}", "\u{1F3C6}", "\u{1F4A1}", "\u2B50"];
const TREASURE_HUNT_REACT_SAFE_EXTRAS = ["\u2705", "\u{1F525}", "\u{1F3B5}"];

function logTreasureHuntReactDebug(message?, data = null) {
  logMinigameDebug(`TreasureHunt ${message}`, data);
}

function getTreasureHuntCfg(cfg?) {
  return cfg?.treasureHunt && typeof cfg.treasureHunt === "object"
    ? cfg.treasureHunt
    : null;
}

function normalizeTreasureEmojiKey(value?) {
  return String(value || "")
    .replace(/\uFE0F|\uFE0E/g, "")
    .trim();
}

function unicodeTreasureReactVariants(token?) {
  const s = String(token || "").trim();
  if (!s || s.startsWith("<") || /^\d{16,20}$/.test(s) || /^:[a-zA-Z0-9_]+:$/.test(s)) {
    return s ? [s] : [];
  }
  const stripped = normalizeTreasureEmojiKey(s);
  const withVs = stripped ? `${stripped}\uFE0F` : "";
  const out = [];
  for (const v of [s, stripped, withVs]) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseTreasureEmojiToken(raw?) {
  const s = String(raw || "").trim();
  if (!s) return { display: "", react: "", id: "", name: "", animated: false };
  const m = s.match(/^<(a)?:([^:>]+):(\d{16,20})>$/);
  if (m) {
    return {
      display: s,
      react: s,
      id: m[3],
      name: m[2],
      animated: Boolean(m[1]),
    };
  }
  const short = s.match(/^:([a-zA-Z0-9_]+):$/);
  if (short) {
    return { display: s, react: s, id: "", name: short[1], animated: false };
  }
  if (/^\d{16,20}$/.test(s)) return { display: s, react: s, id: s, name: "", animated: false };
  return { display: s, react: s, id: "", name: s, animated: false };
}

function findGuildEmojiForTreasure(guild?, parsed?) {
  if (!guild?.emojis?.cache) return null;
  if (parsed?.id) {
    const byId = guild.emojis.cache.get(parsed.id);
    if (byId) return byId;
  }
  const name = String(parsed?.name || "").replace(/^:+|:+$/g, "").trim();
  if (!name) return null;
  return guild.emojis.cache.find((e?) => String(e.name || "") === name) || null;
}

function treasureEmojiMarkup(parsed?) {
  if (!parsed?.id || !parsed?.name) return "";
  return parsed.animated
    ? `<a:${parsed.name}:${parsed.id}>`
    : `<:${parsed.name}:${parsed.id}>`;
}

async function ensureGuildEmojisForTreasure(guild?) {
  if (!guild?.emojis?.fetch) return;
  if (guild.emojis.cache.size < 5) {
    await guild.emojis.fetch().catch(() => null);
  }
}

function formatTreasureEmojiForEmbed(guild?, token?) {
  const parsed = parseTreasureEmojiToken(token);
  const idMarkup = treasureEmojiMarkup(parsed);
  if (idMarkup) {
    const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
    return guildEmoji ? guildEmoji.toString() : idMarkup;
  }
  const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
  if (guildEmoji) return guildEmoji.toString();
  return parsed.display || String(token || "").trim();
}

function treasureReactTokenUsableInGuild(guild?, parsed?) {
  if (!parsed) return false;
  if (!parsed.id) return Boolean(String(parsed.react || "").trim());
  const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
  if (!guildEmoji) return false;
  return guildEmoji.available !== false;
}

async function resolveTreasureReactToken(guild?, raw?, fallbackIndex = 0) {
  const rawStr = String(raw || "").trim();
  const parsed = parseTreasureEmojiToken(rawStr);
  if (guild?.emojis?.fetch && guild.emojis.cache.size < 5) {
    await guild.emojis.fetch().catch(() => null);
  }
  if (treasureReactTokenUsableInGuild(guild, parsed)) {
    const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
    if (guildEmoji) return guildEmoji.toString();
    return parsed.react || rawStr;
  }
  const fb = TREASURE_HUNT_REACT_FALLBACKS[fallbackIndex % TREASURE_HUNT_REACT_FALLBACKS.length];
  return fb || "\u2693";
}

async function normalizeTreasureEmojiPair(guild?, pair?) {
  if (!pair) return pair;
  const decoyRaw = String(pair.decoy || "").trim();
  const winnerRaw = String(pair.winner || "").trim();
  const decoyReact = await resolveTreasureReactToken(guild, decoyRaw, 0);
  const winnerReact = await resolveTreasureReactToken(guild, winnerRaw, 1);
  return {
    decoy: decoyReact,
    winner: winnerReact,
    decoyDisplay: formatTreasureEmojiForEmbed(guild, decoyRaw),
    winnerDisplay: formatTreasureEmojiForEmbed(guild, winnerRaw),
  };
}

function treasureEmojiMatches(reactionEmoji?, token?) {
  const parsed = parseTreasureEmojiToken(token);
  const rid = String(reactionEmoji?.id || "");
  const rname = String(reactionEmoji?.name || "");
  if (parsed.id && rid) return parsed.id === rid;
  const tokenKey = normalizeTreasureEmojiKey(parsed.name || token);
  const reactKey = normalizeTreasureEmojiKey(rname);
  if (tokenKey && reactKey && tokenKey === reactKey) return true;
  return rname === String(token || "").trim();
}

function findMessageReactionByToken(message?, token?) {
  if (!message?.reactions?.cache) return null;
  const parsed = parseTreasureEmojiToken(token);
  return (
    message.reactions.cache.find((r?) => treasureEmojiMatches(r.emoji, token)) ||
    (parsed.id
      ? message.reactions.cache.find((r?) => String(r.emoji?.id || "") === parsed.id)
      : null)
  );
}

async function botPlacedTreasureReaction(message?, token?, client?) {
  const reaction = findMessageReactionByToken(message, token);
  if (!reaction) return false;
  let live = reaction;
  if (live.partial) {
    live = await live.fetch().catch(() => null);
    if (!live) return false;
  }
  if (live.me) return true;
  const botId = String(client?.user?.id || message?.client?.user?.id || "");
  if (!botId) return false;
  if (live.users?.cache?.has(botId)) return true;
  if (Number(live.count || 0) > 0 && typeof live.users?.fetch === "function") {
    const users = await live.users.fetch().catch(() => null);
    return Boolean(users?.has(botId));
  }
  return false;
}

function isTreasureReactAlreadyPresentError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if ([10014, 90001].includes(code)) return false;
  const msg = String(err?.message || err?.rawError?.message || "");
  return /already\s+(reacted|added)|reaction\s+already/i.test(msg);
}

function treasureReactErrorMeta(err?) {
  if (!err) return null;
  return {
    code: err?.code ?? err?.rawError?.code ?? null,
    status: err?.status ?? err?.httpStatus ?? err?.rawError?.status ?? null,
    message: String(err?.message || err?.rawError?.message || err || "").slice(0, 180),
  };
}

function isTreasureReactRateLimited(err?) {
  const status = Number(err?.status ?? err?.httpStatus ?? err?.rawError?.status);
  if (status === 429) return true;
  const code = Number(err?.code ?? err?.rawError?.code);
  if (code === 429) return true;
  const msg = String(err?.message || err?.rawError?.message || "");
  return /rate\s*limit|too many requests|429/i.test(msg);
}

function treasureReactRetryAfterMs(err?, attempt = 0) {
  const raw =
    err?.retryAfter ??
    err?.rawError?.retry_after ??
    err?.data?.retry_after ??
    err?.response?.headers?.["retry-after"];
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    return Math.min(8000, Math.max(250, asNum < 50 ? asNum * 1000 : asNum));
  }
  return Math.min(4000, 350 * (attempt + 1));
}

function treasureEmojiKeySet(values?) {
  const out = new Set();
  for (const value of Array.isArray(values) ? values : [values]) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    out.add(raw);
    out.add(normalizeTreasureEmojiKey(raw));
  }
  out.delete("");
  return out;
}

async function reactTreasureHuntEmojiWithFallbacks(message?, token?, options: Record<string, any> = {}) {
  const intended = String(token || "").trim();
  if (!intended || typeof message?.react !== "function") {
    return { token: null, lastError: null };
  }
  const client = message.client;
  const exclude = treasureEmojiKeySet(options.exclude);
  const baseMeta = {
    channelId: String(message?.channelId || message?.channel?.id || ""),
    messageId: String(message?.id || ""),
    intended,
  };
  if (await botPlacedTreasureReaction(message, intended, client).catch(() => false)) {
    logTreasureHuntReactDebug("reaction already present before react", baseMeta);
    return { token: intended, lastError: null };
  }

  let lastError = null;
  const tryPlace = async (candidate?, label?) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await reactTreasureHuntEmoji(message, candidate, { quiet: true });
      if ((result as any) === true || result?.ok) {
        logTreasureHuntReactDebug(`${label} react ok`, {
          ...baseMeta,
          candidate,
          attempt,
        });
        return candidate;
      }
      const err = result?.error || null;
      if (err) lastError = err;
      if (err && isTreasureReactRateLimited(err)) {
        const waitMs = treasureReactRetryAfterMs(err, attempt);
        logTreasureHuntReactDebug(`${label} rate limited, retrying`, {
          ...baseMeta,
          candidate,
          attempt,
          waitMs,
          err: treasureReactErrorMeta(err),
        });
        await sleepMs(waitMs);
        continue;
      }
      break;
    }
    const live = await message.fetch().catch(() => message);
    if (findMessageReactionByToken(live, candidate)) {
      logTreasureHuntReactDebug(`${label} visible after fetch`, { ...baseMeta, candidate });
      return candidate;
    }
    return null;
  };

  const primary = await tryPlace(intended, "primary");
  if (primary) return { token: primary, lastError: null };

  const afterPrimary = await message.fetch().catch(() => message);
  if (findMessageReactionByToken(afterPrimary || message, intended)) {
    logTreasureHuntReactDebug("primary react visible after fetch", baseMeta);
    return { token: intended, lastError: null };
  }

  const candidates = [];
  const seen = treasureEmojiKeySet([intended, ...exclude]);
  const add = (t?) => {
    const key = String(t || "").trim();
    if (!key) return;
    const norm = normalizeTreasureEmojiKey(key);
    if (seen.has(key) || seen.has(norm)) return;
    seen.add(key);
    seen.add(norm);
    candidates.push(key);
  };
  for (const fb of TREASURE_HUNT_REACT_FALLBACKS) add(fb);
  for (const fb of TREASURE_HUNT_REACT_SAFE_EXTRAS) add(fb);

  for (const candidate of candidates) {
    await sleepMs(280);
    if (findMessageReactionByToken(afterPrimary || message, candidate)) {
      logTreasureHuntReactDebug("fallback already present", { ...baseMeta, fallback: candidate });
      return { token: candidate, lastError: null };
    }
    const placed = await tryPlace(candidate, "fallback");
    if (placed) return { token: placed, lastError: null };
  }

  const latest = await message.fetch().catch(() => afterPrimary || message);
  if (findMessageReactionByToken(latest, intended)) {
    logTreasureHuntReactDebug("intended reaction visible on final fetch", baseMeta);
    return { token: intended, lastError: null };
  }
  for (const candidate of candidates) {
    if (findMessageReactionByToken(latest, candidate)) {
      logTreasureHuntReactDebug("fallback visible on final fetch", { ...baseMeta, fallback: candidate });
      return { token: candidate, lastError: null };
    }
  }
  logTreasureHuntReactDebug("all react attempts failed", {
    ...baseMeta,
    fallbackCount: candidates.length,
    exclude: [...exclude],
    lastError: treasureReactErrorMeta(lastError),
  });
  return { token: null, lastError };
}

async function reactTreasureHuntEmoji(message?, token?, options: Record<string, any> = {}) {
  const quiet = options.quiet === true;
  const parsed = parseTreasureEmojiToken(token);
  if (!parsed.react || typeof message?.react !== "function") {
    return { ok: false, error: null };
  }
  const guild = message.guild;
  const client = message.client;
  let lastError = null;
  const logReactError = (err?) => {
    lastError = err;
    if (!quiet && !isBenignDiscordMinigameError(err)) warnMinigame(err);
  };
  const acceptIfPresent = async (err?) => {
    if (isTreasureReactAlreadyPresentError(err)) return true;
    const live = await message.fetch().catch(() => message);
    return Boolean(findMessageReactionByToken(live, token));
  };
  if (parsed.id) {
    let emoji =
      guild?.emojis?.cache?.get(parsed.id) ||
      client?.emojis?.cache?.get(parsed.id);
    if (!emoji && guild?.emojis?.fetch) {
      emoji = await guild.emojis.fetch(parsed.id).catch(() => null);
    }
    if (emoji && emoji.available !== false) {
      try {
        await message.react(emoji);
        return { ok: true, error: null };
      } catch (err) {
        if (await acceptIfPresent(err)) return { ok: true, error: null };
        logReactError(err);
        if (isTreasureReactRateLimited(err)) return { ok: false, error: err };
      }
    }
    try {
      await message.react(parsed.display);
      return { ok: true, error: null };
    } catch (errA) {
      try {
        await message.react({
          id: parsed.id,
          name: parsed.name || "emoji",
          animated: parsed.animated,
        });
        return { ok: true, error: null };
      } catch (errB) {
        if (await acceptIfPresent(errB)) return { ok: true, error: null };
        logReactError(errB);
        return { ok: false, error: errB };
      }
    }
  }
  for (const variant of unicodeTreasureReactVariants(parsed.react)) {
    try {
      await message.react(variant);
      return { ok: true, error: null };
    } catch (err) {
      if (await acceptIfPresent(err)) return { ok: true, error: null };
      logReactError(err);
      if (isTreasureReactRateLimited(err)) return { ok: false, error: err };
    }
  }
  return { ok: false, error: lastError };
}

async function treasureHuntDisplayTexts(guild?, gameOrDecoy?, winnerOrGame?) {
  await ensureGuildEmojisForTreasure(guild);
  if (gameOrDecoy && typeof gameOrDecoy === "object") {
    const game = gameOrDecoy;
    return {
      decoy: formatTreasureEmojiForEmbed(guild, game.decoyDisplay || game.decoy),
      winner: formatTreasureEmojiForEmbed(guild, game.winnerDisplay || game.winner),
    };
  }
  return {
    decoy: formatTreasureEmojiForEmbed(guild, gameOrDecoy),
    winner: formatTreasureEmojiForEmbed(guild, winnerOrGame),
  };
}

function pickTreasureHuntBucket(treasureCfg?) {
  const buckets = Array.isArray(treasureCfg?.buckets) ? treasureCfg.buckets : [];
  const usable = buckets.filter((b?) => b && typeof b === "object");
  if (usable.length === 0) {
    return { minMessages: 20, maxMessages: 50, minDurationMs: 90000, maxDurationMs: 180000, rewardExp: 150 };
  }
  const totalWeight = usable.reduce((acc?, b?) => acc + (Number(b.weight) > 0 ? Number(b.weight) : 1), 0);
  let pick = Math.random() * totalWeight;
  for (const b of usable) {
    const w = Number(b.weight) > 0 ? Number(b.weight) : 1;
    if (pick < w) return b;
    pick -= w;
  }
  return usable[usable.length - 1];
}

function pickTreasureHuntEmojiPair(channelId?, treasureCfg?, cfg = null) {
  const fromCfg = Array.isArray(treasureCfg?.emojiPairs) ? treasureCfg.emojiPairs : [];
  const cfgPairs = fromCfg
    .map((p?) => ({
      decoy: String(p?.decoy || "").trim(),
      winner: String(p?.winner || "").trim(),
    }))
    .filter((p?) => p.decoy && p.winner);
  const pairs = cfgPairs.length
    ? cfgPairs
    : (getTreasureHuntEmojiPairs() || []) || [];
  if (!pairs.length) return null;
  const pick = pickQuestionAvoidRecent(
    channelId,
    "treasureHunt",
    pairs,
    (p?) => `${p.decoy}|${p.winner}`,
    Math.max(3, Math.floor(pairs.length / 2)),
  );
  return pick || pickRandomItem(pairs);
}

async function removeTreasureHuntReactions(channel?, candidateIds?, decoyEmoji?, winnerEmoji?) {
  if (!channel?.messages?.fetch || !Array.isArray(candidateIds)) return;
  const botUser = channel.client?.user;
  if (!botUser) return;
  for (const id of candidateIds) {
    const msg = await channel.messages.fetch(String(id)).catch(() => null);
    if (!msg?.reactions?.cache) continue;
    for (const emoji of [decoyEmoji, winnerEmoji]) {
      const reaction = findMessageReactionByToken(msg, emoji);
      if (reaction) {
        await reaction.users.remove(botUser.id).catch(() => {});
      }
    }
  }
}

function serializeTreasureHuntTarget(game?) {
  return JSON.stringify({
    decoy: game.decoy,
    winner: game.winner,
    decoyDisplay: game.decoyDisplay || game.decoy,
    winnerDisplay: game.winnerDisplay || game.winner,
    winnerMessageId: game.winnerMessageId || "",
    candidateIds: Array.isArray(game.candidateIds) ? game.candidateIds : [],
    introMessageId: game.introMessageId || null,
    winnerIndex: Number(game.winnerIndex || 0),
    targetCount: Number(game.targetCount || 0),
    collectedCount: Number(game.collectedCount || 0),
  });
}

function getTreasureHuntMessageUrl(guildId?, channelId?, messageId?) {
  if (!guildId || !channelId || !messageId) return "";
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export = { logTreasureHuntReactDebug, getTreasureHuntCfg, ensureGuildEmojisForTreasure, normalizeTreasureEmojiPair, treasureEmojiMatches, findMessageReactionByToken, botPlacedTreasureReaction, treasureReactErrorMeta, reactTreasureHuntEmojiWithFallbacks, treasureHuntDisplayTexts, pickTreasureHuntBucket, pickTreasureHuntEmojiPair, removeTreasureHuntReactions, serializeTreasureHuntTarget, getTreasureHuntMessageUrl };
