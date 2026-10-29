const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const {
  buildMyQuotePanel,
  isMyQuotePageButton,
  isMyQuoteCloseButton,
  parseMyQuotePageButton,
  parseMyQuoteCloseButton,
} = require("../Utils/Community/myquotePanel") as typeof import("../Utils/Community/myquotePanel");

function match(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return isMyQuotePageButton(id) || isMyQuoteCloseButton(id);
}

async function execute(interaction?) {
  if (isMyQuoteCloseButton(interaction.customId)) {
    const parsed = parseMyQuoteCloseButton(interaction.customId);
    if (!parsed?.requesterId) return;
    if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return;
  }

  const parsed = parseMyQuotePageButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyQuotePanel({
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

export = { name: "myquotePagination", order: 47, match, execute };
