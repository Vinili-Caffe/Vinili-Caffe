const { TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, buildTopPageJumpModal, normalizeTopView } = require("./topChannel/components");
const { parseTopChannelCustomId, parseTopChannelPageCustomId, parseTopChannelViewSelectCustomId } = require("../Utils/Interaction/buttonParsers");
const { buildTopChannelPayload } = require("../Prefix/Stats/top");
const TOP_CHANNEL_PREFIXES = [ TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX ];

function isTopChannelInteraction(interaction) {
  if (!interaction?.guild) return false;
  const id = String(interaction.customId || "");
  if (interaction.isButton?.()) {
    return TOP_CHANNEL_PREFIXES.some((p) => id === p || id.startsWith(`${p}:`));
  }
  if (interaction.isStringSelectMenu?.()) {
    return id === TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX || id.startsWith(`${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:`);
  }
  return false;
}

function match(interaction) {
  return isTopChannelInteraction(interaction);
}

function isUnknownOrAckedInteraction(err) {
  const code = err?.code || err?.rawError?.code;
  return code === 10062 || code === 40060 || code === "InteractionAlreadyReplied";
}

async function replyDenied(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: 1 << 6 }).catch(() => {});
    return;
  }
  await interaction.reply({ content, flags: 1 << 6 }).catch(() => {});
}

async function execute(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  let ownerId = null;
  let lookbackDays = 14;
  let controlsView = "main";
  let selectedView = "overview";
  let page = 1;
  let openModal = null;

  if (interaction.isStringSelectMenu?.()) {
    const parsed = parseTopChannelViewSelectCustomId(interaction.customId);
    if (!parsed) return false;
    ownerId = parsed.ownerId;
    lookbackDays = parsed.lookbackDays;
    const rawValue = Array.isArray(interaction.values) ? interaction.values[0] : null;
    selectedView = normalizeTopView(rawValue || "overview");
    page = 1;
  } else if (interaction.isButton?.()) {
    const pageParsed = parseTopChannelPageCustomId(interaction.customId);
    if (pageParsed) {
      if (pageParsed.action === "open_modal") {
        openModal = pageParsed;
      } else {
        ownerId = pageParsed.ownerId;
        lookbackDays = pageParsed.lookbackDays;
        controlsView = pageParsed.controlsView;
        selectedView = pageParsed.selectedView;
        const totalPages = pageParsed.totalPages;
        let newPage = pageParsed.page;
        if (pageParsed.action === "first") newPage = 1;
        else if (pageParsed.action === "prev") newPage = Math.max(1, pageParsed.page - 1);
        else if (pageParsed.action === "next") newPage = Math.min(totalPages, pageParsed.page + 1);
        else if (pageParsed.action === "last") newPage = totalPages;
        page = newPage;
      }
    } else {
      const parsed = parseTopChannelCustomId(interaction.customId);
      if (!parsed) return false;
      ownerId = parsed.ownerId;
      lookbackDays = parsed.lookbackDays;
      selectedView = parsed.selectedView;
      page = parsed.page;
      if (parsed.prefix === TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
        controlsView = "period";
      } else if (parsed.prefix === TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX || parsed.prefix === TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX) {
        controlsView = "main";
      }
    }
  } else {
    return false;
  }

  const effectiveOwnerId = ownerId || openModal?.ownerId || null;
  if (effectiveOwnerId && String(effectiveOwnerId) !== String(interaction.user?.id || "")) {
    await replyDenied(interaction, "<a:VC_Cross:1482532424570376253> Questo controllo non è associato al tuo comando.");
    return true;
  }

  if (openModal) {
    const modal = buildTopPageJumpModal(
      openModal.ownerId,
      openModal.lookbackDays,
      openModal.controlsView,
      openModal.selectedView,
      openModal.page,
      openModal.totalPages,
    );
    try {
      await interaction.showModal(modal);
    } catch (err) {
      if (!isUnknownOrAckedInteraction(err)) {
        global.logger?.warn?.("[topChannelHandler] showModal", err?.message || err);
      }
    }
    return true;
  }

  // Ack subito: se defer arriva dopo ~3s Discord risponde 10062 Unknown interaction.
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch (err) {
    if (isUnknownOrAckedInteraction(err)) {
      global.logger?.warn?.("[topChannelHandler] interaction expired before ack");
      return true;
    }
    throw err;
  }

  try {
    const messageLike = { guild };
    const payload = await buildTopChannelPayload(
      messageLike,
      lookbackDays,
      controlsView,
      selectedView,
      page,
      ownerId || interaction.user?.id,
    );
    const files = Array.isArray(payload.files) ? payload.files.filter(Boolean) : [];
    // Sostituisci gli allegati (canvas): senza `attachments: []` Discord può
    // tenere i vecchi id e fallire con ATTACHMENT_NOT_FOUND sull'edit.
    await interaction.message?.edit?.({
      files,
      attachments: [],
      embeds: payload.embeds || [],
      content: payload.content ?? null,
      components: payload.components || [],
    });
    return true;
  } catch (err) {
    if (isUnknownOrAckedInteraction(err)) {
      global.logger?.warn?.("[topChannelHandler] interaction expired during update");
      return true;
    }
    global.logger?.error?.("[topChannelHandler] execute", err);
    await replyDenied(interaction, "<a:VC_Cross:1482532424570376253> Errore durante l'aggiornamento.");
    return true;
  }
}

module.exports = { name: "topChannelHandler", order: 25, match, execute, isTopChannelInteraction };
