import type { ChatInputCommandInteraction } from "discord.js";
import { getSlashCommand } from "./registry";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const cmd = getSlashCommand(interaction.commandName);
  if (!cmd) {
    await interaction.reply({ content: "Comando non disponibile in bots-ts.", ephemeral: true });
    return;
  }
  await cmd.execute(interaction);
}
