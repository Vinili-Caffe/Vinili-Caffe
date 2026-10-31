/** Bacheche: statistiche dei server (membri, tag del server) aggiornate periodicamente. */
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { snowflakeOk, discordGuildIconUrl, preferAnimatedDiscordMediaUrl } = require("./boardSanitize") as typeof import("./boardSanitize");
const { BL, MAIN_GUILD_ID, featureGate, fetchGuildPreferLite } = require("./boardReviews") as typeof import("./boardReviews");
const { recomputeListingScore } = require("./boardVotes") as typeof import("./boardVotes");

function guildTagBadgeCdnUrl(guildId?, badgeHash?) {
  const gid = String(guildId || "").trim();
  const hash = String(badgeHash || "").trim();
  if (!snowflakeOk(gid) || !hash) return "";
  return `https://cdn.discordapp.com/guild-tag-badges/${gid}/${hash}.png?size=64`;
}

function parseDiscordInviteCode(url?) {
  const s = String(url || "").trim();
  if (!s) return "";
  const m = s.match(/(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)([a-zA-Z0-9-]+)/i);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-]{2,32}$/.test(s)) return s;
  return "";
}

/* boardsGuildTagUi2: invite.profile.badge_hash (Discord) via fetch raw — non solo client.rest */
async function fetchInviteJson(client?, code?) {
  const c = String(code || "").trim();
  if (!c) return null;
  if (client?.rest?.get) {
    try {
      const inv = await client.rest.get(`/invites/${encodeURIComponent(c)}?with_counts=true`);
      if (inv && (inv.profile || inv.guild)) return inv;
    } catch (_) {}
  }
  const token = String(
    client?.token ||
      process.env.DISCORD_TOKEN_OFFICIAL ||
      process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN ||
      "",
  ).trim();
  if (!token || typeof fetch !== "function") return null;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(c)}?with_counts=true`,
      {
        headers: {
          Authorization: `Bot ${token}`,
          "User-Agent": "DiscordBot (ViniliBoards, 1.0)",
        },
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function resolveGuildServerTag(client?, guild?, inviteUrl?) {
  const gid = String(guild?.id || "").trim();
  if (!snowflakeOk(gid)) return null;
  let tag = "";
  let badge = "";
  let colorPrimary = "";
  let colorSecondary = "";

  const code = parseDiscordInviteCode(inviteUrl);
  if (code) {
    const inv = await fetchInviteJson(client, code);
    const profile = inv?.profile || inv?.guild_profile || inv?.guild?.profile || null;
    if (profile) {
      tag = String(profile.tag || "").trim();
      badge = String(profile.badge_hash || profile.badgeHash || "").trim();
      colorPrimary = String(profile.badge_color_primary || profile.badgeColorPrimary || "").trim();
      colorSecondary = String(
        profile.badge_color_secondary || profile.badgeColorSecondary || "",
      ).trim();
    }
    if (!tag && inv?.guild?.tag) tag = String(inv.guild.tag).trim();
    if (!badge && inv?.guild?.badge_hash) badge = String(inv.guild.badge_hash).trim();
  }

  try {
    const cache = guild?.members?.cache;
    if (cache && typeof cache.values === "function") {
      for (const member of cache.values()) {
        const u = member?.user;
        if (!u) continue;
        const pg = u.primaryGuild || u.clan || null;
        if (!pg) continue;
        const idg = String(pg.identityGuildId || pg.identity_guild_id || "").trim();
        if (idg && idg !== gid) continue;
        const t = String(pg.tag || "").trim();
        const b = String(pg.badge || "").trim();
        if (t) {
          if (!tag) tag = t;
          if (b && !/^\d+$/.test(b) && !badge) badge = b;
          if (tag && badge) break;
        }
      }
    }
  } catch (_) {}

  if (!tag && gid === MAIN_GUILD_ID) tag = "V&C";
  tag = String(tag || "").trim().slice(0, 4);
  if (!tag) return null;
  return {
    guildTag: tag,
    guildTagBadge: badge || "",
    guildTagBadgeUrl: badge ? guildTagBadgeCdnUrl(gid, badge) : "",
    guildTagBadgeColor: colorPrimary || "",
    guildTagBadgeColor2: colorSecondary || "",
  };
}

async function refreshListingStats(client?, listing?) {
  if (!listing) return listing;
  const kind = String(listing.boardKind || listing.kind || "");
  if (kind !== "server") return listing;
  const gid = String(listing.boardDiscordId || listing.discordId || "").trim();
  if (!snowflakeOk(gid) || !client?.guilds) return listing;
  try {
    const guild =
      client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
    if (!guild) return listing;
    const prev =
      (listing.stats && typeof listing.stats === "object" && listing.stats) ||
      (listing.boardStats && typeof listing.boardStats === "object" && listing.boardStats) ||
      {};
    const inviteUrl = listing.inviteUrl || listing.boardInviteUrl || "";
    const tagInfo: any = (await resolveGuildServerTag(client, guild, inviteUrl)) || {};
    const stats = {
      members: Number(guild.memberCount) || 0,
      name: String(guild.name || ""),
      guildTag: tagInfo.guildTag || prev.guildTag || "",
      guildTagBadge: tagInfo.guildTagBadge || prev.guildTagBadge || "",
      guildTagBadgeUrl: tagInfo.guildTagBadgeUrl || prev.guildTagBadgeUrl || "",
      guildTagBadgeColor: tagInfo.guildTagBadgeColor || prev.guildTagBadgeColor || "",
      guildTagBadgeColor2: tagInfo.guildTagBadgeColor2 || prev.guildTagBadgeColor2 || "",
      refreshedAt: new Date().toISOString(),
    };
    if (stats.guildTagBadge && !stats.guildTagBadgeUrl) {
      stats.guildTagBadgeUrl = guildTagBadgeCdnUrl(gid, stats.guildTagBadge);
    }
    const iconUrl =
      (guild.icon ? discordGuildIconUrl(guild, null, 128) : "") ||
      preferAnimatedDiscordMediaUrl(listing.boardIconUrl || listing.iconUrl || "") ||
      "";
    await SiteDocument.updateOne(
      { _id: listing._id || listing.id, docType: BL },
      {
        $set: {
          boardStats: stats,
          boardIconUrl: iconUrl,
        },
      },
    );
    return {
      ...listing,
      boardStats: stats,
      stats: { ...(listing.stats && typeof listing.stats === "object" ? listing.stats : {}), ...stats },
      iconUrl: iconUrl || listing.iconUrl || "",
    };
  } catch {
    return listing;
  }
}

async function runBoardsStatsJob(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return { ok: false, skipped: true };
  const rows = await SiteDocument.find({ docType: BL, status: "approved", boardKind: "server" })
    .select({ _id: 1, boardDiscordId: 1, boardKind: 1, boardIconUrl: 1, boardInviteUrl: 1, boardStats: 1 })
    .limit(80)
    .lean();
  let n = 0;
  for (const row of rows) {
    await refreshListingStats(client, row);
    n += 1;
  }
  /* refresh scores for top listings */
  const top = await SiteDocument.find({ docType: BL, status: "approved" })
    .select({ _id: 1 })
    .sort({ boardScore: -1 })
    .limit(100)
    .lean();
  for (const row of top) {
    await recomputeListingScore(String(row._id), gate.cfg);
  }
  return { ok: true, refreshed: n, scored: top.length };
}

let statsTimer = null;
function ensureBoardsStatsScheduler(client?) {
  if (statsTimer) return;
  const minutes = Math.max(15, Number(client?.config?.boards?.statsRefreshMinutes) || 60);
  statsTimer = setInterval(() => {
    runBoardsStatsJob(client).catch((err?) => {
      global.logger?.warn?.("[boards] stats job:", err?.message || err);
    });
  }, minutes * 60 * 1000);
  if (typeof statsTimer.unref === "function") statsTimer.unref();
}

export = { guildTagBadgeCdnUrl, resolveGuildServerTag, refreshListingStats, runBoardsStatsJob, ensureBoardsStatsScheduler };
