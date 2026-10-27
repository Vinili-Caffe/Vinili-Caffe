import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { extractUserId } from "../moderation/resolveTarget";

export const avatarCommand: PrefixCommand = {
  name: "avatar",
  description: "Mostra avatar utente.",
  usage: "+avatar [@utente]",
  category: "utility",
  aliases: ["av", "pfp"],
  async execute({ message, args }) {
    const uid = extractUserId(args[0]) || message.author.id;
    const user =
      uid === message.author.id
        ? message.author
        : await message.client.users.fetch(uid).catch(() => null);
    if (!user) {
      await replyErr(message, "Utente non trovato.");
      return;
    }
    const url = user.displayAvatarURL({ size: 4096 });
    await replyEmbed(
      message,
      baseEmbed().setTitle(user.tag).setImage(url).setDescription(`[Link](${url})`),
    );
  },
};

export const bannerCommand: PrefixCommand = {
  name: "banner",
  description: "Mostra banner utente (se presente).",
  usage: "+banner [@utente]",
  category: "utility",
  async execute({ message, args }) {
    const uid = extractUserId(args[0]) || message.author.id;
    const user = await message.client.users.fetch(uid, { force: true }).catch(() => null);
    if (!user) {
      await replyErr(message, "Utente non trovato.");
      return;
    }
    const url = user.bannerURL({ size: 4096 });
    if (!url) {
      await replyErr(message, "Nessun banner.");
      return;
    }
    await replyEmbed(
      message,
      baseEmbed().setTitle(`${user.tag} · banner`).setImage(url).setDescription(`[Link](${url})`),
    );
  },
};
