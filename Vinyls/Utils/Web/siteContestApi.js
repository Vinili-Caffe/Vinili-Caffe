/**
 * Contest sito (sfondi / outfit) — unlisted, swipe like Tinder.
 * Storage: Mongo sitecontests + file in Data/uploads/site-contests.
 */
const crypto = require("crypto");
const fs = require("node:fs");
const path = require("node:path");
const IDs = require("../Config/ids");
const { fetchDiscordOAuthMe } = require("./discordOauthMe");
const { assertWebsiteStaffAccess } = require("./siteStaffAccessApi");
const { SiteContest } = require("../../Schemas/Web/siteContestSchemas");
const { fetchWebsiteGuildMember } = require("./websiteGuildMemberFetch");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const IDsGuild = () => String(IDs?.guilds?.main || "").trim();

const UPLOAD_ROOT = path.resolve(__dirname, "../../../Data/uploads/site-contests");
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

/** Europe/Rome wall times as ISO with offset (CET after 2026-10-25). */
const EVENTS = {
  "sfondi-halloween": {
    key: "sfondi-halloween",
    kind: "sfondi",
    title: "Contest sfondi Halloween",
    blurb: "Invia uno sfondo PC e/o mobile e vota gli altri in stile swipe.",
    /* Aperto subito per test (link-only). Annuncio pubblico: dalle 19:00. Fine: ven 21:00. */
    startMs: Date.parse("2026-10-26T16:00:00+01:00"),
    endMs: Date.parse("2026-10-30T21:00:00+01:00"),
    maxPerCategory: 1,
    categories: [
      { id: "pc", label: "PC" },
      { id: "mobile", label: "Telefono / tablet" },
    ],
    publicOpen: true,
  },
  "outfit-halloween": {
    key: "outfit-halloween",
    kind: "outfit",
    title: "Contest outfit Halloween",
    blurb: "Mostra il tuo outfit Halloween e vota gli altri con uno swipe.",
    startMs: Date.parse("2026-10-31T12:00:00+01:00"),
    endMs: Date.parse("2026-11-01T21:00:00+01:00"),
    maxPerCategory: 1,
    categories: [{ id: "main", label: "Outfit" }],
    publicOpen: true,
  },
};

function normalizeHeaderSecret(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^Bearer\s+(.+)$/i);
  return String(m ? m[1] : s).trim();
}

function getEvent(eventKey) {
  return EVENTS[String(eventKey || "").trim()] || null;
}

function phaseFor(event, now = Date.now(), { staffPreview = false } = {}) {
  if (!event) return "unknown";
  if (!event.publicOpen && !staffPreview) return "hidden";
  /* Staff/Founder: possono provare prima dell’apertura (fino alla fine evento). */
  if (staffPreview && now < event.endMs) return "open";
  if (now < event.startMs) return "before";
  if (now >= event.endMs) return "after";
  return "open";
}

function eventCategories(event) {
  const list = Array.isArray(event?.categories) ? event.categories : [];
  return list.length ? list : [{ id: "main", label: "Main" }];
}

function normalizeCategory(event, raw) {
  const cats = eventCategories(event);
  const id = String(raw || "").trim().toLowerCase();
  if (cats.some((c) => c.id === id)) return id;
  return cats[0].id;
}

function publicEventPayload(event, phase, extras = {}) {
  return {
    ok: true,
    eventKey: event.key,
    kind: event.kind,
    title: event.title,
    blurb: event.blurb,
    startAt: new Date(event.startMs).toISOString(),
    endAt: new Date(event.endMs).toISOString(),
    phase,
    publicOpen: Boolean(event.publicOpen),
    categories: eventCategories(event),
    maxPerCategory: Math.max(1, Number(event.maxPerCategory) || 1),
    ...extras,
  };
}

async function resolveUser(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Accedi con Discord." };
  }
  const me = await fetchDiscordOAuthMe(token).catch(() => null);
  if (!me?.ok || !me?.me?.id) {
    return {
      ok: false,
      status: Number(me?.status) || 401,
      error: me?.error || "unauthorized",
      message: me?.message || "Sessione Discord non valida.",
    };
  }
  const userId = String(me.me.id).trim();
  const displayName = String(me.me.global_name || me.me.username || "Utente").trim();
  const avatarHash = me.me.avatar ? String(me.me.avatar) : "";
  const avatarUrl = avatarHash
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
    : "";
  return { ok: true, userId, displayName, avatarUrl, accessToken: token };
}

async function isStaffPreview(client, accessToken) {
  try {
    const out = await assertWebsiteStaffAccess(client, accessToken);
    /* Qualsiasi accesso staff sito (Founder incluso) → preview tools / apre prima. */
    if (out?.ok) return true;
  } catch (_) {}
  return false;
}

async function ensureMember(client, userId) {
  const guildId = String(IDs?.guilds?.main || "").trim();
  if (!guildId || !client) return { ok: true };
  try {
    const guild = client.guilds?.cache?.get(guildId) || (await client.guilds?.fetch?.(guildId).catch(() => null));
    if (!guild) return { ok: true };
    const member = await fetchWebsiteGuildMember(guild, userId, { soft: true });
    if (!member) {
      return {
        ok: false,
        status: 403,
        error: "not_in_guild",
        message: "Devi essere nel server Discord Vinili & Caffè per partecipare.",
      };
    }
  } catch (_) {
    /* soft-fail: non bloccare se Discord è down */
  }
  return { ok: true };
}

async function getOrCreateDoc(eventKey) {
  let doc = await SiteContest.findOne({ eventKey });
  if (!doc) {
    doc = await SiteContest.create({ eventKey, submissions: [], votes: {} });
  }
  return doc;
}

function parseDataUrl(raw) {
  const s = String(raw || "");
  const m = s.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;
  const buffer = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { mime, buffer };
}

function extForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function submissionPublic(sub, { hideAuthor = false, blurAuthor = false } = {}) {
  if (hideAuthor) {
    return {
      id: sub.id,
      imageUrl: sub.imageUrl,
      category: sub.category || "main",
      likes: Number(sub.likes) || 0,
      createdAt: sub.createdAt ? new Date(sub.createdAt).toISOString() : null,
      displayName: null,
      avatarUrl: null,
      userId: null,
      nameBlurred: false,
    };
  }
  return {
    id: sub.id,
    imageUrl: sub.imageUrl,
    category: sub.category || "main",
    likes: Number(sub.likes) || 0,
    createdAt: sub.createdAt ? new Date(sub.createdAt).toISOString() : null,
    /* Nome sempre presente in classifica; blurAuthor = sfocato in UI fino a fine evento. */
    displayName: sub.displayName || null,
    avatarUrl: blurAuthor ? null : sub.avatarUrl || null,
    userId: blurAuthor ? null : sub.userId || null,
    nameBlurred: Boolean(blurAuthor),
  };
}

function wipeVotesForSubmission(doc, submissionId) {
  const sid = String(submissionId || "");
  if (!sid || !doc.votes || typeof doc.votes !== "object") return 0;
  let n = 0;
  for (const vid of Object.keys(doc.votes)) {
    const leaf = doc.votes[vid];
    if (!leaf || typeof leaf !== "object") continue;
    if (leaf[sid]) {
      delete leaf[sid];
      n++;
    }
  }
  if (n) doc.markModified("votes");
  return n;
}

function tryUnlinkStoredImage(imageUrl) {
  const s = String(imageUrl || "");
  const m = s.match(/\/webhooks\/site-contest\/files\/([^/]+)\/([^/]+)\/([^/?#]+)/i);
  if (!m) return;
  const full = resolveStoredFile(decodeURIComponent(m[1]), decodeURIComponent(m[2]), decodeURIComponent(m[3]));
  if (full) {
    try {
      fs.unlinkSync(full);
    } catch (_) {}
  }
}

async function getContestStatus(client, { eventKey, accessToken } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  let staffPreview = false;
  let userId = "";
  if (accessToken) {
    const auth = await resolveUser(accessToken);
    if (auth.ok) {
      userId = auth.userId;
      staffPreview = await isStaffPreview(client, accessToken);
    }
  }

  const phase = phaseFor(event, Date.now(), { staffPreview });
  const doc = await getOrCreateDoc(event.key);
  const cats = eventCategories(event);
  const mine = userId ? (doc.submissions || []).filter((s) => s.userId === userId) : [];
  const myVotes = userId && doc.votes?.[userId] ? doc.votes[userId] : {};
  const maxPer = Math.max(1, Number(event.maxPerCategory) || 1);
  const byCat = {};
  for (const c of cats) {
    const n = mine.filter((s) => String(s.category || "main") === c.id).length;
    byCat[c.id] = {
      count: n,
      canSubmit: phase === "open" && n < maxPer,
    };
  }
  const canSubmitAny = phase === "open" && cats.some((c) => byCat[c.id]?.canSubmit);

  return publicEventPayload(event, phase, {
    status: 200,
    staffPreview,
    submissionCount: (doc.submissions || []).length,
    mySubmissions: mine.map((s) => submissionPublic(s)),
    myVoteCount: Object.keys(myVotes).length,
    canSubmitByCategory: byCat,
    canSubmit: canSubmitAny,
    canVote: phase === "open",
  });
}

async function listEvents(client, { accessToken } = {}) {
  let staffPreview = false;
  if (accessToken) staffPreview = await isStaffPreview(client, accessToken);
  const items = [];
  for (const event of Object.values(EVENTS)) {
    const phase = phaseFor(event, Date.now(), { staffPreview });
    if (phase === "hidden" && !staffPreview) continue;
    items.push(
      publicEventPayload(event, phase, {
        href: `/contest/${event.key}/`,
      }),
    );
  }
  return { ok: true, status: 200, events, staffPreview };
}

async function submitEntry(client, { eventKey, accessToken, image, category } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  const auth = await resolveUser(accessToken);
  if (!auth.ok) return auth;

  const staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase === "hidden") {
    return { ok: false, status: 404, error: "hidden", message: "Contest non disponibile." };
  }
  if (phase !== "open") {
    return {
      ok: false,
      status: 403,
      error: "closed",
      message: phase === "before" ? "Il contest non è ancora aperto." : "Il contest è chiuso.",
    };
  }

  const memberOk = await ensureMember(client, auth.userId);
  if (!memberOk.ok) return memberOk;

  const parsed = parseDataUrl(image);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "invalid_image",
      message: "Carica un’immagine PNG, JPG o WEBP (max 4 MB).",
    };
  }

  const cat = normalizeCategory(event, category);
  const maxPer = Math.max(1, Number(event.maxPerCategory) || 1);
  const doc = await getOrCreateDoc(event.key);
  const mineInCat = (doc.submissions || []).filter(
    (s) => s.userId === auth.userId && String(s.category || "main") === cat,
  );
  if (mineInCat.length >= maxPer) {
    return {
      ok: false,
      status: 409,
      error: "already_submitted",
      message: `Hai già inviato uno sfondo per «${cat}».`,
    };
  }

  const dir = path.join(UPLOAD_ROOT, event.key, auth.userId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${cat}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
  fs.writeFileSync(path.join(dir, name), parsed.buffer);
  const imageUrl = `/webhooks/site-contest/files/${encodeURIComponent(event.key)}/${encodeURIComponent(auth.userId)}/${encodeURIComponent(name)}`;

  const sub = {
    id: crypto.randomBytes(8).toString("hex"),
    userId: auth.userId,
    displayName: auth.displayName,
    avatarUrl: auth.avatarUrl,
    imageUrl,
    category: cat,
    likes: 0,
    createdAt: new Date(),
  };
  doc.submissions.push(sub);
  await doc.save();

  return {
    ok: true,
    status: 200,
    submission: submissionPublic(sub),
    message: "Partecipazione inviata.",
  };
}

async function getSwipeFeed(client, { eventKey, accessToken, category, limit = 20 } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  const auth = await resolveUser(accessToken);
  if (!auth.ok) return auth;

  const staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase === "hidden") {
    return { ok: false, status: 404, error: "hidden", message: "Contest non disponibile." };
  }
  if (phase !== "open" && phase !== "after") {
    return {
      ok: false,
      status: 403,
      error: "closed",
      message: "Il voto non è ancora aperto.",
    };
  }

  const cat = normalizeCategory(event, category);
  const doc = await getOrCreateDoc(event.key);
  const voted = doc.votes?.[auth.userId] || {};
  /* Mai la propria foto nel deck + solo categoria scelta. */
  const pool = (doc.submissions || []).filter(
    (s) => String(s.category || "main") === cat && s.userId !== auth.userId && !voted[s.id],
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = Math.min(40, Math.max(1, Number(limit) || 20));
  return {
    ok: true,
    status: 200,
    phase,
    category: cat,
    remaining: pool.length,
    /* Autore sempre nascosto in voto. */
    items: pool.slice(0, n).map((s) => submissionPublic(s, { hideAuthor: true })),
  };
}

async function castSwipe(client, { eventKey, accessToken, submissionId, action } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  const auth = await resolveUser(accessToken);
  if (!auth.ok) return auth;

  const staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase !== "open") {
    return { ok: false, status: 403, error: "closed", message: "Il voto è chiuso." };
  }

  const act = String(action || "").toLowerCase();
  if (act !== "like" && act !== "pass") {
    return { ok: false, status: 400, error: "bad_action", message: "Azione non valida (like|pass)." };
  }
  const sid = String(submissionId || "").trim();
  if (!sid) return { ok: false, status: 400, error: "missing_id", message: "Submission mancante." };

  const doc = await getOrCreateDoc(event.key);
  const sub = (doc.submissions || []).find((s) => s.id === sid);
  if (!sub) return { ok: false, status: 404, error: "not_found", message: "Partecipazione non trovata." };
  if (sub.userId === auth.userId) {
    return { ok: false, status: 403, error: "own", message: "Non puoi votare la tua foto." };
  }

  if (!doc.votes || typeof doc.votes !== "object") doc.votes = {};
  if (!doc.votes[auth.userId] || typeof doc.votes[auth.userId] !== "object") {
    doc.votes[auth.userId] = {};
  }
  const prev = doc.votes[auth.userId][sid];
  if (prev) {
    return { ok: true, status: 200, already: true, action: prev, message: "Già votato." };
  }

  doc.votes[auth.userId][sid] = act;
  doc.markModified("votes");
  if (act === "like") {
    sub.likes = (Number(sub.likes) || 0) + 1;
  }
  await doc.save();

  if (act === "like") {
    void notifyOwnerLike(client, event, sub).catch(() => null);
  }

  return { ok: true, status: 200, action: act, likes: Number(sub.likes) || 0 };
}

/** Like → notifica owner, stackabile (replaceDedupe + collapseDigest) finché non letta. */
async function notifyOwnerLike(client, event, sub) {
  const ownerId = String(sub?.userId || "").trim();
  if (!ownerId || !/^\d{5,32}$/.test(ownerId)) return;
  if (String(ownerId).startsWith("demo")) return;

  const cats = eventCategories(event);
  const catId = String(sub.category || "main");
  const catLabel = cats.find((c) => c.id === catId)?.label || catId;
  const guildId = IDsGuild() || "global";
  const likes = Math.max(1, Number(sub.likes) || 1);
  const openUrl = `/contest/${encodeURIComponent(event.key)}/`;
  const section = event.kind === "sfondi" ? `sfondo ${catLabel}` : catLabel;

  await enqueueSiteInAppNotification({
    guildId,
    userId: ownerId,
    title: "Nuovo like al contest",
    body: `Hai ricevuto un like sul tuo ${section} (totale ${likes}).`,
    kind: "contest",
    channel: "inbox",
    openUrl,
    dedupeKey: `contest:like:${event.key}:${sub.id}`,
    replaceDedupe: true,
    collapseDigest: true,
    digestLabel: `like al tuo ${section}`,
  });
}

async function getLeaderboard(client, { eventKey, accessToken, category, page = 1, pageSize = 10 } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  let staffPreview = false;
  if (accessToken) staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase === "hidden") {
    return { ok: false, status: 404, error: "hidden", message: "Contest non disponibile." };
  }

  const cat = normalizeCategory(event, category);
  /* Durante l’evento: nomi presenti ma sfocati. Fine evento / staff: nitidi. */
  const blurAuthor = phase !== "after" && !staffPreview;
  const isPreview = phase !== "after";
  const doc = await getOrCreateDoc(event.key);
  const ranked = (doc.submissions || [])
    .filter((s) => String(s.category || "main") === cat)
    .sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0));

  const podium = ranked.slice(0, 3).map((s, i) => ({
    rank: i + 1,
    ...submissionPublic(s, { blurAuthor }),
  }));

  const rest = ranked.slice(3);
  const size = Math.min(30, Math.max(5, Number(pageSize) || 10));
  const totalRest = rest.length;
  const totalPages = Math.max(1, Math.ceil(totalRest / size) || 1);
  const pageNum = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (pageNum - 1) * size;
  const items = rest.slice(start, start + size).map((s, i) => ({
    rank: 4 + start + i,
    ...submissionPublic(s, { blurAuthor }),
  }));

  return {
    ok: true,
    status: 200,
    phase,
    category: cat,
    preview: isPreview,
    nameBlurred: blurAuthor,
    podium,
    items,
    page: pageNum,
    pageSize: size,
    total: ranked.length,
    totalRest,
    totalPages,
  };
}

async function deleteEntry(client, { eventKey, accessToken, category } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  const auth = await resolveUser(accessToken);
  if (!auth.ok) return auth;

  const staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase === "hidden") {
    return { ok: false, status: 404, error: "hidden", message: "Contest non disponibile." };
  }
  if (phase !== "open") {
    return { ok: false, status: 403, error: "closed", message: "Puoi cancellare solo a contest aperto." };
  }

  const cat = normalizeCategory(event, category);
  const doc = await getOrCreateDoc(event.key);
  const idx = (doc.submissions || []).findIndex(
    (s) => s.userId === auth.userId && String(s.category || "main") === cat,
  );
  if (idx < 0) {
    return { ok: false, status: 404, error: "not_found", message: "Nessuna foto da cancellare in questa sezione." };
  }
  const removed = doc.submissions[idx];
  wipeVotesForSubmission(doc, removed.id);
  tryUnlinkStoredImage(removed.imageUrl);
  doc.submissions.splice(idx, 1);
  await doc.save();
  return {
    ok: true,
    status: 200,
    category: cat,
    message: "Foto cancellata. I voti ricevuti sono stati azzerati.",
  };
}

async function replaceEntry(client, { eventKey, accessToken, image, category } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };

  const auth = await resolveUser(accessToken);
  if (!auth.ok) return auth;

  const staffPreview = await isStaffPreview(client, accessToken);
  const phase = phaseFor(event, Date.now(), { staffPreview });
  if (phase === "hidden") {
    return { ok: false, status: 404, error: "hidden", message: "Contest non disponibile." };
  }
  if (phase !== "open") {
    return { ok: false, status: 403, error: "closed", message: "Puoi modificare solo a contest aperto." };
  }

  const memberOk = await ensureMember(client, auth.userId);
  if (!memberOk.ok) return memberOk;

  const parsed = parseDataUrl(image);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "invalid_image",
      message: "Carica un’immagine PNG, JPG o WEBP (max 4 MB).",
    };
  }

  const cat = normalizeCategory(event, category);
  const doc = await getOrCreateDoc(event.key);
  const sub = (doc.submissions || []).find(
    (s) => s.userId === auth.userId && String(s.category || "main") === cat,
  );
  if (!sub) {
    return { ok: false, status: 404, error: "not_found", message: "Nessuna foto da sostituire in questa sezione." };
  }

  wipeVotesForSubmission(doc, sub.id);
  tryUnlinkStoredImage(sub.imageUrl);

  const dir = path.join(UPLOAD_ROOT, event.key, auth.userId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${cat}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
  fs.writeFileSync(path.join(dir, name), parsed.buffer);
  sub.imageUrl = `/webhooks/site-contest/files/${encodeURIComponent(event.key)}/${encodeURIComponent(auth.userId)}/${encodeURIComponent(name)}`;
  sub.likes = 0;
  sub.displayName = auth.displayName;
  sub.avatarUrl = auth.avatarUrl;
  sub.createdAt = new Date();
  await doc.save();

  return {
    ok: true,
    status: 200,
    submission: submissionPublic(sub),
    message: "Foto aggiornata. I voti precedenti sono stati azzerati.",
  };
}

function resolveStoredFile(eventKey, userId, fileName) {
  const ek = String(eventKey || "").trim();
  const uid = String(userId || "").trim();
  const name = String(fileName || "").trim();
  if (!/^[a-z0-9-]{3,64}$/i.test(ek) || !/^\d{5,32}$/.test(uid) || !/^[a-z0-9._-]+$/i.test(name)) {
    return null;
  }
  const full = path.join(UPLOAD_ROOT, ek, uid, name);
  const root = path.join(UPLOAD_ROOT, ek, uid);
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function serveContestFile(req, res) {
  const full = resolveStoredFile(req.params.eventKey, req.params.userId, req.params.fileName);
  if (!full) {
    res.status(404).type("application/json").send(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Type", mimeFromName(req.params.fileName));
  fs.createReadStream(full).pipe(res);
}

/** Staff: apri/chiudi visibilità pubblica (env override non persistito — flag in-memory + persist su doc meta). */
async function setPublicOpen(client, { eventKey, accessToken, publicOpen } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };
  const staff = await isStaffPreview(client, accessToken);
  if (!staff) return { ok: false, status: 403, error: "forbidden", message: "Solo staff." };
  event.publicOpen = Boolean(publicOpen);
  return publicEventPayload(event, phaseFor(event, Date.now(), { staffPreview: true }), {
    status: 200,
    message: event.publicOpen ? "Contest visibile a chi ha il link." : "Contest nascosto (solo staff).",
  });
}

/** Staff: riempie il deck con foto placeholder (picsum) per provare lo swipe. */
async function seedDemo(client, { eventKey, accessToken, count = 8, replace = true } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };
  const staff = await isStaffPreview(client, accessToken);
  if (!staff) return { ok: false, status: 403, error: "forbidden", message: "Solo staff." };

  const cats = eventCategories(event);
  const n = Math.min(24, Math.max(1, Number(count) || 8));
  const doc = await getOrCreateDoc(event.key);

  /* Default: sostituisci le demo esistenti (altrimenti il 2° click non faceva nulla). */
  let removed = 0;
  if (replace !== false) {
    const before = (doc.submissions || []).length;
    const keepIds = new Set();
    doc.submissions = (doc.submissions || []).filter((s) => {
      const keep = !String(s.userId || "").startsWith("demo");
      if (keep) keepIds.add(s.id);
      return keep;
    });
    removed = before - doc.submissions.length;
    if (removed && doc.votes && typeof doc.votes === "object") {
      for (const vid of Object.keys(doc.votes)) {
        const leaf = doc.votes[vid];
        if (!leaf || typeof leaf !== "object") continue;
        for (const sid of Object.keys(leaf)) {
          if (!keepIds.has(sid)) delete leaf[sid];
        }
      }
      doc.markModified("votes");
    }
  }

  const stamp = Date.now().toString(36);
  let added = 0;
  for (let i = 1; i <= n; i++) {
    const userId = `demo${stamp}${String(i).padStart(3, "0")}`;
    if ((doc.submissions || []).some((s) => s.userId === userId)) continue;
    const cat = cats[(i - 1) % cats.length].id;
    const landscape = cat === "pc";
    const seed = `${event.key}-${cat}-${i}-${stamp}`;
    const w = landscape ? 1280 : 720;
    const h = landscape ? 720 : 1280;
    doc.submissions.push({
      id: crypto.randomBytes(8).toString("hex"),
      userId,
      displayName: `Demo ${i}`,
      avatarUrl: "",
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`,
      category: cat,
      likes: Math.floor(Math.random() * 12),
      createdAt: new Date(),
    });
    added++;
  }
  await doc.save();
  return {
    ok: true,
    status: 200,
    added,
    removed,
    submissionCount: (doc.submissions || []).length,
    message: added
      ? `Caricate ${added} foto demo${removed ? ` (rimosse ${removed} vecchie)` : ""} · ${cats.map((c) => c.label).join(" + ")}.`
      : "Nessuna demo aggiunta.",
  };
}

/** Staff: rimuove solo le submission demo*. */
async function clearDemo(client, { eventKey, accessToken } = {}) {
  const event = getEvent(eventKey);
  if (!event) return { ok: false, status: 404, error: "unknown_event", message: "Contest non trovato." };
  const staff = await isStaffPreview(client, accessToken);
  if (!staff) return { ok: false, status: 403, error: "forbidden", message: "Solo staff." };
  const doc = await getOrCreateDoc(event.key);
  const before = (doc.submissions || []).length;
  doc.submissions = (doc.submissions || []).filter((s) => !String(s.userId || "").startsWith("demo"));
  /* pulisci voti verso id rimossi */
  const keep = new Set(doc.submissions.map((s) => s.id));
  if (doc.votes && typeof doc.votes === "object") {
    for (const vid of Object.keys(doc.votes)) {
      const leaf = doc.votes[vid];
      if (!leaf || typeof leaf !== "object") continue;
      for (const sid of Object.keys(leaf)) {
        if (!keep.has(sid)) delete leaf[sid];
      }
    }
    doc.markModified("votes");
  }
  const removed = before - doc.submissions.length;
  if (removed) doc.markModified("submissions");
  await doc.save();
  return {
    ok: true,
    status: 200,
    removed,
    submissionCount: doc.submissions.length,
    message: removed ? `Rimosse ${removed} foto demo.` : "Nessuna demo da rimuovere.",
  };
}

module.exports = {
  EVENTS,
  normalizeHeaderSecret,
  getContestStatus,
  listEvents,
  submitEntry,
  getSwipeFeed,
  castSwipe,
  getLeaderboard,
  deleteEntry,
  replaceEntry,
  serveContestFile,
  setPublicOpen,
  seedDemo,
  clearDemo,
};
