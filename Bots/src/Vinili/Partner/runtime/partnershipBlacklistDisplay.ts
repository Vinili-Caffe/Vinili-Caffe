const axios = require("axios") as any;
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

const INVITE_META_CACHE = new Map();
const INVITE_META_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let inviteRateLimitedUntilMs = 0;

function extractInviteCode(text?) {
  if (!text) return null;
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9-]+)/i,
    /discord\.com\/invite\/([a-zA-Z0-9-]+)/i,
    /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  const fallback = String(text).match(/\b([a-zA-Z0-9-]{6,32})\b/);
  return fallback ? fallback[1] : null;
}

function isInviteFetchRateLimited() {
  return Date.now() < inviteRateLimitedUntilMs;
}

function markInviteFetchRateLimited(retryAfterSec = 90) {
  const waitMs = Math.max(15, Math.min(300, Number(retryAfterSec) || 90)) * 1000;
  inviteRateLimitedUntilMs = Math.max(inviteRateLimitedUntilMs, Date.now() + waitMs);
}

function readApproximateMemberCount(payload?, guild = null) {
  const candidates = [
    payload?.approximateMemberCount,
    payload?.approximate_member_count,
    payload?.memberCount,
    payload?.member_count,
    guild?.approximateMemberCount,
    guild?.approximate_member_count,
    guild?.memberCount,
    guild?.member_count,
  ];
  for (const raw of candidates) {
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function getCachedInviteGuildMeta(inviteCodeOrUrl?, options: Record<string, any> = {}) {
  const code = (extractInviteCode(inviteCodeOrUrl) || String(inviteCodeOrUrl || "").trim()).toLowerCase();
  if (!code) return null;
  const hit = INVITE_META_CACHE.get(code);
  if (!hit) return null;
  if (Date.now() - hit.at > INVITE_META_CACHE_TTL_MS) {
    INVITE_META_CACHE.delete(code);
    return null;
  }
  const meta = hit.meta || null;
    if (options?.requireMemberCount && !(Number(meta?.memberCount) > 0)) return null;
  return meta;
}

function setCachedInviteGuildMeta(inviteCodeOrUrl?, meta?) {
  const code = (extractInviteCode(inviteCodeOrUrl) || String(inviteCodeOrUrl || "").trim()).toLowerCase();
  if (!code || !meta?.guildId) return;
  const prev = INVITE_META_CACHE.get(code)?.meta || null;
  const next = { ...meta };
    if (!(Number(next.memberCount) > 0) && Number(prev?.memberCount) > 0) {
    next.memberCount = prev.memberCount;
  }
  INVITE_META_CACHE.set(code, { meta: next, at: Date.now() });
}

async function fetchInviteGuildMeta(inviteCodeOrUrl?, options: Record<string, any> = {}) {
  const code = extractInviteCode(inviteCodeOrUrl) || String(inviteCodeOrUrl || "").trim();
  if (!code) return null;

  const requireMemberCount = options?.requireMemberCount === true;
  const cached = getCachedInviteGuildMeta(code, { requireMemberCount });
  if (cached && (!requireMemberCount || Number(cached.memberCount) > 0)) return cached;

  if (options?.skipIfRateLimited && isInviteFetchRateLimited()) {
    if (options?.out) options.out.rateLimited = true;
    return cached || null;
  }

  const timeoutMs = Math.max(500, Math.min(20_000, Number(options?.timeoutMs) || 12_000));
  const client = options?.client || null;
  let rateLimited = false;
  let bestMeta = cached || null;

  const noteRateLimit = (errOrStatus?) => {
    const status = Number(
      errOrStatus?.status ?? errOrStatus?.httpStatus ?? errOrStatus?.rawError?.code ?? errOrStatus ?? 0,
    );
    if (status === 429) {
      rateLimited = true;
      const retryAfter = Number(errOrStatus?.retryAfter ?? errOrStatus?.rawError?.retry_after ?? 90);
      markInviteFetchRateLimited(retryAfter);
    }
  };

  const fromInvitePayload = (payload?, inviteCode?) => {
    if (!payload || typeof payload !== "object") return null;
    const guild = payload.guild || null;
    const guildId = String(guild?.id || payload.guildId || payload.guild_id || "").trim();
    if (!guildId) return null;
    const iconHash = guild?.icon || null;
    let iconUrl = null;
    if (iconHash) {
      const ext = String(iconHash).startsWith("a_") ? "gif" : "png";
      iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=256`;
    } else if (typeof guild?.iconURL === "function") {
      try {
        iconUrl = guild.iconURL({ size: 256, extension: "png" }) || null;
      } catch {
        iconUrl = null;
      }
    }
    const memberCount = readApproximateMemberCount(payload, guild);
    const guildName = String(guild?.name || payload?.guildName || "").trim() || null;
    return {
      guildId,
      guildName,
      iconUrl,
      invite: `https://discord.gg/${inviteCode}`,
      memberCount,
    };
  };

  const keepBest = (meta?) => {
    if (!meta?.guildId) return;
    if (
      !bestMeta ||
      (Number(meta.memberCount) > 0 && !(Number(bestMeta.memberCount) > 0)) ||
      (Number(meta.memberCount) || 0) > (Number(bestMeta.memberCount) || 0)
    ) {
      bestMeta = meta;
    }
    setCachedInviteGuildMeta(code, meta);
  };

  const withHardTimeout = (promise?) =>
    new Promise((resolve?) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ value: null, err: null });
      }, timeoutMs);
      Promise.resolve(promise)
        .then((value?) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ value, err: null });
        })
        .catch((err?) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ value: null, err });
        });
    });

    if (client && typeof client.fetchInvite === "function") {
    const first: any = await withHardTimeout(client.fetchInvite(code, { withCounts: true }));
    if (first.err) noteRateLimit(first.err);
    let invite = first.value;
        if ((!invite || readApproximateMemberCount(invite, invite?.guild) == null) && !rateLimited) {
      const second: any = await withHardTimeout(client.fetchInvite(code, { withCounts: true }));
      if (second.err) noteRateLimit(second.err);
      if (second.value) invite = second.value;
    }
    const meta = fromInvitePayload(invite, code);
    if (meta) keepBest(meta);
    if (meta && Number(meta.memberCount) > 0) return meta;
    if (rateLimited) {
      if (options?.out) options.out.rateLimited = true;
      return bestMeta;
    }
  }

  const rest = client?.rest || client?._rest || null;
  if (rest && typeof rest.get === "function" && !rateLimited) {
    try {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const got: any = await withHardTimeout(
        rest.get(Routes.invite(code), { query: { with_counts: true } }),
      );
      if (got.err) noteRateLimit(got.err);
      const meta = fromInvitePayload(got.value, code);
      if (meta) keepBest(meta);
      if (meta && Number(meta.memberCount) > 0) return meta;
      if (rateLimited) {
        if (options?.out) options.out.rateLimited = true;
        return bestMeta;
      }
    } catch (err) {
      noteRateLimit(err);
    }
  }

  const botToken = String(
    options?.botToken ||
      process.env.DISCORD_TOKEN ||
      process.env.DISCORD_TOKEN_OFFICIAL ||
      "",
  ).trim();

  try {
    const headers: Record<string, any> = { Accept: "application/json" };
    if (botToken) headers.Authorization = `Bot ${botToken}`;
    const got: any = await withHardTimeout(
      axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, {
        timeout: timeoutMs,
        headers,
        validateStatus: () => true,
      }),
    );
    const res = got.value;
    if (!res) return bestMeta;
    if (res.status === 429) {
      noteRateLimit({ status: 429, retryAfter: Number(res.headers?.["retry-after"]) || 90 });
      if (options?.out) options.out.rateLimited = true;
      return bestMeta;
    }
    if (res.status !== 200) return bestMeta;
    const meta = fromInvitePayload(res.data, code);
    if (meta) keepBest(meta);
    return bestMeta;
  } catch {
    return bestMeta;
  } finally {
    if (rateLimited && options?.out) options.out.rateLimited = true;
  }
}

async function findStoredPartnerInviteForGuildId(targetGuildId?) {
  const meta = await findStoredPartnerMetaForGuildId(targetGuildId);
  return meta?.invite || null;
}

async function findStoredPartnerMetaForGuildId(targetGuildId?) {
  const gid = String(targetGuildId || "").trim();
  if (!/^\d{17,22}$/.test(gid)) return null;
  const rows = await ActivityUserProfile.aggregate([
    { $match: { "staff.partnerActions.partnerGuildId": gid } },
    { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "staff.partnerActions.partnerGuildId": gid,
      },
    },
    { $sort: { "staff.partnerActions.date": -1 } },
    { $limit: 8 },
    {
      $project: {
        _id: 0,
        name: "$staff.partnerActions.partner",
        invite: "$staff.partnerActions.invite",
        date: "$staff.partnerActions.date",
      },
    },
  ]).catch(() => []);

  let guildName = null;
  let invite = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.name || "").trim();
    const inv = String(row?.invite || "").trim();
    if (!guildName && name && !/^server\s+sconosciuto$/i.test(name)) guildName = name.slice(0, 100);
    if (!invite && inv) invite = inv;
    if (guildName && invite) break;
  }
  if (!guildName && !invite) return null;
  return { guildName, invite };
}

async function resolvePartnershipBlacklistEntryDisplay(client?, entry?, inviteCache = new Map()) {
  const guildId = String(entry?.guildId || "").trim();
  const note = String(entry?.note || "").trim();
  let guildName = String(entry?.guildName || "").trim();
  let iconUrl = String(entry?.iconUrl || "").trim() || null;
  let invite = String(entry?.invite || "").trim() || null;

  if (!guildName || !iconUrl) {
    const cachedGuild = client?.guilds?.cache?.get(guildId)
      || (client?.guilds?.fetch ? await client.guilds.fetch(guildId).catch(() => null) : null);
    if (cachedGuild) {
      if (!guildName) guildName = String(cachedGuild.name || "").trim();
      if (!iconUrl) iconUrl = guildIconUrl(cachedGuild, { size: 256 });
    }
  }

  if (!guildName || !iconUrl || !invite) {
    const lookupInvite = invite || await findStoredPartnerInviteForGuildId(guildId);
    if (lookupInvite) {
      const cacheKey = (extractInviteCode(lookupInvite) || lookupInvite).toLowerCase();
      let meta = inviteCache.get(cacheKey);
      if (meta === undefined) {
        meta = await fetchInviteGuildMeta(lookupInvite);
        inviteCache.set(cacheKey, meta || null);
      }
      if (meta) {
        if (!guildName) guildName = meta.guildName;
        if (!iconUrl) iconUrl = meta.iconUrl;
        if (!invite) invite = meta.invite;
      }
    }
  }

  return {
    guildId,
    guildName: guildName || `Server ${guildId}`,
    iconUrl,
    invite,
    note,
    addedAt: entry?.addedAt || null,
  };
}

export = {
  extractInviteCode,
  fetchInviteGuildMeta,
  getCachedInviteGuildMeta,
  isInviteFetchRateLimited,
  findStoredPartnerMetaForGuildId,
  resolvePartnershipBlacklistEntryDisplay,
};