/**
 * Music Quiz in diretta: legge la chat della live in sola lettura.
 * Twitch: IRC anonimo. YouTube / Kick: polling sul server (YOUTUBE_API_KEY / API pubblica Kick).
 */

export type ChatMessage = { user: string; text: string; at: number };
export type ChatStatus = "connecting" | "connected" | "error" | "closed";
export type StreamPlatform = "twitch" | "youtube" | "kick";

/** Nome del canale da quello che scrive lo streamer: «Nome», «@nome», «twitch.tv/nome» o il link intero. */
export function twitchChannel(input: string) {
  const s = String(input || "").trim();
  const m = s.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
  const name = (m ? m[1] : s.replace(/^@/, "")) || "";
  return /^[A-Za-z0-9_]{3,25}$/.test(name) ? name.toLowerCase() : "";
}

export function youtubeChannel(input: string) {
  const s = String(input || "").trim();
  if (!s) return "";
  const watch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/))([A-Za-z0-9_-]{6,})/i);
  if (watch) return watch[1]!;
  const channel = s.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i);
  if (channel) return channel[1]!;
  const handle = s.match(/youtube\.com\/@([A-Za-z0-9._-]{2,})/i);
  if (handle) return handle[1]!;
  if (/^UC[\w-]{20,}$/.test(s) || /^[A-Za-z0-9_-]{6,}$/.test(s.replace(/^@/, ""))) return s.replace(/^@/, "");
  return s.replace(/^@/, "").trim();
}

export function kickChannel(input: string) {
  const s = String(input || "").trim();
  const m = s.match(/kick\.com\/([A-Za-z0-9_-]{2,25})/i);
  const name = (m ? m[1] : s.replace(/^@/, "")).toLowerCase();
  return /^[a-z0-9_-]{2,25}$/.test(name) ? name : "";
}

/** «1», «!1», «1.», «1)»: la risposta di uno spettatore (0-3), o null se il messaggio non è una risposta. */
export function parseAnswer(text: string): number | null {
  const m = String(text || "").trim().match(/^!?\s*([1-4])\s*[.)!]?$/);
  return m ? Number(m[1]) - 1 : null;
}

function tagValue(tags: string, key: string) {
  const m = tags.match(new RegExp(`(?:^|;)${key}=([^;]*)`));
  return m ? m[1]!.replace(/\\s/g, " ") : "";
}

/** Si collega alla chat di un canale Twitch; riprova da solo se la connessione cade. Ritorna la funzione per chiudere. */
export function connectTwitch(channel: string, onMessage: (m: ChatMessage) => void, onStatus: (s: ChatStatus) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer = 0;

  const open = () => {
    onStatus("connecting");
    ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.onopen = () => {
      ws!.send("CAP REQ :twitch.tv/tags");
      ws!.send("PASS SCHMOOPIIE");
      ws!.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws!.send(`JOIN #${channel}`);
    };
    ws.onmessage = (ev) => {
      for (const line of String(ev.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws?.send(line.replace("PING", "PONG"));
          continue;
        }
        if (/ 366 /.test(line)) {
          retry = 0;
          onStatus("connected");
          continue;
        }
        const m = line.match(/^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (!m) continue;
        const user = tagValue(m[1] || "", "display-name") || m[2]!;
        onMessage({ user, text: m[3]!, at: performance.now() });
      }
    };
    ws.onerror = () => onStatus("error");
    ws.onclose = () => {
      if (closed) return onStatus("closed");
      onStatus("connecting");
      retry += 1;
      timer = window.setTimeout(open, Math.min(10_000, 800 * retry));
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}

type PollMsg = { id: string; user: string; text: string; at?: number };

async function pollJson(path: string, token: string, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  const r = await fetch(`/webhooks/site-music-quiz/stream-chat/${path}?${q}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await r.json().catch(() => null)) as any;
  return { ok: r.ok && data?.ok, status: r.status, data };
}

/** YouTube Live chat via API key sul server. */
export function connectYoutube(
  channel: string,
  token: string,
  onMessage: (m: ChatMessage) => void,
  onStatus: (s: ChatStatus) => void,
  onError?: (message: string) => void,
) {
  let closed = false;
  let timer = 0;
  let liveChatId = "";
  let pageToken = "";
  let fail = 0;

  const tick = async () => {
    if (closed) return;
    onStatus(liveChatId ? "connected" : "connecting");
    try {
      const params: Record<string, string> = {};
      if (liveChatId) {
        params.liveChatId = liveChatId;
        if (pageToken) params.pageToken = pageToken;
      } else {
        params.channel = channel;
      }
      const { ok, status, data } = await pollJson("youtube", token, params);
      if (closed) return;
      if (!ok) {
        fail += 1;
        onStatus("error");
        onError?.(String(data?.message || "YouTube non risponde."));
        /* canale sbagliato, non in diretta o chiave mancante: riprovare consumerebbe solo la quota di YouTube */
        if (status >= 400 && status < 500) return;
        timer = window.setTimeout(tick, Math.min(30_000, 3000 * fail));
        return;
      }
      fail = 0;
      liveChatId = String(data.liveChatId || liveChatId);
      pageToken = String(data.pageToken || pageToken);
      onStatus("connected");
      for (const m of (data.messages || []) as PollMsg[]) {
        onMessage({ user: m.user, text: m.text, at: performance.now() });
      }
      timer = window.setTimeout(tick, Math.max(1500, Number(data.pollingMs) || 4000));
    } catch {
      if (closed) return;
      fail += 1;
      onStatus("error");
      timer = window.setTimeout(tick, Math.min(12_000, 1500 * fail));
    }
  };

  void tick();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    onStatus("closed");
  };
}

/** Kick chat via API pubblica (polling messaggi recenti sul server). */
export function connectKick(
  channel: string,
  token: string,
  onMessage: (m: ChatMessage) => void,
  onStatus: (s: ChatStatus) => void,
  onError?: (message: string) => void,
) {
  let closed = false;
  let timer = 0;
  let sinceAt = "";
  let fail = 0;
  let primed = false;

  const tick = async () => {
    if (closed) return;
    onStatus(primed ? "connected" : "connecting");
    try {
      const params: Record<string, string> = { channel };
      if (sinceAt) params.sinceAt = sinceAt;
      const { ok, status, data } = await pollJson("kick", token, params);
      if (closed) return;
      if (!ok) {
        fail += 1;
        onStatus("error");
        onError?.(String(data?.message || "Kick non risponde."));
        /* canale inesistente: inutile riprovare */
        if (status >= 400 && status < 500) return;
        timer = window.setTimeout(tick, Math.min(30_000, 3000 * fail));
        return;
      }
      fail = 0;
      primed = true;
      sinceAt = String(data.sinceAt || sinceAt);
      onStatus("connected");
      for (const m of (data.messages || []) as PollMsg[]) {
        onMessage({ user: m.user, text: m.text, at: performance.now() });
      }
      timer = window.setTimeout(tick, Math.max(1500, Number(data.pollingMs) || 2500));
    } catch {
      if (closed) return;
      fail += 1;
      onStatus("error");
      timer = window.setTimeout(tick, Math.min(12_000, 1500 * fail));
    }
  };

  void tick();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    onStatus("closed");
  };
}
