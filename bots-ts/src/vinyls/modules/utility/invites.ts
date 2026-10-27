import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { extractUserId } from "../moderation/resolveTarget";

/** Live: +invites — conteggio invite create dall’utente (fetch guild invites). */
export const invitesCommand: PrefixCommand = {
  name: "invites",
  description: "Mostra quante invite ha un utente.",
  usage: "+invites [@utente]",
  category: "utility",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const uid = extractUserId(args[0]) || message.author.id;
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) {
      await replyErr(message, "Non posso leggere le invite (permessi).");
      return;
    }
    let uses = 0;
    let codes = 0;
    for (const inv of invites.values()) {
      if (inv.inviter?.id !== uid) continue;
      codes += 1;
      uses += inv.uses || 0;
    }
    const user =
      uid === message.author.id
        ? message.author
        : await message.client.users.fetch(uid).catch(() => null);
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Invites · ${user?.tag || uid}`)
        .setDescription(`Codici: **${codes}** · Usi totali: **${uses}**`),
    );
  },
};
