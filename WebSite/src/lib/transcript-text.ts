// Transcript vecchi salvati solo come testo (Bots: transcriptUtils.createTranscript):
//   Transcript del canale: <nome>
//   [8/31/2026, 6:03:49 PM] Autore#0000: contenuto…
//   [Embed 1]
//   Titolo: …
//   Descrizione: …
//   [Embed image] url | [Embed thumb] url | [Attachment] url | [Sticker] nome url
// Qui diventano messaggi strutturati da mostrare come una chat.

export type TextEmbed = { title: string; description: string; image: string | null; thumbnail: string | null };
export type TextMessage = {
  id: string;
  at: Date | null;
  author: string;
  bot: boolean;
  content: string;
  embeds: TextEmbed[];
  attachments: string[];
  stickers: string[];
};

const HEADER = /^\[(\d{1,2}\/\d{1,2}\/\d{4},?\s+[^\]]+)\]\s(.+?):\s?(.*)$/;

function parseDate(raw: string): Date | null {
  const d = new Date(raw.replace(",", ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBody(lines: string[]): Pick<TextMessage, "content" | "embeds" | "attachments" | "stickers"> {
  const content: string[] = [];
  const embeds: TextEmbed[] = [];
  const attachments: string[] = [];
  const stickers: string[] = [];
  let embed: TextEmbed | null = null;
  let inDesc = false;
  for (const line of lines) {
    if (/^\[Embed \d+\]$/.test(line.trim())) {
      embed = { title: "", description: "", image: null, thumbnail: null };
      embeds.push(embed);
      inDesc = false;
      continue;
    }
    const att = line.match(/^\[Attachment\]\s+(\S+)/);
    if (att) {
      attachments.push(att[1]);
      continue;
    }
    const st = line.match(/^\[Sticker\]\s+(.*)$/);
    if (st) {
      stickers.push(st[1].trim());
      continue;
    }
    if (embed) {
      const img = line.match(/^\[Embed image\]\s+(\S+)/);
      if (img) {
        embed.image = img[1];
        inDesc = false;
        continue;
      }
      const th = line.match(/^\[Embed thumb\]\s+(\S+)/);
      if (th) {
        embed.thumbnail = th[1];
        inDesc = false;
        continue;
      }
      const t = line.match(/^Titolo:\s?(.*)$/);
      if (t && !embed.title && !inDesc) {
        embed.title = t[1];
        continue;
      }
      const d = line.match(/^Descrizione:\s?(.*)$/);
      if (d && !inDesc) {
        embed.description = d[1];
        inDesc = true;
        continue;
      }
      embed.description = embed.description ? `${embed.description}\n${line}` : line;
      continue;
    }
    content.push(line);
  }
  for (const e of embeds) e.description = e.description.replace(/\n+$/g, "");
  return { content: content.join("\n").replace(/^\n+|\n+$/g, ""), embeds, attachments, stickers };
}

/** Il bot salva nel database solo i primi 2000 caratteri del testo e aggiunge "…[troncato]". */
export function isTruncatedTranscript(text: string): boolean {
  return /…\[troncato\]\s*$/.test(String(text || "").trim());
}

export function parseTextTranscript(text: string): { channel: string | null; messages: TextMessage[]; truncated: boolean } | null {
  const truncated = isTruncatedTranscript(text);
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n?…\[troncato\]\s*$/, "")
    .split("\n");
  let channel: string | null = null;
  const first = lines[0]?.match(/^Transcript del canale:\s*(.+)$/);
  if (first) {
    channel = first[1].trim();
    lines.shift();
  }
  const messages: TextMessage[] = [];
  let cur: { head: RegExpMatchArray; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const [, date, author, firstLine] = cur.head;
    const body = parseBody([firstLine, ...cur.body]);
    const tag = author.trim();
    messages.push({
      id: `${messages.length}`,
      at: parseDate(date),
      author: tag.replace(/#\d{1,4}$/, ""),
      /* i bot hanno ancora il discriminatore (#1234); gli utenti no */
      bot: /#\d{4}$/.test(tag) && !/#0000$/.test(tag),
      ...body,
      content: body.content === "*Nessun contenuto messaggio*" ? "" : body.content,
    });
  };
  for (const line of lines) {
    const head = line.match(HEADER);
    if (head) {
      flush();
      cur = { head, body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  flush();
  return messages.length ? { channel, messages, truncated } : null;
}

/** `:nome:` (emoji salvate senza id) → `<:nome:id>` se l'emoji esiste nel server, così si vede l'immagine. */
export function restoreEmojiNames(text: string, byName: Map<string, { id: string; animated?: boolean }>): string {
  if (!byName.size) return text;
  return text.replace(/(^|[^<a-zA-Z0-9_]):([a-zA-Z0-9_~]{2,32}):(?!\d)/g, (m, pre: string, name: string) => {
    const e = byName.get(name) || byName.get(name.toLowerCase());
    return e ? `${pre}<${e.animated ? "a" : ""}:${name}:${e.id}>` : m;
  });
}

/** Dall'HTML che manda il bot: se è il ripiego "solo testo" (niente .msg), restituisce il testo. */
export function extractTextTranscriptFromHtml(html: string): string | null {
  const raw = String(html || "");
  if (!raw || /class="msg"|class='msg'|chatlog|discordchatexporter|message[-_]group/i.test(raw)) return null;
  const pre = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let inner = pre ? pre[1] : bodyMatch ? bodyMatch[1] : raw;
  inner = inner
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const text = inner
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  if (!text) return null;
  if (/^Transcript del canale:/.test(text) || HEADER.test(text.split("\n")[0] || "")) return text;
  return null;
}
