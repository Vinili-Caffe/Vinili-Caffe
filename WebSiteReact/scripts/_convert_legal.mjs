/**
 * One-shot: HTML legal stacks → TypeScript data for WebSiteReact.
 * Preserves Italian legal text word-for-word (inline markup → mini-markup).
 */
import fs from "fs";
import path from "path";

const extractDir = "c:/Users/corva/Desktop/Vinili & Caffè Bots/WebSiteReact/scripts/_legal_extract";
const outFile = "c:/Users/corva/Desktop/Vinili & Caffè Bots/WebSiteReact/src/lib/legal-docs.ts";
const siteBase = "c:/Users/corva/Desktop/Vinili & Caffè Bots/WebSite";

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** HTML fragment → mini-markup: **bold**, *italic*, `code`, [[label|href]] */
function inline(html) {
  let s = html;
  s = s.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const plain = decodeEntities(label.replace(/<[^>]+>/g, "")).trim();
    return `[[${plain}|${href}]]`;
  });
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, t) => `**${decodeEntities(t.replace(/<[^>]+>/g, ""))}**`);
  s = s.replace(/<b>([\s\S]*?)<\/b>/gi, (_, t) => `**${decodeEntities(t.replace(/<[^>]+>/g, ""))}**`);
  s = s.replace(/<em>([\s\S]*?)<\/em>/gi, (_, t) => `*${decodeEntities(t.replace(/<[^>]+>/g, ""))}*`);
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, (_, t) => `\`${decodeEntities(t.replace(/<[^>]+>/g, ""))}\``);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<span[^>]*class="[^"]*vc-legal-card__label[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (_, t) => {
    return `**${decodeEntities(t.replace(/<[^>]+>/g, "")).trim()}**`;
  });
  s = s.replace(/<i\b[^>]*>[\s\S]*?<\/i>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ").trim();
  // collapse 3+ newlines to 2
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

function slugify(title, i) {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `sez-${i + 1}`;
}

function parseListItems(ulHtml) {
  const items = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(ulHtml))) items.push(inline(m[1]));
  return items;
}

function parseKvItems(ulInner) {
  const items = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(ulInner))) {
    const raw = li[1];
    const km =
      raw.match(/vc-legal-kvlist__k[^>]*>([^<]+)<\/span>\s*[—\-]\s*([\s\S]*)/i) ||
      raw.match(/<span[^>]*>([^<]+)<\/span>\s*[—\-]\s*([\s\S]*)/i);
    if (km) items.push({ k: decodeEntities(km[1]).trim(), v: inline(km[2]) });
    else items.push({ k: "", v: inline(raw) });
  }
  return items;
}

/** Match balanced tags at top level (approx) by scanning sequential known tags. */
function parseBlocks(bodyHtml) {
  const blocks = [];
  // Strip mini-stack / negative-block wrappers by flattening: process as stream
  // First expand cookie mini-cards as atomic units so nested ul doesn't double-parse
  let html = bodyHtml;

  // Replace mini-cards with placeholders, parse them separately
  const facts = [];
  html = html.replace(/<div class="vc-cookie-mini-card">([\s\S]*?)<\/div>\s*(?=<div class="vc-cookie-mini-card"|<\/div>|$)/gi, (full, inner) => {
    // Actually the closing is tricky because of nested divs. Use a balanced match.
    return full; // handled below with better matcher
  });

  // Balanced mini-card extractor
  const miniCards = [];
  {
    const marker = 'class="vc-cookie-mini-card"';
    let pos = 0;
    while (true) {
      const startOpen = html.indexOf("<div", pos);
      if (startOpen < 0) break;
      const openEnd = html.indexOf(">", startOpen);
      if (openEnd < 0) break;
      const openTag = html.slice(startOpen, openEnd + 1);
      if (!openTag.includes(marker)) {
        pos = startOpen + 4;
        continue;
      }
      // find matching close
      let depth = 1;
      let i = openEnd + 1;
      while (i < html.length && depth > 0) {
        const nextOpen = html.indexOf("<div", i);
        const nextClose = html.indexOf("</div>", i);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) {
          depth++;
          i = nextOpen + 4;
        } else {
          depth--;
          if (depth === 0) {
            const inner = html.slice(openEnd + 1, nextClose);
            const title = (inner.match(/vc-cookie-mini-card__title[^>]*>([^<]+)/) || [])[1] || "";
            const badge = (inner.match(/vc-cookie-mini-card__badge[^>]*>([^<]+)/) || [])[1] || "";
            const ulM = inner.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
            const items = ulM ? parseKvItems(ulM[1]) : [];
            miniCards.push({
              start: startOpen,
              end: nextClose + 6,
              block: {
                type: "fact",
                title: decodeEntities(title).trim(),
                badge: decodeEntities(badge).trim(),
                items,
              },
            });
            pos = nextClose + 6;
            break;
          }
          i = nextClose + 6;
        }
      }
      if (depth !== 0) break;
    }
  }

  // Replace mini-cards with placeholders from end to start
  const placeholders = [];
  for (let i = miniCards.length - 1; i >= 0; i--) {
    const mc = miniCards[i];
    const ph = `<!--FACT${i}-->`;
    placeholders[i] = mc.block;
    html = html.slice(0, mc.start) + ph + html.slice(mc.end);
  }

  // Also extract <pre> blocks
  const pres = [];
  html = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const idx = pres.length;
    pres.push(decodeEntities(inner.replace(/\r\n/g, "\n")).replace(/^\n+|\n+$/g, ""));
    return `<!--PRE${idx}-->`;
  });

  // Unwrap wrapper divs that only contain other content
  html = html.replace(/<\/?div[^>]*>/gi, "\n");

  // Sequential tag parse
  const tagRe = /<!--FACT(\d+)-->|<!--PRE(\d+)-->|<(p|ul|ol|h3|h4|table)(\s[^>]*)?>([\s\S]*?)<\/\3>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[1] != null) {
      blocks.push(placeholders[Number(m[1])]);
      continue;
    }
    if (m[2] != null) {
      blocks.push({ type: "pre", text: pres[Number(m[2])] });
      continue;
    }
    const tag = m[3].toLowerCase();
    const attrs = m[4] || "";
    const inner = m[5];
    const classAttr = (attrs.match(/class="([^"]*)"/) || [])[1] || "";

    if (tag === "p") {
      if (classAttr.includes("vc-legal-card__label") || classAttr.includes("vc-legal-card__strong")) {
        blocks.push({ type: "label", text: inline(inner) });
      } else {
        const text = inline(inner);
        if (text) blocks.push({ type: "p", text });
      }
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (classAttr.includes("vc-legal-kvlist")) {
        blocks.push({ type: "kvlist", items: parseKvItems(inner) });
      } else {
        blocks.push({ type: "ul", items: parseListItems(`<ul>${inner}</ul>`) });
      }
      continue;
    }
    if (tag === "h3") {
      const text = inline(inner);
      if (text) blocks.push({ type: "h3", text });
      continue;
    }
    if (tag === "h4") {
      const text = inline(inner);
      if (text) blocks.push({ type: "h4", text });
      continue;
    }
    if (tag === "table") {
      const headers = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => inline(x[1]));
      const rows = [];
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRe.exec(inner))) {
        if (tr[1].includes("<th")) continue;
        const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => inline(x[1]));
        if (cells.length) rows.push(cells);
      }
      blocks.push({ type: "table", headers, rows });
    }
  }
  return blocks.filter(Boolean);
}

function parseArticle(articleHtml, index) {
  const idAttr = (articleHtml.match(/<article[^>]*\bid="([^"]+)"/) || [])[1];
  const titleM = articleHtml.match(/vc-legal-card__title"[^>]*>([^<]+)/);
  const title = titleM ? decodeEntities(titleM[1]).trim() : `Sezione ${index + 1}`;
  const id = idAttr || slugify(title, index);

  let rest = articleHtml.replace(/<div class="vc-legal-card__head">[\s\S]*?<\/div>/, "");

  let cta = null;
  const ctaM = rest.match(/<p class="vc-legal-cta">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
  if (ctaM) {
    cta = { href: ctaM[1], label: decodeEntities(ctaM[2]).trim() };
    rest = rest.replace(/<p class="vc-legal-cta">[\s\S]*?<\/p>/, "");
  }

  // Keep structure (mini-cards, pre, lists); parseBlocks strips wrapper divs after extracting facts.
  rest = rest.replace(/^[\s\S]*?<article[^>]*>/i, "").replace(/<\/article>\s*$/i, "");

  const blocks = parseBlocks(rest);
  if (cta) blocks.push({ type: "cta", href: cta.href, label: cta.label });
  return { id, title, blocks };
}

function parseDoc(name) {
  const htmlPath = path.join(siteBase, name, "index.html");
  const full = fs.readFileSync(htmlPath, "utf8");
  const stack = fs.readFileSync(path.join(extractDir, `${name}-stack.html`), "utf8");

  const h1 =
    (full.match(/data-i18n="legal\.[^.]+\.h1">([^<]+)/) || [])[1] ||
    (full.match(/id="vc-legal-hero-heading"[\s\S]*?<span[^>]*>([^<]+)/) || [])[1] ||
    name;

  const updatedIso = (full.match(/<time datetime="([^"]+)">/) || [])[1] || null;
  const updatedLabel = (full.match(/<time datetime="[^"]+">([^<]+)/) || [])[1] || null;
  const updatedPrefix = (full.match(/data-i18n="legal\.[^.]+\.updated">([^<]+)/) || [])[1] || null;

  // copyright uses a plain subtitle instead of date
  let subtitle = null;
  if (!updatedIso) {
    const meta = full.match(/vc-legal-hero__meta">\s*([^<]+)/);
    if (meta) subtitle = decodeEntities(meta[1]).trim();
  }

  const articles = [];
  {
    const marker = 'class="vc-legal-card';
    let pos = 0;
    while (true) {
      const startOpen = stack.indexOf("<article", pos);
      if (startOpen < 0) break;
      const openEnd = stack.indexOf(">", startOpen);
      if (openEnd < 0) break;
      const openTag = stack.slice(startOpen, openEnd + 1);
      if (!openTag.includes(marker)) {
        pos = startOpen + 8;
        continue;
      }
      let depth = 1;
      let i = openEnd + 1;
      while (i < stack.length && depth > 0) {
        const nextOpen = stack.indexOf("<article", i);
        const nextClose = stack.indexOf("</article>", i);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) {
          depth++;
          i = nextOpen + 8;
        } else {
          depth--;
          if (depth === 0) {
            articles.push(stack.slice(startOpen, nextClose + 10));
            pos = nextClose + 10;
            break;
          }
          i = nextClose + 10;
        }
      }
      if (depth !== 0) break;
    }
  }

  const sections = articles.map((a, i) => parseArticle(a, i));

  return {
    slug: name,
    h1: decodeEntities(h1),
    updatedIso,
    updatedLabel: updatedLabel ? decodeEntities(updatedLabel) : null,
    updatedPrefix: updatedPrefix ? decodeEntities(updatedPrefix) : "Ultimo aggiornamento:",
    subtitle,
    sections,
  };
}

const docs = ["privacy", "cookie", "terms", "copyright"].map(parseDoc);

function esc(s) {
  return JSON.stringify(s);
}

function emitBlock(b, indent) {
  const sp = " ".repeat(indent);
  if (b.type === "p") return `${sp}{ type: "p", text: ${esc(b.text)} }`;
  if (b.type === "label") return `${sp}{ type: "label", text: ${esc(b.text)} }`;
  if (b.type === "h3") return `${sp}{ type: "h3", text: ${esc(b.text)} }`;
  if (b.type === "h4") return `${sp}{ type: "h4", text: ${esc(b.text)} }`;
  if (b.type === "pre") return `${sp}{ type: "pre", text: ${esc(b.text)} }`;
  if (b.type === "ul") {
    const items = b.items.map((it) => `${sp}    ${esc(it)}`).join(",\n");
    return `${sp}{ type: "ul", items: [\n${items}\n${sp}  ] }`;
  }
  if (b.type === "table") {
    const headers = b.headers.map((h) => esc(h)).join(", ");
    const rows = b.rows.map((r) => `${sp}    [${r.map((c) => esc(c)).join(", ")}]`).join(",\n");
    return `${sp}{ type: "table", headers: [${headers}], rows: [\n${rows}\n${sp}  ] }`;
  }
  if (b.type === "fact") {
    const items = b.items.map((it) => `${sp}    { k: ${esc(it.k)}, v: ${esc(it.v)} }`).join(",\n");
    return `${sp}{ type: "fact", title: ${esc(b.title)}, badge: ${esc(b.badge)}, items: [\n${items}\n${sp}  ] }`;
  }
  if (b.type === "kvlist") {
    const items = b.items.map((it) => `${sp}    { k: ${esc(it.k)}, v: ${esc(it.v)} }`).join(",\n");
    return `${sp}{ type: "kvlist", items: [\n${items}\n${sp}  ] }`;
  }
  if (b.type === "cta") return `${sp}{ type: "cta", href: ${esc(b.href)}, label: ${esc(b.label)} }`;
  return `${sp}/* unknown ${b.type} */`;
}

let out = `// Generato da scripts/_convert_legal.mjs — testi identici a WebSite/{privacy,cookie,terms,copyright}/index.html
// Non editare a mano i testi; rilancia lo script se le policy cambiano.

import type { LegalDoc } from "./legal";

`;

for (const doc of docs) {
  const constName = `LEGAL_${doc.slug.toUpperCase()}`;
  out += `export const ${constName}: LegalDoc = {\n`;
  out += `  slug: ${esc(doc.slug)},\n`;
  out += `  h1: ${esc(doc.h1)},\n`;
  out += `  updatedIso: ${doc.updatedIso ? esc(doc.updatedIso) : "null"},\n`;
  out += `  updatedLabel: ${doc.updatedLabel ? esc(doc.updatedLabel) : "null"},\n`;
  out += `  updatedPrefix: ${esc(doc.updatedPrefix)},\n`;
  out += `  subtitle: ${doc.subtitle ? esc(doc.subtitle) : "null"},\n`;
  out += `  sections: [\n`;
  for (const sec of doc.sections) {
    out += `    {\n`;
    out += `      id: ${esc(sec.id)},\n`;
    out += `      title: ${esc(sec.title)},\n`;
    out += `      blocks: [\n`;
    for (const b of sec.blocks) out += emitBlock(b, 8) + ",\n";
    out += `      ],\n`;
    out += `    },\n`;
  }
  out += `  ],\n`;
  out += `};\n\n`;
}

out += `export const LEGAL_DOCS = {\n  privacy: LEGAL_PRIVACY,\n  cookie: LEGAL_COOKIE,\n  terms: LEGAL_TERMS,\n  copyright: LEGAL_COPYRIGHT,\n} as const;\n`;

fs.writeFileSync(outFile, out);
console.log("Wrote", outFile);
for (const d of docs) {
  const empty = d.sections.filter((s) => !s.blocks.length).map((s) => s.id);
  const facts = d.sections.flatMap((s) => s.blocks).filter((b) => b.type === "fact");
  console.log(
    d.slug,
    "h1=",
    d.h1,
    "sections=",
    d.sections.length,
    "blocks=",
    d.sections.reduce((n, s) => n + s.blocks.length, 0),
    "facts=",
    facts.length,
    "empty=",
    empty,
  );
  for (const f of facts) {
    if (!f.items.length) console.warn("  empty fact:", f.title);
  }
}
