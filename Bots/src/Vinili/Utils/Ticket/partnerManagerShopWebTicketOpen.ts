const IDs = require("../Config/ids") as typeof import("../Config/ids");
const {
  SiteWebTicket,
  SiteWebTicketMessage,
  nextWebTicketNumber,
  WEB_TICKET_STATUS,
} = require("../../Schemas/Web/siteWebTicketSchemas") as typeof import("../../Schemas/Web/siteWebTicketSchemas");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils") as typeof import("../Staff/partnerPointsDisplayUtils");
const {
  partnerManagerRedeemButtonLabel,
  getPartnerRewardPointCost,
} = require("../Staff/partnerPointsUtils") as typeof import("../Staff/partnerPointsUtils");
const { getTicketPanelConfig } = require("./ticketPanelConfig") as typeof import("./ticketPanelConfig");
const { buildTicketChannelName } = require("./ticketNamingRuntime") as typeof import("./ticketNamingRuntime");

const MAX_OPEN_PER_USER = 1;

function sitePublicOrigin() {
  try {
    const cfg: any = require("../../config.json") as typeof import("../../config.json");
    const raw =
      String(cfg?.website?.publicUrl || cfg?.site?.publicUrl || cfg?.oauth?.redirectUri || "").trim() ||
      String(cfg?.topgg?.votePageUrl || cfg?.vote?.voteUrl || "").trim();
    if (raw) {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`;
    }
  } catch (_) {}
  return "https://www.viniliecaffe.it";
}

function displayNameForMember(member?) {
  try {
    const { memberDisplayName, accountUsername } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
    return memberDisplayName(member) || accountUsername(member) || "Utente";
  } catch (_) {
    return String(member?.nickname || member?.displayName || member?.user?.username || "").trim() || "Utente";
  }
}

function avatarForMember(member?) {
  try {
    const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
    return userAvatarUrlDynamic(member, { size: 128 }) || "";
  } catch (_) {
    return "";
  }
}

function buildPmShopTicketBody({ rewardLabel, pointCost, balance, authorName }) {
  return [
    `**Riscatto premio · Shop Partner Manager**`,
    ``,
    `**Partner Manager:** ${authorName}`,
    `**Premio richiesto:** ${rewardLabel}`,
    `**Punti necessari:** ${pointCost} (saldo attuale ${balance})`,
    ``,
    `Attendi un membro dell'**High Staff** per completare la consegna del premio.`,
    `Alla chiusura, lo staff conferma se scalare i punti (come su Discord).`,
  ].join("\n");
}

async function openPartnerManagerShopWebTicketForMember(client?, guild?, member?, tier?) {
  const tierN = Math.floor(Number(tier) || 0);
  if (!client || !guild || !member?.user) {
    return { ok: false, userMessage: "Richiesta non valida." };
  }
  if (tierN !== 150 && tierN !== 200 && tierN !== 250) {
    return { ok: false, userMessage: "Premio non valido." };
  }

  const pmRole = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRole || !member.roles?.cache?.has(pmRole)) {
    return { ok: false, userMessage: "Solo i Partner Manager possono aprire questo ticket." };
  }

  const guildId = String(guild.id);
  const userId = String(member.id);
  const lean = await ActivityUserProfile.findOne({ guildId, userId })
    .select("staff")
    .lean()
    .catch(() => null);
  const balance = resolvePartnerPointsShown(lean?.staff);
  const pointCost = getPartnerRewardPointCost(tierN);
  if (balance < pointCost) {
    return {
      ok: false,
      userMessage: `Ti servono ${pointCost} punti (saldo attuale: ${balance}).`,
    };
  }

  const existingShop = await SiteWebTicket.findOne({
    guildId,
    userId,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
    partnerManagerShopRedeemTier: { $in: [150, 200, 250] },
    partnerManagerShopRedeemAckResult: null,
  })
    .select("_id ticketNumber partnerManagerShopRedeemTier")
    .lean()
    .catch(() => null);
  if (existingShop) {
    const tid = String(existingShop._id);
    const url = `${sitePublicOrigin()}/tickets/?ticketId=${encodeURIComponent(tid)}#${tid}`;
    return {
      ok: false,
      code: "already_open",
      ticketId: tid,
      ticketUrl: url,
      ticketNumber: existingShop.ticketNumber,
      userMessage: `Hai già un ticket shop premi aperto (#${existingShop.ticketNumber}).`,
    };
  }

  const openCount = await SiteWebTicket.countDocuments({
    guildId,
    userId,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  });
  if (openCount >= MAX_OPEN_PER_USER) {
    return {
      ok: false,
      userMessage: `Puoi avere al massimo ${MAX_OPEN_PER_USER} ticket aperti.`,
    };
  }

  const panelConfig = getTicketPanelConfig("highstaff");
  if (!panelConfig || panelConfig.type !== "high") {
    return { ok: false, userMessage: "Configurazione ticket High Staff non disponibile." };
  }

  const authorName = displayNameForMember(member);
  const authorAvatarUrl = avatarForMember(member);
  const rewardLabel = partnerManagerRedeemButtonLabel(tierN);
  const ticketNumber = await nextWebTicketNumber(guildId);
  const subject = buildTicketChannelName(panelConfig, authorName, userId);

  const ticket = await SiteWebTicket.create({
    guildId,
    ticketNumber,
    userId,
    authorName,
    authorAvatarUrl,
    category: "high",
    subject,
    status: WEB_TICKET_STATUS.OPEN,
    lastMessageAt: new Date(),
    lastMessagePreview: `Shop PM · ${rewardLabel}`,
    lastAuthorKind: "system",
    messageCount: 0,
    partnerManagerShopRedeemTier: tierN,
    partnerManagerShopRedeemAckResult: null,
    partnerManagerShopRedeemAckAt: null,
  });

  const body = buildPmShopTicketBody({
    rewardLabel,
    pointCost,
    balance,
    authorName,
  });

  const welcome = await SiteWebTicketMessage.create({
    guildId,
    ticketId: ticket._id,
    authorId: "system",
    authorName: "Sistema",
    authorAvatarUrl: "",
    authorKind: "system",
    content: `Ticket #${ticketNumber} aperto · High Staff · Riscatto shop Partner Manager.`,
    imageUrls: [],
  });

  const detail = await SiteWebTicketMessage.create({
    guildId,
    ticketId: ticket._id,
    authorId: userId,
    authorName,
    authorAvatarUrl,
    authorKind: "user",
    content: body,
    imageUrls: [],
  });

  ticket.messageCount = 2;
  ticket.lastMessageAt = detail.createdAt || new Date();
  ticket.lastMessagePreview = `Shop PM · ${rewardLabel}`.slice(0, 180);
  ticket.lastAuthorKind = "user";
  await ticket.save();

  const ticketId = String(ticket._id);
  const ticketUrl = `${sitePublicOrigin()}/tickets/?ticketId=${encodeURIComponent(ticketId)}#${ticketId}`;

  try {
    const {
      emitTicketEvent,
      serializeTicket,
      serializeMessage,
      ticketBroadcastPayload,
      notifyStaffNewTicket,
    } = require("../Web/siteWebTicketsApi") as typeof import("../Web/siteWebTicketsApi");
    const serialized = serializeTicket(ticket, { includeStaffFields: true });
    const broadcastTicket = ticketBroadcastPayload(serialized);
    emitTicketEvent({ type: "web_ticket_created", ticket: broadcastTicket });
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId,
      message: serializeMessage(welcome),
      ticket: broadcastTicket,
    });
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId,
      message: serializeMessage(detail),
      ticket: broadcastTicket,
    });
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
    void notifyStaffNewTicket(client, guildId, ticket);
  } catch (err) {
    global.logger?.warn?.("[partnerManagerShopWebTicketOpen] emit:", err?.message || err);
  }

  return {
    ok: true,
    ticket,
    ticketId,
    ticketUrl,
    ticketNumber,
    rewardLabel,
    pointCost,
    balance,
    userMessage: `Ticket High Staff #${ticketNumber} aperto sul sito per «${rewardLabel}».`,
  };
}

export = {
  openPartnerManagerShopWebTicketForMember,
  sitePublicOrigin,
  buildPmShopTicketBody,
};
