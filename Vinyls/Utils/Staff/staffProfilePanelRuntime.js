const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { STAFF_WARN_RESET_MS } = require("../../Services/Staff/staffWarnService");
const { countModActionsByMod } = require("../Moderation/modCaseStore");
const { buildPauseListPayload } = require("../Pause/pauseListRuntime");
const { roleChoiceAppliesTo, PAUSE_ROLE_PM } = require("../Pause/pauseHandlersUtils");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const { resolvePartnerPointsShown } = require("./partnerPointsDisplayUtils");
const { PARTNER_MANAGER_REDEEM_TIERS, partnerManagerRedeemButtonLabel } = require("./partnerPointsUtils");
const { accountUsername, userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

function resolveStaffPartnerPointsDisplay(staffObj) {
  return resolvePartnerPointsShown(staffObj);
}

/** Riscatto premi PM: solo chi apre il pannello (High Staff / Founder) sul profilo **di un altro** PM. Mostra solo tier con saldo ≥ soglia. */
function buildPartnerManagerRedeemRows(viewerId, targetId, section = SECTION_HOME, sourceMessageId = null, partnerPointsShown = 0) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  const pts = Math.max(0, Math.floor(Number(partnerPointsShown || 0)));
  const tiers = PARTNER_MANAGER_REDEEM_TIERS.filter((n) => pts >= n);
  if (!tiers.length) return [];
  const buttons = tiers.map((tier) =>
    new ButtonBuilder()
      .setCustomId(formatStaffHpButtonCustomId(`ppm_r${tier}`, v, t, sec, sourceMessageId))
      .setLabel(partnerManagerRedeemButtonLabel(tier))
      .setStyle(ButtonStyle.Primary),
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

/** Premi 50/100: applicazione permessi/ruolo (bottoni separati dal riscatto punti). */
function buildPartnerManagerApplyPerkRows(viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_a50", v, t, sec, sourceMessageId))
        .setLabel("Premio 50 · CR+Voc 30g")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("ppm_a100", v, t, sec, sourceMessageId))
        .setLabel("Premio 100 · VIP 30g")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}
const PANEL_PREFIX = "staff_profile_panel";
const STAFF_HP_PREFIX = "staff_hp";
const STAFF_HP_SELECT_PREFIX = "staff_hp_select";
const SECTION_HOME = "home";
const SECTION_VALUTAZIONI = "valutazioni";
const SECTION_WARN = "warn";
const SECTION_PAUSE = "pause";
const SECTION_MODSTATS = "modstats";
const STAFF_HP_BUTTON_SECTION_IDS = new Set([SECTION_HOME, SECTION_VALUTAZIONI, SECTION_WARN, SECTION_PAUSE, SECTION_MODSTATS]);
const STAFF_HP_SECTION_CHAR_MAP = {
  [SECTION_HOME]: "h",
  [SECTION_VALUTAZIONI]: "v",
  [SECTION_WARN]: "w",
  [SECTION_PAUSE]: "p",
  [SECTION_MODSTATS]: "m",
};
const STAFF_HP_SECTION_CHAR_REVERSE = Object.fromEntries(
  Object.entries(STAFF_HP_SECTION_CHAR_MAP).map(([sec, ch]) => [ch, sec]),
);
const STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT = {
  pex_menu: "pxm",
  depex_menu: "dxm",
  val_add_menu: "vam",
  val_remove_menu: "vrm",
  pex: "pex",
  pex_helper: "phl",
  pex_mod: "pmo",
  pex_admin: "pxa",
  pex_founder: "pfn",
  pex_pm: "ppm",
  depex: "dpx",
  depex_full: "dff",
  depex_staff: "dst",
  depex_pm_only: "dpo",
  valpos: "vps",
  valneg: "vng",
  warn: "wrn",
  valpos_rm: "vpr",
  valneg_rm: "vnr",
  warn_rm: "wrr",
  ppm_add: "pma",
  ppm_remove: "pmr",
};
const STAFF_HP_BUTTON_ACTION_SHORT_TO_FULL = Object.fromEntries(
  Object.entries(STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT).map(([full, short]) => [short, full]),
);

function encodeStaffHpButtonAction(action) {
  const a = String(action || "");
  if (STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT[a]) return STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT[a];
  const m = /^ppm_r(\d+)$/.exec(a);
  if (m) {
    const n = Number(m[1]);
    if (PARTNER_MANAGER_REDEEM_TIERS.includes(n)) return `r${m[1]}`;
  }
  const ma = /^ppm_a(\d+)$/.exec(a);
  if (ma) {
    const n = Number(ma[1]);
    if (n === 50 || n === 100) return `a${ma[1]}`;
  }
  return a;
}

function decodeStaffHpButtonActionToken(token) {
  const t = String(token || "");
  if (STAFF_HP_BUTTON_ACTION_SHORT_TO_FULL[t]) return STAFF_HP_BUTTON_ACTION_SHORT_TO_FULL[t];
  const m = /^r(\d+)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (PARTNER_MANAGER_REDEEM_TIERS.includes(n)) return `ppm_r${m[1]}`;
  }
  return t;
}

function staffHpSectionToken(section) {
  const sec = String(section || SECTION_HOME).toLowerCase();
  return STAFF_HP_SECTION_CHAR_MAP[sec] || "h";
}

function parseStaffHpButtonSectionToken(raw) {
  const x = String(raw || "").toLowerCase();
  if (STAFF_HP_SECTION_CHAR_REVERSE[x]) return STAFF_HP_SECTION_CHAR_REVERSE[x];
  if (STAFF_HP_BUTTON_SECTION_IDS.has(x)) return x;
  return SECTION_HOME;
}

const LEGACY_PARTNER_LB_SECTION = "partner_lb";
const PROFILE_FULL = "full";
const PROFILE_PM_ONLY = "pm_only";
const PROFILE_PROSPECT = "prospect";
const STAFF_ROLE_PRIORITY = [String(IDs.roles.Mod), String(IDs.roles.Helper), String(IDs.roles.Staff)].filter(Boolean);
const STAFF_PROFILE_DISPLAY_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
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
      (IDs.roles.Founder && c.has(IDs.roles.Founder)),
  );
}

function viewerIsFounder(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(IDs.roles.Founder && c.has(IDs.roles.Founder));
}

function targetIsFounder(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(IDs.roles.Founder && c.has(IDs.roles.Founder));
}

/** Depex completo su Admin+: High Staff (senza scala Mod), Admin, Founder. */
function viewerIsCoordinatorOrAbove(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(
    (IDs.roles.Admin && c.has(IDs.roles.Admin)) ||
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
  IDs.roles.Admin,
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

function buildProspectPexRows(viewerId, targetId, sourceMessageId = null, includeFounderOnlyAdvanceSelect = false) {
  const v = String(viewerId);
  const t = String(targetId);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_helper", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Helper")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Member → Partner Manager")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (includeFounderOnlyAdvanceSelect) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(formatStaffHpSelectCustomId("prospect_pex", v, t, SECTION_HOME, sourceMessageId))
          .setPlaceholder("Promuovi a ruolo staff avanzato (solo Founder)")
          .addOptions(
            { label: "Member → Mod", value: "pex_mod", emoji: "<:VC_Staff:1494286904089247754>" },
            { label: "Member → Admin", value: "pex_admin", emoji: "<:VC_Staff:1494286904089247754>" },
          ),
      ),
    );
  }
  return rows;
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

function formatStaffProfileNextCustomId(viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:next:${viewerId}:${targetId}`, sourceMessageId);
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

function parseStaffProfileNextCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PANEL_PREFIX || parts[1] !== "next") return null;
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

const STAFF_PANEL_NON_PM_ROLE_IDS = [
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.HighStaff,
  IDs.roles?.Mod,
  IDs.roles?.Helper,
  IDs.roles?.Staff,
].filter(Boolean).map((id) => String(id));

const STAFF_PANEL_NAV_ROLE_PRIORITY = [
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.HighStaff,
  IDs.roles?.Mod,
  IDs.roles?.Helper,
  IDs.roles?.Staff,
].filter(Boolean).map((id) => String(id));

function resolveStaffPanelRoleOrder(member) {
  if (!member?.roles?.cache) return Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < STAFF_PANEL_NAV_ROLE_PRIORITY.length; i++) {
    if (member.roles.cache.has(STAFF_PANEL_NAV_ROLE_PRIORITY[i])) return i;
  }
  return Number.MAX_SAFE_INTEGER;
}

function listEligibleStaffPanelMemberIds(guild, options = {}) {
  if (!guild?.members?.cache) return [];
  const partnersChatPanel = options.partnersChatPanel === true;
  const pmRoleId = String(IDs.roles?.PartnerManager || "");
  const entries = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (!member?.roles?.cache) continue;
    if (partnersChatPanel) {
      if (pmRoleId && member.roles.cache.has(pmRoleId)) {
        entries.push({
          id: String(member.id),
          roleOrder: Number.MAX_SAFE_INTEGER,
          name: String(member.displayName || member.user?.username || member.id).toLowerCase(),
        });
      }
      continue;
    }
    const hasNonPmStaff = STAFF_PANEL_NON_PM_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
    if (hasNonPmStaff) {
      entries.push({
        id: String(member.id),
        roleOrder: resolveStaffPanelRoleOrder(member),
        name: String(member.displayName || member.user?.username || member.id).toLowerCase(),
      });
    }
  }
  entries.sort((a, b) => {
    if (a.roleOrder !== b.roleOrder) return a.roleOrder - b.roleOrder;
    const byName = a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
  return entries.map((row) => row.id);
}

function resolveNextStaffPanelTargetId(guild, currentTargetId, options = {}) {
  const list = listEligibleStaffPanelMemberIds(guild, options);
  if (list.length < 2) return null;
  const current = String(currentTargetId || "");
  const idx = list.indexOf(current);
  if (idx < 0) return list[0] || null;
  return list[(idx + 1) % list.length] || null;
}

function formatStaffHpButtonCustomId(action, viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const secTok = staffHpSectionToken(section);
  const actTok = encodeStaffHpButtonAction(action);
  return withSourceSuffix(`${STAFF_HP_PREFIX}:${actTok}:${viewerId}:${targetId}:${secTok}`, sourceMessageId);
}

function formatStaffHpSelectCustomId(action, viewerId, targetId, section = SECTION_HOME, sourceMessageId = null) {
  const secTok = staffHpSectionToken(section);
  return withSourceSuffix(`${STAFF_HP_SELECT_PREFIX}:${action}:${viewerId}:${targetId}:${secTok}`, sourceMessageId);
}

function shouldOmitPexDepexHomeRow(viewerId, targetUserId, targetMember) {
  if (String(viewerId) === String(targetUserId)) return true;
  const founderId = IDs.roles?.Founder;
  if (founderId && targetMember?.roles?.cache?.has(founderId)) return true;
  return false;
}

function buildHighStaffActionRows(
  viewerId,
  targetId,
  section,
  dualPmStaffDepex = false,
  targetHasPartnerManager = false,
  sourceMessageId = null,
  omitPexDepexHome = false,
) {
  const v = String(viewerId);
  const t = String(targetId);
  let sec = String(section || "").toLowerCase();
  if (sec === SECTION_WARN) sec = SECTION_VALUTAZIONI;
  if (sec === SECTION_HOME) {
    if (omitPexDepexHome) return [];
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
        .setCustomId(formatStaffHpButtonCustomId("depex_pm_only", v, t, sec, sourceMessageId))
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
  if (profileKind !== PROFILE_FULL) return false;
  const self = String(viewerId) === String(targetUserId);
  if (self) {
    if (!viewerIsFounder(viewerMember)) return false;
  } else if (!viewerIsHighStaff) {
    return false;
  }
  if (targetIsFounder(targetMember) && (sec === SECTION_VALUTAZIONI || sec === SECTION_WARN)) {
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

function buildProfileCloseRow(viewerId, targetId, sourceMessageId = null, options = {}) {
  const components = [];
  if (options.enableNextTargetButton) {
    components.push(
      new ButtonBuilder()
        .setCustomId(formatStaffProfileNextCustomId(String(viewerId), String(targetId), sourceMessageId))
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  components.push(
    new ButtonBuilder()
      .setCustomId(formatStaffProfileCloseCustomId(String(viewerId), String(targetId), sourceMessageId))
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(ButtonStyle.Danger),
  );
  return new ActionRowBuilder().addComponents(...components);
}

function withCloseProfileComponents(components, viewerId, targetId, sourceMessageId = null, options = {}) {
  return [...(Array.isArray(components) ? components : []), buildProfileCloseRow(viewerId, targetId, sourceMessageId, options)];
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
  const homeLabel = selectOptions.partnersChatHomeLabel ? "Home" : "Panoramica";
  if (profileKind === PROFILE_PROSPECT) return null;
  if (profileKind === PROFILE_PM_ONLY) {
    const opts = [
      { label: homeLabel, value: SECTION_HOME, emoji: "<:VC_PartnerManager:1494286911286808576>", default: sec === SECTION_HOME },
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
    { label: "Home", value: SECTION_HOME, emoji: "<:VC_Staff:1494286904089247754>", default: sec === SECTION_HOME },
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
  if (left <= 0) return "<:VC_Clock:1473359204189474886> I warn possono essere stati azzerati dal ciclo automatico.";
  const days = Math.ceil(left / (24 * 60 * 60 * 1000));
  return `<:VC_Clock:1473359204189474886> Prossimo reset automatico warn: tra ~**${days}** giorni (<t:${Math.floor(resetAt / 1000)}:R>).`;
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
  const member =
    (await getGuildMemberCached(guild, tid, { preferFresh: true }).catch(() => null)) ||
    (await guild.members.fetch({ user: tid, force: true }).catch(() => null));
  const targetUser = member?.user || (await client.users.fetch(tid).catch(() => null));
  const name = (member ? accountUsername(member) : accountUsername(targetUser)) || tid;
  const viewerMemForPanel =
    (await getGuildMemberCached(guild, String(viewerId), { preferFresh: true }).catch(() => null)) ||
    (await guild.members.fetch({ user: String(viewerId), force: true }).catch(() => null));
  const viewerIsHighStaff = Boolean(viewerMemForPanel?.roles?.cache?.has(IDs.roles.HighStaff));
  const viewerCanFullDepex = viewerIsCoordinatorOrAbove(viewerMemForPanel);
  const viewerCanPartnerPointsPanel = viewerCanUsePartnerPointsPanel(viewerMemForPanel);
  const profileKind = resolveStaffProfileKind(member);
  const sourceMessageId = normalizeSourceMessageId(options?.sourceMessageId);
  const pmRoleId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmRoleId && member?.roles?.cache?.has(pmRoleId));
  const partnersChatPanelMode = options?.partnersChatPanel === true;
  const usePartnersChatPmPanel = partnersChatPanelMode && hasPm;
  const enableNextTargetButton = Boolean(resolveNextStaffPanelTargetId(guild, tid, { partnersChatPanel: partnersChatPanelMode }));

  if (partnersChatPanelMode && !hasPm) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#992d22")
          .setDescription(
            "<:VC_Attention:1482534443632558151> In **#partners-chat** puoi consultare solo utenti con ruolo **Partner Manager**.",
          ),
      ],
      components: withCloseProfileComponents([], viewerId, tid, sourceMessageId, { enableNextTargetButton }),
    };
  }

  if (profileKind === PROFILE_PROSPECT) {
    const pexComps =
      viewerIsHighStaff && String(viewerId) !== tid
        ? buildProspectPexRows(
            String(viewerId),
            tid,
            sourceMessageId,
            viewerIsFounder(viewerMemForPanel),
          )
        : [];
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            `<:VC_Staff:1494286904089247754> **${name}** non ha ruoli Staff né Partner Manager.\n\n` +
            "<a:VC_Verified:1482532479637127188> Usa i pulsanti per pexare direttamente da **Member** verso un ruolo Staff o Partner Manager.",
          )
          .setThumbnail(userAvatarUrlDynamic(targetUser, { size: 128 }) || null),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(null, pexComps), viewerId, tid, sourceMessageId, { enableNextTargetButton }),
    };
  }

  const displayRoleId = member ? resolveStaffProfileDisplayRoleId(member) : null;
  let roleLabel = "—";
  if (usePartnersChatPmPanel) {
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
  if (profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel) {
    const allowedPm = new Set([SECTION_HOME, SECTION_PAUSE]);
    if (!allowedPm.has(sec)) sec = SECTION_HOME;
  }

  const hideValutazioniWarnForTarget = Boolean(
    member && profileKind === PROFILE_FULL && !usePartnersChatPmPanel && targetIsFounder(member),
  );
  if (hideValutazioniWarnForTarget && (sec === SECTION_VALUTAZIONI || sec === SECTION_WARN)) {
    sec = SECTION_HOME;
  }

  const canHsPartnerPoints =
    viewerCanPartnerPointsPanel &&
    (profileKind === PROFILE_PM_ONLY ||
      usePartnersChatPmPanel ||
      (profileKind === PROFILE_FULL && hasPm));
  const omitPexDepexHome = shouldOmitPexDepexHomeRow(viewerId, tid, member);
  const showHsPexDepexOnHome =
    sec === SECTION_HOME &&
    shouldAttachHighStaffActions(
      sec,
      viewerId,
      tid,
      viewerIsHighStaff,
      profileKind,
      viewerMemForPanel,
      usePartnersChatPmPanel,
      member,
    ) &&
    !omitPexDepexHome;
  let partnerHomeRows = [];
  if (sec === SECTION_HOME && canHsPartnerPoints) {
    const vPts = String(viewerId);
    if (usePartnersChatPmPanel) {
      partnerHomeRows = omitPexDepexHome
        ? buildPartnerPointsOnlyRow(vPts, tid, SECTION_HOME, sourceMessageId)
        : buildPmOnlyPartnerRows(vPts, tid, SECTION_HOME, sourceMessageId);
    }
    else if (profileKind === PROFILE_FULL && hasPm) partnerHomeRows = buildPartnerPointsOnlyRow(vPts, tid, SECTION_HOME, sourceMessageId);
    else if (profileKind === PROFILE_PM_ONLY) {
      partnerHomeRows =
        omitPexDepexHome || showHsPexDepexOnHome
          ? buildPartnerPointsOnlyRow(vPts, tid, SECTION_HOME, sourceMessageId)
          : buildPmOnlyPartnerRows(vPts, tid, SECTION_HOME, sourceMessageId);
    }
  }

  const partnerPtsForRedeem = resolveStaffPartnerPointsDisplay(s);
  const pmStaffRedeemRows =
    sec === SECTION_HOME && hasPm && String(viewerId) !== tid && viewerCanPartnerPointsPanel
      ? buildPartnerManagerRedeemRows(String(viewerId), tid, SECTION_HOME, sourceMessageId, partnerPtsForRedeem)
      : [];
  const pmStaffApplyRows =
    sec === SECTION_HOME && hasPm && String(viewerId) !== tid && viewerCanPartnerPointsPanel
      ? buildPartnerManagerApplyPerkRows(String(viewerId), tid, SECTION_HOME, sourceMessageId)
      : [];
  const homeBottomRows = [...partnerHomeRows, ...pmStaffRedeemRows, ...pmStaffApplyRows];

  const profileKindForSelect = usePartnersChatPmPanel ? PROFILE_PM_ONLY : profileKind;
  const selectRow = buildProfileSelectRow(String(viewerId), tid, sec, profileKindForSelect, sourceMessageId, {
    partnersChatHomeLabel: usePartnersChatPmPanel,
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
    usePartnersChatPmPanel,
    member,
  )
    ? buildHighStaffActionRows(String(viewerId), tid, sec, dualPmStaffDepex, hasPm, sourceMessageId, omitPexDepexHome)
    : [];
  const hsRows = [...highStaffRows];
  if (
    sec === SECTION_HOME &&
    profileKind === PROFILE_FULL &&
    !usePartnersChatPmPanel &&
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

  if ((profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel) && sec === SECTION_HOME) {
    const pauseShort = getStaffPauseLine(s, { pmOnly: true });
    const punti = partnerPtsForRedeem;
    const pmHomeDesc = [
      `<:VC_Staff:1494286904089247754> **Ruolo:** ${roleLabel}`,
      "",
      `<a:VC_Calendar:1482706208149475358> **Pause:** ${pauseShort}`,
      "",
      `<:VC_Partner:1482527213780729896> **Punti partner:** ${punti}`,
    ].join("\n");
    const pmTitle = usePartnersChatPmPanel
      ? `<:VC_addperson:1485419347068588073> Profilo Partner Manager ${name}`
      : `<:VC_addperson:1485419347068588073> Profilo Staff ${name}`;
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(pmTitle)
          .setDescription(pmHomeDesc.slice(0, 4090))
          .setThumbnail(userAvatarUrlDynamic(targetUser, { size: 128 }) || null),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton }),
    };
  }

  if (sec === SECTION_VALUTAZIONI) {
    const posLines = posReasons.map((r, i) => `**+${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const negLines = negReasons.map((r, i) => `**−${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const warnLines = warnReasons.map((r, i) => `**-${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const warnReset = warnResetLine(s.firstWarnStaffAt);
    const warnBlock = warnLines.length
      ? [
          "<:banhammer:1443651875441217639> **Warn**",
          "",
          ...warnLines,
          ...(warnReset ? ["", warnReset] : []),
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
        .setThumbnail(userAvatarUrlDynamic(targetUser, { size: 128 }) || null),
    );
    return { embeds, components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton }) };
  }

  if (sec === SECTION_PAUSE) {
    const targetUserObj = targetUser || { id: tid, username: name };
    const pauseRoleFilter =
      profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel ? "pm" : undefined;
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
        components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton }),
      };
    }
    return {
      embeds: [...listPayload.embeds],
      components: withCloseProfileComponents(
        mergeProfileComponents(selectRow, hsRows, limitExtraRowsForProfilePanel(listPayload.components || [], 3)),
        viewerId,
        tid,
        sourceMessageId,
        { enableNextTargetButton },
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
    const hh = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false });
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#3498DB")
          .setTitle("Moderation Statistics")
          .setThumbnail(userAvatarUrlDynamic(targetUser, { size: 256 }) || null)
          .setAuthor({
            name: targetUser?.username || String(modId),
            iconURL: userAvatarUrlDynamic(targetUser, { size: 128 }) || null,
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
      components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton }),
    };
  }

  const pauseShort = getStaffPauseLine(s);
  let viewerName = "";
  try {
    const viewerMember = await guild.members.fetch(String(viewerId));
    viewerName = accountUsername(viewerMember) || String(viewerId);
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
    `<:VC_Staff:1494286904089247754> **Ruolo:** ${roleLabel}`,
    "",
    `<a:VC_Calendar:1482706208149475358> **Pause:**`,
    `${pauseShort}`,
  ];
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
        .setTitle(`<a:VC_Announce:1482534613568979007> Profilo Staff ${name}`)
        .setDescription(homeDesc)
        .setThumbnail(userAvatarUrlDynamic(targetUser, { size: 128 }) || null),
    ],
    components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton }),
  };
}

module.exports = {
  PANEL_PREFIX,
  STAFF_HP_PREFIX,
  STAFF_HP_SELECT_PREFIX,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_MODSTATS,
  formatStaffProfileSelectCustomId,
  parseStaffProfileSelectCustomId,
  formatStaffProfileCloseCustomId,
  parseStaffProfileCloseCustomId,
  formatStaffProfileNextCustomId,
  parseStaffProfileNextCustomId,
  formatStaffHpButtonCustomId,
  encodeStaffHpButtonAction,
  decodeStaffHpButtonActionToken,
  staffHpSectionToken,
  parseStaffHpButtonSectionToken,
  buildStaffProfilePayload,
  resolveStaffPartnerPointsDisplay,
  viewerCanUsePartnerPointsPanel,
  viewerIsCoordinatorOrAbove,
  viewerIsFounder,
  shouldOmitPexDepexHomeRow,
  resolveNextStaffPanelTargetId,
};