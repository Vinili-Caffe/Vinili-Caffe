"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getHighestStaffLadderRoleId, STAFF_LADDER_KEYS_HIGH_TO_LOW } = require("../../Utils/Staff/staffRoleHierarchy");

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
const ROLE_SENIOR_MODERATOR = String(IDs.roles.SeniorModerator);
const ROLE_DIRECTOR = String(IDs.roles.Director);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_MANAGER = String(IDs.roles.Manager || "");
const ROLE_OWNER = String(IDs.roles.Founder || "");

const STAFF_ROLES_HIGH_TO_LOW = require("../../Utils/Staff/staffRoleHierarchy").staffLadderRoleIds(STAFF_LADDER_KEYS_HIGH_TO_LOW);

function getHighestStaffRoleId(member) {
  return getHighestStaffLadderRoleId(member, STAFF_LADDER_KEYS_HIGH_TO_LOW);
}

async function bumpCandidatureCooldownAfterDepexOneLevel(userId) {
  const id = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(id)) return;
  try {
    const { bumpApplicationCooldownAfterStaffDepex } = require("../../Events/interaction/candidatureApplicationHandlers");
    if (typeof bumpApplicationCooldownAfterStaffDepex === "function") {
      await bumpApplicationCooldownAfterStaffDepex(id);
    }
  } catch (_) {}
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
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { added: false };
  const profileDoc = await getOrCreateStaffDoc(gid, uid);
  if (!profileDoc) return { added: false };
  const s = ensureStaff(profileDoc);

  const reset = resetStaffWarnsIfSixMonths(profileDoc);
  if (reset) await profileDoc.save().catch(() => null);

  const negatives = Math.max(0, Math.floor(Number(negativeCountAfterAdd) || 0));
  if (negatives % NEGATIVES_PER_STAFF_WARN !== 0) return { added: false };

  const warnReason = String(reason || STAFF_WARN_THREE_NEGATIVES_REASON).slice(0, 500);
  const now = new Date();
  const update = {
    $setOnInsert: { guildId: gid, userId: uid },
    $inc: { "staff.warnCount": 1 },
    $push: { "staff.warnReasons": warnReason },
  };
  if (!s.firstWarnStaffAt) update.$set = { "staff.firstWarnStaffAt": now };
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true, projection: { staff: 1 } },
  ).catch(() => null);
  if (!updated?.staff) return { added: false };

  const warnCount = Math.max(0, Math.floor(Number(updated.staff.warnCount) || 0));
  return {
    added: true,
    warnCount,
    shouldAskDepex: warnCount === 2,
    shouldFullDepex: warnCount === 3,
    staffDoc: updated,
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
    if (ROLE_MANAGER) await member.roles.add(ROLE_MANAGER).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_MANAGER || ROLE_ADMIN };
  }
  if (ROLE_MANAGER && roleId === ROLE_MANAGER) {
    await member.roles.remove([ROLE_MANAGER, ROLE_HIGH_STAFF].filter(Boolean)).catch(() => null);
    await member.roles.add([ROLE_ADMIN, ROLE_STAFF].filter(Boolean)).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_ADMIN };
  }
  if (roleId === ROLE_ADMIN) {
    await member.roles.remove([ROLE_ADMIN, ROLE_HIGH_STAFF].filter(Boolean)).catch(() => null);
    await member.roles.add([ROLE_DIRECTOR, ROLE_STAFF].filter(Boolean)).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_DIRECTOR };
  }
  if (roleId === ROLE_DIRECTOR) {
    await member.roles.remove(ROLE_DIRECTOR).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_SENIOR_MODERATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_SENIOR_MODERATOR };
  }
  if (roleId === ROLE_SENIOR_MODERATOR) {
    await member.roles.remove(ROLE_SENIOR_MODERATOR).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_MODERATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_MODERATOR };
  }
  if (roleId === ROLE_MODERATOR || roleId === ROLE_HELPER) {
    await member.roles.remove(roleId).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
    await bumpCandidatureCooldownAfterDepexOneLevel(member.id);
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