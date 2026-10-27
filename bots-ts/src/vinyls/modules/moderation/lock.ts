import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";

async function overwriteEveryone(
  message: import("discord.js").Message,
  denySend: boolean,
  reason: string,
): Promise<void> {
  const ch = message.channel;
  if (!ch.isTextBased() || ch.isDMBased() || !("permissionOverwrites" in ch)) {
    throw new Error("not_guild_text");
  }
  const everyone = message.guild!.roles.everyone;
  await ch.permissionOverwrites.edit(
    everyone,
    { SendMessages: denySend ? false : null },
    { reason },
  );
}

export const lockCommand: PrefixCommand = {
  name: "lock",
  description: "Blocca l’invio messaggi nel canale (@everyone).",
  usage: "+lock [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ManageChannels)) {
      await replyErr(message, "Ti serve **Gestisci canali**.");
      return;
    }
    const reason = args.join(" ").trim() || "Canale bloccato.";
    try {
      await overwriteEveryone(message, true, reason);
    } catch {
      await replyErr(message, "Non posso lockare questo canale.");
      return;
    }
    await replyOk(message, `Canale bloccato. ${reason}`);
  },
};

export const unlockCommand: PrefixCommand = {
  name: "unlock",
  description: "Sblocca l’invio messaggi nel canale.",
  usage: "+unlock [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ManageChannels)) {
      await replyErr(message, "Ti serve **Gestisci canali**.");
      return;
    }
    const reason = args.join(" ").trim() || "Canale sbloccato.";
    try {
      await overwriteEveryone(message, false, reason);
    } catch {
      await replyErr(message, "Non posso unlockare questo canale.");
      return;
    }
    await replyOk(message, `Canale sbloccato. ${reason}`);
  },
};
