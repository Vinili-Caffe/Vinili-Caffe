// Transcript ticket: GET /ticket-transcript/:token (ticketTranscriptHttp.js)
// Richiede Bearer Discord; risponde HTML (o testo) + header X-Ticket-*.

export type TranscriptMeta = {
  number: string;
  userTag: string;
  type: string;
};

export type TranscriptResult =
  | { ok: true; html: string; meta: TranscriptMeta }
  | { ok: false; status: number; message: string; needLogin?: boolean };

const TOKEN_RE = /^[a-f0-9]{64}$/;

export function readTranscriptToken(search: string): string {
  try {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const t = String(q.get("t") || q.get("token") || "")
      .trim()
      .toLowerCase();
    return TOKEN_RE.test(t) ? t : "";
  } catch {
    return "";
  }
}

function decodeHeader(value: string | null): string {
  try {
    return decodeURIComponent(String(value || "").trim());
  } catch {
    return String(value || "").trim();
  }
}

export async function loadTranscript(tokenParam: string, accessToken: string): Promise<TranscriptResult> {
  try {
    const r = await fetch(`/ticket-transcript/${encodeURIComponent(tokenParam)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/html, application/json;q=0.9, */*;q=0.8",
      },
      credentials: "omit",
      cache: "no-store",
    });

    if (r.status === 401) {
      return { ok: false, status: 401, message: "Sessione Discord scaduta. Accedi di nuovo.", needLogin: true };
    }
    if (r.status === 403) {
      return {
        ok: false,
        status: 403,
        message: "Accesso negato: non sei l’autore del ticket e non hai un ruolo staff adatto.",
      };
    }
    if (r.status === 410) {
      return { ok: false, status: 410, message: "Questo transcript è scaduto." };
    }
    if (r.status === 404) {
      const detail = String(await r.text().catch(() => "")).trim();
      if (/non disponibile|rimosso|assente/i.test(detail)) {
        return { ok: false, status: 404, message: "File transcript non disponibile sul server." };
      }
      if (detail && detail.length < 180 && !/</.test(detail)) {
        return { ok: false, status: 404, message: detail };
      }
      return { ok: false, status: 404, message: "Transcript non trovato." };
    }
    if (!r.ok) {
      return { ok: false, status: r.status, message: "Impossibile caricare il transcript. Riprova." };
    }

    const html = await r.text();
    const meta: TranscriptMeta = {
      number: String(r.headers.get("X-Ticket-Number") || "").trim(),
      userTag: decodeHeader(r.headers.get("X-Ticket-User-Tag")),
      type: String(r.headers.get("X-Ticket-Type") || "").trim(),
    };
    return { ok: true, html, meta };
  } catch {
    return { ok: false, status: 0, message: "Errore di rete. Riprova." };
  }
}

/** Se l’HTML è solo un fallback testuale, estrai il markdown Discord per DiscordContent. */
export function extractPlainTranscript(html: string): string | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  if (/chatlog|discordchatexporter|message[-_]group/i.test(trimmed.slice(0, 8192))) return null;
  const pre = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) {
    const text = pre[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return text.trim() || null;
  }
  if (!/</.test(trimmed) || /^<!DOCTYPE/i.test(trimmed) === false) {
    if (!/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  }
  return null;
}
