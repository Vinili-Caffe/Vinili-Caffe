const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL = [
  "1544842977384341694",
  "1544842979716374588",
  "1544842981536956502",
  "1544831002076254238",
  "1544831000268509246",
  "1544830998087475374",
  "1544830995990061076",
  "1544830992928219340",
  "1544830990806163542",
  "1544830982702628946",
  "1544830980265873448",
];
const EMOJI_COLOR_TIER = "<:VC_EXP:1482534670896730143>";
const BASE_PLUS_COLOR_ROLE_IDS_ORDERED = [
  IDs.roles.redPlus,
  IDs.roles.orangePlus,
  IDs.roles.yellowPlus,
  IDs.roles.greenPlus,
  IDs.roles.bluePlus,
  IDs.roles.purplePlus,
  IDs.roles.pinkPlus,
  IDs.roles.blackPlus,
  IDs.roles.grayPlus,
  IDs.roles.whitePlus,
  IDs.roles.brownPlus,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

function getLevelGatedPlusColorDefs() {
  return [
    { roleId: String(IDs.roles.orangeBlackPlus || "").trim(), minLevel: 125 },
    { roleId: String(IDs.roles.greenBlackPlus || "").trim(), minLevel: 150 },
    { roleId: String(IDs.roles.aquaBlackPlus || "").trim(), minLevel: 200 },
  ].filter((row?) => row.roleId);
}

function getPlusColorRoleIds() {
  return [...BASE_PLUS_COLOR_ROLE_IDS_ORDERED, ...getLevelGatedPlusColorDefs().map((d?) => d.roleId)].filter(Boolean);
}

function getTierExclusiveColorDefs() {
  return [
    { roleId: String(IDs.roles.colorUnlockLv10 || "").trim(), minLevel: 10 },
    { roleId: String(IDs.roles.colorUnlockLv20 || "").trim(), minLevel: 20 },
    { roleId: String(IDs.roles.colorUnlockLv30 || "").trim(), minLevel: 30 },
    { roleId: String(IDs.roles.colorUnlockLv50 || "").trim(), minLevel: 50 },
    { roleId: String(IDs.roles.colorUnlockLv70 || "").trim(), minLevel: 70 },
    { roleId: String(IDs.roles.colorUnlockLv100 || "").trim(), minLevel: 100 },
  ].filter((row?) => row.roleId);
}

function getAllPersonalityChatColorRoleIds() {
  const tier = getTierExclusiveColorDefs().map((r?) => r.roleId);
  return [...new Set([...getPlusColorRoleIds(), ...PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL, ...tier])].filter(Boolean);
}

async function fetchNumericProfileLevel(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.totals.exp.level")
    .lean()
    .catch(() => null);
  const lv = Number(doc?.profile?.totals?.exp?.level ?? 0);
  return Number.isFinite(lv) && lv > 0 ? Math.floor(lv) : 0;
}

function memberHasPlusColorEligibility(member?, numericLevel?) {
  if (!member?.roles?.cache) return false;
  const levelOk = Number(numericLevel) >= 50;
  if (levelOk) return true;
  const gateRoles = [
    IDs.roles.VIP,
    IDs.roles.VIPplus,
    IDs.roles.ServerBooster,
    IDs.roles.DoubleBooster,
    IDs.roles.Donator,
  ].filter(Boolean);
  if (gateRoles.some((rid?) => member.roles.cache.has(rid))) return true;
  const legacyLevelRoles = [IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Level100, IDs.roles.Level120, IDs.roles.Level150, IDs.roles.Level200].filter(Boolean);
  if (legacyLevelRoles.some((rid?) => member.roles.cache.has(rid))) return true;
  return false;
}

async function memberHasPlusColorFullEligibilityAsync(member?) {
  const guildId = member?.guild?.id;
  const userId = member?.id;
  const level = await fetchNumericProfileLevel(guildId, userId);
  if (memberHasPlusColorEligibility(member, level)) return true;
  if (!guildId || !userId) return false;
  const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService") as typeof import("../../Services/Community/weekWinnerGrantsService");
  const w2 = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const w3 = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  return Boolean(w2 || w3);
}

/** Solo i gradienti Plus: i "& Black" (livello 125/150/200) sono colori di livello, stanno in listUnlockedTierRoleIds. */
function listUnlockedPlusRoleIds(guild?, canPickPlus?, _numericLevel = 0) {
  if (!canPickPlus || !guild?.roles?.cache) return [];
  return BASE_PLUS_COLOR_ROLE_IDS_ORDERED.filter((rid?) => guild.roles.cache.has(rid));
}

function listUnlockedTierRoleIds(numericLevel?) {
  const lv = Number(numericLevel) || 0;
  const fromTier = getTierExclusiveColorDefs()
    .filter((row?) => lv >= row.minLevel && row.roleId)
    .map((row?) => row.roleId);
  const fromGated = getLevelGatedPlusColorDefs()
    .filter((row?) => lv >= row.minLevel && row.roleId)
    .map((row?) => row.roleId);
  return [...new Set([...fromTier, ...fromGated])];
}

function tierColorDefForRoleId(roleId?) {
  const id = String(roleId || "").trim();
  return (
    getTierExclusiveColorDefs().find((d?) => d.roleId === id) ||
    getLevelGatedPlusColorDefs().find((d?) => d.roleId === id) ||
    null
  );
}

function listUnlockedNaturalRoleIds() {
  return [...PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL];
}

function roleLabel(guild?, roleId?) {
  const r = guild?.roles?.cache?.get?.(roleId);
  const name = String(r?.name || "Colore").trim().slice(0, 80);
  return name;
}

function isAllowedColorValue(value?, member?, numericLevel?, canPickPlus?) {
  const v = String(value || "").trim();
  if (!v || v === "remove") return false;
  if (listUnlockedNaturalRoleIds().includes(v)) return true;
  if (listUnlockedPlusRoleIds(member.guild, canPickPlus, numericLevel).includes(v)) return true;
  if (listUnlockedTierRoleIds(numericLevel).includes(v)) return true;
  return false;
}

function buildProfileTierColorSelectOptionsWithRemove(guild?, numericLevel?) {
  const removeOpt = {
    label: "Rimuovi colore",
    value: "remove",
    description: "Rimuovi i colori esclusivi di livello",
    emoji: "<:vegax:1443934876440068179>",
  };
  const tierIds = listUnlockedTierRoleIds(numericLevel).filter((rid?) => guild?.roles?.cache?.has?.(rid));
  const opts = [removeOpt];
  for (const rid of tierIds) {
    const def = tierColorDefForRoleId(rid);
    opts.push({
      label: `Lv${def?.minLevel || "?"} · ${roleLabel(guild, rid)}`.slice(0, 100),
      value: rid,
      emoji: EMOJI_COLOR_TIER,
      description: `Da livello ${def?.minLevel || "?"}`,
    });
  }
  return opts.slice(0, 25);
}

export = {
  PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL,
  getAllPersonalityChatColorRoleIds,
  fetchNumericProfileLevel,
  memberHasPlusColorFullEligibilityAsync,
  listUnlockedPlusRoleIds,
  listUnlockedTierRoleIds,
  listUnlockedNaturalRoleIds,
  isAllowedColorValue,
  roleLabel,
  buildProfileTierColorSelectOptionsWithRemove,
};