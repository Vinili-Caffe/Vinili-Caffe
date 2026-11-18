/** True solo se il bot è davvero nel server (cache gateway). */

function isBotPresentInGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds?.cache) return false;
  const guild = client.guilds.cache.get(gid);
  if (!guild) return false;
  if (guild.available === false || guild.unavailable === true) return false;
  return true;
}

export = { isBotPresentInGuild };
