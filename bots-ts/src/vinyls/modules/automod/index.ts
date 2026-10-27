import type { Client, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { logger } from "../../../shared";

/**
 * Automod base: flood, mass-mention, invite links.
 * Off per canale/ruolo manage messages. Config via env.
 */
const lastMsgs = new Map<string, number[]>();

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function registerAutomodModule(client: Client): void {
  if (process.env.VC_TS_AUTOMOD === "0") {
    logger.info("[automod] off (VC_TS_AUTOMOD=0)");
    return;
  }

  const floodCount = envInt("VC_TS_AUTOMOD_FLOOD", 6);
  const floodWindowMs = envInt("VC_TS_AUTOMOD_FLOOD_MS", 7_000);
  const maxMentions = envInt("VC_TS_AUTOMOD_MENTIONS", 8);

  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot || !message.member) return;
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const content = message.content || "";
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const times = (lastMsgs.get(key) || []).filter((t) => now - t < floodWindowMs);
      times.push(now);
      lastMsgs.set(key, times);

      let reason: string | null = null;
      if (times.length >= floodCount) reason = "flood";
      else if (message.mentions.users.size + message.mentions.roles.size >= maxMentions) {
        reason = "mass-mention";
      } else if (/(discord\.gg\/|discord\.com\/invite\/)/i.test(content)) {
        reason = "invite";
      }

      if (!reason) return;
      await message.delete().catch(() => undefined);
      const ch = message.channel;
      if (!ch.isTextBased() || ch.isDMBased() || !("send" in ch)) return;
      const warn = await ch
        .send({
          content: `⚠️ <@${message.author.id}> messaggio rimosso (**${reason}**).`,
          allowedMentions: { users: [message.author.id] },
        })
        .catch(() => null);
      if (warn) {
        setTimeout(() => void warn.delete().catch(() => undefined), 6_000);
      }
    } catch (err) {
      logger.error("[automod]", err);
    }
  });

  logger.info(
    `[automod] on flood=${floodCount}/${floodWindowMs}ms mentions=${maxMentions} invites=on`,
  );
}
