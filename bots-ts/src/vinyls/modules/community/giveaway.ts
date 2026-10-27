import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { logger } from "../../../shared";
import { registerInteractionHandler } from "../../interactions/registry";
import { registerSlashCommand } from "../../slash/registry";

interface Giveaway {
  messageId: string;
  channelId: string;
  guildId: string;
  prize: string;
  endsAt: number;
  hostId: string;
  entrants: Set<string>;
  ended: boolean;
}

const active = new Map<string, Giveaway>();

function giveawayButtonId(messageId: string): string {
  return `giveaway:enter:${messageId}`;
}

export function registerGiveawayModule(client: Client): void {
  registerSlashCommand({
    data: new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Avvia un giveaway")
      .addStringOption((o) => o.setName("premio").setDescription("Premio").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("minuti").setDescription("Durata in minuti").setRequired(true).setMinValue(1).setMaxValue(10080),
      )
      .toJSON(),
    async execute(interaction: ChatInputCommandInteraction) {
      if (!interaction.guild || !interaction.channel?.isSendable()) {
        await interaction.reply({ content: "Solo in server.", ephemeral: true });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Serve Gestisci server.", ephemeral: true });
        return;
      }
      const prize = interaction.options.getString("premio", true).slice(0, 200);
      const minutes = interaction.options.getInteger("minuti", true);
      const endsAt = Date.now() + minutes * 60_000;
      await interaction.deferReply();
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("giveaway:enter:pending")
          .setLabel("Partecipa")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎉"),
      );
      const msg = await interaction.editReply({
        content: [
          `🎉 **GIVEAWAY**`,
          `Premio: **${prize}**`,
          `Finisce: <t:${Math.floor(endsAt / 1000)}:R>`,
          `Host: <@${interaction.user.id}>`,
          `Partecipanti: **0**`,
        ].join("\n"),
        components: row.components.length ? [row] : [],
      });
      // discord.js editReply may return Message or APIMessage
      const messageId = String((msg as { id?: string }).id || "");
      if (!messageId) return;
      const g: Giveaway = {
        messageId,
        channelId: interaction.channelId,
        guildId: interaction.guild.id,
        prize,
        endsAt,
        hostId: interaction.user.id,
        entrants: new Set(),
        ended: false,
      };
      active.set(messageId, g);
      const liveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(giveawayButtonId(messageId))
          .setLabel("Partecipa")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎉"),
      );
      await interaction.editReply({ components: [liveRow] });
      const wait = Math.max(1_000, endsAt - Date.now());
      setTimeout(() => void endGiveaway(client, messageId), wait).unref?.();
    },
  });

  registerInteractionHandler({
    name: "giveaway",
    match: (i) => i.isButton() && String(i.customId).startsWith("giveaway:enter:"),
    execute: async (i) => {
      if (!i.isButton()) return;
      await enterGiveaway(i);
    },
  });

  logger.info("[giveaway] /giveaway + enter button on");
}

async function enterGiveaway(interaction: ButtonInteraction): Promise<void> {
  const messageId = String(interaction.customId.split(":")[2] || interaction.message.id);
  const g = active.get(messageId) || active.get(interaction.message.id);
  if (!g || g.ended) {
    await interaction.reply({ content: "Giveaway non attivo.", ephemeral: true });
    return;
  }
  if (g.entrants.has(interaction.user.id)) {
    await interaction.reply({ content: "Sei già dentro.", ephemeral: true });
    return;
  }
  g.entrants.add(interaction.user.id);
  await interaction.reply({ content: "Sei dentro! 🎉", ephemeral: true });
  try {
    await interaction.message.edit({
      content: [
        `🎉 **GIVEAWAY**`,
        `Premio: **${g.prize}**`,
        `Finisce: <t:${Math.floor(g.endsAt / 1000)}:R>`,
        `Host: <@${g.hostId}>`,
        `Partecipanti: **${g.entrants.size}**`,
      ].join("\n"),
    });
  } catch {
    /* ignore */
  }
}

async function endGiveaway(client: Client, messageId: string): Promise<void> {
  const g = active.get(messageId);
  if (!g || g.ended) return;
  g.ended = true;
  const pool = [...g.entrants];
  const winner = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (channel && channel.isTextBased() && "messages" in channel) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        content: [
          `🎉 **GIVEAWAY CONCLUSO**`,
          `Premio: **${g.prize}**`,
          winner ? `Vincitore: <@${winner}>` : "_Nessun partecipante_",
          `Partecipanti: **${pool.length}**`,
        ].join("\n"),
        components: [],
      });
    }
  }
  active.delete(messageId);
}
