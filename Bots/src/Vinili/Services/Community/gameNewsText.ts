/** Notizie giochi: pulizia e traduzione dei testi. */
const axios = require("axios") as typeof import("axios").default;
const { JUNK_TITLE_RE, normComparable, stripSourceSuffix, isNearTitleDuplicate } = require("./gameNewsDedupe") as typeof import("./gameNewsDedupe");

const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const MYMEMORY_MAX = 450;
const ARTICLE_BRIEF_MAX = 1400;

const MAJOR_RE =
  /\b(patch\s*notes?|patch\s*note|major\s*update|season\s*\d+|nuova\s*stagione|stagione\s*\d+|battle\s*pass|capitolo\s*\d+|chapter\s*\d+|mid[- ]?season|aggiornamento\s*importante|version\s*\d+\.\d+|v\d+\.\d+(\.\d+)?|release\s*notes?|full\s*patch|content\s*update|nuovo\s*aggiornamento)\b/i;
const MINOR_RE =
  /\b(hotfix|hot[- ]?fix|bug\s*fix|maintenance|manutenzione|server\s*status|downtime|known\s*issues?|minor\s*update|piccolo\s*fix|bilanciamento|balance\s*patch|emergency\s*fix|snapshot|pre[- ]?release|beta|experimental)\b/i;

/* Steam news: [img]{STEAM_CLAN_IMAGE}/clanId/hash.png[/img] → CDN (o rimossi dal brief). */
const STEAM_CLAN_IMAGE_BASE = "https://clan.fastly.steamstatic.com/images";

function expandSteamPlaceholders(text?) {
  return String(text || "")
    .replace(/\{STEAM_CLAN_IMAGE\}/gi, STEAM_CLAN_IMAGE_BASE)
    .replace(/\{STEAM_CLAN_LOC_IMAGE\}/gi, STEAM_CLAN_IMAGE_BASE);
}

/** Toglie BBCode Steam + URL immagine clan dal testo (articolo plain Discord). */
function stripSteamMarkup(text?) {
  let t = expandSteamPlaceholders(text);
  /* [img]...[/img] e varianti con attrs */
  t = t.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, " ");
  t = t.replace(/\[url=((?:https?:\/\/)[^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2 $1");
  t = t.replace(/\[url\]((?:https?:\/\/)[^\[]+)\[\/url\]/gi, "$1");
  t = t.replace(
    /\[\/?(?:p|b|i|u|h[1-6]|list|olist|\*|quote|spoiler|code|strike|noparse|previewyoutube|carousel)[^\]]*\]/gi,
    " ",
  );
  /* path/url clan rimasti soli (placeholder non espansi o img già strippati) */
  t = t.replace(/\{STEAM_CLAN_(?:LOC_)?IMAGE\}\/[^\s\[\]<>"']+/gi, " ");
  t = t.replace(
    /https?:\/\/(?:clan\.fastly\.steamstatic\.com\/images|clan\.akamai\.steamstatic\.com\/images|cdn\.cloudflare\.steamstatic\.com\/steamcommunity\/public\/images\/clans|steamcommunity\.com\/economy\/image)\/[^\s\[\]<>"']+/gi,
    " ",
  );
  t = t.replace(/https?:\/\/[^\s\[\]<>"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s\[\]<>"']*)?/gi, " ");
  return t;
}

function stripHtml(html?) {
  return stripSteamMarkup(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Se la prima frase ripete il titolo, tieni il resto (spesso meta/OG). */
function stripLeadingTitleEcho(title?, body?) {
  let text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const t = stripSourceSuffix(String(title || "").replace(/\s+/g, " ").trim());
  if (!t) return text;
  /* match prefisso titolo + punteggiatura */
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^${esc}\\s*[.!?\\-:–—]?\\s*`, "i"), "").trim();
  const parts = text.split(/(?<=[.!?])\s+/);
  if (parts.length >= 2 && isNearTitleDuplicate(t, parts[0]) && parts[0].length < 180) {
    return parts.slice(1).join(" ").trim();
  }
  if (isNearTitleDuplicate(t, text) && text.length > t.length + 50) {
    const nt = normComparable(t);
    const nb = normComparable(text);
    if (nb.startsWith(nt)) {
      const cut = text.slice(t.length).replace(/^[\s.!?\-:–—]+/, "").trim();
      if (cut.length >= 40) return cut;
    }
  }
  return text;
}

function trimBriefAtSentence(text?, maxLen?) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  const cut = raw.slice(0, maxLen);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (dot >= Math.floor(maxLen * 0.45)) return cut.slice(0, dot + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return (sp >= 80 ? cut.slice(0, sp) : cut).trim();
}

/** Breve articolo: niente eco del titolo; lunghezza da articolo (non teaser). */
function cleanArticleBrief(title?, summary?) {
  const t = stripSourceSuffix(String(title || "").replace(/\s+/g, " ").trim());
  let body = stripSteamMarkup(String(summary || ""));
  body = stripSourceSuffix(body.replace(/\s+/g, " ").trim());
  if (!body) return "";
  body = stripLeadingTitleEcho(t, body);
  if (!body) return "";
  if (isNearTitleDuplicate(t, body)) return "";
  if (body.length < 40) return "";
  return trimBriefAtSentence(body, ARTICLE_BRIEF_MAX);
}

function decodeXml(s?) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function translateToItalian(text?) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (/[àèéìòù]/i.test(raw) && !/\b(the|and|with|patch notes|update)\b/i.test(raw)) {
    return raw;
  }
  const chunks = [];
  let rest = raw;
  while (rest.length > MYMEMORY_MAX) {
    const slice = rest.slice(0, MYMEMORY_MAX);
    const lastDot = slice.lastIndexOf(".");
    const splitAt = lastDot >= 80 ? lastDot + 1 : MYMEMORY_MAX;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);

  const out = [];
  for (const chunk of chunks) {
    try {
      const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(chunk)}&langpair=en|it`;
      const res = await axios.get(url, { timeout: 8000 });
      const t = res?.data?.responseData?.translatedText;
      out.push(t && typeof t === "string" ? t.trim() : chunk);
      await new Promise((r?) => setTimeout(r, 350));
    } catch (_) {
      out.push(chunk);
    }
  }
  return out.join(" ").replace(/\s+\./g, ".").trim() || raw;
}

function classifyImportance(title?, summary?) {
  const blob = `${title || ""} ${summary || ""}`;
  if (JUNK_TITLE_RE.test(blob)) return "minor";
  if (MINOR_RE.test(blob) && !MAJOR_RE.test(blob)) return "minor";
  if (MAJOR_RE.test(blob)) return "major";
  if (/\b(patch\s*notes?|title\s*update|aggiornamento|nuova\s*stagione|stagione\s*\d+)\b/i.test(blob)) {
    return "major";
  }
  return "minor";
}

export = { ARTICLE_BRIEF_MAX, expandSteamPlaceholders, stripSteamMarkup, stripHtml, stripLeadingTitleEcho, trimBriefAtSentence, cleanArticleBrief, decodeXml, translateToItalian, classifyImportance };
