const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { ZODIAC_ROLE_IDS } = require("./zodiacRoles");
const colorUnlocks = require("./personalityColorUnlocks");
const { PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL } = colorUnlocks;

const PERSONALITY_CATEGORY_ROLE_IDS = {
  pronouns: ["1442568997848743997", "1442568999043989565", "1442569000063074498", "1442569001367769210"],
  age: ["1442568993197265021", "1442568994581381170", "1442568995348807691", "1442568996774871194"],
  region: ["1442569021861007443", "1442569023303974922", "1442569024486506498", "1442569025790939167"],
  dm: ["1442569004215697438", "1442569005071077417", "1442569006543274126"],
  relationship: ["1442569028173299732", "1442569029263818906"],
  zodiac: ZODIAC_ROLE_IDS,
  mentions: [IDs.roles.ReviveChat, IDs.roles.ReviveVoc, IDs.roles.SerataFilm, IDs.roles.Partnership, IDs.roles.Events, IDs.roles.News, IDs.roles.Polls, IDs.roles.Bump, IDs.roles.Minigames, IDs.roles.Notturno, IDs.roles.Live].filter(Boolean),
  hobby: [IDs.roles.HobbyAnimeManga, IDs.roles.HobbyLettura, IDs.roles.HobbyScrittura, IDs.roles.HobbyFilmSerieTV, IDs.roles.HobbySport, IDs.roles.HobbyMusica, IDs.roles.HobbyGaming, IDs.roles.HobbyDisegno, IDs.roles.HobbyCucina, IDs.roles.HobbyFotografia].filter(Boolean),
  colors1: PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL,
  colors_plus: [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.orangeBlackPlus, IDs.roles.greenBlackPlus, IDs.roles.aquaBlackPlus].filter(Boolean),
};

const ALL_PERSONALITY_TRACKED_ROLE_IDS = [...new Set(Object.values(PERSONALITY_CATEGORY_ROLE_IDS).flat().map((x) => String(x || "").trim()).filter(Boolean))];
const PLUS_COLOR_ROLE_IDS = new Set(PERSONALITY_CATEGORY_ROLE_IDS.colors_plus.map(String));

function normalizeRoleIds(roleIds) {
  return [...new Set((Array.isArray(roleIds) ? roleIds : []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function isTrackedPersonalityRoleId(roleId) {
  return ALL_PERSONALITY_TRACKED_ROLE_IDS.includes(String(roleId || "").trim());
}

async function loadStoredPersonalityRoleIds(guildId, userId) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.personalityRoleIds profile.muteRoleSnapshot.roleIds")
    .lean()
    .catch(() => null);
  const panel = normalizeRoleIds(doc?.profile?.personalityRoleIds);
  const muteSnap = normalizeRoleIds(doc?.profile?.muteRoleSnapshot?.roleIds);
  return normalizeRoleIds([...panel, ...muteSnap.filter(isTrackedPersonalityRoleId)]);
}

async function persistPersonalityRoleDelta(guildId, userId, { added = [], removed = [] } = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const add = normalizeRoleIds(added).filter(isTrackedPersonalityRoleId);
  const rem = new Set(normalizeRoleIds(removed).filter(isTrackedPersonalityRoleId));
  if (!add.length && !rem.size) return;

  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.personalityRoleIds")
    .lean()
    .catch(() => null);
  const current = normalizeRoleIds(doc?.profile?.personalityRoleIds);
  const next = normalizeRoleIds(current.filter((id) => !rem.has(id)).concat(add));

  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "profile.personalityRoleIds": next } },
    { upsert: true },
  ).catch(() => null);
}

async function persistMuteRoleSnapshotToProfile(guildId, userId, roleIds) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const ids = normalizeRoleIds(roleIds);
  const personality = ids.filter(isTrackedPersonalityRoleId);
  const update = {
    "profile.muteRoleSnapshot.roleIds": ids,
    "profile.muteRoleSnapshot.at": new Date(),
  };
  if (personality.length) update["profile.personalityRoleIds"] = personality;
  await ActivityUserProfile.updateOne({ guildId: gid, userId: uid }, { $set: update }, { upsert: true }).catch(() => null);
}

async function filterRestorablePersonalityRoleIds(member, roleIds) {
  const guild = member?.guild;
  const me = guild?.members?.me;
  if (!guild || !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return [];
  const highest = Number(me.roles?.highest?.position || 0);
  const level = await colorUnlocks.fetchNumericProfileLevel(guild.id, member.id).catch(() => 0);
  const plusAllowed = await colorUnlocks.memberHasPlusColorFullEligibilityAsync(member).catch(() => false);
  const out = [];
  for (const raw of normalizeRoleIds(roleIds)) {
    if (PLUS_COLOR_ROLE_IDS.has(raw)) {
      if (!plusAllowed || !colorUnlocks.isAllowedColorValue(raw, member, level, plusAllowed)) continue;
    }
    let role = guild.roles.cache.get(raw);
    if (!role) role = await guild.roles.fetch(raw).catch(() => null);
    if (!role || role.managed || role.position >= highest) continue;
    out.push(raw);
  }
  return out;
}

async function restorePersistedPersonalityRoles(member, options = {}) {
  if (!member?.guild?.id || !member?.id) return { added: [], skipped: 0 };
  const reason = String(options.reason || "Recupero ruoli pannello post-mute");
  const stored = options.profileDoc
    ? normalizeRoleIds([
      ...(options.profileDoc?.profile?.personalityRoleIds || []),
      ...((options.profileDoc?.profile?.muteRoleSnapshot?.roleIds || []).filter(isTrackedPersonalityRoleId)),
    ])
    : await loadStoredPersonalityRoleIds(member.guild.id, member.id);
  if (!stored.length) return { added: [], skipped: 0 };

  const allowed = await filterRestorablePersonalityRoleIds(member, stored);
  const missing = allowed.filter((id) => !member.roles.cache.has(id));
  if (!missing.length) return { added: [], skipped: stored.length - allowed.length };

  await member.roles.add(missing, reason).catch((err) => {
    global.logger?.warn?.("[personalityRolePersistence] restore failed:", member.id, err?.message || err);
    throw err;
  });
  return { added: missing, skipped: stored.length - allowed.length };
}

module.exports = {
  PERSONALITY_MENTION_ROLE_IDS: PERSONALITY_CATEGORY_ROLE_IDS.mentions,
  PERSONALITY_HOBBY_ROLE_IDS: PERSONALITY_CATEGORY_ROLE_IDS.hobby,
  ALL_PERSONALITY_TRACKED_ROLE_IDS,
  isTrackedPersonalityRoleId,
  persistPersonalityRoleDelta,
  persistMuteRoleSnapshotToProfile,
  loadStoredPersonalityRoleIds,
  restorePersistedPersonalityRoles,
};