const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const {
  buildMyQuotePanel,
  isMyQuoteDeleteButton,
  parseMyQuoteDeleteButton,
} = require("../Utils/Community/myquotePanel") as typeof import("../Utils/Community/myquotePanel");
const { deleteUserQuoteEntry } = require("../Utils/Quote/quoteBoardService") as typeof import("../Utils/Quote/quoteBoardService");

function match(interaction?) {
  return interaction?.isButton?.() && isMyQuoteDeleteButton(interaction.customId);
}

async function execute(interaction?) {
  const parsed = parseMyQuoteDeleteButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const result = await deleteUserQuoteEntry({
    guild: interaction.guild,
    quoteId: parsed.quoteId,
    userId: parsed.requesterId,
  });

  if (!result.ok) {
    await interaction
      .followUp({
        content: `<:vegax:1443934876440068179> ${result.message || "Impossibile rimuovere la quote."}`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return;
  }

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyQuotePanel({
    guild: interaction.guild,
    targetUserId: parsed.targetUserId,
    requesterId: parsed.requesterId,
    page: parsed.page,
    commandPrefix: prefix,
  });

  await safePanelMessageUpdate(interaction, {
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: { users: payload.allowedUserIds || [] },
    includeBanner: false,
  });
}

export = { name: "myquoteDelete", order: 46, match, execute };
