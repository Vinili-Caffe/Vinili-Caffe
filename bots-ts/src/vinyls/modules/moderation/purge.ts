import { PermissionFlagsBits } from "discord.js";
import { replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";

export const purgeCommand: PrefixCommand = {
  name: "purge",
  description: "Elimina gli ultimi N messaggi nel canale (max 100).",
  usage: "+purge <1-100>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ManageMessages)) {
      await replyErr(message, "Ti serve il permesso **Gestire messaggi**.");
      return;
    }
    const channel = message.channel;
    if (!channel.isTextBased() || channel.isDMBased() || !("bulkDelete" in channel)) {
      await replyErr(message, "Canale non supportato.");
      return;
    }

    const n = Math.floor(Number(args[0]));
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      await replyErr(message, "Indica un numero tra **1** e **100**.");
      return;
    }

    await message.delete().catch(() => null);
    const deleted = await channel.bulkDelete(n, true).catch(() => null);
    const count = deleted?.size ?? 0;
    const confirm = await channel.send({
      content: `Eliminati **${count}** messaggi.`,
      allowedMentions: { parse: [] },
    });
    const t = setTimeout(() => {
      void confirm.delete().catch(() => null);
    }, 4000);
    t.unref?.();
  },
};