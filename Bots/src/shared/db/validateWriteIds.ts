function isValidGuildUserId(guildId?, userId?) {
  const g = guildId != null && String(guildId).trim() !== "" ? String(guildId).trim() : "";
  const u = userId != null && String(userId).trim() !== "" ? String(userId).trim() : "";
  return g.length > 0 && u.length > 0;
}

function isValidGuildUserIdChannelId(guildId?, userId?, channelId?) {
  const c = channelId != null && String(channelId).trim() !== "" ? String(channelId).trim() : "";
  return isValidGuildUserId(guildId, userId) && c.length > 0;
}

export = { isValidGuildUserId, isValidGuildUserIdChannelId };