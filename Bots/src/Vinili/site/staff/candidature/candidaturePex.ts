/** Candidature: accettazione e pex del candidato. */
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../../Staff/utils/staffDocUtils") as typeof import("../../../Staff/utils/staffDocUtils");
const { clearStaffPendingPurgeAt } = require("../../../Community/services/userLeaveBackupService") as typeof import("../../../Community/services/userLeaveBackupService");
const { sendPartnerManagerWelcome, sendHelperWelcome } = require("../../../Staff/utils/staffWelcomeMessages") as typeof import("../../../Staff/utils/staffWelcomeMessages");
const { HELPER_ROLE_ID, PARTNER_MANAGER_ROLE_ID, normalizeApplicationType, getTargetRoleIdByType } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { APPLICATION_ACCEPTED_COLOR, applicationTypeLabel, setApplicationMessageStatusColor } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");

const candidatePexLocks = new Set();

async function sendCandidatePexWelcome(guild?, member?, targetRoleId?) {
  try {
    if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
      const staffChat =
        guild.channels.cache.get(IDs.channels.staffChat) ||
        (await getGuildChannelCached(guild, IDs.channels.staffChat));
      await sendHelperWelcome(staffChat, member);
      return;
    }
    if (String(targetRoleId) === String(PARTNER_MANAGER_ROLE_ID)) {
      await sendPartnerManagerWelcome(guild.client, member);
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] welcome failed:", err?.message || err);
  }
}

async function sendCandidatePexLog(guild?, member?, targetRoleId?, roleBeforeId?, reason?) {
    const { sendPexDepexLog } = require("../../../Events/interaction/resocontoHandlers") as typeof import("../../../Events/interaction/resocontoHandlers");
  await sendPexDepexLog(
    guild,
    "pex",
    member.user || member,
    roleBeforeId,
    targetRoleId,
    reason,
  ).catch((err?) => {
    global.logger?.warn?.("[candidature] pex log failed:", err?.message || err);
  });
}

async function completeCandidatePexAfterRole(guild?, member?, type?, reason?, sourceMessage?, opts: Record<string, any> = {}) {
  const targetRoleId = getTargetRoleIdByType(normalizeApplicationType(type));
  const roleBeforeId = String(IDs.roles.Member || "");
  const recovery = Boolean(opts.recovery);

  if (!recovery) {
    const profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
    const s = ensureStaff(profileDoc);
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: String(targetRoleId),
      reason: String(reason || "").trim(),
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    await clearStaffPendingPurgeAt(guild.id, member.id);
  }

  await sendCandidatePexLog(guild, member, targetRoleId, roleBeforeId, reason);
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../siteStaffEventNotifications") as typeof import("../siteStaffEventNotifications");
    void notifyStaffPexDepex({
      guild,
      kind: "pex",
      targetUserId: member.id,
      targetName: memberDisplayName(member, member.user, member.id),
      oldRoleId: roleBeforeId,
      newRoleId: String(targetRoleId),
      reason: String(reason || "").trim(),
      actorUserId: String(opts.decidedBy || ""),
      actorName: String(opts.decidedByName || "Staff").trim(),
      sourceHint: `candidature-pex:${member.id}:${String(sourceMessage?.id || "")}`,
    }).catch(() => 0);
  } catch (_) {}
  await sendCandidatePexWelcome(guild, member, targetRoleId);

  if (sourceMessage) {
    await setApplicationMessageStatusColor(
      sourceMessage,
      APPLICATION_ACCEPTED_COLOR,
      String(opts.decidedBy || ""),
      String(opts.decidedByName || ""),
    );
    await deleteThreadForMessage(guild, sourceMessage);
  }

  try {
    const { enqueueSiteInAppNotification } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
    const label = applicationTypeLabel(type);
    const msgId = String(sourceMessage?.id || "");
    const openUrl = msgId
      ? `/candidature/?chat=${encodeURIComponent(`candidature:${msgId}`)}`
      : "/candidature/";
    await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId: member.id,
      title: recovery ? "Candidatura accettata (recupero)" : "Candidatura accettata",
      body:
        normalizeApplicationType(type) === "blogger"
          ? `La tua candidatura è stata accettata: ora sei ${label}.`
          : `La tua candidatura è stata accettata: ora hai accesso come ${label}. Controlla i messaggi di benvenuto inviati nello staff.`,
      kind: "workflow_decision",
      channel: "personal",
      openUrl,
      dedupeKey: `cand-pex-${type}-${member.id}-${msgId}${recovery ? "-recovery" : ""}`,
      dedupeWindowMs: 86_400_000,
      replaceDedupe: true,
    });
  } catch (_) {}
}

async function applyCandidatePex(guild?, actor?, type?, userId?, reason?, sourceMessage?) {
  const targetRoleId = getTargetRoleIdByType(normalizeApplicationType(type));
  if (!targetRoleId) return "Ruolo target non configurato.";

  const member = guild.members.cache.get(String(userId)) || (await getGuildMemberCached(guild, String(userId)));
  if (!member) return "Utente non trovato nel server.";
  if (member.roles.cache.has(String(targetRoleId))) {
  await completeCandidatePexAfterRole(guild, member, type, reason, sourceMessage, {
    recovery: true,
    decidedBy: String(actor?.id || actor || ""),
    decidedByName: String(actor?.displayName || actor?.username || actor?.globalName || ""),
  });
    return `Utente già pexato su quel ruolo: ho reinviato pex e benvenuto.`;
  }

  const roleApplied = await member.roles
    .add(String(targetRoleId))
    .then(() => true)
    .catch(() => false);
  if (!roleApplied) {
    const refreshedMember = await getGuildMemberCached(guild, String(userId), {
      preferFresh: true,
    }).catch(() => null);
    if (!refreshedMember?.roles?.cache?.has(String(targetRoleId))) {
      return "Impossibile assegnare il ruolo target.";
    }
  }
  if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
    const staffRoleApplied = await member.roles
      .add(String(IDs.roles.Staff))
      .then(() => true)
      .catch(() => false);
    if (!staffRoleApplied) {
      const refreshedMember = await getGuildMemberCached(guild, String(userId), {
        preferFresh: true,
      }).catch(() => null);
      if (!refreshedMember?.roles?.cache?.has(String(IDs.roles.Staff))) {
        return "Ruolo Helper assegnato, ma non sono riuscito ad aggiungere il ruolo Staff.";
      }
    }
  }

  await completeCandidatePexAfterRole(guild, member, type, reason, sourceMessage, {
    decidedBy: String(actor?.id || actor || ""),
    decidedByName: String(actor?.displayName || actor?.username || actor?.globalName || ""),
  });
  return `Pex completato per <@${member.id}>.`;
}

export = { applyCandidatePex };
