import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";

/** Live: +invite — link invita bot (semplificato, senza redirect OAuth dashboard). */
export const inviteCommand: PrefixCommand = {
  name: "invite",
  description: "Link invita del bot.",
  usage: "+invite",
  category: "utility",
  async execute({ message, client }) {
    const id = client.user?.id;
    if (!id) {
      await replyErr(message, "Client non pronto.");
      return;
    }
    const url = `https://discord.com/oauth2/authorize?client_id=${id}&permissions=${PermissionFlagsBits.Administrator}&scope=bot%20applications.commands`;
    await replyOk(message, `[Invita il bot](${url})`);
  },
};
