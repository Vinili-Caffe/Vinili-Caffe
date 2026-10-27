import type { Client, Message, TextChannel } from "discord.js";
import { logger } from "../../shared";

/**
 * Chat reminder Keep: se canale silenzioso per N ms, ping soft.
 * Config: VC_TS_CHAT_REMINDER_CHANNEL + VC_TS_CHAT_REMINDER_MS (default 6h).
 */
export function registerChatReminder(client: Client): void {
  const channelId = String(process.env.VC_TS_CHAT_REMINDER_CHANNEL || "").trim();
  if (!channelId) {
    logger.info("[chatReminder] off — set VC_TS_CHAT_REMINDER_CHANNEL");
    return;
  }
  const idleMs = Math.max(60_000, Number(process.env.VC_TS_CHAT_REMINDER_MS) || 6 * 60 * 60 * 1000);
  let lastAt = Date.now();

  client.on("messageCreate", (message: Message) => {
    if (message.channelId === channelId && !message.author.bot) lastAt = Date.now();
  });

  const timer = setInterval(() => {
    void (async () => {
      if (Date.now() - lastAt < idleMs) return;
      const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
      if (!ch?.isTextBased()) return;
      lastAt = Date.now();
      await ch
        .send("☕ Ehi, il bancone è silenzioso — qualcuno per una chiacchiera?")
        .catch((err) => logger.error("[chatReminder] send", err));
    })();
  }, Math.min(idleMs, 5 * 60_000));
  timer.unref?.();

  logger.info(`[chatReminder] on channel=${channelId} idleMs=${idleMs}`);
}
