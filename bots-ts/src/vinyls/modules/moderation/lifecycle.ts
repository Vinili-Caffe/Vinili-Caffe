import type { Client } from "discord.js";
import { logger } from "../../../shared";
import { closeCase, listActiveMutes } from "./modCaseStore";
import { logModCase } from "./modlog";

/**
 * Chiude mute scaduti in store (Discord timeout scade da solo;
 * qui allineiamo active=false + eventuale modlog).
 */
export function startModCaseLifecycle(client: Client): void {
  const tick = async () => {
    const now = Date.now();
    for (const c of listActiveMutes()) {
      if (!c.expiresAt || c.expiresAt > now) continue;
      const closed = closeCase(c.guildId, c.id, "expired");
      if (!closed) continue;
      logger.info(`[modLifecycle] mute expired ${c.id} user=${c.userId}`);
      await logModCase(closed).catch(() => undefined);
      // Discord timeout già scaduto; niente unmute API necessario
      void client;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, 30_000);
  timer.unref?.();
  logger.info("[modLifecycle] mute expiry loop on");
}
