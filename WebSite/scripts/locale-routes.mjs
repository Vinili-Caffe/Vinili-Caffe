/**
 * Indirizzi tradotti delle pagine (/en/who-we-are/ → /chi-siamo/).
 *
 *   node scripts/locale-routes.mjs        aggiorna le regole in vercel.json
 *
 * La stessa logica è in src/lib/locale-path.ts (lato browser) e la usa next.config.ts in sviluppo.
 * I nomi tradotti stanno in src/lib/i18n/slugs.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "..");

export const URL_LANGS = ["it", "en", "es", "fr", "de", "pt", "ru", "zh", "ja", "ko", "ar", "nl", "pl", "tr", "hi", "id", "uk", "vi", "ro", "sv"];

export function slugTable() {
  return JSON.parse(fs.readFileSync(path.join(SITE, "src", "lib", "i18n", "slugs.json"), "utf8")).segmenti;
}

/** Le pagine del sito (REACT_PAGES in src/lib/site.ts). */
export function sitePages() {
  const src = fs.readFileSync(path.join(SITE, "src", "lib", "site.ts"), "utf8");
  const m = src.match(/REACT_PAGES = new Set\(\[([\s\S]*?)\]\)/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

export function localizePath(itPath, lang, table) {
  if (lang === "it") return itPath;
  const segs = itPath.split("/").filter(Boolean).map((s) => table[s]?.[lang] || s);
  return segs.length ? `/${segs.join("/")}/` : "/";
}

/** [{ lang, it, loc }] per le pagine il cui nome cambia; scarta i doppioni (due pagine con lo stesso nome tradotto). */
export function localizedPages() {
  const table = slugTable();
  const out = [];
  for (const lang of URL_LANGS) {
    if (lang === "it") continue;
    const seen = new Map();
    for (const it of sitePages()) {
      const loc = localizePath(it, lang, table);
      if (loc === it) continue;
      if (seen.has(loc) || sitePages().includes(loc)) {
        console.warn(`[locale-routes] ${lang}: ${loc} è già usato, ${it} resta in italiano`);
        continue;
      }
      seen.set(loc, it);
      out.push({ lang, it, loc });
    }
  }
  return out;
}

/** Regole di riscrittura: pagina, pagina senza barra finale e file della pagina (index.txt dei cambi pagina). */
export function slugRewrites() {
  const rules = [];
  for (const { lang, it, loc } of localizedPages()) {
    rules.push({ source: `/${lang}${loc}`, destination: `${it}index.html` });
    rules.push({ source: `/${lang}${loc.replace(/\/$/, "")}`, destination: `${it}index.html` });
    rules.push({ source: `/${lang}${loc}:file`, destination: `${it}:file` });
  }
  return rules;
}

/* eseguito direttamente: aggiorna vercel.json (le regole tradotte vanno prima di quelle generiche /:lang/…) */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(SITE, "vercel.json");
  const v = JSON.parse(fs.readFileSync(file, "utf8"));
  const isSlugRule = (r) => new RegExp(`^/(${URL_LANGS.join("|")})/`).test(String(r.source));
  const rest = (v.rewrites || []).filter((r) => !isSlugRule(r));
  const rules = slugRewrites();
  v.rewrites = [...rules, ...rest];
  const total = (v.rewrites?.length || 0) + (v.redirects?.length || 0) + (v.headers?.length || 0);
  if (total > 2000) throw new Error(`Troppe regole per Vercel (${total})`);
  fs.writeFileSync(file, JSON.stringify(v, null, 2) + "\n");
  console.log(`vercel.json: ${rules.length} regole per gli indirizzi tradotti (${total} in tutto)`);
}
