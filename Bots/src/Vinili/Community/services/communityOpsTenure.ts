/** Community ops: data di verifica dei membri e ruolo d'anzianità (soglie dalla dashboard). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");

const MAIN_GUILD_ID = IDs.guilds.main;
const VERIFIED_ROLE_IDS = [IDs.roles.Member,].filter(Boolean);

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

/**
 * Ruolo d'anzianità giusto per un membro (dopo un mute, rientrando, quando completa la verifica).
 * Le soglie e i ruoli sono quelli della dashboard (Annunci automatici → Anzianità): qui restano solo
 * i controlli del principale (niente ruoli a chi è mutato o in timeout).
 */
async function applyTenureForMember(member?, _record?) {
  if (!member?.guild) return;
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && member.roles?.cache?.has?.(mutedRoleId)) return;
  const timeoutUntil =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil ? new Date(member.communicationDisabledUntil).getTime() : 0);
  if (Number.isFinite(timeoutUntil) && timeoutUntil > Date.now()) return;
  const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
  await A.reapplyTenureForMember(member);
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
  backfillVerificationTenure,
};
