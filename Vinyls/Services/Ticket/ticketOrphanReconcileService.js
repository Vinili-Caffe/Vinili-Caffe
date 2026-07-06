const { ChannelType, PermissionFlagsBits } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  isChannelInTicketCategory,
  isTicketChannelName,
} = require("../../Utils/Ticket/ticketCategoryUtils");
const { getTicketPanelConfig } = require("../../Utils/Ticket/ticketPanelConfig");
const {
  createTicketDocWithGlobalId,
  getNextTicketId,
} = require("../../Utils/Ticket/ticketIdUtils");
const { ensureMongoReady } = require("../../Utils/Database/mongoConnect");

const REOPEN_CLEAR_FIELDS = {
  open: true,
  closedAt: null,
  closedBy: null,
  closeReason: null,
  closeRequestedBy: null,
  closeRequestedAt: null,
  closeLogChannelId: null,
  closeLogMessageId: null,
  autoClosePromptSentAt: null,
};

function parseTicketTypeFromChannelName(name) {
  const raw = String(name || "");
  const match = raw.match(/︲([^᲼]+)᲼/i);
  const token = match ? String(match[1]).trim().toLowerCase() : "supporto";
  return getTicketPanelConfig(token)?.type || "supporto";
}

function inferTicketOwnerId(channel, botId) {
  const overwrites = channel?.permissionOverwrites?.cache;
  if (!overwrites?.size) return null;
  for (const ow of overwrites.values()) {
    if (ow.type !== 1) continue;
    const id = String(ow.id || "");
    if (!id || id === String(botId || "")) continue;
    if (ow.allow?.has?.(PermissionFlagsBits.ViewChannel)) return id;
  }
  return null;
}

function messageHasTicketControls(message) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id === "close_ticket" || id === "claim_ticket") return true;
    }
  }
  return false;
}

async function findTicketPanelMessage(channel) {
  const pinned = await channel.messages.fetchPins().catch(() => null);
  if (pinned?.size) {
    for (const msg of pinned.values()) {
      if (messageHasTicketControls(msg)) return msg;
    }
  }
  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (recent?.size) {
    for (const msg of recent.values()) {
      if (messageHasTicketControls(msg)) return msg;
    }
  }
  return null;
}

async function backfillTicketNumberIfMissing(ticketDoc) {
  if (!ticketDoc?._id || Number(ticketDoc.ticketNumber) > 0) return ticketDoc;
  try {
    const ticketNumber = await getNextTicketId();
    await Ticket.updateOne({ _id: ticketDoc._id }, { $set: { ticketNumber } });
    return { ...ticketDoc, ticketNumber };
  } catch {
    return ticketDoc;
  }
}

async function reconcileSingleTicketChannel(channel, guild, botId) {
  if (!channel || channel.type !== ChannelType.GuildText) return { status: "skip_type" };
  if (!isChannelInTicketCategory(channel) && !isTicketChannelName(channel.name)) {
    return { status: "skip_not_ticket_channel" };
  }

  const channelId = String(channel.id);
  const existing = await Ticket.findOne({ channelId }).lean().catch(() => null);
  if (existing?.open === true) {
    if (!Number(existing.ticketNumber)) {
      await backfillTicketNumberIfMissing(existing);
      return { status: "backfilled_number", channelId };
    }
    return { status: "ok", channelId };
  }

  const panelMsg = await findTicketPanelMessage(channel);
  const userId = inferTicketOwnerId(channel, botId);
  if (!userId) return { status: "skip_no_owner", channelId };

  const ticketType = parseTicketTypeFromChannelName(channel.name);

  if (existing && existing.open === false) {
    await Ticket.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...REOPEN_CLEAR_FIELDS,
          userId,
          ticketType,
          messageId: panelMsg?.id || existing.messageId || null,
          guildId: String(guild.id),
        },
      },
    ).catch(() => null);
    await backfillTicketNumberIfMissing(existing);
    global.logger?.info?.(`[TICKET RECONCILE] Riaperto ticket orfano #${channelId}`);
    return { status: "reopened", channelId };
  }

  await createTicketDocWithGlobalId(Ticket, {
    guildId: guild.id,
    userId,
    channelId,
    ticketType,
    open: true,
    messageId: panelMsg?.id || null,
    descriptionPromptMessageId: null,
    descriptionSubmitted: false,
    createdAt: channel.createdAt ? new Date(channel.createdAt) : new Date(),
  });
  global.logger?.info?.(`[TICKET RECONCILE] Registrato ticket orfano #${channelId} utente ${userId}`);
  return { status: "created", channelId };
}

async function reconcileOrphanTicketsForGuild(guild) {
  if (!guild) return { ok: false, reason: "no_guild" };
  const mongoOk = await ensureMongoReady({ maxWaitMs: 25_000 }).catch(() => false);
  if (!mongoOk) return { ok: false, reason: "mongo_not_ready" };

  await guild.channels.fetch().catch(() => null);
  const botId = guild.client?.user?.id;
  const channels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText && (isChannelInTicketCategory(ch) || isTicketChannelName(ch.name)),
  );

  const summary = { created: 0, reopened: 0, backfilled_number: 0, ok: 0, skipped: 0 };
  for (const channel of channels.values()) {
    try {
      const result = await reconcileSingleTicketChannel(channel, guild, botId);
      const status = String(result?.status || "skip");
      if (status === "created") summary.created += 1;
      else if (status === "reopened") summary.reopened += 1;
      else if (status === "backfilled_number") summary.backfilled_number += 1;
      else if (status === "ok") summary.ok += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.skipped += 1;
      global.logger?.warn?.(
        `[TICKET RECONCILE] Canale ${channel.id}:`,
        err?.message || err,
      );
    }
  }

  if (summary.created || summary.reopened || summary.backfilled_number) {
    global.logger?.info?.("[TICKET RECONCILE] Completato:", summary);
  }
  try {
    const { syncOpenPartnershipTicketReviewerAccess } = require("../../Utils/Ticket/ticketPartnershipStaffRoles");
    await syncOpenPartnershipTicketReviewerAccess(guild.client);
  } catch (err) {
    global.logger?.warn?.("[TICKET RECONCILE] Partnership reviewer sync:", err?.message || err);
  }
  return { ok: true, ...summary };
}

async function reconcileOrphanTicketsOnStartup(client) {
  const mainGuildId = String(client?.config?.mainGuildId || "").trim();
  const guild =
    (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null)))) ||
    client.guilds.cache.first() ||
    null;
  if (!guild) return { ok: false, reason: "no_guild" };
  return reconcileOrphanTicketsForGuild(guild);
}

module.exports = {
  reconcileOrphanTicketsForGuild,
  reconcileOrphanTicketsOnStartup,
  reconcileSingleTicketChannel,
};