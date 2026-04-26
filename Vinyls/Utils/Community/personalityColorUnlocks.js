const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

/** Colori “classici” del pannello ruoli (stesso ordine di `personality_colors_1`). */
const PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL = [
  "1442568956832645212",
  "1442568967045648412",
  "1442568969528541225",
  "1442568976944201828",
  "1442568977896439960",
  "1442568980626673685",
  "1442568983898357954",
  "1442568985278156971",
  "1442568987887276133",
  "1442568989866725468",
  "1442568991150309578",
];

/** Soglia livello (profilo exp) per ogni colore classico, in ordine con `PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL`. */
const NATURAL_COLOR_MIN_LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function getPlusColorRoleIds() {
  return [
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
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

function getTierExclusiveColorDefs() {
  return [
    { roleId: String(IDs.roles.colorUnlockLv10 || "").trim(), minLevel: 10 },
    { roleId: String(IDs.roles.colorUnlockLv20 || "").trim(), minLevel: 20 },
    { roleId: String(IDs.roles.colorUnlockLv30 || "").trim(), minLevel: 30 },
    { roleId: String(IDs.roles.colorUnlockLv50 || "").trim(), minLevel: 50 },
    { roleId: String(IDs.roles.colorUnlockLv70 || "").trim(), minLevel: 70 },
    { roleId: String(IDs.roles.colorUnlockLv100 || "").trim(), minLevel: 100 },
  ].filter((row) => row.roleId);
}

function getAllPersonalityChatColorRoleIds() {
  const tier = getTierExclusiveColorDefs().map((r) => r.roleId);
  return [...new Set([...getPlusColorRoleIds(), ...PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL, ...tier])].filter(Boolean);
}

async function fetchNumericProfileLevel(guildId, userId) {
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

function memberHasPlusColorEligibility(member, numericLevel) {
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
  if (gateRoles.some((rid) => member.roles.cache.has(rid))) return true;
  const legacyLevelRoles = [IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Level100].filter(Boolean);
  if (legacyLevelRoles.some((rid) => member.roles.cache.has(rid))) return true;
  return false;
}

async function memberHasPlusColorFullEligibilityAsync(member) {
  const guildId = member?.guild?.id;
  const userId = member?.id;
  const level = await fetchNumericProfileLevel(guildId, userId);
  if (memberHasPlusColorEligibility(member, level)) return true;
  if (!guildId || !userId) return false;
  const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService");
  const w2 = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const w3 = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  return Boolean(w2 || w3);
}

function listUnlockedPlusRoleIds(guild, canPickPlus) {
  if (!canPickPlus) return [];
  return getPlusColorRoleIds().filter((rid) => guild?.roles?.cache?.has?.(rid));
}

function listUnlockedTierRoleIds(numericLevel) {
  const lv = Number(numericLevel) || 0;
  return getTierExclusiveColorDefs().filter((row) => lv >= row.minLevel).map((row) => row.roleId);
}

function listUnlockedNaturalRoleIds(numericLevel) {
  const lv = Number(numericLevel) || 0;
  const out = [];
  for (let i = 0; i < PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL.length; i += 1) {
    const minLv = NATURAL_COLOR_MIN_LEVELS[i] ?? 1;
    if (lv >= minLv) out.push(PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL[i]);
  }
  return out;
}

function roleLabel(guild, roleId) {
  const r = guild?.roles?.cache?.get?.(roleId);
  const name = String(r?.name || "Colore").trim().slice(0, 80);
  return name;
}

function buildSelectOptionsForSegment(guild, segment, member, numericLevel, canPickPlus) {
  const removeOpt = { label: "Rimuovi colore", value: "remove", description: "Toglie tutti i colori chat", emoji: "<:vegax:1443934876440068179>" };
  if (segment === "pt") {
    const plus = listUnlockedPlusRoleIds(guild, canPickPlus);
    const tierIds = listUnlockedTierRoleIds(numericLevel).filter((rid) => guild?.roles?.cache?.has?.(rid));
    const opts = [removeOpt];
    for (const rid of plus) {
      opts.push({
        label: `Plus · ${roleLabel(guild, rid)}`.slice(0, 100),
        value: rid,
        description: "Gradiente Plus",
      });
    }
    for (const rid of tierIds) {
      const def = getTierExclusiveColorDefs().find((d) => d.roleId === rid);
      opts.push({
        label: `Esclusivo · ${roleLabel(guild, rid)}`.slice(0, 100),
        value: rid,
        description: def ? `Da livello ${def.minLevel}` : "Livello",
      });
    }
    return opts.slice(0, 25);
  }
  if (segment === "nat") {
    const nat = listUnlockedNaturalRoleIds(numericLevel).filter((rid) => guild?.roles?.cache?.has?.(rid));
    const opts = [removeOpt];
    for (const rid of nat) {
      const idx = PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL.indexOf(rid);
      const minLv = NATURAL_COLOR_MIN_LEVELS[idx] ?? 1;
      opts.push({
        label: roleLabel(guild, rid).slice(0, 100),
        value: rid,
        description: `Da livello ${minLv}`,
      });
    }
    return opts.slice(0, 25);
  }
  return [removeOpt];
}

function isValueAllowedForCmdColors(segment, value, member, numericLevel, canPickPlus) {
  if (value === "remove") return true;
  if (segment === "pt") {
    const okPlus = listUnlockedPlusRoleIds(member.guild, canPickPlus).includes(value);
    const okTier = listUnlockedTierRoleIds(numericLevel).includes(value);
    return okPlus || okTier;
  }
  if (segment === "nat") {
    return listUnlockedNaturalRoleIds(numericLevel).includes(value);
  }
  return false;
}

module.exports = {
  PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL,
  NATURAL_COLOR_MIN_LEVELS,
  getPlusColorRoleIds,
  getTierExclusiveColorDefs,
  getAllPersonalityChatColorRoleIds,
  fetchNumericProfileLevel,
  memberHasPlusColorEligibility,
  memberHasPlusColorFullEligibilityAsync,
  listUnlockedPlusRoleIds,
  listUnlockedTierRoleIds,
  listUnlockedNaturalRoleIds,
  buildSelectOptionsForSegment,
  isValueAllowedForCmdColors,
  roleLabel,
};