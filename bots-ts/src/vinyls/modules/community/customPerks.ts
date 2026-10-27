import type { Client, VoiceState } from "discord.js";
import { logger } from "../../../shared";

/**
 * Custom role / voc backend Keep — expiry/cleanup shell (sito primary).
 * VC_TS_CUSTOM_VOC_CATEGORY = category id da monitorare.
 */
const lastEmpty = new Map<string, number>();

export function registerCustomPerksBackend(client: Client): void {
  const categoryId = String(process.env.VC_TS_CUSTOM_VOC_CATEGORY || "").trim();
  if (!categoryId) {
    logger.info("[customPerks] off — VC_TS_CUSTOM_VOC_CATEGORY");
    return;
  }
  client.on("voiceStateUpdate", (_b: VoiceState, after: VoiceState) => {
    try {
      const ch = after.channel || _b.channel;
      if (!ch || ch.parentId !== categoryId) return;
      if (ch.members.filter((m) => !m.user.bot).size > 0) {
        lastEmpty.delete(ch.id);
        return;
      }
      if (!lastEmpty.has(ch.id)) lastEmpty.set(ch.id, Date.now());
    } catch (err) {
      logger.warn("[customPerks]", err);
    }
  });
  const ttl = Math.max(60_000, Number(process.env.VC_TS_CUSTOM_VOC_TTL_MS) || 300_000);
  setInterval(() => {
    const now = Date.now();
    for (const [id, since] of lastEmpty) {
      if (now - since < ttl) continue;
      lastEmpty.delete(id);
      logger.info(`[customPerks] voc empty TTL · channel=${id} (delete gated — set VC_TS_CUSTOM_VOC_DELETE=1)`);
      if (process.env.VC_TS_CUSTOM_VOC_DELETE === "1") {
        void client.channels.fetch(id).then(async (ch) => {
          if (ch && "delete" in ch && typeof ch.delete === "function") {
            await ch.delete("custom voc TTL");
          }
        }).catch(() => undefined);
      }
    }
  }, 30_000).unref?.();
  logger.info("[customPerks] custom voc monitor on");
}
