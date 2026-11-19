/**
 * Annunci nei canali di fazione (uno per lato, stesso canale per tutte le epoche):
 * nuove reclute, reminder guerra al capo (:50, solo se la fazione non ha scelto), esito battaglie,
 * promozioni di rango, acquisti truppe e bonus grossi in banca, cambio d'epoca.
 * Invio via REST: funziona sia nel bot sia in site-api (dove avvengono smistamento, ranghi e acquisti).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { EPOCHS, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");

/** Lato "sinistro" (Repubblica → Ribellione → Nuova Repubblica) e "destro" (Separatisti → Impero → Primo Ordine). */
const CHANNEL_LEFT = "1568057402367021179";
const CHANNEL_RIGHT = "1568057142827815194";
const LEFT_IDS = ["repubblica", "ribellione", "nuova_repubblica"];
const RIGHT_IDS = ["separatisti", "impero", "nuovo_ordine"];
const COLOR_LEFT = 0x3b82f6;
const COLOR_RIGHT = 0xa855f7;
const SITE_FACTION_URL = "https://www.viniliecaffe.it/evento/fazione";
const OWNER = "__starwars_faction_announce__";

/* reminder: dalle :50, solo tra le 9 e le 24 (ora di Roma) */
const REMINDER_MINUTE = 50;
const REMINDER_FIRST_HOUR = 9;
/* soglia per annunciare un'entrata in banca (bonus, versamenti) */
const BANK_ANNOUNCE_MIN = 100_000;
/* acquisti truppe raggruppati per utente per non intasare il canale */
const PURCHASE_BATCH_MS = 60_000;

const EPOCH_LABELS: Record<string, string> = {
  [EPOCHS.CLONE_WARS]: "Guerre dei Cloni",
  [EPOCHS.CIVIL_WAR]: "Guerra Civile",
  [EPOCHS.SEQUEL]: "Era del Primo Ordine",
};

let lastClient: any = null;

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}
function fmt(n?) {
  return safeInt(n).toLocaleString("it-IT");
}
function sideOf(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (LEFT_IDS.includes(f)) return "left";
  if (RIGHT_IDS.includes(f)) return "right";
  return null;
}
function currentEpoch(now = new Date()) {
  return resolveFeatureStateNow(now).epoch || EPOCHS.CLONE_WARS;
}
function eventKeyOf(client?) {
  try {
    return resolveStarWarsEventConfig(client || lastClient).eventKey || ADVENT_EVENT_KEY;
  } catch {
    return ADVENT_EVENT_KEY;
  }
}
function mainGuildId(client?) {
  return normalizeId(client?.config?.mainGuildId || IDs.guilds?.main);
}
function romeHour(date = new Date()) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(h) % 24;
}
/** "2026-12-21T14" (ora UTC) → "15:00" (Roma) */
function romeClockOfHourKey(hourKey?, plusHours = 0) {
  const d = new Date(`${String(hourKey || "").slice(0, 13)}:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCHours(d.getUTCHours() + plusHours);
  return `${String(romeHour(d)).padStart(2, "0")}:00`;
}

/** Fazione dell'epoca in corso per lo stesso lato (chi si smista ha l'id delle Guerre dei Cloni). */
function factionForEpoch(factionId?, epoch = currentEpoch()) {
  try {
    const { remapFactionId } = require("./starWarsTransversalService") as typeof import("./starWarsTransversalService");
    return remapFactionId(factionId, epoch) || normalizeId(factionId);
  } catch {
    return normalizeId(factionId);
  }
}
function factionName(factionId?, epoch = currentEpoch()) {
  try {
    const { factionDisplayName } = require("./starWarsPeiStandingService") as typeof import("./starWarsPeiStandingService");
    return factionDisplayName(epoch, factionId) || normalizeId(factionId);
  } catch {
    return normalizeId(factionId);
  }
}
function rankName(factionId?, tier?) {
  try {
    const { rankLabel } = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");
    return rankLabel(factionId, tier);
  } catch {
    return `Rango ${tier}`;
  }
}

function rememberClient(client?) {
  if (client && (client.rest?.post || client._rest?.post)) lastClient = client;
}

function announcementsEnabled(client?) {
  if (process.env.SW_FACTION_ANNOUNCE_CHANNEL) return true;
  /* simulazioni QA (DB swqa): mai nei canali veri */
  if (process.env.SWQA === "1") return false;
  try {
    const { isStarWarsRuntimeDisabled } = require("../../EventPlugins/starwars/runtimeKillSwitch") as typeof import("../../EventPlugins/starwars/runtimeKillSwitch");
    if (isStarWarsRuntimeDisabled(client || lastClient)) return false;
  } catch (_) {}
  return true;
}

function channelFor(factionId?) {
  const override = normalizeId(process.env.SW_FACTION_ANNOUNCE_CHANNEL);
  if (override) return override;
  const side = sideOf(factionId);
  return side === "left" ? CHANNEL_LEFT : side === "right" ? CHANNEL_RIGHT : null;
}

/** Dedupe persistente (sopravvive ai riavvii): true se questo processo ha preso l'annuncio. */
async function claimOnce(key?) {
  const dedupeKey = `sw_faction_announce_${normalizeId(key)}`;
  try {
    const res = await SiteDocument.updateOne(
      { docType: SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE, ownerId: OWNER, dedupeKey },
      {
        $setOnInsert: {
          docType: SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE,
          ownerId: OWNER,
          dedupeKey,
          guildId: "0",
          payload: { at: new Date().toISOString() },
        },
      },
      { upsert: true },
    );
    return Boolean(res?.upsertedCount);
  } catch {
    return false;
  }
}

async function sendToFaction(client?, factionId?, { title, description, mentionUserIds = [] as string[] }: any = {}) {
  if (!announcementsEnabled(client)) return null;
  const channelId = channelFor(factionId);
  if (!channelId) return null;
  const c = client?.rest?.post || client?._rest?.post ? client : lastClient || (global as any).botClient || null;
  const rest = c?.rest?.post ? c.rest : c?._rest?.post ? c._rest : null;
  if (!rest) return null;
  const users = [...new Set((mentionUserIds || []).map(normalizeId).filter(Boolean))];
  const body: Record<string, any> = {
    embeds: [
      {
        title: String(title || "").slice(0, 256),
        description: String(description || "").slice(0, 4000),
        color: sideOf(factionId) === "right" ? COLOR_RIGHT : COLOR_LEFT,
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [], users },
  };
  if (users.length) body.content = users.map((u) => `<@${u}>`).join(" ");
  try {
    return await rest.post(Routes.channelMessages(channelId), { body });
  } catch (err) {
    global.logger?.warn?.("[STARWARS] annuncio fazione non inviato", { channelId, err: (err as any)?.message || String(err) });
    return null;
  }
}

/* ——— Nuova recluta ——— */
async function announceNewRecruit(client?, { userId, factionId, becameMarshal = false }: any = {}) {
  rememberClient(client);
  const uid = normalizeId(userId);
  if (!uid || !factionId) return null;
  const epoch = currentEpoch();
  const fid = factionForEpoch(factionId, epoch);
  const lines = [`<@${uid}> è stato smistato nella fazione **${factionName(fid, epoch)}**: benvenuto tra le nostre fila!`];
  if (becameMarshal) lines.push(`👑 È il primo arrivato e prende il comando come **${rankName(fid, 4)}**.`);
  lines.push(`Truppe, banca e guerre della fazione sono sul [sito](${SITE_FACTION_URL}).`);
  return sendToFaction(client, fid, { title: "🆕 Nuova recluta", description: lines.join("\n"), mentionUserIds: [uid] });
}

/* ——— Ranghi ——— */
async function announceRankChange(client?, { guildId = null, userId, factionId, tier, previousTier = 0 }: any = {}) {
  rememberClient(client);
  const uid = normalizeId(userId);
  const t = safeInt(tier);
  if (!uid || !factionId || t <= safeInt(previousTier)) return null;
  if (guildId && mainGuildId(client || lastClient) && normalizeId(guildId) !== mainGuildId(client || lastClient)) return null;
  const epoch = currentEpoch();
  const fid = factionForEpoch(factionId, epoch);
  const label = rankName(fid, t);
  if (t >= 4) {
    return sendToFaction(client, fid, {
      title: "👑 Nuovo comandante",
      description: `<@${uid}> è il nuovo **${label}** della fazione **${factionName(fid, epoch)}**: d'ora in poi le decisioni di guerra spettano a lui.`,
      mentionUserIds: [uid],
    });
  }
  return sendToFaction(client, fid, {
    title: "🎖️ Promozione",
    description: `<@${uid}> è stato promosso a **${label}**.`,
    mentionUserIds: [uid],
  });
}

/* ——— Banca e acquisti ——— */
const purchaseBatches = new Map<string, { client: any; factionId: string; userId: string; items: Map<string, number>; cost: number; bankCredits: number; timer: any }>();

function announceTroopPurchase(client?, { userId, factionId, unitLabel, qty = 1, cost = 0, bankCredits = 0 }: any = {}) {
  rememberClient(client);
  const uid = normalizeId(userId);
  const fid = normalizeId(factionId);
  if (!uid || !fid) return;
  const key = `${fid}:${uid}`;
  let batch = purchaseBatches.get(key);
  if (!batch) {
    batch = { client, factionId: fid, userId: uid, items: new Map(), cost: 0, bankCredits: 0, timer: null };
    purchaseBatches.set(key, batch);
    batch.timer = setTimeout(() => {
      purchaseBatches.delete(key);
      const list = [...batch.items.entries()].map(([label, n]) => `**${fmt(n)}× ${label}**`).join(", ");
      void sendToFaction(batch.client, batch.factionId, {
        title: "🛒 Arruolamento",
        description: `<@${batch.userId}> ha arruolato ${list} per **${fmt(batch.cost)}** crediti della banca.\nIn banca restano **${fmt(batch.bankCredits)}** crediti.`,
      });
    }, PURCHASE_BATCH_MS);
    batch.timer.unref?.();
  }
  const label = String(unitLabel || "unità");
  batch.items.set(label, (batch.items.get(label) || 0) + Math.max(1, safeInt(qty, 1)));
  batch.cost += safeInt(cost);
  batch.bankCredits = safeInt(bankCredits);
}

async function announceBankIncome(client?, { factionId, amount, userId = null, reason = "" }: any = {}) {
  rememberClient(client);
  const add = safeInt(amount);
  if (!factionId || add < BANK_ANNOUNCE_MIN) return null;
  const uid = normalizeId(userId);
  const why = String(reason || "").trim();
  const who = uid ? ` grazie a <@${uid}>` : "";
  return sendToFaction(client, factionId, {
    title: "💰 Entrata in banca",
    description: `La banca della fazione riceve **+${fmt(add)}** crediti${who}${why ? ` (${why})` : ""}.`,
  });
}

/* ——— Guerra: esito ——— */
function stanceText(side?) {
  if (side?.stance === "attack") return "in **attacco**";
  if (side?.stance === "defend") return "in **difesa**";
  return "in **difesa passiva** (tutto l'arsenale)";
}

async function announceWarResult(client?, report?) {
  if (!report?.id || !report.left || !report.right) return null;
  if (report.mode !== "engagement" && report.mode !== "raid") return null;
  if (!(await claimOnce(`war_${report.id}`))) return null;
  const startClock = romeClockOfHourKey(report.hourKey);
  const endClock = romeClockOfHourKey(report.hourKey, 1);
  const out = [];
  for (const side of [report.left, report.right]) {
    const fid = side.factionId;
    const won = report.winner && report.winner === fid;
    const outcome = !report.winner ? "🤝 **Parità**" : won ? "🏆 **Vittoria**" : "💥 **Sconfitta**";
    const lines = [
      `${outcome} nella battaglia delle **${startClock}–${endClock}** (${report.mode === "raid" ? "raid" : "scontro pieno"}).`,
      `La fazione ha combattuto ${stanceText(side)}.`,
      `Truppe in campo **${fmt(side.before?.count)}** · perse **${fmt(side.dead?.count)}** · sopravvissute **${fmt(side.survivors?.count)}**.`,
    ];
    if (report.spoils?.credits && report.spoils.factionId === fid) lines.push(`💰 Bottino: **+${fmt(report.spoils.credits)}** crediti alla banca.`);
    lines.push(`Il rapporto completo è sul [sito](${SITE_FACTION_URL}).`);
    out.push(await sendToFaction(client, fid, { title: "⚔️ Esito della battaglia", description: lines.join("\n") }));
  }
  return out;
}

/* ——— Cambio d'epoca ——— */
async function announceEpochChange(client?, { epoch, previousEpoch = null }: any = {}) {
  rememberClient(client);
  const target = normalizeId(epoch);
  if (!target || !(await claimOnce(`epoch_${eventKeyOf(client)}_${target}`))) return null;
  const prev = previousEpoch || (target === EPOCHS.SEQUEL ? EPOCHS.CIVIL_WAR : EPOCHS.CLONE_WARS);
  const out = [];
  for (const fid of EPOCH_FACTIONS[target] || []) {
    const oldSide = (EPOCH_FACTIONS[prev] || []).find((f) => sideOf(f) === sideOf(fid));
    out.push(
      await sendToFaction(client, fid, {
        title: `🌌 Inizia una nuova epoca: ${EPOCH_LABELS[target] || target}`,
        description: [
          `${oldSide ? `**${factionName(oldSide, prev)}**` : "La fazione"} diventa **${factionName(fid, target)}**.`,
          "Banca e arsenale ripartono da zero: servono nuovi crediti e nuove truppe.",
          `Ranghi, guerre e negozio sono sul [sito](${SITE_FACTION_URL}).`,
        ].join("\n"),
      }),
    );
  }
  return out;
}

/* ——— Loop del bot (ogni 60″) ——— */
async function tickFactionAnnouncements(client?, now = new Date()) {
  rememberClient(client);
  if (!announcementsEnabled(client)) return { ok: true, skipped: true };
  const features = resolveFeatureStateNow(now);
  if (!features.economyOn) return { ok: true, skipped: true, reason: "economy_off" };
  const epoch = features.epoch || EPOCHS.CLONE_WARS;
  const pair = EPOCH_FACTIONS[epoch] || [];
  if (pair.length !== 2) return { ok: true, skipped: true };
  const eventKey = eventKeyOf(client);
  const Eco = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
  const hourKey = Eco.currentHourKey(now);

  /* ore passate ancora aperte (attacco senza risposta): si chiudono subito, così l'esito arriva a fine ora */
  try {
    await Eco.resolveStaleHours(eventKey, pair[0], pair[1], epoch, hourKey);
  } catch (_) {}

  if (now.getUTCMinutes() < REMINDER_MINUTE || romeHour(now) < REMINDER_FIRST_HOUR) return { ok: true };
  const { findMarshalUserId } = require("./starWarsFactionRankService") as typeof import("./starWarsFactionRankService");
  const sent = [];
  for (const fid of pair) {
    const bank = await Eco.getFactionBank(eventKey, fid).catch(() => null);
    if (!bank) continue;
    const acted = bank.stanceHour === hourKey || String(bank.lastAttackAt || "").startsWith(hourKey);
    if (acted) continue;
    if (!(await claimOnce(`warrem_${eventKey}_${fid}_${hourKey}`))) continue;
    const marshal = await findMarshalUserId(mainGuildId(client), fid, eventKey).catch(() => null);
    const endClock = romeClockOfHourKey(hourKey, 1);
    const who = marshal ? `<@${marshal}>, la` : "La";
    await sendToFaction(client, fid, {
      title: "⏰ Guerra: mancano 10 minuti",
      description: [
        `${who} fazione **${factionName(fid, epoch)}** non ha ancora scelto per quest'ora.`,
        `Entro le **${endClock}** dichiara **attacco** o **difesa** dal [sito](${SITE_FACTION_URL}).`,
        "Se non scegli, l'arsenale difende da solo con tutte le truppe.",
      ].join("\n"),
      mentionUserIds: marshal ? [marshal] : [],
    });
    sent.push(fid);
  }
  return { ok: true, reminders: sent };
}

export = {
  CHANNEL_LEFT,
  CHANNEL_RIGHT,
  rememberClient,
  announceNewRecruit,
  announceRankChange,
  announceTroopPurchase,
  announceBankIncome,
  announceWarResult,
  announceEpochChange,
  tickFactionAnnouncements,
};
