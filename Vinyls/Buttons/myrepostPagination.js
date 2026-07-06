const {
  buildMyRepostPanel,
  isMyRepostPageButton,
  parseMyRepostPageButton,
} = require("../Utils/Community/myrepostPanel");

function match(interaction) {
  return interaction?.isButton?.() && isMyRepostPageButton(interaction.customId);
}

async function execute(interaction) {
  const parsed = parseMyRepostPageButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyRepostPanel({
    guild: interaction.guild,
    targetUserId: parsed.targetUserId,
    requesterId: parsed.requesterId,
    page: parsed.targetPage,
    commandPrefix: prefix,
  });

  await interaction
    .editReply({
      embeds: payload.embeds,
      components: payload.components,
      allowedMentions: { users: payload.allowedUserIds || [] },
    })
    .catch(() => null);
}

module.exports = { name: "myrepostPagination", order: 47, match, execute };