import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { getSession } from "./musicSession";

export const lyricsCommand: PrefixCommand = {
  name: "lyrics",
  description: "Lyrics stub (query o brano corrente).",
  usage: "+lyrics [query]",
  category: "music",
  aliases: ["testo"],
  async execute({ message, args }) {
    const q =
      args.join(" ").trim() ||
      (message.guild ? getSession(message.guild.id).playing?.title : "") ||
      "";
    if (!q) {
      await replyErr(message, "Uso: `+lyrics <query>` oppure metti un brano in play.");
      return;
    }
    await replyOk(
      message,
      `Lyrics per **${q}** non ancora collegati a un provider (stub Keep).`,
    );
  },
};
