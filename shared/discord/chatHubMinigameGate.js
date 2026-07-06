const { minigameStateFindOneLean } = require("../../Vinyls/Utils/BotState/domainStatesStore");

async function isChatHubMinigameActive(guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid) return false;
  const state = await minigameStateFindOneLean({ guildId: gid, channelId: cid }).catch(() => null);
  if (!state) return false;
  const endsAt =
    state.endsAt instanceof Date ? state.endsAt.getTime() : new Date(state.endsAt).getTime();
  return Number.isFinite(endsAt) && endsAt > Date.now();
}

module.exports = { isChatHubMinigameActive };