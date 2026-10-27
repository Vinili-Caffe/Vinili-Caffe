import type { Client, Message } from "discord.js";
import { logger } from "../../shared";
import { getPrefixCommand } from "./registry";

export function attachPrefixRouter(client: Client, prefix: string): void {
  const p = prefix || "+";
  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot) return;
      const content = message.content || "";
      if (!content.startsWith(p)) return;
      const body = content.slice(p.length).trim();
      if (!body) return;
      const [rawName, ...args] = body.split(/\s+/);
      const name = String(rawName || "").toLowerCase();
      const command = getPrefixCommand(name);
      if (!command) return;
      await command.execute({ client, message, args, prefix: p });
    } catch (err) {
      logger.error("[vinyls-ts] prefix handler", err);
    }
  });
}
