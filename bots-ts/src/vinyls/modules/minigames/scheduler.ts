import type { Client, TextChannel } from "discord.js";
import { logger } from "../../../shared";
import { baseEmbed } from "../../../shared/embeds";

/**
 * Minigame scheduler Keep — loop annunci/prompt (core live `minigameService`).
 * Event SW/Hogwarts restano nei plugin.
 */
const PROMPTS = [
  "Minigame time! Usa i comandi economy (`+slots`, `+rps`, `+coinflip`) o aspetta l’evento.",
  "Chi vince di più oggi? Controlla `+top` e `+bal`.",
  "Vocale attivo? Clip con `+clip` se la capture è on.",
];

export function registerMinigameScheduler(client: Client): void {
  const channelId = String(process.env.VC_TS_MINIGAME_CHANNEL || "").trim();
  const everyMs = Math.max(60_000, Number(process.env.VC_TS_MINIGAME_INTERVAL_MS) || 45 * 60_000);
  if (!channelId) {
    logger.info("[minigames] scheduler off — VC_TS_MINIGAME_CHANNEL");
    return;
  }

  const tick = async () => {
    if (!client.isReady()) return;
    const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (!ch?.isTextBased()) return;
    const text = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]!;
    await ch
      .send({ embeds: [baseEmbed().setTitle("Minigames").setDescription(text)] })
      .catch((err) => logger.warn("[minigames]", err));
  };

  setInterval(() => void tick(), everyMs).unref?.();
  logger.info(`[minigames] scheduler on every ${Math.round(everyMs / 60000)}m`);
}
