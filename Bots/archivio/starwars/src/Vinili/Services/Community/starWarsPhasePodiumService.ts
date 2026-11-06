/**
 * Premi fine fase (epoca): top-1 minigamer / voter / PEI → canale standing + ricompense.
 * Sostituisce l'utente del mese per tutta la durata dell'evento.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));
const { resolveStarWarsEventConfig, romeYmd } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { EPOCHS } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { formatCrateMention } = require("../../Utils/Eventi/starWarsCrateEmojis") as typeof import("../../Utils/Eventi/starWarsCrateEmojis");
const { ROOT } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { grantStarWarsReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
const { PEI_STANDING_CHANNEL_ID } = require("./starWarsPeiStandingService") as typeof import("./starWarsPeiStandingService");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_phase_podium__";
const BASELINE_OWNER = "__starwars_phase_podium_baseline__";
const PODIO1 = "<:VC_Podio1:1482694399283433582>";
const CREDITI = "<a:VC_crediti:1567852561543733338>";

/** Chiusure epoca (Rome) — allineate agli snapshot PEI + fine evento. */
const PODIUM_SNAPSHOTS = Object.freeze([
  {
    id: "clone_wars_end_2027-01-01",
    date: "2027-01-01",
    closingEpoch: EPOCHS.CLONE_WARS,
    title: "Fine fase Clone Wars",
    subtitle: "Chiusura Clone Wars → Guerra Civile",
  },
  {
    id: "civil_war_end_2027-01-29",
    date: "2027-01-29",
    closingEpoch: EPOCHS.CIVIL_WAR,
    title: "Fine fase Guerra Civile",
    subtitle: "Chiusura Guerra Civile → Sequel",
  },
  {
    id: "sequel_end_2027-02-28",
    date: "2027-02-28",
    closingEpoch: EPOCHS.SEQUEL,
    title: "Fine fase Sequel",
    subtitle: "Chiusura evento Star Wars",
  },
]);

const CATEGORIES = Object.freeze([
  {
    id: "campione_sabacc",
    title: "Campione di Sabacc",
    blurb: "miglior minigamer",
    metric: "quizCorrectTotal",
    metricLabel: "vittorie minigame",
    credits: 150_000,
    exp: 5_000,
    color: 0xe4c76b,
  },
  {
    id: "senatore_galattico",
    title: "Senatore Galattico",
    blurb: "miglior voter",
    metric: "votes",
    metricLabel: "voti",
    credits: 250_000,
    exp: 3_000,
    color: 0x3b82f6,
  },
  {
    id: "leggenda_galassia",
    title: "Leggenda della Galassia",
    blurb: "miglior utente PEI",
    metric: "pei",
    metricLabel: "PEI",
    credits: 250_000,
    exp: 3_000,
    color: 0xa855f7,
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

function formatMetric(metric?, value?) {
  if (metric === "pei") {
    return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
  }
  return Number(value || 0).toLocaleString("it-IT");
}

async function resolvePodiumChannel(client?) {
  let channelId = PEI_STANDING_CHANNEL_ID;
  try {
    const { remapChannelIdForGuild, isTestMirrorGuild } = require(__eventCoreVinili(
      "Config/testGuildMirrorRemap",
    )) as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
    const testId = normalizeId(IDs.guilds?.test);
    if (testId && isTestMirrorGuild(testId)) {
      const main = client?.guilds?.cache?.get(normalizeId(IDs.guilds?.main));
      if (!main && client?.guilds?.cache?.get(testId)) {
        channelId = remapChannelIdForGuild(testId, PEI_STANDING_CHANNEL_ID) || PEI_STANDING_CHANNEL_ID;
      }
    }
  } catch (_) {}
  const channel = client?.channels?.cache?.get(channelId) || (await client?.channels?.fetch?.(channelId).catch(() => null));
  return channel?.isTextBased?.() ? channel : null;
}

async function alreadyDone(dedupeKey?) {
  const doc = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || "") })
    .lean()
    .catch(() => null);
  return Boolean(doc?.payload?.done);
}

async function markDone(dedupeKey?, payload?) {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || "") },
    {
      $set: { payload: { done: true, ...(payload || {}), at: new Date().toISOString() }, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: String(dedupeKey || ""), guildId: "0" },
    },
    { upsert: true },
  ).catch(() => null);
}

function baselineDedupe(eventKey?) {
  return `phase_podium_baseline_${String(eventKey || ADVENT_EVENT_KEY)}`;
}

async function loadBaselineMap(eventKey?) {
  const doc = await SiteDocument.findOne({
    docType: DOC_TYPE,
    ownerId: BASELINE_OWNER,
    dedupeKey: baselineDedupe(eventKey),
  })
    .lean()
    .catch(() => null);
  const users = doc?.payload?.users;
  return users && typeof users === "object" ? users : {};
}

async function saveBaselineMap(eventKey?, users?) {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: BASELINE_OWNER, dedupeKey: baselineDedupe(eventKey) },
    {
      $set: {
        payload: { users: users || {}, at: new Date().toISOString() },
        updatedAt: new Date(),
      },
      $setOnInsert: {
        docType: DOC_TYPE,
        ownerId: BASELINE_OWNER,
        dedupeKey: baselineDedupe(eventKey),
        guildId: "0",
      },
    },
    { upsert: true },
  ).catch(() => null);
}

async function loadPhaseStats(eventKey?) {
  const rows = await ActivityUserProfile.find({
    [`${ROOT}.eventKey`]: eventKey,
    $or: [
      { [`${ROOT}.quizCorrectTotal`]: { $gt: 0 } },
      { [`${ROOT}.votes`]: { $gt: 0 } },
      { [`${ROOT}.pei`]: { $gt: 0 } },
      { [`${ROOT}.exp`]: { $gt: 0 } },
    ],
  })
    .select(`userId ${ROOT}.quizCorrectTotal ${ROOT}.votes ${ROOT}.pei ${ROOT}.exp`)
    .lean()
    .catch(() => []);

  const current = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const uid = normalizeId(r?.userId);
    if (!uid) continue;
    const sw = r?.profile?.events?.starwars || {};
    current[uid] = {
      quizCorrectTotal: safeInt(sw.quizCorrectTotal),
      votes: safeInt(sw.votes),
      pei: safeNum(sw.pei),
      exp: safeInt(sw.exp),
    };
  }
  return current;
}

function phaseDelta(current?, baseline?) {
  const out = [];
  const ids = new Set([...Object.keys(current || {}), ...Object.keys(baseline || {})]);
  for (const uid of ids) {
    const cur = current?.[uid] || {};
    const base = baseline?.[uid] || {};
    out.push({
      userId: uid,
      quizCorrectTotal: Math.max(0, safeInt(cur.quizCorrectTotal) - safeInt(base.quizCorrectTotal)),
      votes: Math.max(0, safeInt(cur.votes) - safeInt(base.votes)),
      pei: Math.max(0, safeNum(cur.pei) - safeNum(base.pei)),
      exp: Math.max(0, safeInt(cur.exp) - safeInt(base.exp)),
    });
  }
  return out;
}

function pickTop1(rows?, metric?) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort((a, b) => {
    const av = Number(a?.[metric] || 0);
    const bv = Number(b?.[metric] || 0);
    if (bv !== av) return bv - av;
    return String(a.userId).localeCompare(String(b.userId));
  });
  const top = list[0];
  if (!top || Number(top[metric] || 0) <= 0) return null;
  return top;
}

function categoryEmbed(cat?, winner?, snapshotMeta?) {
  const lines = [
    snapshotMeta?.subtitle ? `**${snapshotMeta.subtitle}**` : null,
    "",
    `Titolo: **${cat.title}**`,
    `Categoria: ${cat.blurb}`,
    "",
  ];
  if (winner) {
    lines.push(
      `${PODIO1} <@${winner.userId}>`,
      `Score fase: **${formatMetric(cat.metric, winner[cat.metric])}** ${cat.metricLabel}`,
      "",
      `Premio: ${formatCrateMention("solare", 1, { open: true })} · ${CREDITI} **${cat.credits.toLocaleString("it-IT")}** crediti · **${cat.exp.toLocaleString("it-IT")}** exp`,
    );
  } else {
    lines.push("_Nessun vincitore in questa fase._");
  }
  return new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${PODIO1} ${cat.title}`)
    .setDescription(lines.filter((x?) => x != null).join("\n"))
    .setFooter({ text: snapshotMeta?.title || "Premi fine fase" });
}

/**
 * Calcola top-1 per fase (delta vs baseline), assegna premi, posta embed, aggiorna baseline.
 * Idempotente via SiteDocument.
 */
async function announcePhasePodium(client?, snapshotMeta?) {
  if (!client || !snapshotMeta?.id) return { ok: false, error: "bad_args" };
  const dedupe = `phase_podium_${snapshotMeta.id}`;
  if (await alreadyDone(dedupe)) return { ok: true, skipped: true };

  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const guildId = walletGuildId(client);
  const channel = await resolvePodiumChannel(client);
  if (!channel) return { ok: false, error: "no_channel" };

  const current = await loadPhaseStats(eventKey);
  const baseline = await loadBaselineMap(eventKey);
  const deltas = phaseDelta(current, baseline);

  /* Baseline PRIMA dei grant: i premi podio non entrano nella fase successiva. */
  await saveBaselineMap(eventKey, current);

  /* Nuova fase: azzera crediti evento di tutti (i premi podio sotto ripartono da zero). */
  const creditsWipe = await ActivityUserProfile.updateMany(
    { [`${ROOT}.eventKey`]: eventKey },
    { $set: { [`${ROOT}.credits`]: 0, [`${ROOT}.updatedAt`]: new Date().toISOString() } },
  ).catch(() => null);

  const winners = [];
  const messageIds = [];

  for (const cat of CATEGORIES) {
    const top = pickTop1(deltas, cat.metric);
    let grantOut = null;
    if (top?.userId) {
      grantOut = await grantStarWarsReward(client, {
        guildId,
        userId: top.userId,
        reason: `podium_${cat.id}_${snapshotMeta.id}`.slice(0, 80),
        grant: {
          crateId: "solare",
          crateQty: 1,
          credits: cat.credits,
          exp: cat.exp,
        },
      });
      winners.push({
        categoryId: cat.id,
        userId: top.userId,
        score: top[cat.metric],
        granted: Boolean(grantOut?.ok),
      });
    } else {
      winners.push({ categoryId: cat.id, userId: null, score: 0, granted: false });
    }

    const msg = await channel.send({ embeds: [categoryEmbed(cat, top, snapshotMeta)] }).catch(() => null);
    if (msg?.id) messageIds.push(msg.id);
  }

  if (!messageIds.length) return { ok: false, error: "send_failed" };

  await markDone(dedupe, {
    messageIds,
    winners,
    closingEpoch: snapshotMeta.closingEpoch,
    title: snapshotMeta.title,
    creditsWiped: safeInt(creditsWipe?.modifiedCount),
  });

  return { ok: true, messageIds, winners, creditsWiped: safeInt(creditsWipe?.modifiedCount) };
}

/** Loop 60s: se oggi è una data di chiusura fase e non ancora fatto → posta + premia. */
async function maybeAnnounceDuePhasePodiums(client?, now = new Date()) {
  if (!client) return { ok: false };
  const { iso } = romeYmd(now);
  const due = PODIUM_SNAPSHOTS.filter((s?) => s.date === iso);
  if (!due.length) return { ok: true, due: 0 };
  const results = [];
  for (const meta of due) {
    results.push(await announcePhasePodium(client, meta));
  }
  return { ok: true, due: due.length, results };
}

export = {
  PODIUM_SNAPSHOTS,
  CATEGORIES,
  announcePhasePodium,
  maybeAnnounceDuePhasePodiums,
};
