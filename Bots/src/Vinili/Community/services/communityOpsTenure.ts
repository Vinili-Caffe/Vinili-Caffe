/** Community ops: tenure verifica (NuovoUtente / Veterano / OG) e sweep. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { getEffectiveJoinedAt } = require("./effectiveMemberJoinService") as typeof import("./effectiveMemberJoinService");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");

const MAIN_GUILD_ID = IDs.guilds.main;
const ROLE_STAGE_1 = IDs.roles.NuovoUtente;
const ROLE_STAGE_2 = IDs.roles.Veterano;
const ROLE_STAGE_3 = IDs.roles.OG;
const VERIFIED_ROLE_IDS = [IDs.roles.Member,].filter(Boolean);
const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_TENURE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STAGE_1_DAYS = 30;
const STAGE_2_DAYS = 365;
let verificationTenureLoopHandle = null;

async function upsertVerifiedMember(guildId?, userId?, verifiedAt = new Date()) {
  if (mongoose.connection?.readyState !== 1) return null;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: {
        guildId,
        userId,
        "profile.verificationTenure.verifiedAt": verifiedAt,
        "profile.verificationTenure.stage": 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await ActivityUserProfile.updateOne(
    {
      guildId,
      userId,
      $or: [
        { "profile.verificationTenure.verifiedAt": { $exists: false } },
        { "profile.verificationTenure.verifiedAt": null },
      ],
    },
    {
      $set: {
        "profile.verificationTenure.verifiedAt": verifiedAt,
        "profile.verificationTenure.stage": 1,
      },
    },
  ).catch(() => null);
  return ActivityUserProfile.findOne({ guildId, userId });
}

/** Add target tenure role first; only then strip the others (avoids empty tenure on rate-limit). */
async function syncTenureDiscordRoles(member?, keepRoleId?) {
  const keep = String(keepRoleId || "").trim();
  const all = [ROLE_STAGE_1, ROLE_STAGE_2, ROLE_STAGE_3].map((id?) => String(id || "").trim()).filter(Boolean);
  if (!member || !keep || !all.includes(keep)) return null;

  let current = member;
  if (!current.roles.cache.has(keep)) {
    current = (await addRolesAndGetMember(current.guild, current.id, [keep])) || current;
    if (!current.roles.cache.has(keep)) {
      global.logger?.warn?.(
        "[VERIFY TENURE] keep-role add failed (no strip):",
        String(current.guild?.id || ""),
        current.id,
        keep,
      );
      return null;
    }
  }

  const extras = all.filter((id?) => id !== keep && current.roles.cache.has(id));
  if (extras.length) {
    await current.roles.remove(extras).catch(() => {});
    current =
      (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => current)) ||
      current;
  }
  return current;
}

async function applyTenureForMember(member?, record?) {
  if (!member || !record) return;
  /* anzianità gestita dalla dashboard (Annunci automatici → Anzianità): il sistema classico si ferma */
  try {
    const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
    const cfg: any = await A.getConfig(String(member.guild?.id || "")).catch(() => null);
    if (cfg?.tenure?.enabled && cfg.tenure.rules.some((r: any) => r.enabled && r.roleId)) return;
  } catch (_) {}
  if (mongoose.connection?.readyState !== 1) return;
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && member.roles?.cache?.has?.(mutedRoleId)) return;
  const timeoutUntil =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil
      ? new Date(member.communicationDisabledUntil).getTime()
      : 0);
  if (Number.isFinite(timeoutUntil) && timeoutUntil > Date.now()) return;
  const guildId = String(member.guild?.id || "");
  const hasVerifiedRole = VERIFIED_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
  const me = member.guild?.members?.me || (await member.guild?.members?.fetchMe?.().catch(() => null));
  const canManageRoles = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles));
  if (!guildId || String(guildId) !== String(MAIN_GUILD_ID || "")) return;
  if (!hasVerifiedRole) return;
  const now = new Date();
  const effectiveJoined = await getEffectiveJoinedAt(member);
  const joinedMs = Number(effectiveJoined?.getTime?.() || member.joinedTimestamp || member.joinedAt?.getTime?.() || 0);
  const verifiedAtValue = record?.profile?.verificationTenure?.verifiedAt || record?.verifiedAt;
  const stageValue = Number(record?.profile?.verificationTenure?.stage ?? record?.stage ?? 1);
  const verifiedMs = Number(new Date(verifiedAtValue).getTime() || 0);
  const joinedOk = Number.isFinite(joinedMs) && joinedMs > 0;
  const verifiedOk = Number.isFinite(verifiedMs) && verifiedMs > 0;
  let baseTenureMs = 0;
  if (joinedOk && verifiedOk) baseTenureMs = Math.max(joinedMs, verifiedMs);
  else if (joinedOk) baseTenureMs = joinedMs;
  else if (verifiedOk) baseTenureMs = verifiedMs;
  if (!Number.isFinite(baseTenureMs) || baseTenureMs <= 0) return;
  const stage1At = new Date(baseTenureMs + STAGE_1_DAYS * DAY_MS);
  const stage2At = new Date(baseTenureMs + STAGE_2_DAYS * DAY_MS);

  const has1 = Boolean(ROLE_STAGE_1 && member.roles.cache.has(ROLE_STAGE_1));
  const has2 = Boolean(ROLE_STAGE_2 && member.roles.cache.has(ROLE_STAGE_2));
  const has3 = Boolean(ROLE_STAGE_3 && member.roles.cache.has(ROLE_STAGE_3));

  let desiredRoleId = ROLE_STAGE_1;
  let desiredStage = 1;
  if (now >= stage2At) {
    desiredRoleId = ROLE_STAGE_3;
    desiredStage = 3;
  } else if (now >= stage1At) {
    desiredRoleId = ROLE_STAGE_2;
    desiredStage = 2;
  }

  const alreadyOk =
    (desiredStage === 3 && has3 && !has1 && !has2) ||
    (desiredStage === 2 && has2 && !has1 && !has3) ||
    (desiredStage === 1 && has1 && !has2 && !has3);

  if (!alreadyOk && canManageRoles && desiredRoleId) {
    const synced = await syncTenureDiscordRoles(member, desiredRoleId);
    if (!synced) {
      // Keep Discord as-is; do not advance DB stage when role sync failed.
      return;
    }
  } else if (!alreadyOk && !canManageRoles) {
    return;
  }

  if (stageValue !== desiredStage) {
    await ActivityUserProfile.updateOne(
      { guildId: record.guildId, userId: record.userId },
      { $set: { "profile.verificationTenure.stage": desiredStage } },
    );
  }
}

async function runTenureSweep(client?) {
  const docs = await ActivityUserProfile.find({ "profile.verificationTenure.verifiedAt": { $ne: null } })
    .select("guildId userId profile.verificationTenure")
    .lean()
    .catch(() => []);
  if (!docs.length) return;
  let i = 0;
  for (const doc of docs) {
    i += 1;
    const guild = await getClientGuildCached(client, doc.guildId);
    if (!guild) continue;
    const member = await getGuildMemberCached(guild, doc.userId);
    if (!member) continue;
    try {
      await applyTenureForMember(member, doc);
    } catch (error) {
      global.logger?.warn?.("[VERIFY TENURE] apply failed:", doc.userId, error?.message || error);
    }
    // Soft pacing so recovery-on-start does not mass rate-limit role adds.
    if (i % 8 === 0) {
      await new Promise((r?) => setTimeout(r, 350));
    }
  }
}

function startVerificationTenureLoop(client?) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (verificationTenureLoopHandle) return verificationTenureLoopHandle;
  verificationTenureLoopHandle = setInterval(
    () => {
      runTenureSweep(client).catch((error?) => {
        global.logger.error("[VERIFY TENURE] Sweep failed:", error);
      });
    },
    VERIFICATION_TENURE_SWEEP_INTERVAL_MS,
  );
  verificationTenureLoopHandle.unref?.();
  runTenureSweep(client).catch((error?) => {
    global.logger.error("[VERIFY TENURE] Recovery sweep on start failed:", error);
  });
  return verificationTenureLoopHandle;
}

async function backfillVerificationTenure(client?) {
  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    await (guild as any).members.fetch().catch(() => null);
    const targetMembers = String((guild as any).id) === String(MAIN_GUILD_ID || "")
      ? (guild as any).members.cache.filter((m?) => !m.user?.bot && VERIFIED_ROLE_IDS.some((roleId?) => m.roles.cache.has(roleId)))
      : (guild as any).members.cache.filter((m?) => !m.user?.bot && VERIFIED_ROLE_IDS.some((roleId?) => m.roles.cache.has(roleId)));

    for (const member of targetMembers.values()) {
      const verifiedAt = member.joinedAt || new Date();
      await ActivityUserProfile.findOneAndUpdate(
        { guildId: (guild as any).id, userId: member.id },
        {
          $setOnInsert: {
            guildId: (guild as any).id,
            userId: member.id,
            "profile.verificationTenure.verifiedAt": verifiedAt,
            "profile.verificationTenure.stage": 1,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).catch(() => null);
      await ActivityUserProfile.updateOne(
        {
          guildId: (guild as any).id,
          userId: member.id,
          $or: [
            { "profile.verificationTenure.verifiedAt": { $exists: false } },
            { "profile.verificationTenure.verifiedAt": null },
          ],
        },
        {
          $set: {
            "profile.verificationTenure.verifiedAt": verifiedAt,
            "profile.verificationTenure.stage": 1,
          },
        },
      ).catch(() => null);
      const record = await ActivityUserProfile.findOne({
        guildId: (guild as any).id,
        userId: member.id,
      }).catch(() => null);
      if (!record) continue;
      await applyTenureForMember(member, record);
    }
  }
}

export = {
  upsertVerifiedMember,
  applyTenureForMember,
  startVerificationTenureLoop,
  backfillVerificationTenure,
};
