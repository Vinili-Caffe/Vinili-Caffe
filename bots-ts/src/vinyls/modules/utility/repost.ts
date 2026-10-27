import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";

const myQuotes = new Map<string, string[]>();
const myReposts = new Map<string, string[]>();

function push(map: Map<string, string[]>, userId: string, text: string): void {
  const list = map.get(userId) || [];
  list.push(text.slice(0, 300));
  if (list.length > 20) list.shift();
  map.set(userId, list);
}

/** Live: +repost — ripubblica messaggio (reply). */
export const repostCommand: PrefixCommand = {
  name: "repost",
  description: "Ripubblica un messaggio (in reply).",
  usage: "+repost (reply)",
  category: "utility",
  async execute({ message }) {
    const refId = message.reference?.messageId;
    if (!refId) {
      await replyErr(message, "Rispondi a un messaggio con `+repost`.");
      return;
    }
    const ref = await message.channel.messages.fetch(refId).catch(() => null);
    if (!ref) {
      await replyErr(message, "Messaggio non trovato.");
      return;
    }
    const text = ref.content || "_senza testo_";
    push(myReposts, message.author.id, text);
    await replyEmbed(
      message,
      baseEmbed()
        .setAuthor({ name: ref.author.tag, iconURL: ref.author.displayAvatarURL({ size: 64 }) })
        .setDescription(text.slice(0, 2000))
        .setFooter({ text: `Repost by ${message.author.tag}` }),
    );
  },
};

export const myrepostCommand: PrefixCommand = {
  name: "myrepost",
  description: "Ultimi tuoi repost.",
  usage: "+myrepost",
  category: "utility",
  async execute({ message }) {
    const list = myReposts.get(message.author.id) || [];
    if (!list.length) {
      await replyOk(message, "Nessun repost in memoria.");
      return;
    }
    await replyOk(message, list.slice(-5).map((t, i) => `**${i + 1}.** ${t.slice(0, 80)}`).join("\n"));
  },
};

export const myquoteCommand: PrefixCommand = {
  name: "myquote",
  description: "Ultime tue quote (testo).",
  usage: "+myquote",
  category: "utility",
  async execute({ message }) {
    const list = myQuotes.get(message.author.id) || [];
    if (!list.length) {
      await replyOk(message, "Nessuna quote in memoria. Usa `+quote` in reply.");
      return;
    }
    await replyOk(message, list.slice(-5).map((t, i) => `**${i + 1}.** ${t.slice(0, 80)}`).join("\n"));
  },
};

/** Hook usato da quote.ts per popolare myquote. */
export function rememberQuote(userId: string, text: string): void {
  push(myQuotes, userId, text);
}
