const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { recordDiscadiaVote, awardBumpVoteExp, getVoteCooldownMs, isVoteListingRecordedAtOrAfter } = require("./bumpService") as typeof import("./bumpService");
const { upsertVoteRole } = require("./communityOpsService") as typeof import("./communityOpsService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
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
const VOTE_URL = IDs.links.vote;

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

function resolvePublicVoteHubUrl(client?) {
  const fromTopgg = String(client?.config?.topgg?.votePageUrl || "").trim();
  const fromDiscadia = String(client?.config?.discadiaVoteReminder?.voteUrl || "").trim();
  const fromIds = String(IDs.links?.vote || "").trim();
  return fromTopgg || fromDiscadia || fromIds;
}

async function processDiscadiaVote(guild?, user?, client?, options: Record<string, any> = {}) {
  if (!guild || !user || !client) return false;
  const voteListing = options?.voteListing === "topgg" ? "topgg" : "discadia";
  const voteCooldownMs = getVoteCooldownMs(client, voteListing);
  const userId = String(user?.id || "").trim();
    const userMention = /^\d{16,22}$/.test(userId) ? `<@${userId}>` : "Utente";

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

  const { DIVIDER_URL: dividerUrl } = require("../../../shared/discord/constants") as typeof import("../../../shared/discord/constants");
  const { userAvatarUrlStatic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
  const voteCooldownHours = Math.max(1, Math.round(voteCooldownMs / (60 * 60 * 1000)));
  const voteAgainHoursLabel = voteCooldownHours === 1 ? "1 ora" : `${voteCooldownHours} ore`;
  const voteLabel = typeof resolvedVoteCount === "number" ? `${resolvedVoteCount}°` : "";
  const votePlatformLabel = voteListing === "topgg" ? "Top.gg" : "Discadia";
  const resolvedVoteRoleId = await resolveVoteRoleIdForGuild(guild).catch(() => "");
  const voteRoleText = resolvedVoteRoleId
    ? `${E.VC_Money} ${E.VC_Arrow} Il ruolo <@&${resolvedVoteRoleId}> per ${voteAgainHoursLabel}`
    : `${E.VC_Money} ${E.VC_Arrow} Reward voto assegnata per ${voteAgainHoursLabel}`;
  const thankLine =
    voteListing === "topgg"
      ? `${E.VC_ThankYou} Grazie ${userMention} per aver votato su **Top.gg**!`
      : `${E.VC_ThankYou} Grazie ${userMention} per aver votato su **Discadia**!`;
  const descriptionLines = [
    thankLine,
    "",
    "`Hai guadagnato:`",
    `${E.VC_EXP} ${E.VC_Arrow} **${expValue} EXP** per il tuo ${voteLabel ? `**${voteLabel} voto** su **${votePlatformLabel}**` : `**voto** su **${votePlatformLabel}**`}`,
    ...(voteRewardExtras.length > 0 ? voteRewardExtras : []),
    voteRoleText,
    "",
    `${E.VC_update} Vota di nuovo tra __${voteAgainHoursLabel}__ per ottenere **altri exp** dal **bottone sottostante**.`,
  ];
  const botFooterIcon =
    userAvatarUrlStatic(client?.user, { size: 64 }) ||
    (typeof client?.user?.displayAvatarURL === "function"
      ? client.user.displayAvatarURL({ size: 64, extension: "png", forceStatic: true })
      : null);
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(`${E.VC_Vote} **Un nuovo voto!**`)
    .setDescription(descriptionLines.join("\n"))
    .setFooter({
      text: "Ogni volta che voterai il valore dell'exp guadagnata varierà",
      iconURL: botFooterIcon || undefined,
    })
    .setImage(dividerUrl);

  const components = [];
  const linkVoteUrl = resolvePublicVoteHubUrl(client) || VOTE_URL;
  if (linkVoteUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setEmoji(E.VC_HeartPink)
          .setLabel("Vota cliccando qui")
          .setURL(linkVoteUrl),
      ),
    );
  }

  const channel = client.channels.cache.get(VOTE_CHANNEL_ID) || await client.channels.fetch(VOTE_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased?.()) {
    await channel.send({ content: userMention, embeds: [embed], components, }).catch(() => { });
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
