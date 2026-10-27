import type { Client, GuildMember, PartialGuildMember } from "discord.js";
import { logger } from "../../../shared";

/** Announce boost via canale env VC_TS_BOOST_CHANNEL. */
export function registerBoostAnnounce(client: Client): void {
  client.on("guildMemberUpdate", async (before: GuildMember | PartialGuildMember, after: GuildMember) => {
    try {
      const was = Boolean(before.premiumSince);
      const now = Boolean(after.premiumSince);
      if (was || !now) return;
      const channelId = String(process.env.VC_TS_BOOST_CHANNEL || "").trim();
      if (!channelId) return;
      const ch = await after.guild.channels.fetch(channelId).catch(() => null);
      if (!ch || !ch.isTextBased()) return;
      await ch.send({
        content: `🚀 Grazie <@${after.id}> per il boost!`,
        allowedMentions: { users: [after.id] },
      });
    } catch (err) {
      logger.error("[boost]", err);
    }
  });
  logger.info(
    `[boost] announce=${process.env.VC_TS_BOOST_CHANNEL ? "on" : "off (set VC_TS_BOOST_CHANNEL)"}`,
  );
}
