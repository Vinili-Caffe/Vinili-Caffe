const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const {
  STAFF_HP_PREFIX,
  STAFF_HP_SELECT_PREFIX,
  viewerCanUsePartnerPointsPanel,
  viewerIsCoordinatorOrAbove,
  viewerIsFounderOrCoFounder,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_MODSTATS,
  buildStaffProfilePayload,
  parseStaffProfileCloseCustomId,
  parseStaffProfileSelectCustomId,
} = require("../Utils/Staff/staffProfilePanelRuntime");
const { runProfileStaffPex, runProspectStaffPex, runProspectStaffPexToPartnerManager, runProfileStaffDepex, runProfileStaffCompleteDepex, runProfileStaffWarnAdd, runProfileStaffWarnRemove } = require("../Utils/Staff/staffPanelActions");
const valutazioneCmd = require("../Utils/Staff/valutazionePanelActions");
const { addPartnerPoints, removePartnerPoints, formatPartnerPointsChange } = require("../Utils/Staff/partnerPointsUtils");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils");
const { isChannelOrThreadUnderPartnersChat } = require("../Utils/Partner/partnersChatChannelUtils");
const MODAL_PREFIX = "staff_hp_modal";
const IN_REASON = "staff_hp_reason";
const IN_IDX = "staff_hp_idx";
const IN_PPM_AMOUNT = "staff_hp_ppm_amount";
const IN_PPM_LINK = "staff_hp_ppm_link";
const PRIVATE_FLAG = 1 << 6;
const MAX_PPM_AMOUNT = 10000;
const STAFF_HP_SECTIONS = new Set([SECTION_HOME, SECTION_VALUTAZIONI, SECTION_WARN, SECTION_PAUSE, SECTION_MODSTATS]);

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
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
const TITLE_BY_ACTION = { pex: "Motivo pex",
  pex_helper: "Motivo pex Helper",
  pex_mod: "Motivo pex Mod",
  pex_coord: "Motivo pex Coordinator",
  pex_supervisor: "Motivo pex Supervisor",
  pex_admin: "Motivo pex Admin",
  pex_cofounder: "Motivo pex Co-Founder",
  pex_founder: "Motivo pex Founder",
  pex_pm: "Motivo pex Partner Manager",
  depex: "Motivo depex",
  depex_full: "Motivo depex completo",
  depex_staff: "Motivo depex (scala staff)",
  depex_pm_only: "Motivo depex (Partner Manager)",
  valpos: "Motivo valutazione positiva",
  valneg: "Motivo valutazione negativa",
  warn: "Motivo warn staff",
  valpos_rm: "Rimuovi valutazione positiva",
  valneg_rm: "Rimuovi valutazione negativa",
  warn_rm: "Rimuovi warn staff",
  ppm_add: "Aggiungi punti partner",
  ppm_remove: "Rimuovi punti partner",
};

function parseStaffPanelSection(parts) {
  const raw = parts.length >= 5 ? String(parts[4] || "").toLowerCase() : "";
  if (raw && STAFF_HP_SECTIONS.has(raw)) return raw;
  return SECTION_HOME;
}

function parseTrailingStaffHpIds(parts) {
  const extras = parts.slice(5);
  let sourceMessageId = null;
  let panelMessageId = null;
  if (extras.length >= 2) {
    sourceMessageId = normalizeSourceMessageId(extras[0]);
    panelMessageId = normalizeSourceMessageId(extras[1]);
  } else if (extras.length === 1) {
    sourceMessageId = normalizeSourceMessageId(extras[0]);
  }
  return { sourceMessageId, panelMessageId };
}

function parseStaffHpButton(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_HP_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const allowed = new Set([
    "pex_menu",
    "depex_menu",
    "val_add_menu",
    "val_remove_menu",
    "pex",
    "pex_helper",
    "pex_mod",
    "pex_coord",
    "pex_supervisor",
    "pex_admin",
    "pex_cofounder",
    "pex_founder",
    "pex_pm",
    "depex",
    "depex_full",
    "depex_staff",
    "depex_pm_only",
    "valpos",
    "valneg",
    "warn",
    "valpos_rm",
    "valneg_rm",
    "warn_rm",
    "ppm_add",
    "ppm_remove",
  ]);
  if (!allowed.has(action)) return null;
  const section = parseStaffPanelSection(parts);
  const { sourceMessageId, panelMessageId } = parseTrailingStaffHpIds(parts);
  return {
    action,
    viewerId,
    targetId,
    section,
    sourceMessageId,
    panelMessageId,
  };
}

function parseStaffHpSelect(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== STAFF_HP_SELECT_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  if (action !== "prospect_pex") return null;
  const section = parseStaffPanelSection(parts);
  const { sourceMessageId, panelMessageId } = parseTrailingStaffHpIds(parts);
  return { action, viewerId, targetId, section, sourceMessageId, panelMessageId };
}

function parseStaffHpModal(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== MODAL_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const allowed = new Set([
    "pex",
    "pex_helper",
    "pex_mod",
    "pex_coord",
    "pex_supervisor",
    "pex_admin",
    "pex_cofounder",
    "pex_founder",
    "pex_pm",
    "depex",
    "depex_full",
    "depex_staff",
    "depex_pm_only",
    "valpos",
    "valneg",
    "warn",
    "valpos_rm",
    "valneg_rm",
    "warn_rm",
    "ppm_add",
    "ppm_remove",
  ]);
  if (!allowed.has(action)) return null;
  const section = parseStaffPanelSection(parts);
  const panelMessageId = parts.length >= 6 ? normalizeSourceMessageId(parts[5]) : null;
  return {
    action,
    viewerId,
    targetId,
    section,
    sourceMessageId: null,
    panelMessageId,
  };
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
      const sid =
        parseStaffProfileCloseCustomId(id)?.sourceMessageId ||
        parseStaffProfileSelectCustomId(id)?.sourceMessageId ||
        parseStaffHpButton(id)?.sourceMessageId;
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
  let msg = interaction.message;
  const panelMid = parsed?.panelMessageId ? String(parsed.panelMessageId).trim() : "";
  const channelId = String(interaction.channelId || interaction.channel?.id || "");
  let channel = interaction.channel;
  if ((!channel || typeof channel.messages?.fetch !== "function") && channelId) {
    channel =
      (await guild.channels.fetch(channelId).catch(() => null)) ||
      (client?.channels?.cache?.get(channelId) ?? null);
  }
  if ((!msg || typeof msg.edit !== "function") && panelMid && channel?.messages?.fetch) {
    msg = await channel.messages.fetch(panelMid).catch(() => null);
  }
  const opts = {};
  const preserved =
    parsed?.sourceMessageId ||
    (msg ? extractSourceFromStaffPanelMessage(msg) : null) ||
    (interaction.message ? extractSourceFromStaffPanelMessage(interaction.message) : null);
  if (preserved) opts.sourceMessageId = preserved;
  if (channel && isChannelOrThreadUnderPartnersChat(channel)) opts.partnersChatPanel = true;
  try {
    const payload = await buildStaffProfilePayload(
      guild,
      parsed.targetId,
      parsed.viewerId,
      client,
      section,
      opts,
    );
    if (msg && typeof msg.edit === "function") await msg.edit(payload);
  } catch {
  }
}

async function ensureHighStaffViewer(interaction) {
  const roleId = IDs.roles?.HighStaff;
  const has = Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
  if (has) return true;
  await interaction
    .reply({
      content: "<:vegax:1443934876440068179> Solo l'**High Staff** può usare questi pulsanti.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
  return false;
}

async function ensurePartnerPointsViewer(interaction) {
  if (viewerCanUsePartnerPointsPanel(interaction.member)) return true;
  await interaction
    .reply({
      content:
        "<:vegax:1443934876440068179> Solo **High Staff**, **Founder** o **Co-Founder** possono gestire i punti partner (su altri profili).",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
  return false;
}

async function ensureCoordinatorPlusViewer(interaction) {
  if (viewerIsCoordinatorOrAbove(interaction.member)) return true;
  await interaction
    .reply({
      content: "<:vegax:1443934876440068179> Solo da **Coordinator** in su puoi usare questo pulsante.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
  return false;
}

async function ensureNoUnauthorizedSelfStaffHp(interaction, parsed) {
  const self = String(parsed.viewerId) === String(parsed.targetId);
  if (!self) return true;
  if (viewerIsFounderOrCoFounder(interaction.member)) return true;
  await interaction
    .reply({
      content:
        "<:vegax:1443934876440068179> Sul **tuo** profilo queste azioni sono consentite solo a **Founder** e **Co-Founder**.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
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
    .setLabel("Numero (1, 2, 3… dalla lista)")
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
  const linkInput = new TextInputBuilder()
    .setCustomId(IN_PPM_LINK)
    .setLabel("Link messaggio")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput), new ActionRowBuilder().addComponents(linkInput));
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
    const parsed = parseStaffHpSelect(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare questi controlli.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsed))) return true;
    if (!(await ensureHighStaffViewer(interaction))) return true;
    const chosenAction = String(interaction.values?.[0] || "");
    const allowed = new Set(["pex_mod", "pex_coord", "pex_supervisor", "pex_admin", "pex_cofounder", "pex_founder"]);
    if (!allowed.has(chosenAction)) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Selezione non valida.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    const panelForModal = parsed.panelMessageId || interaction.message?.id || "";
    const panelSuffix = panelForModal ? `:${panelForModal}` : "";
    const modalId = `${MODAL_PREFIX}:${chosenAction}:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${panelSuffix}`;
    const title = TITLE_BY_ACTION[chosenAction] || "Azione staff";
    const modal = buildReasonModal(modalId, title);
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isButton()) {
    const parsed = parseStaffHpButton(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare questi pulsanti.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsed))) return true;
    if (parsed.action === "pex_menu" || parsed.action === "depex_menu") {
      const sourceSuffix = parsed.sourceMessageId ? `:${parsed.sourceMessageId}` : "";
      const targetMember = await interaction.guild?.members?.fetch?.(parsed.targetId).catch(() => null);
      const hasPartnerManager = Boolean(targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager));
      if (parsed.action === "pex_menu") {
        const pexRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:pex:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${sourceSuffix}`)
            .setLabel("Pex Staff")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:pex_pm:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${sourceSuffix}`)
            .setLabel("Pex Partner Manager")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(hasPartnerManager),
        );
        await interaction.reply({
          content: "Scegli il tipo di pex:",
          components: [pexRow],
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      const depexRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:depex_staff:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${sourceSuffix}`)
          .setLabel("Depex")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:depex_full:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${sourceSuffix}`)
          .setLabel("Depex Completo")
          .setStyle(ButtonStyle.Secondary),
      );
      if (hasPartnerManager) {
        depexRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:depex_pm_only:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${sourceSuffix}`)
            .setLabel("Depex Partner Manager")
            .setStyle(ButtonStyle.Secondary),
        );
      }
      await interaction.reply({
        content: "Scegli il tipo di depex:",
        components: [depexRow],
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }
    if (parsed.action === "val_add_menu" || parsed.action === "val_remove_menu") {
      const selfHp = String(parsed.viewerId) === String(parsed.targetId);
      if (!selfHp && !(await ensureHighStaffViewer(interaction))) return true;
      const sourceSuffix = parsed.sourceMessageId ? `:${parsed.sourceMessageId}` : "";
      const panelExtra = interaction.message?.id ? `:${interaction.message.id}` : "";
      const sec = parsed.section;
      if (parsed.action === "val_add_menu") {
        const addRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:valpos:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
            .setLabel("Positiva")
            .setEmoji("<:thumbsup:1471292172145004768>")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:valneg:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
            .setLabel("Negativa")
            .setEmoji("<:thumbsdown:1471292163957457013>")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`${STAFF_HP_PREFIX}:warn:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
            .setLabel("Warn")
            .setEmoji("<:banhammer:1443651875441217639>")
            .setStyle(ButtonStyle.Danger),
        );
        await interaction.reply({
          content: "Cosa vuoi aggiungere?",
          components: [addRow],
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      const rmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:valpos_rm:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
          .setLabel("Positiva")
          .setEmoji("<:thumbsup:1471292172145004768>")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:valneg_rm:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
          .setLabel("Negativa")
          .setEmoji("<:thumbsdown:1471292163957457013>")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${STAFF_HP_PREFIX}:warn_rm:${parsed.viewerId}:${parsed.targetId}:${sec}${sourceSuffix}${panelExtra}`)
          .setLabel("Warn")
          .setEmoji("<:banhammer:1443651875441217639>")
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        content: "Cosa vuoi rimuovere?",
        components: [rmRow],
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }
    const selfHp = String(parsed.viewerId) === String(parsed.targetId);
    const isPpmBtn = parsed.action === "ppm_add" || parsed.action === "ppm_remove";
    if (isPpmBtn) {
      if (!selfHp && !(await ensurePartnerPointsViewer(interaction))) return true;
    } else if (parsed.action === "depex_full") {
      if (!(await ensureCoordinatorPlusViewer(interaction))) return true;
    } else if (!selfHp && !(await ensureHighStaffViewer(interaction))) {
      return true;
    }
    const panelForModal = parsed.panelMessageId || interaction.message?.id || "";
    const panelSuffix = panelForModal ? `:${panelForModal}` : "";
    const modalId = `${MODAL_PREFIX}:${parsed.action}:${parsed.viewerId}:${parsed.targetId}:${parsed.section}${panelSuffix}`;
    const title = TITLE_BY_ACTION[parsed.action] || "Azione staff";
    let modal;
    if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm" || parsed.action === "warn_rm") {
      modal = buildIdReasonModal(modalId, title);
    } else if (parsed.action === "ppm_add") {
      modal = buildPpmAddModal(modalId, title);
    } else if (parsed.action === "ppm_remove") {
      modal = buildPpmRemoveModal(modalId, title);
    } else {
      modal = buildReasonModal(modalId, title);
    }
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseStaffHpModal(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può inviare questo modulo.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (!(await ensureNoUnauthorizedSelfStaffHp(interaction, parsed))) return true;
    const selfHp = String(parsed.viewerId) === String(parsed.targetId);
    const isPpmModal = parsed.action === "ppm_add" || parsed.action === "ppm_remove";
    if (isPpmModal) {
      if (!selfHp && !(await ensurePartnerPointsViewer(interaction))) return true;
    } else if (parsed.action === "depex_full") {
      if (!(await ensureCoordinatorPlusViewer(interaction))) return true;
    } else if (!selfHp && !(await ensureHighStaffViewer(interaction))) {
      return true;
    }
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Solo nel server.",
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }
    const reason = getModalTextInputTrimmed(interaction, IN_REASON, 500);
    const sendModalReply = async (payload) => {
      const base = { ...(payload || {}) };
      if (base.flags == null) base.flags = PRIVATE_FLAG;
      if (interaction.deferred || interaction.replied) {
        const editPayload = { ...base };
        delete editPayload.flags;
        await interaction.editReply(editPayload).catch(async () => {
          await interaction.followUp(base).catch(() => {});
        });
        return;
      }
      await interaction.reply(base).catch(() => {});
    };
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});
    }
    const targetUser = await interaction.client.users.fetch(parsed.targetId).catch(() => null);
    if (!targetUser) {
      await sendModalReply({ content: "<:vegax:1443934876440068179> Utente non trovato." });
      return true;
    }
    let res;
    if (parsed.action === "ppm_add") {
      const rawAmt = getModalTextInputTrimmed(interaction, IN_PPM_AMOUNT);
      const amount = parseInt(rawAmt, 10);
      if (!Number.isInteger(amount) || amount < 1) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Quantità non valida." });
        return true;
      }
      if (amount > MAX_PPM_AMOUNT) {
        await sendModalReply({
          content: `<:vegax:1443934876440068179> Massimo \`${MAX_PPM_AMOUNT}\` punti per operazione.`,
        });
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await sendModalReply({
          content:
            "<:vegax:1443934876440068179> I punti partner si gestiscono solo per utenti con il ruolo **Partner Manager**.",
        });
        return true;
      }
      const staffData = await addPartnerPoints(guild.id, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("add", amount);
      await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
      await sendModalReply({
        content: `<:vegacheckmark:1443666279058772028> **${changeLabel}** a ${targetUser}. Totale: \`${staffData?.staff?.partnerCount ?? 0}\`.`,
      });
      return true;
    }
    if (parsed.action === "ppm_remove") {
      const amount = 1;
      const motivo = reason;
      const messageLink = getModalTextInputTrimmed(interaction, IN_PPM_LINK);
      if (!motivo) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      if (!messageLink) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Link messaggio obbligatorio." });
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await sendModalReply({
          content:
            "<:vegax:1443934876440068179> I punti partner si gestiscono solo per utenti con il ruolo **Partner Manager**.",
        });
        return true;
      }
      const staffData = await removePartnerPoints(guild.id, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("remove", amount);
      const removedPointsChannel = guild.channels.cache.get(IDs.channels?.puntiTolti);
      if (removedPointsChannel) {
        await removedPointsChannel
          .send({
            content: `
<:VC_PartnerManager:1494286911286808576> ${targetUser}
<:VC_reason:1478517122929004544> ${motivo}
<:VC_Link:1482460590894088222> ${messageLink}`,
          })
          .catch(() => null);
      }
      await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
      await sendModalReply({
        content: `<:vegacheckmark:1443666279058772028> **${changeLabel}** a ${targetUser}. Totale: \`${staffData?.staff?.partnerCount ?? 0}\`.`,
      });
      return true;
    }
    if (parsed.action === "pex" || parsed.action.startsWith("pex_")) {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      if (parsed.action === "pex_pm") {
        res = await runProspectStaffPexToPartnerManager(guild, interaction.client, targetUser, interaction.user, reason);
      } else {
        const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
        if (targetMember && memberHasStaffRole(targetMember)) {
          res = await runProfileStaffPex(guild, interaction.client, targetUser, interaction.user, reason);
        } else {
          const roleByAction = {
            pex_helper: IDs.roles.Helper,
            pex_mod: IDs.roles.Mod,
            pex_coord: IDs.roles.Coordinator,
            pex_supervisor: IDs.roles.Supervisor,
            pex_admin: IDs.roles.Admin,
            pex_cofounder: IDs.roles.CoFounder,
            pex_founder: IDs.roles.Founder,
          };
          const selectedRoleId = roleByAction[parsed.action] || IDs.roles.Helper;
          res = await runProspectStaffPex(guild, interaction.client, targetUser, interaction.user, reason, selectedRoleId);
        }
      }
    } else if (parsed.action === "depex") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "auto");
    } else if (parsed.action === "depex_full") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffCompleteDepex(guild, interaction.client, targetUser, interaction.member, reason);
    } else if (parsed.action === "depex_staff") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "ladder");
    } else if (parsed.action === "depex_pm_only") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason, "partner_manager");
    } else if (parsed.action === "valpos") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await valutazioneCmd.runValutazionePositiveAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "valneg") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await valutazioneCmd.runValutazioneNegativeAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "warn") {
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      res = await runProfileStaffWarnAdd(guild, interaction.client, targetUser, interaction.user, reason);
    } else if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm" || parsed.action === "warn_rm") {
      const rawId = getModalTextInputTrimmed(interaction, IN_IDX, 4);
      const removeId = parseInt(rawId, 10);
      if (!reason) {
        await sendModalReply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio." });
        return true;
      }
      if (parsed.action === "valpos_rm") {
        res = await valutazioneCmd.runValutazionePositiveRemoveForPanel(
          guild,
          interaction.member,
          targetUser,
          removeId,
          reason,
        );
      } else if (parsed.action === "valneg_rm") {
        res = await valutazioneCmd.runValutazioneNegativeRemoveForPanel(
          guild,
          interaction.member,
          targetUser,
          removeId,
          reason,
        );
      } else {
        res = await runProfileStaffWarnRemove(
          guild,
          interaction.client,
          targetUser,
          interaction.user,
          removeId,
          reason,
        );
      }
    } else {
      await sendModalReply({ content: "<:vegax:1443934876440068179> Azione non riconosciuta." });
      return true;
    }
    if (!res || !res.ok) {
      await sendModalReply({
        content: res?.message || "<:vegax:1443934876440068179> Operazione non riuscita.",
      });
      return true;
    }
    await tryRefreshStaffPanelMessage(interaction, parsed, interaction.client);
    await sendModalReply({
      content: "<:vegacheckmark:1443666279058772028> Azione registrata.",
    });
    return true;
  }

  return false;
}

module.exports = { name: "staffProfileHighStaff", order: 11, match, execute };