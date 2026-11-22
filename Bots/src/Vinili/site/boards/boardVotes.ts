/** Bacheche: voti ai server (sessione, captcha Turnstile, promemoria), bump e segnalazioni. */
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { voteCountMonthKeyRome, dayKeyRome, prevDayKeyRome } = require("../../Community/utils/romeVoteMonthKey") as typeof import("../../Community/utils/romeVoteMonthKey");
const { sanitizeText, preferAnimatedDiscordMediaUrl, slugify } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, BR, emitBoardsChanged, featureGate, hashIp } = require("./boardReviews") as typeof import("./boardReviews");

const BV = SITE_DOCUMENT_TYPE.BOARD_VOTE;
const BB = SITE_DOCUMENT_TYPE.BOARD_BUMP;

/** Accetta ObjectId, slug o snowflake Discord; toglie slash finali (query/trailingSlash). */
async function resolveApprovedListingRef(raw?) {
  const s = String(raw ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!s || s === "undefined" || s === "null") return null;
  if (mongoose.isValidObjectId(s)) {
    const byId: any = await SiteDocument.findOne({ _id: s, docType: BL, status: "approved" }).lean();
    if (byId) return { id: String(byId._id), listing: byId };
  }
  if (/^\d{17,22}$/.test(s)) {
    const byDiscord: any = await SiteDocument.findOne({
      docType: BL,
      boardDiscordId: s,
      status: "approved",
    }).lean();
    if (byDiscord) return { id: String(byDiscord._id), listing: byDiscord };
  }
  const slug = slugify(s);
  if (!slug || slug === "listing") return null;
  const bySlug: any = await SiteDocument.findOne({ docType: BL, boardSlug: slug, status: "approved" }).lean();
  if (!bySlug) return null;
  return { id: String(bySlug._id), listing: bySlug };
}

function clientIp(req?) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req?.socket?.remoteAddress || "").trim();
}

/** Slot anti-race allineato al cooldown (non più “1 voto/giorno UTC”, che bloccava dopo le ore). */
function voteCooldownDedupeKey(listingId?, userId?, cooldownHours = 12, at = Date.now()) {
  const hours = Math.max(1, Number(cooldownHours) || 12);
  const slotMs = hours * 60 * 60 * 1000;
  const slot = Math.floor(Number(at) / slotMs);
  return `${String(listingId || "").trim()}:${String(userId || "").trim()}:cd${hours}h:${slot}`;
}

function listingVotesMonth(doc?) {
  const key = voteCountMonthKeyRome();
  if (String(doc?.boardVotesMonthKey || "") !== key) return 0;
  return Math.max(0, Number(doc?.boardVotesMonth) || 0);
}

/** Streak voti dell’utente su una scheda: voti consecutivi entro 2× cooldown. */
async function computeVoteStreak(listingId?, userId?, cooldownHours = 12) {
  const id = String(listingId || "").trim();
  const uid = String(userId || "").trim();
  if (!id || !uid || !mongoose.isValidObjectId(id)) return 0;
  const hours = Math.max(1, Number(cooldownHours) || 12);
  const maxGapMs = hours * 2 * 60 * 60 * 1000;
  const votes: any[] = await SiteDocument.find({
    docType: BV,
    boardListingId: id,
    userId: uid,
  })
    .select({ createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(120)
    .lean();
  if (!votes.length) return 0;
  const now = Date.now();
  const last = new Date(votes[0].createdAt).getTime();
  if (!Number.isFinite(last) || now - last > maxGapMs) return 0;
  let streak = 1;
  for (let i = 1; i < votes.length; i += 1) {
    const newer = new Date(votes[i - 1].createdAt).getTime();
    const older = new Date(votes[i].createdAt).getTime();
    if (!Number.isFinite(newer) || !Number.isFinite(older) || newer - older > maxGapMs) break;
    streak += 1;
  }
  return streak;
}

/** Streak bump viva dal documento (0 se interrotta). */
function liveBumpStreakOf(doc?) {
  const n = Math.max(0, Number(doc?.boardBumpStreak) || 0);
  const day = String(doc?.boardBumpStreakDay || "").trim();
  if (!n || !day) return 0;
  const today = dayKeyRome();
  if (day === today || day === prevDayKeyRome(today)) return n;
  return 0;
}

/** Ricalcola streak bump da storia BB (giorni Rome con ≥1 bump) e opzionalmente persiste. */
async function resolveBumpStreak(listingId?, doc?, { persist = true } = {}) {
  const id = String(listingId || doc?._id || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return { bumpStreak: 0, bumpStreakDay: "" };
  const storedDay = String(doc?.boardBumpStreakDay || "").trim();
  const storedN = Math.max(0, Number(doc?.boardBumpStreak) || 0);
  const storedLive = liveBumpStreakOf(doc);
  if (storedLive > 0) return { bumpStreak: storedLive, bumpStreakDay: storedDay };
  /* già tracciata ma scaduta → non rifare il backfill finché non arriva un bump nuovo */
  if (storedDay && storedN > 0) return { bumpStreak: 0, bumpStreakDay: storedDay };
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const bumps: any[] = await SiteDocument.find({
    docType: BB,
    boardListingId: id,
    createdAt: { $gte: since },
  })
    .select({ createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();
  if (!bumps.length) return { bumpStreak: 0, bumpStreakDay: "" };
  const days = new Set<string>();
  for (const b of bumps) days.add(dayKeyRome(b.createdAt));
  const today = dayKeyRome();
  const yesterday = prevDayKeyRome(today);
  let cur = days.has(today) ? today : days.has(yesterday) ? yesterday : "";
  if (!cur) return { bumpStreak: 0, bumpStreakDay: "" };
  let streak = 0;
  const startDay = cur;
  while (cur && days.has(cur)) {
    streak += 1;
    cur = prevDayKeyRome(cur);
  }
  if (persist && streak > 0) {
    await SiteDocument.updateOne(
      { _id: id, docType: BL },
      { $set: { boardBumpStreak: streak, boardBumpStreakDay: startDay } },
    ).catch(() => null);
  }
  return { bumpStreak: streak, bumpStreakDay: startDay };
}

/** Aggiorna streak bump al momento di un bump riuscito (1 giorno calendariale = +1). */
function nextBumpStreakAfterBump(listing?, at = new Date()) {
  const today = dayKeyRome(at);
  const prev = prevDayKeyRome(today);
  const lastDay = String(listing?.boardBumpStreakDay || "").trim();
  const prevStreak = Math.max(0, Number(listing?.boardBumpStreak) || 0);
  if (lastDay === today) {
    return { boardBumpStreak: Math.max(1, prevStreak || 1), boardBumpStreakDay: today };
  }
  if (lastDay === prev && prevStreak > 0) {
    return { boardBumpStreak: prevStreak + 1, boardBumpStreakDay: today };
  }
  return { boardBumpStreak: 1, boardBumpStreakDay: today };
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
  const hours = Math.max(1, Number(cfg?.voteCooldownHours) || 12);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  /* Ultimo voto entro il cooldown (indipendente dal giorno UTC). */
  const recent: any = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: uid,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (recent) {
    const next = new Date(new Date(recent.createdAt).getTime() + hours * 60 * 60 * 1000);
    const mins = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 60_000));
    const wait =
      mins >= 120
        ? `circa ${Math.ceil(mins / 60)} ore`
        : mins >= 60
          ? "circa un'ora"
          : `circa ${mins} minut${mins === 1 ? "o" : "i"}`;
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: `Hai già votato di recente. Potrai votare di nuovo tra ${wait}.`,
      nextVoteAt: next.toISOString(),
    };
  }
  return { ok: true };
}

/** Stato cooldown voto per la scheda (UI countdown stile bump) + streak utente. */
async function getListingVoteStatus(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const resolved = await resolveApprovedListingRef(payload.listingId || payload.id);
  if (!resolved) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const id = resolved.id;
  const [eligibility, voteStreak] = await Promise.all([
    canUserVoteListing(id, auth.userId, cfg),
    computeVoteStreak(id, auth.userId, cfg.voteCooldownHours),
  ]);
  if (!eligibility.ok && eligibility.error === "vote_cooldown") {
    return {
      ok: true,
      status: 200,
      canVote: false,
      nextVoteAt: eligibility.nextVoteAt || null,
      cooldownHours: cfg.voteCooldownHours,
      voteStreak,
    };
  }
  if (!eligibility.ok) return eligibility;
  return {
    ok: true,
    status: 200,
    canVote: true,
    nextVoteAt: null,
    cooldownHours: cfg.voteCooldownHours,
    voteStreak,
  };
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
  const rawRef = payload.listingId || payload.id;
  const resolved = await resolveApprovedListingRef(rawRef);
  if (!resolved) {
    global.logger?.warn?.("[boards] vote-session invalid_id", {
      raw: String(rawRef ?? "").slice(0, 80),
      type: typeof rawRef,
    });
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const id = resolved.id;
  const listing: any = resolved.listing;
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
  const resolved = await resolveApprovedListingRef(payload.listingId || payload.id);
  if (!resolved) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const id = resolved.id;
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

  const dedupe = voteCooldownDedupeKey(id, auth.userId, cfg.voteCooldownHours);
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
  /* avvisa il proprietario del nuovo voto (una notifica all'ora, col conteggio del mese) */
  try {
    const { notifyNewVote } = require("./boardNotify") as typeof import("./boardNotify");
    void notifyNewVote(listing, { userId: auth.userId, name: auth.globalName || auth.username || "" }, monthInc);
  } catch (_) {}
  /* statistiche della scheda + avviso nel server (modulo Bump e voti), senza bloccare la risposta */
  try {
    const { trackListingVote } = require("./boardAnalytics") as typeof import("./boardAnalytics");
    void trackListingVote(id);
  } catch (_) {}
  if (String(listing.boardKind || "") !== "bot" && String(listing.boardDiscordId || "").trim()) {
    try {
      const { onListingVoted } = require("./boardVoteHook") as typeof import("./boardVoteHook");
      void onListingVoted(client, id, auth.userId).catch((err?) => global.logger?.warn?.("[site-boards] avviso voto nel server:", err?.message || err));
    } catch (_) {}
  }
  const voteStreak = await computeVoteStreak(id, auth.userId, cfg.voteCooldownHours);
  return {
    ok: true,
    status: 200,
    voted: true,
    votesMonth: monthInc,
    votesMonthKey: monthKey,
    remindAt: remindAt ? remindAt.toISOString() : null,
    voteId: voteDoc ? String(voteDoc._id) : "",
    cooldownHours: cfg.voteCooldownHours,
    voteStreak,
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
        .select("title boardSlug boardVoteHook boardDiscordId boardKind")
        .lean();
      for (const row of listings || []) {
        listingById.set(String(row._id), row);
      }
    } catch (_) {}
  }
  let sent = 0;
  const followerNotified = new Set<string>();
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
      ? `https://www.viniliecaffe.it/vetrina/vota/?slug=${encodeURIComponent(slug)}`
      : `https://www.viniliecaffe.it/vetrina/vota/?id=${encodeURIComponent(listingId)}`;
    if (!followerNotified.has(listingId)) {
      followerNotified.add(listingId);
      try {
        const { notifyFollowersVoteReady } = require("./boardWatch") as typeof import("./boardWatch");
        void notifyFollowersVoteReady(listingId, name, openUrl);
      } catch (_) {}
    }
    /* dm: prima DM, se fallisce → sito. site: prima sito, se fallisce → DM. */
    const reminderMode = String(listing?.boardVoteHook?.reminderMode || "site") === "dm" ? "dm" : "site";
    const { sendReminderDm } = require("./boardVoteHook") as typeof import("./boardVoteHook");
    if (reminderMode === "dm" && listing) {
      try {
        if (await sendReminderDm(client, listing, uid, openUrl)) {
          vote.boardRemindSentAt = now;
          await vote.save().catch(() => null);
          sent += 1;
          continue;
        }
      } catch (_) {}
    }
    let siteOk = false;
    try {
      const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
      siteOk = Boolean(
        await enqueueSiteInAppNotification({
          guildId: String(IDs.guilds?.main || "").trim() || "global",
          userId: uid,
          title: "Promemoria voto Vetrina",
          body: `Puoi votare di nuovo per ${name}. Grazie per il supporto!`,
          kind: "vote_reminder",
          openUrl,
          dedupeKey: `vote_reminder_boards_${listingId}_${String(vote._id)}`,
          dedupeWindowMs: Math.max(60_000, gate.cfg.voteCooldownHours * 60 * 60 * 1000),
          push: true,
        }),
      );
    } catch (err) {
      global.logger?.warn?.("[boards] vote reminder:", err?.message || err);
    }
    if (siteOk) {
      vote.boardRemindSentAt = now;
      await vote.save().catch(() => null);
      sent += 1;
      continue;
    }
    if (reminderMode === "site" && listing) {
      try {
        if (await sendReminderDm(client, listing, uid, openUrl, { force: true })) {
          vote.boardRemindSentAt = now;
          await vote.save().catch(() => null);
          sent += 1;
          continue;
        }
      } catch (_) {}
    }
    vote.boardRemindSentAt = now;
    vote.boardRemindAt = null;
    await vote.save().catch(() => null);
  }
  return { ok: true, sent };
}

let voteRemindTimer = null;
let lastFollowDigestSweepAt = 0;
const FOLLOW_DIGEST_SWEEP_MS = 6 * 3600_000;

function ensureBoardsVoteReminderScheduler(client?) {
  if (voteRemindTimer) return;
  voteRemindTimer = setInterval(() => {
    sweepBoardVoteReminders(client).catch((err?) => {
      global.logger?.warn?.("[boards] vote remind sweep:", err?.message || err);
    });
    const now = Date.now();
    if (now - lastFollowDigestSweepAt >= FOLLOW_DIGEST_SWEEP_MS) {
      lastFollowDigestSweepAt = now;
      try {
        const { sweepFollowWeeklyDigest } = require("./boardWatch") as typeof import("./boardWatch");
        void sweepFollowWeeklyDigest().catch((err?) => {
          global.logger?.warn?.("[boards] follow digest sweep:", err?.message || err);
        });
      } catch (_) {}
    }
  }, 60 * 1000);
  if (typeof voteRemindTimer.unref === "function") voteRemindTimer.unref();
  setTimeout(() => {
    sweepBoardVoteReminders(client).catch(() => null);
    lastFollowDigestSweepAt = Date.now();
    try {
      const { sweepFollowWeeklyDigest } = require("./boardWatch") as typeof import("./boardWatch");
      void sweepFollowWeeklyDigest().catch(() => null);
    } catch (_) {}
  }, 12_000).unref?.();
}

/** Bump: riporta in cima all'elenco una scheda server. Una volta ogni 2 ore per scheda (come Disboard), mai per i bot. */
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;

function nextBumpAtOf(listing?) {
  const last = listing?.boardBumpedAt ? new Date(listing.boardBumpedAt).getTime() : 0;
  return last ? new Date(last + BUMP_COOLDOWN_MS) : null;
}

/** Bump condiviso tra il sito e il comando /bump su Discord. */
async function doBump(client: any, listing: any, who: { userId: string; name?: string; ip?: string; source?: string; channelId?: string }) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  if (String(listing.boardKind || "") === "bot") {
    return { ok: false, status: 400, error: "bump_bots", message: "Il bump è solo per i server." };
  }
  const next = nextBumpAtOf(listing);
  if (next && next.getTime() > Date.now()) {
    const mins = Math.ceil((next.getTime() - Date.now()) / 60000);
    const wait = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    return {
      ok: false,
      status: 429,
      error: "bump_cooldown",
      message: `Il prossimo bump si può fare tra ${wait}.`,
      nextBumpAt: next.toISOString(),
    };
  }
  const id = String(listing._id);
  /* aggiornamento atomico: due bump nello stesso istante non passano entrambi */
  const now = new Date();
  /* se la streak non è ancora sul documento, ricavala dalla storia BB prima di incrementare */
  if (!String(listing.boardBumpStreakDay || "").trim()) {
    const resolved = await resolveBumpStreak(id, listing, { persist: false });
    if (resolved.bumpStreak > 0) {
      listing.boardBumpStreak = resolved.bumpStreak;
      listing.boardBumpStreakDay = resolved.bumpStreakDay;
    }
  }
  const streakSet = nextBumpStreakAfterBump(listing, now);
  const upd = await SiteDocument.updateOne(
    { _id: id, docType: BL, $or: [{ boardBumpedAt: null }, { boardBumpedAt: { $lte: new Date(now.getTime() - BUMP_COOLDOWN_MS) } }] },
    { $set: { boardBumpedAt: now, boardBumpStreak: streakSet.boardBumpStreak, boardBumpStreakDay: streakSet.boardBumpStreakDay } },
  );
  if (!upd?.modifiedCount) {
    return { ok: false, status: 429, error: "bump_cooldown", message: "Qualcuno ha appena fatto il bump.", nextBumpAt: new Date(now.getTime() + BUMP_COOLDOWN_MS).toISOString() };
  }
  await SiteDocument.create({
    docType: BB,
    userId: String(who.userId),
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    boardClientIpHash: who.ip ? hashIp(who.ip) : "",
    authorName: String(who.name || ""),
    content: String(who.source || "site"),
  });
  const scores = await recomputeListingScore(id, cfg);
  emitBoardsChanged("bump", { listingId: id });
  /* ringraziamento, ruolo, EXP e promemoria impostati nella tab Bump della scheda */
  try {
    const { onListingBumped } = require("./boardBumpHook") as typeof import("./boardBumpHook");
    await onListingBumped(client, id, String(who.userId), { channelId: who.channelId || null, fromDiscord: who.source === "discord" });
  } catch (err) {
    global.logger?.warn?.("[site-boards] bump nel server:", err?.message || err);
  }
  try {
    const { notifyFollowersBump } = require("./boardWatch") as typeof import("./boardWatch");
    const slug = String(listing.boardSlug || "").trim();
    const openUrl = slug
      ? `https://www.viniliecaffe.it/vetrina/scheda/?slug=${encodeURIComponent(slug)}`
      : `https://www.viniliecaffe.it/vetrina/scheda/?id=${encodeURIComponent(id)}`;
    void notifyFollowersBump(id, listing.title, openUrl);
  } catch (_) {}
  return {
    ok: true,
    status: 200,
    bumped: true,
    listingId: id,
    bannerUrl: String(listing.boardBannerUrl || ""),
    iconUrl: String(listing.boardIconUrl || ""),
    bumpedAt: now.toISOString(),
    nextBumpAt: new Date(now.getTime() + BUMP_COOLDOWN_MS).toISOString(),
    slug: String(listing.boardSlug || ""),
    name: String(listing.title || ""),
    bumpStreak: streakSet.boardBumpStreak,
    ...scores,
  };
}

/** Dal sito: chiunque abbia fatto l'accesso può fare il bump di una scheda server. */
async function bumpListing(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" });
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  return doBump(client, listing, { userId: auth.userId, name: auth.globalName || auth.username || "", ip: reqMeta.ip, source: "site" });
}

/** Da Discord (/bump): la scheda del server dove si usa il comando. */
async function bumpGuildListing(client?, guildId?: string, user: { id: string; name?: string; channelId?: string } = { id: "" }) {
  const gid = String(guildId || "").trim();
  const listing = await SiteDocument.findOne({ docType: BL, boardKind: "server", boardDiscordId: gid, status: "approved" });
  if (!listing) {
    return { ok: false, status: 404, error: "no_listing", message: "Questo server non è ancora in vetrina: mettilo su viniliecaffe.it/vetrina." };
  }
  return doBump(client, listing, { userId: String(user.id), name: user.name || "", source: "discord", channelId: user.channelId || "" });
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
  const { sanitizeReportCategory, categoryLabel } = require("./boardReports") as typeof import("./boardReports");
  const category = sanitizeReportCategory(payload.category || payload.reportCategory);
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 8) {
    return { ok: false, status: 400, error: "short_reason", message: "Spiega meglio il problema (almeno 8 caratteri)." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(listing.userId || "") === String(auth.userId)) {
    return { ok: false, status: 400, error: "own_listing", message: "Non puoi segnalare la tua scheda." };
  }
  /* Solo segnalazioni scheda (non recensioni) contano per il rate-limit 24h. */
  const recent = await SiteDocument.exists({
    docType: BR,
    userId: auth.userId,
    boardListingId: id,
    reportCategory: { $nin: ["review"] },
    createdAt: { $gte: new Date(Date.now() - 24 * 3600_000) },
  });
  if (recent) {
    return { ok: false, status: 429, error: "already_reported", message: "Hai già segnalato questa scheda nelle ultime 24 ore." };
  }
  const doc = await SiteDocument.create({
    docType: BR,
    userId: auth.userId,
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    title: categoryLabel(category),
    reportCategory: category,
    content: reason,
    status: "open",
    authorName: auth.globalName || auth.username || "",
    boardModeration: { reportKind: "listing" },
  });
  try {
    const { notifyBoardsReportStaff } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    void notifyBoardsReportStaff(client, {
      reportId: String(doc._id),
      listingId: id,
      listingName: String(listing.title || ""),
      kind: String(listing.boardKind || ""),
      reporterId: auth.userId,
      reporterName: auth.globalName || auth.username || "",
      categoryLabel: categoryLabel(category),
      isReview: false,
    });
  } catch (_) {}
  return { ok: true, status: 201, reported: true, message: "Segnalazione inviata allo staff. Grazie." };
}

export = {
  BV,
  BB,
  clientIp,
  listingVotesMonth,
  recomputeListingScore,
  getListingVoteStatus,
  startListingVoteSession,
  progressListingVoteSession,
  voteListing,
  setListingVoteReminder,
  sweepBoardVoteReminders,
  ensureBoardsVoteReminderScheduler,
  bumpListing,
  bumpGuildListing,
  nextBumpAtOf,
  reportListing,
  computeVoteStreak,
  resolveBumpStreak,
  liveBumpStreakOf,
};
