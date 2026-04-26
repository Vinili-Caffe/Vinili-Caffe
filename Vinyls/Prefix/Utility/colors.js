const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const unlocks = require("../../Utils/Community/personalityColorUnlocks");

const CMD_COLORS_PREFIX = "cmd_colors_seg:";

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
    const ptOpts = unlocks.buildSelectOptionsForSegment(message.guild, "pt", member, level, canPickPlus);
    const natOpts = unlocks.buildSelectOptionsForSegment(message.guild, "nat", member, level, canPickPlus);
    const rows = [];
    if (ptOpts.length > 1) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${CMD_COLORS_PREFIX}${message.author.id}:pt`)
            .setPlaceholder("Plus / colori esclusivi di livello")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(ptOpts),
        ),
      );
    }
    if (natOpts.length > 1) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${CMD_COLORS_PREFIX}${message.author.id}:nat`)
            .setPlaceholder("Colori classici")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(natOpts),
        ),
      );
    }
    if (!rows.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Non hai ancora nessun colore sbloccato. I Plus servono **livello 50** (exp) oppure **VIP**, **Booster** o **Donator**; i classici salgono con il livello; gli esclusivi da **10 / 20 / 30 / 50 / 70 / 100**.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const lines = [
      "**Livello exp:** " + (level || "0"),
      "**Plus:** " + (canPickPlus ? "sbloccati" : "non sbloccati (liv. 50+ o VIP / Booster / Donator)"),
      "",
      "Scegli un colore dal menu; **Rimuovi colore** toglie tutti i colori chat (Plus, classici ed esclusivi).",
    ];
    const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("Colori profilo chat").setDescription(lines.join("\n"));
    await safeMessageReply(message, {
      embeds: [embed],
      components: rows,
      allowedMentions: { repliedUser: false },
    });
  },
};