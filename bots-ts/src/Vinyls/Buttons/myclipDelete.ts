const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const {
  buildMyClipPanel,
  isMyClipDeleteButton,
  parseMyClipDeleteButton,
} = require("../Utils/Community/myclipPanel") as typeof import("../Utils/Community/myclipPanel");
const { deleteUserRepostEntry } = require("../Services/Community/repostService") as typeof import("../Services/Community/repostService");

function match(interaction?) {
  return interaction?.isButton?.() && isMyClipDeleteButton(interaction.customId);
}

async function execute(interaction?) {
  const parsed = parseMyClipDeleteButton(interaction.customId);
  if (!parsed?.requesterId || !parsed?.targetUserId || !interaction.guild) return;
  if (String(interaction.user?.id || "") !== String(parsed.requesterId)) return;

  await interaction.deferUpdate().catch(() => null);

  const result = await deleteUserRepostEntry({
    guild: interaction.guild,
    client: interaction.client,
    repostId: parsed.clipId,
    userId: parsed.requesterId,
  });

  if (!result.ok) {
    await interaction
      .followUp({
        content: `<:vegax:1443934876440068179> ${result.message || "Impossibile rimuovere la clip."}`,
        flags: 1 << 6,
      })
      .catch(() => null);
    return;
  }

  const prefix = String(interaction.client?.config?.prefix || "+").trim() || "+";
  const payload = await buildMyClipPanel({
    guild: interaction.guild,
    targetUserId: parsed.targetUserId,
    requesterId: parsed.requesterId,
    page: parsed.page,
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

export = { name: "myclipDelete", order: 46, match, execute };
