/** Minigiochi: avvio round, salvataggio stato e canale. */
const { minigameStateFindOneAndUpdate } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { lastSentAtByChannel } = require("./minigameActivity") as typeof import("./minigameActivity");
const { standbyChannels } = require("./minigameState") as typeof import("./minigameState");
const { clearPersistedRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");

async function resolveMinigameGuildIdAsync(cfg?, client?) {
  const sync = resolveMinigameGuildId(cfg, client);
  if (sync) return sync;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (!channelId || !client?.channels) return "";
  const cached = client.channels.cache?.get(channelId);
  if (cached?.guildId) return String(cached.guildId);
  const fetched = await client.channels.fetch(channelId).catch(() => null);
  if (fetched?.guildId) return String(fetched.guildId);
  return String(IDs.guilds?.main || "").trim();
}

function resolveMinigameGuildId(cfg?, client?) {
  const fromCfg = String(cfg?.guildId || "").trim();
  if (fromCfg) return fromCfg;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (channelId && client?.channels?.cache) {
    const ch = client.channels.cache.get(channelId);
    if (ch?.guildId) return String(ch.guildId);
  }
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (mainGuildId) return mainGuildId;
  return "";
}

function markSent(channelId?) {
  if (!channelId) return;
  lastSentAtByChannel.set(channelId, Date.now());
  standbyChannels.delete(channelId);
  void clearPersistedRolePing(channelId);
  try {
    const { recordChatHubBotPost, extendChatHubQuietForMs, CHAT_HUB_SOURCES } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
    recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI);
    extendChatHubQuietForMs(channelId, 45_000);
  } catch (_) {}
}
const TOT_STATE_SUFFIX = ":halloweenTrickOrTreat";

async function saveActiveGame(client?, cfg?, payload?) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await (minigameStateFindOneAndUpdate as any)(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[MINIGAMES] saveActiveGame failed", {
      channelId,
      guildId,
      type: payload?.type || null,
      err: err?.message || String(err),
    });
  });
  const endsAt = Number(payload?.endsAt || 0);
  if (Number.isFinite(endsAt) && endsAt > Date.now()) {
    try {
      const { extendChatHubQuietUntil } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
      // Quiet sul canale reale anche se lo state è sul doc ToT sintetico
      const quietCh = String(channelId).endsWith(TOT_STATE_SUFFIX)
        ? String(channelId).slice(0, -TOT_STATE_SUFFIX.length)
        : channelId;
      extendChatHubQuietUntil(quietCh, endsAt + 90_000);
    } catch (_) {}
  }
}

export = { resolveMinigameGuildIdAsync, markSent, TOT_STATE_SUFFIX, saveActiveGame };
