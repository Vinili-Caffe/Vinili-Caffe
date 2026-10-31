/** Bacheche: voti ai server (sessione, captcha Turnstile, promemoria), bump e segnalazioni. */
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { sanitizeText, preferAnimatedDiscordMediaUrl } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, BR, emitBoardsChanged, featureGate, hashIp } = require("./boardReviews") as typeof import("./boardReviews");

const BV = SITE_DOCUMENT_TYPE.BOARD_VOTE;
const BB = SITE_DOCUMENT_TYPE.BOARD_BUMP;

function clientIp(req?) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req?.socket?.remoteAddress || "").trim();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function listingVotesMonth(doc?) {
  const key = voteCountMonthKeyRome();
  if (String(doc?.boardVotesMonthKey || "") !== key) return 0;
  return Math.max(0, Number(doc?.boardVotesMonth) || 0);
}

function computeScore(votes30d?, bumps7d?, cfg?) {
  return Math.max(0, Number(votes30d) || 0) * cfg.scoreVotesWeight + Math.max(0, Number(bumps7d) || 0) * cfg.scoreBumpsWeight;
}

/* boardsVoteFlow1: sessioni voto (countdown → ad → turnstile) */
const voteSessions = new Map();
const VOTE_SESSION_TTL_MS = 15 * 60 * 1000;

function pruneVoteSessions() {
  const now = Date.now();
  for (const [id, sess] of voteSessions) {
    if (!sess || now - Number(sess.createdAt || 0) > VOTE_SESSION_TTL_MS) voteSessions.delete(id);
  }
  if (voteSessions.size > 5000) {
    const entries = [...voteSessions.entries()].sort((a?, b?) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < entries.length - 4000; i += 1) voteSessions.delete(entries[i][0]);
  }
}

async function verifyTurnstileToken(secret?, token?, ip?) {
  const sec = String(secret || "").trim();
  const tok = String(token || "").trim();
  if (!sec) return { ok: true, skipped: true };
  if (!tok) return { ok: false, error: "missing_turnstile" };
  try {
    const body = new URLSearchParams();
    body.set("secret", sec);
    body.set("response", tok);
    if (ip) body.set("remoteip", String(ip));
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data: any = await res.json().catch(() => null);
    if (data && data.success === true) return { ok: true };
    return { ok: false, error: "turnstile_failed", codes: data?.["error-codes"] || [] };
  } catch (err) {
    global.logger?.warn?.("[boards] turnstile verify:", err?.message || err);
    return { ok: false, error: "turnstile_error" };
  }
}

async function canUserVoteListing(listingId?, userId?, cfg?) {
  const id = String(listingId || "").trim();
  const uid = String(userId || "").trim();
  if (!id || !uid) return { ok: false, status: 400, error: "invalid", message: "Dati voto non validi." };
  const dedupe = `${id}:${uid}:${dayKey()}`;
  const existing = await SiteDocument.findOne({ docType: BV, dedupeKey: dedupe }).lean();
  if (existing) {
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: `Puoi votare di nuovo tra circa ${cfg.voteCooldownHours} ore (max 1 voto/giorno).`,
      nextVoteAt: null,
    };
  }
  const since = new Date(Date.now() - cfg.voteCooldownHours * 60 * 60 * 1000);
  const recent: any = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: uid,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (recent) {
    const next = new Date(new Date(recent.createdAt).getTime() + cfg.voteCooldownHours * 60 * 60 * 1000);
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: "Hai già votato di recente per questa scheda.",
      nextVoteAt: next.toISOString(),
    };
  }
  return { ok: true };
}

async function recomputeListingScore(listingId?, cfg?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return;
  const sinceVote = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceBump = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [votes30d, bumps7d] = await Promise.all([
    SiteDocument.countDocuments({ docType: BV, boardListingId: id, createdAt: { $gte: sinceVote } }),
    SiteDocument.countDocuments({ docType: BB, boardListingId: id, createdAt: { $gte: sinceBump } }),
  ]);
  const score = computeScore(votes30d, bumps7d, cfg);
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardVotes30d: votes30d, boardBumps7d: bumps7d, boardScore: score } },
  );
  return { votes30d, bumps7d, score };
}

/* boardsVoteFlow1 */
async function startListingVoteSession(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" }).lean();
  if (!listing) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  }
  const eligibility = await canUserVoteListing(id, auth.userId, cfg);
  if (!eligibility.ok) return eligibility;

  pruneVoteSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  voteSessions.set(sessionId, {
    listingId: id,
    userId: auth.userId,
    createdAt: now,
    countdownAt: 0,
    adAt: 0,
  });
  ensureBoardsVoteReminderScheduler(client);
  return {
    ok: true,
    status: 200,
    sessionId,
    expiresInSec: Math.floor(VOTE_SESSION_TTL_MS / 1000),
    countdownSeconds: cfg.voteCountdownSeconds,
    adSeconds: cfg.voteAdSeconds,
    turnstileSiteKey: cfg.turnstileSiteKey || "",
    turnstileRequired: Boolean(cfg.turnstileSecretKey),
    ads: {
      provider: cfg.ads.provider,
      adsenseClient: cfg.ads.adsenseClient,
      adsenseSlot: cfg.ads.adsenseSlot,
      minWatchSeconds: cfg.ads.minWatchSeconds,
    },
    listing: {
      id,
      name: String(listing.title || ""),
      slug: String(listing.boardSlug || ""),
      iconUrl: preferAnimatedDiscordMediaUrl(String(listing.boardIconUrl || "")),
      kind: String(listing.boardKind || ""),
      votesMonth: listingVotesMonth(listing),
    },
    cooldownHours: cfg.voteCooldownHours,
  };
}

async function progressListingVoteSession(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const sessionId = String(payload.sessionId || "").trim();
  const step = String(payload.step || "").trim().toLowerCase();
  const sess = voteSessions.get(sessionId);
  if (!sess || sess.userId !== auth.userId) {
    return { ok: false, status: 400, error: "bad_session", message: "Sessione voto non valida o scaduta." };
  }
  if (Date.now() - sess.createdAt > VOTE_SESSION_TTL_MS) {
    voteSessions.delete(sessionId);
    return { ok: false, status: 400, error: "session_expired", message: "Sessione voto scaduta. Ricarica la pagina." };
  }
  const now = Date.now();
  if (step === "countdown") {
    /* boardsVoteNoCountdown1: con 0 secondi nessun wait */
    const needMs = Math.max(0, Number(cfg.voteCountdownSeconds) || 0) * 1000;
    if (needMs > 0 && now - sess.createdAt < needMs - 400) {
      return { ok: false, status: 400, error: "countdown_early", message: "Attendi la fine del countdown." };
    }
    sess.countdownAt = now;
    return { ok: true, status: 200, step: "countdown" };
  }
  if (step === "ad") {
    if (!sess.countdownAt) {
      return { ok: false, status: 400, error: "countdown_required", message: "Completa prima il countdown." };
    }
    if (payload.markStart === true) {
      sess.adStartedAt = now;
      return { ok: true, status: 200, step: "ad_start" };
    }
    if (!sess.adStartedAt) sess.adStartedAt = sess.countdownAt;
    /* boardsVoteNoAdCountdown1: 0s = nessun wait obbligatorio */
    const needAdSec = Math.max(0, Number(cfg.ads.minWatchSeconds) || Number(cfg.voteAdSeconds) || 0);
    const needAd = needAdSec > 0 ? needAdSec * 1000 - 400 : 0;
    if (cfg.ads.provider !== "none" && needAd > 0 && now - sess.adStartedAt < needAd) {
      return { ok: false, status: 400, error: "ad_early", message: "Guarda lo sponsor per il tempo richiesto." };
    }
    sess.adAt = now;
    return { ok: true, status: 200, step: "ad" };
  }
  return { ok: false, status: 400, error: "bad_step", message: "Step non valido." };
}

async function voteListing(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" });
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };

  /* boardsVoteFlow1: richiede sessione completa + Turnstile se configurato */
  const sessionId = String(payload.sessionId || "").trim();
  const sess = voteSessions.get(sessionId);
  if (!sess || sess.userId !== auth.userId || sess.listingId !== id) {
    return {
      ok: false,
      status: 400,
      error: "bad_session",
      message: "Apri la pagina voto e completa sponsor e verifica.",
    };
  }
  if (Date.now() - sess.createdAt > VOTE_SESSION_TTL_MS) {
    voteSessions.delete(sessionId);
    return { ok: false, status: 400, error: "session_expired", message: "Sessione voto scaduta." };
  }
  if (!sess.countdownAt) {
    return { ok: false, status: 400, error: "countdown_required", message: "Avvia il voto dalla pagina dedicata prima di confermare." };
  }
  if (cfg.ads.provider !== "none" && !sess.adAt) {
    return { ok: false, status: 400, error: "ad_required", message: "Completa lo sponsor prima di votare." };
  }

  if (cfg.turnstileSecretKey) {
    const ts = await verifyTurnstileToken(cfg.turnstileSecretKey, payload.turnstileToken || payload.cfTurnstile, reqMeta.ip);
    if (!ts.ok) {
      return {
        ok: false,
        status: 403,
        error: ts.error || "turnstile_failed",
        message: "Verifica anti-robot non riuscita. Riprova.",
      };
    }
  }

  const eligibility = await canUserVoteListing(id, auth.userId, cfg);
  if (!eligibility.ok) return eligibility;

  const dedupe = `${id}:${auth.userId}:${dayKey()}`;
  const wantRemind = payload.remind === true || payload.reminder === true;
  const remindAt = wantRemind
    ? new Date(Date.now() + cfg.voteCooldownHours * 60 * 60 * 1000)
    : null;

  let voteDoc;
  try {
    voteDoc = await SiteDocument.create({
      docType: BV,
      userId: auth.userId,
      boardListingId: id,
      guildId: String(listing.boardDiscordId || ""),
      dedupeKey: dedupe,
      boardClientIpHash: hashIp(reqMeta.ip),
      authorName: auth.globalName || auth.username || "",
      boardRemindAt: remindAt,
      boardRemindSentAt: null,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("duplicate"))) {
      return { ok: false, status: 429, error: "vote_cooldown", message: "Voto già registrato." };
    }
    throw err;
  }

  voteSessions.delete(sessionId);

  const monthKey = voteCountMonthKeyRome();
  const monthInc =
    String(listing.boardVotesMonthKey || "") === monthKey
      ? Math.max(0, Number(listing.boardVotesMonth) || 0) + 1
      : 1;
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardVotesMonth: monthInc, boardVotesMonthKey: monthKey } },
  );

  const scores = await recomputeListingScore(id, cfg);
  ensureBoardsVoteReminderScheduler(client);
  emitBoardsChanged("vote", { listingId: id });
  return {
    ok: true,
    status: 200,
    voted: true,
    votesMonth: monthInc,
    votesMonthKey: monthKey,
    remindAt: remindAt ? remindAt.toISOString() : null,
    voteId: voteDoc ? String(voteDoc._id) : "",
    cooldownHours: cfg.voteCooldownHours,
    ...scores,
  };
}

async function setListingVoteReminder(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const since = new Date(Date.now() - cfg.voteCooldownHours * 60 * 60 * 1000);
  const recent = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: auth.userId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 });
  if (!recent) {
    return { ok: false, status: 404, error: "no_recent_vote", message: "Nessun voto recente da ricordare." };
  }
  const enable = payload.enable !== false && payload.remind !== false;
  if (!enable) {
    recent.boardRemindAt = null;
    recent.boardRemindSentAt = null;
    await recent.save();
    return { ok: true, status: 200, remindAt: null, enabled: false };
  }
  const base = new Date(recent.createdAt).getTime() + cfg.voteCooldownHours * 60 * 60 * 1000;
  const remindAt = new Date(Math.max(Date.now() + 30_000, base));
  recent.boardRemindAt = remindAt;
  recent.boardRemindSentAt = null;
  await recent.save();
  ensureBoardsVoteReminderScheduler(client);
  return { ok: true, status: 200, remindAt: remindAt.toISOString(), enabled: true };
}

async function sweepBoardVoteReminders(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return { ok: false, skipped: true };
  const now = new Date();
  const due = await SiteDocument.find({
    docType: BV,
    boardRemindAt: { $ne: null, $lte: now },
    boardRemindSentAt: null,
  })
    .sort({ boardRemindAt: 1 })
    .limit(40);
  if (!due.length) return { ok: true, sent: 0 };
  /* boardsListLite1: batch listing titles ($in) — no N+1 findOne */
  const listingIds = [
    ...new Set(
      due
        .map((v?) => String(v.boardListingId || "").trim())
        .filter((id?) => mongoose.isValidObjectId(id)),
    ),
  ];
  const listingById = new Map();
  if (listingIds.length) {
    try {
      const listings = await SiteDocument.find({
        _id: { $in: listingIds },
        docType: BL,
      })
        .select("title boardSlug")
        .lean();
      for (const row of listings || []) {
        listingById.set(String(row._id), row);
      }
    } catch (_) {}
  }
  let sent = 0;
  for (const vote of due) {
    const uid = String(vote.userId || "").trim();
    const listingId = String(vote.boardListingId || "").trim();
    if (!uid || !listingId) {
      vote.boardRemindSentAt = now;
      await vote.save().catch(() => null);
      continue;
    }
    const listing = listingById.get(listingId) || null;
    const name = String(listing?.title || "scheda").trim() || "scheda";
    const slug = String(listing?.boardSlug || "").trim();
    const openUrl = slug
      ? `https://www.viniliecaffe.it/bacheca/vota/?slug=${encodeURIComponent(slug)}`
      : `https://www.viniliecaffe.it/bacheca/vota/?id=${encodeURIComponent(listingId)}`;
    try {
      const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
      const ok = await enqueueSiteInAppNotification({
        guildId: String(IDs.guilds?.main || "").trim() || "global",
        userId: uid,
        title: "Promemoria voto Bacheca",
        body: `Puoi votare di nuovo per ${name}. Grazie per il supporto!`,
        kind: "vote_reminder",
        openUrl,
        dedupeKey: `vote_reminder_boards_${listingId}_${String(vote._id)}`,
        dedupeWindowMs: Math.max(60_000, gate.cfg.voteCooldownHours * 60 * 60 * 1000),
        push: true,
      });
      vote.boardRemindSentAt = now;
      if (!ok) vote.boardRemindAt = null;
      await vote.save();
      if (ok) sent += 1;
    } catch (err) {
      global.logger?.warn?.("[boards] vote reminder:", err?.message || err);
    }
  }
  return { ok: true, sent };
}

let voteRemindTimer = null;
function ensureBoardsVoteReminderScheduler(client?) {
  if (voteRemindTimer) return;
  voteRemindTimer = setInterval(() => {
    sweepBoardVoteReminders(client).catch((err?) => {
      global.logger?.warn?.("[boards] vote remind sweep:", err?.message || err);
    });
  }, 60 * 1000);
  if (typeof voteRemindTimer.unref === "function") voteRemindTimer.unref();
  setTimeout(() => {
    sweepBoardVoteReminders(client).catch(() => null);
  }, 12_000).unref?.();
}

async function bumpListing(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" });
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  if (String(listing.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo il proprietario può fare bump." };
  }

  const since = new Date(Date.now() - cfg.bumpCooldownHours * 60 * 60 * 1000);
  const recent = await SiteDocument.findOne({
    docType: BB,
    boardListingId: id,
    userId: auth.userId,
    createdAt: { $gte: since },
  }).lean();
  if (recent) {
    return {
      ok: false,
      status: 429,
      error: "bump_cooldown",
      message: `Bump in cooldown (${cfg.bumpCooldownHours}h).`,
    };
  }

  await SiteDocument.create({
    docType: BB,
    userId: auth.userId,
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    boardClientIpHash: hashIp(reqMeta.ip),
    authorName: auth.globalName || auth.username || "",
  });
  listing.boardBumpedAt = new Date();
  await listing.save();
  const scores = await recomputeListingScore(id, cfg);
  emitBoardsChanged("bump", { listingId: id });
  return { ok: true, status: 200, bumped: true, bumpedAt: listing.boardBumpedAt.toISOString(), ...scores };
}

async function reportListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 8) {
    return { ok: false, status: 400, error: "short_reason", message: "Motivo troppo corto." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  await SiteDocument.create({
    docType: BR,
    userId: auth.userId,
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    content: reason,
    status: "open",
    authorName: auth.globalName || auth.username || "",
  });
  return { ok: true, status: 201, reported: true };
}

export = { BV, BB, clientIp, listingVotesMonth, recomputeListingScore, startListingVoteSession, progressListingVoteSession, voteListing, setListingVoteReminder, sweepBoardVoteReminders, ensureBoardsVoteReminderScheduler, bumpListing, reportListing };
