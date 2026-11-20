/**
 * Bacheche, schede bot:
 * - chiave API con cui il bot del proprietario manda numero di server e comandi (come Top.gg);
 * - comandi modificabili a mano dalla pagina Gestisci;
 * - server di supporto collegato (una scheda server della vetrina che il proprietario gestisce);
 * - per il bot di Vinili & Caffè, numero di server e comandi letti direttamente da Discord.
 */
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, featureGate, emitBoardsChanged, mainBotAppId } = require("./boardReviews") as typeof import("./boardReviews");
const { sanitizeText, snowflakeOk, preferAnimatedDiscordMediaUrl } = require("./boardSanitize") as typeof import("./boardSanitize");

const MAX_COMMANDS = 150;
const POST_MIN_INTERVAL_MS = 60_000;
const OWN_SYNC_MS = 30 * 60_000;

type BotCommand = { name: string; description: string; type: "slash" | "user" | "message" | "prefix"; usage: string; category: string };

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

/** Comandi da qualunque forma (JSON di Discord o lista a mano) a una lista pulita. */
function sanitizeCommands(raw?): BotCommand[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: BotCommand[] = [];
  const seen = new Set<string>();
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const name = sanitizeText(c.name, 64).replace(/^\/+/, "").trim();
    if (!name) continue;
    /* tipo Discord: 1 slash, 2 utente, 3 messaggio */
    const t = Number(c.type);
    const type: BotCommand["type"] =
      c.type === "prefix" ? "prefix" : t === 2 || c.type === "user" ? "user" : t === 3 || c.type === "message" ? "message" : "slash";
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    /* uso: dalle opzioni Discord se non c'è già */
    let usage = sanitizeText(c.usage, 200);
    if (!usage && Array.isArray(c.options) && type === "slash") {
      usage = c.options
        .filter((o: any) => o && o.name && ![1, 2].includes(Number(o.type)))
        .map((o: any) => (o.required ? `<${o.name}>` : `[${o.name}]`))
        .join(" ");
    }
    out.push({ name, description: sanitizeText(c.description, 200), type, usage, category: sanitizeText(c.category, 40) });
    if (out.length >= MAX_COMMANDS) break;
  }
  return out;
}

async function loadOwnedBot(client?, accessToken?, listingId?) {
  const gate = featureGate(client);
  if (!gate.ok) return { err: gate };
  const auth: any = await resolveBoardsUser(accessToken);
  if (!auth.ok) return { err: auth };
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { err: { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." } };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { err: { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." } };
  if (String(doc.userId) !== String(auth.userId)) return { err: { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." } };
  if (String(doc.boardKind || "") !== "bot") return { err: { ok: false, status: 400, error: "not_bot", message: "Solo per le schede bot." } };
  return { auth, doc };
}

function apiInfo(doc?) {
  const a = doc?.boardApi && typeof doc.boardApi === "object" ? doc.boardApi : {};
  return {
    hasKey: Boolean(a.keyHash),
    keyHint: String(a.keyHint || ""),
    createdAt: a.createdAt || null,
    lastPostAt: a.lastPostAt || null,
    serverCount: Number(doc?.boardStats?.serverCount) || 0,
    serverCountAt: doc?.boardStats?.serverCountAt || null,
    commandsCount: Array.isArray(doc?.boardCommands) ? doc.boardCommands.length : 0,
    own: String(doc?.boardDiscordId || "") === mainBotAppId(),
  };
}

/* ── pagina Gestisci: chiave e comandi ── */

async function getBotApi(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwnedBot(client, payload.accessToken, payload.listingId);
  if (err) return err;
  return { ok: true, status: 200, api: apiInfo(doc), commands: Array.isArray(doc.boardCommands) ? doc.boardCommands : [] };
}

/** Nuova chiave: si vede una volta sola, salviamo solo l'hash. */
async function regenerateBotApiKey(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwnedBot(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const key = `vcb_${String(doc._id)}_${crypto.randomBytes(24).toString("base64url")}`;
  doc.boardApi = { ...(doc.boardApi || {}), keyHash: hashKey(key), keyHint: key.slice(-4), createdAt: new Date().toISOString() };
  doc.markModified("boardApi");
  await doc.save();
  return { ok: true, status: 200, key, api: apiInfo(doc), message: "Nuova chiave creata: copiala ora, poi non si vedrà più." };
}

async function saveBotCommands(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwnedBot(client, payload.accessToken, payload.listingId);
  if (err) return err;
  doc.boardCommands = sanitizeCommands(payload.commands);
  doc.markModified("boardCommands");
  await doc.save();
  emitBoardsChanged("patch", { listingId: String(doc._id), slug: String(doc.boardSlug || ""), kind: "bot" });
  return { ok: true, status: 200, commands: doc.boardCommands, message: `Comandi salvati: ${doc.boardCommands.length}.` };
}

/* ── API pubblica per i bot: POST /webhooks/site-boards/api/bots/stats ── */

const lastPost = new Map<string, number>();
async function postBotStats(client?, payload: Record<string, any> = {}) {
  const key = String(payload.key || "").trim();
  const m = key.match(/^vcb_([a-f0-9]{24})_[A-Za-z0-9_-]{20,}$/);
  if (!m) return { ok: false, status: 401, error: "invalid_key", message: "Chiave API non valida." };
  const doc: any = await SiteDocument.findOne({ _id: m[1], docType: BL, boardKind: "bot" });
  if (!doc || !doc.boardApi?.keyHash || doc.boardApi.keyHash !== hashKey(key)) {
    return { ok: false, status: 401, error: "invalid_key", message: "Chiave API non valida." };
  }
  const id = String(doc._id);
  const now = Date.now();
  if (now - (lastPost.get(id) || 0) < POST_MIN_INTERVAL_MS) {
    return { ok: false, status: 429, error: "rate_limited", message: "Al massimo una richiesta al minuto.", retryAfterSec: 60 };
  }
  lastPost.set(id, now);
  const updated: string[] = [];
  const count = Math.floor(Number(payload.serverCount ?? payload.server_count ?? payload.guilds));
  if (Number.isFinite(count) && count >= 0 && count <= 100_000_000) {
    doc.boardStats = { ...(doc.boardStats || {}), serverCount: count, serverCountAt: new Date(now).toISOString() };
    doc.markModified("boardStats");
    updated.push("serverCount");
  }
  if (Array.isArray(payload.commands)) {
    doc.boardCommands = sanitizeCommands(payload.commands);
    doc.markModified("boardCommands");
    updated.push("commands");
  }
  doc.boardApi = { ...(doc.boardApi || {}), lastPostAt: new Date(now).toISOString() };
  doc.markModified("boardApi");
  await doc.save();
  if (updated.length) emitBoardsChanged("patch", { listingId: id, slug: String(doc.boardSlug || ""), kind: "bot" });
  return { ok: true, status: 200, updated };
}

/* ── server di supporto ── */

async function listSupportCandidates(client?, payload: Record<string, any> = {}) {
  const { err } = await loadOwnedBot(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const { fetchManageableGuilds } = require("./boardInvites") as typeof import("./boardInvites");
  const list: any = await fetchManageableGuilds(payload.accessToken);
  if (!list?.ok) return { ok: false, status: Number(list?.status) || 403, error: list?.error || "guilds_failed", message: list?.message || "Impossibile leggere i tuoi server." };
  const ids = (Array.isArray(list.guilds) ? list.guilds : []).map((g: any) => String(g?.id || "")).filter(Boolean);
  const rows: any[] = ids.length
    ? await SiteDocument.find({ docType: BL, boardKind: "server", status: "approved", boardDiscordId: { $in: ids } })
        .select({ title: 1, boardSlug: 1, boardIconUrl: 1, boardDiscordId: 1 })
        .limit(100)
        .lean()
    : [];
  return {
    ok: true,
    status: 200,
    servers: rows.map((r) => ({ id: String(r._id), name: String(r.title || ""), slug: String(r.boardSlug || ""), iconUrl: preferAnimatedDiscordMediaUrl(String(r.boardIconUrl || "")) })),
  };
}

async function setSupportServer(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwnedBot(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const target = String(payload.serverListingId || "").trim();
  if (!target) {
    doc.boardSupportListingId = "";
    await doc.save();
    return { ok: true, status: 200, support: null, message: "Server di supporto scollegato." };
  }
  if (!mongoose.isValidObjectId(target)) return { ok: false, status: 400, error: "invalid_id", message: "Scheda server non valida." };
  /* stesso controllo dell'elenco: deve essere un server in vetrina che gestisci */
  const cand: any = await listSupportCandidates(client, payload);
  if (!cand.ok) return cand;
  const pick = (cand.servers || []).find((s: any) => s.id === target);
  if (!pick) return { ok: false, status: 403, error: "not_manageable", message: "Puoi collegare solo un server in vetrina che gestisci su Discord." };
  doc.boardSupportListingId = target;
  await doc.save();
  emitBoardsChanged("patch", { listingId: String(doc._id), slug: String(doc.boardSlug || ""), kind: "bot" });
  return { ok: true, status: 200, support: pick, message: `Collegato «${pick.name}» come server di supporto.` };
}

/* ── lettura pubblica: server di supporto + dati del bot di Vinili & Caffè ── */

const ownSyncAt = new Map<string, number>();
async function syncOwnBot(client?, listing?) {
  const id = String(listing?.discordId || "");
  if (!id || id !== mainBotAppId() || !client?.rest) return listing;
  const last = ownSyncAt.get(id) || 0;
  if (Date.now() - last < OWN_SYNC_MS) return listing;
  ownSyncAt.set(id, Date.now());
  try {
    const app: any = await client.rest.get(Routes.currentApplication()).catch(() => null);
    const cmds: any = await client.rest.get(Routes.applicationCommands(id)).catch(() => null);
    const $set: Record<string, any> = {};
    const count = Number(app?.approximate_guild_count);
    if (Number.isFinite(count) && count > 0) {
      $set["boardStats.serverCount"] = count;
      $set["boardStats.serverCountAt"] = new Date().toISOString();
      listing.serverCount = count;
    }
    if (Array.isArray(cmds) && cmds.length) {
      const commands = sanitizeCommands(cmds);
      $set.boardCommands = commands;
      listing.commands = commands;
    }
    if (Object.keys($set).length) await SiteDocument.updateOne({ _id: listing.id, docType: BL }, { $set }).catch(() => null);
  } catch (_) {}
  return listing;
}

/** Aggiunge alla scheda bot il server di supporto collegato (se ancora in vetrina). */
async function enrichBotListing(client?, listing?) {
  if (!listing || String(listing.kind || "") !== "bot") return listing;
  await syncOwnBot(client, listing);
  const sid = String(listing.supportListingId || "");
  if (sid && mongoose.isValidObjectId(sid)) {
    const s: any = await SiteDocument.findOne({ _id: sid, docType: BL, boardKind: "server", status: "approved" })
      .select({ title: 1, boardSlug: 1, boardIconUrl: 1, boardInviteUrl: 1, boardStats: 1 })
      .lean()
      .catch(() => null);
    listing.supportServer = s
      ? {
          id: String(s._id),
          name: String(s.title || ""),
          slug: String(s.boardSlug || ""),
          iconUrl: preferAnimatedDiscordMediaUrl(String(s.boardIconUrl || "")),
          inviteUrl: String(s.boardInviteUrl || ""),
          members: Number(s.boardStats?.members) || 0,
        }
      : null;
  }
  return listing;
}

/** Nome e avatar di un bot dal suo ID (per compilare il modulo). */
async function botDefaults(client?, payload: Record<string, any> = {}) {
  const auth: any = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.botId || "").trim();
  if (!snowflakeOk(id)) return { ok: false, status: 400, error: "invalid_id", message: "Client ID non valido." };
  const user: any = await client?.users?.fetch?.(id).catch(() => null);
  if (!user) return { ok: false, status: 404, error: "not_found", message: "Bot non trovato: controlla il Client ID." };
  if (!user.bot) return { ok: false, status: 400, error: "not_bot", message: "Questo ID è di un utente, non di un bot." };
  return {
    ok: true,
    status: 200,
    name: String(user.username || ""),
    iconUrl: typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 256 }) : "",
  };
}

export = { getBotApi, regenerateBotApiKey, saveBotCommands, postBotStats, listSupportCandidates, setSupportServer, enrichBotListing, botDefaults, sanitizeCommands };
