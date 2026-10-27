import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "./permissions";
import { resolveTargetMember } from "./resolveTarget";

/**
 * Live: +verify — assegna ruolo verify da env `VC_TS_VERIFY_ROLE` (come IDs live).
 */
export const verifyCommand: PrefixCommand = {
  name: "verify",
  description: "Verifica un membro (assegna ruolo verify).",
  usage: "+verify <@utente|id>",
  category: "moderation",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.ManageRoles)) {
      await replyErr(message, "Ti serve **Gestire ruoli**.");
      return;
    }
    const roleId = String(process.env.VC_TS_VERIFY_ROLE || "").trim();
    if (!roleId) {
      await replyErr(message, "Imposta `VC_TS_VERIFY_ROLE` (id ruolo verify live).");
      return;
    }
    const target = await resolveTargetMember(message, args);
    if ("error" in target) {
      await replyErr(message, target.error);
      return;
    }
    await target.member.roles.add(roleId, `verify by ${message.author.id}`);
    await replyOk(message, `Verificato **${target.user.tag}**.`);
  },
};
