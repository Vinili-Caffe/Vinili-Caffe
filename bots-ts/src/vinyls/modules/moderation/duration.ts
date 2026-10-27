import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { getCase, listCasesForUser } from "./modCaseStore";
import { formatDurationMs, parseDurationMs } from "./parseDuration";
import { memberHas } from "./permissions";

/** Live: +duration — aggiorna durata mute attivo. */
export const durationCommand: PrefixCommand = {
  name: "duration",
  description: "Cambia durata di un mute (caseId o utente + durata).",
  usage: "+duration <caseId|@utente> <durata>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ModerateMembers)) {
      await replyErr(message, "Ti serve **Moderare i membri**.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const a0 = String(args[0] || "").trim();
    const a1 = String(args[1] || "").trim();
    if (!a0 || !a1) {
      await replyErr(message, "Uso: `+duration <caseId|@utente> <durata>`");
      return;
    }
    const durationMs = parseDurationMs(a1);
    let modCase = getCase(guild.id, a0);
    let userId = modCase?.userId;
    if (!modCase) {
      const mention = message.mentions.users.first();
      userId = mention?.id || (/^\d{17,20}$/.test(a0) ? a0 : null) || undefined;
      if (!userId) {
        await replyErr(message, "Caso o utente non trovato.");
        return;
      }
      modCase =
        listCasesForUser(guild.id, userId, "mute")
          .filter((c) => c.active)
          .at(-1) || undefined;
    }
    if (!modCase || modCase.type !== "mute" || !userId) {
      await replyErr(message, "Nessun mute attivo da aggiornare.");
      return;
    }
    modCase.durationMs = durationMs;
    modCase.expiresAt = Date.now() + durationMs;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.moderatable) {
      await member.timeout(durationMs, `duration update ${modCase.id}`);
    }
    await replyOk(
      message,
      `Durata mute \`${modCase.id}\` → **${formatDurationMs(durationMs)}**.`,
    );
  },
};
