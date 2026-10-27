import type { ButtonInteraction } from "discord.js";
import { logger } from "../../../shared";
import { registerInteractionHandler } from "../../interactions/registry";
import { getLevelInfo, getUserExpStats, listTopExp } from "../activity/exp";
import { getStaffPoints, listStaffLeaderboard } from "../staff/points";
import { getTenant } from "./registry";

/** CustomId live tenant* buttons — payload testo. */
async function replyEphemeral(i: ButtonInteraction, content: string): Promise<void> {
  if (i.replied || i.deferred) await i.followUp({ content, ephemeral: true });
  else await i.reply({ content, ephemeral: true });
}

export function registerTenantButtons(): void {
  registerInteractionHandler({
    name: "tenantButtons",
    match: (i) => i.isButton() && /^(tenantPoints|tenantLeaderboard|tenantHelpNav|tenantProfile)/i.test(i.customId),
    execute: async (i) => {
      if (!i.isButton() || !i.guild) return;
      const id = i.customId.toLowerCase();
      const tenant = getTenant(i.guild.id);
      const label = tenant?.label || i.guild.name;

      if (id.startsWith("tenantpoints")) {
        await replyEphemeral(
          i,
          `**${label}** points: **${getStaffPoints(i.guild.id, i.user.id)}**`,
        );
        return;
      }
      if (id.startsWith("tenantleaderboard")) {
        const staff = listStaffLeaderboard(i.guild.id, 5);
        const exp = listTopExp(i.guild.id, 5);
        const lines = [
          `**LB · ${label}**`,
          "_Staff/PM_",
          ...staff.map((s, n) => `${n + 1}. <@${s.userId}> ${s.points}`),
          "_EXP_",
          ...exp.map((s, n) => `${n + 1}. <@${s.userId}> Lv ${getLevelInfo(s.totalExp).level}`),
        ];
        await replyEphemeral(i, lines.join("\n") || "Vuoto");
        return;
      }
      if (id.startsWith("tenanthelpnav")) {
        await replyEphemeral(
          i,
          `**Help · ${label}**\nPrefix: \`+points\` \`+profile\` \`+leaderboard\` \`+settings\`\nSito staff/ticket resta primary per UI.`,
        );
        return;
      }
      if (id.startsWith("tenantprofile")) {
        const exp = getUserExpStats(i.guild.id, i.user.id);
        await replyEphemeral(
          i,
          [
            `**Profile · ${label}**`,
            `Punti: **${getStaffPoints(i.guild.id, i.user.id)}**`,
            `Lv ${getLevelInfo(exp.totalExp).level} · EXP ${exp.totalExp}`,
          ].join("\n"),
        );
      }
    },
  });
  logger.info("[multiguild] tenant button handlers on");
}
