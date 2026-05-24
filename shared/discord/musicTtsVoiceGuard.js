function resolveMusicBlocksTts(client, guildId, musicModule) {
  const gid = String(guildId || "").trim();
  if (!gid || !musicModule) return { blocked: false, channelId: null };
  if (typeof musicModule.guildMusicSessionBlocksOtherVoiceChannels === "function") {
    return musicModule.guildMusicSessionBlocksOtherVoiceChannels(client, gid);
  }
  const active =
    typeof musicModule.guildHasMusicVoiceResumeHint === "function" &&
    musicModule.guildHasMusicVoiceResumeHint(gid);
  const channelId =
    typeof musicModule.getGuildMusicVoiceChannelId === "function"
      ? musicModule.getGuildMusicVoiceChannelId(gid)
      : null;
  return { blocked: Boolean(active), channelId: channelId || null };
}

function buildMusicBlocksTtsUserMessage(channelId, stopPrefix = "+") {
  const safePrefix = String(stopPrefix || "+").trim() || "+";
  const where = channelId ? `<#${channelId}>` : "il canale vocale della musica";
  return [
    `La musica è attiva in ${where}.`,
    `Il TTS non è disponibile finché la sessione musica è in corso.`,
    `Usa \`${safePrefix}stop\` per fermare la musica, oppure attendi la fine della coda.`,
  ].join(" ");
}

module.exports = {
  resolveMusicBlocksTts,
  buildMusicBlocksTtsUserMessage,
};