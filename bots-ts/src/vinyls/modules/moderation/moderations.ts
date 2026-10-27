import { PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { listActiveMutes, listCasesForUser } from "./modCaseStore";
import { memberHas } from "./permissions";
import { resolveTargetMember } from "./resolveTarget";

export const moderationsCommand: PrefixCommand = {
  name: "moderations",
  description: "Mostra sanzioni attive / recenti di un utente.",
  usage: "+moderations <@utente|id>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    const activeMutes = listActiveMutes(guild.id).filter((c) => c.userId === target.user.id);
    const recent = listCasesForUser(guild.id, target.user.id).slice(-10);
    if (!activeMutes.length && !recent.length) {
      await replyOk(message, `Nessuna moderazione per **${target.user.tag}**.`);
      return;
    }
    const lines: string[] = [];
    if (activeMutes.length) {
      lines.push("**Attive (mute)**");
      for (const c of activeMutes) {
        lines.push(
          `\`${c.id}\` mute · scade ${c.expiresAt ? `<t:${Math.floor(c.expiresAt / 1000)}:R>` : "—"}`,
        );
      }
    }
    if (recent.length) {
      lines.push("", "**Recenti**");
      for (const c of recent) {
        lines.push(`\`${c.id}\` **${c.action}** — ${c.reason}`);
      }
    }
    await replyEmbed(
      message,
      baseEmbed().setTitle(`Moderations · ${target.user.tag}`).setDescription(lines.join("\n")),
    );
  },
};
