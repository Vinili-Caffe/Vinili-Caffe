const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { STAFF_WARN_RESET_MS, STAFF_WARN_THREE_NEGATIVES_REASON } = require("../../Services/Staff/staffWarnService");
const { countModActionsByMod } = require("../Moderation/modCaseStore");
const { buildPauseListPayload } = require("../Pause/pauseListRuntime");
const { roleChoiceAppliesTo, PAUSE_ROLE_PM, getValPosTradedPauseBonusDays } = require("../Pause/pauseHandlersUtils");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const { applyPronounGenderToTextForMember } = require("../Community/pronounGenderUtils");
const { getStaffRoleEmojiByRoleId } = require("../Community/staffRoleEmoji");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("./partnerPointsDisplayUtils");
const { PARTNER_MANAGER_REDEEM_TIERS, partnerManagerRedeemButtonLabel, partnerManagerCanAffordReward, getPartnerRewardPointCost } = require("./partnerPointsUtils");
const { PARTNER_MILESTONE_REWARD_LABELS } = require("./partnerManagerMilestoneDm");
const { buildPartnerRewardDiscountBanner } = require("../../../shared/partner/partnerManagerRewardTiers");
const {
  accountUsername,
  memberDisplayName,
  memberLabelWithUsername,
  userAvatarUrlDynamic,
} = require("../Discord/guildDiscordIdentity");
const {
  resolveSerataFilmAttendanceForWeek,
  buildSerataFilmAttendanceDescriptionLine,
  buildSerataFilmAttendanceButtonRow,
} = require("./serataFilmAttendanceUtils");
const { reconcileStaffValutazioneCounters } = require("./staffDocUtils");
const {
  resolvePmCommandsChannelMention,
  formatChannelMentionFromChannel,
} = require("../Partner/partnersChatChannelUtils");
const PANEL_PREFIX = "staff_profile_panel";
const STAFF_HP_PREFIX = "staff_hp";
const STAFF_HP_SELECT_PREFIX = "staff_hp_select";
const SECTION_HOME = "home";
const SECTION_VALUTAZIONI = "valutazioni";
const SECTION_WARN = "warn";
const SECTION_PAUSE = "pause";
const SECTION_MODSTATS = "modstats";
const SECTION_SHOP = "shop";
const STAFF_HP_BUTTON_SECTION_IDS = new Set([SECTION_HOME, SECTION_VALUTAZIONI, SECTION_WARN, SECTION_PAUSE, SECTION_MODSTATS, SECTION_SHOP]);
const STAFF_HP_SECTION_CHAR_MAP = { [SECTION_HOME]: "h", [SECTION_VALUTAZIONI]: "v", [SECTION_WARN]: "w", [SECTION_PAUSE]: "p", [SECTION_MODSTATS]: "m", [SECTION_SHOP]: "q" };
const STAFF_HP_SECTION_CHAR_REVERSE = Object.fromEntries(Object.entries(STAFF_HP_SECTION_CHAR_MAP).map(([sec, ch]) => [ch, sec]));
const STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT = { pex_menu: "pxm", depex_menu: "dxm", val_add_menu: "vam", val_remove_menu: "vrm", pex: "pex", pex_helper: "phl", pex_mod: "pmo", pex_senior_moderator: "psm", pex_director: "pdr", pex_admin: "pxa", pex_manager: "pmg", pex_founder: "pfn", pex_pm: "ppm", depex: "dpx", depex_full: "dff", depex_staff: "dst", depex_pm_only: "dpo", valpos: "vps", valneg: "vng", warn: "wrn", valpos_rm: "vpr", valneg_rm: "vnr", warn_rm: "wrr", ppm_add: "pma", ppm_remove: "pmr" };
const STAFF_HP_BUTTON_ACTION_SHORT_TO_FULL = Object.fromEntries(Object.entries(STAFF_HP_BUTTON_ACTION_FULL_TO_SHORT).map(([full, short]) => [short, full]));
const LEGACY_PARTNER_LB_SECTION = "partner_lb";
const PROFILE_FULL = "full";
const PROFILE_PM_ONLY = "pm_only";
const PROFILE_PROSPECT = "prospect";
const STAFF_ROLE_PRIORITY = [String(IDs.roles.Director), String(IDs.roles.SeniorModerator), String(IDs.roles.Mod), String(IDs.roles.Helper), String(IDs.roles.Staff)].filter(Boolean);
const STAFF_PROFILE_DISPLAY_ROLE_PRIORITY = [IDs.roles.Founder, IDs.roles.Manager, IDs.roles.Admin, IDs.roles.Director, IDs.roles.HighStaff, String(IDs.roles.SeniorModerator), String(IDs.roles.Mod), String(IDs.roles.Helper), IDs.roles.PartnerManager, String(IDs.roles.Staff)].filter(Boolean);
const STAFF_LADDER_ROLE_IDS_FOR_PANEL = [String(IDs.roles.Helper), String(IDs.roles.Mod), String(IDs.roles.SeniorModerator), String(IDs.roles.Director), String(IDs.roles.Admin), String(IDs.roles.Manager), String(IDs.roles.Founder)].filter(Boolean).map((id) => String(id));
const STAFF_PANEL_NON_PM_ROLE_IDS = [String(IDs.roles?.Founder), String(IDs.roles?.Manager), String(IDs.roles?.Admin), String(IDs.roles?.Director), String(IDs.roles?.HighStaff), String(IDs.roles?.SeniorModerator), String(IDs.roles?.Mod), String(IDs.roles?.Helper), String(IDs.roles?.Staff)].filter(Boolean).map((id) => String(id));
const STAFF_PANEL_NAV_ROLE_PRIORITY = [String(IDs.roles?.Founder), String(IDs.roles?.Manager), String(IDs.roles?.Admin), String(IDs.roles?.Director), String(IDs.roles?.HighStaff), String(IDs.roles?.SeniorModerator), String(IDs.roles?.Mod), String(IDs.roles?.Helper), String(IDs.roles?.Staff)].filter(Boolean).map((id) => String(id));

function resolveStaffPartnerPointsDisplay(staffObj) {
  return resolvePartnerTotalEarned(staffObj);
}

function buildPartnerManagerHubSelectRow(viewerId, targetId, section = SECTION_HOME, sourceMessageId = null, hubOptions = []) {
  const opts = (Array.isArray(hubOptions) ? hubOptions : []).slice(0, 25);
  if (!opts.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(formatStaffHpSelectCustomId("pm_hub", viewerId, targetId, section, sourceMessageId))
    .setPlaceholder("Azioni Partner Manager")
    .setMinValues(1)
    .setMaxValues(1);
  for (let i = 0; i < opts.length; i += 1) {
    const o = opts[i];
    const act = String(o.action || "");
    const val = encodeStaffHpButtonAction(act);
    const ob = new StringSelectMenuOptionBuilder()
      .setLabel(String(o.label || act).slice(0, 100))
      .setValue(String(val || act).slice(0, 100));
    if (o.description) ob.setDescription(String(o.description).slice(0, 100));
    menu.addOptions(ob);
  }
  return new ActionRowBuilder().addComponents(menu);
}

function buildPmPartnerShopDescription(balance, opts = {}) {
  const pts = Math.max(0, Math.floor(Number(balance || 0)));
  const earned = Math.max(pts, Math.floor(Number(opts.earned ?? pts)));
  const redeemed = Math.max(0, Math.floor(Number(opts.redeemed ?? Math.max(0, earned - pts))));
  const ticketCh = String(IDs.channels?.ticket || "").trim();
  const ticketLine = ticketCh
    ? `Per **consumare i punti** e ottenere il premio serve un **High Staff**.`
    : "Per **consumare i punti** e ottenere il premio serve un **High Staff**.";
  const lines = [];
  const discountBanner = buildPartnerRewardDiscountBanner();
  if (discountBanner) {
    lines.push(discountBanner, "");
  }
  if (opts.selfShop) {
    lines.push(
      "**Riscatto:** usa i pulsanti qui sotto.",
      "",
    );
  }
  lines.push(`<:VC_Partner:1482527213780729896> **Saldo spendibile:** **${pts}** punti`);
  if (earned > pts || redeemed > 0) {
    lines.push(
      `<:VC_Reply:1482532158080942191> Partnership totali **${earned}** · già riscattati in shop **${redeemed}**`,
    );
  }
  lines.push("");
  for (const tier of PARTNER_MANAGER_REDEEM_TIERS) {
    const cost = getPartnerRewardPointCost(tier);
    const reward = PARTNER_MILESTONE_REWARD_LABELS[tier] || partnerManagerRedeemButtonLabel(tier);
    const costLabel = cost < tier ? `\`${cost}\` (era \`${tier}\`)` : `\`${cost}\``;
    lines.push(`**Soglia ${costLabel}**: ${reward}`);
    if (partnerManagerCanAffordReward(pts, tier)) {
      lines.push(`<a:VC_Verified:1482532479637127188> Con questo saldo il premio è **riscattabile**.`);
    } else {
      const miss = cost - pts;
      lines.push(`<a:VC_Cross:1482532424570376253> Mancano **${miss}** punti per raggiungere **${cost}**.`);
    }
    lines.push("");
  }
  lines.push("—", "", ticketLine);
  return lines.join("\n").slice(0, 4090);
}

const STAFF_PM_SHOP_PREFIX = "staff_pm_shop";
const STAFF_VAL_NEG_TRADE_PREFIX = "staff_val_neg_trade";
const STAFF_VAL_PAUSE_TRADE_PREFIX = "staff_val_pause_trade";

function buildPmShopSelfRedeemRows(viewerId, targetId, partnerPtsForRedeem, blocks) {
  const v = String(viewerId || "");
  const t = String(targetId || "");
  if (!v || v !== t) return [];
  const pts = Math.max(0, Math.floor(Number(partnerPtsForRedeem || 0)));
  const locks = blocks && typeof blocks === "object" ? blocks : {};
  const rowA = [];
  const rowB = [];
  for (const tier of PARTNER_MANAGER_REDEEM_TIERS) {
    const cost = getPartnerRewardPointCost(tier);
    const blocked =
      tier === 50 ? Boolean(locks.customBlocked) : tier === 100 ? Boolean(locks.vipBlocked) : false;
    const can = !blocked && partnerManagerCanAffordReward(pts, tier);
    const short = tier === 50 || tier === 100 ? `r${tier}` : `t${tier}`;
    const b = new ButtonBuilder()
      .setCustomId(`${STAFF_PM_SHOP_PREFIX}:${short}:${v}:${t}`)
      .setLabel(blocked ? "Bloccato" : `${cost} pt`)
      .setStyle(blocked ? ButtonStyle.Secondary : tier <= 100 ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(!can || blocked);
    if (tier <= 150) rowA.push(b);
    else rowB.push(b);
  }
  const out = [new ActionRowBuilder().addComponents(...rowA)];
  if (rowB.length) out.push(new ActionRowBuilder().addComponents(...rowB));
  return out;
}

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
  const badges = buildStaffProfileRoleBadges(guild, member);
  if (!badges.length) return "—";
  return badges.map((b) => b.label).join(" & ");
}

function staffProfileRoleBadgeKind(roleId) {
  const id = String(roleId || "");
  if (IDs.roles.Founder && id === String(IDs.roles.Founder)) return "founder";
  if (IDs.roles.Manager && id === String(IDs.roles.Manager)) return "manager";
  if (IDs.roles.PartnerManager && id === String(IDs.roles.PartnerManager)) return "pm";
  if (IDs.roles.StafferDelMese && id === String(IDs.roles.StafferDelMese)) return "sdm";
  if (IDs.roles.HighStaff && id === String(IDs.roles.HighStaff)) return "highstaff";
  if (IDs.roles.Staff && id === String(IDs.roles.Staff)) return "staff";
  if (IDs.roles.Director && id === String(IDs.roles.Director)) return "director";
  if (IDs.roles.Admin && id === String(IDs.roles.Admin)) return "admin";
  return "staff";
}

function staffProfileRoleBadgeIcon(kind) {
  if (kind === "founder") return "fa-star-o";
  if (kind === "manager") return "fa-briefcase";
  if (kind === "pm") return "fa-handshake-o";
  if (kind === "sdm") return "fa-trophy";
  if (kind === "highstaff") return "fa-shield";
  if (kind === "director") return "fa-shield";
  if (kind === "admin") return "fa-shield";
  return "fa-shield";
}

function staffProfileRoleColorHex(role) {
  if (role?.hexColor && role.hexColor !== "#000000") return role.hexColor;
  return "#d4a888";
}

function pushRoleBadgeIfMissing(badges, guild, roleId, fallbackLabel) {
  const id = String(roleId || "").trim();
  if (!id) return;
  if (badges.some((b) => String(b?.roleId || "") === id)) return;
  const discordRole = guild?.roles?.cache?.get(id) || null;
  const kind = staffProfileRoleBadgeKind(id);
  badges.push({
    kind,
    icon: staffProfileRoleBadgeIcon(kind),
    label: discordRole?.name || fallbackLabel || "Staff",
    color: staffProfileRoleColorHex(discordRole),
    roleId: id,
  });
}

function appendStaffDelMeseBadge(guild, member, badges) {
  const list = Array.isArray(badges) ? badges.slice() : [];
  const sdmId = String(IDs.roles?.StafferDelMese || "").trim();
  if (!sdmId || !member?.roles?.cache?.has(sdmId)) return list;
  if (list.some((b) => String(b?.roleId || "") === sdmId || String(b?.kind || "") === "sdm")) return list;
  const discordRole = guild?.roles?.cache?.get(sdmId) || null;
  // Prima dei badge staff/carriera (Moderator, Staff, …).
  list.unshift({
    kind: "sdm",
    icon: "fa-trophy",
    label: discordRole?.name || "Staff del Mese",
    color: staffProfileRoleColorHex(discordRole) || "#f0c75e",
    roleId: sdmId,
  });
  return list;
}

function buildStaffProfileRoleBadges(guild, member) {
  if (!member?.roles?.cache || !guild?.roles?.cache) return [];
  const pmId = String(IDs.roles.PartnerManager || "").trim();
  const sdmId = String(IDs.roles?.StafferDelMese || "").trim();
  const highStaffId = String(IDs.roles.HighStaff || "").trim();
  const staffId = String(IDs.roles.Staff || "").trim();
  const badges = [];
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    const rid = String(roleId || "").trim();
    if (!rid || rid === pmId || rid === sdmId || rid === highStaffId || rid === staffId) continue;
    if (member.roles.cache.has(rid)) {
      pushRoleBadgeIfMissing(badges, guild, rid, "Staff");
      break;
    }
  }
    if (highStaffId && member.roles.cache.has(highStaffId)) {
    pushRoleBadgeIfMissing(badges, guild, highStaffId, "High Staff");
  }
  if (staffId && member.roles.cache.has(staffId)) {
    pushRoleBadgeIfMissing(badges, guild, staffId, "Staff");
  }
  if (pmId && member.roles.cache.has(pmId)) {
    pushRoleBadgeIfMissing(badges, guild, pmId, "Partner Manager");
  }
  return appendStaffDelMeseBadge(guild, member, badges);
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
  if (
    (IDs.roles.HighStaff && c.has(IDs.roles.HighStaff)) ||
    (IDs.roles.Director && c.has(IDs.roles.Director)) ||
    (IDs.roles.Founder && c.has(IDs.roles.Founder))
  ) {
    return true;
  }
  try {
    const { memberIsResocontoPmReviewer } = require("../Ticket/ticketPartnershipStaffRoles");
    return memberIsResocontoPmReviewer(member);
  } catch {
    return false;
  }
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

function viewerIsCoordinatorOrAbove(member) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean((IDs.roles.Admin && c.has(IDs.roles.Admin)) || (IDs.roles.Manager && c.has(IDs.roles.Manager)) || (IDs.roles.Director && c.has(IDs.roles.Director)) || (IDs.roles.Founder && c.has(IDs.roles.Founder)) || (IDs.roles.HighStaff && c.has(IDs.roles.HighStaff)));
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

function buildProspectPexRows(viewerId, targetId, sourceMessageId = null, includeFounderOnlyAdvanceSelect = false, options = {}) {
  const v = String(viewerId);
  const t = String(targetId);
  const hidePartnerManagerPex = options?.hidePartnerManagerPex === true;
  const fromLabel = options?.staffPexFromPartnerManager ? "Partner Manager" : "Member";
  const firstRowButtons = [
    new ButtonBuilder()
      .setCustomId(formatStaffHpButtonCustomId("pex_helper", v, t, SECTION_HOME, sourceMessageId))
      .setLabel(`${fromLabel} → Helper`)
      .setEmoji("<:VC_Helper:1502328751638450426>")
      .setStyle(ButtonStyle.Success),
  ];
  if (!hidePartnerManagerPex) {
    firstRowButtons.push(
      new ButtonBuilder()
        .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, SECTION_HOME, sourceMessageId))
        .setLabel("Pex → Partner Manager")
        .setEmoji("<:VC_PartnerManager:1494286911286808576>")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  const rows = [new ActionRowBuilder().addComponents(...firstRowButtons)];
  if (includeFounderOnlyAdvanceSelect) {
    const advanceFromLabel = options?.staffPexFromPartnerManager ? "Partner Manager" : "Member";
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(formatStaffHpSelectCustomId("prospect_pex", v, t, SECTION_HOME, sourceMessageId))
          .setPlaceholder("Promuovi a ruolo staff avanzato")
          .addOptions(
            { label: `${advanceFromLabel} → Mod`, value: "pex_mod", emoji: "<:VC_Mod:1494287597952958514>" },
            { label: `${advanceFromLabel} → Senior Moderator`, value: "pex_senior_moderator", emoji: "<:VC_SeniorModerator:1494286913744539648>" },
            { label: `${advanceFromLabel} → Director`, value: "pex_director", emoji: "<:VC_Director:1494286915778641941>" },
            { label: `${advanceFromLabel} → Admin`, value: "pex_admin", emoji: "<:VC_Admin:1494286848686686209>" },
            { label: `${advanceFromLabel} → Manager`, value: "pex_manager", emoji: "<:VC_Manager:1521629610876338307>" },
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
    const line = `Rientrato/a il **${recentlyReturned[0].p.dataRitorno}**`;
    return opts.member ? applyPronounGenderToTextForMember(line, opts.member) : line;
  }
  return "Nessuna pausa in corso <a:VC_Cross:1482532424570376253>";
}

function formatStaffProfileSelectCustomId(viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:select:${viewerId}:${targetId}`, sourceMessageId);
}

function formatStaffProfileCloseCustomId(viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:close:${viewerId}:${targetId}`, sourceMessageId);
}

function formatStaffProfileNextCustomId(viewerId, targetId, sourceMessageId = null, section = SECTION_HOME) {
  const secTok = staffHpSectionToken(section);
  return withSourceSuffix(`${PANEL_PREFIX}:next:${viewerId}:${targetId}:${secTok}`, sourceMessageId);
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
  const viewerId = parts[2];
  const targetId = parts[3];
  let section = SECTION_HOME;
  let sourceMessageId = null;
  if (parts.length === 5) {
            if (/^\d{16,20}$/.test(String(parts[4] || ""))) sourceMessageId = parts[4];
    else section = parseStaffHpButtonSectionToken(parts[4]);
  } else if (parts.length >= 6) {
    section = parseStaffHpButtonSectionToken(parts[4]);
    sourceMessageId = normalizeSourceMessageId(parts[5]);
  }
  return { viewerId, targetId, sourceMessageId, section };
}

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function withSourceSuffix(baseCustomId, sourceMessageId) {
  const sid = normalizeSourceMessageId(sourceMessageId);
  return sid ? `${baseCustomId}:${sid}` : baseCustomId;
}

function formatStaffValNegTradeOpenCustomId(viewerId, targetId, sourceMessageId = null) {
  const v = String(viewerId || "");
  const t = String(targetId || "");
  return withSourceSuffix(`${STAFF_VAL_NEG_TRADE_PREFIX}:open:${v}:${t}`, sourceMessageId);
}

function parseStaffValNegTradeOpenCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_VAL_NEG_TRADE_PREFIX || parts[1] !== "open") return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const sourceMessageId = normalizeSourceMessageId(parts[4]);
  return { viewerId, targetId, sourceMessageId };
}

function formatStaffValNegTradeModalCustomId(viewerId, targetId, sourceMessageId = null) {
  const v = String(viewerId || "");
  const t = String(targetId || "");
  return withSourceSuffix(`${STAFF_VAL_NEG_TRADE_PREFIX}:md:${v}:${t}`, sourceMessageId);
}

function parseStaffValNegTradeModalCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_VAL_NEG_TRADE_PREFIX || parts[1] !== "md") return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const sourceMessageId = normalizeSourceMessageId(parts[4]);
  return { viewerId, targetId, sourceMessageId };
}

function formatStaffValPauseTradeOpenCustomId(viewerId, targetId, sourceMessageId = null) {
  const v = String(viewerId || "");
  const t = String(targetId || "");
  return withSourceSuffix(`${STAFF_VAL_PAUSE_TRADE_PREFIX}:open:${v}:${t}`, sourceMessageId);
}

function parseStaffValPauseTradeOpenCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_VAL_PAUSE_TRADE_PREFIX || parts[1] !== "open") return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const sourceMessageId = normalizeSourceMessageId(parts[4]);
  return { viewerId, targetId, sourceMessageId };
}

function formatStaffValPauseTradeModalCustomId(viewerId, targetId, sourceMessageId = null) {
  const v = String(viewerId || "");
  const t = String(targetId || "");
  return withSourceSuffix(`${STAFF_VAL_PAUSE_TRADE_PREFIX}:md:${v}:${t}`, sourceMessageId);
}

function parseStaffValPauseTradeModalCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_VAL_PAUSE_TRADE_PREFIX || parts[1] !== "md") return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const sourceMessageId = normalizeSourceMessageId(parts[4]);
  return { viewerId, targetId, sourceMessageId };
}

function buildHsValutazioniTradeButtonRows(viewerId, targetId, sourceMessageId, { pos, neg, includePauseTrade = true, includeNegTrade = true }) {
  const row = new ActionRowBuilder();
  if (includePauseTrade && Math.max(0, Number(pos || 0)) >= 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffValPauseTradeOpenCustomId(viewerId, targetId, sourceMessageId))
        .setLabel("Positive → giorni pausa")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<a:VC_Calendar:1482706208149475358>"),
    );
  }
  if (includeNegTrade && Math.max(0, Number(pos || 0)) >= 3 && Math.max(0, Number(neg || 0)) >= 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(formatStaffValNegTradeOpenCustomId(viewerId, targetId, sourceMessageId))
        .setLabel("Compensa 1 negativa (3 positive)")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⚖️"),
    );
  }
  return row.components.length ? [row] : [];
}

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
  return String(viewerId) === String(targetUserId);
}

function targetMayReceivePartnerManagerPex(member) {
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId || !member?.roles?.cache) return false;
  return !member.roles.cache.has(pmId);
}

function shouldOmitStaffLadderPexDepexForTarget(targetMember) {
  return targetIsFounder(targetMember);
}

function buildHighStaffActionRows(
  viewerId,
  targetId,
  section,
  dualPmStaffDepex = false,
  targetHasPartnerManager = false,
  sourceMessageId = null,
  omitPexDepexHome = false,
  options = {},
) {
  const v = String(viewerId);
  const t = String(targetId);
  let sec = String(section || "").toLowerCase();
  if (sec === SECTION_WARN) sec = SECTION_VALUTAZIONI;
  if (sec === SECTION_HOME) {
    if (omitPexDepexHome) return [];
    if (options.pmPexOnly === true) {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(formatStaffHpButtonCustomId("pex_pm", v, t, sec, sourceMessageId))
            .setLabel("Pex → Partner Manager")
            .setEmoji("<:VC_PartnerManager:1494286911286808576>")
            .setStyle(ButtonStyle.Success),
        ),
      ];
    }
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

function buildPartnerManagerHubOptions(sec, canHsPartnerPoints, usePartnersChatPmPanel, omitPexDepexHome, showHsPexDepexOnHome, profileKind, hasPm, viewerId, targetId, viewerCanPartnerPointsPanel, partnerPtsForRedeem) {
  const hubOpts = [];
  const tid = String(targetId || "");
  const vid = String(viewerId || "");
  if (sec === SECTION_HOME && canHsPartnerPoints) {
    if (usePartnersChatPmPanel) {
      if (!omitPexDepexHome) hubOpts.push({ action: "depex_pm_only", label: "Depex" });
      hubOpts.push({ action: "ppm_add", label: "Aggiungi punti" }, { action: "ppm_remove", label: "Rimuovi punti" });
    } else if (profileKind === PROFILE_FULL && hasPm) {
      hubOpts.push({ action: "ppm_add", label: "Aggiungi punti" }, { action: "ppm_remove", label: "Rimuovi punti" });
    } else if (profileKind === PROFILE_PM_ONLY) {
      if (!(omitPexDepexHome || showHsPexDepexOnHome)) hubOpts.push({ action: "depex_pm_only", label: "Depex" });
      hubOpts.push({ action: "ppm_add", label: "Aggiungi punti" }, { action: "ppm_remove", label: "Rimuovi punti" });
    }
  }
  const pmStaffEconomy =
    sec === SECTION_HOME && hasPm && vid !== tid && viewerCanPartnerPointsPanel;
  if (pmStaffEconomy) {
    const pts = Math.max(0, Math.floor(Number(partnerPtsForRedeem || 0)));
    for (const tier of PARTNER_MANAGER_REDEEM_TIERS.filter((n) => partnerManagerCanAffordReward(pts, n))) {
      hubOpts.push({ action: `ppm_r${tier}`, label: partnerManagerRedeemButtonLabel(tier) });
    }
  }
  return hubOpts;
}

function shouldAttachHighStaffActions(section, viewerId, targetUserId, viewerIsHighStaff, profileKind, viewerMember, suppressPexDepex = false, targetMember = null) {
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
  const section = String(options.section || SECTION_HOME).toLowerCase();
  if (options.enableNextTargetButton) {
    components.push(
      new ButtonBuilder()
        .setCustomId(formatStaffProfileNextCustomId(String(viewerId), String(targetId), sourceMessageId, section))
        .setEmoji("<:1343arrowright:1525249880728145970>")
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
      { label: "Shop", value: SECTION_SHOP, emoji: "<a:VC_Money:1482724694699278487>", default: sec === SECTION_SHOP },
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

function staffWarnProfileLineEmoji(reasonText) {
  const raw = String(reasonText || "").trim();
  if (!raw) return "<:banhammer:1443651875441217639>";
  const n = raw.toLowerCase();
  const canonical = String(STAFF_WARN_THREE_NEGATIVES_REASON || "").trim().toLowerCase();
  if (n === canonical) return "<a:VC_Alert:1482706673176150077>";
  if (n === "3 valutazioni negative") return "<a:VC_Alert:1482706673176150077>";
  if (n === "assegna per aver raggiunto le 3 valutazioni negative") return "<a:VC_Alert:1482706673176150077>";
  if (n.includes("3 valutazioni negative") && (n.includes("warn assegnato") || n.includes("assegn"))) return "<a:VC_Alert:1482706673176150077>";
  return "<:banhammer:1443651875441217639>";
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
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staff")
    .lean()
    .catch(() => null);
  if (doc?.staff && reconcileStaffValutazioneCounters(doc.staff)) {
    ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      {
        $set: {
          "staff.positiveCount": doc.staff.positiveCount,
          "staff.negativeCount": doc.staff.negativeCount,
          "staff.valutazioniCount": doc.staff.valutazioniCount,
        },
      },
    ).catch(() => null);
  }
  return doc;
}

async function buildStaffProfilePayload(guild, targetUserId, viewerId, client, section = SECTION_HOME, options = {}) {
  const gid = String(guild?.id || "");
  const tid = String(targetUserId || "");
  const member =
    (await getGuildMemberCached(guild, tid).catch(() => null)) ||
    (await guild.members.fetch({ user: tid }).catch(() => null));
  const targetUser = member?.user || (await client.users.fetch(tid).catch(() => null));
  const avatarSubject = member || targetUser;
  const name =
    (member
      ? memberLabelWithUsername(member, targetUser)
      : memberDisplayName(null, targetUser) || accountUsername(targetUser)) || tid;
  const viewerMemForPanel =
    (await getGuildMemberCached(guild, String(viewerId)).catch(() => null)) ||
    (await guild.members.fetch({ user: String(viewerId) }).catch(() => null));
  const viewerIsHighStaff = Boolean(viewerMemForPanel?.roles?.cache?.has(IDs.roles.HighStaff));
  const viewerIsDirector = Boolean(
    IDs.roles.Director && viewerMemForPanel?.roles?.cache?.has(IDs.roles.Director),
  );
  const viewerCanFullDepex = viewerIsCoordinatorOrAbove(viewerMemForPanel);
  const viewerCanPartnerPointsPanel = viewerCanUsePartnerPointsPanel(viewerMemForPanel);
  const profileKind = resolveStaffProfileKind(member);
  const sourceMessageId = normalizeSourceMessageId(options?.sourceMessageId);
  const pmRoleId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmRoleId && member?.roles?.cache?.has(pmRoleId));
  const partnersChatPanelMode = options?.partnersChatPanel === true;
  const usePartnersChatPmPanel = partnersChatPanelMode && hasPm;
  const enableNextTargetButton = Boolean(resolveNextStaffPanelTargetId(guild, tid, { partnersChatPanel: partnersChatPanelMode }));

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
          .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(null, pexComps), viewerId, tid, sourceMessageId, {
        enableNextTargetButton,
        section: SECTION_HOME,
      }),
    };
  }

  const displayRoleId = member ? resolveStaffProfileDisplayRoleId(member) : null;
  const displayRoleEmoji = getStaffRoleEmojiByRoleId(usePartnersChatPmPanel ? pmRoleId : displayRoleId);
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
    const allowedPm = new Set([SECTION_HOME, SECTION_PAUSE, SECTION_SHOP]);
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
  const targetHasStaffLadderRole = Boolean(getHighestStaffLadderRoleIdForPanel(member));
      const suppressPexDepexInPmPanel = usePartnersChatPmPanel && !targetHasStaffLadderRole;
  const omitPexDepexHome = shouldOmitPexDepexHomeRow(viewerId, tid, member);
  const omitStaffLadderPexDepex = shouldOmitStaffLadderPexDepexForTarget(member);
  const pmPexOnlyHome = omitStaffLadderPexDepex && targetMayReceivePartnerManagerPex(member);
  const omitStandardPexDepexHome = omitPexDepexHome || (omitStaffLadderPexDepex && !pmPexOnlyHome);
  const showHsPexDepexOnHome =
    sec === SECTION_HOME &&
    shouldAttachHighStaffActions(sec, viewerId, tid, viewerIsHighStaff, profileKind, viewerMemForPanel, suppressPexDepexInPmPanel, member) &&
    !omitPexDepexHome;
  const partnerPtsForRedeem = resolvePartnerPointsShown(s);
  const partnerPtsTotal = resolveStaffPartnerPointsDisplay(s);
  const partnerHubOpts = buildPartnerManagerHubOptions(sec, canHsPartnerPoints, usePartnersChatPmPanel, omitPexDepexHome, showHsPexDepexOnHome, profileKind, hasPm, viewerId, tid, viewerCanPartnerPointsPanel, partnerPtsForRedeem);
  const partnerHubRow = partnerHubOpts.length > 0
    ? buildPartnerManagerHubSelectRow(viewerId, tid, SECTION_HOME, sourceMessageId, partnerHubOpts)
    : null;
  const homeBottomRows = partnerHubRow ? [partnerHubRow] : [];

  const profileKindForSelect = usePartnersChatPmPanel ? PROFILE_PM_ONLY : profileKind;
  const selectRow = buildProfileSelectRow(viewerId, tid, sec, profileKindForSelect, sourceMessageId, { partnersChatHomeLabel: usePartnersChatPmPanel, hideValutazioniWarn: hideValutazioniWarnForTarget });
  const dualPmStaffDepex = profileKind === PROFILE_FULL && memberHasPmAndStaffLadderForDualDepex(member);
  const highStaffRows = shouldAttachHighStaffActions(sec, viewerId, tid, viewerIsHighStaff, profileKind, viewerMemForPanel, suppressPexDepexInPmPanel, member)
    ? buildHighStaffActionRows(String(viewerId), tid, sec, dualPmStaffDepex, hasPm, sourceMessageId, omitStandardPexDepexHome, { pmPexOnly: pmPexOnlyHome })
    : [];
  const hsRows = [...highStaffRows];
  if (sec === SECTION_HOME && profileKind === PROFILE_FULL && !usePartnersChatPmPanel && String(viewerId) !== tid && viewerCanFullDepex && !viewerIsHighStaff && !viewerIsDirector) {
    hsRows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId(formatStaffHpButtonCustomId("depex_full", String(viewerId), tid, sec, sourceMessageId))
      .setLabel("Depex → Member")
      .setEmoji("<a:VC_Cross:1482532424570376253>")
      .setStyle(ButtonStyle.Danger)));
  }

  if ((profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel) && sec === SECTION_SHOP) {
    const shopTitle = usePartnersChatPmPanel
      ? `<a:VC_Money:1482724694699278487> Shop premi · ${name}`
      : `<a:VC_Money:1482724694699278487> Shop premi · ${name}`;
    const shopBtnRows =
      hasPm && String(viewerId) === String(tid)
        ? buildPmShopSelfRedeemRows(
            viewerId,
            tid,
            partnerPtsForRedeem,
            (() => {
              try {
                const { resolvePartnerManagerShopInstantBlocks } = require("./partnerManagerTimedPerks");
                return resolvePartnerManagerShopInstantBlocks(member, { staff: s });
              } catch (_) {
                return {};
              }
            })(),
          )
        : [];
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(shopTitle.slice(0, 256))
          .setDescription(
            buildPmPartnerShopDescription(partnerPtsForRedeem, {
              selfShop: hasPm && String(viewerId) === String(tid),
              earned: partnerPtsTotal,
              redeemed: Math.max(0, Math.floor(Number(s?.partnerRedeemSpend || 0))),
            }),
          )
          .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null),
      ],
      components: withCloseProfileComponents(
        mergeProfileComponents(selectRow, hsRows, [...shopBtnRows, ...homeBottomRows]),
        viewerId,
        tid,
        sourceMessageId,
        { enableNextTargetButton, section: sec },
      ),
    };
  }

  if ((profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel) && sec === SECTION_HOME) {
    const pauseShort = getStaffPauseLine(s, { pmOnly: true, member });
    const punti = partnerPtsTotal;
    const spendable = partnerPtsForRedeem;
    const redeemed = Math.max(0, Math.floor(Number(s?.partnerRedeemSpend || 0)));
    const puntiLine =
      redeemed > 0
        ? `<:VC_Partner:1482527213780729896> **Punti:** ${punti} totali · **${spendable}** spendibili (riscattati ${redeemed})`
        : `<:VC_Partner:1482527213780729896> **Punti:** ${punti}`;
    const pmStaffPexRows =
      (profileKind === PROFILE_PM_ONLY || (usePartnersChatPmPanel && !targetHasStaffLadderRole)) &&
      viewerIsHighStaff &&
      String(viewerId) !== tid
        ? buildProspectPexRows(
          String(viewerId),
          tid,
          sourceMessageId,
          viewerIsFounder(viewerMemForPanel),
          { hidePartnerManagerPex: true, staffPexFromPartnerManager: true },
        )
        : [];
    const pmHomeDesc = [
      `${displayRoleEmoji} **Ruolo:** ${roleLabel}`,
      "",
      `<a:VC_Calendar:1482706208149475358> **Pause:** ${pauseShort}`,
      "",
      puntiLine,      ...(pmStaffPexRows.length
        ? [
          "",
          "<a:VC_Verified:1482532479637127188> Usa i pulsanti qui sotto per aggiungere un ruolo **Staff** mantenendo **Partner Manager**.",
        ]
        : []),
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
          .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null),
      ],
      components: withCloseProfileComponents(
        mergeProfileComponents(selectRow, [...pmStaffPexRows, ...hsRows], homeBottomRows),
        viewerId,
        tid,
        sourceMessageId,
        { enableNextTargetButton, section: sec },
      ),
    };
  }

  if (sec === SECTION_VALUTAZIONI) {
    const posLines = posReasons.map((r, i) => `**+${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const negLines = negReasons.map((r, i) => `**−${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const warnLines = warnReasons.map(
      (r, i) => `${staffWarnProfileLineEmoji(r)} **-${i + 1}.** ${String(r || "—").slice(0, 900)}`,
    );
    const warnReset = warnResetLine(s.firstWarnStaffAt);
    const warnBlock = warnLines.length
      ? [
        "<:banhammer:1443651875441217639> **Warn**",
        "",
        ...warnLines,
        ...(warnReset ? ["", warnReset] : []),
      ]
      : ["<:banhammer:1443651875441217639> **Warn** — Nessun warn."];
    const pauseBonusDays = getValPosTradedPauseBonusDays(s);
    const bodyParts = [
      posLines.length ? "<:thumbsup:1471292172145004768> **Positive**" : "<:thumbsup:1471292172145004768> **Positive** — Nessuna.",
      ...posLines,
      "",
      negLines.length ? "<:thumbsdown:1471292163957457013> **Negative**" : "<:thumbsdown:1471292163957457013> **Negative** — Nessuna.",
      ...negLines,
    ];
    if (pauseBonusDays > 0) {
      bodyParts.push("", `<a:VC_Calendar:1482706208149475358> **Giorni pausa extra (scambio positive):** \`${pauseBonusDays}\``);
    }
    bodyParts.push("", ...warnBlock);
    const viewerCanValTrade = Boolean(IDs.roles.HighStaff && viewerMemForPanel?.roles?.cache?.has(IDs.roles.HighStaff));
    const isSelfProfile = String(viewerId) === String(tid);
    const valTradeBaseOk =
      profileKind === PROFILE_FULL && !hideValutazioniWarnForTarget && !usePartnersChatPmPanel;
    const canHsValTrade = valTradeBaseOk && viewerCanValTrade && !isSelfProfile;
    const canSelfNegTrade = valTradeBaseOk && isSelfProfile;
    const valTradeRows = canHsValTrade
      ? buildHsValutazioniTradeButtonRows(viewerId, tid, sourceMessageId, { pos, neg })
      : canSelfNegTrade
        ? buildHsValutazioniTradeButtonRows(viewerId, tid, sourceMessageId, {
            pos,
            neg,
            includePauseTrade: false,
            includeNegTrade: true,
          })
        : [];
    const chunks = chunkString(bodyParts.join("\n"), 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(desc)
        .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null),
    );
    const valExtraRows = [...valTradeRows, ...homeBottomRows];
    return { embeds, components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, valExtraRows), viewerId, tid, sourceMessageId, { enableNextTargetButton, section: sec }) };
  }

  if (sec === SECTION_PAUSE) {
    const targetUserObj = targetUser || { id: tid, username: name };
    const pauseRoleFilter = profileKind === PROFILE_PM_ONLY || usePartnersChatPmPanel ? "pm" : undefined;
    const listPayload = await buildPauseListPayload({ guildId: gid, requesterId: String(viewerId), targetUser: targetUserObj, isHighStaff: viewerIsHighStaff, client, pauseRoleFilter });
    if (!listPayload.ok) {
      return { embeds: [new EmbedBuilder().setColor("Red").setDescription(listPayload.error || "Errore caricamento pause.")], components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton, section: sec }) };
    }
    return {
      embeds: [...listPayload.embeds],
      components: withCloseProfileComponents(
        mergeProfileComponents(selectRow, hsRows, limitExtraRowsForProfilePanel(listPayload.components || [], 3)),
        viewerId,
        tid,
        sourceMessageId,
        { enableNextTargetButton, section: sec },
      ),
    };
  }

  if (sec === SECTION_MODSTATS) {
    const modId = tid;
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const countAction = (action, since = null) => countModActionsByMod(gid, modId, action, since);
    const [m7, m30, mall, b7, b30, ball, k7, k30, kall, w7, w30, wall] = await Promise.all([ countAction("MUTE", d7), countAction("MUTE", d30), countAction("MUTE"), countAction("BAN", d7), countAction("BAN", d30), countAction("BAN"), countAction("KICK", d7), countAction("KICK", d30), countAction("KICK"), countAction("WARN", d7), countAction("WARN", d30), countAction("WARN") ]);
    const t7 = Number(m7) + Number(b7) + Number(k7) + Number(w7);
    const t30 = Number(m30) + Number(b30) + Number(k30) + Number(w30);
    const tall = Number(mall) + Number(ball) + Number(kall) + Number(wall);
    const hh = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false });
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#3498DB")
          .setTitle("Statistiche Sanzioni")
          .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 256 }) || null)
          .setAuthor({
            name: name || String(modId),
            iconURL: userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null,
          })
          .addFields(
            {
              name: "Ultimi 7 giorni",
              value: `Mutes: ${m7}\nBans: ${b7}\nKicks: ${k7}\nWarns: ${w7}\n**Total: ${t7}**`,
              inline: true,
            },
            {
              name: "Ultimi 30 giorni",
              value: `Mutes: ${m30}\nBans: ${b30}\nKicks: ${k30}\nWarns: ${w30}\n**Total: ${t30}**`,
              inline: true,
            },
            {
              name: "All time",
              value: `Mutes: ${mall}\nBans: ${ball}\nKicks: ${kall}\nWarns: ${wall}\n**Total: ${tall}**`,
              inline: true,
            },
          )
          .setFooter({ text: `ID: ${modId}` })
          .setTimestamp(),
      ],
      components: withCloseProfileComponents(mergeProfileComponents(selectRow, hsRows, homeBottomRows), viewerId, tid, sourceMessageId, { enableNextTargetButton, section: sec }),
    };
  }

  const pauseShort = getStaffPauseLine(s, { member });
  let viewerName = "";
  try {
    const viewerMember = await guild.members.fetch(String(viewerId));
    viewerName = memberLabelWithUsername(viewerMember) || String(viewerId);
  } catch (e) {
    try {
      const viewerUser = await client.users.fetch(String(viewerId));
      viewerName = viewerUser.username || String(viewerId);
    } catch (err) {
      viewerName = String(viewerId);
    }
  }

  const puntiPartner = partnerPtsTotal;
  const sfAttState =
    profileKind === PROFILE_FULL && !usePartnersChatPmPanel
      ? resolveSerataFilmAttendanceForWeek(s)
      : null;
  const sfAttRow =
    sfAttState && String(viewerId) === tid && sfAttState.editable
      ? buildSerataFilmAttendanceButtonRow(viewerId, tid, sfAttState, sourceMessageId)
      : null;
  const homeDescParts = [
    `${displayRoleEmoji} **Ruolo:** ${roleLabel}`,
    "",
    `<a:VC_Calendar:1482706208149475358> **Pause:**`,
    `${pauseShort}`,
  ];
  if (sfAttState) {
    homeDescParts.push("", buildSerataFilmAttendanceDescriptionLine(sfAttState, String(viewerId) === tid));
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
    homeDescParts.push("", `<:VC_Partner:1482527213780729896> **Punti:** ${puntiPartner}`);
  }
  homeDescParts.push("", "Seleziona una sezione dal menu per i dettagli.");
  const homeDesc = homeDescParts.join("\n");
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`<a:VC_Announce:1482534613568979007> Profilo Staff ${name}`)
        .setDescription(homeDesc)
        .setThumbnail(userAvatarUrlDynamic(avatarSubject, { size: 128 }) || null),
    ],
    components: withCloseProfileComponents(
      mergeProfileComponents(selectRow, hsRows, sfAttRow ? [...homeBottomRows, sfAttRow] : homeBottomRows),
      viewerId,
      tid,
      sourceMessageId,
      { enableNextTargetButton, section: sec },
    ),
  };
}

module.exports = {
  PANEL_PREFIX,
  STAFF_HP_PREFIX,
  STAFF_HP_SELECT_PREFIX,
  STAFF_PM_SHOP_PREFIX,
  STAFF_VAL_NEG_TRADE_PREFIX,
  STAFF_VAL_PAUSE_TRADE_PREFIX,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_MODSTATS,
  SECTION_SHOP,
  PROFILE_FULL,
  PROFILE_PM_ONLY,
  PROFILE_PROSPECT,
  formatStaffProfileSelectCustomId,
  parseStaffProfileSelectCustomId,
  formatStaffProfileCloseCustomId,
  parseStaffProfileCloseCustomId,
  formatStaffProfileNextCustomId,
  parseStaffProfileNextCustomId,
  formatStaffValNegTradeOpenCustomId,
  parseStaffValNegTradeOpenCustomId,
  formatStaffValNegTradeModalCustomId,
  parseStaffValNegTradeModalCustomId,
  formatStaffValPauseTradeOpenCustomId,
  parseStaffValPauseTradeOpenCustomId,
  formatStaffValPauseTradeModalCustomId,
  parseStaffValPauseTradeModalCustomId,
  formatStaffHpButtonCustomId,
  encodeStaffHpButtonAction,
  decodeStaffHpButtonActionToken,
  staffHpSectionToken,
  parseStaffHpButtonSectionToken,
  buildStaffProfilePayload,
  buildProspectPexRows,
  resolveStaffPartnerPointsDisplay,
  resolveStaffProfileKind,
  buildFullProfileRoleLabelForEmbed,
  buildStaffProfileRoleBadges,
  appendStaffDelMeseBadge,
  resolveStaffProfileDisplayRoleId,
  viewerCanUsePartnerPointsPanel,
  viewerIsCoordinatorOrAbove,
  viewerIsFounder,
  targetIsFounder,
  shouldOmitPexDepexHomeRow,
  shouldOmitStaffLadderPexDepexForTarget,
  targetMayReceivePartnerManagerPex,
  resolveNextStaffPanelTargetId,
};