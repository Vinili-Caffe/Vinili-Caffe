const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const {
  getClientGuildCached,
} = require("./interactionEntityCache") as typeof import("./interactionEntityCache");

const CANONICAL_MAIN_GUILD_ID = "1329080093599076474";
const MAIN_GUILD_ID = String(IDs.guilds?.main || CANONICAL_MAIN_GUILD_ID);
const MAIN_VERIFIED_ROLE_ID = IDs.roles?.Member || null;

function isResolvedMainGuildId(guildId?) {
  const g = String(guildId || "");
  return g === MAIN_GUILD_ID || g === CANONICAL_MAIN_GUILD_ID;
}

function isAlreadyVerifiedInThisGuild(member?, guildId?) {
  if (!member?.roles?.cache) return false;
  if (isResolvedMainGuildId(guildId)) {
    const ids = [IDs.roles.Member].filter(Boolean);
    return ids.some((id?) => member.roles.cache.has(id));
  }
  return false;
}

export = {
  isAlreadyVerifiedInThisGuild,
};
