const { PermissionsBitField } = require("discord.js");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const {
  getPartnershipConfig,
  getPartnershipConfigSync,
  setPartnershipInvite,
} = require("../../MultiGuild/core/tenantPartnershipSettings");
const {
  getManagedInvite,
  createPermanentInvite,
  saveManagedInvite,
  deleteGuildInviteByCode,
  isInviteEligibleTextChannel,
  sendOrUpdateJoinLog,
} = require("../../MultiGuild/services/guildJoinAlertService");

const RECREATE_LOCKS = new Map();
const RECREATE_COOLDOWN_MS = 8000;

function inviteRowFromManaged(managed, fallbackChannelId = null) {
  if (!managed?.code || !managed?.url) return null;
  return {
    code: String(managed.code).trim(),
    url: String(managed.url).trim(),
    channelId: String(managed.channelId || fallbackChannelId || "").trim() || null,
  };
}

async function inviteStillExists(guild, code) {
  const want = String(code || "").trim();
  if (!guild?.invites?.fetch || !want) return false;
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return false;
  return invites.has(want);
}

async function createAndPersistTenantPermanentInvite(guild, reason, preferredChannelId = null) {
  if (!guild?.id) return null;
  const created = await createPermanentInvite(guild, reason, preferredChannelId);
  if (!created?.code) return null;
  const inviteRow = {
    code: created.code,
    channelId: created.channelId,
    url: created.url,
  };
  const prevManaged = await getManagedInvite(guild.id).catch(() => null);
  await saveManagedInvite(guild.id, {
    ...inviteRow,
    logMessageId: prevManaged?.logMessageId || null,
  }).catch(() => null);
  await setPartnershipInvite(guild.id, inviteRow).catch(() => null);
  return inviteRow;
}

async function deleteStaleInviteCodes(guild, codes, keepCode) {
  const keep = String(keepCode || "").trim();
  const seen = new Set();
  for (const raw of codes) {
    const code = String(raw || "").trim();
    if (!code || code === keep || seen.has(code)) continue;
    seen.add(code);
    await deleteGuildInviteByCode(
      guild,
      code,
      "Spostamento invito permanente sul canale partnership",
    ).catch(() => false);
  }
}

async function ensurePartnershipChannelInvite(guild, channelId) {
  if (!guild?.id || !channelId) return { ok: false, reason: "missing_input" };
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!isInviteEligibleTextChannel(channel)) return { ok: false, reason: "invalid_channel" };

  const me =
    guild.members.me ||
    (await guild.members.fetch(guild.client.user.id).catch(() => null));
  if (!me?.permissionsIn?.(channel)?.has?.(PermissionsBitField.Flags.CreateInstantInvite)) {
    return { ok: false, reason: "missing_invite_perm" };
  }

  const cfg = getPartnershipConfigSync(guild.id) || (await getPartnershipConfig(guild.id).catch(() => null));
  const managed = await getManagedInvite(guild.id).catch(() => null);
  const stored = cfg?.invite;

  if (stored?.code && stored?.url && String(stored.channelId || "") === String(channel.id)) {
    if (await inviteStillExists(guild, stored.code)) {
      if (
        !managed?.code ||
        managed.code !== stored.code ||
        String(managed.channelId || "") !== String(channel.id)
      ) {
        await saveManagedInvite(guild.id, {
          code: stored.code,
          url: stored.url,
          channelId: channel.id,
          logMessageId: managed?.logMessageId || null,
        }).catch(() => null);
      }
      return { ok: true, invite: stored, source: "stored" };
    }
  }

  if (
    managed?.code &&
    managed?.url &&
    String(managed.channelId || "") === String(channel.id) &&
    (await inviteStillExists(guild, managed.code))
  ) {
    const invite = inviteRowFromManaged(managed, channel.id);
    await setPartnershipInvite(guild.id, invite).catch(() => null);
    return { ok: true, invite, source: "managed" };
  }

  const staleCodes = [stored?.code, managed?.code].filter(Boolean);
  const inviteRow = await createAndPersistTenantPermanentInvite(
    guild,
    "Tenant permanent invite (partnership channel)",
    channel.id,
  );
  if (!inviteRow) return { ok: false, reason: "invite_failed" };

  await deleteStaleInviteCodes(guild, staleCodes, inviteRow.code);

  try {
    await sendOrUpdateJoinLog(guild.client, guild, inviteRow, { regenerated: true });
  } catch (_) {}

  return {
    ok: true,
    invite: inviteRow,
    source: staleCodes.length ? "relocated" : "created",
  };
}

async function maybeSyncPartnershipInviteFromManaged(guildId, inviteRow) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !inviteRow?.code || !inviteRow?.url) return;
  const cfg = getPartnershipConfigSync(gid);
  if (!cfg?.partnershipsChannelId) return;
    const managedOnPartnerChannel =
    String(inviteRow.channelId || "") === String(cfg.partnershipsChannelId);
  if (!managedOnPartnerChannel && cfg.invite?.code) return;
  if (!managedOnPartnerChannel) return;
  await setPartnershipInvite(gid, {
    code: inviteRow.code,
    url: inviteRow.url,
    channelId: inviteRow.channelId || null,
  }).catch(() => null);
}

async function handlePartnershipInviteDeleted(client, invite) {
  if (!isMultiGuildLayerEnabled()) return;
  const guild = invite?.guild;
  const code = String(invite?.code || "");
  if (!guild?.id || !code || isViniliProtectedGuild(guild.id)) return;

  const config = await getPartnershipConfig(guild.id);
  if (!config?.invite?.code || config.invite.code !== code) return;
  if (!config.partnershipsChannelId) return;

  if (RECREATE_LOCKS.get(guild.id) > Date.now()) return;
  RECREATE_LOCKS.set(guild.id, Date.now() + RECREATE_COOLDOWN_MS);

  const fresh = await guild.fetch().catch(() => guild);
  const recreated = await createAndPersistTenantPermanentInvite(
    fresh,
    "Partnership invite rigenerato",
    config.partnershipsChannelId,
  );
  if (!recreated) {
    global.logger?.warn?.("[partnershipInvite] recreate failed:", guild.id);
    return;
  }

  global.logger?.info?.(
    `[partnershipInvite] recreated invite ${guild.id}: ${code} → ${recreated.code}`,
  );

  const logsChannelId = config.logsChannelId;
  if (logsChannelId) {
    const logCh =
      fresh.channels.cache.get(logsChannelId) ||
      (await fresh.channels.fetch(logsChannelId).catch(() => null));
    if (logCh?.isTextBased?.()) {
      await logCh
        .send({
          content: `⚠️ Invito partnership \`${code}\` eliminato — rigenerato: ${recreated.url}`,
        })
        .catch(() => null);
    }
  }
}

module.exports = {
  syncPartnershipInviteFromManaged: async (guildId, fallbackChannelId = null) => {
        const gid = String(guildId || "").trim();
    if (!/^\d{16,20}$/.test(gid)) return { ok: false, reason: "invalid_guild" };
    const managed = await getManagedInvite(gid).catch(() => null);
    const invite = inviteRowFromManaged(managed, fallbackChannelId);
    if (!invite) return { ok: false, reason: "no_managed_invite" };
    return { ok: true, invite, source: "managed" };
  },
  maybeSyncPartnershipInviteFromManaged,
  ensurePartnershipChannelInvite,
  handlePartnershipInviteDeleted,
};
