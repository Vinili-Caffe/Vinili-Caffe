/** Minigiochi: colore, ricompense, indizi e messaggi di vittoria. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MINIGAME_EMBED_COLOR = TENANT_EMBED_COLOR;
const EXP_REWARDS = [{ exp: 500, roleId: IDs.roles.Rookie }, { exp: 1000, roleId: IDs.roles.Scout }, { exp: 1500, roleId: IDs.roles.Explorer }, { exp: 2500, roleId: IDs.roles.Tracker }, { exp: 5000, roleId: IDs.roles.Achiever }, { exp: 10000, roleId: IDs.roles.Vanguard }, { exp: 50000, roleId: IDs.roles.Mentor }, { exp: 100000, roleId: IDs.roles.Strategist },];

const DRIVING_QUIZ_LETTERS = ["A", "B", "C", "D"];

function buildMinuteHintEmbed(channelId?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${E.VC_Heart} Indizio`)
    .setDescription(`${E.VC_Arrow} <#${channelId}>`);
}

function buildGenericHintEmbed(text?) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${E.VC_Heart} Indizio`)
    .setDescription(`${E.VC_Arrow} ${safeText}`);
}

function buildHintEmbed(isHigher?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      isHigher
        ? `${E.thumbsup} ${E.VC_Arrow} Più alto!`
        : `${E.thumbsdown} ${E.VC_Arrow} Più basso!`,
    );
}

function buildYearHintEmbed(guessBeforeTarget?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      guessBeforeTarget
        ? `${E.thumbsup} ${E.VC_Arrow} Dopo!`
        : `${E.thumbsdown} ${E.VC_Arrow} Prima!`,
    );
}

/** Immagine vittoria tema SW (pool classici), se evento live — blu/rosso per fazione. */
async function resolveWinEmbedImageUrl(cfg?, winnerId?) {
  try {
    const { resolveStarWarsClassicWinImageUrl } = require("../utils/starWarsMinigameHooks") as typeof import("../utils/starWarsMinigameHooks");
    return (await resolveStarWarsClassicWinImageUrl(cfg, winnerId)) || null;
  } catch {
    return null;
  }
}

function buildWinEmbed(winnerId?, effectiveExp?, totalExp?, details = null, imageUrl = null) {
  const lines = [`${E.VC_Winner} Complimenti <@${winnerId}>, hai vinto e guadagnato **${effectiveExp} exp**${E.VC_Exclamation}`];
  if (details) {
    const extras = [];
    if (details.fastBonus > 0) extras.push(`${E.VC_Flame} Risposta fulminea **+${details.fastBonus} exp**`);
    if (details.streakBonus > 0) extras.push(`${E.VC_Flame} Streak ${details.newStreak} **+${details.streakBonus} exp**`);
    if (extras.length) lines.push("", ...extras);
  }
  lines.push("", `${E.VC_Stats} **Le tue statistiche:**`, `${E.VC_Arrow} Ora hai un totale di **${totalExp} exp**`);
  if (details?.newStreak > 1) lines.push(`${E.VC_Arrow} Serie di vittorie: **${details.newStreak}** (record: **${details.bestStreak}**)`);
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${E.VC_Events} Un utente ha vinto${E.VC_Exclamation}`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "I tuoi progressi sono nel profilo su viniliecaffe.it/profilo",
    });
  if (imageUrl) embed.setImage(String(imageUrl));
  return embed;
}

function getNextReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward?) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member?, reward?, totalExp?) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    `${E.VC_Flower} Premio ricevuto ${E.VC_Flower}`,
    "",
    `${E.VC_Events} **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** exp ai **Minigiochi** ${E.VC_HeartsPink}`,
    "",
    nextReward
      ? `${E.VC_HeartsBlue} / ti mancano **${remaining}** exp per la prossima ricompensa!`
      : `${E.VC_HeartsBlue} / hai raggiunto la ricompensa **massima**!`,
  ].join("\n");

  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setAuthor({
      name: accountUsername(member),
      iconURL: guildMemberDisplayAvatarUrlDynamic(member) || undefined,
    })
    .setDescription(description)
    .setFooter({
      text: "Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche su viniliecaffe.it/profilo",
    });
}

function buildTreasureHuntFoundEmbed(winnerMessageUrl?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(`${E.VC_Winner} Tesoro trovato${E.VC_Exclamation}`)
    .setDescription(
      winnerMessageUrl
        ? `${E.VC_Arrow} Il messaggio nascosto era: ${winnerMessageUrl}`
        : `${E.VC_Arrow} La caccia è terminata.`,
    );
}

export = {
  MINIGAME_EMBED_COLOR,
  EXP_REWARDS,
  DRIVING_QUIZ_LETTERS,
  buildMinuteHintEmbed,
  buildGenericHintEmbed,
  buildHintEmbed,
  buildYearHintEmbed,
  buildWinEmbed,
  resolveWinEmbedImageUrl,
  buildRewardEmbed,
  buildTreasureHuntFoundEmbed,
};
