import type { Client, Interaction } from "discord.js";
import { logger } from "../../shared";
import { dispatchInteraction } from "./registry";

/** Router interactionCreate — solo button/modal/select Keep (no UI Kill site-first). */
export function attachInteractionRouter(client: Client): void {
  client.on("interactionCreate", (interaction: Interaction) => {
    void (async () => {
      try {
        if (interaction.isChatInputCommand()) {
          const { handleSlashCommand } = await import("../slash/router.js");
          await handleSlashCommand(interaction);
          return;
        }
        if (
          !interaction.isButton() &&
          !interaction.isModalSubmit() &&
          !interaction.isStringSelectMenu()
        ) {
          return;
        }
        await dispatchInteraction(interaction);
      } catch (err) {
        logger.warn("[interaction]", err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Errore interazione.", ephemeral: true }).catch(() => undefined);
        }
      }
    })();
  });
  logger.info("[interaction] router on");
}
