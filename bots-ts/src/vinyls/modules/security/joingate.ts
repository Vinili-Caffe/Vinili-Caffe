import type { Client, GuildMember } from "discord.js";
import { logger } from "../../../shared";

/**
 * Join gate shell: assegna ruolo pending da env, log.
 * VC_TS_JOIN_GATE_ROLE=<roleId>
 */
export function registerJoinGate(client: Client): void {
  const roleId = String(process.env.VC_TS_JOIN_GATE_ROLE || "").trim();
  if (!roleId) {
    logger.info("[joingate] off — set VC_TS_JOIN_GATE_ROLE");
    return;
  }
  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      await member.roles.add(roleId, "join-gate");
      logger.info(`[joingate] role ${roleId} → ${member.id}`);
    } catch (err) {
      logger.warn("[joingate] add role fail", err);
    }
  });
  logger.info(`[joingate] on role=${roleId}`);
}
