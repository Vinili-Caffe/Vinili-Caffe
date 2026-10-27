function buildRecoveryVoiceState(guild, member, channelId) {
  const cid = channelId ? String(channelId) : null;
  const channel = cid ? guild.channels.cache.get(cid) || null : null;
  return {
    guild,
    member,
    channelId: cid,
    channel,
    id: String(member.id),
  };
}

module.exports = { buildRecoveryVoiceState };
