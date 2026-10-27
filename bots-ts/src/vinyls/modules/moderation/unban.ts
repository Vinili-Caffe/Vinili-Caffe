import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";
import { recordModAction } from "./record";
import { extractUserId, reasonFromArgs } from "./resolveTarget";

export const unbanCommand: PrefixCommand = {
  name: "unban",
  description: "Sbanna un utente tramite ID.",
  usage: "+unban <id> [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.BanMembers)) {
      await replyErr(message, "Ti serve il permesso **Bannare membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) {
      await replyErr(message, "Comando solo in server.");
      return;
    }
    const uid = extractUserId(args[0]);
    if (!uid) {
      await replyErr(message, "Specifica un ID utente valido.");
      return;
    }
    const reason = reasonFromArgs(args, 1);
    await guild.members.unban(uid, reason);
    const c = await recordModAction(message, { type: "unban", userId: uid, reason });
    await replyOk(message, `Sbannato \`${uid}\` · caso \`${c.id}\`.\nMotivo: ${reason}`);
  },
};
