const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const {
  buildMyRepostPanel,
  isMyRepostPageButton,
  isMyRepostCloseButton,
  parseMyRepostPageButton,
  parseMyRepostCloseButton,
} = require("../Utils/Community/myrepostPanel") as typeof import("../Utils/Community/myrepostPanel");

function match(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return isMyRepostPageButton(id) || isMyRepostCloseButton(id);
}

async function execute(interaction?) {
  if (isMyRepostCloseButton(interaction.customId)) {
    const parsed = parseMyRepostCloseButton(interaction.customId);
    if (!parsed?.requesterId) return;
    if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return;
  }

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

  await safePanelMessageUpdate(interaction, {
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: { users: payload.allowedUserIds || [] },
    includeBanner: false,
  });
}

export = { name: "myrepostPagination", order: 47, match, execute };
