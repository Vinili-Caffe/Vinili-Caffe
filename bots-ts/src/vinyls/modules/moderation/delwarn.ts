import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { deleteCase, getCase } from "./modCaseStore";
import { memberHas } from "./permissions";

export const delwarnCommand: PrefixCommand = {
  name: "delwarn",
  description: "Elimina un warn per id caso.",
  usage: "+delwarn <caseId>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const id = String(args[0] || "").trim();
    if (!id) {
      await replyErr(message, "Uso: `+delwarn <caseId>`");
      return;
    }
    const existing = getCase(guild.id, id);
    if (!existing || existing.type !== "warn") {
      await replyErr(message, `Warn \`${id}\` non trovato.`);
      return;
    }
    deleteCase(guild.id, id);
    await replyOk(message, `Rimosso warn \`${id}\` di <@${existing.userId}>.`);
  },
};
