const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
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
const EMOJI_COLOR_PLUS = "<:VC_Vip:1482534921472835895>";
const EMOJI_COLOR_TIER = "<:VC_EXP:1482534670896730143>";
const NATURAL_PERSONALITY_COLOR_EMOJI_BY_ROLE_ID = {
  "1442568956832645212": "<:67241redmidnightheart:1470543833325633638>",
  "1442568967045648412": "<:76708orangemidnightheart:1470543838392352940>",
  "1442568969528541225": "<:59095yellowmidnightheart:1470543825704321107>",
  "1442568976944201828": "<:56389greenmidnightheart:1470543822491619562>",
  "1442568977896439960": "<:16576lightbluemidnightheart:1470543819958386862>",
  "1442568980626673685": "<:69616midnightheart:1470543834856554722>",
  "1442568983898357954": "<:79202purplemidnightheart:1470543839973605397>",
  "1442568985278156971": "<:66893pinkmidnightheart:1495723265467875388>",
  "1442568987887276133": "<:63324blackmidnightheart:1470543828569034757>",
  "1442568989866725468": "<:63324blackmidnightheart:1470543828569034757>",
  "1442568991150309578": "<:70505whitemidnightheart:1470543836836135067>",
};

function naturalPersonalityColorEmoji(roleId) {
  const id = String(roleId || "").trim();
  return NATURAL_PERSONALITY_COLOR_EMOJI_BY_ROLE_ID[id] || null;
}

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
]
  .map((id) => String(id || "").trim())
  .filter(Boolean);

function getLevelGatedPlusColorDefs() {
  return [
    { roleId: String(IDs.roles.orangeBlackPlus || "").trim(), minLevel: 120 },
    { roleId: String(IDs.roles.greenBlackPlus || "").trim(), minLevel: 150 },
    { roleId: String(IDs.roles.aquaBlackPlus || "").trim(), minLevel: 200 },
  ].filter((row) => row.roleId);
}

function getPlusColorRoleIds() {
  return [...BASE_PLUS_COLOR_ROLE_IDS_ORDERED, ...getLevelGatedPlusColorDefs().map((d) => d.roleId)].filter(Boolean);
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
  const legacyLevelRoles = [IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Level100, IDs.roles.Level120, IDs.roles.Level150, IDs.roles.Level200].filter(Boolean);
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

function listUnlockedPlusRoleIds(guild, canPickPlus, numericLevel = 0) {
  if (!canPickPlus || !guild?.roles?.cache) return [];
  const lv = Number(numericLevel) || 0;
  const out = [];
  for (const rid of BASE_PLUS_COLOR_ROLE_IDS_ORDERED) {
    if (guild.roles.cache.has(rid)) out.push(rid);
  }
  for (const { roleId, minLevel } of getLevelGatedPlusColorDefs()) {
    if (!roleId || !guild.roles.cache.has(roleId)) continue;
    if (lv >= minLevel) out.push(roleId);
  }
  return out;
}

function listUnlockedTierRoleIds(numericLevel) {
  const lv = Number(numericLevel) || 0;
  return getTierExclusiveColorDefs().filter((row) => lv >= row.minLevel).map((row) => row.roleId);
}

function listUnlockedNaturalRoleIds() {
  return [...PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL];
}

function roleLabel(guild, roleId) {
  const r = guild?.roles?.cache?.get?.(roleId);
  const name = String(r?.name || "Colore").trim().slice(0, 80);
  return name;
}

function buildSelectOptionsForSegment(guild, segment, member, numericLevel, canPickPlus) {
  const removeOpt = { label: "Rimuovi colore", value: "remove", description: "Toglie tutti i colori chat", emoji: "<:vegax:1443934876440068179>" };
  if (segment === "pt") {
    const plus = listUnlockedPlusRoleIds(guild, canPickPlus, numericLevel);
    const tierIds = listUnlockedTierRoleIds(numericLevel).filter((rid) => guild?.roles?.cache?.has?.(rid));
    const opts = [removeOpt];
    for (const rid of plus) {
      const gated = getLevelGatedPlusColorDefs().find((d) => d.roleId === rid);
      opts.push({
        label: `Plus · ${roleLabel(guild, rid)}`.slice(0, 100),
        value: rid,
        description: gated ? `Da livello ${gated.minLevel}` : "Gradiente Plus",
        emoji: EMOJI_COLOR_PLUS,
      });
    }
    for (const rid of tierIds) {
      const def = getTierExclusiveColorDefs().find((d) => d.roleId === rid);
      opts.push({
        label: `Esclusivo · ${roleLabel(guild, rid)}`.slice(0, 100),
        value: rid,
        description: def ? `Da livello ${def.minLevel}` : "Livello",
        emoji: EMOJI_COLOR_TIER,
      });
    }
    return opts.slice(0, 25);
  }
  if (segment === "nat") {
    const nat = listUnlockedNaturalRoleIds().filter((rid) => guild?.roles?.cache?.has?.(rid));
    const opts = [removeOpt];
    for (const rid of nat) {
      const row = {
        label: roleLabel(guild, rid).slice(0, 100),
        value: rid,
        description: "Colore classico",
      };
      const em = naturalPersonalityColorEmoji(rid);
      if (em) row.emoji = em;
      opts.push(row);
    }
    return opts.slice(0, 25);
  }
  return [removeOpt];
}

function isAllowedColorValue(value, member, numericLevel, canPickPlus) {
  const v = String(value || "").trim();
  if (!v || v === "remove") return false;
  if (listUnlockedNaturalRoleIds().includes(v)) return true;
  if (listUnlockedPlusRoleIds(member.guild, canPickPlus, numericLevel).includes(v)) return true;
  if (listUnlockedTierRoleIds(numericLevel).includes(v)) return true;
  return false;
}

function isValueAllowedForCmdColors(segment, value, member, numericLevel, canPickPlus) {
  if (value === "remove") return true;
  if (segment === "all") return isAllowedColorValue(value, member, numericLevel, canPickPlus);
  if (segment === "pt") {
    const okPlus = listUnlockedPlusRoleIds(member.guild, canPickPlus, numericLevel).includes(value);
    const okTier = listUnlockedTierRoleIds(numericLevel).includes(value);
    return okPlus || okTier;
  }
  if (segment === "nat") {
    return listUnlockedNaturalRoleIds().includes(value);
  }
  return false;
}

const MERGED_SELECT_MAX = 25;

function buildMergedColorSelectOptions(guild, member, numericLevel, canPickPlus) {
  const opts = [];
  const pushOpt = (rid, prefix, kind, description) => {
    if (opts.length >= MERGED_SELECT_MAX) return;
    if (!guild?.roles?.cache?.has?.(rid)) return;
    const label = `${prefix}${roleLabel(guild, rid)}`.slice(0, 100);
    const row = { label, value: rid };
    if (kind === "plus") {
      row.emoji = EMOJI_COLOR_PLUS;
      row.description = String(description || "Gradiente Plus").slice(0, 100);
    } else if (kind === "tier") row.emoji = EMOJI_COLOR_TIER;
    else if (kind === "natural") {
      const em = naturalPersonalityColorEmoji(rid);
      if (em) row.emoji = em;
    }
    opts.push(row);
  };
  for (const rid of listUnlockedPlusRoleIds(guild, canPickPlus, numericLevel)) {
    const gated = getLevelGatedPlusColorDefs().find((d) => d.roleId === rid);
    pushOpt(rid, "Plus · ", "plus", gated ? `Da livello ${gated.minLevel}` : "Gradiente Plus");
  }
  for (const rid of listUnlockedTierRoleIds(numericLevel).filter((id) => guild?.roles?.cache?.has?.(id))) {
    const def = getTierExclusiveColorDefs().find((d) => d.roleId === rid);
    pushOpt(rid, def ? `Lv${def.minLevel} · ` : " · ", "tier");
  }
  for (const rid of listUnlockedNaturalRoleIds().filter((id) => guild?.roles?.cache?.has?.(id))) pushOpt(rid, "", "natural");
  return opts;
}

function mentionRoles(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(" · ");
}

function listRoleIdsForColorsEmbedMentions(guild) {
  const raw = [
    ...getAllPersonalityChatColorRoleIds(),
    IDs.roles.VIP,
    IDs.roles.VIPplus,
    IDs.roles.ServerBooster,
    IDs.roles.DoubleBooster,
    IDs.roles.Donator,
    IDs.roles.Level50,
    IDs.roles.Level70,
    IDs.roles.Level100,
    IDs.roles.Level120,
    IDs.roles.Level150,
    IDs.roles.Level200,
    IDs.roles.orangeBlackPlus,
    IDs.roles.greenBlackPlus,
    IDs.roles.aquaBlackPlus,
  ];
  const uniq = [...new Set(raw.map((id) => String(id || "").trim()).filter(Boolean))];
  return uniq.filter((id) => guild?.roles?.cache?.has?.(id));
}

function buildColorsMainEmbedDescription(guild, numericLevel, canPickPlus) {
  const sep = "୨୧ — · · · — ୨୧";
  const nat = listUnlockedNaturalRoleIds().filter((id) => guild?.roles?.cache?.has?.(id));
  const natLine = nat.length ? nat.map((id) => `· <@&${id}>`).join("\n") : "_Nessun ruolo colore classico sul server._";
  const plusReq = mentionRoles([
    IDs.roles.VIP,
    IDs.roles.VIPplus,
    IDs.roles.ServerBooster,
    IDs.roles.DoubleBooster,
    IDs.roles.Donator,
    IDs.roles.Level50,
    IDs.roles.Level70,
    IDs.roles.Level100,
    IDs.roles.Level120,
    IDs.roles.Level150,
    IDs.roles.Level200,
  ]);
  const plusUnlocked = listUnlockedPlusRoleIds(guild, canPickPlus, numericLevel);
  const plusBlock = canPickPlus
    ? plusUnlocked.length
      ? `**Sbloccati per te** · scegli dal menu sotto.\n${plusUnlocked.map((id) => `· <@&${id}>`).join("\n")}`
      : "**Sbloccati**, ma i ruoli Plus non risultano sul server."
    : `**Non sbloccati.** Serve **livello 50+** oppure uno tra: ${plusReq || "VIP / Booster / Donator"}\n`;
  const tierRows = [
    ...getTierExclusiveColorDefs()
      .filter((d) => guild?.roles?.cache?.has?.(d.roleId))
      .map((d) => ({ roleId: d.roleId, minLevel: d.minLevel, needsPlus: false })),
    ...getLevelGatedPlusColorDefs()
      .filter((d) => guild?.roles?.cache?.has?.(d.roleId))
      .map((d) => ({ roleId: d.roleId, minLevel: d.minLevel, needsPlus: true })),
  ];
  const tierBlock =
    tierRows.length === 0
      ? "_Nessun ruolo esclusivo livello configurato._"
      : `Il tuo livello: **${numericLevel || 0}**\n` +
        tierRows
          .map((d) => {
            const ok = Number(numericLevel) >= d.minLevel && (!d.needsPlus || canPickPlus);
            return `· <@&${d.roleId}> — da livello **${d.minLevel}**${ok ? " <a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`;
          })
          .join("\n");
  const lines = [
    "### <:VC_Color:1482532543273238569> Classici",
    natLine,
    "",
    "### <:VC_Vip:1482534921472835895> Plus",
    plusBlock,
    "",
    "### <:VC_EXP:1482534670896730143> Esclusivi di livello",
    tierBlock,
    "",
    sep,
    "",
    "**Menu** · scegli un colore qui sotto. **Rimuovi** con il pulsante rosso.",
  ];
  let body = lines.join("\n");
  if (body.length > 4000) {
    body = `${lines.slice(0, 8).join("\n")}\n\n… *Usa il menu per i classici.*\n\n${sep}`;
  }
  return body;
}

function buildColorsHowToUnlockEmbedDescription() {
  const plusReq = mentionRoles([
    IDs.roles.Level50,
    IDs.roles.VIP,
    IDs.roles.ServerBooster,
    IDs.roles.Donator,
  ]);
  const tiers = getTierExclusiveColorDefs();
  return [
    "## <:VC_PinkQuestionMark:1471892611026391306> Come ottenere i colori",
    "",
    "### <:VC_Color:1482532543273238569> Classici",
    "Disponibili per tutti i membri: nessun requisito. ",
    "",
    "### <:VC_Vip:1482534921472835895> Plus",
    "Serve almeno una di queste condizioni:",
    `· **Livello 50+** sul server`,
    `· Ruoli: ${plusReq || "VIP, Booster, Donator, Level50"}`,
    "",
    "### <:VC_EXP:1482534670896730143> Esclusivi",
    "Solo in base al **livello** salvato sul profilo:",
    ...tiers.map((t) => `· <@&${t.roleId}> — da livello **${t.minLevel}**`),
    "",
    "୨୧ — · · · — ୨୧",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  PERSONALITY_NORMAL_COLOR_ROLE_IDS_ALL,
  NATURAL_PERSONALITY_COLOR_EMOJI_BY_ROLE_ID,
  naturalPersonalityColorEmoji,
  getPlusColorRoleIds,
  getLevelGatedPlusColorDefs,
  getTierExclusiveColorDefs,
  getAllPersonalityChatColorRoleIds,
  fetchNumericProfileLevel,
  memberHasPlusColorEligibility,
  memberHasPlusColorFullEligibilityAsync,
  listUnlockedPlusRoleIds,
  listUnlockedTierRoleIds,
  listUnlockedNaturalRoleIds,
  buildSelectOptionsForSegment,
  buildMergedColorSelectOptions,
  buildColorsMainEmbedDescription,
  buildColorsHowToUnlockEmbedDescription,
  listRoleIdsForColorsEmbedMentions,
  isValueAllowedForCmdColors,
  isAllowedColorValue,
  roleLabel,
};