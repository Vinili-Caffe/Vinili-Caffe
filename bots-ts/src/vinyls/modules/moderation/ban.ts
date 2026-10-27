import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";
import { recordModAction } from "./record";
import { extractUserId, reasonFromArgs, resolveTargetMember } from "./resolveTarget";

function stripTargetFromArgs(args: string[]): string {
  if (!args.length) return "Nessun motivo specificato";
  const rest = extractUserId(args[0]) ? args.slice(1) : args.filter((a) => !/^<@!?\d+>$/.test(a));
  return rest.join(" ").trim() || "Nessun motivo specificato";
}

export const banCommand: PrefixCommand = {
  name: "ban",
  description: "Banna un utente dal server.",
  usage: "+ban <@utente|id> [motivo]",
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

    const target = await resolveTargetMember(message, args);
    if (!("error" in target)) {
      if (!target.member.bannable) {
        await replyErr(message, "Non posso bannare questo membro (gerarchia/permessi).");
        return;
      }
      const reason = stripTargetFromArgs(args);
      await target.member.ban({ reason, deleteMessageSeconds: 0 });
      const c = await recordModAction(message, {
        type: "ban",
        userId: target.user.id,
        reason,
        targetTag: target.user.tag,
      });
      await replyOk(
        message,
        `Bannato **${target.user.tag}** (\`${target.user.id}\`) · caso \`${c.id}\`.\nMotivo: ${reason}`,
      );
      return;
    }

    const uid = extractUserId(args[0]);
    if (!uid) {
      await replyErr(message, target.error);
      return;
    }
    const reason = reasonFromArgs(args, 1);
    await guild.members.ban(uid, { reason, deleteMessageSeconds: 0 });
    const c = await recordModAction(message, { type: "ban", userId: uid, reason });
    await replyOk(message, `Bannato \`${uid}\` · caso \`${c.id}\`.\nMotivo: ${reason}`);
  },
};
