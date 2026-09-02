const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { STAFF_HP_PREFIX, STAFF_HP_SELECT_PREFIX, SECTION_HOME, SECTION_VALUTAZIONI, SECTION_WARN, SECTION_PAUSE, SECTION_MODSTATS, SECTION_SHOP, buildStaffProfilePayload, resolveStaffPartnerPointsDisplay, parseStaffProfileCloseCustomId, parseStaffProfileSelectCustomId, encodeStaffHpButtonAction, decodeStaffHpButtonActionToken, staffHpSectionToken, parseStaffHpButtonSectionToken } = require("../Utils/Staff/staffProfilePanelRuntime");
const { viewerCanUsePartnerPointsPanel, viewerIsCoordinatorOrAbove, viewerIsFounder, targetIsFounder, shouldOmitPexDepexHomeRow, shouldOmitStaffLadderPexDepexForTarget, buildProspectPexRows } = require("../Utils/Staff/staffProfilePanelRuntime");
const { runProfileStaffPex, runProspectStaffPex, runProspectStaffPexToPartnerManager, runProfileStaffDepex, runProfileStaffCompleteDepex, runProfileStaffWarnAdd, runProfileStaffWarnRemove, getHighestLadderRole, getNextLadderRoleId, peekDepexLadderTargetRoleId } = require("../Utils/Staff/staffPanelActions");
const valutazioneCmd = require("../Utils/Staff/valutazionePanelActions");
const { addPartnerPoints, removePartnerPoints, formatPartnerPointsChange, partnerManagerRedeemTierFromAction } = require("../Utils/Staff/partnerPointsUtils");
const { completePartnerManagerRedeemForGuild } = require("../Utils/Staff/partnerManagerRedeemRuntime");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const { safeMessageEdit } = require("../../shared/discord/replyRuntime");
const MODAL_PREFIX = "vcsm";
const IN_REASON = "staff_hp_reason";
const IN_IDX = "staff_hp_idx";
const IN_TRADE_POS = "staff_hp_trade_pos";
const MAX_WARN_REMOVE_POS_TRADE = 100;
const IN_PPM_AMOUNT = "staff_hp_ppm_amount";
const IN_PPM_LINK = "staff_hp_ppm_link";
const PRIVATE_FLAG = 1 << 6;
const MAX_PPM_AMOUNT = 10000;
const STAFF_HP_SECTIONS = new Set([SECTION_HOME, SECTION_VALUTAZIONI, SECTION_WARN, SECTION_PAUSE, SECTION_MODSTATS, SECTION_SHOP]);
const FOUNDER_ONLY_PROSPECT_PEX_ACTIONS = new Set(["pex_mod", "pex_senior_moderator", "pex_director", "pex_admin", "pex_manager"]);
const STAFF_HP_MODAL_ACTION_CODE = { pex: "pex", pex_helper: "phl", pex_mod: "pmo", pex_senior_moderator: "psm", pex_director: "pdr", pex_admin: "pxa", pex_manager: "pmg", pex_founder: "pfn", pex_pm: "ppm", depex: "dpx", depex_full: "dff", depex_staff: "dst", depex_pm_only: "dpo", valpos: "vps", valneg: "vng", warn: "wrn", valpos_rm: "vpr", valneg_rm: "vnr", warn_rm: "wrr", ppm_add: "pma", ppm_remove: "pmr" };
const STAFF_HP_MODAL_CODE_ACTION = Object.fromEntries(Object.entries(STAFF_HP_MODAL_ACTION_CODE).map(([full, short]) => [short, full]));
const SECTION_CHAR_FOR_MODAL = { [SECTION_HOME]: "h", [SECTION_VALUTAZIONI]: "v", [SECTION_WARN]: "w", [SECTION_PAUSE]: "p", [SECTION_MODSTATS]: "m", [SECTION_SHOP]: "q" };
const MODAL_CHAR_TO_SECTION = { h: SECTION_HOME, v: SECTION_VALUTAZIONI, w: SECTION_WARN, p: SECTION_PAUSE, m: SECTION_MODSTATS, q: SECTION_SHOP };
const TITLE_BY_ACTION = { pex: "Motivo pex", pex_helper: "Motivo pex Helper", pex_mod: "Motivo pex Moderator", pex_senior_moderator: "Motivo pex Senior Moderator", pex_director: "Motivo pex Director", pex_admin: "Motivo pex Admin", pex_manager: "Motivo pex Manager", pex_founder: "Motivo pex Founder", pex_pm: "Motivo pex Partner Manager", depex: "Motivo depex", depex_full: "Motivo depex completo", depex_staff: "Motivo depex", depex_pm_only: "Motivo depex", valpos: "Motivo valutazione positiva", valneg: "Motivo valutazione negativa", warn: "Motivo warn staff", valpos_rm: "Rimuovi valutazione positiva", valneg_rm: "Rimuovi valutazione negativa", warn_rm: "Rimuovi warn staff", ppm_add: "Aggiungi punti partner", ppm_remove: "Rimuovi punti partner" };

function staffHpArrowLabel(verb, dest) {
  const v = String(verb || "").trim() || "Azione";
  const d = String(dest || "").trim() || "Ruolo";
  return `${v} → ${d}`.slice(0, 80);
}

function guildRoleLabel(guild, roleId, fallback) {
  const id = String(roleId || "").trim();
  if (!id) return String(fallback || "Ruolo").trim() || "Ruolo";
  const name = guild?.roles?.cache?.get?.(id)?.name;
  return String(name || fallback || "Ruolo").trim() || "Ruolo";
}

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

const STAFF_HP_TRAIL_NO_SOURCE = "0";

function formatStaffHpTrail(sourceMessageId, panelMessageId) {
  const p = normalizeSourceMessageId(panelMessageId);
  const s = normalizeSourceMessageId(sourceMessageId);
  if (p && s) return `:${s}:${p}`;
  if (p) return `:${STAFF_HP_TRAIL_NO_SOURCE}:${p}`;
  if (s) return `:${s}`;
  return "";
}

function formatStaffHpTrailForModal(sourceMessageId, panelMessageId) {
  const p = normalizeSourceMessageId(panelMessageId);
  if (p) return `:${p}`;
  return formatStaffHpTrail(sourceMessageId, panelMessageId);
}

function formatStaffHpModalSectionShort(section) {
  const sec = String(section || SECTION_HOME).toLowerCase();
  return SECTION_CHAR_FOR_MODAL[sec] || "h";
}

function parseStaffHpModalSectionToken(raw) {
  const t = String(raw || "").toLowerCase();
  if (MODAL_CHAR_TO_SECTION[t]) return MODAL_CHAR_TO_SECTION[t];
  if (STAFF_HP_SECTIONS.has(t)) return t;
  return SECTION_HOME;
}

function parseTrailingStaffHpModalIds(parts) {
  const extras = parts.slice(5);
  if (extras.length >= 2) return parseTrailingStaffHpIds(parts);
  if (extras.length === 1) {
    const panelOnly = normalizeSourceMessageId(extras[0]);
    return { sourceMessageId: null, panelMessageId: panelOnly };
  }
  return { sourceMessageId: null, panelMessageId: null };
}

function buildStaffHpModalCustomId(action, viewerId, targetId, section, sourceMessageId, panelMessageId) {
  const code = STAFF_HP_MODAL_ACTION_CODE[String(action || "")];
  if (!code) return null;
  const secChar = formatStaffHpModalSectionShort(section);
  const trail = formatStaffHpTrailForModal(sourceMessageId, panelMessageId);
  return `${MODAL_PREFIX}:${code}:${viewerId}:${targetId}:${secChar}${trail}`;
}

function getModalTextInputTrimmed(interaction, customId, maxLen = null) {
  try {
    let v = String(interaction.fields.getTextInputValue(customId) || "").trim();
    if (maxLen != null && Number.isFinite(maxLen)) v = v.slice(0, maxLen);
    return v;
  } catch {
    return "";
  }
}

function parseTrailingStaffHpIds(parts) {
  const extras = parts.slice(5);
  let sourceMessageId = null;
  let panelMessageId = null;
  if (extras.length >= 2) {
    const a = String(extras[0] || "").trim();
    const b = String(extras[1] || "").trim();
    const aNorm = normalizeSourceMessageId(a);
    const bNorm = normalizeSourceMessageId(b);
    if (!aNorm && a === STAFF_HP_TRAIL_NO_SOURCE && bNorm) {
      panelMessageId = bNorm;
    } else {
      sourceMessageId = aNorm;
      panelMessageId = bNorm;
    }
  } else if (extras.length === 1) {
    sourceMessageId = normalizeSourceMessageId(extras[0]);
  }
  return { sourceMessageId, panelMessageId };
}

function parseStaffHpButton(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_HP_PREFIX) return null;
  const action = decodeStaffHpButtonActionToken(String(parts[1] || ""));
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const allowed = new Set(["pex_menu", "depex_menu", "val_add_menu", "val_remove_menu", "pex", "pex_helper", "pex_mod", "pex_senior_moderator", "pex_director", "pex_admin", "pex_manager", "pex_founder", "pex_pm", "depex", "depex_full", "depex_staff", "depex_pm_only", "valpos", "valneg", "warn", "valpos_rm", "valneg_rm", "warn_rm", "ppm_add", "ppm_remove", "ppm_r50", "ppm_r100", "ppm_r150", "ppm_r200", "ppm_r250"]);
  if (!allowed.has(action)) return null;
  const section = parseStaffHpButtonSectionToken(parts.length >= 5 ? parts[4] : "");
  const { sourceMessageId, panelMessageId } = parseTrailingStaffHpIds(parts);
  return { action, viewerId, targetId, section, sourceMessageId, panelMessageId };
}

function parseStaffHpSelect(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== STAFF_HP_SELECT_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  if (action !== "prospect_pex" && action !== "pm_hub") return null;
  const section = parseStaffHpButtonSectionToken(parts.length >= 5 ? parts[4] : "");
  const { sourceMessageId, panelMessageId } = parseTrailingStaffHpIds(parts);
  return { action, viewerId, targetId, section, sourceMessageId, panelMessageId };
}

function parseStaffHpModal(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== MODAL_PREFIX) return null;
  const code = String(parts[1] || "");
  const action = STAFF_HP_MODAL_CODE_ACTION[code];
  if (!action) return null;
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const section = parseStaffHpModalSectionToken(parts[4]);
  const { sourceMessageId, panelMessageId } = parseTrailingStaffHpModalIds(parts);
  return { action, viewerId, targetId, section, sourceMessageId, panelMessageId };
}

function panelComponentCustomId(comp) {
  if (!comp) return null;
  if (typeof comp.customId === "string") return comp.customId;
  const d = comp.data;
  if (d && typeof d.custom_id === "string") return d.custom_id;
  return null;
}

function extractSourceFromStaffPanelMessage(message) {
  const rows = message?.components;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const comps = row?.components;
    if (!Array.isArray(comps)) continue;
    for (const comp of comps) {
      const id = panelComponentCustomId(comp);
      if (!id) continue;
      const sid = parseStaffProfileCloseCustomId(id)?.sourceMessageId || parseStaffProfileSelectCustomId(id)?.sourceMessageId || parseStaffHpButton(id)?.sourceMessageId || parseStaffHpSelect(id)?.sourceMessageId;
      if (sid) return sid;
    }
  }
  return null;
}

async function tryRefreshStaffPanelMessage(interaction, parsed, client) {
  const guild = interaction.guild;
  if (!guild || !parsed?.targetId || !parsed?.viewerId) return;
  const section = STAFF_HP_SECTIONS.has(String(parsed.section || "").toLowerCase())
    ? parsed.section
    : SECTION_HOME;
  const panelMid = parsed?.panelMessageId ? String(parsed.panelMessageId).trim() : "";
  const channelId = String(interaction.channelId || interaction.channel?.id || "");
  let channel = interaction.channel;
  if ((!channel || typeof channel.messages?.fetch !== "function") && channelId) {
    channel =
      (await guild.channels.fetch(channelId).catch(() => null)) ||
      (client?.channels?.cache?.get(channelId) ?? null);
  }
  let msg = null;
  if (panelMid && channel?.messages?.fetch) {
    msg = await channel.messages.fetch(panelMid).catch(() => null);
  }
  if ((!msg || typeof msg.edit !== "function") && interaction.message && typeof interaction.message.edit === "function") {
    msg = interaction.message;
  }
  const opts = {};
  const preserved = parsed?.sourceMessageId || (msg ? extractSourceFromStaffPanelMessage(msg) : null) || (interaction.message ? extractSourceFromStaffPanelMessage(interaction.message) : null);
  if (preserved) opts.sourceMessageId = preserved;
  if (channel && (await isPartnerPmDailyCommandsThread(channel))) opts.partnersChatPanel = true;
  try {
    const payload = await buildStaffProfilePayload(guild, parsed.targetId, parsed.viewerId, client, section, opts);
    if (msg && typeof msg.edit === "function") {
      await safeMessageEdit(msg, payload, interaction);
      return;
    }
    global.logger?.warn?.("[staffProfileHighStaff] tryRefreshStaffPanelMessage: nessun messaggio da aggiornare", guild?.id, parsed?.targetId, panelMid || null);
  } catch (err) {
    global.logger?.warn?.("[staffProfileHighStaff] tryRefreshStaffPanelMessage:", err?.message || err);
  }
}

async function ensureHighStaffViewer(interaction) {
  const roleId = IDs.roles?.HighStaff;
  const has = Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
  if (has) return true;
  await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo l'**High Staff** può usare questi pulsanti.", flags: PRIVATE_FLAG }).catch(() => { });
  return false;
}

async function ensurePartnerPointsViewer(interaction) {
  if (viewerCanUsePartnerPointsPanel(interaction.member)) return true;
  await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo **High Staff** o **Founder** possono gestire i punti partner.", flags: PRIVATE_FLAG }).catch(() => { });
  return false;
}

function viewerMayRunDepexFull(member) {
  if (!member?.roles?.cache) return false;
    if (
    IDs.roles.Director &&
    member.roles.cache.has(IDs.roles.Director) &&
    !(IDs.roles.HighStaff && member.roles.cache.has(IDs.roles.HighStaff))
  ) {
    return false;
  }
  if (viewerIsCoordinatorOrAbove(member)) return true;
  if (Boolean(IDs.roles.Helper) && member.roles.cache.has(IDs.roles.Helper)) return true;
  if (Boolean(IDs.roles.SeniorModerator) && member.roles.cache.has(IDs.roles.SeniorModerator)) return true;
  return Boolean(IDs.roles.Mod && member.roles.cache.has(IDs.roles.Mod));
}

async function ensureDepexFullViewer(interaction) {
  if (viewerMayRunDepexFull(interaction.member)) return true;
  await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo **Helper**, **Mod** o ruoli superiori possono usare **Depex completo**.", flags: PRIVATE_FLAG }).catch(() => { });
  return false;
}

function targetIsPmOnlyWithoutStaffLadder(member) {
  if (!member?.roles?.cache) return false;
  const hasPm = Boolean(IDs.roles.PartnerManager && member.roles.cache.has(IDs.roles.PartnerManager));
  return hasPm && !getHighestLadderRole(member);
}

function targetShouldChooseDepexMode(member) {
  if (!member?.roles?.cache) return true;
  if (Boolean(IDs.roles.SeniorModerator) && member.roles.cache.has(IDs.roles.SeniorModerator)) return true;
  if (Boolean(IDs.roles.Director) && member.roles.cache.has(IDs.roles.Director)) return true;
  if (Boolean(IDs.roles.Admin) && member.roles.cache.has(IDs.roles.Admin)) return true;
  if (Boolean(IDs.roles.Manager) && member.roles.cache.has(IDs.roles.Manager)) return true;
  return false;
}

const STAFF_HP_PM_HUB_ACTIONS = new Set([
  "depex_pm_only",
  "ppm_add",
  "ppm_remove",
  "ppm_r50",
  "ppm_r100",
  "ppm_r150",
  "ppm_r200",
  "ppm_r250",
]);

async function handlePartnerRedeemStaffHp(interaction, parsed) {
  const redeemTier = partnerManagerRedeemTierFromAction(parsed.action);
  if (redeemTier == null) return false;
  if (String(parsed.viewerId) === String(parsed.targetId)) {
    await interaction.reply({ content: `<a:VC_Cross:1482532424570376253> Il **riscatto premi** lo può usare solo l'**High Staff** sul tuo profilo.`, flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  if (!viewerCanUsePartnerPointsPanel(interaction.member)) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo l'**High Staff** può usare il **riscatto premi**.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo nel server.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
  const pmRoleId = IDs.roles.PartnerManager;
  if (!pmRoleId || !targetMember?.roles?.cache?.has(pmRoleId)) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Il riscatto è riservato al ruolo **Partner Manager**.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => { });
  const res = await completePartnerManagerRedeemForGuild(guild, interaction.client, {
    targetUserId: parsed.targetId,
    redeemTier,
    actorUser: interaction.user,
  });
  if (!res.ok) {
    await interaction.editReply({ content: res.userMessage }).catch(() => { });
    return true;
  }
  await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
  await interaction.editReply({ content: res.userMessage }).catch(() => { });
  return true;
}

async function openStaffHpReasonModalFromButton(interaction, parsed) {
  if (staffHpActionIsPexOrDepex(parsed.action)) {
    const targetMemberGuard = await interaction.guild?.members?.fetch?.(parsed.targetId).catch(() => null);
    if (shouldOmitPexDepexHomeRow(parsed.viewerId, parsed.targetId, targetMemberGuard)) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> **Pex** e **Depex** non sono disponibili sul **tuo** profilo.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
  }
  const selfHp = String(parsed.viewerId) === String(parsed.targetId);
  const isPpmBtn = parsed.action === "ppm_add" || parsed.action === "ppm_remove";
  if (isPpmBtn) {
    if (!selfHp && !(await ensurePartnerPointsViewer(interaction))) return true;
  } else if (parsed.action === "depex_full" || parsed.action === "depex_staff") {
    if (!(await ensureDepexFullViewer(interaction))) return true;
  } else if (!selfHp && parsed.action === "pex_founder") {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Il pex **Member → Founder** non è disponibile sul profilo di un altro utente.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  } else if (!selfHp && FOUNDER_ONLY_PROSPECT_PEX_ACTIONS.has(parsed.action)) {
    if (!viewerIsFounder(interaction.member)) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo i **Founder** possono usare **Member → Mod/Senior Moderator/Director/Admin/Manager**.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
  } else if (!selfHp && !(await ensureHighStaffViewer(interaction))) {
    return true;
  }
  const panelForModal = parsed.panelMessageId || interaction.message?.id || "";
  const modalId = buildStaffHpModalCustomId(parsed.action, parsed.viewerId, parsed.targetId, parsed.section, parsed.sourceMessageId, panelForModal);
  const title = TITLE_BY_ACTION[parsed.action] || "Azione staff";
  let modal;
  if (parsed.action === "warn_rm") {
    modal = buildWarnRemoveModal(modalId, title);
  } else if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm") {
    modal = buildIdReasonModal(modalId, title);
  } else if (parsed.action === "ppm_add") {
    modal = buildPpmAddModal(modalId, title);
  } else if (parsed.action === "ppm_remove") {
    modal = buildPpmRemoveModal(modalId, title);
  } else {
    modal = buildReasonModal(modalId, title);
  }
  await interaction.showModal(modal).catch(() => { });
  return true;
}

async function ensureNoUnauthorizedSelfStaffHp(interaction, parsed) {
  const self = String(parsed.viewerId) === String(parsed.targetId);
  if (!self) return true;
  const action = String(parsed.action || "");
  if (action === "ppm_add" || action === "ppm_remove") {
    if (viewerCanUsePartnerPointsPanel(interaction.member)) return true;
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo l'**High Staff** può gestire i punti partner.", flags: PRIVATE_FLAG }).catch(() => { });
    return false;
  }
  if (viewerIsFounder(interaction.member)) return true;
  await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Sul **tuo** profilo queste azioni sono consentite solo a un **Founder**.", flags: PRIVATE_FLAG }).catch(() => { });
  return false;
}

function staffHpActionIsPexOrDepex(action) {
  const a = String(action || "");
  if (a === "pex" || a === "pex_pm" || a === "depex") return true;
  if (a.startsWith("pex_")) return true;
  if (a.startsWith("depex")) return true;
  return false;
}

function buildReasonModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildIdReasonModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const idInput = new TextInputBuilder()
    .setCustomId(IN_IDX)
    .setLabel("ID dal log (# o footer)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  const reasonInput = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo rimozione")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  modal.addComponents(
    new ActionRowBuilder().addComponents(idInput),
    new ActionRowBuilder().addComponents(reasonInput),
  );
  return modal;
}

function buildWarnRemoveModal(customId, title) {
  const modal = buildIdReasonModal(customId, title);
  const tradeInput = new TextInputBuilder()
    .setCustomId(IN_TRADE_POS)
    .setLabel("N. positive da scambiare")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("vuoto = nessuna (es. 10)")
    .setMaxLength(3);
  modal.addComponents(new ActionRowBuilder().addComponents(tradeInput));
  return modal;
}

function buildPpmAddModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const amt = new TextInputBuilder()
    .setCustomId(IN_PPM_AMOUNT)
    .setLabel("Quantità punti")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  modal.addComponents(new ActionRowBuilder().addComponents(amt));
  return modal;
}

function buildPpmRemoveModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const reasonInput = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  const amt = new TextInputBuilder()
    .setCustomId(IN_PPM_AMOUNT)
    .setLabel("Quantità")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Default: 1")
    .setMaxLength(5);
  const linkInput = new TextInputBuilder()
    .setCustomId(IN_PPM_LINK)
    .setLabel("Link messaggio")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);
  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(amt),
    new ActionRowBuilder().addComponents(linkInput),
  );
  return modal;
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_HP_PREFIX}:`)) return true;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${STAFF_HP_SELECT_PREFIX}:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${MODAL_PREFIX}:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isStringSelectMenu()) {
    const parsedSel = parseStaffHpSelect(interaction.customId);
    if (!parsedSel) return false;
    if (String(interaction.user.id) !== parsedSel.viewerId) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare questi pulsanti.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (parsedSel.action === "pm_hub") {
      const chosenTok = String(interaction.values?.[0] || "");
      const subAction = decodeStaffHpButtonActionToken(chosenTok);
      if (!STAFF_HP_PM_HUB_ACTIONS.has(subAction)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Selezione non valida.", flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const parsedHub = {
        ...parsedSel,
        action: subAction,
        panelMessageId: parsedSel.panelMessageId || interaction.message?.id || null,
      };
      if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsedHub))) return true;
      if (subAction === "depex_pm_only" || subAction === "ppm_add" || subAction === "ppm_remove") {
        return await openStaffHpReasonModalFromButton(interaction, parsedHub);
      }
      const redeemTierSel = partnerManagerRedeemTierFromAction(subAction);
      if (redeemTierSel != null) return await handlePartnerRedeemStaffHp(interaction, parsedHub);
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Azione non supportata.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsedSel))) return true;
    if (!viewerIsFounder(interaction.member)) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo un **Founder** può usare **Member → Mod/Senior Moderator/Director/Admin/Manager** da questo menu.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    const chosenAction = String(interaction.values?.[0] || "");
    const allowed = FOUNDER_ONLY_PROSPECT_PEX_ACTIONS;
    if (!allowed.has(chosenAction)) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Selezione non valida.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    const panelForModal = parsedSel.panelMessageId || interaction.message?.id || "";
    const modalId = buildStaffHpModalCustomId(chosenAction, parsedSel.viewerId, parsedSel.targetId, parsedSel.section, parsedSel.sourceMessageId, panelForModal);
    const title = TITLE_BY_ACTION[chosenAction] || "Azione staff";
    const modal = buildReasonModal(modalId, title);
    await interaction.showModal(modal).catch(() => { });
    return true;
  }

  if (interaction.isButton()) {
    const parsed = parseStaffHpButton(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare questi pulsanti.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsed))) return true;
    const redeemTierBtn = partnerManagerRedeemTierFromAction(parsed.action);
    if (redeemTierBtn != null) return handlePartnerRedeemStaffHp(interaction, parsed);
    if (parsed.action === "pex_menu" || parsed.action === "depex_menu") {
      if (!(await ensureHighStaffViewer(interaction))) return true;
      const targetMember = await interaction.guild?.members?.fetch?.(parsed.targetId).catch(() => null);
      if (shouldOmitPexDepexHomeRow(parsed.viewerId, parsed.targetId, targetMember)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> **Pex** e **Depex** non sono disponibili sul **tuo** profilo.", flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const trail = formatStaffHpTrail(parsed.sourceMessageId, interaction.message?.id);
      const secTok = staffHpSectionToken(parsed.section);
      const hasPartnerManager = Boolean(targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager));
      if (parsed.action === "pex_menu") {
        if (targetIsPmOnlyWithoutStaffLadder(targetMember)) {
          const pexRows = buildProspectPexRows(
            parsed.viewerId,
            parsed.targetId,
            parsed.sourceMessageId,
            viewerIsFounder(interaction.member),
            { hidePartnerManagerPex: true, staffPexFromPartnerManager: true },
          );
          await interaction.reply({
            content: "Scegli il ruolo staff da aggiungere (mantiene Partner Manager):",
            components: pexRows,
            flags: PRIVATE_FLAG,
          }).catch(() => { });
          return true;
        }
        const highest = getHighestLadderRole(targetMember);
        const nextLadderId = getNextLadderRoleId(highest);
        const pexStaffDest = nextLadderId
          ? guildRoleLabel(interaction.guild, nextLadderId, "Ruolo nuovo")
          : "Ruolo nuovo";
        const pexRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("pex")}:${parsed.viewerId}:${parsed.targetId}:${secTok}${trail}`)
            .setLabel(staffHpArrowLabel("Pex", pexStaffDest))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("pex_pm")}:${parsed.viewerId}:${parsed.targetId}:${secTok}${trail}`)
            .setLabel(staffHpArrowLabel("Pex", "Partner Manager"))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(hasPartnerManager),
        );
        await interaction.reply({ content: "Scegli il tipo di pex:", components: [pexRow], flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      if (shouldOmitStaffLadderPexDepexForTarget(targetMember)) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> **Depex** non è disponibile su un **Founder**. Puoi usare **Pex → Partner Manager** se non ha ancora PM.",
          flags: PRIVATE_FLAG,
        }).catch(() => { });
        return true;
      }
      if (!targetShouldChooseDepexMode(targetMember)) {
        return await openStaffHpReasonModalFromButton(interaction, { ...parsed, action: "depex_full" });
      }
      const highestDepex = getHighestLadderRole(targetMember);
      const depexLadderDestId = peekDepexLadderTargetRoleId(highestDepex);
      const depexLadderDest = depexLadderDestId
        ? guildRoleLabel(
            interaction.guild,
            depexLadderDestId,
            String(depexLadderDestId) === String(IDs.roles.Member) ? "Member" : "Ruolo nuovo",
          )
        : "Ruolo nuovo";
      const memberDest = guildRoleLabel(interaction.guild, IDs.roles.Member, "Member");
      const depexRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("depex_staff")}:${parsed.viewerId}:${parsed.targetId}:${secTok}${trail}`)
          .setLabel(staffHpArrowLabel("Depex", depexLadderDest))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("depex_full")}:${parsed.viewerId}:${parsed.targetId}:${secTok}${trail}`)
          .setLabel(staffHpArrowLabel("Depex", memberDest))
          .setStyle(ButtonStyle.Secondary),
      );
      if (hasPartnerManager) {
        depexRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("depex_pm_only")}:${parsed.viewerId}:${parsed.targetId}:${secTok}${trail}`)
            .setLabel(staffHpArrowLabel("Depex", "Partner Manager"))
            .setStyle(ButtonStyle.Secondary),
        );
      }
      await interaction.reply({ content: "Scegli il tipo di depex:", components: [depexRow], flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (parsed.action === "val_add_menu" || parsed.action === "val_remove_menu") {
      const selfHp = String(parsed.viewerId) === String(parsed.targetId);
      if (!selfHp && !(await ensureHighStaffViewer(interaction))) return true;
      const trailVal = formatStaffHpTrail(parsed.sourceMessageId, interaction.message?.id);
      const secTokVal = staffHpSectionToken(parsed.section);
      if (parsed.action === "val_add_menu") {
        const addRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("valpos")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
            .setLabel("Positiva")
            .setEmoji("<:thumbsup:1471292172145004768>")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("valneg")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
            .setLabel("Negativa")
            .setEmoji("<:thumbsdown:1471292163957457013>")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("warn")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
            .setLabel("Warn")
            .setEmoji("<:banhammer:1443651875441217639>")
            .setStyle(ButtonStyle.Danger),
        );
        await interaction.reply({ content: "Cosa vuoi aggiungere?", components: [addRow], flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const rmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("valpos_rm")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
          .setLabel("Positiva")
          .setEmoji("<:thumbsup:1471292172145004768>")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("valneg_rm")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
          .setLabel("Negativa")
          .setEmoji("<:thumbsdown:1471292163957457013>")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:${encodeStaffHpButtonAction("warn_rm")}:${parsed.viewerId}:${parsed.targetId}:${secTokVal}${trailVal}`)
          .setLabel("Warn")
          .setEmoji("<:banhammer:1443651875441217639>")
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: "Cosa vuoi rimuovere?", components: [rmRow], flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    return await openStaffHpReasonModalFromButton(interaction, parsed);
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseStaffHpModal(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può inviare questo form.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsed))) return true;
    const selfHp = String(parsed.viewerId) === String(parsed.targetId);
    const isPpmModal = parsed.action === "ppm_add" || parsed.action === "ppm_remove";
    if (isPpmModal) {
      if (!selfHp && !(await ensurePartnerPointsViewer(interaction))) return true;
    } else if (parsed.action === "depex_full" || parsed.action === "depex_staff") {
      if (!(await ensureDepexFullViewer(interaction))) return true;
    } else if (!selfHp && parsed.action === "pex_founder") {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Il pex **Member → Founder** non è disponibile sul profilo di un altro utente.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    } else if (!selfHp && FOUNDER_ONLY_PROSPECT_PEX_ACTIONS.has(parsed.action)) {
      if (!viewerIsFounder(interaction.member)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo un **Founder** può usare **Member → Mod/Senior Moderator/Director/Admin/Manager**.", flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
    } else if (!selfHp && !(await ensureHighStaffViewer(interaction))) {
      return true;
    }
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo nel server.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    const reason = getModalTextInputTrimmed(interaction, IN_REASON, 500);
    const sendModalReply = async (payload) => {
      const base = { ...(payload || {}) };
      if (base.flags == null) base.flags = PRIVATE_FLAG;
      if (interaction.deferred || interaction.replied) {
        const editPayload = { ...base };
        delete editPayload.flags;
        await interaction.editReply(editPayload).catch(async () => await interaction.followUp(base).catch(() => { }));
        return;
      }
      await interaction.reply(base).catch(() => { });
    };
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => { });
    }
    const targetUser = await interaction.client.users.fetch(parsed.targetId).catch(() => null);
    if (!targetUser) {
      await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Utente non trovato." });
      return true;
    }
    if (staffHpActionIsPexOrDepex(parsed.action)) {
      const targetMemberModalGuard = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (shouldOmitPexDepexHomeRow(parsed.viewerId, parsed.targetId, targetMemberModalGuard)) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> **Pex** e **Depex** non sono disponibili sul **tuo** profilo." });
        return true;
      }
    }
    let res;
    if (parsed.action === "ppm_add") {
      const rawAmt = getModalTextInputTrimmed(interaction, IN_PPM_AMOUNT);
      const amount = parseInt(rawAmt, 10);
      if (!Number.isInteger(amount) || amount < 1) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Quantità non valida." });
        return true;
      }
      if (amount > MAX_PPM_AMOUNT) {
        await sendModalReply({ content: `<a:VC_Cross:1482532424570376253> Massimo \`${MAX_PPM_AMOUNT}\` punti per azione.` });
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> I punti partner si gestiscono solo per Partner Manager." });
        return true;
      }
      const staffData = await addPartnerPoints(guild.id, targetUser.id, amount, {
        client: interaction.client,
        guild,
      });
      const changeLabel = formatPartnerPointsChange("add", amount);
      await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
      await sendModalReply({
        content: `<a:VC_Verified:1482532479637127188> **${changeLabel}** a ${targetUser}. Totale: \`${resolveStaffPartnerPointsDisplay(staffData?.staff)}\`.`,
      });
      return true;
    }
    if (parsed.action === "ppm_remove") {
      const rawAmt = getModalTextInputTrimmed(interaction, IN_PPM_AMOUNT);
      let amount = 1;
      if (rawAmt) {
        amount = parseInt(rawAmt, 10);
        if (!Number.isInteger(amount) || amount < 1) {
          await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Quantità non valida." });
          return true;
        }
        if (amount > MAX_PPM_AMOUNT) {
          await sendModalReply({ content: `<a:VC_Cross:1482532424570376253> Massimo \`${MAX_PPM_AMOUNT}\` punti per azione.` });
          return true;
        }
      }
      const motivo = reason;
      const messageLink = getModalTextInputTrimmed(interaction, IN_PPM_LINK);
      if (!motivo) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> I punti partner si gestiscono solo per Partner Manager." });
        return true;
      }
      const staffData = await removePartnerPoints(guild.id, targetUser.id, amount);
      const removedAmount = Math.max(0, Math.floor(Number(staffData?._partnerPointsRemoved ?? amount) || 0));
      const changeLabel = formatPartnerPointsChange("remove", removedAmount);
      const { logPmPointsRemoved } = require("../Utils/Partner/pmPointsRemovedStore");
      const { getPartnershipLogChannelIds } = require("../Utils/Partner/partnershipConfigResolver");
      const { isDiscordStaffChannelPostsEnabled } = require("../Utils/Web/discordWorkflowUiGate");
      const IDs = require("../Utils/Config/ids");
      const channelIds = getPartnershipLogChannelIds(guild.id);
      const hardFallback = isDiscordStaffChannelPostsEnabled()
        ? String(IDs.channels?.puntiTolti || "").trim()
        : "";
      let mirrorChannel = null;
      if (isDiscordStaffChannelPostsEnabled()) {
        for (const cid of [channelIds.primary, channelIds.fallback, hardFallback]) {
          if (!cid) continue;
          mirrorChannel = guild.channels.cache.get(cid) || null;
          if (mirrorChannel?.isTextBased?.()) break;
          mirrorChannel = null;
        }
      }
      const logLines = [
        `<:VC_PartnerManager:1494286911286808576> ${targetUser}`,
        `<:VC_reason:1478517122929004544> ${motivo}`,
      ];
      if (messageLink) logLines.push(`<:VC_Link:1482460590894088222> ${messageLink}`);
      await logPmPointsRemoved({
        guild,
        pmUserId: targetUser.id,
        rule: motivo,
        messageLink: messageLink || null,
        actorUserId: interaction.user.id,
        status: "logged",
        source: "hs_manual",
        mirrorChannel,
        mirrorContent: logLines.join("\n"),
      });
      await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
      await sendModalReply({
        content: `<a:VC_Verified:1482532479637127188> **${changeLabel}** a ${targetUser}. Totale: \`${resolveStaffPartnerPointsDisplay(staffData?.staff)}\`.`,
      });
      return true;
    }
    if (parsed.action === "pex" || parsed.action.startsWith("pex_")) {
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      if (parsed.action === "pex_pm") {
        res = await runProspectStaffPexToPartnerManager(guild, interaction.client, targetUser, interaction.user, reason);
      } else {
        const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
        if (targetMember && getHighestLadderRole(targetMember)) {
          res = await runProfileStaffPex(guild, interaction.client, targetUser, interaction.user, reason);
        } else {
          const roleByAction = { pex_helper: IDs.roles.Helper, pex_mod: IDs.roles.Mod, pex_senior_moderator: IDs.roles.SeniorModerator, pex_director: IDs.roles.Director, pex_admin: IDs.roles.Admin, pex_manager: IDs.roles.Manager, pex_founder: IDs.roles.Founder };
          const selectedRoleId = roleByAction[parsed.action] || IDs.roles.Helper;
          res = await runProspectStaffPex(guild, interaction.client, targetUser, interaction.user, reason, selectedRoleId);
        }
      }
    } else if (parsed.action === "depex" || parsed.action === "depex_full" || parsed.action === "depex_staff" || parsed.action === "depex_pm_only") {
      const targetMemberDepex = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (shouldOmitStaffLadderPexDepexForTarget(targetMemberDepex) && parsed.action !== "depex_pm_only") {
        await sendModalReply({
          content: "<a:VC_Cross:1482532424570376253> **Depex** non è disponibile su un **Founder** (solo rimozione PM se applicabile).",
        });
        return true;
      }
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      if (parsed.action === "depex") {
        res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "auto");
      } else if (parsed.action === "depex_full") {
        res = await runProfileStaffCompleteDepex(guild, interaction.client, targetUser, interaction.member, reason);
      } else if (parsed.action === "depex_staff") {
        res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "ladder");
      } else {
        res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "partner_manager");
      }
    } else if (parsed.action === "valpos") {
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      res = await valutazioneCmd.runValutazionePositiveAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "valneg") {
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      res = await valutazioneCmd.runValutazioneNegativeAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "warn") {
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffWarnAdd(guild, interaction.client, targetUser, interaction.user, reason);
    } else if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm" || parsed.action === "warn_rm") {
      const rawId = getModalTextInputTrimmed(interaction, IN_IDX, 4);
      const removeId = parseInt(rawId, 10);
      if (!reason) {
        await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Motivo obbligatorio." });
        return true;
      }
      if (parsed.action === "valpos_rm") {
        res = await valutazioneCmd.runValutazionePositiveRemoveForPanel(guild, interaction.member, targetUser, removeId, reason);
      } else if (parsed.action === "valneg_rm") {
        res = await valutazioneCmd.runValutazioneNegativeRemoveForPanel(guild, interaction.member, targetUser, removeId, reason);
      } else {
        const tradeRaw = getModalTextInputTrimmed(interaction, IN_TRADE_POS, 3);
        let positiveTradeCount = 0;
        if (tradeRaw) {
          positiveTradeCount = parseInt(tradeRaw, 10);
          if (!Number.isInteger(positiveTradeCount) || positiveTradeCount < 1) {
            await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Numero positive non valido (usa un intero ≥ 1, oppure lascia vuoto)." });
            return true;
          }
          if (positiveTradeCount > MAX_WARN_REMOVE_POS_TRADE) {
            await sendModalReply({ content: `<a:VC_Cross:1482532424570376253> Massimo \`${MAX_WARN_REMOVE_POS_TRADE}\` positive per scambio.` });
            return true;
          }
        }
        res = await runProfileStaffWarnRemove(guild, interaction.client, targetUser, interaction.user, removeId, reason, {
          positiveTradeCount,
        });
      }
    } else {
      await sendModalReply({ content: "<a:VC_Cross:1482532424570376253> Azione non riconosciuta." });
      return true;
    }
    if (!res || !res.ok) {
      await sendModalReply({ content: res?.message || "<a:VC_Cross:1482532424570376253> Operazione non riuscita." });
      return true;
    }
    await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
    await sendModalReply({
      content: res.message || "<a:VC_Verified:1482532479637127188> Azione registrata.",
    });
    return true;
  }

  return false;
}

module.exports = { name: "staffProfileHighStaff", order: 11, match, execute };