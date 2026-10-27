import type { Client, GuildBan, GuildMember, PartialGuildMember } from "discord.js";
import { logger } from "../../../shared";

/**
 * Anti-nuke shell: conta ban/kick/role-delete in finestra breve.
 * Enforce (strip roles) solo con VC_TS_ANTINUKE_ENFORCE=1.
 */
const hits = new Map<string, number[]>();

function pushHit(guildId: string, actorId: string): number {
  const k = `${guildId}:${actorId}`;
  const now = Date.now();
  const windowMs = Number(process.env.VC_TS_ANTINUKE_WINDOW_MS) || 20_000;
  const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(k, list);
  return list.length;
}

async function noteAction(client: Client, guildId: string, type: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const threshold = Number(process.env.VC_TS_ANTINUKE_THRESHOLD) || 4;
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
    const entry = logs?.entries.first();
    const actorId = entry?.executor?.id;
    if (!actorId || actorId === client.user?.id) return;
    const n = pushHit(guildId, actorId);
    if (n < threshold) return;
    logger.warn(
      `[antinuke] soglia ${n}/${threshold} · guild=${guildId} actor=${actorId} type=${type}`,
    );
    if (process.env.VC_TS_ANTINUKE_ENFORCE === "1") {
      const member = await guild.members.fetch(actorId).catch(() => null);
      if (member && member.roles.cache.size > 1) {
        await member.roles
          .set([], `antinuke ${type}`)
          .catch((err) => logger.error("[antinuke] strip roles", err));
      }
    }
  } catch (err) {
    logger.error("[antinuke] audit", err);
  }
}

export function registerAntinukeModule(client: Client): void {
  if (process.env.VC_TS_ANTINUKE === "0") {
    logger.info("[antinuke] off");
    return;
  }

  client.on("guildBanAdd", (ban: GuildBan) => {
    void noteAction(client, ban.guild.id, "ban");
  });
  client.on("guildMemberRemove", (member: GuildMember | PartialGuildMember) => {
    void noteAction(client, member.guild.id, "memberRemove");
  });
  client.on("roleDelete", (role) => {
    void noteAction(client, role.guild.id, "roleDelete");
  });
  client.on("channelDelete", (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    void noteAction(client, channel.guild.id, "channelDelete");
  });

  logger.info(
    `[antinuke] watch on · enforce=${process.env.VC_TS_ANTINUKE_ENFORCE === "1" ? "yes" : "log-only"}`,
  );
}
