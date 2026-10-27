import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { registerSlashCommand } from "./registry";
import { addStaffPoints, getStaffPoints } from "../modules/staff/points";
import { isPartnerBlacklisted } from "../modules/partner";

/** Slash Staff Keep: partnership (shell), say-like notify via points peek. */
export function registerStaffSlash(): void {
  registerSlashCommand({
    data: new SlashCommandBuilder()
      .setName("partnership")
      .setDescription("Partnership tenant")
      .addSubcommand((s) =>
        s
          .setName("status")
          .setDescription("Stato partnership / blacklist")
          .addStringOption((o) => o.setName("guild_id").setDescription("Guild id").setRequired(false)),
      )
      .addSubcommand((s) =>
        s
          .setName("points")
          .setDescription("Punti PM utente")
          .addUserOption((o) => o.setName("utente").setDescription("Utente").setRequired(false)),
      )
      .toJSON(),
    async execute(interaction: ChatInputCommandInteraction) {
      if (!interaction.guild) {
        await interaction.reply({ content: "Solo in server.", ephemeral: true });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Permesso insufficiente.", ephemeral: true });
        return;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === "status") {
        const gid = interaction.options.getString("guild_id") || interaction.guild.id;
        await interaction.reply({
          content: `Guild \`${gid}\` blacklist=${isPartnerBlacklisted(gid) ? "yes" : "no"}`,
          ephemeral: true,
        });
        return;
      }
      if (sub === "points") {
        const user = interaction.options.getUser("utente") || interaction.user;
        await interaction.reply({
          content: `<@${user.id}> punti: **${getStaffPoints(interaction.guild.id, user.id)}**`,
          ephemeral: true,
        });
      }
    },
  });

  registerSlashCommand({
    data: new SlashCommandBuilder()
      .setName("say")
      .setDescription("Invia un messaggio come bot (dev)")
      .addStringOption((o) => o.setName("messaggio").setDescription("Testo").setRequired(true))
      .toJSON(),
    async execute(interaction: ChatInputCommandInteraction) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Solo admin.", ephemeral: true });
        return;
      }
      const text = interaction.options.getString("messaggio", true).slice(0, 1900);
      if (!interaction.channel?.isSendable()) {
        await interaction.reply({ content: "Canale non inviabile.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: "ok", ephemeral: true });
      await interaction.channel.send({ content: text, allowedMentions: { parse: [] } });
    },
  });

  // keep addStaffPoints import used for future award slash
  void addStaffPoints;
}
