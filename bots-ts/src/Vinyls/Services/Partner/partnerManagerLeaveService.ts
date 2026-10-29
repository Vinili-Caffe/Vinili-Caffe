const path = require("path") as typeof import("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
const {
  getPartnershipConfigSync,
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
} = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const {
  getPartnershipChannelId,
  resolvePartnershipLifecycleLogChannelId,
  resolvePartnershipConfigSync,
  isMainPartnershipSettingsGuild,
  isPartnershipOperational,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { ensurePartnershipChannelInvite } = require("./partnershipInviteService") as typeof import("./partnershipInviteService");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const GRACE_MS = 5 * 60 * 1000;
const WARN_REASON = "Manager uscito dal server — warn";
/* rebootDurability1: grace manager leave → snapshot disk */
const GRACE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "partnerManagerLeaveGraceSnapshot.json");
let graceFlushRegistered = false;
let graceRestored = false;

function getRomeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getGraceMap(client?) {
  if (!client._partnerManagerLeaveGrace) client._partnerManagerLeaveGrace = new Map();
  return client._partnerManagerLeaveGrace;
}

function graceKey(guildId?, userId?) {
  return `${String(guildId)}:${String(userId)}`;
}

function isDmClosedError(err?) {
  return [50007, 50278].includes(Number(err?.code));
}

function resolveManagerLeaveConfig(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isMainPartnershipSettingsGuild(gid)) {
    return resolvePartnershipConfigSync(gid);
  }
  return getPartnershipConfigSync(gid);
}

function shouldHandleTenantManagerLeave(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;

  if (isMainPartnershipSettingsGuild(gid)) {
    if (!isPartnershipOperational(gid)) return false;
    const action = resolveManagerLeaveConfig(gid)?.managerLeaveAction;
    return action === "delete" || action === "warn";
  }

  if (!isMultiGuildLayerEnabled()) return false;
  if (isViniliProtectedGuild(gid)) return false;
  if (!shouldApplyMultiGuildLayer(gid)) return false;
  const config = getPartnershipConfigSync(gid);
  if (!isPartnershipSetupComplete(config)) return false;
  const action = config?.managerLeaveAction;
  return action === "delete" || action === "warn";
}

async function managerHasActivePartnership(guildId?, managerUserId?) {
  const gid = String(guildId || "").trim();
  const uid = String(managerUserId || "").trim();
  if (!gid || !/^\d{16,20}$/.test(uid)) return false;
  const doc = await ActivityUserProfile.findOne({
    guildId: gid,
    "staff.partnerActions": {
      $elemMatch: {
        action: "create",
        managerId: uid,
      },
    },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(doc);
}

async function resolveGuildInviteUrl(guild?) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolveManagerLeaveConfig(guild.id);
  if (config?.invite?.url) return config.invite.url;
  if (config?.partnershipsChannelId) {
    const ensured = await ensurePartnershipChannelInvite(guild, config.partnershipsChannelId);
    if (ensured.ok && ensured.invite?.url) return ensured.invite.url;
  }
  return null;
}

function buildLeaveWarningEmbed(guild?, userId?) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("<a:VC_Alert:1482706673176150077> Attenzione!")
    .setDescription(
      [
        `Sei uscito da **${String(guild?.name || "server").trim()}**!`,
        "Hai **5 minuti** per rientrare.",
        `<:VC_id:1478517313618575419> **Id:** \`${userId}\``,
        "<:VC_Info:1482526956703580372> **Info:** `Avevi fatto una partner`",
      ].join("\n"),
    );
}

function buildLeaveWarnOnlyEmbed(guild?, userId?) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("<a:VC_Alert:1482706673176150077> Attenzione!")
    .setDescription(
      [
        `Sei uscito da **${String(guild?.name || "server").trim()}**!`,
        "Hai **5 minuti** per rientrare.",
        `<:VC_id:1478517313618575419> **Id:** \`${userId}\``,
        "<:VC_Info:1482526956703580372> **Info:** `Avevi fatto una partner`",
      ].join("\n"),
    );
}

function buildLeaveExpiredEmbed() {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription("<:vegax:1443934876440068179> Partner **eliminata**!\nNon sei entrato entro **5 minuti**.");
}

function buildLeaveCancelledEmbed() {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("<a:VC_Alert:1482706673176150077> **Processo di eliminazione annullato!**")
    .setDescription(
      [
        "<a:VC_Verified:1482532479637127188> Perfetto, sei entrato entro i 5 minuti stabiliti.",
        "<a:VC_ThankYou:1330186319673950401> Il processo di eliminazione della partner è stato annullato.",
      ].join("\n"),
    );
}

function buildRejoinLinkRow(inviteUrl?) {
  if (!inviteUrl) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Entra nel Server").setURL(inviteUrl).setEmoji("<:VC_Link:1482460590894088222>"),
  );
}

async function deletePartnerActionMessages(guild?, action?) {
  const channelId =
    action?.partnershipChannelId || getPartnershipChannelId(guild?.id) || null;
  if (!channelId) return;
  const channel = await getGuildChannelCached(guild, channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  for (const messageId of action?.partnerMessageIds || []) {
    if (!messageId) continue;
    await channel.messages.delete(String(messageId)).catch(() => null);
  }
}

async function logPartnerWarn(guild?, staffUserId?, reason?, action?) {
  const channelId = resolvePartnershipLifecycleLogChannelId(guild?.id);
  if (!channelId) return null;
  const channel = await getGuildChannelCached(guild, channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const msgRef =
    Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length
      ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || getPartnershipChannelId(guild.id)}/${action.partnerMessageIds[0]}`
      : "N/D";
  const inviteDb = action?.invite ? String(action.invite).slice(0, 300) : "N/D";

  try {
    const sent = await channel.send({
      content: `<:VC_PartnerManager:1494286911286808576> <@${staffUserId}>
<:VC_reason:1478517122929004544> ${reason}
<:VC_Chat:1482532573002465413> Messaggio: ${msgRef}
<link:1470064815899803668> Invite: ${inviteDb}`,
    });
    return { channelId: sent.channelId || channel.id, messageId: sent.id };
  } catch (err) {
    global.logger?.warn?.("[partnerManagerLeave] warn log failed:", err?.message || err);
    return null;
  }
}

async function findManagerPartnerDocs(guildId?, managerUserId?) {
  return ActivityUserProfile.find({
    guildId: String(guildId),
    "staff.partnerActions": {
      $elemMatch: {
        action: "create",
        managerId: String(managerUserId),
      },
    },
  }).catch(() => []);
}

async function executeDeletePartnerships(guild?, managerUserId?, client?) {
  const { deletePartnershipsForManagerLeave } = require("./tenantPartnershipDeleteService") as typeof import("./tenantPartnershipDeleteService");
  return deletePartnershipsForManagerLeave(guild, managerUserId, client);
}

async function executeWarnPartnerships(guild?, managerUserId?) {
  const { memberHasPartnerManagerRole } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
  const docs = await findManagerPartnerDocs(guild.id, managerUserId);
  const dateKey = getRomeDateKey(new Date());
  let warned = 0;
  for (const doc of docs) {
    if (!doc?.staff) continue;
    const staffMember = await guild.members.fetch(String(doc.userId || "")).catch(() => null);
    if (!memberHasPartnerManagerRole(staffMember, guild.id)) continue;
    const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
    let changed = false;
    for (const action of actions) {
      if (action?.action !== "create" || String(action?.managerId || "") !== String(managerUserId)) continue;
      const penaltyDates = Array.isArray(action.auditPenaltyDates) ? action.auditPenaltyDates : [];
      if (penaltyDates.includes(dateKey)) continue;
      const logResult = await logPartnerWarn(guild, doc.userId, WARN_REASON, action);
      action.auditPenaltyDates = [...penaltyDates, dateKey];
      action.auditPenaltyLogs = Array.isArray(action.auditPenaltyLogs) ? action.auditPenaltyLogs : [];
      action.auditPenaltyLogs.push({
        dateKey,
        reason: WARN_REASON,
        channelId: logResult?.channelId || "",
        messageId: logResult?.messageId || "",
      });
      doc.staff.partnerCount = Math.max(0, Number(doc.staff.partnerCount || 0) - 1);
      warned += 1;
      changed = true;
    }
    if (changed) {
      doc.markModified("staff");
      await doc.save().catch((err?) => {
        global.logger?.warn?.("[partnerManagerLeave] save warn failed:", err?.message || err);
      });
    }
  }
  return warned;
}

async function sendManagerLeaveDm(user?, guild?, inviteUrl?, options: Record<string, any> = {}) {
  const embed =
    options?.gracePeriod === false
      ? buildLeaveWarnOnlyEmbed(guild, user.id)
      : buildLeaveWarningEmbed(guild, user.id);
  const row = options?.gracePeriod === false ? null : buildRejoinLinkRow(inviteUrl);
  const dm = await user.createDM().catch(() => null);
  if (!dm) return null;
  try {
    return await dm.send({
      embeds: [embed],
      ...(row ? { components: [row] } : {}),
    });
  } catch (err) {
    if (!isDmClosedError(err)) global.logger?.warn?.("[partnerManagerLeave] warning DM failed:", err?.message || err);
    return null;
  }
}

async function sendManagerLeaveFollowUpDm(user?, embed?) {
  const dm = await user.createDM().catch(() => null);
  if (!dm) return null;
  try {
    return await dm.send({ embeds: [embed] });
  } catch (err) {
    if (!isDmClosedError(err)) global.logger?.warn?.("[partnerManagerLeave] follow-up DM failed:", err?.message || err);
    return null;
  }
}

function persistGraceSnapshot(client?) {
  const map = client ? getGraceMap(client) : null;
  const payload: Record<string, any> = {};
  const now = Date.now();
  if (map) {
    for (const [key, row] of map.entries()) {
      const deadlineAt = Number(row?.deadlineAt || 0);
      if (!key || !Number.isFinite(deadlineAt) || deadlineAt <= now - 60_000) continue;
      payload[key] = {
        deadlineAt,
        leaveAction: String(row?.leaveAction || "delete"),
        guildId: String(row?.guildId || ""),
        managerUserId: String(row?.managerUserId || ""),
      };
    }
  }
  writeSnapshotWithMeta({
    filePath: GRACE_SNAPSHOT_PATH,
    walPath: `${GRACE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_partner_manager_leave_grace",
    version: 1,
    payload,
  });
}

function ensureGraceFlushRegistered(client?) {
  if (graceFlushRegistered) return;
  graceFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_partner_manager_leave_grace", () => persistGraceSnapshot(client));
}

function clearGraceTimer(client?, guildId?, userId?) {
  const map = getGraceMap(client);
  const key = graceKey(guildId, userId);
  const existing = map.get(key);
  if (existing?.timeout) clearTimeout(existing.timeout);
  map.delete(key);
  persistGraceSnapshot(client);
}

async function runGraceExpiry(client?, guildId?, managerUserId?) {
  const map = getGraceMap(client);
  const key = graceKey(guildId, managerUserId);
  const entry = map.get(key);
  map.delete(key);
  persistGraceSnapshot(client);
  if (!entry) return;

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  const member = await guild.members.fetch(managerUserId).catch(() => null);
  if (member) return;

  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolveManagerLeaveConfig(guildId);
  const leaveAction = config?.managerLeaveAction;
  if (leaveAction !== "delete") return;

  if (!(await managerHasActivePartnership(guildId, managerUserId))) return;

  const user = await client.users.fetch(managerUserId).catch(() => null);
  if (!user) return;

  const removed = await executeDeletePartnerships(guild, managerUserId, client);
  if (removed > 0) {
    await sendManagerLeaveFollowUpDm(user, buildLeaveExpiredEmbed());
  }
}

function scheduleGraceTimer(client?, guildId?, managerUserId?, leaveAction?, deadlineAtMs = null) {
  const map0 = getGraceMap(client);
  const key0 = graceKey(guildId, managerUserId);
  const existing0 = map0.get(key0);
  if (existing0?.timeout) clearTimeout(existing0.timeout);
  map0.delete(key0);
  ensureGraceFlushRegistered(client);
  const map = getGraceMap(client);
  const key = graceKey(guildId, managerUserId);
  const deadlineAt = Number.isFinite(Number(deadlineAtMs))
    ? Number(deadlineAtMs)
    : Date.now() + GRACE_MS;
  const delay = Math.max(1_000, deadlineAt - Date.now());
  const timeout = setTimeout(() => {
    void runGraceExpiry(client, guildId, managerUserId);
  }, delay);
  timeout.unref?.();
  map.set(key, {
    timeout,
    deadlineAt,
    leaveAction,
    guildId: String(guildId),
    managerUserId: String(managerUserId),
  });
  persistGraceSnapshot(client);
}

function restorePartnerManagerLeaveGraceOnStartup(client?) {
  if (!client || graceRestored) return { restored: 0, expired: 0 };
  graceRestored = true;
  ensureGraceFlushRegistered(client);
  const raw = readSnapshotWithMeta({
    filePath: GRACE_SNAPSHOT_PATH,
    walPath: `${GRACE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_partner_manager_leave_grace",
    version: 1,
    fallback: {},
  });
  let restored = 0;
  let expired = 0;
  const now = Date.now();
  for (const [key, row] of Object.entries(raw || {})) {
    const guildId = String(row?.guildId || key.split(":")[0] || "").trim();
    const managerUserId = String(row?.managerUserId || key.split(":")[1] || "").trim();
    const deadlineAt = Number(row?.deadlineAt || 0);
    if (!guildId || !managerUserId || !Number.isFinite(deadlineAt)) continue;
    if (deadlineAt <= now) {
      expired += 1;
      getGraceMap(client).set(graceKey(guildId, managerUserId), {
        timeout: null,
        deadlineAt,
        leaveAction: row?.leaveAction || "delete",
        guildId,
        managerUserId,
      });
      void runGraceExpiry(client, guildId, managerUserId);
      continue;
    }
    scheduleGraceTimer(client, guildId, managerUserId, row?.leaveAction || "delete", deadlineAt);
    restored += 1;
  }
  if (restored || expired) {
    global.logger?.info?.(`[partnerManagerLeave] grace restore: restored=${restored} expiredNow=${expired}`);
  }
  return { restored, expired };
}

async function handleTenantPartnerManagerLeave(member?, client?) {
  if (!member?.user || member.user.bot || !member.guild?.id) return;
  const guild = member.guild;
  const activeClient = client || member.client;
  if (!activeClient) return;

  await refreshPartnershipConfigCache().catch(() => null);
  if (!shouldHandleTenantManagerLeave(guild.id)) return;

  const managerUserId = member.id;
  if (!(await managerHasActivePartnership(guild.id, managerUserId))) return;

  const config = resolveManagerLeaveConfig(guild.id);
  const leaveAction = config?.managerLeaveAction;
  if (leaveAction !== "delete" && leaveAction !== "warn") return;

  const inviteUrl = await resolveGuildInviteUrl(guild);
  if (leaveAction === "warn") {
    await sendManagerLeaveDm(member.user, guild, inviteUrl, { gracePeriod: false });
    return;
  }

  await sendManagerLeaveDm(member.user, guild, inviteUrl, { gracePeriod: true });
  scheduleGraceTimer(activeClient, guild.id, managerUserId, leaveAction);
}

async function handleTenantPartnerManagerRejoin(member?, client?) {
  if (!member?.user || member.user.bot || !member.guild?.id) return;
  const activeClient = client || member.client;
  if (!activeClient) return;

  const map = getGraceMap(activeClient);
  const key = graceKey(member.guild.id, member.id);
  const entry = map.get(key);
  if (!entry) return;

  clearGraceTimer(activeClient, member.guild.id, member.id);
  await sendManagerLeaveFollowUpDm(member.user, buildLeaveCancelledEmbed());
}

export = {
  GRACE_MS,
  deletePartnerActionMessages,
  handleTenantPartnerManagerLeave,
  handleTenantPartnerManagerRejoin,
  shouldHandleTenantManagerLeave,
  restorePartnerManagerLeaveGraceOnStartup,
};
