/** Vincitori attività: ruoli dei vincitori (settimana, mese, minigiochi). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { REQUIRED_MEMBER_ROLE_ID } = require("./winnersRows") as typeof import("./winnersRows");

const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const MINIGAME_WINNER_ROLE_ID = IDs.roles.MVP;
const ROYALE_MINIGAME_ROLE_ID = IDs.roles.Royale;
const MONTHLY_MEMBER_ROLE_ID = IDs.roles.TopMonthlyMember;

async function removeRoleFromAllMembers(guild?, roleId?, keepUserId = "") {
  if (!roleId) return;
  await guild.members.fetch().catch(() => null);
  const keep = keepUserId ? String(keepUserId) : "";
  const toRemove = [];
  for (const [, member] of guild.members.cache) {
    if (!member.roles.cache.has(roleId)) continue;
    if (keep && String(member.id) === keep) continue;
    toRemove.push(member);
  }
  for (const member of toRemove) {
    await member.roles.remove(roleId).catch((err?) => {
      global.logger?.warn?.("[WEEKLY ACTIVITY WINNERS] remove role failed:", member.id, roleId, err?.message || err);
    });
  }
}

async function assignRoleToUser(guild?, userId?, roleId?) {
  if (!userId || !roleId) return false;
  const member = await getGuildMemberCached(guild, userId, { preferFresh: true }) || guild.members.cache.get(userId) || (await getGuildMemberCached(guild, userId));
  if (!member) return false;
  await member.roles.add(roleId).catch(() => { });
  const refreshedMember = await getGuildMemberCached(guild, userId, { preferFresh: true });
  return Boolean(refreshedMember?.roles?.cache?.has(roleId));
}

function pickFirstAvailable(ranking?, excludedUserIds = new Set()) {
  for (const row of ranking) {
    if (!row?.userId) continue;
    if (excludedUserIds.has(row.userId)) continue;
    return row;
  }
  return null;
}

async function updateWeeklyWinnerRoles(guild?, topMessages?, topVoice?, topMinigame?) {
  const chosenUserIds = new Set();
  const messageWinner = pickFirstAvailable(topMessages, chosenUserIds);
  if (messageWinner) chosenUserIds.add(messageWinner.userId);
  const voiceWinner = pickFirstAvailable(topVoice, chosenUserIds);
  if (voiceWinner) chosenUserIds.add(voiceWinner.userId);
  const minigameWinner =
    topMinigame !== false &&
      MINIGAME_WINNER_ROLE_ID &&
      Array.isArray(topMinigame) &&
      topMinigame.length
      ? pickFirstAvailable(topMinigame, chosenUserIds)
      : null;
  const removals = [
    removeRoleFromAllMembers(guild, MESSAGE_WINNER_ROLE_ID, messageWinner?.userId),
    removeRoleFromAllMembers(guild, VOICE_WINNER_ROLE_ID, voiceWinner?.userId),
  ];
  if (MINIGAME_WINNER_ROLE_ID && topMinigame !== false) {
    removals.push(removeRoleFromAllMembers(guild, MINIGAME_WINNER_ROLE_ID, minigameWinner?.userId));
  }
  await Promise.all(removals);
  const assigns = [
    assignRoleToUser(guild, messageWinner?.userId, MESSAGE_WINNER_ROLE_ID),
    assignRoleToUser(guild, voiceWinner?.userId, VOICE_WINNER_ROLE_ID),
  ];
  if (MINIGAME_WINNER_ROLE_ID && topMinigame !== false) {
    assigns.push(assignRoleToUser(guild, minigameWinner?.userId, MINIGAME_WINNER_ROLE_ID));
  }
  await Promise.all(assigns);
  return { messageWinner, voiceWinner, minigameWinner };
}

async function updateMonthlyWinnerRoles(guild?, topCombined?) {
  const first = Array.isArray(topCombined) && topCombined.length ? topCombined[0] : null;
  const second = Array.isArray(topCombined) && topCombined.length > 1 ? topCombined[1] : null;
  const third = Array.isArray(topCombined) && topCombined.length > 2 ? topCombined[2] : null;
  if (!MONTHLY_MEMBER_ROLE_ID) return { topMonthlyWinner: first, monthlyTopSecond: second, monthlyTopThird: third };
  await removeRoleFromAllMembers(guild, MONTHLY_MEMBER_ROLE_ID);
  await assignRoleToUser(guild, first?.userId, MONTHLY_MEMBER_ROLE_ID);
  return { topMonthlyWinner: first, monthlyTopSecond: second, monthlyTopThird: third };
}

async function resolveRoyaleMinigameWinner(client?, guild?, docs?, valueGetter?) {
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    const user = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
    if (!user || user.bot) continue;
    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID)) continue;
    return { userId, value };
  }
  return null;
}

async function syncRoyaleMinigameTotalRole(client?, options: Record<string, any> = {}) {
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!mainGuildId || !ROYALE_MINIGAME_ROLE_ID) return { ok: false, reason: "not_configured" };
  const guild =
    options.guild ||
    client.guilds.cache.get(mainGuildId) ||
    (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    "profile.totals.exp.minigame.totalExp": { $gt: 0 },
  })
    .select("userId profile.totals.exp.minigame.totalExp")
    .sort({ "profile.totals.exp.minigame.totalExp": -1 })
    .limit(200)
    .lean()
    .catch(() => []);
  const royaleWinner = await resolveRoyaleMinigameWinner(
    client,
    guild,
    docs,
    (doc?) => Number(doc?.profile?.totals?.exp?.minigame?.totalExp || 0),
  );
  await removeRoleFromAllMembers(guild, ROYALE_MINIGAME_ROLE_ID, royaleWinner?.userId);
  if (royaleWinner?.userId) {
    await assignRoleToUser(guild, royaleWinner.userId, ROYALE_MINIGAME_ROLE_ID);
  }
  return {
    ok: true,
    userId: royaleWinner?.userId || null,
    totalExp: Number(royaleWinner?.value || 0),
  };
}

export = { MINIGAME_WINNER_ROLE_ID, ROYALE_MINIGAME_ROLE_ID, MONTHLY_MEMBER_ROLE_ID, pickFirstAvailable, updateWeeklyWinnerRoles, updateMonthlyWinnerRoles, syncRoyaleMinigameTotalRole };
