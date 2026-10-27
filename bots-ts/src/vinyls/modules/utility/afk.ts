import { replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import type { Client, Message } from "discord.js";
import { logger } from "../../../shared";

const afk = new Map<string, { reason: string; at: number }>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export const afkCommand: PrefixCommand = {
  name: "afk",
  description: "Imposta / togli AFK.",
  usage: "+afk [motivo]",
  category: "utility",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const k = key(guild.id, message.author.id);
    const reason = args.join(" ").trim();
    if (!reason && afk.has(k)) {
      afk.delete(k);
      await replyOk(message, "AFK rimosso.");
      return;
    }
    afk.set(k, { reason: reason || "AFK", at: Date.now() });
    await replyOk(message, `AFK: **${afk.get(k)!.reason}**`);
  },
};

export function attachAfkListeners(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot) return;
      const selfKey = key(message.guild.id, message.author.id);
      if (afk.has(selfKey) && !message.content.startsWith(process.env.BOT_PREFIX || "+")) {
        afk.delete(selfKey);
        await message.reply({ content: "Bentornato, AFK rimosso.", allowedMentions: { repliedUser: false } }).catch(() => undefined);
      }
      for (const u of message.mentions.users.values()) {
        const entry = afk.get(key(message.guild.id, u.id));
        if (!entry) continue;
        await message.reply({
          content: `**${u.username}** è AFK: ${entry.reason} (<t:${Math.floor(entry.at / 1000)}:R>)`,
          allowedMentions: { repliedUser: false },
        }).catch(() => undefined);
      }
    } catch (err) {
      logger.error("[afk]", err);
    }
  });
}
