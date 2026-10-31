const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const {
  getClientGuildCached,
  getGuildMemberCached,
} = require("./interactionEntityCache") as typeof import("./interactionEntityCache");

const CANONICAL_MAIN_GUILD_ID = "1329080093599076474";
const MAIN_GUILD_ID = String(IDs.guilds?.main || CANONICAL_MAIN_GUILD_ID);
const MAIN_VERIFIED_ROLE_ID = IDs.roles?.Member || null;

function isResolvedMainGuildId(guildId?) {
  const g = String(guildId || "");
  return g === MAIN_GUILD_ID || g === CANONICAL_MAIN_GUILD_ID;
}

function isSponsorGuildVerify(guildId?) {
  const gid = String(guildId || "");
  if (!gid || isResolvedMainGuildId(gid)) return false;
  return Boolean(IDs.verificatoRoleIds?.[gid] ?? IDs.verificatoRoleIds?.[guildId]);
}

async function getMainGuild(client?) {
  if (!client) return null;
  let g = await getClientGuildCached(client, MAIN_GUILD_ID);
  if (!g && String(MAIN_GUILD_ID) !== CANONICAL_MAIN_GUILD_ID) {
    g = await getClientGuildCached(client, CANONICAL_MAIN_GUILD_ID);
  }
  return g;
}

async function isUserInMainGuild(client?, userId?) {
  if (!client || !userId) return false;
  const guild = await getMainGuild(client);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, userId, { preferFresh: true });
  return Boolean(member);
}

async function isUserVerifiedInMainGuild(client?, userId?) {
  if (!client || !userId) return false;
  const guild = await getMainGuild(client);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, userId);
  if (!member?.roles?.cache) return false;
  if (!MAIN_VERIFIED_ROLE_ID) return Boolean(member);
  return member.roles.cache.has(MAIN_VERIFIED_ROLE_ID);
}

function isAlreadyVerifiedInThisGuild(member?, guildId?) {
  if (!member?.roles?.cache) return false;
  if (isResolvedMainGuildId(guildId)) {
    const ids = [IDs.roles.Member].filter(Boolean);
    return ids.some((id?) => member.roles.cache.has(id));
  }
  const gid = String(guildId || "");
  const sponsorRoleId = IDs.verificatoRoleIds?.[gid] ?? IDs.verificatoRoleIds?.[guildId];
  if (sponsorRoleId && member.roles.cache.has(sponsorRoleId)) return true;
  return false;
}

export = {
  isSponsorGuildVerify,
  getMainGuild,
  isUserInMainGuild,
  isUserVerifiedInMainGuild,
  isAlreadyVerifiedInThisGuild,
  isResolvedMainGuildId,
};
