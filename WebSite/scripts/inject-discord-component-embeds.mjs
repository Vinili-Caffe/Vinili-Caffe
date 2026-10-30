/**
 * Dopo next build + flatten: inietta <script id="discord:component-embed"> in ogni HTML
 * (Component Embeds nativi Discord — link preview V2).
 * Thumb: icona live del server main (`/webhooks/site-guild-icon`).
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const SITE_ORIGIN = "https://www.viniliecaffe.it";
const SITE_INVITE = "https://discord.gg/viniliecaffe";
const ACCENT = 0x6f4e37;
const ACCENT_404 = 0xe07a5f;
const LOGO_VER = "20261030guildIconLive1";
const LOGO_THUMB = `${SITE_ORIGIN}/webhooks/site-guild-icon?size=512&v=${LOGO_VER}`;
const MAX_BYTES = 3000;
const SCRIPT_RE =
  /<script\s+id=["']discord:component-embed["'][^>]*>[\s\S]*?<\/script>/gi;
const LINK_CE_RE =
  /<link\s+[^>]*rel=["']discord:component-embed["'][^>]*>/gi;

function meta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  return ((m && (m[1] || m[2])) || "").trim();
}

function decode(s) {
  // Next scrive spesso &#x27; nell’attributo content — senza decode finisce letterale nel CE Discord.
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return Number.isFinite(c) ? String.fromCodePoint(c) : _;
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shortTitle(raw) {
  let t = decode(raw) || "Vinili & Caffè";
  // Brand ǀ Pagina → nome pagina (non “Gaming” dall’ultima parola del brand)
  if (t.includes("ǀ")) {
    const tail = t.split("ǀ").pop().trim();
    if (tail) return tail.slice(0, 80);
  }
  if (/vinili\s*&\s*caff/i.test(t)) return "Vinili & Caffè";
  if (t.includes("|")) {
    const tail = t.split("|").pop().trim();
    if (tail && tail.length < 64) return tail.slice(0, 80);
  }
  return t.slice(0, 80);
}

function pathFromFile(filePath) {
  const rel = filePath.slice(OUT.length).replace(/\\/g, "/");
  if (rel === "/index.html" || rel === "index.html") return "/";
  if (/\/404\.html$/i.test(rel) || basename(filePath) === "404.html") return "/404/";
  return rel.replace(/\/index\.html$/i, "/") || "/";
}

function pathFromUrl(url, filePath) {
  const fromFile = pathFromFile(filePath);
  let fromMeta = "";
  try {
    if (url) {
      const u = new URL(url);
      let p = u.pathname || "/";
      if (p.length > 1 && !p.endsWith("/")) p += "/";
      fromMeta = p;
    }
  } catch {}
  // Pagine nested senza pageSocialMeta ereditano og:url=/ dalla layout:
  // preferisci il path del file (es. /staff/ → staff.png, non home.png).
  if (fromFile && fromFile !== "/" && (!fromMeta || fromMeta === "/")) {
    return fromFile;
  }
  return fromMeta || fromFile || "/";
}

function buildPayload({ title, description, pageUrl, thumb, notFound }) {
  const accent = notFound ? ACCENT_404 : ACCENT;
  const pageLabel = notFound ? "Vai alla home" : "Apri la pagina";
  const ctaUrl = notFound ? `${SITE_ORIGIN}/` : pageUrl;
  const make = (desc, withThumb) => {
    const body = [];
    if (withThumb) {
      body.push({
        type: 9,
        components: [{ type: 10, content: `## ${title}\n${desc}` }],
        accessory: { type: 11, media: { url: thumb }, description: title },
      });
    } else {
      body.push({ type: 10, content: `## ${title}\n${desc}` });
    }
    body.push({ type: 14, divider: true, spacing: 1 });
    body.push({
      type: 1,
      components: [
        { type: 2, style: 5, label: pageLabel, url: ctaUrl },
        { type: 2, style: 5, label: "Entra su Discord", url: SITE_INVITE },
      ],
    });
    return { component: { type: 17, accent_color: accent, components: body } };
  };
  let desc = description.slice(0, 160);
  let payload = make(desc, true);
  if (JSON.stringify(payload).length > MAX_BYTES) payload = make(desc.slice(0, 90), true);
  if (JSON.stringify(payload).length > MAX_BYTES) payload = make(desc.slice(0, 120), false);
  return payload;
}

async function walkHtml(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) {
      if (name === "_next" || name === "og") continue;
      await walkHtml(p, out);
    } else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

let injected = 0;
let skipped = 0;

for (const file of await walkHtml(OUT)) {
  let html = await readFile(file, "utf8");
  const is404 =
    /\/404\.html$/i.test(file.replace(/\\/g, "/")) ||
    basename(file) === "404.html" ||
    /pagina non trovata/i.test(meta(html, "og:title") || meta(html, "twitter:title") || "");

  const title = is404
    ? "Pagina non trovata"
    : shortTitle(meta(html, "og:title") || meta(html, "twitter:title"));
  let description = is404
    ? "Questo link non porta a nessuna pagina del sito. Torna alla home o entra sul server Discord."
    : decode(
        meta(html, "og:description") ||
          meta(html, "description") ||
          "Community Discord italiana chill: vinili, caffè, musica e chiacchiere.",
      );
  if (description.length > 180) description = `${description.slice(0, 177)}…`;
  const ogUrl = decode(meta(html, "og:url"));
  const path = is404 ? "/404/" : pathFromUrl(ogUrl, file);
  const pageUrl = is404 ? `${SITE_ORIGIN}/` : ogUrl || `${SITE_ORIGIN}${path === "/" ? "/" : path}`;

  const json = JSON.stringify(
    buildPayload({ title, description, pageUrl, thumb: LOGO_THUMB, notFound: is404 }),
  );
  if (json.length > MAX_BYTES) {
    console.warn(`SKIP too large ${file} (${json.length}b)`);
    skipped++;
    continue;
  }
  const tag = `<script id="discord:component-embed" type="application/json">${json}</script>`;
  // Sempre in <head>: se il React aveva già messo lo script nel body, rimuovilo e reinstalla in head
  // (prima il replace in-place lasciava il payload nel body → Discord lo ignorava).
  html = html.replace(SCRIPT_RE, "").replace(LINK_CE_RE, "");
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${tag}</head>`);
  } else if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/<body[^>]*>/i, (m) => `${m}${tag}`);
  } else {
    skipped++;
    continue;
  }
  await writeFile(file, html, "utf8");
  injected++;
}

console.log(`inject-discord-component-embeds: ${injected} pagine, ${skipped} skip`);
if (injected < 1) {
  console.error("inject-discord-component-embeds: nessuna pagina iniettata — abort build");
  process.exit(1);
}
