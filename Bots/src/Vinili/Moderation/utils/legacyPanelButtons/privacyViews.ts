const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { getGuildMemberCached, getUserCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { PRIVATE_FLAG, logButtonErr } = require("./shared") as typeof import("./shared");

async function resolveMentionLabel(interaction?, userId?) {
  let label = `<@${userId}>`;
  try {
    const member = await getGuildMemberCached(interaction.guild, userId);
    if (member) return `<@${member.user.id}>`;

    const user = await getUserCached(interaction.client, userId);
    if (user) label = `<@${user.id}>`;
  } catch (err) {
    logButtonErr(err, { warn: true });
  }
  return label;
}

async function sendPrivacyViewsLeaderboard(interaction?, kind?, title?) {
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
  const guildId = interaction.guild.id;
  const top = await ActivityUserProfile.find({ guildId }).sort({ [`profile.privacy.${kind}.views`]: -1 }).limit(10).lean().catch((err?) => { logButtonErr(err, { warn: true }); return []; });

  const rankEmojis = ["<:VC_1:1482706338021642333>", "<:VC_2:1482706376525611090>", "<:VC_3:1482706404773990460>", "<:VC_4:1482706432347344916>", "<:VC_5:1482706459765637272>", "<:VC_6:1482706490769801327>", "<:VC_7:1482706523330183218>", "<:VC_8:1482706553281708092>", "<:VC_9:1482706583438889051>", "<:VC_10:1482706613663174707>",];

  const lines = [];
  let idx = 1;
  for (const entry of top) {
    const views =
      kind === "banner"
        ? Number(entry?.profile?.privacy?.banner?.views ?? 0)
        : Number(entry?.profile?.privacy?.avatar?.views ?? 0);
    const label = await resolveMentionLabel(interaction, entry.userId);
    const rank = rankEmojis[idx - 1] || `${idx}.`;
    lines.push(
      `${rank} ${label} <a:VC_Arrow:1482706699365257397> **${views}** visualizzazioni`,
    );
    idx += 1;
  }

  const description = lines.length ? lines.join("\n") : "Nessuna visualizzazione registrata.";
  const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", });
  const footerText = `Classifica richiesta da ${accountUsername(interaction.member || interaction.user)} \u2022 Oggi alle ${time}`;

  const embed = new EmbedBuilder()

    .setColor("#6f4e37")
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: footerText,
      iconURL: guildMemberDisplayAvatarUrlDynamic(interaction.member || interaction.user) || undefined,
    });

  if (interaction.deferred) return interaction.editReply({ embeds: [embed] }).catch((err?) => { logButtonErr(err); return null; });
  return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
}

export = { resolveMentionLabel, sendPrivacyViewsLeaderboard };
