"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const NEGATIVES_PER_STAFF_WARN = 3;
/** Testo salvato su `warnReasons` e mostrato nell'embed warn automatico (3 negative). */
const STAFF_WARN_THREE_NEGATIVES_REASON = "Warn assegnato per aver raggiunto le 3 valutazioni negative";
const STAFF_WARN_RESET_MONTHS = 6;
const STAFF_WARN_RESET_MS = STAFF_WARN_RESET_MONTHS * 30 * 24 * 60 * 60 * 1000;

const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_CO_OWNER = String(IDs.roles.CoFounder);
const ROLE_OWNER = String(IDs.roles.Founder || "");

const STAFF_ROLES_HIGH_TO_LOW = [
  ROLE_OWNER,
  ROLE_CO_OWNER,
  ROLE_ADMIN,
  ROLE_MODERATOR,
  ROLE_HELPER,
].filter(Boolean);

function getHighestStaffRoleId(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLES_HIGH_TO_LOW) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function resetStaffWarnsIfSixMonths(profileDoc) {
  const s = ensureStaff(profileDoc);
  if (!s) return false;
  const firstAt = s.firstWarnStaffAt;
  if (!firstAt || !(firstAt instanceof Date)) return false;
  const elapsed = Date.now() - firstAt.getTime();
  if (elapsed < STAFF_WARN_RESET_MS) return false;
  s.warnCount = 0;
  s.warnReasons = [];
  s.firstWarnStaffAt = null;
  return true;
}

async function addStaffWarnFromNegatives(guildId, userId, negativeCountAfterAdd, reason) {
  const profileDoc = await getOrCreateStaffDoc(guildId, userId);
  if (!profileDoc) return { added: false };
  const s = ensureStaff(profileDoc);

  const reset = resetStaffWarnsIfSixMonths(profileDoc);
  if (reset) await profileDoc.save().catch(() => null);

  if (negativeCountAfterAdd % NEGATIVES_PER_STAFF_WARN !== 0) return { added: false };

  s.warnCount = Math.max(0, Number(s.warnCount || 0)) + 1;
  if (!Array.isArray(s.warnReasons)) s.warnReasons = [];
  s.warnReasons.push(String(reason || "3 valutazioni negative").slice(0, 500));
  if (!s.firstWarnStaffAt) s.firstWarnStaffAt = new Date();
  profileDoc.markModified("staff");
  await profileDoc.save().catch(() => null);

  const warnCount = s.warnCount;
  return {
    added: true,
    warnCount,
    shouldAskDepex: warnCount === 2,
    shouldFullDepex: warnCount === 3,
    staffDoc: profileDoc,
  };
}

async function applyDepexOneLevel(guild, member, forcedLadderRoleId = null) {
  const forced = typeof forcedLadderRoleId === "string" && forcedLadderRoleId && member?.roles?.cache?.has?.(forcedLadderRoleId)
    ? forcedLadderRoleId
    : null;
  const roleId = forced || getHighestStaffRoleId(member);
  if (!roleId) return { ok: false, reason: "Nessun ruolo staff trovato." };

  if (ROLE_OWNER && roleId === ROLE_OWNER) {
    await member.roles.remove(ROLE_OWNER).catch(() => null);
    await member.roles.add(ROLE_CO_OWNER).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_CO_OWNER };
  }
  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_CO_OWNER).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_ADMIN).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_ADMIN };
  }
  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_ADMIN).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_MODERATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_MODERATOR };
  }
  if (roleId === ROLE_MODERATOR || roleId === ROLE_HELPER) {
    await member.roles.remove(roleId).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
    return { ok: true, roleRemoved: roleId, fullDepex: true, newRole: ROLE_MEMBER || "" };
  }
  return { ok: false, reason: "Ruolo non gestito per depex un livello." };
}

async function applyFullDepex(guild, member, currentRoleId) {
  const resocontoHandlers = require("../../Events/interaction/resocontoHandlers");
  const applyDepexSideEffects = resocontoHandlers?.applyDepexSideEffects;
  if (!currentRoleId) currentRoleId = getHighestStaffRoleId(member);
  if (!currentRoleId) return { ok: false, reason: "Nessun ruolo staff trovato." };
  const roleRemoved = await member.roles.remove(currentRoleId).then(() => true).catch(() => false);
  if (!roleRemoved) return { ok: false, reason: "Impossibile rimuovere il ruolo." };
  if (typeof applyDepexSideEffects !== "function") return { ok: false, reason: "applyDepexSideEffects non disponibile." };
  const memberAfterRemove = await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => member);
  const sideEffectsApplied = await applyDepexSideEffects(guild, memberAfterRemove, currentRoleId);
  if (!sideEffectsApplied) return { ok: false, reason: "Side-effect depex non completati." };
  return { ok: true, roleRemoved: currentRoleId };
}

async function runStaffWarnSixMonthReset(client) {
  const guildId = IDs.guilds?.main;
  if (!guildId) return;
  const now = Date.now();
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.firstWarnStaffAt": { $ne: null, $lte: new Date(now - STAFF_WARN_RESET_MS) } },
    { userId: 1, "staff.warnCount": 1, "staff.firstWarnStaffAt": 1 },
  ).lean();
  for (const doc of docs) {
    await ActivityUserProfile.updateOne(
      { guildId, userId: doc.userId },
      { $set: { "staff.warnCount": 0, "staff.warnReasons": [], "staff.firstWarnStaffAt": null } },
    ).catch(() => null);
  }
  if (docs.length > 0) {
    global.logger?.info?.(`[STAFF WARN] Reset ${docs.length} staff warn(s) (6 mesi dal primo).`);
  }
}

function startStaffWarnResetLoop(client) {
  runStaffWarnSixMonthReset(client).catch((err) => {
    global.logger?.error?.("[STAFF WARN] Reset 6 mesi fallito:", err);
  });
  const intervalMs = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    runStaffWarnSixMonthReset(client).catch(() => {});
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  NEGATIVES_PER_STAFF_WARN,
  STAFF_WARN_RESET_MS,
  STAFF_WARN_THREE_NEGATIVES_REASON,
  addStaffWarnFromNegatives,
  getHighestStaffRoleId,
  applyDepexOneLevel,
  applyFullDepex,
  runStaffWarnSixMonthReset,
  startStaffWarnResetLoop,
};