const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { STAFF_WARN_RESET_MS } = require("../../Services/Staff/staffWarnService");
const { countModActionsByMod } = require("../Moderation/modCaseStore");
const { buildPauseListPayload } = require("../Pause/pauseListRuntime");
const { roleChoiceAppliesTo, PAUSE_ROLE_PM } = require("../Pause/pauseHandlersUtils");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const { countValidAllTimePartners } = require("../Partner/partnerLeaderboardRuntime");
const { getRemainingContestVoteBudgetForUser } = require("../../Services/Community/weeklyContestService");

function resolveStaffPartnerPointsDisplay(staffObj) {
  if (!staffObj) return 0;
  const fromCounter = Math.max(0, Math.floor(Number(staffObj.partnerCount ?? 0)));
  const fromActions = countValidAllTimePartners(Array.isArray(staffObj.partnerActions) ? staffObj.partnerActions : []);
  return Math.max(fromCounter, fromActions);
}
const PANEL_PREFIX = "staff_profile_panel";
const STAFF_HP_PREFIX = "staff_hp";
const SECTION_HOME = "home";
const SECTION_VALUTAZIONI = "valutazioni";
const SECTION_WARN = "warn";
const SECTION_PAUSE = "pause";
const SECTION_MODSTATS = "modstats";
const LEGACY_PARTNER_LB_SECTION = "partner_lb";
const PROFILE_FULL = "full";
const PROFILE_PM_ONLY = "pm_only";
const PROFILE_PROSPECT = "prospect";
const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Supervisor),
  String(IDs.roles.Coordinator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
  String(IDs.roles.Staff),
].filter(Boolean);
const STAFF_PROFILE_DISPLAY_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
].filter(Boolean);

function resolveStaffRole(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function resolveStaffProfileDisplayRoleId(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (roleId && member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function buildFullProfileRoleLabelForEmbed(guild, member) {
  if (!member?.roles?.cache || !guild?.roles?.cache) return "—";
  const pmId = String(IDs.roles.PartnerManager || "");
  let staffLabel = null;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (!roleId || String(roleId) === pmId) continue;
    if (member.roles.cache.has(roleId)) {
      staffLabel = guild.roles.cache.get(roleId)?.name || `<@&${roleId}>`;
      break;
    }
  }
  const hasPm = Boolean(pmId && member.roles.cache.has(pmId));
  const pmLabel = hasPm ? guild.roles.cache.get(pmId)?.name || "Partner Manager" : null;
  if (staffLabel && pmLabel) return `${staffLabel} & ${pmLabel}`;
  if (staffLabel) return staffLabel;
  if (pmLabel) return pmLabel;
  return "—";
}

function hasDisplayTierStaffBeforePartnerManager(member) {
  if (!member?.roles?.cache) return false;
  const pmId = IDs.roles.PartnerManager;
  if (!pmId) return false;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (String(roleId) === String(pmId)) break;
    if (roleId && member.roles.cache.has(roleId)) return true;
  }
  return false;
}

function viewerCanUsePartnerPointsPanel(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(
    (IDs.roles.HighStaff && c.has(IDs.roles.HighStaff)) ||
      (IDs.roles.Founder && c.has(IDs.roles.Founder)) ||
      (IDs.roles.CoFounder && c.has(IDs.roles.CoFounder)),
  );
}

function viewerIsFounderOrCoFounder(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(
    (IDs.roles.Founder && c.has(IDs.roles.Founder)) ||
      (IDs.roles.CoFounder && c.has(IDs.roles.CoFounder)),
  );
}

function targetIsFounderOrCoFounder(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(
    (IDs.roles.Founder && c.has(IDs.roles.Founder)) ||
      (IDs.roles.CoFounder && c.has(IDs.roles.CoFounder)),
  );
}

function viewerIsCoordinatorOrAbove(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(
    (IDs.roles.Coordinator && c.has(IDs.roles.Coordinator)) ||
      (IDs.roles.Supervisor && c.has(IDs.roles.Supervisor)) ||
      (IDs.roles.Admin && c.has(IDs.roles.Admin)) ||
      (IDs.roles.CoFounder && c.has(IDs.roles.CoFounder)) ||
      (IDs.roles.Founder && c.has(IDs.roles.Founder)) ||
      (IDs.roles.HighStaff && c.has(IDs.roles.HighStaff)),
  );
}

function resolveStaffProfileKind(member) {
  if (!member) return PROFILE_PROSPECT;
  if (!memberHasStaffRole(member)) return PROFILE_PROSPECT;
  const pmId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmId && member.roles?.cache?.has(pmId));
  const hasLadder = Boolean(resolveStaffRole(member));
  const hasHigherThanPm = hasDisplayTierStaffBeforePartnerManager(member);
  if (hasPm && !hasLadder && !hasHigherThanPm) return PROFILE_PM_ONLY;
  return PROFILE_FULL;
}

const STAFF_LADDER_ROLE_IDS_FOR_PANEL = [
  IDs.roles.Helper,
  IDs.roles.Mod,
  IDs.roles.Coordinator,
  IDs.roles.Supervisor,
  IDs.roles.Admin,
  IDs.roles.CoFounder,
  IDs.roles.Founder,
].filter(Boolean);

function getHighestStaffLadderRoleIdForPanel(member) {
  if (!member?.roles?.cache) return null;
  for (let i = STAFF_LADDER_ROLE_IDS_FOR_PANEL.length - 1; i >= 0; i--) {
    const id = STAFF_LADDER_ROLE_IDS_FOR_PANEL[i];
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

function memberHasPmAndStaffLadderForDualDepex(member) {
  const pmId = IDs.roles.PartnerManager;
  if (!pmId || !member?.roles?.cache?.has(pmId)) return false;
  return Boolean(getHighestStaffLadderRoleIdForPanel(member));
}

function buildProspectPexRows(viewerId, targetId, sourceMessageId = null) {
  const v = String(viewerId);
  const t = String(targetId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_helper", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Helper")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_mod", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Mod")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_coord", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Coord")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_supervisor", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Supervisor")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_admin", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Admin")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_cofounder", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Co-Founder")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_founder", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Founder")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Partner Manager")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function getStaffPauseLine(staffDoc, opts = {}) {
  const allPauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const pauses = opts.pmOnly
    ? allPauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
    : allPauses;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const accepted = pauses
    .map((p) => {
      if (!p || p.status !== "accepted") return null;
      const start = parseItalianDate(p.dataRichiesta);
      const end = parseItalianDate(p.dataRitorno);
      if (!start || !end) return null;
      return { p, start, end };
    })
    .filter(Boolean);
  const active = accepted
    .filter((x) => today >= x.start && today <= x.end)
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  if (active.length) {
    return `In pausa fino al **${active[0].p.dataRitorno}**`;
  }
  const recentlyReturned = accepted
    .filter((x) => x.end < today && x.end >= sevenDaysAgo)
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  if (recentlyReturned.length) {
    return `Rientrato il **${recentlyReturned[0].p.dataRitorno}**`;
  }
  return "Nessuna pausa in corso <a:VC_Cross:1482532424570376253>";
}


function formatStaffProfileSelectCustomId(viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:select:${viewerId}:${targetId}`, sourceMessageId);
}

function formatStaffProfileCloseCustomId(viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:close:${viewerId}:${targetId}`, sourceMessageId);
}

function parseStaffProfileSelectCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PANEL_PREFIX || parts[1] !== "select") return null;
  return { viewerId: parts[2], targetId: parts[3], sourceMessageId: normalizeSourceMessageId(parts[4]) };
}

function parseStaffProfileCloseCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PANEL_PREFIX || parts[1] !== "close") return null;
  return { viewerId: parts[2], targetId: parts[3], sourceMessageId: normalizeSourceMessageId(parts[4]) };
}

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function withSourceSuffix(baseCustomId, sourceMessageId) {
  const sid = normalizeSourceMessageId(sourceMessageId);
  return sid ? `${baseCustomId}:${sid}` : baseCustomId;
}

function formatStaffHpButtonCustomId(action, viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const sec = String(section || SECTION_HOME).toLowerCase();
  return withSourceSuffix(`${STAFF_HP_PREFIX}:${action}:${viewerId}:${targetId}:${sec}`, sourceMessageId);
}

function buildHighStaffActionRows(viewerId, targetId, section, dualPmStaffDepex = false, targetHasPartnerManager = false, sourceMessageId = null) {
  const v = String(viewerId);
  const t = String(targetId);
  let sec = String(section || "").toLowerCase();
  if (sec === SECTION_WARN) sec = SECTION_VALUTAZIONI;
  if (sec === SECTION_HOME) {
    const homeComps = [
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_menu", v, t, sec, sourceMessageId))
        .setLabel("Pex")
        .setEmoji("<a:VC_Verified:1482532479637127188>")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("depex_menu", v, t, sec, sourceMessageId))
        .setLabel("Depex")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger),
    ];
    return [new ActionRowBuilder().addComponents(...homeComps)];
  }
  if (sec === SECTION_VALUTAZIONI) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("val_add_menu", v, t, sec, sourceMessageId))
          .setLabel("Aggiungi")
          .setEmoji("<:thumbsup:1471292172145004768>")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("val_remove_menu", v, t, sec, sourceMessageId))
          .setLabel("Rimuovi")
          .setEmoji("<:thumbsdown:1471292163957457013>")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  if (sec === SECTION_WARN) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("warn", v, t, sec, sourceMessageId))
          .setLabel("Aggiungi")
          .setEmoji("<:thumbsup:1471292172145004768>")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("warn_rm", v, t, sec, sourceMessageId))
          .setLabel("Rimuovi")
          .setEmoji("<:thumbsdown:1471292163957457013>")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  return [];
}

function buildPmOnlyPartnerRows(viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("depex", v, t, sec, sourceMessageId))
        .setLabel("Depex")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_add", v, t, sec, sourceMessageId))
        .setLabel("Aggiungi punti")
        .setEmoji("<:thumbsup:1471292172145004768>")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_remove", v, t, sec, sourceMessageId))
        .setLabel("Rimuovi punti")
        .setEmoji("<:thumbsdown:1471292163957457013>")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildPartnerPointsOnlyRow(viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_add", v, t, sec, sourceMessageId))
        .setLabel("Aggiungi punti")
        .setEmoji("<:thumbsup:1471292172145004768>")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_remove", v, t, sec, sourceMessageId))
        .setLabel("Rimuovi punti")
        .setEmoji("<:thumbsdown:1471292163957457013>")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function shouldAttachHighStaffActions(
  section,
  viewerId,
  targetUserId,
  viewerIsHighStaff,
  profileKind,
  viewerMember,
  suppressPexDepex = false,
  targetMember = null,
) {
  if (suppressPexDepex) return false;
  const sec = String(section || "").toLowerCase();
  const pmHome = profileKind === PROFILE_PM_ONLY && sec === SECTION_HOME;
  if (profileKind !== PROFILE_FULL && !pmHome) return false;
  const self = String(viewerId) === String(targetUserId);
  if (self) {
    if (!viewerIsFounderOrCoFounder(viewerMember)) return false;
  } else if (!viewerIsHighStaff) {
    return false;
  }
  if (targetIsFounderOrCoFounder(targetMember) && (sec === SECTION_VALUTAZIONI || sec === SECTION_WARN)) {
    return false;
  }
  return sec === SECTION_HOME || sec === SECTION_VALUTAZIONI || sec === SECTION_WARN;
}

function mergeProfileComponents(selectRow, highStaffRows, extraRows) {
  const base = [];
  if (selectRow) base.push(selectRow);
  if (Array.isArray(highStaffRows) && highStaffRows.length) {
    base.push(...highStaffRows);
  }
  if (Array.isArray(extraRows) && extraRows.length) {
    base.push(...extraRows);
  }
  return base;
}

function buildProfileCloseRow(viewerId, targetId, sourceMessageId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(formatStaffProfileCloseCustomId(String(viewerId), String(targetId), sourceMessageId))
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(ButtonStyle.Danger),
  );
}

function withCloseProfileComponents(components, viewerId, targetId, sourceMessageId = null) {
  return [...(Array.isArray(components) ? components : []), buildProfileCloseRow(viewerId, targetId, sourceMessageId)];
}

function limitExtraRowsForProfilePanel(extraRows = [], maxRows = 3) {
  const rows = Array.isArray(extraRows) ? extraRows : [];
  const cap = Math.max(0, Number(maxRows || 0));
  if (rows.length <= cap) return rows;
  if (cap === 0) return [];
  if (cap === 1) return [rows[rows.length - 1]];
  return [...rows.slice(0, cap - 1), rows[rows.length - 1]];
}

function buildProfileSelectRow(viewerId, targetId, section, profileKind, sourceMessageId = null, selectOptions = {}) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  const homeLabel = selectOptions.partnersCmdsHomeLabel ? "Home" : "Panoramica";
  if (profileKind === PROFILE_PROSPECT) return null;
  if (profileKind === PROFILE_PM_ONLY) {
    const opts = [
      { label: homeLabel, value: SECTION_HOME, emoji: "<:partnermanager:1443651916838998099>", default: sec === SECTION_HOME },
      { label: "Pause", value: SECTION_PAUSE, emoji: "<a:VC_Calendar:1482706208149475358>", default: sec === SECTION_PAUSE },
    ];
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(formatStaffProfileSelectCustomId(v, t, sourceMessageId))
        .setPlaceholder("Profilo")
        .addOptions(...opts),
    );
  }
  const hideValWarn = selectOptions.hideValutazioniWarn === true;
  const opts = [
    { label: "Home", value: SECTION_HOME, emoji: "<:staff:1443651912179388548>", default: sec === SECTION_HOME },
  ];
  if (!hideValWarn) {
    opts.push({
      label: "Valutazioni & Warn",
      value: SECTION_VALUTAZIONI,
      emoji: "<:VC_Stats:1482527532682055780>",
      default: sec === SECTION_VALUTAZIONI,
    });
  }
  opts.push(
    { label: "Pause", value: SECTION_PAUSE, emoji: "<a:VC_Calendar:1482706208149475358>", default: sec === SECTION_PAUSE },
    { label: "Modstats", value: SECTION_MODSTATS, emoji: "<:VC_Stats:1482527532682055780>", default: sec === SECTION_MODSTATS },
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatStaffProfileSelectCustomId(viewerId, targetId, sourceMessageId))
      .setPlaceholder("Sezione profilo")
      .addOptions(...opts),
  );
}

function chunkString(text, maxLen = 3800) {
  const s = String(text || "");
  if (!s) return [""];
  const chunks = [];
  for (let i = 0; i < s.length; i += maxLen) {
    chunks.push(s.slice(i, i + maxLen));
  }
  return chunks;
}

function warnResetLine(firstWarnStaffAt) {
  if (!firstWarnStaffAt) return "";
  const first = firstWarnStaffAt instanceof Date ? firstWarnStaffAt : new Date(firstWarnStaffAt);
  if (Number.isNaN(first.getTime())) return "";
  const resetAt = first.getTime() + STAFF_WARN_RESET_MS;
  const left = resetAt - Date.now();
  if (left <= 0) return "<a:VC_Clock:1473359204189474886> I warn possono essere stati azzerati dal ciclo automatico.";
  const days = Math.ceil(left / (24 * 60 * 60 * 1000));
  return `<a:VC_Clock:1473359204189474886> Prossimo reset automatico warn: tra ~**${days}** giorni (<t:${Math.floor(resetAt / 1000)}:R>).`;
}

async function fetchStaffLean(guildId, userId) {
  return ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("staff")
    .lean()
    .catch(() => null);
}

async function buildStaffProfilePayload(guild, targetUserId, viewerId, client, section = SECTION_HOME, options = {}) {
  const gid = String(guild?.id || "");
  const tid = String(targetUserId || "");
  const member = await guild.members.fetch(tid).catch(() => null);
  const targetUser = member?.user || (await client.users.fetch(tid).catch(() => null));
  const name = member?.displayName || targetUser?.username || tid;
  const viewerMemForPanel = await guild.members.fetch(String(viewerId)).catch(() => null);
  const viewerIsHighStaff = Boolean(viewerMemForPanel?.roles?.cache?.has(IDs.roles.HighStaff));
  const viewerCanFullDepex = viewerIsCoordinatorOrAbove(viewerMemForPanel);
  const viewerCanPartnerPointsPanel = viewerCanUsePartnerPointsPanel(viewerMemForPanel);
  const profileKind = resolveStaffProfileKind(member);
  const sourceMessageId = normalizeSourceMessageId(options?.sourceMessageId);
  const pmRoleId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmRoleId && member?.roles?.cache?.has(pmRoleId));
  const partnersCmdsMode = options?.partnersCmdsChannel === true;
  const usePartnersCmdsPmPanel = partnersCmdsMode && hasPm;

  if (partnersCmdsMode && !hasPm) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#992d22")
          .setDescription(
            "<:VC_Attention:1482534443632558151> In **partner cmds** puoi consultare solo utenti con ruolo **Partner Manager**.",
          ),
      ],
      components: withCloseProfileComponents([], viewerId, tid, sourceMessageId),
    };
  }

  if (profileKind === PROFILE_PROSPECT) {
    const pexComps =
      viewerIsHighStaff && String(viewerId) !== tid ? buildProspectPexRows(String(viewerId), tid, sourceMessageId) : [];
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            `<:VC_Staff:1479443779571155086> **${name}** non ha ruoli Staff né Partner Manager.\n\n` +
            "<a:VC_Verified:1482532479637127188> Usa i pulsanti per pexare direttamente da **Member** verso un ruolo Staff o Partner Manager.",
          )
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(null, pexComps), viewerId, tid, sourceMessageId),
    };
  }

  const displayRoleId = member ? resolveStaffProfileDisplayRoleId(member) : null;
  let roleLabel = "—";
  if (usePartnersCmdsPmPanel) {
    roleLabel = pmRoleId ? guild.roles.cache.get(pmRoleId)?.name || "Partner Manager" : "Partner Manager";
  } else if (profileKind === PROFILE_FULL) {
    roleLabel = buildFullProfileRoleLabelForEmbed(guild, member);
  } else if (displayRoleId) {
    roleLabel = guild.roles.cache.get(displayRoleId)?.name || `<@&${displayRoleId}>`;
  }

  const doc = await fetchStaffLean(gid, tid);
  const s = doc?.staff || {};
  const pos = Math.max(0, Math.floor(Number(s.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(s.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(s.warnCount || 0)));
  const posReasons = Array.isArray(s.positiveReasons) ? s.positiveReasons : [];
  const negReasons = Array.isArray(s.negativeReasons) ? s.negativeReasons : [];
  const warnReasons = Array.isArray(s.warnReasons) ? s.warnReasons : [];


  let sec = String(section || SECTION_HOME).toLowerCase();
  if (sec === LEGACY_PARTNER_LB_SECTION) sec = SECTION_HOME;
  if (sec === SECTION_WARN) sec = SECTION_VALUTAZIONI;
  if (profileKind === PROFILE_PM_ONLY || usePartnersCmdsPmPanel) {
    const allowedPm = new Set([SECTION_HOME, SECTION_PAUSE]);
    if (!allowedPm.has(sec)) sec = SECTION_HOME;
  }

  const hideValutazioniWarnForTarget = Boolean(
    member && profileKind === PROFILE_FULL && !usePartnersCmdsPmPanel && targetIsFounderOrCoFounder(member),
  );
  if (hideValutazioniWarnForTarget && (sec === SECTION_VALUTAZIONI || sec === SECTION_WARN)) {
    sec = SECTION_HOME;
  }

  let contestVoteRemain = null;
  if (sec === SECTION_HOME) {
    contestVoteRemain = await getRemainingContestVoteBudgetForUser(guild, viewerId).catch(() => null);
  }

  const selfForPts = String(viewerId) === tid;
  const canHsPartnerPoints =
    viewerCanPartnerPointsPanel &&
    (profileKind === PROFILE_PM_ONLY ||
      usePartnersCmdsPmPanel ||
      (profileKind === PROFILE_FULL && hasPm)) &&
    (!selfForPts || viewerIsFounderOrCoFounder(viewerMemForPanel));
  let partnerHomeRows = [];
  if (sec === SECTION_HOME && canHsPartnerPoints) {
    const vPts = String(viewerId);
    if (usePartnersCmdsPmPanel) partnerHomeRows = buildPartnerPointsOnlyRow(vPts, tid, SECTION_HOME, sourceMessageId);
    else if (profileKind === PROFILE_FULL && hasPm) partnerHomeRows = buildPartnerPointsOnlyRow(vPts, tid, SECTION_HOME, sourceMessageId);
    else if (profileKind === PROFILE_PM_ONLY) partnerHomeRows = buildPmOnlyPartnerRows(vPts, tid, SECTION_HOME, sourceMessageId);
  }

  const profileKindForSelect = usePartnersCmdsPmPanel ? PROFILE_PM_ONLY : profileKind;
  const selectRow = buildProfileSelectRow(String(viewerId), tid, sec, profileKindForSelect, sourceMessageId, {
    partnersCmdsHomeLabel: usePartnersCmdsPmPanel,
    hideValutazioniWarn: hideValutazioniWarnForTarget,
  });
  const dualPmStaffDepex = profileKind === PROFILE_FULL && memberHasPmAndStaffLadderForDualDepex(member);
  const highStaffRows = shouldAttachHighStaffActions(
    sec,
    viewerId,
    tid,
    viewerIsHighStaff,
    profileKind,
    viewerMemForPanel,
    usePartnersCmdsPmPanel,
    member,
  )
    ? buildHighStaffActionRows(String(viewerId), tid, sec, dualPmStaffDepex, hasPm, sourceMessageId)
    : [];
  const hsRows = [...highStaffRows];
  if (
    sec === SECTION_HOME &&
    profileKind === PROFILE_FULL &&
    !usePartnersCmdsPmPanel &&
    String(viewerId) !== tid &&
    viewerCanFullDepex &&
    !viewerIsHighStaff
  ) {
    hsRows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("depex_full", String(viewerId), tid, sec, sourceMessageId))
          .setLabel("Depex completo")
          .setEmoji("<a:VC_Cross:1482532424570376253>")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  if ((profileKind === PROFILE_PM_ONLY || usePartnersCmdsPmPanel) && sec === SECTION_HOME) {
    const pauseShort = getStaffPauseLine(s, { pmOnly: true });
    const punti = resolveStaffPartnerPointsDisplay(s);
    const pmHomeLines = [
      `<:VC_Staff:1479443779571155086> **Ruolo:** ${roleLabel}`,
      "",
      `<a:VC_Calendar:1482706208149475358> **Pause:** ${pauseShort}`,
    ];
    if (contestVoteRemain) {
      pmHomeLines.push(
        "",
        `<a:VC_Events:1482706144953897223> **Contest sfondi:** voti disponibili — **Mobile ${contestVoteRemain.mobileRemaining}** · **PC ${contestVoteRemain.pcRemaining}**`,
      );
    }
    pmHomeLines.push("", `<:VC_Partner:1482527213780729896> **Punti partner:** ${punti}`);
    const pmHomeDesc = pmHomeLines.join("\n");
    const pmTitle = usePartnersCmdsPmPanel
      ? `<:VC_addperson:1485419347068588073> Profilo Partner Manager ${name}`
      : `<:VC_addperson:1485419347068588073> Profilo Staff ${name}`;
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(pmTitle)
          .setDescription(pmHomeDesc.slice(0, 4090))
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId),
    };
  }

  if (sec === SECTION_VALUTAZIONI) {
    const posLines = posReasons.map((r, i) => `**+${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const negLines = negReasons.map((r, i) => `**−${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const warnLines = warnReasons.map((r, i) => `**!${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const warnBlock = warnLines.length
      ? [
          "<:banhammer:1443651875441217639> **Warn**",
          warnResetLine(s.firstWarnStaffAt),
          "",
          ...warnLines,
        ]
      : ["<:banhammer:1443651875441217639> **Warn** — nessun warn."];
    const body = [
      posLines.length ? "<:thumbsup:1471292172145004768> **Positive**" : "<:thumbsup:1471292172145004768> **Positive** — nessuna.",
      ...posLines,
      "",
      negLines.length ? "<:thumbsdown:1471292163957457013> **Negative**" : "<:thumbsdown:1471292163957457013> **Negative** — nessuna.",
      ...negLines,
      "",
      ...warnBlock,
    ].join("\n");
    const chunks = chunkString(body, 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(desc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    );
    return { embeds, components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId) };
  }

  if (sec === SECTION_PAUSE) {
    const targetUserObj = targetUser || { id: tid, username: name };
    const pauseRoleFilter =
      profileKind === PROFILE_PM_ONLY || usePartnersCmdsPmPanel ? "pm" : undefined;
    const listPayload = await buildPauseListPayload({
      guildId: gid,
      requesterId: String(viewerId),
      targetUser: targetUserObj,
      isHighStaff: viewerIsHighStaff,
      client,
      pauseRoleFilter,
    });
    if (!listPayload.ok) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(listPayload.error || "Errore caricamento pause."),
        ],
        components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId),
      };
    }
    return {
      embeds: [...listPayload.embeds],
      components: withCloseProfileComponents(
        mergeProfileComponents(selectRow, hsRows, limitExtraRowsForProfilePanel(listPayload.components || [], 3)),
        viewerId,
        tid,
        sourceMessageId,
      ),
    };
  }

  if (sec === SECTION_MODSTATS) {
    const modId = tid;
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const countAction = (action, since = null) => countModActionsByMod(gid, modId, action, since);
    const [m7, m30, mall, b7, b30, ball, k7, k30, kall, w7, w30, wall] = await Promise.all([
      countAction("MUTE", d7),
      countAction("MUTE", d30),
      countAction("MUTE"),
      countAction("BAN", d7),
      countAction("BAN", d30),
      countAction("BAN"),
      countAction("KICK", d7),
      countAction("KICK", d30),
      countAction("KICK"),
      countAction("WARN", d7),
      countAction("WARN", d30),
      countAction("WARN"),
    ]);
    const t7 = Number(m7) + Number(b7) + Number(k7) + Number(w7);
    const t30 = Number(m30) + Number(b30) + Number(k30) + Number(w30);
    const tall = Number(mall) + Number(ball) + Number(kall) + Number(wall);
    if (tall === 0) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription("<:cancel:1461730653677551691> **Nessun log moderazione trovato.**")
            .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
        ],
        components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId),
      };
    }
    const hh = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false });
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#3498DB")
          .setTitle("Moderation Statistics")
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 256 }) || null)
          .setAuthor({
            name: targetUser?.username || String(modId),
            iconURL: targetUser?.displayAvatarURL?.({ size: 128 }) || null,
          })
          .addFields(
            {
              name: "Last 7 days",
              value: `Mutes: ${m7}\nBans: ${b7}\nKicks: ${k7}\nWarns: ${w7}\n**Total: ${t7}**`,
              inline: true,
            },
            {
              name: "Last 30 days",
              value: `Mutes: ${m30}\nBans: ${b30}\nKicks: ${k30}\nWarns: ${w30}\n**Total: ${t30}**`,
              inline: true,
            },
            {
              name: "All time",
              value: `Mutes: ${mall}\nBans: ${ball}\nKicks: ${kall}\nWarns: ${wall}\n**Total: ${tall}**`,
              inline: true,
            },
          )
          .setFooter({ text: `ID: ${modId} • Oggi alle ${hh}` })
          .setTimestamp(),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId),
    };
  }

  const pauseShort = getStaffPauseLine(s);
  let viewerName = "";
  try {
    const viewerMember = await guild.members.fetch(String(viewerId));
    viewerName = viewerMember.displayName || viewerMember.user?.username || String(viewerId);
  } catch (e) {
    try {
      const viewerUser = await client.users.fetch(String(viewerId));
      viewerName = viewerUser.username || String(viewerId);
    } catch (err) {
      viewerName = String(viewerId);
    }
  }

  const puntiPartner = resolveStaffPartnerPointsDisplay(s);
  const homeDescParts = [
    `<:VC_Staff:1479443779571155086> **Ruolo:** ${roleLabel}`,
    "",
    `<a:VC_Calendar:1482706208149475358> **Pause:**`,
    `${pauseShort}`,
  ];
  if (contestVoteRemain) {
    homeDescParts.push(
      "",
      `<a:VC_Events:1482706144953897223> **Contest sfondi:** voti disponibili — **Mobile ${contestVoteRemain.mobileRemaining}** · **PC ${contestVoteRemain.pcRemaining}**`,
    );
  }
  if (!hideValutazioniWarnForTarget) {
    homeDescParts.push(
      "",
      `<:VC_Stats:1482527532682055780> **Valutazioni:** 
    <:thumbsup:1471292172145004768> ${pos}
    <:thumbsdown:1471292163957457013> ${neg}`,
      "",
      `<:banhammer:1443651875441217639> **Warn staff:** ${warns}`,
    );
  }
  if (hasPm) {
    homeDescParts.push("",`<:VC_Partner:1482527213780729896> **Punti:** ${puntiPartner}`);
  }
  homeDescParts.push("","Seleziona una sezione dal menu per i dettagli.");
  const homeDesc = homeDescParts.join("\n");
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${viewerName}`)
        .setDescription(homeDesc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    ],
    components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, partnerHomeRows), viewerId, tid, sourceMessageId),
  };
}

module.exports = {
  PANEL_PREFIX,
  STAFF_HP_PREFIX,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_MODSTATS,
  formatStaffProfileSelectCustomId,
  parseStaffProfileSelectCustomId,
  formatStaffProfileCloseCustomId,
  parseStaffProfileCloseCustomId,
  formatStaffHpButtonCustomId,
  buildStaffProfilePayload,
  viewerCanUsePartnerPointsPanel,
  viewerIsCoordinatorOrAbove,
  viewerIsFounderOrCoFounder,
};