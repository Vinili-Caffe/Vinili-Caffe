import type { Client } from "discord.js";
import { logger } from "../../shared";

/** Audit gateway Keep — log strutturato (modlog channel se VC_TS_AUDIT_CHANNEL). */
export function registerAuditEvents(client: Client): void {
  const auditCh = String(process.env.VC_TS_AUDIT_CHANNEL || "").trim();

  const emit = async (guildId: string, text: string) => {
    logger.info(`[audit] ${guildId} ${text}`);
    if (!auditCh) return;
    const ch = await client.channels.fetch(auditCh).catch(() => null);
    if (ch && ch.isTextBased() && "send" in ch) {
      await ch.send({ content: text.slice(0, 1800) }).catch(() => undefined);
    }
  };

  client.on("guildBanAdd", (ban) => {
    void emit(ban.guild.id, `🔨 Ban <@${ban.user.id}> (${ban.user.tag})`);
  });
  client.on("guildBanRemove", (ban) => {
    void emit(ban.guild.id, `♻️ Unban <@${ban.user.id}> (${ban.user.tag})`);
  });
  client.on("channelCreate", (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    void emit(channel.guild.id, `📁 Channel create: #${"name" in channel ? channel.name : "?"} (\`${channel.id}\`)`);
  });
  client.on("channelDelete", (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    void emit(channel.guild.id, `🗑️ Channel delete: #${"name" in channel ? channel.name : "?"} (\`${channel.id}\`)`);
  });
  client.on("roleCreate", (role) => {
    void emit(role.guild.id, `🎭 Role create: ${role.name}`);
  });
  client.on("roleDelete", (role) => {
    void emit(role.guild.id, `🎭 Role delete: ${role.name}`);
  });

  logger.info(`[audit] gateway on · channel=${auditCh || "log-only"}`);
}
