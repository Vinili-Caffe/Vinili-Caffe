const { recordDiscadiaVote, awardBumpVoteExp, getVoteCooldownMs, isVoteListingRecordedAtOrAfter } = require("./bumpService") as typeof import("./bumpService");
const { upsertVoteRole } = require("./communityOpsService") as typeof import("./communityOpsService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { resolveVoteRoleIdForGuild } = require("../utils/resolveVoteRoleId") as typeof import("../utils/resolveVoteRoleId");
const { getCachedOrFetchMember } = require("./officialMessageAutomationMemberCache") as typeof import("./officialMessageAutomationMemberCache");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  getRandomExp,
  getMessageTextParts,
  hydrateAutomationMessage,
  resolveUserFromMessage,
} = require("./officialMessageAutomationShared") as typeof import("./officialMessageAutomationShared");

const VOTE_CHANNEL_ID = IDs.channels.supporters;
const VOTE_ROLE_ID = IDs.roles.Voter;

function getVoteManagerBotIds(client?) {
  const discadiaCfg = client?.config?.discadia || {};
  const extraDiscadiaIds = Array.isArray(discadiaCfg.botIds) ? discadiaCfg.botIds : [];
  return new Set(
    [
      IDs.bots?.DISBOARD,
      IDs.bots?.Discadia,
      IDs.bots?.VoteManager,
      IDs.roles?.Discadia,
      client?.config?.disboard?.botId,
      discadiaCfg?.botId,
      ...extraDiscadiaIds,
    ]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
}

async function handleVoteManagerMessage(message?, client?, options: Record<string, any> = {}) {
  if (!message.guild) return false;
  if (!(require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(message.guild.id, "voti")) return false;
  if (message.channel?.id !== VOTE_CHANNEL_ID) return false;
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  if (!isAutomatedSource) return false;
  const allowedBotIds = getVoteManagerBotIds(client);
  const isVoteManagerAuthor = allowedBotIds.has(String(message.author?.id || ""));
  const isVoteManagerApp = allowedBotIds.has(String(message.applicationId || ""));
  const sourceName = String(`${message.author?.globalName || ""}${message.author?.username || ""}`,
  ).toLowerCase();
  const hasVoteLikeBotName = /(vote|discadia|disboard)/i.test(sourceName);
  const fromIncomingWebhook = Boolean(message.webhookId);
  if (!isVoteManagerAuthor && !isVoteManagerApp && !hasVoteLikeBotName && !fromIncomingWebhook) {
    return false;
  }

  message = await hydrateAutomationMessage(message);

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const voteText = `${content}${embedText}${embedTitle}${fieldsText}`.toLowerCase();
  const looksLikeVote =
    /has voted|voted for|just voted|cast (?:a )?vote|thank you for voting/i.test(voteText) ||
    /ha votato|votato|ha espresso (?:il )?voto/i.test(voteText) ||
    /gave?\s+(?:\d+\s+)?gems?|sent?\s+(?:\d+\s+)?gems?|boost(?:ed)?\s+with\s+gems?/i.test(voteText) ||
    /ha (?:dato|regalato|inviato)\s+(?:\d+\s+)?gemme?|gemme?\s+(?:inviate|donate|ricevute)/i.test(voteText) ||
    /grazie(?:\s+\w+){0,8}\s+(?:per\s+)?(?:aver\s+)?votat/i.test(voteText) ||
    /thank(?:s| you)?(?:\s+\w+){0,8}\s+for\s+(?:your\s+)?(?:vote|voting|gems?)/i.test(voteText) ||
    /(?:^|\n)\s*(?:💎|gem|gems|gemme)\b/i.test(voteText) ||
    (voteText.includes("discadia") && /(vote|voto|votato|voting|gem)/i.test(voteText)) ||
    (voteText.includes("disurl") && /(vote|voto|votato|voting|gem)/i.test(voteText));
  if (!looksLikeVote) return false;
  const looksLikeBumpSuccess = /(server has been bumped|has been successfully bumped|bump(?:ed)?\s*successfully|successfully bumped|bump complete|bump done|thanks for bumping|you can bump again|\bbumped\.?\s*(?:\+\s*)?(?:\d+\s*)?boosts?\s+earned|(?:\+\s*)?\d+\s*boosts?\s+earned)/i.test(voteText);
  if (looksLikeBumpSuccess) return false;

  let user = await resolveUserFromMessage(message);
  if (user?.bot) user = null;
  if (!user) return false;

  const voteListing = /top\.gg|\btopgg\b/i.test(voteText) ? "topgg" : "discadia";
  if (options?.skipIfAlreadyRecorded) {
    const voteAtMs = Number(options.voteAtMs ?? message.createdTimestamp);
    if (await isVoteListingRecordedAtOrAfter(message.guild.id, user.id, voteListing, voteAtMs)) {
      return false;
    }
  }
  const handled = await processDiscadiaVote(message.guild, user, client, { voteListing });
  if (handled) {
    if (!options?.keepSourceMessage) {
      await message.delete().catch(() => { });
    }
  }
  return handled;
}

async function processDiscadiaVote(guild?, user?, client?, options: Record<string, any> = {}) {
  if (!guild || !user || !client) return false;
  if (!(require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(guild.id, "voti")) return false;
  const voteListing = options?.voteListing === "topgg" ? "topgg" : "discadia";
  const voteCooldownMs = getVoteCooldownMs(client, voteListing);
  const userId = String(user?.id || "").trim();

  let expValue = 0;
  let resolvedVoteCount = null;
  const voteRewardExtras = [];

  try {
    const result = await recordDiscadiaVote(client, guild.id, userId, { voteListing });
    if (result && typeof result.voteCount === "number") resolvedVoteCount = result.voteCount;
    const baseExpRandom = resolvedVoteCount === 1 ? 250 : getRandomExp();
    const reward = await awardBumpVoteExp(client, guild, userId, "discadia_vote", result?.previousLastVoteAt ?? null, voteCooldownMs, baseExpRandom);
    if (reward?.effectiveExp != null) {
      expValue = reward.effectiveExp;
    }
    if (reward?.fastBonus > 0) voteRewardExtras.push(`${E.VC_Flame} Risposta rapida **+` + reward.fastBonus + " exp**");
    if (reward?.streakBonus > 0) voteRewardExtras.push(`${E.VC_Flame} Streak ` + reward.newStreak + " **+" + reward.streakBonus + " exp**");
  } catch (err) {
    global.logger?.warn?.("[officialMessageAutomation] record vote error: ", err?.message || err);
  }

  /* Evento SW: smistato → +100 exp evento + 5 crediti personali per ogni voto */
  try {
    const { isStarWarsEventLive } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
    if (isStarWarsEventLive(client, new Date(), guild.id)) {
      const { getStarWarsWallet } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsEventWalletService");
      const { addStarWarsVoteReward } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService");
      const walletGuild =
        String(client?.config?.mainGuildId || "").trim() ||
        String(IDs.guilds?.main || guild.id || "").trim();
      const wallet = await getStarWarsWallet(walletGuild, userId).catch(() => null);
      if (wallet?.factionId) {
        const swVote = await addStarWarsVoteReward(client, { guildId: walletGuild, userId });
        if (swVote?.ok) {
          voteRewardExtras.push(
            `${E.VC_EXP} Star Wars: **+100 exp** evento · ${E.VC_crediti} **+${Number(swVote?.credits || 2500).toLocaleString("it-IT")}** crediti`,
          );
        }
      }
    }
  } catch (err) {
    global.logger?.warn?.("[officialMessageAutomation] SW vote reward: ", err?.message || err);
  }

  const resolvedVoteRoleId = await resolveVoteRoleIdForGuild(guild).catch(() => "");
  const bonusText = voteRewardExtras.length ? voteRewardExtras.join("\n") : "";

  /* Messaggio solo dai draft dashboard («Bump e voti»). */
  try {
    const { trySendConfiguredVoteThanks } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    await trySendConfiguredVoteThanks(
      client,
      guild,
      userId,
      voteListing,
      {
        exp: String(expValue),
        count: typeof resolvedVoteCount === "number" ? String(resolvedVoteCount) : "?",
        bonus: bonusText,
        fast: "0",
        streak: "0",
      },
      VOTE_CHANNEL_ID,
    );
  } catch (err) {
    global.logger?.warn?.("[officialMessageAutomation] vote draft: ", err?.message || err);
  }

  void (async () => {
    try {
      const expiresAt = new Date(Date.now() + voteCooldownMs);
      await upsertVoteRole(guild.id, userId, expiresAt);
      const member = await getCachedOrFetchMember(guild, userId);
      const roleIdToGrant = resolvedVoteRoleId || VOTE_ROLE_ID;
      if (member && roleIdToGrant && !member.roles.cache.has(roleIdToGrant)) {
        await member.roles.add(roleIdToGrant).catch(() => { });
      }
    } catch (err) {
      global.logger?.warn?.("[officialMessageAutomation] role/event error: ", err?.message || err);
    }
  })();

  return true;
}

export = { handleVoteManagerMessage, processDiscadiaVote, VOTE_CHANNEL_ID };
