/**
 * Music Quiz «In diretta» su Kick con l'API ufficiale (https://docs.kick.com).
 *
 * - Token dell'app (KICK_CLIENT_ID / KICK_CLIENT_SECRET, flusso client credentials).
 * - Quando uno streamer collega il suo canale, l'app si iscrive all'evento «chat.message.sent» di quel canale.
 * - Kick manda ogni messaggio della chat al webhook /webhooks/kick/events (indirizzo impostato nell'app su kick.com):
 *   la firma si verifica con la chiave pubblica di Kick, i messaggi restano qualche minuto in memoria.
 * - Il sito legge i messaggi nuovi ogni 1,5 secondi; le iscrizioni non usate da 30 minuti si cancellano
 *   (le app non verificate hanno al massimo 1.000 iscrizioni alla chat).
 */
const crypto = require("crypto") as typeof import("crypto");

const API = "https://api.kick.com/public/v1";
const TOKEN_URL = "https://id.kick.com/oauth/token";
const EVENT = "chat.message.sent";
const KEEP_MESSAGES_MS = 5 * 60_000;
const IDLE_UNSUBSCRIBE_MS = 30 * 60_000;

type ChatMsg = { id: string; user: string; text: string; at: number };

let token = { value: "", until: 0 };
let publicKey = { pem: "", at: 0 };
const channelCache = new Map<string, { at: number; id: number; live: boolean }>();
/** broadcaster → iscrizione e ultimo uso */
const subs = new Map<number, { id: string; lastUsed: number }>();
/* messaggi per iscrizione (Kick manda l'id dell'iscrizione in ogni chiamata): così un id del canale diverso
   tra l'API dei canali e il messaggio non fa perdere nulla */
const buffers = new Map<string, ChatMsg[]>();
const seenIds = new Map<string, number>();

export function kickConfigured() {
  return Boolean(String(process.env.KICK_CLIENT_ID || "").trim() && String(process.env.KICK_CLIENT_SECRET || "").trim());
}

async function appToken(): Promise<string> {
  if (token.value && token.until > Date.now() + 60_000) return token.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: String(process.env.KICK_CLIENT_ID || "").trim(),
    client_secret: String(process.env.KICK_CLIENT_SECRET || "").trim(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) throw new Error(`kick_token_${res.status}`);
  token = { value: String(data.access_token), until: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000 };
  return token.value;
}

async function kickApi(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${await appToken()}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

/** id del broadcaster dal nome del canale (in memoria 10 minuti) */
export async function kickBroadcaster(slug: string): Promise<{ id: number; live: boolean } | null> {
  const hit = channelCache.get(slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  const r = await kickApi(`/channels?slug=${encodeURIComponent(slug)}`);
  const ch = Array.isArray(r.data?.data) ? r.data.data[0] : null;
  const id = Number(ch?.broadcaster_user_id || 0);
  if (!id) return null;
  const out = { at: Date.now(), id, live: Boolean(ch?.stream?.is_live) };
  channelCache.set(slug, out);
  global.logger?.info?.(`[kick] canale ${slug} = ${id} (${out.live ? "in diretta" : "offline"})`);
  return out;
}

/* Le iscrizioni restano su Kick anche quando site-api si riavvia, ma la lista in memoria si perde:
   al primo uso dopo un riavvio si cancellano tutte quelle dell'app. Chi sta giocando si riiscrive da solo
   alla lettura successiva; così non se ne accumulano verso il limite di 1.000 e non arrivano messaggi inutili. */
let startupCleanup: Promise<void> | null = null;
function cleanupOldSubscriptions() {
  if (!startupCleanup) {
    startupCleanup = (async () => {
      const list = await kickApi("/events/subscriptions").catch(() => null);
      const old = (Array.isArray(list?.data?.data) ? list!.data.data : []).filter((s: any) => s?.id && s?.event === EVENT);
      for (const s of old) await kickApi(`/events/subscriptions?id=${encodeURIComponent(String(s.id))}`, { method: "DELETE" }).catch(() => null);
      global.logger?.info?.(`[kick] riavvio: cancellate ${old.length} iscrizioni vecchie`);
    })().catch(() => {});
  }
  return startupCleanup;
}

/**
 * All'avvio del server: le iscrizioni rimaste da prima (in memoria non c'è più nessuna diretta collegata)
 * si cancellano subito, anche se nessuno usa Kick dopo il riavvio. Prima succedeva solo al primo uso,
 * e un'iscrizione di prova poteva restare attiva per sempre.
 */
export function startKickStartupCleanup() {
  if (!kickConfigured()) return;
  const t = setTimeout(() => void cleanupOldSubscriptions(), 20_000);
  (t as any).unref?.();
}

/** l'app è iscritta alla chat di quel canale? se no si iscrive */
export async function ensureChatSubscription(broadcasterId: number) {
  await cleanupOldSubscriptions();
  const known = subs.get(broadcasterId);
  if (known) {
    known.lastUsed = Date.now();
    return known.id;
  }
  const list = await kickApi(`/events/subscriptions?broadcaster_user_id=${broadcasterId}`);
  const existing = (Array.isArray(list.data?.data) ? list.data.data : []).find(
    (s: any) => s?.event === EVENT && Number(s?.broadcaster_user_id) === broadcasterId,
  );
  if (existing?.id) {
    subs.set(broadcasterId, { id: String(existing.id), lastUsed: Date.now() });
    global.logger?.info?.(`[kick] chat di ${broadcasterId}: iscrizione già attiva`);
    return String(existing.id);
  }
  const created = await kickApi("/events/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ broadcaster_user_id: broadcasterId, events: [{ name: EVENT, version: 1 }], method: "webhook" }),
  });
  const row = Array.isArray(created.data?.data) ? created.data.data[0] : null;
  if (!created.ok || !row?.subscription_id) {
    throw new Error(`kick_subscribe_${created.status}_${String(row?.error || created.data?.message || "")}`.slice(0, 160));
  }
  subs.set(broadcasterId, { id: String(row.subscription_id), lastUsed: Date.now() });
  global.logger?.info?.(`[kick] iscritto alla chat di ${broadcasterId}: iscrizione ${row.subscription_id}`);
  return String(row.subscription_id);
}

/** messaggi arrivati dopo `sinceAt` (orario del server) */
export function kickMessagesSince(broadcasterId: number, sinceAt: number): ChatMsg[] {
  const sub = subs.get(broadcasterId);
  if (!sub) return [];
  sub.lastUsed = Date.now();
  return (buffers.get(sub.id) || []).filter((m) => m.at > sinceAt);
}

async function kickPublicKey(force = false) {
  if (!force && publicKey.pem && Date.now() - publicKey.at < 60 * 60_000) return publicKey.pem;
  const res = await fetch(`${API}/public-key`, { signal: AbortSignal.timeout(15_000) });
  const data: any = await res.json().catch(() => null);
  const pem = String(data?.data?.public_key || data?.public_key || "");
  if (pem) publicKey = { pem, at: Date.now() };
  return publicKey.pem;
}

function verifySignature(pem: string, messageId: string, timestamp: string, raw: Buffer, signatureB64: string) {
  try {
    const v = crypto.createVerify("RSA-SHA256");
    v.update(`${messageId}.${timestamp}.`);
    v.update(raw);
    v.end();
    return v.verify(pem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** POST /webhooks/kick/events: Kick manda qui ogni messaggio della chat dei canali a cui l'app è iscritta. */
export async function handleKickWebhookPost(req?: any, res?: any) {
  const messageId = String(req.headers["kick-event-message-id"] || "");
  const timestamp = String(req.headers["kick-event-message-timestamp"] || "");
  const signature = String(req.headers["kick-event-signature"] || "");
  const type = String(req.headers["kick-event-type"] || "");
  const subscriptionId = String(req.headers["kick-event-subscription-id"] || "");
  const raw: Buffer | undefined = req.rawBody;
  if (!messageId || !timestamp || !signature || !raw) return res.status(400).json({ ok: false });

  /* la chiave può cambiare: se la firma non torna si riprova una volta con quella nuova */
  let pem = await kickPublicKey().catch(() => "");
  let valid = Boolean(pem) && verifySignature(pem, messageId, timestamp, raw, signature);
  if (!valid) {
    pem = await kickPublicKey(true).catch(() => "");
    valid = Boolean(pem) && verifySignature(pem, messageId, timestamp, raw, signature);
  }
  if (!valid) return res.status(401).json({ ok: false, error: "bad_signature" });

  /* stesso messaggio mandato due volte: si conta una volta sola */
  if (seenIds.has(messageId)) return res.json({ ok: true });
  seenIds.set(messageId, Date.now());

  const p = req.body || {};
  const broadcasterId = Number(p?.broadcaster?.user_id || 0);
  /* diagnostica: tipo, canale e se il quiz lo sta ascoltando (mai il testo dei messaggi) */
  global.logger?.info?.(
    `[kick webhook] type=${type || "-"} canale=${String(p?.broadcaster?.channel_slug || "-")} broadcaster=${broadcasterId || "-"} iscrizione=${subscriptionId || "-"} nostra=${[...subs.values()].some((x) => x.id === subscriptionId)}`,
  );

  if (type === EVENT) {
    const text = String(p?.content || "").trim();
    if (subscriptionId && text) {
      const list = buffers.get(subscriptionId) || [];
      list.push({
        id: String(p.message_id || messageId),
        user: String(p?.sender?.username || "viewer").slice(0, 40),
        text: text.slice(0, 200),
        at: Date.now(),
      });
      const cutoff = Date.now() - KEEP_MESSAGES_MS;
      buffers.set(subscriptionId, list.filter((m) => m.at > cutoff).slice(-500));
    }
  }
  return res.json({ ok: true });
}

/* pulizia: messaggi vecchi, id già visti, iscrizioni non più usate */
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, at] of seenIds) if (now - at > 10 * 60_000) seenIds.delete(id);
  for (const [b, list] of buffers) {
    const kept = list.filter((m) => now - m.at < KEEP_MESSAGES_MS);
    if (kept.length) buffers.set(b, kept);
    else buffers.delete(b);
  }
  for (const [b, s] of subs) {
    if (now - s.lastUsed < IDLE_UNSUBSCRIBE_MS) continue;
    subs.delete(b);
    void kickApi(`/events/subscriptions?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => null);
  }
}, 60_000);
(cleanup as any).unref?.();
