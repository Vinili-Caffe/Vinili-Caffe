const mongoose = require("mongoose");
const { ChannelType, PermissionsBitField } = require("discord.js");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { sponsorMainLeave } = require("../../Utils/Community/activityUserProfilePaths");
const { isSponsorGuildVerify } = require("../../Utils/Interaction/verifyUtils");
const IDs = require("../../Utils/Config/ids");
const { getEffectiveJoinedAt } = require("./effectiveMemberJoinService");
const VOTE_ROLE_ID = IDs.roles.Voter;
const CHECK_INTERVAL_MS = 60 * 1000;
const MAIN_GUILD_ID = IDs.guilds.main;
const ROLE_STAGE_1 = IDs.roles.NuovoUtente;
const ROLE_STAGE_2 = IDs.roles.Veterano;
const ROLE_STAGE_3 = IDs.roles.OG;
/** Tenure server principale: basta il ruolo Member (verifica join/captcha). I ruoli selfie Verified* non entrano qui. */
const VERIFIED_ROLE_IDS = [IDs.roles.Member,].filter(Boolean);
const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_TENURE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SPONSOR_VERIFY_NICKNAME = ".gg/viniliecaffe";
/** Da `max(join, verifiedAt)`: dopo STAGE_1_DAYS → Veterano (toglie NuovoUtente); dopo STAGE_2_DAYS → OG. */
const STAGE_1_DAYS = 30;
const STAGE_2_DAYS = 365;
const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", };
const INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;
const guildTimers = new Map();
let numberingLoopHandle = null;
let voteCleanupLoopHandle = null;
let verificationTenureLoopHandle = null;
let sponsorKickLoopHandle = null;
let sponsorNickSweepLoopHandle = null;
const SPONSOR_KICK_REASON = "<a:VC_Alert:1482706673176150077> Non sei più nel server principale da 24 ore. Rientra nel server principale per accedere di nuovo agli server sponsor.";
const SPONSOR_KICK_INTERVAL_MS = 15 * 60 * 1000;
const SPONSOR_GUILD_NICK_SWEEP_INTERVAL_MS = (() => {
  const n = Number(process.env.SPONSOR_GUILD_NICK_SWEEP_INTERVAL_MS);
  if (Number.isFinite(n) && n >= 60_000) return n;
  return 6 * 60 * 60 * 1000;
})();
const SPONSOR_GUILD_NICK_SWEEP_STAGGER_MS = (() => {
  const n = Number(process.env.SPONSOR_GUILD_NICK_SWEEP_STAGGER_MS);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 5000);
  return 200;
})();
const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const VOTE_ROLE_EXPIRES_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.expiresAt`;
const VOTE_ROLE_GRANTED_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.grantedAt`;

async function upsertVoteRole(guildId, userId, expiresAt) {
  if (!guildId || !userId || !expiresAt) return null;
  return ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: { [VOTE_ROLE_EXPIRES_AT_PATH]: expiresAt, [VOTE_ROLE_GRANTED_AT_PATH]: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function removeExpiredVoteRoles(client) {
  const now = new Date();
  const expired = await ActivityUserProfile.find({ [VOTE_ROLE_EXPIRES_AT_PATH]: { $lte: now } })
    .select(`guildId userId ${VOTE_ROLE_EXPIRES_AT_PATH}`)
    .lean();
  if (!expired.length) return;

  for (const item of expired) {
    const guild = client.guilds.cache.get(item.guildId) || (await client.guilds.fetch(item.guildId).catch(() => null));
    if (!guild) {
      await ActivityUserProfile.updateOne(
        { guildId: item.guildId, userId: item.userId },
        { $set: { [VOTE_ROLE_EXPIRES_AT_PATH]: null } },
      );
      continue;
    }
    const member = guild.members.cache.get(item.userId) || (await guild.members.fetch(item.userId).catch(() => null));
    if (member?.roles?.cache?.has(VOTE_ROLE_ID)) {
      await member.roles.remove(VOTE_ROLE_ID).catch(() => { });
    }
    await ActivityUserProfile.updateOne(
      { guildId: item.guildId, userId: item.userId },
      { $set: { [VOTE_ROLE_EXPIRES_AT_PATH]: null } },
    );
  }
}

function startVoteRoleCleanupLoop(client) {
  if (!client) return;
  if (voteCleanupLoopHandle) return voteCleanupLoopHandle;
  removeExpiredVoteRoles(client).catch((err) => global.logger?.warn?.("[VOTE ROLE] Recovery cleanup on start failed:", err?.message || err));
  voteCleanupLoopHandle = setInterval(() => {
    removeExpiredVoteRoles(client).catch(() => { });
  }, CHECK_INTERVAL_MS);
  voteCleanupLoopHandle.unref?.();
  return voteCleanupLoopHandle;
}

async function upsertVerifiedMember(guildId, userId, verifiedAt = new Date()) {
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
 * Server TAG sponsor: ruolo verificato da config + nickname convenzione, senza flusso verifica Discord.
 * @param {import("discord.js").GuildMember} member
 */
async function ensureSponsorVerificatoForMember(member) {
  if (!member?.guild || member.user?.bot) return;
  const guildId = String(member.guild.id || "");
  if (!isSponsorGuildVerify(guildId)) return;
  const sponsorVerifyRoleId =
    IDs.verificatoRoleIds?.[guildId] ?? IDs.verificatoRoleIds?.[member.guild?.id];
  if (!sponsorVerifyRoleId) {
    global.logger?.warn?.("[SPONSOR AUTO] Guild sponsor senza verificatoRoleIds in config:", guildId);
    return;
  }
  const me = member.guild?.members?.me || (await member.guild?.members?.fetchMe?.().catch(() => null));
  const canManageRoles = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles));
  const sponsorVerifyRole = await getGuildRoleCached(member.guild, sponsorVerifyRoleId);
  const canReachSponsorRole = Boolean(
    sponsorVerifyRole && me && sponsorVerifyRole.position < me.roles.highest.position,
  );
  if (canManageRoles && canReachSponsorRole && !member.roles.cache.has(sponsorVerifyRoleId)) {
    await addRolesAndGetMember(member.guild, member.id, [sponsorVerifyRoleId]);
  }
  const m =
    (await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)) || member;
  if (String(m.nickname || "") === SPONSOR_VERIFY_NICKNAME) return;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageNicknames)) return;
  await m.setNickname(SPONSOR_VERIFY_NICKNAME).catch(() => {});
}

/** Chiamata da guildMemberAdd: assegna verificato sponsor all’ingresso. */
async function applySponsorGuildAutoVerificato(member) {
  await ensureSponsorVerificatoForMember(member);
}

async function applyTenureForMember(member, record) {
  if (!member || !record) return;
  if (mongoose.connection?.readyState !== 1) return;
  const guildId = String(member.guild?.id || "");
  const hasVerifiedRole = VERIFIED_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
  const me = member.guild?.members?.me || (await member.guild?.members?.fetchMe?.().catch(() => null));
  const canManageRoles = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles));
  if (isSponsorGuildVerify(guildId)) {
    await ensureSponsorVerificatoForMember(member);
    return;
  }
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
  const stage1At = new Date(baseTenureMs + STAGE_1_DAYS * DAY_MS,);
  const stage2At = new Date(baseTenureMs + STAGE_2_DAYS * DAY_MS,);

  const has1 = member.roles.cache.has(ROLE_STAGE_1);
  const has2 = member.roles.cache.has(ROLE_STAGE_2);
  const has3 = member.roles.cache.has(ROLE_STAGE_3);

  if (now >= stage2At) {
    if (!has3 || has1 || has2) {
      if (canManageRoles) {
        await member.roles.remove([ROLE_STAGE_1, ROLE_STAGE_2].filter(Boolean)).catch(() => { });
        const refreshedMember = ROLE_STAGE_3
          ? (await addRolesAndGetMember(member.guild, member.id, [ROLE_STAGE_3])) || member
          : member;
        if ((ROLE_STAGE_1 && refreshedMember.roles.cache.has(ROLE_STAGE_1)) || (ROLE_STAGE_2 && refreshedMember.roles.cache.has(ROLE_STAGE_2)) || (ROLE_STAGE_3 && !refreshedMember.roles.cache.has(ROLE_STAGE_3))) return;
      }
    }
    if (stageValue !== 3) {
      await ActivityUserProfile.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { "profile.verificationTenure.stage": 3 } },
      );
    }
    return;
  }

  if (now >= stage1At) {
    if (!has2 || has1) {
      if (canManageRoles) {
        await member.roles.remove([ROLE_STAGE_1].filter(Boolean)).catch(() => { });
        const refreshedMember = ROLE_STAGE_2
          ? (await addRolesAndGetMember(member.guild, member.id, [ROLE_STAGE_2])) || member
          : member;
        if ((ROLE_STAGE_1 && refreshedMember.roles.cache.has(ROLE_STAGE_1)) || (ROLE_STAGE_2 && !refreshedMember.roles.cache.has(ROLE_STAGE_2))) return;
      }
    }
    if (stageValue !== 2) {
      await ActivityUserProfile.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { "profile.verificationTenure.stage": 2 } },
      );
    }
    return;
  }

  if (!has1) {
    if (canManageRoles && ROLE_STAGE_1) {
      const refreshedMember = (await addRolesAndGetMember(member.guild, member.id, [ROLE_STAGE_1])) || member;
      if (!refreshedMember.roles.cache.has(ROLE_STAGE_1)) {
        global.logger?.warn?.(
          "[VERIFY TENURE] NuovoUtente non assegnato dopo tentativo:",
          guildId,
          member.id,
        );
      }
    }
  }
}

async function runTenureSweep(client) {
  const docs = await ActivityUserProfile.find({ "profile.verificationTenure.verifiedAt": { $ne: null } })
    .select("guildId userId profile.verificationTenure")
    .lean()
    .catch(() => []);
  if (!docs.length) return;
  for (const doc of docs) {
    const guild = await getClientGuildCached(client, doc.guildId);
    if (!guild) continue;
    const member = await getGuildMemberCached(guild, doc.userId);
    if (!member) continue;
    await applyTenureForMember(member, doc);
  }
}

function startVerificationTenureLoop(client) {
  if (verificationTenureLoopHandle) return verificationTenureLoopHandle;
  verificationTenureLoopHandle = setInterval(
    () => {
      runTenureSweep(client).catch((error) => {
        global.logger.error("[VERIFY TENURE] Sweep failed:", error);
      });
    },
    VERIFICATION_TENURE_SWEEP_INTERVAL_MS,
  );
  verificationTenureLoopHandle.unref?.();
  runTenureSweep(client).catch((error) => {
    global.logger.error("[VERIFY TENURE] Recovery sweep on start failed:", error);
  });
  return verificationTenureLoopHandle;
}

async function backfillVerificationTenure(client) {
  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    await guild.members.fetch().catch(() => null);
    const targetMembers = String(guild.id) === String(MAIN_GUILD_ID || "")
      ? guild.members.cache.filter((m) => !m.user?.bot && VERIFIED_ROLE_IDS.some((roleId) => m.roles.cache.has(roleId)))
      : guild.members.cache.filter((m) => !m.user?.bot && VERIFIED_ROLE_IDS.some((roleId) => m.roles.cache.has(roleId)));

    for (const member of targetMembers.values()) {
      const verifiedAt = member.joinedAt || new Date();
      await ActivityUserProfile.findOneAndUpdate(
        { guildId: guild.id, userId: member.id },
        {
          $setOnInsert: {
            guildId: guild.id,
            userId: member.id,
            "profile.verificationTenure.verifiedAt": verifiedAt,
            "profile.verificationTenure.stage": 1,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).catch(() => null);
      await ActivityUserProfile.updateOne(
        {
          guildId: guild.id,
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
        guildId: guild.id,
        userId: member.id,
      }).catch(() => null);
      if (!record) continue;
      await applyTenureForMember(member, record);
    }
  }
}

function getCategorySettings(client) {
  const cfg = client?.config?.categoryNumbering || {};
  return {
    enabled: cfg.enabled !== false,
    debounceMs: Math.max(300, Number(cfg.debounceMs || 1200)),
    intervalMs: Math.max(60 * 1000, Number(cfg.intervalMs || 10 * 60 * 1000)),
    minDigits: Math.max(1, Number(cfg.minDigits || 2)),
    separator: typeof cfg.separator === "string" ? cfg.separator : " ",
  };
}

function toSuperscriptNumber(value, minDigits) {
  const normalized = Math.max(1, Number(value) || 1).toString().padStart(minDigits, "0");
  return normalized
    .split("")
    .map((digit) => SUPERSCRIPT_MAP[digit] || digit)
    .join("");
}

function replaceNumberPrefixOnly(name, nextNumber, separator) {
  const value = String(name || "");
  if (INDEX_PREFIX_RE.test(value)) {
    return value.replace(INDEX_PREFIX_RE, nextNumber);
  }
  return `${nextNumber}${separator}${value}`;
}

function isTicketsCategoryName(name) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

async function renumberGuildCategories(guild, options) {
  if (!guild) return;
  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels))
    return;

  const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id)).map((channel) => channel);

  let nonTicketIndex = 1;
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    if (!category?.manageable) continue;
    if (isTicketsCategoryName(category.name)) continue;

    const nextNumber = toSuperscriptNumber(nonTicketIndex++, options.minDigits);
    const expectedName = replaceNumberPrefixOnly(category.name, nextNumber, options.separator,);
    if (category.name === expectedName) continue;
    await category.setName(expectedName).catch(() => { });
  }
}

function queueCategoryRenumber(client, guildId, delayMs = null) {
  if (!client || !guildId) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;

  const pending = guildTimers.get(guildId);
  if (pending) clearTimeout(pending);

  const timeout = setTimeout(async () => {
    guildTimers.delete(guildId);
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) return;
    await guild.channels.fetch().catch(() => { });
    await renumberGuildCategories(guild, options);
  }, delayMs == null ? options.debounceMs : delayMs);
  timeout.unref?.();
  guildTimers.set(guildId, timeout);
}

async function runAllGuilds(client) {
  if (!client) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  for (const guild of client.guilds.cache.values()) {
    await guild.channels.fetch().catch(() => { });
    await renumberGuildCategories(guild, options);
  }
}

function startCategoryNumberingLoop(client) {
  if (numberingLoopHandle) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  numberingLoopHandle = setInterval(() => {
    runAllGuilds(client).catch(() => { });
  }, options.intervalMs);
  numberingLoopHandle.unref?.();
  runAllGuilds(client).catch((err) => {
    global.logger?.warn?.("[CATEGORY NUMBERING] Recovery run on start failed:", err?.message || err);
  });
}

async function runSponsorKickAfter24h(client) {
  if (!client) return;
  const mainGuildId = IDs.guilds?.main;
  const sponsorGuildIds = Array.isArray(IDs.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : [];
  if (!mainGuildId || !sponsorGuildIds.length) return;

  const now = new Date();
  const toProcess = await ActivityUserProfile.find({
    guildId: ACTIVITY_MAIN_GUILD_ID,
    [sponsorMainLeave("kickAt")]: { $lte: now },
  })
    .select(`userId ${sponsorMainLeave()}`)
    .lean()
    .catch(() => []);
  if (!toProcess.length) return;

  const mainGuild = await getClientGuildCached(client, mainGuildId);
  if (!mainGuild) return;

  for (const doc of toProcess) {
    const userId = doc?.userId;
    if (!userId) {
      await ActivityUserProfile.deleteOne({
        guildId: ACTIVITY_MAIN_GUILD_ID,
        _id: doc._id,
      }).catch(() => { });
      continue;
    }
    const inMain = await getGuildMemberCached(mainGuild, userId);
    if (inMain) {
      await ActivityUserProfile.updateOne(
        { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
        { $unset: { [sponsorMainLeave()]: "" } },
      ).catch(() => { });
      continue;
    }
    for (const gid of sponsorGuildIds) {
      const guild = await getClientGuildCached(client, gid);
      if (!guild) continue;
      const member = await getGuildMemberCached(guild, userId);
      if (member && guild.members.me?.permissions?.has?.(PermissionsBitField.Flags.KickMembers)) {
        await member.kick(SPONSOR_KICK_REASON).catch((err) => {
          global.logger?.error?.("[SPONSOR KICK] kick failed", gid, userId, err?.message || err);
        });
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      { $unset: { [sponsorMainLeave()]: "" } },
    ).catch(() => { });
  }
}

function startSponsorKickLoop(client) {
  if (!client) return;
  if (sponsorKickLoopHandle) return sponsorKickLoopHandle;
  sponsorKickLoopHandle = setInterval(
    () => {
      runSponsorKickAfter24h(client).catch((err) => {
        global.logger.error("[SPONSOR KICK] loop failed:", err);
      });
    },
    SPONSOR_KICK_INTERVAL_MS,
  );
  sponsorKickLoopHandle.unref?.();
  runSponsorKickAfter24h(client).catch(() => { });
  return sponsorKickLoopHandle;
}

/**
 * Tutti i membri (non bot) nei guild sponsor in config: ruolo verificato se mancante + nickname promozionale.
 * Chiamata periodica e dopo avvio (stagger tra richieste per rate limit).
 * @param {import("discord.js").Client} client
 */
async function runSponsorGuildNicknameSweep(client) {
  if (!client) return;
  const sponsorGuildIds = Array.isArray(IDs.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : [];
  for (const gidRaw of sponsorGuildIds) {
    const gId = String(gidRaw || "");
    if (!isSponsorGuildVerify(gId)) continue;
    const guild = await getClientGuildCached(client, gId).catch(() => null);
    if (!guild) continue;
    await guild.members.fetch().catch(() => null);
    for (const m of guild.members.cache.values()) {
      if (m.user?.bot) continue;
      await ensureSponsorVerificatoForMember(m).catch(() => {});
      if (SPONSOR_GUILD_NICK_SWEEP_STAGGER_MS > 0) {
        await new Promise((r) => setTimeout(r, SPONSOR_GUILD_NICK_SWEEP_STAGGER_MS));
      }
    }
  }
}

function startSponsorGuildNicknameSweepLoop(client) {
  if (!client) return;
  if (sponsorNickSweepLoopHandle) return sponsorNickSweepLoopHandle;
  sponsorNickSweepLoopHandle = setInterval(() => {
    runSponsorGuildNicknameSweep(client).catch((err) => {
      global.logger?.warn?.("[SPONSOR NICK SWEEP] loop failed:", err?.message || err);
    });
  }, SPONSOR_GUILD_NICK_SWEEP_INTERVAL_MS);
  sponsorNickSweepLoopHandle.unref?.();
  const initialMs = Number(process.env.SPONSOR_GUILD_NICK_SWEEP_INITIAL_DELAY_MS);
  const delay = Number.isFinite(initialMs) && initialMs >= 0 ? initialMs : 3 * 60 * 1000;
  setTimeout(() => {
    runSponsorGuildNicknameSweep(client).catch((err) => {
      global.logger?.warn?.("[SPONSOR NICK SWEEP] initial run failed:", err?.message || err);
    });
  }, delay);
  return sponsorNickSweepLoopHandle;
}

module.exports = {
  upsertVoteRole,
  removeExpiredVoteRoles,
  startVoteRoleCleanupLoop,
  upsertVerifiedMember,
  applyTenureForMember,
  applySponsorGuildAutoVerificato,
  ensureSponsorVerificatoForMember,
  startVerificationTenureLoop,
  backfillVerificationTenure,
  queueCategoryRenumber,
  runAllGuilds,
  startCategoryNumberingLoop,
  runSponsorKickAfter24h,
  startSponsorKickLoop,
  runSponsorGuildNicknameSweep,
  startSponsorGuildNicknameSweepLoop,
};