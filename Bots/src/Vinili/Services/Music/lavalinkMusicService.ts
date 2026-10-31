
const { getGuildMusicVoiceChannelId, guildMusicSessionBlocksOtherVoiceChannels, guildHasMusicVoiceResumeHint, markMusicVoiceLeaveIntentional, handleMusicBotVoiceDisconnect } = require("./musicVoice") as typeof import("./musicVoice");
const { isLavalinkUsable, initLavalinkMusicIfEnabled } = require("./musicEngine") as typeof import("./musicEngine");
const { fetchGuildQueueEntryRows, fetchGuildUpcomingQueueRows, fetchGuildRequestedSessionRows, fetchGuildNextUpDetails, fetchGuildNowPlayingDetails, formatQueue, nowPlayingStatus } = require("./musicQueueView") as typeof import("./musicQueueView");
const { setGuildMusicVolume, skipGuild, stopGuild, pauseToggle, pauseGuildTrack, resumeGuildTrack, clearGuildQueue } = require("./musicControls") as typeof import("./musicControls");
const { getNowPlayingEmbedTitle, toggleRepeatOneGuild, previousGuildTrack, shuffleGuildQueue, rewindGuildTrack, restartQueueGuild } = require("./musicQueueControls") as typeof import("./musicQueueControls");
const { resumeMusicVoiceAfterAfkProbe, suspendMusicVoiceForAfkProbe } = require("./musicAfk") as typeof import("./musicAfk");
const { playMusicRequest } = require("./musicPlayRequest") as typeof import("./musicPlayRequest");



/* snapshot a load (Coffee setta hook prima del require) */
const NOW_PLAYING_EMBED_TITLE = getNowPlayingEmbedTitle();

function probeLavalinkTcp(host?, port?, timeoutMs = 1500) {
  return require("../../../shared/music/lavalinkProbe").probeLavalinkTcp(host, port, timeoutMs);
}

async function probeLavalinkHttpReady(host?, port?, timeoutMs = 2500) {
  return require("../../../shared/music/lavalinkProbe").probeLavalinkHttpReady(host, port, timeoutMs);
}

function shouldDeferTtsLeaveForMusicEmptyVc(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.shoukaku) return false;
  return Boolean(client.shoukaku.connections.get(gid)?.channelId);
}

export = {
  initLavalinkMusicIfEnabled,
  isLavalinkUsable,
  markMusicVoiceLeaveIntentional,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
  fetchGuildNextUpDetails,
  fetchGuildNowPlayingDetails,
  playMusicRequest,
  setGuildMusicVolume,
  skipGuild,
  stopGuild,
  formatQueue,
  clearGuildQueue,
  shuffleGuildQueue,
  toggleRepeatOneGuild,
  previousGuildTrack,
  pauseToggle,
  pauseGuildTrack,
  resumeGuildTrack,
  rewindGuildTrack,
  restartQueueGuild,
  nowPlayingStatus,
  handleMusicBotVoiceDisconnect,
  shouldDeferTtsLeaveForMusicEmptyVc,
  getGuildMusicVoiceChannelId,
  guildHasMusicVoiceResumeHint,
  guildMusicSessionBlocksOtherVoiceChannels,
  suspendMusicVoiceForAfkProbe,
  resumeMusicVoiceAfterAfkProbe,
};