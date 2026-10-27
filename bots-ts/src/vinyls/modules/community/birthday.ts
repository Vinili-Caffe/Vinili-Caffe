import type { Client, TextChannel } from "discord.js";
import { logger } from "../../../shared";

/**
 * Birthday loop Keep — niente UI profile Discord (Kill).
 * Source: VC_TS_BIRTHDAYS JSON `[{userId,month,day}]` + VC_TS_BIRTHDAY_CHANNEL.
 */
interface Bday {
  userId: string;
  month: number;
  day: number;
}

function loadBirthdays(): Bday[] {
  const raw = String(process.env.VC_TS_BIRTHDAYS || "").trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Bday[];
    return arr.filter((b) => b?.userId && b.month >= 1 && b.month <= 12 && b.day >= 1 && b.day <= 31);
  } catch {
    return [];
  }
}

export function registerBirthdayLoop(client: Client): void {
  const channelId = String(process.env.VC_TS_BIRTHDAY_CHANNEL || "").trim();
  const list = loadBirthdays();
  if (!channelId || !list.length) {
    logger.info("[birthday] off — set VC_TS_BIRTHDAY_CHANNEL + VC_TS_BIRTHDAYS");
    return;
  }
  let lastKey = "";
  const tick = async () => {
    const now = new Date();
    const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    if (key === lastKey) return;
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const today = list.filter((b) => b.month === month && b.day === day);
    if (!today.length) {
      lastKey = key;
      return;
    }
    const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (!ch?.isTextBased()) return;
    lastKey = key;
    const mentions = today.map((b) => `<@${b.userId}>`).join(" ");
    await ch.send(`🎂 Buon compleanno ${mentions}!`).catch((err) => logger.warn("[birthday]", err));
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
  client.once("clientReady", () => void tick());
  logger.info(`[birthday] loop on · ${list.length} entries`);
}
