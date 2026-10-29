const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const {
  buildMyRepostPanel,
  isMyRepostDeleteButton,
  parseMyRepostDeleteButton,
} = require("../Utils/Community/myrepostPanel") as typeof import("../Utils/Community/myrepostPanel");
const { deleteUserRepostEntry } = require("../Services/Community/repostService") as typeof import("../Services/Community/repostService");

function match(interaction?) {
  return interaction?.isButton?.() && isMyRepostDeleteButton(interaction.customId);
}

async function execute(interaction?) {
  const parsed = parseMyRepostDeleteButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const result: any = await deleteUserRepostEntry({
    guild: interaction.guild,
    client: interaction.client,
    repostId: parsed.repostId,
    userId: parsed.requesterId,
  });

  if (!result.ok) {
    await interaction
      .followUp({
        content: `<:vegax:1443934876440068179> ${result.message || "Impossibile rimuovere il repost."}`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return;
  }

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyRepostPanel({
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

export = { name: "myrepostDelete", order: 46, match, execute };
