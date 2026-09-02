const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const CHANNEL_WARM_TTL_MS = 5 * 60_000;
const guildChannelWarmCache = new Map();
const HANDLED_TICKET_BUTTONS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_perks",
  "ticket_supporto",
  "claim_ticket",
  "close_ticket",
  "close_ticket_confirm",
  "close_ticket_cancel",
  "close_ticket_motivo",
  "accetta",
  "rifiuta",
  "ticket_autoclose_accept",
  "ticket_autoclose_reject",
  "unclaim",
  "ticket_panel_nav_add",
  "ticket_panel_nav_remove",
  "ticket_panel_nav_switch",
  "ticket_panel_nav_rename",
  "ticket_panel_nav_closerequest",
  "ticket_panel_nav_transfer",
  "ticket_panel_reopen_search",
  "ticket_panel_reopen_prev",
  "ticket_panel_reopen_next",
  "ticket_panel_reopen_close",
]);
const TICKET_PANEL_ADD_MEMBER_PREFIX = "ticket_panel_add_member";
const TICKET_PANEL_TRANSFER_USER_PREFIX = "ticket_panel_transfer_user";
const TICKET_PANEL_REMOVE_MEMBER_PREFIX = "ticket_panel_remove_member";
const TICKET_PANEL_SWITCH_CATEGORY_PREFIX = "ticket_panel_switch_category";

function isTicketPanelUserSelectCustomId(id) {
  const s = String(id || "");
  return (
    s === TICKET_PANEL_ADD_MEMBER_PREFIX ||
    s.startsWith(`${TICKET_PANEL_ADD_MEMBER_PREFIX}:`) ||
    s === TICKET_PANEL_TRANSFER_USER_PREFIX ||
    s.startsWith(`${TICKET_PANEL_TRANSFER_USER_PREFIX}:`)
  );
}

function isTicketPanelStringSelectCustomId(id) {
  const s = String(id || "");
  return (
    s === TICKET_PANEL_REMOVE_MEMBER_PREFIX ||
    s.startsWith(`${TICKET_PANEL_REMOVE_MEMBER_PREFIX}:`) ||
    s === TICKET_PANEL_SWITCH_CATEGORY_PREFIX ||
    s.startsWith(`${TICKET_PANEL_SWITCH_CATEGORY_PREFIX}:`) ||
    s === "ticket_panel_reopen_pick"
  );
}

function isTicketOpenMenuCustomId(id) {
  return String(id || "") === "ticket_open_menu";
}

function getCachedEntity(cache, key) {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  return null;
}

function setCachedEntity(cache, key, value, ttlMs, promise = null) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (ttlMs || 15_000),
    promise,
  });
}

async function warmGuildChannels(guild) {
  const key = String(guild?.id || "");
  if (!guild || !key) return null;
  const cached = getCachedEntity(guildChannelWarmCache, key);
  if (cached) return cached;
  const promise = guild.channels.fetch().catch(() => null);
  guildChannelWarmCache.set(key, { value: null, expiresAt: 0, promise });
  const resolved = await promise;
  setCachedEntity(guildChannelWarmCache, key, resolved, CHANNEL_WARM_TTL_MS);
  return resolved;
}

async function countOpenTicketsByUser(guildId, userId, guild = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!uid) return { count: 0, tickets: [] };

  const seen = new Set();
  const list = [];
  const pushDoc = (doc) => {
    const id = String(doc?._id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push(doc);
  };

  const byGuild = await Ticket.find({ guildId: gid, userId: uid, open: true })
    .limit(30)
    .catch(() => []);
  for (const doc of Array.isArray(byGuild) ? byGuild : []) pushDoc(doc);

    const openByUser = await Ticket.find({ userId: uid, open: true }).limit(30).catch(() => []);
  for (const doc of Array.isArray(openByUser) ? openByUser : []) {
    const docGid = String(doc?.guildId || "").trim();
    if (docGid && docGid === gid) {
      pushDoc(doc);
      continue;
    }
    if (!guild || docGid) continue;
    const cid = String(doc?.channelId || "").trim();
    if (!cid) continue;
    const inGuild =
      guild.channels?.cache?.get?.(cid) ||
      (await guild.channels.fetch(cid).catch(() => null));
    if (inGuild?.id) {
      pushDoc(doc);
      await Ticket.updateOne(
        { _id: doc._id, open: true },
        { $set: { guildId: gid } },
      ).catch(() => null);
    }
  }

  if (!list.length) return { count: 0, tickets: [] };
  if (!guild) return { count: list.length, tickets: list };

  await warmGuildChannels(guild).catch(() => null);
  const valid = [];
  for (const doc of list) {
    const cid = String(doc?.channelId || "").trim();
    if (!cid) continue;
    const cached = guild.channels?.cache?.get?.(cid) || null;
    if (cached) {
      valid.push(doc);
      continue;
    }
    const fetched = await guild.channels.fetch(cid).catch((err) => err);
    if (fetched && typeof fetched.id === "string") {
      valid.push(doc);
      continue;
    }
    const code = Number(fetched?.code ?? fetched?.rawError?.code);
    if (code === 10003) {
      await Ticket.updateOne(
        { _id: doc._id, open: true },
        {
          $set: {
            open: false,
            closedAt: new Date(),
            closeReason: "Auto-closed stale open ticket (missing channel)",
          },
        },
      ).catch(() => null);
    }
  }
  return { count: valid.length, tickets: valid };
}

async function findOpenTicketByUser(guildId, userId, guild = null) {
  const counted = await countOpenTicketsByUser(guildId, userId, guild);
  return counted.tickets[0] || null;
}

async function findTicketByChannel(channelId) {
  const cid = String(channelId || "").trim();
  if (!cid) return null;
  const open = await Ticket.findOne({ channelId: cid, open: true }).catch(() => null);
  if (open) return open;
  return Ticket.findOne({ channelId: cid }).catch(() => null);
}

function isTicketOwnedByUser(ticketDoc, userId) {
  return String(ticketDoc?.userId || "") === String(userId || "");
}

function isTicketClaimedByUser(ticketDoc, userId) {
  return String(ticketDoc?.claimedBy || "") === String(userId || "");
}

function hasActiveTicketClaimer(ticketDoc) {
  return String(ticketDoc?.claimedBy || "").trim() !== "";
}

function canUserHandleCloseRequest(ticketDoc, userId, highStaff) {
  return (
    isTicketOwnedByUser(ticketDoc, userId) ||
    isTicketClaimedByUser(ticketDoc, userId) ||
    highStaff
  );
}

async function loadTicketForChannelOrReply({
  interaction,
  safeReply,
  makeErrorEmbed,
  channelId,
  missingDescription = "<:vegax:1443934876440068179> Ticket non trovato",
}) {
  const ticketDoc = await findTicketByChannel(channelId);
  if (ticketDoc) return ticketDoc;
  const errEmbed =
    typeof makeErrorEmbed === "function"
      ? makeErrorEmbed
      : require("./ticketUxMessages").makeTicketErrorEmbed;
  await safeReply(interaction, {
    embeds: [errEmbed("Errore", missingDescription)],
    flags: 1 << 6,
  });
  return null;
}

async function ensureClosableTicketOrReply({
  interaction,
  safeReply,
  makeErrorEmbed,
  ticketDoc,
  highStaff,
  requireClaimed = true,
  allowUserClose = false,
}) {
  const errEmbed =
    typeof makeErrorEmbed === "function"
      ? makeErrorEmbed
      : require("./ticketUxMessages").makeTicketErrorEmbed;
  if (!ticketDoc) return false;
  const isOwner = isTicketOwnedByUser(ticketDoc, interaction.user.id);
  if (isOwner && !highStaff && !allowUserClose) {
    await safeReply(interaction, {
      embeds: [
        errEmbed(
          "Errore",
          "<:VC_close:1478517239136256020> Non puoi chiudere da solo il ticket che hai aperto.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  if (isOwner && allowUserClose && !highStaff) {
    return true;
  }
  if (requireClaimed && !hasActiveTicketClaimer(ticketDoc) && !highStaff) {
    await safeReply(interaction, {
      embeds: [
        errEmbed(
          "Errore",
          "<:VC_claim:1478517202016669887> Questo ticket non è claimato.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  if (
    requireClaimed &&
    !isTicketClaimedByUser(ticketDoc, interaction.user.id) &&
    !highStaff
  ) {
    await safeReply(interaction, {
      embeds: [
        errEmbed(
          "Errore",
          "<:VC_claim:1478517202016669887> Solo chi ha claimato il ticket può chiuderlo.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  return true;
}

function isTicketRatingButton(customId) {
  return String(customId || "").startsWith("ticket_rate:");
}

function isTicketTranscriptButton(customId) {
  return String(customId || "").startsWith("ticket_transcript:");
}

function isHandledTicketModalId(id) {
  const s = String(id || "");
  return (
    s === "modal_close_ticket" ||
    s.startsWith("modal_close_ticket:") ||
    s === "modal_ticket_panel_rename" ||
    s === "modal_ticket_panel_closerequest" ||
    s === "modal_ticket_panel_reopen_search" ||
    s.startsWith("tkform:")
  );
}

function getSelectedTicketAction(interaction) {
  if (!interaction.isStringSelectMenu || !interaction.isStringSelectMenu()) {
    return null;
  }
  if (!isTicketOpenMenuCustomId(interaction.customId)) return null;
  return interaction.values?.[0] || null;
}

function isTicketOpenButtonCustomId(id) {
  const s = String(id || "");
  return (
    HANDLED_TICKET_BUTTONS.has(s) &&
    (s === "ticket_partnership" ||
      s === "ticket_highstaff" ||
      s === "ticket_perks" ||
      s === "ticket_supporto")
  ) || s.startsWith("tkp:");
}

function isHandledTicketInteraction(interaction) {
  const cid = String(interaction.customId || "");
  const isTicketButton =
    interaction.isButton &&
    interaction.isButton() &&
    (HANDLED_TICKET_BUTTONS.has(cid) ||
      cid.startsWith("tkp:") ||
      isTicketRatingButton(cid) ||
      isTicketTranscriptButton(cid));
  const isTicketSelect =
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    (isTicketOpenMenuCustomId(cid) || isTicketPanelStringSelectCustomId(cid));
  const isTicketUserSelect =
    interaction.isUserSelectMenu && interaction.isUserSelectMenu() && isTicketPanelUserSelectCustomId(cid);
  const isTicketModal = interaction.isModalSubmit && interaction.isModalSubmit()&& isHandledTicketModalId(String(interaction.customId || ""));
  return { isTicketButton, isTicketSelect, isTicketModal, isTicketUserSelect };
}

module.exports = {
  canUserHandleCloseRequest,
  countOpenTicketsByUser,
  ensureClosableTicketOrReply,
  findOpenTicketByUser,
  findTicketByChannel,
  getClientGuildCached,
  getGuildChannelCached,
  getGuildMemberCached,
  getSelectedTicketAction,
  hasActiveTicketClaimer,
  isHandledTicketInteraction,
  isTicketOpenButtonCustomId,
  isTicketClaimedByUser,
  isTicketOwnedByUser,
  isTicketRatingButton,
  isTicketTranscriptButton,
  loadTicketForChannelOrReply,
  warmGuildChannels,
  parseTicketPanelMessageIdFromCustomId: (customId, basePrefix) => {
    const s = String(customId || "");
    const p = String(basePrefix || "");
    if (!p) return null;
    if (s === p) return null;
    if (!s.startsWith(`${p}:`)) return null;
    const id = s.slice(p.length + 1);
    return /^\d{17,20}$/.test(id) ? id : null;
  },
  withTicketPanelMessageCustomId: (baseCustomId, panelMessageId) => {
    const base = String(baseCustomId || "");
    const pid = String(panelMessageId || "").trim();
    if (!base || !/^\d{17,20}$/.test(pid)) return base;
    const out = `${base}:${pid}`;
    return out.length <= 100 ? out : base;
  },
  TICKET_PANEL_ADD_MEMBER_PREFIX,
  TICKET_PANEL_REMOVE_MEMBER_PREFIX,
  TICKET_PANEL_SWITCH_CATEGORY_PREFIX,
  TICKET_PANEL_TRANSFER_USER_PREFIX,
};