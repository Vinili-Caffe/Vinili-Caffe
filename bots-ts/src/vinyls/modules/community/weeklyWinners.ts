import type { Client, TextChannel } from "discord.js";
import { logger } from "../../../shared";
import { getLevelInfo, listTopExp } from "../activity/exp";

/**
 * Weekly activity winners — store TS (`bots_ts_*`), non schema live.
 * Annuncio canale opzionale VC_TS_WEEKLY_WINNERS_CHANNEL.
 */
export function registerWeeklyWinnersLoop(client: Client): void {
  const channelId = String(process.env.VC_TS_WEEKLY_WINNERS_CHANNEL || "").trim();
  if (!channelId) {
    logger.info("[weeklyWinners] off — set VC_TS_WEEKLY_WINNERS_CHANNEL");
    return;
  }

  let lastWeekKey = "";
  const tick = async () => {
    const now = new Date();
    // ISO week rough key
    const weekKey = `${now.getUTCFullYear()}-W${Math.ceil(now.getUTCDate() / 7)}-${now.getUTCMonth()}`;
    // announce Monday 00–01 UTC once
    if (now.getUTCDay() !== 1 || now.getUTCHours() > 1) return;
    if (weekKey === lastWeekKey) return;

    const guilds = client.guilds.cache;
    const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (!ch?.isTextBased()) return;

    const lines: string[] = ["🏆 **Weekly activity (TS store)**"];
    for (const guild of guilds.values()) {
      const top = listTopExp(guild.id, 3);
      if (!top.length) continue;
      lines.push(`**${guild.name}**`);
      top.forEach((s, i) => {
        const lv = getLevelInfo(s.totalExp).level;
        lines.push(`${i + 1}. <@${s.userId}> — Lv ${lv} · ${s.totalExp} EXP`);
      });
    }
    if (lines.length === 1) return;
    lastWeekKey = weekKey;
    await ch.send(lines.join("\n")).catch((err) => logger.warn("[weeklyWinners]", err));
  };

  const timer = setInterval(() => void tick(), 15 * 60_000);
  timer.unref?.();
  logger.info("[weeklyWinners] loop on");
}
