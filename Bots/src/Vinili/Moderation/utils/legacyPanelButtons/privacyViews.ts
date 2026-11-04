const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { getGuildMemberCached, getUserCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { PRIVATE_FLAG, logButtonErr } = require("./shared") as typeof import("./shared");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
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

  const rankEmojis = [E.VC_1, E.VC_2, E.VC_3, E.VC_4, E.VC_5, E.VC_6, E.VC_7, E.VC_8, E.VC_9, E.VC_10,];

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
      `${rank} ${label} ${E.VC_Arrow} **${views}** visualizzazioni`,
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
