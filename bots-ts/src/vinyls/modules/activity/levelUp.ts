import type { Client, TextChannel } from "discord.js";
import { logger } from "../../../shared";
import { okEmbed } from "../../../shared/embeds";

export type LevelUpEvent = {
  guildId: string;
  userId: string;
  beforeLevel: number;
  afterLevel: number;
};

type Handler = (ev: LevelUpEvent) => void | Promise<void>;
const handlers: Handler[] = [];

/** Mappa livello → roleId da env `VC_TS_LEVEL_ROLES` JSON es. {"10":"...","20":"..."} */
export function parseLevelRoleMap(raw = process.env.VC_TS_LEVEL_ROLES || ""): Map<number, string> {
  const out = new Map<number, string>();
  if (!raw.trim()) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) {
      const lv = Number(k);
      if (Number.isFinite(lv) && v) out.set(lv, String(v));
    }
  } catch (err) {
    logger.warn("[levelUp] VC_TS_LEVEL_ROLES JSON invalido", err);
  }
  return out;
}

export function onLevelUp(handler: Handler): void {
  handlers.push(handler);
}

export function emitLevelUp(ev: LevelUpEvent): void {
  for (const h of handlers) {
    void Promise.resolve(h(ev)).catch((err) => logger.error("[levelUp] handler", err));
  }
}

export function registerLevelUpAnnounce(client: Client): void {
  const roleMap = parseLevelRoleMap();
  onLevelUp(async (ev) => {
    const guild = client.guilds.cache.get(ev.guildId) || (await client.guilds.fetch(ev.guildId).catch(() => null));
    if (!guild) return;

    const channelId = String(process.env.VC_TS_LEVEL_UP_CHANNEL || "").trim();
    if (channelId) {
      const ch = (guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel | null;
      if (ch?.isTextBased()) {
        await ch
          .send({
            embeds: [
              okEmbed(
                `🎉 <@${ev.userId}> è salito al **livello ${ev.afterLevel}** (da ${ev.beforeLevel})!`,
              ),
            ],
            allowedMentions: { users: [ev.userId] },
          })
          .catch((err) => logger.error("[levelUp] announce", err));
      }
    }

    if (!roleMap.size) return;
    const member = await guild.members.fetch(ev.userId).catch(() => null);
    if (!member) return;
    for (const [lv, roleId] of roleMap) {
      if (ev.afterLevel < lv) continue;
      if (member.roles.cache.has(roleId)) continue;
      await member.roles.add(roleId, `level-up ${ev.afterLevel}`).catch((err) => {
        logger.warn(`[levelUp] role ${roleId} fail`, err);
      });
    }
  });

  logger.info(
    `[levelUp] announce=${process.env.VC_TS_LEVEL_UP_CHANNEL ? "on" : "off"} · roles=${roleMap.size}`,
  );
}
