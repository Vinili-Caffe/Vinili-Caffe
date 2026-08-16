const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime");
const {
  buildMyClipPanel,
  isMyClipPageButton,
  isMyClipCloseButton,
  parseMyClipPageButton,
  parseMyClipCloseButton,
} = require("../Utils/Community/myclipPanel");

function match(interaction) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return isMyClipPageButton(id) || isMyClipCloseButton(id);
}

async function execute(interaction) {
  if (isMyClipCloseButton(interaction.customId)) {
    const parsed = parseMyClipCloseButton(interaction.customId);
    if (!parsed?.requesterId) return;
    if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return;
  }

  const parsed = parseMyClipPageButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyClipPanel({
    guild: interaction.guild,
    targetUserId: parsed.targetUserId,
    requesterId: parsed.requesterId,
    page: parsed.targetPage,
    commandPrefix: prefix,
  });

  await safePanelMessageUpdate(interaction, {
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files || [],
    allowedMentions: { users: payload.allowedUserIds || [] },
    includeBanner: false,
  });
}

module.exports = { name: "myclipPagination", order: 47, match, execute };
