import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";
import { recordModAction } from "./record";
import { extractUserId, resolveTargetMember } from "./resolveTarget";

function stripTargetFromArgs(args: string[]): string {
  if (!args.length) return "Nessun motivo specificato";
  const rest = extractUserId(args[0]) ? args.slice(1) : args.filter((a) => !/^<@!?\d+>$/.test(a));
  return rest.join(" ").trim() || "Nessun motivo specificato";
}

export const kickCommand: PrefixCommand = {
  name: "kick",
  description: "Espelle un membro dal server.",
  usage: "+kick <@utente|id> [motivo]",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.KickMembers)) {
      await replyErr(message, "Ti serve il permesso **Espelli membri**.");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    if (!target.member.kickable) {
      await replyErr(message, "Non posso espellere questo membro (gerarchia/permessi).");
      return;
    }
    const reason = stripTargetFromArgs(args);
    await target.member.kick(reason);
    const c = await recordModAction(message, {
      type: "kick",
      userId: target.user.id,
      reason,
      targetTag: target.user.tag,
    });
    await replyOk(
      message,
      `Espulso **${target.user.tag}** (\`${target.user.id}\`) · caso \`${c.id}\`.\nMotivo: ${reason}`,
    );
  },
};
