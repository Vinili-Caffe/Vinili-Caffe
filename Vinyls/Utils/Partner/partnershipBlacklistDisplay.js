const axios = require("axios");
const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { guildIconUrl } = require("../Discord/guildDiscordIdentity");

function extractInviteCode(text) {
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

async function fetchInviteGuildMeta(inviteCodeOrUrl) {
  const code = extractInviteCode(inviteCodeOrUrl) || String(inviteCodeOrUrl || "").trim();
  if (!code) return null;
  try {
    const res = await axios.get(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`,
      {
        timeout: 12000,
        headers: { Accept: "application/json" },
        validateStatus: () => true,
      },
    );
    if (res?.status !== 200 || !res.data?.guild?.id) return null;
    const guild = res.data.guild;
    const iconHash = guild.icon;
    let iconUrl = null;
    if (iconHash) {
      const ext = String(iconHash).startsWith("a_") ? "gif" : "png";
      iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${iconHash}.${ext}?size=256`;
    }
    return {
      guildId: String(guild.id),
      guildName: String(guild.name || "").trim() || null,
      iconUrl,
      invite: `https://discord.gg/${code}`,
    };
  } catch {
    return null;
  }
}

async function findStoredPartnerInviteForGuildId(targetGuildId) {
  const mainGuildId = String(IDs?.guilds?.main || "").trim();
  const gid = String(targetGuildId || "").trim();
  if (!mainGuildId || !/^\d{17,20}$/.test(gid)) return null;
  const docs = await ActivityUserProfile.find(
    { guildId: mainGuildId, "staff.partnerActions.partnerGuildId": gid },
    { "staff.partnerActions": 1 },
  ).limit(40).lean().catch(() => []);
  let bestInvite = null;
  let bestAt = 0;
  for (const doc of docs) {
    for (const act of doc?.staff?.partnerActions || []) {
      if (String(act?.partnerGuildId || "") !== gid) continue;
      const inv = String(act?.invite || "").trim();
      if (!inv) continue;
      const t = new Date(act?.createdAt || act?.date || 0).getTime();
      if (t >= bestAt) {
        bestAt = t;
        bestInvite = inv;
      }
    }
  }
  return bestInvite;
}

async function resolvePartnershipBlacklistEntryDisplay(client, entry, inviteCache = new Map()) {
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

module.exports = {
  extractInviteCode,
  fetchInviteGuildMeta,
  resolvePartnershipBlacklistEntryDisplay,
};