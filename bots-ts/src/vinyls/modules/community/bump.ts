import type { Client, Message, TextChannel } from "discord.js";
import { logger } from "../../../shared";

/**
 * Bump / vote thank-you shell — webhook inbox → annuncio canale.
 * Process vote workers restano Later JS.
 */
import { listPendingVotes } from "../../../shared/webhooks";

const thanked = new Set<string>();

export function registerBumpAnnounceLoop(client: Client): void {
  const channelId = String(process.env.VC_TS_BUMP_CHANNEL || "").trim();
  if (!channelId) {
    logger.info("[bump] off — VC_TS_BUMP_CHANNEL");
    return;
  }
  setInterval(() => {
    void (async () => {
      const pending = listPendingVotes(20);
      if (!pending.length) return;
      const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
      if (!ch?.isTextBased()) return;
      for (const v of pending) {
        const key = `${v.provider}:${v.userId}:${v.at}`;
        if (thanked.has(key)) continue;
        thanked.add(key);
        await ch
          .send(`🙏 Grazie <@${v.userId}> per il vote **${v.provider}**!`)
          .catch(() => undefined);
      }
      if (thanked.size > 2_000) {
        const keep = [...thanked].slice(-500);
        thanked.clear();
        for (const k of keep) thanked.add(k);
      }
    })();
  }, 15_000).unref?.();

  // DISBOARD-style bump message detect (opzionale)
  client.on("messageCreate", (message: Message) => {
    if (!message.guild || message.author.id !== "302050872383242240") return; // Disboard
    if (!/bump/i.test(message.content || "") && !message.embeds.length) return;
    logger.info(`[bump] disboard bump seen in ${message.guild.id}`);
  });

  logger.info("[bump] vote thank loop on");
}
