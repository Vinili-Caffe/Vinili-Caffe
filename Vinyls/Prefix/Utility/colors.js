const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const unlocks = require("../../Utils/Community/personalityColorUnlocks");

const CMD_COLORS_SEG = "cmd_colors_seg:";
const CMD_COLORS_BTN = "cmd_colors_btn:";

module.exports = {
  name: "colors",
  allowEmptyArgs: true,
  usage: "`+colors`",
  examples: ["+colors"],
  async execute(message) {
    if (!message.guild || !message.member) return;
    const member = await getGuildMemberCached(message.guild, message.author.id, { preferFresh: true }).catch(() => message.member);
    if (!member) return;
    const level = await unlocks.fetchNumericProfileLevel(message.guild.id, message.author.id);
    const canPickPlus = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
    const mergedOpts = unlocks.buildMergedColorSelectOptions(message.guild, member, level, canPickPlus);
    if (!mergedOpts.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Al momento non ci sono colori applicabili dal menu (ruoli non trovati sul server). Controlla **#ruoli** o chiedi allo staff.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const uid = message.author.id;
    const desc = unlocks.buildColorsMainEmbedDescription(message.guild, level, canPickPlus);
    const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("🎨 Colori chat").setDescription(desc);
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CMD_COLORS_BTN}${uid}:info`)
        .setLabel("Come ottenere i colori")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📋"),
      new ButtonBuilder()
        .setCustomId(`${CMD_COLORS_BTN}${uid}:remove`)
        .setLabel("Rimuovi colore")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🧹"),
    );
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${CMD_COLORS_SEG}${uid}:all`)
        .setPlaceholder("Scegli un nuovo colore…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(mergedOpts),
    );
    await safeMessageReply(message, {
      embeds: [embed],
      components: [btnRow, selectRow],
      allowedMentions: { repliedUser: false, roles: unlocks.listRoleIdsForColorsEmbedMentions(message.guild) },
    });
  },
};