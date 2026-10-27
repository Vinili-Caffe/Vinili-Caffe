import type { Client, GuildMember, PartialGuildMember } from "discord.js";
import { logger } from "../../../shared";

/**
 * Community ops shell: clan-tag / sponsor / tenure hooks su guildMemberUpdate.
 * Enforce gated da env (default log-only).
 */
export function registerCommunityOps(client: Client): void {
  const enforce = process.env.VC_TS_COMMUNITY_OPS_ENFORCE === "1";
  const clanRole = String(process.env.VC_TS_CLAN_TAG_ROLE || "").trim();
  const sponsorRole = String(process.env.VC_TS_SPONSOR_ROLE || "").trim();
  const mainRole = String(process.env.VC_TS_MAIN_ROLE || "").trim();

  client.on("guildMemberUpdate", (before: GuildMember | PartialGuildMember, after: GuildMember) => {
    try {
      if (sponsorRole && mainRole && after.roles.cache.has(sponsorRole) && !after.roles.cache.has(mainRole)) {
        logger.info(`[communityOps] sponsor senza main · ${after.user.tag}`);
        if (enforce) {
          void after.roles.remove(sponsorRole, "sponsor requires main").catch(() => undefined);
        }
      }
      if (clanRole) {
        const had = before.roles?.cache?.has(clanRole);
        const has = after.roles.cache.has(clanRole);
        if (had !== has) {
          logger.info(`[communityOps] clan-tag ${has ? "add" : "remove"} · ${after.user.tag}`);
        }
      }
    } catch (err) {
      logger.warn("[communityOps]", err);
    }
  });

  logger.info(
    `[communityOps] on · enforce=${enforce ? "yes" : "log-only"} · clan=${clanRole || "off"} sponsor=${sponsorRole || "off"}`,
  );
}
