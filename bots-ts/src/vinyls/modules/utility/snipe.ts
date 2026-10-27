import type { Client, Message, PartialMessage } from "discord.js";
import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";

interface SnipeEntry {
  content: string;
  authorTag: string;
  authorId: string;
  at: number;
}

const snipes = new Map<string, SnipeEntry>();

export function attachSnipeListener(client: Client): void {
  client.on("messageDelete", (message: Message | PartialMessage) => {
    if (!message.guild || message.author?.bot) return;
    const content = message.content || "";
    if (!content) return;
    snipes.set(message.channelId, {
      content: content.slice(0, 1000),
      authorTag: message.author?.tag || "?",
      authorId: message.author?.id || "?",
      at: Date.now(),
    });
  });
}

export const snipeCommand: PrefixCommand = {
  name: "snipe",
  description: "Ultimo messaggio cancellato nel canale.",
  usage: "+snipe",
  category: "utility",
  async execute({ message }) {
    const entry = snipes.get(message.channel.id);
    if (!entry) {
      await replyErr(message, "Niente da snipare.");
      return;
    }
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle("Snipe")
        .setDescription(entry.content)
        .setFooter({ text: `${entry.authorTag} · ${entry.authorId}` })
        .setTimestamp(entry.at),
    );
  },
};
