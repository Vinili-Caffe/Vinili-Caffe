import type { Client, TextChannel } from "discord.js";
import { baseEmbed } from "../../../shared/embeds";
import { logger } from "../../../shared";
import type { ModCase } from "./modCaseStore";
import { formatDurationMs } from "./parseDuration";

let clientRef: Client | null = null;

export function attachModlogClient(client: Client): void {
  clientRef = client;
}

function modlogChannelId(): string {
  return String(process.env.VC_TS_MODLOG_CHANNEL || "").trim();
}

/** Posta embed caso su canale modlog (env). Best-effort. */
export async function logModCase(modCase: ModCase, targetTag?: string): Promise<void> {
  const channelId = modlogChannelId();
  if (!channelId || !clientRef) return;
  try {
    const guild =
      clientRef.guilds.cache.get(modCase.guildId) ||
      (await clientRef.guilds.fetch(modCase.guildId).catch(() => null));
    if (!guild) return;
    const ch = (guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel | null;
    if (!ch?.isTextBased()) return;

    const fields = [
      { name: "User", value: `<@${modCase.userId}> (\`${modCase.userId}\`)`, inline: true },
      { name: "Mod", value: `<@${modCase.moderatorId}>`, inline: true },
      { name: "Action", value: modCase.type.toUpperCase(), inline: true },
      { name: "Reason", value: modCase.reason.slice(0, 1024) || "—" },
    ];
    if (modCase.durationMs) {
      fields.push({
        name: "Duration",
        value: formatDurationMs(modCase.durationMs),
        inline: true,
      });
    }
    if (modCase.expiresAt) {
      fields.push({
        name: "Expires",
        value: `<t:${Math.floor(modCase.expiresAt / 1000)}:R>`,
        inline: true,
      });
    }

    await ch.send({
      embeds: [
        baseEmbed()
          .setTitle(`Case ${modCase.id} · ${modCase.type} · ${targetTag || modCase.userId}`)
          .addFields(fields)
          .setTimestamp(modCase.at)
          .setFooter({ text: `active=${modCase.active !== false}` }),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    logger.error("[modlog] send", err);
  }
}

export function isModlogConfigured(): boolean {
  return Boolean(modlogChannelId());
}
