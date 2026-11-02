/** Minigiochi: colore, ricompense, indizi e messaggi di vittoria. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

const MINIGAME_EMBED_COLOR = TENANT_EMBED_COLOR;
const EXP_REWARDS = [{ exp: 500, roleId: IDs.roles.Rookie }, { exp: 1000, roleId: IDs.roles.Scout }, { exp: 1500, roleId: IDs.roles.Explorer }, { exp: 2500, roleId: IDs.roles.Tracker }, { exp: 5000, roleId: IDs.roles.Achiever }, { exp: 10000, roleId: IDs.roles.Vanguard }, { exp: 50000, roleId: IDs.roles.Mentor }, { exp: 100000, roleId: IDs.roles.Strategist },];

const DRIVING_QUIZ_LETTERS = ["A", "B", "C", "D"];

function buildMinuteHintEmbed(channelId?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> <#${channelId}>`);
}

function buildGenericHintEmbed(text?) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> ${safeText}`);
}

function buildHintEmbed(isHigher?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      isHigher
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Più alto!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Più basso!",
    );
}

function buildYearHintEmbed(guessBeforeTarget?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      guessBeforeTarget
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Dopo!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Prima!",
    );
}

function buildWinEmbed(winnerId?, effectiveExp?, totalExp?, details = null) {
  const lines = [`<a:VC_Winner:1482535294757507255> Complimenti <@${winnerId}>, hai vinto e guadagnato **${effectiveExp} exp**<a:VC_Exclamation:1482534702077444217>`];
  if (details) {
    const extras = [];
    if (details.fastBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Risposta fulminea **+${details.fastBonus} exp**`);
    if (details.streakBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Streak ${details.newStreak} **+${details.streakBonus} exp**`);
    if (extras.length) lines.push("", ...extras);
  }
  lines.push("", "<:VC_Stats:1482527532682055780> **Le tue statistiche:**", `<a:VC_Arrow:1482706699365257397> Ora hai un totale di **${totalExp} exp**`);
  if (details?.newStreak > 1) lines.push(`<a:VC_Arrow:1482706699365257397> Serie di vittorie: **${details.newStreak}** (record: **${details.bestStreak}**)`);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Events:1482706144953897223> Un utente ha vinto<a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "I tuoi progressi sono nel profilo su viniliecaffe.it/profilo",
    });
}

function getNextReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward?) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member?, reward?, totalExp?) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    "<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>",
    "",
    `<a:VC_Events:1482706144953897223> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** exp ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    "",
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** exp per la prossima ricompensa!`
      : "<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!",
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
    .setTitle("<a:VC_Winner:1482535294757507255> Tesoro trovato<a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      winnerMessageUrl
        ? `<a:VC_Arrow:1482706699365257397> Il messaggio nascosto era: ${winnerMessageUrl}`
        : "<a:VC_Arrow:1482706699365257397> La caccia è terminata.",
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
  buildRewardEmbed,
  buildTreasureHuntFoundEmbed,
};
