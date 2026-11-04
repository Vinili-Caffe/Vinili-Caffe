const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../../Config/ids") as typeof import("../../../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../../../shared/discord/interactionEntityCache") as typeof import("../../../../../shared/discord/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../../../Staff/utils/staffDocUtils") as typeof import("../../../../Staff/utils/staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("../../../../Staff/utils/staffPmUtils") as typeof import("../../../../Staff/utils/staffPmUtils");
const { applyDepexOneLevel, getHighestStaffRoleId } = require("../../../../Staff/services/staffWarnService") as typeof import("../../../../Staff/services/staffWarnService");
const { memberHasStaffRole } = require("../../../../Community/utils/staffListUtils") as typeof import("../../../../Community/utils/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../../../Community/utils/staffRoleEmoji") as typeof import("../../../../Community/utils/staffRoleEmoji");
const { clearStaffPendingPurgeAt } = require("../../../../Community/services/userLeaveBackupService") as typeof import("../../../../Community/services/userLeaveBackupService");
const { userAvatarUrlDynamic } = require("../../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../../shared/discord/guildDiscordIdentity");
const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const {
  memberHasResocontoButtonAccess,
} = require("../../../../Staff/utils/resocontoAccess") as typeof import("../../../../Staff/utils/resocontoAccess");
const { stripStafferAwardRoles } = require("../../../../Staff/utils/staffRoleHierarchy") as typeof import("../../../../Staff/utils/staffRoleHierarchy");
const { onResocontoOutcomeRecorded } = require("../../../../Staff/services/resocontoReviewerRewardService") as typeof import("../../../../Staff/services/resocontoReviewerRewardService");
const RESOCONTO_APPLY_PREFIX = "resoconto_apply";
const RESOCONTO_REJECT_PREFIX = "resoconto_reject";
const WEEKLY_LIMITS_POSITIVE_REASON = "Limiti settimanali completati.";
const WEEKLY_LIMITS_NEGATIVE_REASON = "Limiti settimanali non raggiunti.";
const STAFF_ACTIONS = new Set(["px", "dp", "vp", "vn", "nl", "batch"]);
const PM_ACTIONS = new Set(["dp", "rc", "nl"]);

function fireResocontoPexDepexNotif(guild?, actor?, targetUser?, kind?, oldRoleId?, newRoleId?, reason?, sourceHint?) {
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../../../../site/staff/siteStaffEventNotifications") as typeof import("../../../../site/staff/siteStaffEventNotifications");
    const actorUser = actor?.user || actor;
    void notifyStaffPexDepex({
      guild,
      kind,
      targetUserId: String(targetUser?.id || ""),
      targetName: memberDisplayName(null, targetUser, targetUser?.id),
      oldRoleId,
      newRoleId,
      reason,
      actorUserId: String(actorUser?.id || ""),
      actorName: memberDisplayName(actor?.member || actor, actorUser, actorUser?.id),
      sourceHint,
    }).catch(() => 0);
  } catch (_) {}
}

function fireResocontoOutcomeNotif(guild?, actor?, targetUserId?, actionKey?, reason?, messageId?) {
  try {
    const { notifyResocontoOutcome, memberDisplayName } = require("../../../../site/staff/siteStaffEventNotifications") as typeof import("../../../../site/staff/siteStaffEventNotifications");
    const actorUser = actor?.user || actor;
    void notifyResocontoOutcome({
      guild,
      staffUserId: String(targetUserId || ""),
      actionKey,
      reason,
      actorName: memberDisplayName(actor?.member || actor, actorUser, actorUser?.id),
      messageId,
    }).catch(() => 0);
  } catch (_) {}
}

const ROLE_UP = {
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.SeniorModerator),
  [String(IDs.roles.SeniorModerator)]: String(IDs.roles.Director),
  [String(IDs.roles.Director)]: String(IDs.roles.Admin),
  [String(IDs.roles.Admin)]: String(IDs.roles.Manager),
};
const ROLE_PARTNER_MANAGER = String(IDs.roles.PartnerManager);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_SENIOR_MODERATOR = String(IDs.roles.SeniorModerator);
const ROLE_DIRECTOR = String(IDs.roles.Director);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_MANAGER = String(IDs.roles.Manager || "");
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff || "");
const ROLE_CO_OWNER = "";
const ROLE_OWNER = String(IDs.roles.Founder);

function resolvePexDepexLogRoleAfterId(member?) {
  if (!member?.roles?.cache) return ROLE_MEMBER || "";
  if (!memberHasStaffRole(member)) return ROLE_MEMBER || "";
  const ladderHi = getHighestStaffRoleId(member);
  if (ladderHi) return ladderHi;
  if (ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER)) return ROLE_PARTNER_MANAGER;
  return ROLE_MEMBER || "";
}

function isModOrAboveRoleId(roleId?) {
  const normalized = String(roleId || "");
  const modOrAbove = [
    ROLE_MODERATOR,
    ROLE_SENIOR_MODERATOR,
    ROLE_DIRECTOR,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_CO_OWNER,
    ROLE_OWNER,
  ].filter(Boolean);
  return modOrAbove.includes(normalized);
}

function resolveAutoReasonForResocontoAction(payload?) {
  if (String(payload?.actionKey || "") === "vp" && String(payload?.kind || "") === "s") {
    return String(payload?.resocontoReason || "").trim() || WEEKLY_LIMITS_POSITIVE_REASON;
  }
  if (String(payload?.actionKey || "") === "vn" && String(payload?.kind || "") === "s") {
    return String(payload?.resocontoReason || "").trim() || WEEKLY_LIMITS_NEGATIVE_REASON;
  }
  if (String(payload?.actionKey || "") === "px" && String(payload?.kind || "") === "s") {
    const roleId = String(payload?.roleId || "");
    if (roleId === ROLE_HELPER) return "Prova superata";
  }
  if (String(payload?.actionKey || "") !== "dp") return "";
  if (String(payload?.kind || "") === "p") return "Limiti settimanali non raggiunti";
  const roleId = String(payload?.roleId || "");
  if (roleId === ROLE_PARTNER_MANAGER) return "Limiti settimanali non raggiunti";
  if (roleId === ROLE_HELPER) return "Prova non superata";
  return "";
}

/* tolta per sbaglio nel commit del 31/10 ma ancora usata da "applica" nei resoconti */
function shouldOpenReasonModalForResocontoApply(payload?) {
  if (!payload || payload.mode !== "apply") return false;
  if (payload.kind !== "s") return false;
  if (payload.actionKey === "px") {
    return resolveAutoReasonForResocontoAction(payload) === "";
  }
  if (["vp", "vn"].includes(payload.actionKey)) {
    return resolveAutoReasonForResocontoAction(payload) === "";
  }
  if (payload.actionKey !== "dp") return false;
  return isModOrAboveRoleId(payload.roleId);
}

async function hasRoleAfterRefresh(guild?, userId?, roleId?) {
  if (!roleId) return false;
  const freshMember = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
  return Boolean(freshMember?.roles?.cache?.has?.(String(roleId)));
}

async function ensureRoleAdded(guild?, member?, roleId?) {
  if (!roleId) return false;
  const roleApplied = await member.roles.add(roleId).then(() => true).catch(() => false);
  if (roleApplied) return true;
  return await hasRoleAfterRefresh(guild, member.id, roleId);
}

async function ensureRoleRemoved(guild?, member?, roleId?) {
  if (!roleId) return true;
  const roleRemoved = await member.roles.remove(roleId).then(() => true).catch(() => false);
  if (roleRemoved) return true;
  const stillHasRole = await hasRoleAfterRefresh(guild, member.id, roleId);
  return !stillHasRole;
}

async function applyPexSideEffects(guild?, member?, roleId?) {
  if (roleId === ROLE_HELPER) {
    return ensureRoleAdded(guild, member, ROLE_STAFF);
  }
  if (roleId === ROLE_MODERATOR) return ensureRoleRemoved(guild, member, ROLE_HELPER);
  if (roleId === ROLE_SENIOR_MODERATOR) return ensureRoleRemoved(guild, member, ROLE_MODERATOR);
  if (roleId === ROLE_DIRECTOR) {
    return ensureRoleRemoved(guild, member, ROLE_SENIOR_MODERATOR);
  }
  if (roleId === ROLE_ADMIN) {
    const modRemoved = await ensureRoleRemoved(guild, member, ROLE_DIRECTOR);
    const highStaffAdded = await ensureRoleAdded(guild, member, ROLE_HIGH_STAFF);
    return modRemoved && highStaffAdded;
  }
  if (roleId === ROLE_MANAGER) {
    const adminRemoved = await ensureRoleRemoved(guild, member, ROLE_ADMIN);
    const highStaffAdded = await ensureRoleAdded(guild, member, ROLE_HIGH_STAFF);
    return adminRemoved && highStaffAdded;
  }
  if (roleId === ROLE_CO_OWNER) return ensureRoleRemoved(guild, member, ROLE_ADMIN);
  if (roleId === ROLE_OWNER) {
    const managerRemoved = ROLE_MANAGER ? await ensureRoleRemoved(guild, member, ROLE_MANAGER) : true;
    const coOwnerRemoved = ROLE_CO_OWNER ? await ensureRoleRemoved(guild, member, ROLE_CO_OWNER) : true;
    return managerRemoved && coOwnerRemoved;
  }
  return true;
}

async function bumpCandidatureCooldownAfterStaffRemoval(userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return;
  try {
    const { bumpApplicationCooldownAfterStaffDepex } = require("../../../../site/staff/candidature/candidatureApplicationHandlers") as typeof import("../../../../site/staff/candidature/candidatureApplicationHandlers");
    if (typeof bumpApplicationCooldownAfterStaffDepex === "function") {
      await bumpApplicationCooldownAfterStaffDepex(uid);
    }
  } catch (_) {}
}

async function applyDepexSideEffects(guild?, member?, roleId?) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_HELPER || roleId === ROLE_MODERATOR || roleId === ROLE_SENIOR_MODERATOR) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    await stripStafferAwardRoles(member);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_DIRECTOR) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    await stripStafferAwardRoles(member);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_ADMIN || roleId === ROLE_MANAGER || roleId === ROLE_CO_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, roleId);
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    await stripStafferAwardRoles(member);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  if (roleId === ROLE_OWNER) {
    const roleRemoved = await ensureRoleRemoved(guild, member, ROLE_OWNER);
    const managerRemoved = ROLE_MANAGER ? await ensureRoleRemoved(guild, member, ROLE_MANAGER) : true;
    const coOwnerRemoved = ROLE_CO_OWNER ? await ensureRoleRemoved(guild, member, ROLE_CO_OWNER) : true;
    const staffRemoved = await ensureRoleRemoved(guild, member, ROLE_STAFF);
    const highStaffRemoved = await ensureRoleRemoved(guild, member, ROLE_HIGH_STAFF);
    await stripStafferAwardRoles(member);
    const memberAdded = ROLE_MEMBER ? await ensureRoleAdded(guild, member, ROLE_MEMBER) : true;
    const ok = roleRemoved && managerRemoved && coOwnerRemoved && staffRemoved && highStaffRemoved && memberAdded;
    if (ok && member?.id) await bumpCandidatureCooldownAfterStaffRemoval(member.id);
    return ok;
  }
  return true;
}

async function resolvePexDepexChannel(guild?) {
  const { resolveStaffPexDepexChannel } = require("../../../../Staff/utils/staffChannelUtils") as typeof import("../../../../Staff/utils/staffChannelUtils");
  return resolveStaffPexDepexChannel(guild);
}

async function sendPexDepexLog(guild?, type?, targetUser?, oldRoleId?, newRoleId?, reason?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../../../site/http/discordWorkflowUiGate") as typeof import("../../../../site/http/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;
  const channel = await resolvePexDepexChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const oldRole = guild.roles.cache.get(String(oldRoleId || ""));
  const newRole = guild.roles.cache.get(String(newRoleId || ""));
  const typeLabel = type === "pex" ? `**${E.success} PEX**` : `**${E.cancel} DEPEX**`;
  const actionEmoji = type === "pex"
    ? getStaffRoleEmojiByRoleId(newRoleId)
    : getStaffRoleEmojiByRoleId(oldRoleId);
  await channel
    .send({
      content: `${typeLabel} <@${targetUser.id}>
${actionEmoji} \`${oldRole?.name || oldRoleId}\` ${E.VC_Arrow} \`${newRole?.name || newRoleId || "Nessuno"}\`
${E.VC_reason} __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
}

export = {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
  WEEKLY_LIMITS_POSITIVE_REASON,
  WEEKLY_LIMITS_NEGATIVE_REASON,
  STAFF_ACTIONS,
  PM_ACTIONS,
  ROLE_UP,
  ROLE_PARTNER_MANAGER,
  ROLE_MEMBER,
  ROLE_STAFF,
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_HIGH_STAFF,
  ROLE_CO_OWNER,
  ROLE_OWNER,
  fireResocontoPexDepexNotif,
  fireResocontoOutcomeNotif,
  resolvePexDepexLogRoleAfterId,
  isModOrAboveRoleId,
  resolveAutoReasonForResocontoAction,
  shouldOpenReasonModalForResocontoApply,
  hasRoleAfterRefresh,
  ensureRoleAdded,
  ensureRoleRemoved,
  applyPexSideEffects,
  bumpCandidatureCooldownAfterStaffRemoval,
  applyDepexSideEffects,
  resolvePexDepexChannel,
  sendPexDepexLog,
};
