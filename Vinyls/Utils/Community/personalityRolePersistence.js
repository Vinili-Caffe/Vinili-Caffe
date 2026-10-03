const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { ZODIAC_ROLE_IDS } = require("./zodiacRoles");
const colorUnlocks = require("./personalityColorUnlocks");
const { PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL } = colorUnlocks;

const PERSONALITY_CATEGORY_ROLE_IDS = {
  pronouns: ["1544830743296081960", "1544830740624183336", "1544830738556256256", "1544830736434069559"],
  age: ["1544830751931899965", "1544830749268639744", "1544830746533957717", "1544830744914821181"],
  region: ["1544830651033976872", "1544830648131395604", "1544830644516036611", "1544830642616012813"],
  dm: ["1544830708340756621", "1544830706482413589", "1544830704477540393"],
  relationship: ["1544830640971579462", "1544830638983614524"],
  zodiac: ZODIAC_ROLE_IDS,
  mentions: [IDs.roles.ReviveChat, IDs.roles.ReviveVoc, IDs.roles.SerataFilm, IDs.roles.Partnership, IDs.roles.Events, IDs.roles.News, IDs.roles.Polls, IDs.roles.Bump, IDs.roles.Minigames, IDs.roles.Notturno, IDs.roles.Live, IDs.roles.Updates].filter(Boolean),
  hobby: [IDs.roles.HobbyAnimeManga, IDs.roles.HobbyLettura, IDs.roles.HobbyScrittura, IDs.roles.HobbyFilmSerieTV, IDs.roles.HobbySport, IDs.roles.HobbyMusica, IDs.roles.HobbyGaming, IDs.roles.HobbyDisegno, IDs.roles.HobbyCucina, IDs.roles.HobbyFotografia].filter(Boolean),
  gaming: [
    IDs.roles.GameMinecraft,
    IDs.roles.GameLeagueOfLegends,
    IDs.roles.GameFortnite,
    IDs.roles.GameRoblox,
    IDs.roles.GameGrandTheftAuto,
    IDs.roles.GameCallOfDuty,
    IDs.roles.GameRocketLeague,
    IDs.roles.GameAmongUs,
    IDs.roles.GameOsu,
    IDs.roles.GameTheSims,
    IDs.roles.GameValorant,
    IDs.roles.GameFifa,
    IDs.roles.GameBrawlStars,
  ].filter(Boolean),
  colors1: PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL,
  colors_plus: [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.brownPlus, IDs.roles.orangeBlackPlus, IDs.roles.greenBlackPlus, IDs.roles.aquaBlackPlus].filter(Boolean),
};

const ALL_PERSONALITY_TRACKED_ROLE_IDS = [...new Set(Object.values(PERSONALITY_CATEGORY_ROLE_IDS).flat().map((x) => String(x || "").trim()).filter(Boolean))];
const REJOIN_EXCLUDED_PERSONALITY_ROLE_IDS = new Set(
  [
    ...PERSONALITY_CATEGORY_ROLE_IDS.age,
    ...PERSONALITY_CATEGORY_ROLE_IDS.mentions,
    ...colorUnlocks.getAllPersonalityChatColorRoleIds(),
  ].map((id) => String(id || "").trim()).filter(Boolean),
);
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
  scheduleFullStateAfterPersonality(gid, uid);
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
  scheduleFullStateAfterPersonality(gid, uid);
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

function scheduleFullStateAfterPersonality(guildId, userId) {
  try {
    const { schedulePersistUserFullState } = require("../../Services/Community/userFullStatePersistenceService");
    schedulePersistUserFullState(guildId, userId, { reason: "personality_roles" });
  } catch {
    /* ignore */
  }
}

module.exports = {
  PERSONALITY_CATEGORY_ROLE_IDS,
  PERSONALITY_MENTION_ROLE_IDS: PERSONALITY_CATEGORY_ROLE_IDS.mentions,
  PERSONALITY_HOBBY_ROLE_IDS: PERSONALITY_CATEGORY_ROLE_IDS.hobby,
  PERSONALITY_GAMING_ROLE_IDS: PERSONALITY_CATEGORY_ROLE_IDS.gaming,
  ALL_PERSONALITY_TRACKED_ROLE_IDS,
  REJOIN_EXCLUDED_PERSONALITY_ROLE_IDS,
  isTrackedPersonalityRoleId,
  persistPersonalityRoleDelta,
  persistMuteRoleSnapshotToProfile,
  loadStoredPersonalityRoleIds,
  restorePersistedPersonalityRoles,
};