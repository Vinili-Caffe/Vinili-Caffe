import type { Client, Message } from "discord.js";
import { logger } from "../../shared";
import { registerShipEventCommand } from "./eventCommands";
import { definePlugin } from "./registry";

const candy = new Map<string, number>();

definePlugin({
  id: "halloween",
  register(client: Client) {
    registerShipEventCommand();
    client.on("messageCreate", (message: Message) => {
      if (message.author.bot || !message.guild) return;
      if (Math.random() > 0.08) return;
      const k = `${message.guild.id}:${message.author.id}`;
      candy.set(k, (candy.get(k) || 0) + 1);
    });
    logger.info("[plugin:halloween] candy passive + +ship");
  },
});

export function getHalloweenCandy(guildId: string, userId: string): number {
  return candy.get(`${guildId}:${userId}`) || 0;
}
