const mongoose = require("mongoose");
const { ChannelType, PermissionsBitField } = require("discord.js");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { sponsorMainLeave } = require("../../Utils/Community/activityUserProfilePaths");
const { isSponsorGuildVerify } = require("../../Utils/Interaction/verifyUtils");
const IDs = require("../../Utils/Config/ids");
const { resolveVoteRoleIdForGuild } = require("../../Utils/Community/resolveVoteRoleId");
const { getEffectiveJoinedAt } = require("./effectiveMemberJoinService");
const VOTE_ROLE_ID = IDs.roles.Voter;
const CHECK_INTERVAL_MS = 60 * 1000;
const MAIN_GUILD_ID = IDs.guilds.main;
const ROLE_STAGE_1 = IDs.roles.NuovoUtente;
const ROLE_STAGE_2 = IDs.roles.Veterano;
const ROLE_STAGE_3 = IDs.roles.OG;
const VERIFIED_ROLE_IDS = [IDs.roles.Member,].filter(Boolean);
const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_TENURE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SPONSOR_VERIFY_NICKNAME = ".gg/viniliecaffe";
const STAGE_1_DAYS = 30;
const STAGE_2_DAYS = 365;
const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", };
const INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const guildTimers = new Map();
const guildRenumberInflight = new Map();
const guildRenumberPending = new Set();
const categoryNumberingBotRenames = new Map();
const categoryRenameBackoffUntil = new Map();
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
    const resolvedVoteRoleId = await resolveVoteRoleIdForGuild(guild).catch(() => "");
    const roleIdToRemove = resolvedVoteRoleId || VOTE_ROLE_ID;
    if (member?.roles?.cache?.has(roleIdToRemove)) {
      await member.roles.remove(roleIdToRemove).catch(() => { });
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

async function applySponsorGuildAutoVerificato(member) {
  await ensureSponsorVerificatoForMember(member);
}

/** Add target tenure role first; only then strip the others (avoids empty tenure on rate-limit). */
async function syncTenureDiscordRoles(member, keepRoleId) {
  const keep = String(keepRoleId || "").trim();
  const all = [ROLE_STAGE_1, ROLE_STAGE_2, ROLE_STAGE_3].map((id) => String(id || "").trim()).filter(Boolean);
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

  const extras = all.filter((id) => id !== keep && current.roles.cache.has(id));
  if (extras.length) {
    await current.roles.remove(extras).catch(() => {});
    current =
      (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => current)) ||
      current;
  }
  return current;
}

async function applyTenureForMember(member, record) {
  if (!member || !record) return;
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

async function runTenureSweep(client) {
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
      await new Promise((r) => setTimeout(r, 350));
    }
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

function isCategoryNumberingGuild(guildId) {
  const mainId = String(MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  return Boolean(mainId) && String(guildId || "").trim() === mainId;
}

function getCategorySettings(client) {
  const cfg = client?.config?.categoryNumbering || {};
  const channelCategoryIds = Array.isArray(cfg.channelCategoryIds)
    ? cfg.channelCategoryIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const fallbackCategoryId = String(IDs.categories?.categoryPublics || "").trim();
  const invisibleSpaceRaw = typeof cfg.invisibleSpace === "string" ? cfg.invisibleSpace : "\u3000";
  const invisibleSpace = invisibleSpaceRaw || "\u3000";
  return {
    enabled: cfg.enabled !== false,
    debounceMs: Math.max(300, Number(cfg.debounceMs || 1200)),
    intervalMs: Math.max(60 * 1000, Number(cfg.intervalMs || 10 * 60 * 1000)),
    minDigits: Math.max(1, Number(cfg.minDigits || 2)),
    separator: typeof cfg.separator === "string" ? cfg.separator : " ",
    /* categoryCenterPad3: pad minimo — evita text-overflow "..." di Discord in sidebar */
    centerWithInvisibleSpaces: cfg.centerWithInvisibleSpaces !== false,
    centerInnerSlots: Math.max(4, Math.min(20, Number(cfg.centerInnerSlots || 9))),
    centerSidePad: Math.max(0, Math.min(4, Number(cfg.centerSidePad ?? 1))),
    invisibleSpace,
    channelCategoryIds: channelCategoryIds.length
      ? channelCategoryIds
      : fallbackCategoryId
        ? [fallbackCategoryId]
        : [],
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

/* categoryCenterPad3: ideographic pad corto; frame = label più lunga → niente "..." Discord */
const CATEGORY_DOT = "・";
const CATEGORY_INVISIBLE_CHARS_RE = /[\u3000\u3164\u2800\u115F\u1160\u200B\u200C\u200D\uFEFF]/g;

function extractCoreCategoryLabel(name) {
  let s = String(name || "");
  s = s.replace(INDEX_PREFIX_RE, "");
  s = s.replace(CATEGORY_INVISIBLE_CHARS_RE, " ");
  s = s.replace(/^[・·•‧.\s]+/, "").replace(/[・·•‧.\s]+$/, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function buildCenteredCategoryBody(label, options = {}) {
  const core = extractCoreCategoryLabel(label) || String(label || "").trim() || "CATEGORY";
  const padChar = String(options.invisibleSpace || "\u3000").slice(0, 1) || "\u3000";
  const sidePad = Math.max(0, Math.min(4, Number(options.centerSidePad ?? 1)));
  const minFrame = Math.max(4, Math.min(20, Number(options.centerInnerSlots) || 9));
  const coreLen = Array.from(core).length;
  const frameWidth = Math.max(coreLen, Number(options.centerFrameWidth) || minFrame);
  /* pad corto: stesso frame, niente overflow "..." in channel list */
  const extra = Math.max(0, frameWidth - coreLen);
  const left = sidePad + Math.floor(extra / 2);
  const right = sidePad + (extra - Math.floor(extra / 2));
  return `${CATEGORY_DOT}${padChar.repeat(left)}${core}${padChar.repeat(right)}${CATEGORY_DOT}`;
}

function buildNumberedCenteredCategoryName(nextNumber, currentName, options = {}) {
  const core = extractCoreCategoryLabel(currentName);
  if (!core) {
    return replaceNumberPrefixOnly(currentName, nextNumber, options.separator || " ");
  }
  return `${nextNumber}${buildCenteredCategoryBody(core, options)}`.slice(0, 100);
}

function replaceNumberSuffixOnly(name, nextNumber) {
  const value = String(name || "");
  if (INDEX_SUFFIX_RE.test(value)) {
    return value.replace(INDEX_SUFFIX_RE, nextNumber);
  }
  return `${value}${nextNumber}`;
}

const PUBLIC_VOICE_SEPARATOR_NAME = "〝";
const PUBLIC_VOICE_NUMBERING_GROUPS = ["Lounge", "Duo", "Trio", "Quad", "Penta", "Hexa", "Setta", "Octa", "Squad"];
function getPublicVoiceHubChannelIdSet() {
  return new Set(
    (Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
}
const PUBLIC_VOICE_DECORATIVE_PREFIX = "༄";
const VOICE_RENAME_GAP_MS = 1500;
const CATEGORY_RENAME_GAP_MS = 2500;
const CATEGORY_RENAME_BACKOFF_MS = 10 * 60 * 1000;

function buildPublicVoiceSeparatorChannelIds() {
  const ids = new Set();
  const channels = IDs?.channels || {};
  for (const [key, value] of Object.entries(channels)) {
    if (!/^separator/i.test(String(key || ""))) continue;
    const id = String(value || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

const PUBLIC_VOICE_SEPARATOR_CHANNEL_IDS = buildPublicVoiceSeparatorChannelIds();

function stripPublicVoiceNumberingMarks(name) {
  return String(name || "")
    .replace(INDEX_PREFIX_RE, "")
    .replace(INDEX_SUFFIX_RE, "")
    .replace(/^[0-9]{1,3}\s*/, "")
    .trim();
}

function looksLikeCorruptedPublicVoiceSeparatorName(stripped) {
  const value = String(stripped || "").trim();
  if (!value) return false;
  if (value === PUBLIC_VOICE_SEPARATOR_NAME) return true;
  if (value === PUBLIC_VOICE_DECORATIVE_PREFIX) return true;
  if (value === '"' || value === "\u201d" || value === "\u201c") return true;
  if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+$/.test(value)) return true;
  if (
    value.startsWith(PUBLIC_VOICE_DECORATIVE_PREFIX) &&
    !/(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)/i.test(value) &&
    !/[\p{Extended_Pictographic}]/u.test(value.slice(PUBLIC_VOICE_DECORATIVE_PREFIX.length))
  ) {
    return true;
  }
  return false;
}

function isPublicVoiceNumberingSeparator(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  const channelId = String(channel.id || "");
  if (PUBLIC_VOICE_SEPARATOR_CHANNEL_IDS.has(channelId)) return true;
  const raw = String(channel.name || "").trim();
  const stripped = stripPublicVoiceNumberingMarks(raw);
  if (looksLikeCorruptedPublicVoiceSeparatorName(stripped)) return true;
  if (raw === PUBLIC_VOICE_SEPARATOR_NAME || raw === "〝") return true;
  if (raw.includes("🔒") && !resolvePublicVoiceNumberingGroup(channel)) return true;
  return false;
}

function resolvePublicVoiceNumberingGroup(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return "";
  const name = String(channel.name || "");
  if (/\bLounge\b/i.test(name)) return "Lounge";
  if (/\bDuo\b/i.test(name)) return "Duo";
  if (/\bTrio\b/i.test(name)) return "Trio";
  if (/\bQuad\b/i.test(name)) return "Quad";
  if (/\bPenta\b/i.test(name)) return "Penta";
  if (/\bHexa\b/i.test(name)) return "Hexa";
  if (/\bSetta\b/i.test(name)) return "Setta";
  if (/\bOcta\b/i.test(name)) return "Octa";
  if (/\bSquad\b/i.test(name)) return "Squad";
  return "";
}

function isPublicVoiceNumberingTarget(channel) {
  if (getPublicVoiceHubChannelIdSet().has(String(channel?.id || ""))) return false;
  return Boolean(resolvePublicVoiceNumberingGroup(channel));
}

function markCategoryNumberingBotRename(channelId, ttlMs = 10_000) {
  const id = String(channelId || "");
  if (!id) return;
  categoryNumberingBotRenames.set(id, Date.now() + Math.max(1000, Number(ttlMs || 0)));
}

function isCategoryNumberingBotRename(channelId) {
  const id = String(channelId || "");
  if (!id) return false;
  const expiresAt = categoryNumberingBotRenames.get(id);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    categoryNumberingBotRenames.delete(id);
    return false;
  }
  return true;
}

function buildPublicVoiceNumberedName(channelName, nextNumber) {
  const base = stripPublicVoiceNumberingMarks(channelName);
  return `${base}${nextNumber}`;
}

function readDiscordRetryAfterMs(err) {
  const raw = err?.rawError?.retry_after ?? err?.retryAfter ?? err?.retry_after;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n * 1000) : 0;
}

function memberHasManageChannels(me) {
  if (!me) return false;
  try {
    return Boolean(me.permissions?.has(PermissionsBitField.Flags.ManageChannels));
  } catch {
    return false;
  }
}

async function resolveGuildMembersMe(guild) {
  if (!guild?.members) return null;
  let me = guild.members.me;
  if (!me && typeof guild.members.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me?.id) return me;
  if (memberHasManageChannels(me)) return me;
  return guild.members.fetch(me.id, { force: true }).catch(() => me);
}

function guildHasManageableVoiceInCategories(guild, categoryIds) {
  const ids = new Set((categoryIds || []).map((id) => String(id || "")).filter(Boolean));
  if (!ids.size || !guild?.channels?.cache) return false;
  return guild.channels.cache.some((channel) => {
    if (!ids.has(String(channel.parentId || ""))) return false;
    if (channel.type !== ChannelType.GuildVoice) return false;
    return Boolean(channel.manageable);
  });
}

async function guildCanRenumberChannels(guild, categoryIds) {
  const me = await resolveGuildMembersMe(guild);
  if (memberHasManageChannels(me)) return true;
  return guildHasManageableVoiceInCategories(guild, categoryIds);
}

function pauseMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameChannelNameForNumbering(channel, expectedName, context = "") {
  if (!channel?.setName || !expectedName || channel.name === expectedName) return true;
  const channelId = String(channel.id || "");
  const backoffUntil = categoryRenameBackoffUntil.get(channelId) || 0;
  if (backoffUntil > Date.now()) return false;

  markCategoryNumberingBotRename(channel.id);
  const gapAfterSuccessMs = context === "category" ? CATEGORY_RENAME_GAP_MS : VOICE_RENAME_GAP_MS;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ok = await channel.setName(expectedName).then(() => true).catch((err) => {
      const retryAfterMs = readDiscordRetryAfterMs(err);
      if (retryAfterMs > 0 && attempt < 3) return retryAfterMs;
      categoryRenameBackoffUntil.set(channelId, Date.now() + CATEGORY_RENAME_BACKOFF_MS);
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] rename failed:",
        channel.id,
        channel.name,
        "->",
        expectedName,
        context,
        err?.code ?? err?.status ?? "",
        err?.message || err,
      );
      return false;
    });
    if (ok === true) {
      categoryRenameBackoffUntil.delete(channelId);
      await pauseMs(gapAfterSuccessMs);
      return true;
    }
    if (typeof ok === "number") {
      await pauseMs(ok + 500);
      continue;
    }
    return false;
  }
  return false;
}

async function renameVoiceChannelWithGap(channel, expectedName, context = "") {
  if (!channel?.manageable || !expectedName || channel.name === expectedName) {
    if (channel && expectedName && channel.name !== expectedName && !channel.manageable) {
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] channel not manageable:",
        channel.id,
        channel.name,
        "->",
        expectedName,
        context,
      );
    }
    return false;
  }
  return renameChannelNameForNumbering(channel, expectedName, context);
}

async function normalizePublicVoiceSeparatorName(channel) {
  if (!channel?.manageable || !isPublicVoiceNumberingSeparator(channel)) return;
  const raw = String(channel.name || "").trim();
  const stripped = stripPublicVoiceNumberingMarks(raw);
  if (/(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)/i.test(stripped)) return;
  if (raw === PUBLIC_VOICE_SEPARATOR_NAME) return;
  await renameVoiceChannelWithGap(channel, PUBLIC_VOICE_SEPARATOR_NAME, "separator");
}

async function applyPublicVoiceSegmentNumbers(segment, options) {
  let index = 1;
  let pending = 0;
  const segmentList = Array.isArray(segment) ? segment : [...segment.values()];
  if (!segmentList.length) return pending;
  for (const channel of segmentList) {
    if (!channel || !isPublicVoiceNumberingTarget(channel)) continue;
    const nextNumber = toSuperscriptNumber(index++, options.minDigits);
    const expectedName = buildPublicVoiceNumberedName(channel.name, nextNumber);
    if (channel.name === expectedName) continue;
    if (!channel.manageable) {
      pending += 1;
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] segment channel not manageable:",
        channel.id,
        channel.name,
        "->",
        expectedName,
      );
      continue;
    }
    const ok = await renameVoiceChannelWithGap(channel, expectedName, "segment");
    if (!ok) pending += 1;
  }
  return pending;
}

async function renumberCategoryVoiceChannels(guild, categoryId, options) {
  if (!guild || !categoryId) return 0;

  const channels = guild.channels.cache
    .filter((channel) => String(channel.parentId || "") === String(categoryId))
    .sort((a, b) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));

  for (const channel of channels.values()) {
    if (isPublicVoiceNumberingSeparator(channel)) {
      await normalizePublicVoiceSeparatorName(channel);
    }
  }

  let pending = 0;
  for (const group of PUBLIC_VOICE_NUMBERING_GROUPS) {
    const segment = [...channels.values()]
      .filter((channel) => resolvePublicVoiceNumberingGroup(channel) === group)
      .sort((a, b) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));
    if (segment.length <= 0) continue;
    pending += await applyPublicVoiceSegmentNumbers(segment, options);
  }
  return pending;
}

function isTicketsCategoryName(name) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

function stripCategoryIndexPrefix(name) {
  return String(name || "").replace(INDEX_PREFIX_RE, "").replace(/^\s+/, "");
}

function ticketsCategoryCoreLabel(name) {
  return String(name || "")
    .replace(INDEX_PREFIX_RE, "")
    .replace(/\s*[•·]\s*\d+\s*$/, "")
    .replace(/[・·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveRestoredTicketsCategoryName(name) {
  const {
    TICKETS_CATEGORY_NAME,
    TICKETS_OVERFLOW_SEPARATOR,
  } = require("../../Utils/Ticket/ticketCategoryUtils");
  const raw = String(name || "");
  if (!isTicketsCategoryName(raw)) return null;
  if (ticketsCategoryCoreLabel(raw) !== "tickets") return null;

  if (raw === TICKETS_CATEGORY_NAME) return null;
  if (raw.startsWith(`${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}`)) return null;

  const overflowTail = raw.match(/[•·]\s*(\d+)\s*$/);
  const overflowIdx = overflowTail ? Number(overflowTail[1]) : NaN;
  if (Number.isFinite(overflowIdx) && overflowIdx >= 2) {
    return `${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}${overflowIdx}`;
  }
  return TICKETS_CATEGORY_NAME;
}

function shouldSkipCategoryNumbering(category) {
  if (!category) return true;
    if (isTicketsCategoryName(category.name)) return true;
  return false;
}

async function renumberGuildCategoryNames(guild, options) {
  const categories = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))
    .map((channel) => channel);

  let maxCoreLen = 0;
  for (const category of categories) {
    if (!category || shouldSkipCategoryNumbering(category)) continue;
    const core = extractCoreCategoryLabel(category.name);
    if (!core) continue;
    maxCoreLen = Math.max(maxCoreLen, Array.from(core).length);
  }
  const centerOpts = {
    ...options,
    centerFrameWidth: Math.max(maxCoreLen, Number(options.centerInnerSlots) || 10),
  };

  let nonTicketIndex = 1;
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    if (!category?.manageable) continue;
    if (shouldSkipCategoryNumbering(category)) {
      const restored = resolveRestoredTicketsCategoryName(category.name);
      if (restored && restored !== category.name) {
        await renameChannelNameForNumbering(category, restored, "category");
      }
      continue;
    }

    const nextNumber = toSuperscriptNumber(nonTicketIndex++, options.minDigits);
    let expectedName;
    if (options.centerWithInvisibleSpaces !== false) {
      expectedName = buildNumberedCenteredCategoryName(nextNumber, category.name, centerOpts);
    } else {
      expectedName = replaceNumberPrefixOnly(category.name, nextNumber, options.separator);
    }
    if (category.name === expectedName) continue;
    await renameChannelNameForNumbering(category, expectedName, "category");
  }
}

async function renumberGuildCategories(guild, options, client = null) {
  if (!guild) return { pending: 0 };
  const guildId = String(guild.id || "");
  if (!guildId) return { pending: 0 };
    if (!isCategoryNumberingGuild(guildId)) return { pending: 0 };
  if (guildRenumberInflight.has(guildId)) {
    guildRenumberPending.add(guildId);
    return { pending: 0, skipped: true };
  }

  const job = (async () => {
    const channelCategoryIds = options.channelCategoryIds || [];
    if (!channelCategoryIds.length) return { pending: 0 };

    let pending = 0;
    await renumberGuildCategoryNames(guild, options);
    await pauseMs(CATEGORY_RENAME_GAP_MS);
    for (const categoryId of channelCategoryIds) {
      pending += await renumberCategoryVoiceChannels(guild, categoryId, options);
    }
    if (pending > 0) {
      global.logger?.info?.(
        "[CATEGORY NUMBERING] voice renumber pending:",
        guild.id,
        pending,
      );
    }
    const mainGuildId = String(IDs?.guilds?.main || "").trim();
    if (mainGuildId && String(guild.id) === mainGuildId) {
      const {
        listCustomPrivateCategories,
        syncCustomPrivateCategoryLayout,
      } = require("../../Utils/Community/customPrivateCategoryUtils");
      for (const cat of listCustomPrivateCategories(guild)) {
        await syncCustomPrivateCategoryLayout(guild, cat).catch(() => null);
      }
    }
    return { pending };
  })();

  guildRenumberInflight.set(guildId, job);
  try {
    return await job;
  } finally {
    guildRenumberInflight.delete(guildId);
    if (guildRenumberPending.has(guildId)) {
      guildRenumberPending.delete(guildId);
      if (client) queueCategoryRenumber(client, guildId, 5000);
    }
  }
}

function queueCategoryRenumber(client, guildId, delayMs = null) {
  if (!client || !guildId) return;
  if (!isCategoryNumberingGuild(guildId)) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;

  const pending = guildTimers.get(guildId);
  if (pending) clearTimeout(pending);

  const timeout = setTimeout(async () => {
    guildTimers.delete(guildId);
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) return;
    await guild.channels.fetch().catch(() => { });
    await resolveGuildMembersMe(guild).catch(() => null);
    let result = { pending: 0 };
    try {
      result = await renumberGuildCategories(guild, options, client);
    } catch (err) {
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] debounced renumber failed:",
        guildId,
        err?.message || err,
      );
    }
    if (Number(result?.pending || 0) > 0) {
      queueCategoryRenumber(client, guildId, Math.max(options.debounceMs, 15_000));
    }
  }, delayMs == null ? options.debounceMs : delayMs);
  timeout.unref?.();
  guildTimers.set(guildId, timeout);
}

async function runAllGuilds(client) {
  if (!client) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  const mainGuildId = String(MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  if (!mainGuildId) return;
  const guild = await getClientGuildCached(client, mainGuildId);
  if (!guild) return;
  await guild.channels.fetch().catch(() => { });
  await resolveGuildMembersMe(guild).catch(() => null);
  let result = { pending: 0 };
  try {
    result = await renumberGuildCategories(guild, options, client);
  } catch (err) {
    global.logger?.warn?.(
      "[CATEGORY NUMBERING] guild renumber failed:",
      guild.id,
      err?.message || err,
    );
  }
  if (Number(result?.pending || 0) > 0) {
    queueCategoryRenumber(client, guild.id, Math.max(options.debounceMs, 15_000));
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
  isCategoryNumberingBotRename,
  getCategorySettings,
  extractCoreCategoryLabel,
  buildNumberedCenteredCategoryName,
  runSponsorKickAfter24h,
  startSponsorKickLoop,
  runSponsorGuildNicknameSweep,
  startSponsorGuildNicknameSweepLoop,
};