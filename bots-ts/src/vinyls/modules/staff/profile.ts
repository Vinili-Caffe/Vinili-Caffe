import { baseEmbed, replyEmbed, replyErr } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { getLevelInfo, getUserExpStats, getUserRank } from "../activity/exp";
import { getBalance } from "../economy/wallet";
import { getTenant } from "../multiguild/registry";
import { extractUserId } from "../moderation/resolveTarget";
import { getStaffPoints } from "./points";

/** Live +profile — payload semplificato (tenant-aware se VC_TS_TENANTS). */
export const profileCommand: PrefixCommand = {
  name: "profile",
  description: "Profilo utente (tenant/staff/economy TS).",
  usage: "+profile [@utente]",
  category: "staff",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const userId = extractUserId(args[0]) || message.mentions.users.first()?.id || message.author.id;
    const user =
      userId === message.author.id
        ? message.author
        : await message.client.users.fetch(userId).catch(() => null);
    if (!user) {
      await replyErr(message, "Utente non trovato.");
      return;
    }
    if (user.bot) {
      await replyErr(message, "Profilo non disponibile per i bot.");
      return;
    }
    const tenant = getTenant(guild.id);
    const exp = getUserExpStats(guild.id, userId);
    const lv = getLevelInfo(exp.totalExp);
    const lines = [
      tenant ? `Tenant: **${tenant.label}**` : null,
      `Livello **${lv.level}** · rank **#${getUserRank(guild.id, userId) || "—"}**`,
      `EXP **${exp.totalExp}** · msg ${exp.messages} · voce ${exp.voiceMinutes}m`,
      `Saldo economy: **${getBalance(guild.id, userId)}**`,
      `Punti staff/PM: **${getStaffPoints(guild.id, userId)}**`,
      "_UI Discord site-first Kill — questo è il profilo prefix Keep_",
    ].filter(Boolean);
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle(`Profile · ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setDescription(lines.join("\n")),
    );
  },
};
