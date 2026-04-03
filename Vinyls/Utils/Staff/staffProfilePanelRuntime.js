const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { getUserOverviewStats } = require("../../Services/Community/activityService");
const { STAFF_WARN_RESET_MS } = require("../../Services/Staff/staffWarnService");
const { countModActionsByMod } = require("../Moderation/modCaseStore");
const { buildPauseListPayload } = require("../Pause/pauseListRuntime");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const { buildPartnerLeaderboardPayload, countValidAllTimePartners } = require("../Partner/partnerLeaderboardRuntime");

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
const SECTION_STATS = "stats";
const SECTION_MODSTATS = "modstats";
const SECTION_PARTNER_LB = "partner_lb";
const PROFILE_FULL = "full";
const PROFILE_PM_ONLY = "pm_only";
const PROFILE_PROSPECT = "prospect";
const TIME_ZONE = "Europe/Rome";
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 250, hours: 2.5 },
  [String(IDs.roles.Mod)]: { messages: 350, hours: 3.5 },
  [String(IDs.roles.Coordinator)]: { messages: 450, hours: 4.5 },
  [String(IDs.roles.Supervisor)]: { messages: 500, hours: 5 },
};
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
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
].filter(Boolean);
const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

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

/** High Staff, Founder o Co-Founder: gestione punti partner su **altri** profili. */
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
  IDs.roles.Manager,
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

function buildProspectPexRows(viewerId, targetId) {
  const v = String(viewerId);
  const t = String(targetId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_helper", v, t, SECTION_HOME))
        .setLabel("Member → Helper")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_mod", v, t, SECTION_HOME))
        .setLabel("Member → Mod")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_coord", v, t, SECTION_HOME))
        .setLabel("Member → Coord")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_supervisor", v, t, SECTION_HOME))
        .setLabel("Member → Supervisor")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_admin", v, t, SECTION_HOME))
        .setLabel("Member → Admin")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_manager", v, t, SECTION_HOME))
        .setLabel("Member → Manager")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_cofounder", v, t, SECTION_HOME))
        .setLabel("Member → Co-Founder")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_founder", v, t, SECTION_HOME))
        .setLabel("Member → Founder")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, SECTION_HOME))
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

function getStaffPauseLine(staffDoc) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      return `<a:VC_Calendar:1482706208149475358> In pausa fino al **${p.dataRitorno}**`;
    }
    if (end < today && end >= sevenDaysAgo) {
      return `<a:VC_Calendar:1482706208149475358> Rientrato il **${p.dataRitorno}**`;
    }
  }
  return "<a:VC_Cross:1482532424570376253> Nessuna pausa in corso.";
}

function dayKeyToWeekdayLabel(dayKey) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

const CHART_COL_W = 6;

function centerInColumn(text, width = CHART_COL_W) {
  const s = String(text ?? "");
  const pad = Math.max(0, width - s.length);
  const left = Math.floor(pad / 2);
  return `${" ".repeat(left)}${s}${" ".repeat(pad - left)}`;
}

function barCharForValue(n, maxVal) {
  const safeMax = Math.max(1, Number(maxVal) || 1);
  const v = Math.max(0, Number(n || 0));
  const level = Math.min(7, Math.floor((7 * v) / safeMax));
  return COSTANZA_BARS[level];
}

function buildAlignedDayChartBlock(chartPoints, getNumericValue) {
  if (!Array.isArray(chartPoints) || !chartPoints.length) {
    return "— nessun dato —";
  }
  const nums = chartPoints.map((p) => Number(getNumericValue(p) || 0));
  const maxVal = Math.max(1, ...nums);
  const labelLine = chartPoints
    .map((p) => centerInColumn(dayKeyToWeekdayLabel(p?.dayKey).slice(0, 3), CHART_COL_W))
    .join("");
  const barLine = chartPoints
    .map((_, i) => centerInColumn(barCharForValue(nums[i], maxVal), CHART_COL_W))
    .join("");
  return `${labelLine}\n${barLine}`;
}

function formatStaffProfileSelectCustomId(viewerId, targetId) {
  return `${PANEL_PREFIX}:select:${viewerId}:${targetId}`;
}

function parseStaffProfileSelectCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PANEL_PREFIX || parts[1] !== "select") return null;
  return { viewerId: parts[2], targetId: parts[3] };
}

function formatStaffProfilePlbCustomId(viewerId, targetId, mode) {
  const m = String(mode || "").toLowerCase() === "settimanale" ? "settimanale" : "totale";
  return `${PANEL_PREFIX}:plb:${viewerId}:${targetId}:${m}`;
}

function parseStaffProfilePlbCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== PANEL_PREFIX || parts[1] !== "plb") return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  const modeRaw = String(parts[4] || "").toLowerCase();
  const mode = modeRaw === "settimanale" ? "settimanale" : "totale";
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  return { viewerId, targetId, mode };
}

function buildStaffPartnerLbToggleRow(viewerId, targetId, currentMode) {
  const v = String(viewerId);
  const t = String(targetId);
  const active = String(currentMode || "").toLowerCase() === "settimanale" ? "settimanale" : "totale";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(formatStaffProfilePlbCustomId(v, t, "totale"))
      .setLabel("Totale")
      .setStyle(active === "totale" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(formatStaffProfilePlbCustomId(v, t, "settimanale"))
      .setLabel("Settimanale")
      .setStyle(active === "settimanale" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function formatStaffHpButtonCustomId(action, viewerId, targetId, section = SECTION_HOME, partnerLbMode) {
  const sec = String(section || SECTION_HOME).toLowerCase();
  if (sec === SECTION_PARTNER_LB) {
    const m = String(partnerLbMode || "").toLowerCase() === "settimanale" ? "settimanale" : "totale";
    return `${STAFF_HP_PREFIX}:${action}:${viewerId}:${targetId}:${sec}:${m}`;
  }
  return `${STAFF_HP_PREFIX}:${action}:${viewerId}:${targetId}:${sec}`;
}

function buildHighStaffActionRows(viewerId, targetId, section, dualPmStaffDepex = false) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || "").toLowerCase();
  if (sec === SECTION_HOME) {
    if (dualPmStaffDepex) {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(formatStaffHpButtonCustomId("pex", v, t, sec))
            .setLabel("Pex")
            .setEmoji("<a:VC_Verified:1482532479637127188>")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, sec))
            .setLabel("Pex Partner Manager")
            .setEmoji("<:partnermanager:1443651916838998099>")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(formatStaffHpButtonCustomId("depex_staff", v, t, sec))
            .setLabel("Depex scala staff")
            .setEmoji("<a:VC_Cross:1482532424570376253>")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(formatStaffHpButtonCustomId("depex_pm_only", v, t, sec))
            .setLabel("Depex Partner Manager")
            .setEmoji("<:partnermanager:1443651916838998099>")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("pex", v, t, sec))
          .setLabel("Pex")
          .setEmoji("<a:VC_Verified:1482532479637127188>")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, sec))
          .setLabel("Pex Partner Manager")
          .setEmoji("<:partnermanager:1443651916838998099>")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("depex", v, t, sec))
          .setLabel("Depex")
          .setEmoji("<a:VC_Cross:1482532424570376253>")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  if (sec === SECTION_VALUTAZIONI) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("valpos", v, t, sec))
          .setLabel("Aggiungi Positiva")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("valneg", v, t, sec))
          .setLabel("Aggiungi Negativa")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("valpos_rm", v, t, sec))
          .setLabel("Rimuovi Positiva")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("valneg_rm", v, t, sec))
          .setLabel("Rimuovi Negativa")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  if (sec === SECTION_WARN) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("warn", v, t, sec))
          .setLabel("Aggiungi Warn")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(formatStaffHpButtonCustomId("warn_rm", v, t, sec))
          .setLabel("Rimuovi Warn")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  return [];
}

function buildPmOnlyPartnerRows(viewerId, targetId, section = SECTION_PARTNER_LB, partnerLbMode = "totale") {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_PARTNER_LB).toLowerCase();
  const lb = sec === SECTION_PARTNER_LB ? partnerLbMode : undefined;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("depex", v, t, sec, lb))
        .setLabel("Depex")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_add", v, t, sec, lb))
        .setLabel("Aggiungi punti")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_remove", v, t, sec, lb))
        .setLabel("Rimuovi punti")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

/** Solo punti partner: usata per la classifica (non Depex: quelli restano in Home). */
function buildPartnerPointsOnlyRow(viewerId, targetId, section = SECTION_HOME, partnerLbMode = "totale") {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  const lb = sec === SECTION_PARTNER_LB ? partnerLbMode : undefined;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_add", v, t, sec, lb))
        .setLabel("Aggiungi punti")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_remove", v, t, sec, lb))
        .setLabel("Rimuovi punti")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function shouldAttachHighStaffActions(section, viewerId, targetUserId, viewerIsHighStaff, profileKind, viewerMember) {
  const sec = String(section || "").toLowerCase();
  const pmHome = profileKind === PROFILE_PM_ONLY && sec === SECTION_HOME;
  if (profileKind !== PROFILE_FULL && !pmHome) return false;
  const self = String(viewerId) === String(targetUserId);
  if (self) {
    if (!viewerIsFounderOrCoFounder(viewerMember)) return false;
  } else if (!viewerIsHighStaff) {
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

function buildProfileSelectRow(viewerId, targetId, section, profileKind, hasPartnerManager = false) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  if (profileKind === PROFILE_PROSPECT) return null;
  if (profileKind === PROFILE_PM_ONLY) {
    const opts = [
      { label: "Panoramica", value: SECTION_HOME, emoji: "<:partnermanager:1443651916838998099>", default: sec === SECTION_HOME },
      { label: "Pause", value: SECTION_PAUSE, emoji: "<a:VC_Calendar:1482706208149475358>", default: sec === SECTION_PAUSE },
      { label: "Classifica partner", value: SECTION_PARTNER_LB, emoji: "<a:VC_Winner:1482535294757507255>", default: sec === SECTION_PARTNER_LB },
    ];
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(formatStaffProfileSelectCustomId(v, t))
        .setPlaceholder("Profilo Partner Manager")
        .addOptions(...opts),
    );
  }
  const opts = [
    { label: "Home", value: SECTION_HOME, emoji: "<:staff:1443651912179388548>", default: sec === SECTION_HOME },
    { label: "Valutazioni", value: SECTION_VALUTAZIONI, emoji: "<:VC_Stats:1482527532682055780>", default: sec === SECTION_VALUTAZIONI },
    { label: "Warn staff", value: SECTION_WARN, emoji: "<:banhammer:1443651875441217639>", default: sec === SECTION_WARN },
    { label: "Pause", value: SECTION_PAUSE, emoji: "<a:VC_Calendar:1482706208149475358>", default: sec === SECTION_PAUSE },
    { label: "Stats", value: SECTION_STATS, emoji: "<:VC_Clock:1473359204189474886>", default: sec === SECTION_STATS },
    { label: "Modstats", value: SECTION_MODSTATS, emoji: "<:VC_Stats:1482527532682055780>", default: sec === SECTION_MODSTATS },
  ];
  if (hasPartnerManager) {
    opts.push({
      label: "Classifica partner",
      value: SECTION_PARTNER_LB,
      emoji: "<a:VC_Winner:1482535294757507255>",
      default: sec === SECTION_PARTNER_LB,
    });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatStaffProfileSelectCustomId(viewerId, targetId))
      .setPlaceholder("Sezione profilo staff")
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
  const viewerCanPartnerPointsPanel = viewerCanUsePartnerPointsPanel(viewerMemForPanel);
  const profileKind = resolveStaffProfileKind(member);
  const pmRoleId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmRoleId && member?.roles?.cache?.has(pmRoleId));

  if (profileKind === PROFILE_PROSPECT) {
    const pexComps =
      viewerIsHighStaff && String(viewerId) !== tid ? buildProspectPexRows(String(viewerId), tid) : [];
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
      components: mergeProfileComponents(null, pexComps),
    };
  }

  const staffRoleId = member ? resolveStaffRole(member) : null;
  const displayRoleId = member ? resolveStaffProfileDisplayRoleId(member) : null;
  let roleLabel = "—";
  if (displayRoleId) {
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

  const overview = await getUserOverviewStats(gid, tid, 7).catch(() => null);
  const d7 = overview?.windows?.d7 || {};
  const weeklyMsg = Math.max(0, Math.floor(Number(d7.text || 0)));
  const weeklySec = Math.max(0, Math.floor(Number(d7.voiceSeconds || 0)));
  const weeklyHours = weeklySec / 3600;
  const limits = staffRoleId ? STAFF_ACTIVITY_LIMITS[String(staffRoleId)] : null;

  let sec = String(section || SECTION_HOME).toLowerCase();
  if (profileKind === PROFILE_PM_ONLY) {
    const allowedPm = new Set([SECTION_HOME, SECTION_PAUSE, SECTION_PARTNER_LB]);
    if (!allowedPm.has(sec)) sec = SECTION_HOME;
  }
  const canPartnerLb = profileKind === PROFILE_PM_ONLY || (profileKind === PROFILE_FULL && hasPm);
  if (sec === SECTION_PARTNER_LB && !canPartnerLb) sec = SECTION_HOME;

  const selectRow = buildProfileSelectRow(String(viewerId), tid, sec, profileKind, profileKind === PROFILE_FULL && hasPm);
  const dualPmStaffDepex = profileKind === PROFILE_FULL && memberHasPmAndStaffLadderForDualDepex(member);
  const highStaffRows = shouldAttachHighStaffActions(sec, viewerId, tid, viewerIsHighStaff, profileKind, viewerMemForPanel)
    ? buildHighStaffActionRows(String(viewerId), tid, sec, dualPmStaffDepex)
    : [];
  const hsRows = [...highStaffRows];

  if (canPartnerLb && sec === SECTION_PARTNER_LB) {
    const lbMode = String(options?.partnerLbMode || "").toLowerCase() === "settimanale" ? "settimanale" : "totale";
    const lbPayload = await buildPartnerLeaderboardPayload(client, guild, lbMode, 1);
    const mainEmbed = EmbedBuilder.from(lbPayload.embeds[0]);
    const prev = mainEmbed.data?.description ?? "";
    mainEmbed.setDescription(`${prev}\n\n`);
    const plbRow = buildStaffPartnerLbToggleRow(String(viewerId), tid, lbMode);
    const v = String(viewerId);
    const selfLb = v === tid;
    const canHsPartnerPoints =
      viewerCanPartnerPointsPanel &&
      (profileKind === PROFILE_PM_ONLY || (profileKind === PROFILE_FULL && hasPm)) &&
      (!selfLb || viewerIsFounderOrCoFounder(viewerMemForPanel));
    const pmRowsForPartnerLb = canHsPartnerPoints
      ? profileKind === PROFILE_FULL && hasPm
        ? buildPartnerPointsOnlyRow(v, tid, SECTION_PARTNER_LB, lbMode)
        : buildPmOnlyPartnerRows(v, tid, SECTION_PARTNER_LB, lbMode)
      : [];
    return { embeds: [mainEmbed], components: mergeProfileComponents(selectRow, pmRowsForPartnerLb, [plbRow]) };
  }

  if (profileKind === PROFILE_PM_ONLY && sec === SECTION_HOME) {
    const pauseShort = getStaffPauseLine(s);
    const punti = resolveStaffPartnerPointsDisplay(s);
    const pmHomeDesc = [
      `<:VC_Staff:1479443779571155086> **Ruolo:** ${roleLabel}`,
      "",
      `<a:VC_Calendar:1482706208149475358> **Pause:** ${pauseShort}`,
      "",
      `<:VC_Partner:1482527213780729896> **Punti partner:** ${punti}`,
    ].join("\n");
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(`<:VC_addperson:1485419347068588073> Profilo Staff ${name}`)
          .setDescription(pmHomeDesc.slice(0, 4090))
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
      ],
      components: mergeProfileComponents(selectRow, hsRows),
    };
  }

  if (sec === SECTION_VALUTAZIONI) {
    const posLines = posReasons.map((r, i) => `**+${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const negLines = negReasons.map((r, i) => `**−${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const body = [
      posLines.length ? "<:thumbsup:1471292172145004768> **Positive**" : "<:thumbsup:1471292172145004768> **Positive** — nessuna.",
      ...posLines,
      "",
      negLines.length ? "<:thumbsdown:1471292163957457013> **Negative**" : "<:thumbsdown:1471292163957457013> **Negative** — nessuna.",
      ...negLines,
    ].join("\n");
    const chunks = chunkString(body, 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(desc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    );
    return { embeds, components: mergeProfileComponents(selectRow, hsRows) };
  }

  if (sec === SECTION_WARN) {
    const lines = [
      warnResetLine(s.firstWarnStaffAt),
      "",
    ];
    if (warnReasons.length) {
      lines.push("<:VC_PinkQuestionMark:1471892611026391306> **Motivazioni**");
      warnReasons.forEach((r, i) => lines.push(`**${i + 1}.** ${String(r || "—").slice(0, 900)}`));
    } else {
      lines.push("<a:VC_Cross:1482532424570376253> Nessun warn registrato.");
    }
    const chunks = chunkString(lines.join("\n"), 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(desc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    );
    return { embeds, components: mergeProfileComponents(selectRow, hsRows) };
  }

  if (sec === SECTION_PAUSE) {
    const targetUserObj = targetUser || { id: tid, username: name };
    const listPayload = await buildPauseListPayload({
      guildId: gid,
      requesterId: String(viewerId),
      targetUser: targetUserObj,
      isHighStaff: viewerIsHighStaff,
      client,
    });
    if (!listPayload.ok) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(listPayload.error || "Errore caricamento pause."),
        ],
        components: mergeProfileComponents(selectRow, hsRows),
      };
    }
    return {
      embeds: [...listPayload.embeds],
      components: mergeProfileComponents(selectRow, hsRows, listPayload.components || []),
    };
  }

  if (sec === SECTION_STATS) {
    const chart = Array.isArray(overview?.chart) ? overview.chart.slice(-7) : [];
    const msgBlock = buildAlignedDayChartBlock(chart, (p) => p?.text ?? 0);
    const vocBlock = buildAlignedDayChartBlock(chart, (p) => Number(p?.voiceSeconds || 0) / 3600);
    const limitLines = limits
      ? (() => {
        const msgLeft = Math.max(0, limits.messages - weeklyMsg);
        const vocLeft = Math.max(0, limits.hours - weeklyHours);
        const msgLine =
          msgLeft > 0
            ? `<:VC_Chat:1482532573002465413> Messaggi: **${weeklyMsg}** / ${limits.messages} — mancano **${msgLeft}**`
            : `<:VC_Chat:1482532573002465413> Messaggi: **${weeklyMsg}** / ${limits.messages}`;
        const vocLine =
          vocLeft > 0
            ? `<a:VC_Mute:1482534751511515238> Vocale: **${weeklyHours.toFixed(2)}h** / ${limits.hours}h — mancano **${vocLeft.toFixed(2)}h**`
            : `<a:VC_Mute:1482534751511515238> Vocale: **${weeklyHours.toFixed(2)}h** / ${limits.hours}h`;
        return ["", "<:VC_Stats:1482527532682055780> **Limiti settimanali**", msgLine, vocLine];
      })()
      : [
        "",
        `<:VC_Chat:1482532573002465413> Messaggi negli ultimi 7 giorni: **${weeklyMsg}**`,
        `<a:VC_Mute:1482534751511515238> Vocale negli ultimi 7 giorni: **${weeklyHours.toFixed(2)}h**`,
      ];
    const desc = [
      "<:VC_Chat:1482532573002465413> **Messaggi / giorno**",
      "```",
      msgBlock,
      "```",
      "",
      "<a:VC_Mute:1482534751511515238> **Ore vocali / giorno**",
      "```",
      vocBlock,
      "```",
      ...limitLines,
    ].join("\n");
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(desc.slice(0, 4090))
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
      ],
      components: mergeProfileComponents(selectRow, hsRows),
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
        components: mergeProfileComponents(selectRow, hsRows),
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
      components: mergeProfileComponents(selectRow, hsRows),
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
    "",
    `<:VC_Stats:1482527532682055780> **Valutazioni:** 
    <:thumbsup:1471292172145004768> ${pos}
    <:thumbsdown:1471292163957457013> ${neg}`,
    "",
    `<:banhammer:1443651875441217639> **Warn staff:** ${warns}`,
    "",
    `<:VC_Stats:1482527532682055780> **Attività:** 
    <:VC_Chat:1482532573002465413> **${weeklyMsg}** messaggi
    <a:VC_Mute:1482534751511515238> **${weeklyHours.toFixed(2)}h** vocale`,
    "",
    ];
  if (hasPm) {
    homeDescParts.push(
      "",
      `<:VC_Partner:1482527213780729896> **Punti:** ${puntiPartner}`,
    );
  }
  homeDescParts.push("", "Seleziona una sezione dal menu per i dettagli.");
  const homeDesc = homeDescParts.join("\n");
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${viewerName}`)
        .setDescription(homeDesc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    ],
    components: mergeProfileComponents(selectRow, hsRows),
  };
}

module.exports = {
  PANEL_PREFIX,
  STAFF_HP_PREFIX,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_STATS,
  SECTION_MODSTATS,
  SECTION_PARTNER_LB,
  formatStaffProfileSelectCustomId,
  parseStaffProfileSelectCustomId,
  parseStaffProfilePlbCustomId,
  formatStaffHpButtonCustomId,
  buildStaffProfilePayload,
  viewerCanUsePartnerPointsPanel,
  viewerIsFounderOrCoFounder,
};