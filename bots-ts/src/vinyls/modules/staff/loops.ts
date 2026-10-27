import type { Client, TextChannel } from "discord.js";
import { logger } from "../../../shared";
import { listStaffLeaderboard } from "./points";

/**
 * Staff loops Keep (no resoconti notify = Kill).
 * - staffer della settimana: annuncio top points
 * - auto-valutazioni: reminder canale (testo)
 */
export function registerStaffLoops(client: Client): void {
  const stafferCh = String(process.env.VC_TS_STAFFER_WEEK_CHANNEL || "").trim();
  const autoValCh = String(process.env.VC_TS_AUTO_VAL_CHANNEL || "").trim();

  if (stafferCh) {
    let lastKey = "";
    const tick = async () => {
      const now = new Date();
      if (now.getUTCDay() !== 1 || now.getUTCHours() > 2) return;
      const key = `${now.getUTCFullYear()}-W${now.getUTCMonth()}-${Math.ceil(now.getUTCDate() / 7)}`;
      if (key === lastKey) return;
      const ch = (await client.channels.fetch(stafferCh).catch(() => null)) as TextChannel | null;
      if (!ch?.isTextBased()) return;
      const lines = ["⭐ **Staffer della settimana (TS points)**"];
      for (const guild of client.guilds.cache.values()) {
        const top = listStaffLeaderboard(guild.id, 1)[0];
        if (!top) continue;
        lines.push(`**${guild.name}**: <@${top.userId}> — **${top.points}**`);
      }
      if (lines.length === 1) return;
      lastKey = key;
      await ch.send(lines.join("\n")).catch((err) => logger.warn("[stafferWeek]", err));
    };
    setInterval(() => void tick(), 30 * 60_000).unref?.();
    logger.info("[staff] staffer-della-settimana loop on");
  } else {
    logger.info("[staff] staffer week off — VC_TS_STAFFER_WEEK_CHANNEL");
  }

  if (autoValCh) {
    let lastDay = "";
    const tick = async () => {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      if (now.getUTCHours() !== 9 || lastDay === day) return;
      const ch = (await client.channels.fetch(autoValCh).catch(() => null)) as TextChannel | null;
      if (!ch?.isTextBased()) return;
      lastDay = day;
      await ch
        .send("📋 Reminder auto-valutazioni staff (TS). Compila sul sito `/staff/` quando pronto.")
        .catch((err) => logger.warn("[autoVal]", err));
    };
    setInterval(() => void tick(), 20 * 60_000).unref?.();
    logger.info("[staff] auto-valutazioni reminder on");
  } else {
    logger.info("[staff] auto-val off — VC_TS_AUTO_VAL_CHANNEL");
  }
}
