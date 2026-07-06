const IDs = require("../../Utils/Config/ids");
const { sendRepostRoulette, isRepostDisabledInGuild } = require("./repostService");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy");
const { resolveRouletteChannelId } = require("../../Utils/Quote/repostRoulettePostChannel");
const { isChatHubMinigameActive } = require("../../../shared/discord/chatHubMinigameGate");
const {
  CHAT_HUB_SOURCES,
  DEFAULT_CROSS_BOT_GAP_MS,
  recordChatHubBotPost,
  extendChatHubQuietForMs,
  msUntilChatHubAllowsPost,
  waitForChatHubSlot,
} = require("../../../shared/discord/chatHubBotPacing");

const AFTER_MINIGAME_DELAY_MS = Math.max(
  90_000,
  Number(process.env.VC_REPOST_ROULETTE_AFTER_MINIGAME_MS || 180_000),
);
const MIN_GAP_BETWEEN_REPOSTS_MS = Math.max(
  45 * 60 * 1000,
  Number(process.env.VC_REPOST_ROULETTE_MIN_GAP_MS || 45 * 60 * 1000),
);
const CHAT_HUB_CROSS_BOT_GAP_MS = Math.max(
  3 * 60 * 1000,
  Number(process.env.VC_CHAT_HUB_CROSS_BOT_GAP_MS || DEFAULT_CROSS_BOT_GAP_MS),
);
const CHAT_HUB_VINILI_GAP_MS = Math.max(
  2 * 60 * 1000,
  Number(process.env.VC_CHAT_HUB_VINILI_GAP_MS || 3 * 60 * 1000),
);
const REPOST_RETRY_MS = Math.max(60_000, Number(process.env.VC_REPOST_ROULETTE_RETRY_MS || 90_000));
const REPOST_MAX_ATTEMPTS = Math.max(1, Math.min(8, Number(process.env.VC_REPOST_ROULETTE_MAX_ATTEMPTS || 5)));

const pendingByChannel = new Map();
const lastRepostAtByChannel = new Map();

function shouldRunRepostRouletteForGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || isRepostDisabledInGuild(gid)) return false;
  if (!resolveRouletteChannelId(gid)) return false;
  if (!isMultiGuildLayerEnabled() || isViniliProtectedGuild(gid)) return true;
  const gate = canInvokePrefixCommand(gid, "utility");
  if (!gate.managed) return true;
  return Boolean(gate.ok);
}

function isMainChatHubChannel(channelId) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  const chatId = String(IDs.channels?.chat || "").trim();
  const rouletteId = String(IDs.channels?.repostRoulette || "").trim();
  return id === chatId || (rouletteId && id === rouletteId);
}

function isMinigameChannelBusyInProcess(channelId) {
  try {
    const { isMinigameChannelBusy } = require("../Minigames/minigameService");
    return Boolean(isMinigameChannelBusy(channelId));
  } catch {
    return false;
  }
}

function canSendRepostNow(channelId) {
  const last = Number(lastRepostAtByChannel.get(String(channelId || "")) || 0);
  if (!last) return true;
  return Date.now() - last >= MIN_GAP_BETWEEN_REPOSTS_MS;
}

async function dispatchRepostRoulette(client, guildId, channelId) {
  if (!client || !shouldRunRepostRouletteForGuild(guildId)) return false;
  if (!isMainChatHubChannel(channelId)) return false;
  if (!canSendRepostNow(channelId)) return false;
  if (isMinigameChannelBusyInProcess(channelId)) return false;
  if (await isChatHubMinigameActive(guildId, channelId)) return false;

  const slotOk = await waitForChatHubSlot(channelId, CHAT_HUB_SOURCES.VINILI, {
    crossBotGapMs: CHAT_HUB_CROSS_BOT_GAP_MS,
    sameBotGapMs: CHAT_HUB_VINILI_GAP_MS,
    maxWaitMs: 12 * 60 * 1000,
    pollMs: 20_000,
  });
  if (!slotOk) return false;
  if (isMinigameChannelBusyInProcess(channelId)) return false;
  if (await isChatHubMinigameActive(guildId, channelId)) return false;

  const sent = await sendRepostRoulette(client, guildId).catch(() => false);
  if (sent) {
    lastRepostAtByChannel.set(String(channelId), Date.now());
    recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI);
  }
  return Boolean(sent);
}

function clearPendingRepost(channelId) {
  const cid = String(channelId || "").trim();
  const prev = pendingByChannel.get(cid);
  if (prev) clearTimeout(prev);
  pendingByChannel.delete(cid);
}

function scheduleRepostAttempt(client, guildId, channelId, delayMs, attempt) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!client || !gid || !cid) return;
  clearPendingRepost(cid);
  const wait = Math.max(5_000, Math.floor(Number(delayMs) || 0));
  const timer = setTimeout(() => {
    pendingByChannel.delete(cid);
    void (async () => {
      if (!shouldRunRepostRouletteForGuild(gid) || !isMainChatHubChannel(cid)) return;
      const busy =
        isMinigameChannelBusyInProcess(cid) || (await isChatHubMinigameActive(gid, cid));
      if (busy) {
        if (attempt < REPOST_MAX_ATTEMPTS) {
          extendChatHubQuietForMs(cid, REPOST_RETRY_MS);
          scheduleRepostAttempt(client, gid, cid, REPOST_RETRY_MS, attempt + 1);
        }
        return;
      }
      const gapWait = msUntilChatHubAllowsPost(cid, CHAT_HUB_SOURCES.VINILI, {
        crossBotGapMs: CHAT_HUB_CROSS_BOT_GAP_MS,
        sameBotGapMs: CHAT_HUB_VINILI_GAP_MS,
      });
      if (gapWait > 0) {
        if (attempt < REPOST_MAX_ATTEMPTS) {
          scheduleRepostAttempt(client, gid, cid, gapWait, attempt + 1);
        }
        return;
      }
      const sent = await dispatchRepostRoulette(client, gid, cid);
      if (!sent && attempt < REPOST_MAX_ATTEMPTS) {
        scheduleRepostAttempt(client, gid, cid, REPOST_RETRY_MS, attempt + 1);
      }
    })().catch((err) => {
      global.logger?.warn?.("[REPOST ROULETTE] deferred:", err?.message || err);
    });
  }, wait);
  if (typeof timer.unref === "function") timer.unref();
  pendingByChannel.set(cid, timer);
}

/**
 * Dopo la fine di un minigame: attesa lunga + coordinamento con reminder Coffee e altri post bot.
 */
function scheduleRepostRouletteAfterMinigame(client, guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!client || !gid || !cid || !isMainChatHubChannel(cid)) return;
  if (!shouldRunRepostRouletteForGuild(gid)) return;
  extendChatHubQuietForMs(cid, AFTER_MINIGAME_DELAY_MS);
  scheduleRepostAttempt(client, gid, cid, AFTER_MINIGAME_DELAY_MS, 0);
}

function startRepostRouletteCron(client) {
  if (client._repostRouletteCronStarted) return;
  client._repostRouletteCronStarted = true;
}

async function runRepostRouletteSweep(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!shouldRunRepostRouletteForGuild(guild.id)) continue;
    const channelId = resolveRouletteChannelId(guild.id);
    if (!channelId) continue;
    scheduleRepostAttempt(client, guild.id, channelId, 5_000, 0);
  }
}

module.exports = {
  startRepostRouletteCron,
  runRepostRouletteSweep,
  shouldRunRepostRouletteForGuild,
  scheduleRepostRouletteAfterMinigame,
};