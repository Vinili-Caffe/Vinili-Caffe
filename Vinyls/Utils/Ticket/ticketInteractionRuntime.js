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

async function findOpenTicketByUser(guildId, userId, guild = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!uid) return null;

  let existing = await Ticket.findOne({ guildId: gid, userId: uid, open: true }).catch(
    () => null,
  );
  if (!existing) {
    // Legacy/fault-tolerant fallback: block duplicates even if an old ticket has missing guildId.
    const openByUser = await Ticket.find({ userId: uid, open: true })
      .limit(25)
      .lean()
      .catch(() => []);
    if (Array.isArray(openByUser) && openByUser.length > 0) {
      const exactGuild = openByUser.find(
        (doc) => String(doc?.guildId || "") === gid,
      );
      if (exactGuild) {
        existing = exactGuild;
      } else if (guild) {
        await warmGuildChannels(guild).catch(() => null);
        for (const doc of openByUser) {
          const cid = String(doc?.channelId || "");
          if (!cid) continue;
          const cached = guild.channels?.cache?.get?.(cid) || null;
          if (cached) {
            existing = doc;
            break;
          }
          const fetched = await guild.channels.fetch(cid).catch(() => null);
          if (fetched?.id) {
            existing = doc;
            break;
          }
        }
      } else {
        existing = openByUser[0];
      }
    }
  }
  if (!existing) return null;
  if (!guild || !existing.channelId) return existing;

  await warmGuildChannels(guild).catch(() => null);
  const cid = String(existing.channelId);
  const cached = guild.channels?.cache?.get?.(cid) || null;
  if (cached) {
    if (String(existing.guildId || "") !== gid) {
      await Ticket.updateOne(
        { _id: existing._id, open: true },
        { $set: { guildId: gid } },
      ).catch(() => null);
    }
    return existing;
  }

  const fetched = await guild.channels.fetch(cid).catch((err) => err);
  if (fetched && typeof fetched.id === "string") {
    if (String(existing.guildId || "") !== gid) {
      await Ticket.updateOne(
        { _id: existing._id, open: true },
        { $set: { guildId: gid } },
      ).catch(() => null);
    }
    return existing;
  }

  const code = Number(fetched?.code ?? fetched?.rawError?.code);
  if (code === 10003) {
    await Ticket.updateOne(
      { _id: existing._id, open: true },
      {
        $set: {
          open: false,
          closedAt: new Date(),
          closeReason: "Auto-closed stale open ticket (missing channel)",
        },
      },
    ).catch(() => null);
    return null;
  }
  return existing;
}

async function findTicketByChannel(channelId) {
  return Ticket.findOne({ channelId }).catch(() => null);
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

async function loadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId, missingDescription = "<a:VC_Alert:1482706673176150077> Ticket non trovato" }) {
  const ticketDoc = await findTicketByChannel(channelId);
  if (ticketDoc) return ticketDoc;
  await safeReply(interaction, {
    embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", missingDescription)],
    flags: 1 << 6,
  });
  return null;
}

async function ensureClosableTicketOrReply({ interaction, safeReply, makeErrorEmbed, ticketDoc, highStaff, requireClaimed = true }) {
  if (!ticketDoc) return false;
  if (isTicketOwnedByUser(ticketDoc, interaction.user.id) && !highStaff) {
    await safeReply(interaction, {
      embeds: [
        makeErrorEmbed(
          "<a:VC_Alert:1482706673176150077> Errore",
          "<:VC_close:1478517239136256020> Non puoi chiudere da solo il ticket che hai aperto.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  if (requireClaimed && !hasActiveTicketClaimer(ticketDoc)) {
    await safeReply(interaction, {
      embeds: [
        makeErrorEmbed(
          "<a:VC_Alert:1482706673176150077> Errore",
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
        makeErrorEmbed(
          "<a:VC_Alert:1482706673176150077> Errore",
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
    s === "modal_ticket_panel_reopen_search"
  );
}

function getSelectedTicketAction(interaction) {
  if (!interaction.isStringSelectMenu || !interaction.isStringSelectMenu()) {
    return null;
  }
  if (!isTicketOpenMenuCustomId(interaction.customId)) return null;
  return interaction.values?.[0] || null;
}

function isHandledTicketInteraction(interaction) {
  const cid = String(interaction.customId || "");
  const isTicketButton =
    interaction.isButton &&
    interaction.isButton() &&
    (HANDLED_TICKET_BUTTONS.has(cid) || isTicketRatingButton(cid) || isTicketTranscriptButton(cid));
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
  ensureClosableTicketOrReply,
  findOpenTicketByUser,
  findTicketByChannel,
  getClientGuildCached,
  getGuildChannelCached,
  getGuildMemberCached,
  getSelectedTicketAction,
  hasActiveTicketClaimer,
  isHandledTicketInteraction,
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