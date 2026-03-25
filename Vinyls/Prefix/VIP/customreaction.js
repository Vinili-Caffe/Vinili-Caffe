const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas");
const { resolveCustomRoleState, buildExpiryText } = require("../../Utils/Community/customRoleState");
const { buildCustomReactionPanelEmbed, buildCustomReactionPanelRows, } = require("../../Utils/Community/mentionReactionPanelUtils");

async function ensureActiveCustomRole(message) {
  const state = await resolveCustomRoleState({
    guild: message.guild,
    userId: message.author.id,
    client: message.client,
    cleanupExpired: true,
  });

  if (state.status === "none") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "expired") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            [
              "<:vegax:1443934876440068179> Il tuo custom role temporaneo è scaduto.",
              `Scadenza: ${buildExpiryText(state.doc)}`,
              "Usa `+customrole create` per crearne uno nuovo.",
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "missing_role") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status !== "active") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription("<:vegax:1443934876440068179> Stato custom role non valido."),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  return state;
}

module.exports = {
  name: "customreaction",
  allowEmptyArgs: true,

  async execute(message) {
    if (!message.guild || !message.member) return;

    const ok = await ensureActiveCustomRole(message);
    if (!ok) return;

    await message.channel.sendTyping().catch(() => { });

    const guildId = message.guild.id;
    const userId = message.author.id;

    const doc = await MentionReaction.findOne({ guildId, userId }).catch(() => null);
    const current = Array.isArray(doc?.reactions) ? doc.reactions : [];

    const embed = buildCustomReactionPanelEmbed(current);
    const rows = buildCustomReactionPanelRows(userId);

    await safeMessageReply(message, {
      embeds: [embed],
      components: rows,
      allowedMentions: { repliedUser: false },
    });
  },
};