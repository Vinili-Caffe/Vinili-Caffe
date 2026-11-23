/**
 * Music Quiz «In diretta»: chat YouTube (YOUTUBE_API_KEY, API ufficiale) e Kick (API ufficiale, vedi siteMusicQuizKick).
 * Solo lettura, membri del server.
 */
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");

const YT_KEY = () => String(process.env.YOUTUBE_API_KEY || "").trim();

type ChatMsg = { id: string; user: string; text: string; at: number };

function parseYoutubeInput(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return { kind: "empty" as const };
  const watch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/))([A-Za-z0-9_-]{6,})/i);
  if (watch) return { kind: "video" as const, id: watch[1]! };
  const channel = s.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i);
  if (channel) return { kind: "channel" as const, id: channel[1]! };
  const handle = s.match(/youtube\.com\/@([A-Za-z0-9._-]{2,})/i) || s.match(/^@?([A-Za-z0-9._-]{2,})$/);
  if (handle) return { kind: "handle" as const, id: handle[1]!.replace(/^@/, "") };
  if (/^UC[\w-]{20,}$/.test(s)) return { kind: "channel" as const, id: s };
  return { kind: "handle" as const, id: s.replace(/^@/, "") };
}

function parseKickSlug(raw: string) {
  const s = String(raw || "").trim();
  const m = s.match(/kick\.com\/([A-Za-z0-9_-]{2,25})/i);
  const slug = (m ? m[1] : s.replace(/^@/, "")).toLowerCase();
  return /^[a-z0-9_-]{2,25}$/.test(slug) ? slug : "";
}

/** motivo dell'errore di Google, in italiano (senza mai riportare la chiave) */
let lastYoutubeProblem = "";
function youtubeProblem(reason: string) {
  if (/keyInvalid|API_KEY_INVALID|badRequest/i.test(reason)) return "La chiave di YouTube non è valida.";
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) return "Nel progetto Google della chiave non è attiva la YouTube Data API v3.";
  if (/quota/i.test(reason)) return "YouTube ha esaurito la quota di oggi: riprova domani.";
  if (/ipRefererBlocked|REFERRER_BLOCKED|IP_ADDRESS_BLOCKED/i.test(reason)) return "La chiave di YouTube è limitata ad altri siti o indirizzi: va permesso anche il server.";
  if (/API_KEY_SERVICE_BLOCKED/i.test(reason)) return "La chiave di YouTube è limitata ad altre API: va aggiunta la YouTube Data API v3.";
  if (/forbidden|PERMISSION_DENIED|ACCESS_DENIED/i.test(reason)) {
    return "YouTube rifiuta la chiave: nel progetto Google controlla che la YouTube Data API v3 sia attiva e che la chiave possa usarla.";
  }
  return "";
}

/* La chiave YouTube è limitata all'indirizzo IPv4 della VPS, ma verso Google la VPS uscirebbe in IPv6
   (che Google vede come un altro indirizzo e rifiuta): le richieste a YouTube escono sempre in IPv4. */
const https = require("https") as typeof import("https");
function getIPv4(url: URL): Promise<{ status: number; body: any } | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { family: 4, timeout: 15_000, headers: { Accept: "application/json" } }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let body: any = null;
        try {
          body = JSON.parse(raw);
        } catch {
          body = null;
        }
        resolve({ status: Number(res.statusCode || 0), body });
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

async function ytJson(url: URL) {
  const res = await getIPv4(url);
  if (!res || res.status < 200 || res.status >= 300) {
    const err = res ? `yt_${res.status}` : "yt_network";
    const body: any = res ? res.body : null;
    const reason = [body?.error?.errors?.[0]?.reason, body?.error?.status, ...(body?.error?.details || []).map((d: any) => d?.reason)].filter(Boolean).join(",");
    lastYoutubeProblem = youtubeProblem(reason);
    /* quale chiamata (senza la chiave): videos, search, channels o liveChat/messages */
    global.logger?.warn?.(`[music-quiz] youtube api ${url.pathname.replace("/youtube/v3/", "")} ${err} ${reason}`.trim());
    return { ok: false as const, error: err, data: null as any };
  }
  lastYoutubeProblem = "";
  return { ok: true as const, data: res.body, error: "" };
}

async function resolveYoutubeChannelId(handleOrId: string): Promise<string | null> {
  const raw = String(handleOrId || "").trim().replace(/^@/, "");
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;
  const key = YT_KEY();
  if (!key || !raw) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id");
  url.searchParams.set("forHandle", "@" + raw);
  url.searchParams.set("key", key);
  const r = await ytJson(url);
  const id = String(r.data?.items?.[0]?.id || "").trim();
  return id || null;
}

/* la ricerca della diretta costa 100 unità di quota YouTube (su 10.000 al giorno, condivise con gli avvisi delle live):
   il risultato resta in memoria 10 minuti, così ricollegarsi o più partite di fila non la consumano */
const liveCache = new Map<string, { at: number; value: { liveChatId: string; title: string } }>();
const LIVE_CACHE_MS = 10 * 60_000;

async function findYoutubeLiveChatId(input: string): Promise<{ liveChatId: string; title: string } | { error: string; message: string }> {
  const cacheKey = String(input || "").trim().toLowerCase();
  const hit = liveCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LIVE_CACHE_MS) return hit.value;
  const found = await findYoutubeLiveChatIdFresh(input);
  if (!("error" in found)) {
    liveCache.set(cacheKey, { at: Date.now(), value: found });
    if (liveCache.size > 200) liveCache.delete(liveCache.keys().next().value!);
  }
  return found;
}

async function findYoutubeLiveChatIdFresh(input: string): Promise<{ liveChatId: string; title: string } | { error: string; message: string }> {
  const key = YT_KEY();
  if (!key) return { error: "missing_youtube_key", message: "Manca YOUTUBE_API_KEY sul server." };
  const parsed = parseYoutubeInput(input);
  if (parsed.kind === "empty") return { error: "missing_channel", message: "Scrivi il canale o il link della diretta YouTube." };

  let videoId = parsed.kind === "video" ? parsed.id : "";
  if (!videoId) {
    const channelId =
      parsed.kind === "channel" ? parsed.id : await resolveYoutubeChannelId(parsed.id);
    if (!channelId) return { error: "channel_not_found", message: "Non trovo quel canale YouTube." };
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.searchParams.set("part", "snippet");
    search.searchParams.set("channelId", channelId);
    search.searchParams.set("eventType", "live");
    search.searchParams.set("type", "video");
    search.searchParams.set("maxResults", "1");
    search.searchParams.set("key", key);
    const s = await ytJson(search);
    videoId = String(s.data?.items?.[0]?.id?.videoId || "").trim();
    if (!videoId) {
      return { error: "not_live", message: "Quel canale non è in diretta adesso." };
    }
  }

  const videos = new URL("https://www.googleapis.com/youtube/v3/videos");
  videos.searchParams.set("part", "snippet,liveStreamingDetails");
  videos.searchParams.set("id", videoId);
  videos.searchParams.set("key", key);
  const v = await ytJson(videos);
  const item = v.data?.items?.[0];
  const liveChatId = String(item?.liveStreamingDetails?.activeLiveChatId || "").trim();
  if (!liveChatId) {
    return { error: "no_chat", message: "La diretta non ha una chat attiva (o è finita)." };
  }
  return { liveChatId, title: String(item?.snippet?.title || "Diretta YouTube").slice(0, 120) };
}

async function pollYoutubeChat(liveChatId: string, pageToken: string) {
  const key = YT_KEY();
  const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("part", "snippet,authorDetails");
  url.searchParams.set("maxResults", "200");
  url.searchParams.set("key", key);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const r = await ytJson(url);
  if (!r.ok) {
    /* chat chiusa (diretta finita) o quota esaurita: messaggi chiari invece di un errore generico */
    const ended = r.error === "yt_403" || r.error === "yt_404";
    return {
      ok: false as const,
      error: r.error || "yt_error",
      message: ended ? "La chat della diretta non è disponibile: la live è finita o YouTube ha esaurito la quota di oggi." : "YouTube non risponde sulla chat.",
    };
  }
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  const messages: ChatMsg[] = [];
  for (const it of items) {
    const type = String(it?.snippet?.type || "");
    if (type && type !== "textMessageEvent") continue;
    const text = String(it?.snippet?.displayMessage || it?.snippet?.textMessageDetails?.messageText || "").trim();
    if (!text) continue;
    const user = String(it?.authorDetails?.displayName || "viewer").trim() || "viewer";
    const id = String(it?.id || `${user}:${text}:${it?.snippet?.publishedAt || ""}`);
    const at = Date.parse(String(it?.snippet?.publishedAt || "")) || Date.now();
    messages.push({ id, user, text, at });
  }
  return {
    ok: true as const,
    liveChatId,
    pageToken: String(r.data?.nextPageToken || ""),
    pollingMs: Math.max(1500, Math.min(10_000, Number(r.data?.pollingIntervalMillis) || 4000)),
    messages,
  };
}

/** Avvia / continua il polling YouTube. Query: channel (handle/link/video), liveChatId?, pageToken? */
async function handleMusicQuizYoutubeChatGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    let liveChatId = String(req.query?.liveChatId || "").trim();
    const pageToken = String(req.query?.pageToken || "").trim();
    const channel = String(req.query?.channel || req.query?.q || "").trim();
    let title = "";
    if (!liveChatId) {
      const found = await findYoutubeLiveChatId(channel);
      if ("error" in found) {
        /* se il problema è la chiave o la quota lo si dice, invece di «canale non trovato» */
        if (lastYoutubeProblem) return res.status(503).json({ ok: false, error: "youtube_api", message: lastYoutubeProblem });
        return res.status(404).json({ ok: false, error: found.error, message: found.message });
      }
      liveChatId = found.liveChatId;
      title = found.title;
    }
    const polled = await pollYoutubeChat(liveChatId, pageToken);
    if (!polled.ok) return res.status(502).json({ ok: false, error: polled.error, message: polled.message });
    return res.json({
      ok: true,
      platform: "youtube",
      liveChatId,
      title,
      pageToken: polled.pageToken,
      pollingMs: polled.pollingMs,
      messages: pageToken ? polled.messages : [], /* al primo giro: solo collega, senza risposte vecchie */
    });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] youtube chat:", err?.message || err);
    return res.status(500).json({ ok: false, error: "youtube_chat_error", message: "Errore chat YouTube." });
  }
}

/** Kick con l'API ufficiale: iscrizione alla chat del canale, poi i messaggi nuovi arrivati al webhook. Query: channel, sinceAt? */
async function handleMusicQuizKickChatGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    const kick = require("./siteMusicQuizKick") as typeof import("./siteMusicQuizKick");
    if (!kick.kickConfigured()) {
      return res.status(503).json({ ok: false, error: "kick_off", message: "Kick non è configurato sul server." });
    }
    const slug = parseKickSlug(String(req.query?.channel || req.query?.q || ""));
    if (!slug) {
      return res.status(400).json({ ok: false, error: "missing_channel", message: "Scrivi il nome del canale Kick, per esempio «xqc»." });
    }
    const ch = await kick.kickBroadcaster(slug);
    if (!ch) return res.status(404).json({ ok: false, error: "channel_not_found", message: "Non trovo quel canale Kick." });
    await kick.ensureChatSubscription(ch.id);
    /* primo giro: si parte da adesso, niente messaggi vecchi */
    const sinceAt = Number(req.query?.sinceAt || 0) || 0;
    const messages = sinceAt ? kick.kickMessagesSince(ch.id, sinceAt) : [];
    const lastAt = messages.length ? messages[messages.length - 1]!.at : sinceAt || Date.now();
    return res.json({ ok: true, platform: "kick", slug, live: ch.live, sinceAt: String(lastAt), pollingMs: 1500, messages });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] kick chat:", err?.message || err);
    if (/_429_/.test(String(err?.message || ""))) {
      return res.status(503).json({ ok: false, error: "kick_rate_limit", message: "Kick ha ricevuto troppi collegamenti: riprova tra un minuto." });
    }
    return res.status(502).json({ ok: false, error: "kick_chat_error", message: "Kick non risponde, riprova tra poco." });
  }
}

export = {
  handleMusicQuizYoutubeChatGet,
  handleMusicQuizKickChatGet,
  parseKickSlug,
  parseYoutubeInput,
};
