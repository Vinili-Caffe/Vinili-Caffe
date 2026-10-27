import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { getCase, setCaseReason } from "./modCaseStore";
import { logModCase } from "./modlog";
import { memberHas } from "./permissions";

export const reasonCommand: PrefixCommand = {
  name: "reason",
  description: "Aggiorna il motivo di un caso.",
  usage: "+reason <caseId> <motivo>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve il permesso **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const id = String(args[0] || "").trim();
    const reason = args.slice(1).join(" ").trim();
    if (!id || !reason) {
      await replyErr(message, "Uso: `+reason <caseId> <motivo>`");
      return;
    }
    if (!getCase(guild.id, id)) {
      await replyErr(message, `Caso \`${id}\` non trovato.`);
      return;
    }
    const updated = setCaseReason(guild.id, id, reason);
    if (!updated) {
      await replyErr(message, "Update fallito.");
      return;
    }
    await logModCase(updated);
    await replyOk(message, `Motivo caso \`${id}\` aggiornato.`);
  },
};
