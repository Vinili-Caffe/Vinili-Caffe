import { baseEmbed, replyEmbed } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";

function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export const pingCommand: PrefixCommand = {
  name: "ping",
  description: "Latenza gateway e uptime del processo.",
  usage: "+ping",
  category: "utility",
  async execute({ client, message }) {
    const ws = Math.max(0, Math.round(client.ws.ping));
    const uptime = formatUptime(client.uptime ?? process.uptime() * 1000);
    const embed = baseEmbed()
      .setTitle("Ping")
      .setDescription(`Gateway **\`${ws}ms\`**`)
      .addFields(
        { name: "Uptime", value: `\`${uptime}\``, inline: true },
        { name: "Shard", value: `\`${message.guild?.shardId ?? 0}\``, inline: true },
      );
    await replyEmbed(message, embed);
  },
};