import {
  EmbedBuilder,
  type ColorResolvable,
  type Message,
  type MessageCreateOptions,
  type MessageMentionOptions,
} from "discord.js";
import { VINYLS_EMBED_COLOR } from "./branding";

const NO_PING: MessageMentionOptions = { repliedUser: false, parse: [] };

export function baseEmbed(color: ColorResolvable = VINYLS_EMBED_COLOR): EmbedBuilder {
  return new EmbedBuilder().setColor(color);
}

export function okEmbed(description: string, color: ColorResolvable = VINYLS_EMBED_COLOR): EmbedBuilder {
  return baseEmbed(color).setDescription(description);
}

export function errEmbed(description: string): EmbedBuilder {
  return baseEmbed(0xed4245).setDescription(description);
}

export async function replyEmbed(
  message: Message,
  embed: EmbedBuilder,
  extra: Omit<MessageCreateOptions, "embeds"> = {},
): Promise<Message> {
  return message.reply({
    embeds: [embed],
    allowedMentions: NO_PING,
    ...extra,
  });
}

export async function replyOk(message: Message, description: string): Promise<Message> {
  return replyEmbed(message, okEmbed(description));
}

export async function replyErr(message: Message, description: string): Promise<Message> {
  return replyEmbed(message, errEmbed(description));
}
