const IDs = require("../../Utils/Config/ids");
const { sendRepostRoulette, isRepostDisabledInGuild } = require("./repostService");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy");
const { resolveRouletteChannelId } = require("../../Utils/Quote/repostRoulettePostChannel");
const {
  CHAT_HUB_SOURCES,
  DEFAULT_CROSS_BOT_GAP_MS,
  recordChatHubBotPost,
  waitForChatHubBotGap,
} = require("../../../shared/discord/chatHubBotPacing");

const AFTER_MINIGAME_DELAY_MS = Math.max(
  5_000,
  Number(process.env.VC_REPOST_ROULETTE_AFTER_MINIGAME_MS || 12_000),
);
const MIN_GAP_BETWEEN_REPOSTS_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.VC_REPOST_ROULETTE_MIN_GAP_MS || 30 * 60 * 1000),
);
const CHAT_HUB_CROSS_BOT_GAP_MS = Math.max(
  60_000,
  Number(process.env.VC_CHAT_HUB_CROSS_BOT_GAP_MS || DEFAULT_CROSS_BOT_GAP_MS),
);

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

function canSendRepostNow(channelId) {
  const last = Number(lastRepostAtByChannel.get(String(channelId || "")) || 0);
  if (!last) return true;
  return Date.now() - last >= MIN_GAP_BETWEEN_REPOSTS_MS;
}

async function dispatchRepostRoulette(client, guildId, channelId) {
  if (!client || !shouldRunRepostRouletteForGuild(guildId)) return false;
  if (!isMainChatHubChannel(channelId)) return false;
  if (!canSendRepostNow(channelId)) return false;
  await waitForChatHubBotGap(channelId, CHAT_HUB_SOURCES.VINILI, CHAT_HUB_CROSS_BOT_GAP_MS);
  const sent = await sendRepostRoulette(client, guildId).catch(() => false);
  if (sent) {
    lastRepostAtByChannel.set(String(channelId), Date.now());
    recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI);
  }
  return Boolean(sent);
}

/**
 * Dopo la fine di un minigame in chat: breve pausa, poi repost (evita sovrapposizione con il round).
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {string} channelId
 */
function scheduleRepostRouletteAfterMinigame(client, guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!client || !gid || !cid || !isMainChatHubChannel(cid)) return;
  if (!shouldRunRepostRouletteForGuild(gid)) return;

  const prev = pendingByChannel.get(cid);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    pendingByChannel.delete(cid);
    void dispatchRepostRoulette(client, gid, cid).catch((err) => {
      global.logger?.warn?.("[REPOST ROULETTE] post-minigame:", err?.message || err);
    });
  }, AFTER_MINIGAME_DELAY_MS);
  if (typeof timer.unref === "function") timer.unref();
  pendingByChannel.set(cid, timer);
}

/** @deprecated Cron disattivato: i repost partono a fine minigame. */
function startRepostRouletteCron(client) {
  if (client._repostRouletteCronStarted) return;
  client._repostRouletteCronStarted = true;
}

/** @deprecated */
async function runRepostRouletteSweep(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!shouldRunRepostRouletteForGuild(guild.id)) continue;
    const channelId = resolveRouletteChannelId(guild.id);
    if (!channelId) continue;
    await dispatchRepostRoulette(client, guild.id, channelId).catch(() => {});
  }
}

module.exports = {
  startRepostRouletteCron,
  runRepostRouletteSweep,
  shouldRunRepostRouletteForGuild,
  scheduleRepostRouletteAfterMinigame,
};