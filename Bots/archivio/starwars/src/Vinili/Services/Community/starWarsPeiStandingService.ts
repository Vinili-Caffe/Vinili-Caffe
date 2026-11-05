/**
 * Exp fazione (somma membri) + snapshot PEI ai cambi epoca (1 gen / 29 gen)
 * nel canale staff/evento, due messaggi (uno per fazione).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { resolveStarWarsEventConfig, romeYmd } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { EPOCHS, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { ROOT } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { FACTION_SLOT_NAMES } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_pei_standing__";
const PEI_STANDING_CHANNEL_ID = "1562454089801928764";

/** Snapshot calendarizzati (Rome). */
const STANDING_SNAPSHOTS = Object.freeze([
  {
    id: "civil_war_2027-01-01",
    date: "2027-01-01",
    epoch: EPOCHS.CIVIL_WAR,
    title: "Chiusura Clone Wars → Guerra Civile",
  },
  {
    id: "sequel_2027-01-29",
    date: "2027-01-29",
    epoch: EPOCHS.SEQUEL,
    title: "Chiusura Guerra Civile → Sequel",
  },
]);

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}
function safeNum(v?, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function factionDisplayName(epoch?, factionId?) {
  const names = FACTION_SLOT_NAMES[epoch] || FACTION_SLOT_NAMES[EPOCHS.CLONE_WARS];
  const fid = normalizeId(factionId).toLowerCase();
  const leftIds = ["repubblica", "ribellione", "nuova_repubblica"];
  const rightIds = ["separatisti", "impero", "nuovo_ordine"];
  if (leftIds.includes(fid)) return String(names.left || fid).replace(/^༄\s*/u, "").trim();
  if (rightIds.includes(fid)) return String(names.right || fid).replace(/^༄\s*/u, "").trim();
  return fid || "Fazione";
}

function factionColor(factionId?) {
  const fid = normalizeId(factionId).toLowerCase();
  if (["repubblica", "ribellione", "nuova_repubblica"].includes(fid)) return 0x3b82f6;
  if (["separatisti", "impero", "nuovo_ordine"].includes(fid)) return 0xa855f7;
  return 0x94a3b8;
}

async function loadFactionMembersStats(eventKey?, factionIds = []) {
  const wanted = new Set((Array.isArray(factionIds) ? factionIds : []).map((f?) => normalizeId(f).toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  const rows = await ActivityUserProfile.find({
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.factionId`]: { $in: [...wanted] },
  })
    .select(`userId ${ROOT}.factionId ${ROOT}.exp ${ROOT}.pei ${ROOT}.credits ${ROOT}.creditsVolume ${ROOT}.votes`)
    .lean()
    .catch(() => []);
  return (Array.isArray(rows) ? rows : []).map((r?) => {
    const sw = r?.profile?.events?.starwars || {};
    return {
      userId: normalizeId(r?.userId),
      factionId: normalizeId(sw.factionId).toLowerCase(),
      exp: safeInt(sw.exp),
      pei: safeNum(sw.pei),
      credits: safeInt(sw.credits),
      creditsVolume: safeInt(sw.creditsVolume),
      votes: safeInt(sw.votes),
    };
  }).filter((m?) => m.userId && wanted.has(m.factionId));
}

async function getFactionStandingSnapshot(client?, { epoch = null } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const state = resolveFeatureStateNow(new Date());
  const ep = epoch || state.epoch || EPOCHS.CLONE_WARS;
  /* Per lo snapshot di passaggio usiamo le fazioni DELL'EPOCA CHE SI CHIUDE:
   * 1 gen → clone_wars (Repubblica/Separatisti)
   * 29 gen → civil_war (Ribellione/Impero)
   */
  const closingEpoch =
    ep === EPOCHS.SEQUEL ? EPOCHS.CIVIL_WAR : ep === EPOCHS.CIVIL_WAR ? EPOCHS.CLONE_WARS : EPOCHS.CLONE_WARS;
  const factions = EPOCH_FACTIONS[closingEpoch] || EPOCH_FACTIONS[EPOCHS.CLONE_WARS];
  const members = await loadFactionMembersStats(eventKey, factions);
  const byFaction = {};
  for (const f of factions) {
    byFaction[f] = { factionId: f, label: factionDisplayName(closingEpoch, f), exp: 0, pei: 0, members: 0, top: [] };
  }
  for (const m of members) {
    const bucket = byFaction[m.factionId];
    if (!bucket) continue;
    bucket.exp += m.exp;
    bucket.pei += m.pei;
    bucket.members += 1;
    bucket.top.push(m);
  }
  for (const f of factions) {
    byFaction[f].top.sort((a, b) => b.pei - a.pei || b.exp - a.exp || a.userId.localeCompare(b.userId));
    byFaction[f].top = byFaction[f].top.slice(0, 5);
  }
  return {
    ok: true,
    eventKey,
    closingEpoch,
    targetEpoch: ep,
    factions: factions.map((f?) => byFaction[f]),
  };
}

function standingEmbed(factionRow?, meta?) {
  const topLines = (Array.isArray(factionRow?.top) ? factionRow.top : [])
    .map((m?, i?) => `${i + 1}. <@${m.userId}> — **${Number(m.pei).toLocaleString("it-IT", { maximumFractionDigits: 1 })} PEI** · ${Number(m.exp).toLocaleString("it-IT")} exp`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(factionColor(factionRow?.factionId))
    .setTitle(`${factionRow?.label || "Fazione"} — classifica PEI`)
    .setDescription(
      [
        meta?.title ? `**${meta.title}**` : null,
        "",
        `Exp fazione: **${Number(factionRow?.exp || 0).toLocaleString("it-IT")}**`,
        `PEI totali: **${Number(factionRow?.pei || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}**`,
        `Smistati: **${Number(factionRow?.members || 0)}**`,
        "",
        topLines ? `**Top PEI**\n${topLines}` : "_Nessun PEI ancora._",
      ]
        .filter((x?) => x != null)
        .join("\n"),
    )
    .setFooter({ text: "PEI: 50k exp → 500 · 10M crediti → 100 · 1 voto → 0,2" });
}

async function resolveStandingChannel(client?) {
  const base = PEI_STANDING_CHANNEL_ID;
  let channelId = base;
  const guildId = walletGuildId(client);
  try {
    const { remapChannelIdForGuild, isTestMirrorGuild } = require(__eventCoreVinili("Config/testGuildMirrorRemap")) as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
    const testId = normalizeId(IDs.guilds?.test);
    if (testId && isTestMirrorGuild(testId)) {
      /* Preferisci main channel; se bot è solo su test, remap */
      const main = client?.guilds?.cache?.get(normalizeId(IDs.guilds?.main));
      if (!main && client?.guilds?.cache?.get(testId)) {
        channelId = remapChannelIdForGuild(testId, base) || base;
      }
    }
  } catch (_) {}
  const channel = client?.channels?.cache?.get(channelId) || (await client?.channels?.fetch?.(channelId).catch(() => null));
  return channel?.isTextBased?.() ? channel : null;
}

async function alreadyAnnounced(dedupeKey?) {
  const doc = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || "") })
    .lean()
    .catch(() => null);
  return Boolean(doc?.payload?.done);
}

async function markAnnounced(dedupeKey?, payload?) {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || "") },
    {
      $set: { payload: { done: true, ...(payload || {}), at: new Date().toISOString() }, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || ""), guildId: "0" },
    },
    { upsert: true },
  ).catch(() => null);
}

/**
 * Due messaggi (uno per fazione) allo scatto epoca.
 * Idempotente via SiteDocument.
 */
async function announceEpochPeiStanding(client?, snapshotMeta?) {
  if (!client || !snapshotMeta?.id) return { ok: false, error: "bad_args" };
  const dedupe = `pei_standing_${snapshotMeta.id}`;
  if (await alreadyAnnounced(dedupe)) return { ok: true, skipped: true };

  const snap = await getFactionStandingSnapshot(client, { epoch: snapshotMeta.epoch });
  const channel = await resolveStandingChannel(client);
  if (!channel) return { ok: false, error: "no_channel" };

  const messageIds = [];
  for (const factionRow of snap.factions || []) {
    const msg = await channel
      .send({ embeds: [standingEmbed(factionRow, snapshotMeta)] })
      .catch(() => null);
    if (msg?.id) messageIds.push(msg.id);
  }
  if (!messageIds.length) return { ok: false, error: "send_failed" };
  await markAnnounced(dedupe, { messageIds, closingEpoch: snap.closingEpoch, targetEpoch: snap.targetEpoch });
  return { ok: true, messageIds, factions: (snap.factions || []).map((f?) => f.factionId) };
}

/** Da chiamare nel loop 60s: se oggi è una data snapshot e non ancora annunciato → posta. */
async function maybeAnnounceDuePeiStandings(client?, now = new Date()) {
  if (!client) return { ok: false };
  const { iso } = romeYmd(now);
  const due = STANDING_SNAPSHOTS.filter((s?) => s.date === iso);
  if (!due.length) return { ok: true, due: 0 };
  const results = [];
  for (const meta of due) {
    results.push(await announceEpochPeiStanding(client, meta));
  }
  return { ok: true, due: due.length, results };
}

export = {
  PEI_STANDING_CHANNEL_ID,
  STANDING_SNAPSHOTS,
  getFactionStandingSnapshot,
  announceEpochPeiStanding,
  maybeAnnounceDuePeiStandings,
  factionDisplayName,
};
