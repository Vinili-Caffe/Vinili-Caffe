import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { rememberQuote } from "./repost";

/**
 * Live: +quote (canvas). Qui porting minimo: reply al messaggio quotato in embed testo.
 * Canvas 1:1 = Keep GIF-like / Later-heavy.
 */
export const quoteCommand: PrefixCommand = {
  name: "quote",
  description: "Quota un messaggio (rispondi al messaggio).",
  usage: "+quote (in reply)",
  category: "utility",
  async execute({ message }) {
    const ref = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      : null;
    if (!ref) {
      await replyErr(message, "Rispondi a un messaggio e usa `+quote`.");
      return;
    }
    const text = (ref.content || "").trim() || "_allegato / senza testo_";
    rememberQuote(message.author.id, text);
    const jump =
      "url" in ref && typeof (ref as { url?: string }).url === "string"
        ? (ref as { url: string }).url
        : `https://discord.com/channels/${message.guildId}/${ref.channelId}/${ref.id}`;
    const embed = baseEmbed()
      .setAuthor({
        name: ref.author.tag,
        iconURL: ref.author.displayAvatarURL({ size: 64 }),
      })
      .setDescription(
        [
          text.length > 1800 ? `${text.slice(0, 1800)}…` : text,
          "",
          `[Vai al messaggio](${jump})`,
        ].join("\n"),
      )
      .setFooter({ text: `Quote by ${message.author.tag}` })
      .setTimestamp(ref.createdAt);
    const img = ref.attachments.find((a) => a.contentType?.startsWith("image/"));
    if (img?.url) embed.setImage(img.url);
    await replyEmbed(message, embed);
  },
};
