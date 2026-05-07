const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, OverwriteType } = require("discord.js");
const mongoose = require("mongoose");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");
const IDs = require("../Config/ids");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;

function hasStaffTicketRole(member) {
  if (!member?.roles?.cache) return false;
  return [STAFF_ROLE_ID, HIGHSTAFF_ROLE_ID, PARTNERMANAGER_ROLE_ID].some(
    (id) => id && member.roles.cache.has(id),
  );
}

function canSeeTransferPanel(member, ticketDoc) {
  const claimer = String(ticketDoc?.claimedBy || "").trim();
  if (!claimer) return false;
  if (String(member?.id || "") === claimer) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function canSeeCloseRequestPanel(member, ticketDoc) {
  if (!ticketDoc) return false;
  const claimer = String(ticketDoc.claimedBy || "").trim();
  if (claimer && String(member?.id || "") === claimer) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function getBotAvatarUrl(channelOrGuild) {
  const client = channelOrGuild?.client || channelOrGuild?.guild?.client;
  return userAvatarUrlDynamic(client?.user) || null;
}

function buildRemoveMemberOptions(channel) {
  const ids = [];
  for (const ow of channel.permissionOverwrites.cache.values()) {
    if (ow.type === OverwriteType.Member) ids.push(ow.id);
  }
  const guild = channel.guild;
  const options = [];
  for (const id of ids) {
    if (options.length >= 25) break;
    const mem = guild.members.cache.get(id);
    if (!mem || mem.user?.bot) continue;
    options.push({
      label: String(mem.displayName || mem.user?.username || id).slice(0, 100),
      value: id,
      description: String(mem.user?.username || "").slice(0, 100),
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "it"));
}

function buildTicketStaffPanelPayload(member, channel, ticketDoc) {
  const isHighStaff = Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
  const staffTicket = hasStaffTicketRole(member);
  const remOptsLen = staffTicket ? buildRemoveMemberOptions(channel).length : 0;
  const claimedTrim = String(ticketDoc?.claimedBy || "").trim();
  const showTransfer = Boolean(claimedTrim && canSeeTransferPanel(member, ticketDoc));
  const showCloseReq = canSeeCloseRequestPanel(member, ticketDoc);

  const buttons = [];
  if (staffTicket) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_add")
        .setLabel("Aggiungi")
        .setStyle(ButtonStyle.Success)
        .setEmoji("<:VC_addperson:1485419347068588073>"),
    );
  }
  if (staffTicket && remOptsLen > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_remove")
        .setLabel("Rimuovi")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:VC_addperson:1485419347068588073>"),
    );
  }
  if (isHighStaff) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_switch")
        .setLabel("Cambia Categoria")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_id:1478517313618575419>"),
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_rename")
        .setLabel("Rinomina")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Modifica:1478859646587633717>"),
    );
  }
  if (showCloseReq) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_closerequest")
        .setLabel("Richiedi Chiusura")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_close:1478517239136256020>"),
    );
  }
  if (showTransfer) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_transfer")
        .setLabel("Trasferisci")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_claim:1478517202016669887>"),
    );
  }

  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  const desc = [
    "Questo è il pannello per gestire al completo il tuo ticket.",
    "",
  ];
  if (staffTicket) {
    desc.push(
      "**Aggiungi** — Aggiungi un utente al ticket.",
      "**Rimuovi** — Rimuovi un utente dal ticket."
    );
  }
  if (isHighStaff) {
    desc.push(
      "**Cambia Categoria** - Cambia la categoria del ticket.",
      "**Rinomina** - Rinomina il ticket.");
  }
  if (showCloseReq) {
    desc.push(
      "**Richiedi Chiusura** - Richiedi la chiusura del ticket."
    );
  }
  if (showTransfer) {
    desc.push(
      "**Trasferisci** - Trasferisci il claim del ticket a un altro staffer."
    );
  }
  if (desc.length <= 2) {
    desc.push("Qui non compaiono azioni per i tuoi permessi: usa i bottoni sopra se applicabili.",
      "Se hai bisogno di aiuto, contatta uno staffer.");
  }

  const thumbnailUrl = getBotAvatarUrl(channel);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> TICKET PANEL")
    .setDescription(desc.join("\n"))
    .setThumbnail(thumbnailUrl || undefined);

  return { embed, components };
}

const REOPEN_LIST_LINES = 22;
const REOPEN_SELECT_MAX = 25;
const TICKET_PANEL_REOPEN_CLOSE_ID = "ticket_panel_reopen_close";
const LTR_EMBEDDING = "\u202A";
const POP_DIRECTIONAL_FORMATTING = "\u202C";
const LTR_MARK = "\u200E";

function formatTicketClosedWhen(t) {
  const raw = t?.closedAt || t?.updatedAt;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function classifyReopenSearchQuery(qRaw) {
  const s = String(qRaw || "").trim();
  if (!s) return { kind: "none" };
  const mention = s.match(/^<@!?(\d{17,20})>$/);
  if (mention) return { kind: "userid", id: mention[1] };
  if (/^\d{17,20}$/.test(s)) return { kind: "userid", id: s };
  if (/^#?\d+$/.test(s)) return { kind: "ticketnum", n: Number(s.replace(/^#/, "")) };
  return { kind: "text", text: s.toLowerCase() };
}

async function filterClosedTicketsBySearchQuery(guild, docs, qRaw) {
  if (!Array.isArray(docs) || !docs.length) return docs;
  const c = classifyReopenSearchQuery(qRaw);
  if (c.kind === "none") return docs;
  if (c.kind === "userid") return docs.filter((d) => String(d.userId || "") === c.id);
  if (c.kind === "ticketnum") return docs.filter((d) => Number(d.ticketNumber) === c.n);
  const qLower = c.text;
  const out = [];
  const CHUNK = 16;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    const hits = await Promise.all(
      slice.map(async (d) => {
        const m = await getGuildMemberCached(guild, d.userId, { ttlMs: 45_000 }).catch(() => null);
        const name = (m?.displayName || m?.user?.username || "").toLowerCase();
        if (name.includes(qLower)) return d;
        if (String(d.userId || "").includes(qLower)) return d;
        return null;
      }),
    );
    for (const h of hits) if (h) out.push(h);
  }
  return out;
}

async function fetchClosedTicketsOrdered(guildId) {
  const gid = String(guildId || "");
  if (!gid) return [];
  const bucketRowsViaModel = await Ticket.find(
    { guildId: gid, open: false },
    { _id: 1, ticketNumber: 1, userId: 1, closedAt: 1, updatedAt: 1, ticketType: 1 },
  )
    .lean()
    .catch(() => []);
  const bucketDocs = await GuildFeatureBucket.find(
    { guildId: gid },
    { tickets: 1 },
  )
    .lean()
    .catch(() => []);
  const bucketRowsDirect = [];
  for (const b of Array.isArray(bucketDocs) ? bucketDocs : []) {
    for (const t of Array.isArray(b?.tickets) ? b.tickets : []) {
      if (Boolean(t?.open) !== false) continue;
      if (String(t?.guildId || gid) !== gid) continue;
      bucketRowsDirect.push({
        _id: t?._id,
        ticketNumber: t?.ticketNumber,
        userId: t?.userId,
        closedAt: t?.closedAt || null,
        updatedAt: t?.updatedAt || null,
        ticketType: t?.ticketType,
      });
    }
  }
  const db = mongoose?.connection?.db || null;
  let legacyRowsFlat = [];
  let legacyRowsNested = [];
  if (db?.collection) {
    legacyRowsFlat = await db
      .collection("tickets")
      .find(
        { guildId: gid, open: false },
        { projection: { _id: 1, ticketNumber: 1, userId: 1, closedAt: 1, updatedAt: 1, ticketType: 1 } },
      )
      .toArray()
      .catch(() => []);
    legacyRowsNested = await db
      .collection("tickets")
      .aggregate([
        { $match: { guildId: gid, tickets: { $type: "array" } } },
        { $unwind: "$tickets" },
        { $match: { "tickets.open": false } },
        {
          $project: {
            _id: "$tickets._id",
            ticketNumber: "$tickets.ticketNumber",
            userId: "$tickets.userId",
            closedAt: "$tickets.closedAt",
            updatedAt: "$tickets.updatedAt",
            ticketType: "$tickets.ticketType",
          },
        },
      ])
      .toArray()
      .catch(() => []);
  }
  const merged = [
    ...(Array.isArray(bucketRowsViaModel) ? bucketRowsViaModel : []),
    ...(Array.isArray(bucketRowsDirect) ? bucketRowsDirect : []),
    ...(Array.isArray(legacyRowsFlat) ? legacyRowsFlat : []),
    ...(Array.isArray(legacyRowsNested) ? legacyRowsNested : []),
  ];
  if (!merged.length) return [];
  const keyOf = (row, idx) => {
    const n = Number(row?.ticketNumber);
    if (Number.isInteger(n) && n > 0) return `n:${n}`;
    const oid = row?._id != null ? String(row._id) : "";
    if (oid) return `id:${oid}`;
    const uid = String(row?.userId || "");
    const c = row?.closedAt ? new Date(row.closedAt).getTime() : 0;
    const u = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    const tt = String(row?.ticketType || "");
    return `f:${uid}:${tt}:${c}:${u}:${idx}`;
  };
  const ts = (row) => {
    const c = row?.closedAt ? new Date(row.closedAt).getTime() : 0;
    const u = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    return Math.max(c, u, 0);
  };
  const bestByKey = new Map();
  for (let i = 0; i < merged.length; i += 1) {
    const row = merged[i];
    const k = keyOf(row, i);
    const prev = bestByKey.get(k);
    if (!prev || ts(row) > ts(prev)) bestByKey.set(k, row);
  }
  return Array.from(bestByKey.values()).sort((a, b) => {
    const numDiff = Number(b?.ticketNumber || 0) - Number(a?.ticketNumber || 0);
    if (numDiff !== 0) return numDiff;
    return ts(b) - ts(a);
  });
}

async function buildTicketReopenOutsidePanelPayload(guild, closedTicketDocs, options = {}) {
  if (!guild?.id) return null;
  const page = Math.max(0, Number(options.page) || 0);
  const filterQuery = options.filterQuery != null ? String(options.filterQuery).trim() : "";
  let docs = Array.isArray(closedTicketDocs) ? [...closedTicketDocs] : [];
  if (filterQuery) {
    docs = await filterClosedTicketsBySearchQuery(guild, docs, filterQuery);
  }
  const thumbnailUrl = getBotAvatarUrl(guild);
  if (!docs.length) {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        filterQuery
          ? `<:VC_Attention:1482534443632558151> Nessun ticket chiuso corrisponde a **${filterQuery.slice(0, 80)}**.\n\nUsa **Cerca** con numero (\`#42\`), menzione utente o parte del nome.`
          : "<:VC_Attention:1482534443632558151> Non risultano ticket chiusi per questo server.",
      )
      .setThumbnail(thumbnailUrl || undefined);
    const nav = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_panel_reopen_prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("ticket_panel_reopen_search").setLabel("Cerca").setStyle(ButtonStyle.Primary).setEmoji("🔎"),
      new ButtonBuilder().setCustomId("ticket_panel_reopen_next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(TICKET_PANEL_REOPEN_CLOSE_ID).setLabel("Chiudi").setStyle(ButtonStyle.Danger).setEmoji("✖"),
    );
    return { embed, components: [nav], meta: { page: 0 } };
  }
  const maxPage = Math.max(0, Math.ceil(docs.length / REOPEN_LIST_LINES) - 1);
  const safePage = Math.min(page, maxPage);
  const start = safePage * REOPEN_LIST_LINES;
  const sliceDocs = docs.slice(start, start + REOPEN_LIST_LINES);
  const lines = sliceDocs.map((t) => {
    const n = Number(t.ticketNumber);
    const uid = String(t.userId || "");
    const ty = String(t.ticketType || "?").slice(0, 14);
    const when = formatTicketClosedWhen(t);
    const numOk = Number.isInteger(n) && n > 0;
    const sep = `${LTR_MARK} · ${LTR_MARK}`;
    const mention = uid ? `${LTR_MARK}<@${uid}>${LTR_MARK}` : "sconosciuto";
    return `${LTR_EMBEDDING}${LTR_MARK}• ${LTR_MARK}${numOk ? `**#${n}**` : "**#?**"}${sep}${mention}${sep}\`${ty}\`${sep}${when}${LTR_MARK}${POP_DIRECTIONAL_FORMATTING}`;
  });
  const listBody = lines.join("\n").slice(0, 3900);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        "**<:VC_Ticket:1482535175283019888> Lista Ticket Chiusi**",
        "",
        listBody || "<:VC_Dot:1482532364222595303>",
        "",
        "",
        "Scegli un ticket dal **menu** oppure usa **Cerca** per numero/nome.",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({
      text: `Totale: ${docs.length} · Pagina ${safePage + 1}/${maxPage + 1}`,
    })
    .setThumbnail(thumbnailUrl || undefined);
  const optionsSelect = [];
  for (const t of sliceDocs) {
    if (optionsSelect.length >= REOPEN_SELECT_MAX) break;
    const num = Number(t.ticketNumber);
    if (!Number.isInteger(num) || num <= 0) continue;
    const mem = await getGuildMemberCached(guild, t.userId, { ttlMs: 45_000 }).catch(() => null);
    if (!mem) continue;
    const who = String(mem.displayName || mem.user?.username || mem.id).slice(0, 60);
    optionsSelect.push({
      label: `#${num} — ${who}`.slice(0, 100),
      value: String(num),
      description: `Riapri · ${String(mem.user?.username || mem.id).slice(0, 90)}`,
    });
  }
  const rows = [];
  if (optionsSelect.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_panel_reopen_pick")
          .setPlaceholder("🔄 Seleziona un ticket da riaprire…")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(optionsSelect),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_panel_reopen_prev")
        .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId("ticket_panel_reopen_search")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_page2:1482459724657201387>"),
      new ButtonBuilder()
        .setCustomId("ticket_panel_reopen_next")
        .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= maxPage),
      new ButtonBuilder()
        .setCustomId(TICKET_PANEL_REOPEN_CLOSE_ID)
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✖"),
    ),
  );
  return { embed, components: rows, meta: { page: safePage, maxPage } };
}

module.exports = {
  buildTicketStaffPanelPayload,
  buildTicketReopenOutsidePanelPayload,
  fetchClosedTicketsOrdered,
  hasStaffTicketRole,
  canSeeTransferPanel,
  canSeeCloseRequestPanel,
  buildRemoveMemberOptions,
};
