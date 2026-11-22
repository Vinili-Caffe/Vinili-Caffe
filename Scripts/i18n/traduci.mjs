/**
 * Traduce in tutte le lingue del sito il testo italiano di sito e bot, con Claude.
 *
 *   node Scripts/i18n/traduci.mjs estrai                 raccoglie le frasi italiane di sito e bot
 *   node Scripts/i18n/traduci.mjs google [--lingue=fr] [--n=30 --mostra=30]   traduce gratis con Google (senza chiave)
 *   node Scripts/i18n/traduci.mjs stima                  quante frasi mancano e quanto costerebbe
 *   node Scripts/i18n/traduci.mjs prova --lingua=fr      traduce subito un campione (30 frasi) e lo mostra
 *   node Scripts/i18n/traduci.mjs invia [--lingue=fr,de] manda le frasi mancanti in lotti (metà prezzo)
 *   node Scripts/i18n/traduci.mjs stato                  a che punto sono i lotti
 *   node Scripts/i18n/traduci.mjs scarica                salva le traduzioni dei lotti finiti
 *   node Scripts/i18n/traduci.mjs costruisci             scrive i file di sito e bot
 *   node Scripts/i18n/traduci.mjs tutto                  estrai + invia, poi aspetta, scarica e costruisce
 *
 * Le traduzioni restano in Scripts/i18n/dati/cache/<lingua>.json (testo italiano → traduzione):
 * le volte dopo si paga solo il testo nuovo o cambiato. Serve ANTHROPIC_API_KEY nell'ambiente
 * (o in Scripts/i18n/.env, che non va mai committato).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATI = path.join(HERE, "dati");
const CACHE = path.join(DATI, "cache");
const SORGENTI = path.join(DATI, "sorgenti.json");
const LOTTI = path.join(DATI, "lotti.json");
const SITE = path.join(ROOT, "WebSite");
const BOT = path.join(ROOT, "Bots", "src");

const MODEL = "claude-opus-5-5";
/* prezzi Opus 5.5 ($/milione di token); a lotti si paga la metà */
const PRICE = { in: 4, out: 20 };

const LANGS = {
  en: "English",
  es: "Spanish (Spain)",
  fr: "French",
  de: "German",
  pt: "Brazilian Portuguese",
  ru: "Russian",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  hi: "Hindi",
  id: "Indonesian",
  uk: "Ukrainian",
  vi: "Vietnamese",
  ro: "Romanian",
  sv: "Swedish",
};
/* lingue già curate a mano sul sito: le traduzioni esistenti hanno la precedenza */
const CURATED = ["en", "es"];

/* ───────────────────────── utilità ───────────────────────── */

const args = Object.fromEntries(
  process.argv
    .slice(3)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "1"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (f, data, pretty = true) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, pretty ? 2 : 0) + "\n");
};
const cacheOf = (lang) => readJson(path.join(CACHE, `${lang}.json`), {});
const saveCache = (lang, c) => {
  const sorted = Object.fromEntries(Object.entries(c).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJson(path.join(CACHE, `${lang}.json`), sorted);
};
const pickLangs = () => {
  const raw = args.lingue || args.lingua;
  if (!raw) return Object.keys(LANGS);
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const l of list) if (!LANGS[l]) throw new Error(`Lingua sconosciuta: ${l}`);
  return list;
};

function loadEnv() {
  const f = path.join(HERE, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
function client() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("Manca ANTHROPIC_API_KEY: mettila in Scripts/i18n/.env (ANTHROPIC_API_KEY=...) o nell'ambiente.");
    process.exit(1);
  }
  return new Anthropic();
}

/* ───────────────────────── estrazione ───────────────────────── */

/* parole che compaiono quasi solo in italiano */
const IT_WORDS = new Set(
  "ed ad od coi col cui mio mia miei tuo nuovo nuova il lo la gli le un una uno di del della dello dei degli delle da dal dalla dai nel nella nei nelle sul sulla sui per con che non è sei sono hai ha abbiamo puoi può devi deve questo questa questi queste quello quella tuo tua tuoi tue suo sua nostro nostra ogni qui già ancora anche più meno poi prima dopo quando dove come cosa chi perché oppure senza tra fra se o e ma al alla ai alle negli sugli dagli tutti tutto tutte niente nessun nessuna nessuno ecco sì grazie ciao serve servono scegli scrivi apri invia salva annulla elimina riprova attendi".split(
    " ",
  ),
);
const EN_WORDS = new Set(
  "the and of to is are you your this that with for from not be have has was were will can on at by an or it its if then than which what when where who how all any".split(" "),
);
const OTHER_SCRIPT = /[Ѐ-ӿ؀-ۿऀ-ॿ぀-ヿ一-鿿가-힯]/;
const OTHER_LANG = /(ş|ğ|ı|ł|ą|ę|ż|ő|ű|ã|õ|ñ|ç|ß|ä|ö|ü|ă|ț|ș|ð|å|ø|æ|ơ|ư|đ|[Ạ-ỿ])/i;
/* parole frequenti di altre lingue latine: se prevalgono, la frase non è italiana */
const OTHER_WORDS = new Set(
  "vous nous est les des pour avec dans sur pas être votre vos tout cette ces aux el los las por para ser usted está están puede sus und der die das ist nicht mit ein eine sie wir het een van zijn niet och att är inte ett för som jest nie się dla oraz bir ve için bu yang dan untuk tidak dengan você não são uma também".split(
    " ",
  ),
);

function looksItalian(s) {
  const t = s.replace(/\{[^}]*\}|<[^>]*>|`[^`]*`|https?:\/\/\S+|[*_~>#|]/g, " ");
  if (OTHER_SCRIPT.test(t) || OTHER_LANG.test(t)) return false;
  const words = t.toLowerCase().match(/[a-zàèéìòù']+/g) || [];
  const real = words.filter((w) => w.length > 1);
  if (!real.length) return false;
  if (/^[\w$.-]+$/.test(s.trim()) && /[._$]/.test(s)) return false; /* percorsi e identificatori */
  const it = real.filter((w) => IT_WORDS.has(w) || /[àèéìòù]/.test(w)).length;
  const en = real.filter((w) => EN_WORDS.has(w)).length;
  const other = real.filter((w) => OTHER_WORDS.has(w)).length;
  if (other > it) return false;
  if (it > 0) return it >= en;
  if (en > 0) return false;
  /* frasi brevi senza parole "di servizio": le parole italiane finiscono quasi sempre in vocale */
  const vowelEnd = real.filter((w) => /[aeiouàèéìòù]$/.test(w) && w.length >= 3).length;
  if (real.length <= 3) return vowelEnd === real.length;
  return real.length <= 8 && vowelEnd / real.length >= 0.7;
}

/* valori di testo nelle proprietà dei componenti (titoli, accenti, kicker…): l'estrattore salta le parole singole minuscole */
function extractProps(files) {
  const out = new Set();
  const re = /\b(?:accent|kicker|title|text|label|placeholder|hint|description|teaser|eyebrow|subtitle|tagline)[=:]\s*["']([^"'{}]{2,200})["']/g;
  /* pezzi di testo JSX accanto a un valore, es. «prefisso {b.prefix}» o «{n} comandi»: nella pagina diventano nodi a sé */
  const jsx = /(?:>|\})([^<>{}]{3,120})(?=[<{])/g;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    let m;
    while ((m = re.exec(src))) out.add(m[1].trim());
    if (/\.tsx$/.test(f)) while ((m = jsx.exec(src))) {
      const t = m[1].trim();
      if (/^[a-zàèéìòù][a-zàèéìòù' ]{2,60}$/i.test(t)) out.add(t);
    }
  }
  return [...out];
}

function extractWith(files, label) {
  const tmp = path.join(DATI, `_estratti-${label}.json`);
  const list = path.join(DATI, `_file-${label}.txt`);
  fs.mkdirSync(DATI, { recursive: true });
  fs.writeFileSync(list, files.join("\n"));
  /* lo stesso estrattore usato dal sito (segnaposto {0}, {1}… come il traduttore); l'elenco dei file
     passa da un file perché la riga di comando di Windows non regge migliaia di percorsi */
  execFileSync(process.execPath, [path.join(SITE, "scripts", "extract-ui-texts.mjs"), tmp, `@${list}`], {
    cwd: SITE,
    stdio: ["ignore", "ignore", "inherit"],
    maxBuffer: 1 << 28,
  });
  const out = readJson(tmp, []);
  fs.rmSync(tmp, { force: true });
  fs.rmSync(list, { force: true });
  return (Array.isArray(out) ? out : Object.values(out)).map((s) => String(s));
}

function walk(dir, keep, skip) {
  const out = [];
  const go = (p) => {
    if (skip(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) go(path.join(p, f));
    else if (keep(p)) out.push(p);
  };
  go(dir);
  return out;
}


/* testo italiano del dizionario del sito (DICTS.it), chiave → testo */
function shellDict() {
  const ts = require(path.join(SITE, "node_modules", "typescript"));
  const file = path.join(SITE, "src", "lib", "i18n.ts");
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const dicts = {};
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === "DICTS" && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const lang = p.name.getText().replace(/["']/g, "");
        dicts[lang] = {};
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q)) continue;
          const key = q.name.getText().replace(/^["']|["']$/g, "");
          if (ts.isStringLiteral(q.initializer) || ts.isNoSubstitutionTemplateLiteral(q.initializer)) dicts[lang][key] = q.initializer.text;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return dicts;
}

function estrai() {
  const isCode = (p) => /\.(tsx?|mts)$/.test(p) && !p.endsWith(".d.ts");
  const siteFiles = walk(path.join(SITE, "src"), isCode, (p) => /[\\/]node_modules$/.test(p));
  /* le partnership degli altri server hanno già il loro sistema di lingue (tenantPartnershipI18n) */
  const botFiles = walk(BOT, isCode, (p) => /[\\/](node_modules|generated|__tests__|tenantPartnershipI18n)$|\.test\.ts$/i.test(p));

  const dicts = shellDict();
  const shell = dicts.it || {};
  const sito = [...new Set([...extractWith(siteFiles, "sito"), ...extractProps(siteFiles), ...Object.values(shell)])].filter(looksItalian);
  const bot = [...new Set(extractWith(botFiles, "bot"))].filter(looksItalian);

  writeJson(SORGENTI, { sito: sito.sort(), bot: bot.sort(), shell });

  /* le lingue curate partono dalle traduzioni che il sito ha già */
  for (const lang of CURATED) {
    const c = cacheOf(lang);
    const ui = readJson(path.join(SITE, "src", "lib", "i18n", `ui-${lang}.json`), {});
    for (const [it, tr] of Object.entries(ui)) if (!c[it] && tr) c[it] = tr;
    for (const [k, it] of Object.entries(shell)) if (!c[it] && dicts[lang]?.[k]) c[it] = dicts[lang][k];
    saveCache(lang, c);
  }
  const chars = (l) => l.reduce((n, s) => n + s.length, 0);
  console.log(`Sito: ${sito.length} frasi (${chars(sito)} caratteri) · Bot: ${bot.length} frasi (${chars(bot)} caratteri)`);
}

/* ───────────────────────── traduzione ───────────────────────── */

const SYSTEM = (langName) => `You translate the user interface of "Vinili & Caffè", an Italian community that exists only on Discord, with its own website and Discord bots (Vinili, Caffè, Groove). You translate from Italian into ${langName}.

You receive a JSON array of {"id", "text"} items: buttons, labels, short messages, bot replies, help texts and page copy. Return every id exactly once with its translation.

Rules:
- Keep these exactly as they are, same characters and same count: placeholders like {0}, {1}, {name}, {user}; Discord mentions and emoji like <@{0}>, <#{0}>, <@&{0}>, <:name:123>, <a:name:123>, <t:{0}:R>; text inside backticks; URLs; "\\n" line breaks; Markdown markers (**, __, *, ~~, >, #, -, ||).
- Never translate brand and product names: Vinili & Caffè, Vinili, Caffè, Groove, Discord, Discadia, Top.gg, Disboard, Twitch, YouTube, Kick, TikTok, Instagram, PayPal, Nitro, Premium, EXP, XP, High Staff, Partner Manager, Helper, Wordle, Wrapped. Command names (+rank, /bump, +help…) stay as they are.
- Write like a friendly community website: natural, informal (address the reader informally where the language allows it), never stiff or word-for-word. Keep about the same length; buttons and labels stay short.
- Italian words that are role, channel or genre names written in a decorated style (e.g. with ༄ or special Unicode letters) stay unchanged.
- If an item is not Italian, is a proper name, or should not be translated, return it unchanged.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, text: { type: "string" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

/* gruppi di frasi per richiesta: abbastanza grandi da non sprecare, abbastanza piccoli da non sbagliare */
function chunk(list, maxItems = 80, maxChars = 5000) {
  const out = [];
  let cur = [];
  let n = 0;
  for (const s of list) {
    if (cur.length && (cur.length >= maxItems || n + s.length > maxChars)) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(s);
    n += s.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

function request(lang, items) {
  return {
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM(LANGS[lang]),
    messages: [{ role: "user", content: JSON.stringify(items.map((text, id) => ({ id, text }))) }],
  };
}

/* segnaposto, menzioni, codice e link devono restare identici */
const TOKENS = /\{[^{}\s]{1,40}\}|<[@#:&!at][^<>\s]*>|`[^`]+`|https?:\/\/[^\s)>\]]+|\\n|\n|\*\*\*|\*\*|__|~~|\|\||⟦/g;
const tokenBag = (s) => (String(s).match(TOKENS) || []).sort().join("\u0001");
/* il grassetto (o simili) che apre e chiude la frase deve restare all'inizio e alla fine */
const MD_EDGE = /^(\*\*\*|\*\*|__|~~|\|\|)|(\*\*\*|\*\*|__|~~|\|\|)$/g;
const mdEdges = (s) => (String(s).trim().match(MD_EDGE) || []).join("|");
const valid = (src, tr) => typeof tr === "string" && tr.trim() !== "" && tokenBag(src) === tokenBag(tr) && mdEdges(src) === mdEdges(tr);

function applyResult(lang, items, text, cache) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: 0, bad: items.length };
  }
  let ok = 0;
  let bad = 0;
  for (const row of parsed?.translations || []) {
    const src = items[row.id];
    if (src == null) continue;
    if (valid(src, row.text)) {
      cache[src] = row.text;
      ok++;
    } else bad++;
  }
  return { ok, bad };
}

/** Frase ancora da tradurre: assente in cache, oppure restata uguale all'italiano (ma è davvero IT). */
function stillItalian(s) {
  if (!s || s.length < 8) return false;
  if (/^[#@;+/]/.test(s) || /^#[0-9a-fA-F]{3,8}$/.test(s) || /^\d/.test(s)) return false;
  if (/^[A-Za-z0-9_./:-]+$/.test(s)) return false;
  if (!looksItalian(s)) return false;
  /* serve almeno un segnale forte: accento o parola di servizio italiana */
  if (/[àèéìòù]/i.test(s)) return true;
  const words = s.toLowerCase().match(/[a-zàèéìòù']+/g) || [];
  return words.some((w) => IT_WORDS.has(w));
}

/** Marchi, artisti, radio, città, frammenti tecnici: restano uguali in ogni lingua. */
function isBrandOrProper(s) {
  const t = String(s || "");
  if (/^bg-\[|#(?:[0-9a-f]{3,8})$/i.test(t)) return true;
  if (/\|/.test(t) && /com\|net\|org/i.test(t)) return true;
  if (/^(atl[eé]tico madrid|counter del|damage per second)$/i.test(t)) return true;
  return /Vinili|Caff[eè]|Groove|Radio |Rai |Wrapped|AutoMod|Premium|Discord|Discadia|Disboard|Top\.gg|Ed Sheeran|Leonardo|Lucio |Sin[eé]ad|Hilal|Nassr|La Liga|La Land|Beyonc|Castel del|Ho Chi|Maril[uù]|Techet[eè]|Studio Pi[uù]|Rossobl[uù]|Adivina|Hasta la vista|Terima kasih|Par où|Pseudo du|cr[eé]dits|Anime &|guildId required|Tidak bisa|Spanish La|Al Hilal|Al Nassr|Completa la frase|Explora la comunidad|Nada con estos|Paga con PayPal|Todo lo que necesitas|Términos|en el chat de la comunidad|música\|café|créditos|Atlético|Fontana di Trevi|Gomorra|Gracias por contactar|Kylian Mbapp|Memoria con emoji|San José|📷 una foto|con EXP|EXP base del segmento|counter del|damage per second|Céline Dion|Avatar du bot|Bannière du bot|Ce que tu débloques|Crédits utilisés|Merci d'avoir contacté/i.test(
    t,
  );
}

function missing(lang) {
  const src = readJson(SORGENTI, null);
  if (!src) throw new Error("Prima esegui: node Scripts/i18n/traduci.mjs estrai");
  const c = cacheOf(lang);
  const all = [...new Set([...src.sito, ...src.bot])];
  return all.filter((s) => {
    if (!(s in c)) return !isBrandOrProper(s);
    if (c[s] !== s) return false;
    if (isBrandOrProper(s)) return false;
    return stillItalian(s);
  });
}

function stima() {
  let chars = 0;
  for (const lang of pickLangs()) {
    const m = missing(lang);
    const n = m.reduce((a, s) => a + s.length, 0);
    chars += n;
    console.log(`${lang}: ${m.length} frasi da tradurre (${n} caratteri)`);
  }
  /* ~3,3 caratteri per token in italiano; uscita un po' più lunga dell'entrata; istruzioni ogni ~4.000 caratteri */
  const inTok = chars / 3.3 + (chars / 4000) * 600;
  const outTok = (chars / 3.3) * 1.35;
  const usd = (inTok * PRICE.in + outTok * PRICE.out) / 1e6;
  console.log(`\nStima con ${MODEL}: ~${usd.toFixed(0)} $ subito, ~${(usd / 2).toFixed(0)} $ a lotti.`);
}

async function prova() {
  const lang = pickLangs()[0];
  const n = Number(args.n || 30);
  const m = missing(lang);
  /* un po' di tutto: frasi corte, lunghe e con segnaposto */
  const sample = [];
  for (let i = 0; i < m.length && sample.length < n; i += Math.max(1, Math.floor(m.length / n))) sample.push(m[i]);
  const res = await client().messages.create(request(lang, sample));
  const text = res.content.find((b) => b.type === "text")?.text || "";
  const c = cacheOf(lang);
  const { ok, bad } = applyResult(lang, sample, text, c);
  saveCache(lang, c);
  for (const s of sample) console.log(`\n· ${s}\n→ ${c[s] ?? "(scartata: segnaposto diversi)"}`);
  const usd = (res.usage.input_tokens * PRICE.in + res.usage.output_tokens * PRICE.out) / 1e6;
  console.log(`\n${ok} tradotte, ${bad} scartate · ${res.usage.input_tokens} token in, ${res.usage.output_tokens} out · ${usd.toFixed(3)} $`);
}

async function invia() {
  const api = client();
  const requests = [];
  const index = {};
  for (const lang of pickLangs()) {
    chunk(missing(lang)).forEach((items, i) => {
      const id = `${lang}-${i}`;
      index[id] = { lang, items };
      requests.push({ custom_id: id, params: request(lang, items) });
    });
  }
  if (!requests.length) return console.log("Niente da tradurre: è tutto in cache.");
  const lotti = readJson(LOTTI, []);
  /* massimo 100.000 richieste o 256 MB per lotto: si spezza per stare larghi */
  for (let i = 0; i < requests.length; i += 5000) {
    const part = requests.slice(i, i + 5000);
    const batch = await api.messages.batches.create({ requests: part });
    const items = Object.fromEntries(part.map((r) => [r.custom_id, index[r.custom_id]]));
    lotti.push({ id: batch.id, creato: new Date().toISOString(), richieste: part.length, items, scaricato: false });
    console.log(`Lotto ${batch.id}: ${part.length} richieste inviate.`);
  }
  writeJson(LOTTI, lotti, false);
}

async function stato() {
  const api = client();
  const lotti = readJson(LOTTI, []);
  let open = 0;
  for (const l of lotti.filter((x) => !x.scaricato)) {
    const b = await api.messages.batches.retrieve(l.id);
    const c = b.request_counts;
    console.log(`${l.id}: ${b.processing_status} · finite ${c.succeeded}, errori ${c.errored}, in corso ${c.processing}`);
    if (b.processing_status !== "ended") open++;
  }
  if (!lotti.some((x) => !x.scaricato)) console.log("Nessun lotto in attesa.");
  return open;
}

async function scarica() {
  const api = client();
  const lotti = readJson(LOTTI, []);
  let inTok = 0;
  let outTok = 0;
  for (const l of lotti.filter((x) => !x.scaricato)) {
    const b = await api.messages.batches.retrieve(l.id);
    if (b.processing_status !== "ended") {
      console.log(`${l.id}: non ancora finito.`);
      continue;
    }
    const caches = {};
    let ok = 0;
    let bad = 0;
    let err = 0;
    for await (const r of await api.messages.batches.results(l.id)) {
      const meta = l.items[r.custom_id];
      if (!meta) continue;
      if (r.result.type !== "succeeded") {
        err++;
        continue;
      }
      const msg = r.result.message;
      inTok += msg.usage.input_tokens;
      outTok += msg.usage.output_tokens;
      if (msg.stop_reason !== "end_turn") {
        err++;
        continue;
      }
      const c = (caches[meta.lang] ||= cacheOf(meta.lang));
      const text = msg.content.find((x) => x.type === "text")?.text || "";
      const res = applyResult(meta.lang, meta.items, text, c);
      ok += res.ok;
      bad += res.bad;
    }
    for (const [lang, c] of Object.entries(caches)) saveCache(lang, c);
    l.scaricato = true;
    console.log(`${l.id}: ${ok} frasi salvate, ${bad} scartate, ${err} richieste da rifare.`);
  }
  writeJson(LOTTI, lotti, false);
  if (inTok) console.log(`Spesa di questi lotti: ~${(((inTok * PRICE.in + outTok * PRICE.out) / 1e6) / 2).toFixed(2)} $`);
  console.log("Le frasi scartate o fallite restano da tradurre: un nuovo «invia» le riprova.");
}

/* ───────────────────────── Google Traduttore (gratis) ───────────────────────── */

/* codici di Google per le nostre lingue */
const GT = { zh: "zh-CN", pt: "pt" };
const BRANDS = ["Vinili & Caffè", "Vinili &amp; Caffè", "Partner Manager", "High Staff", "Top.gg", "Discadia", "Disboard", "Discord", "Premium", "Wrapped", "Wordle", "Groove", "Vinili", "Caffè", "Nitro", "PayPal", "Twitch", "YouTube", "TikTok", "Instagram", "Kick", "EXP", "XP"];
const PROTECT = new RegExp(
  [
    ...BRANDS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "\\{[^{}\\s]{1,40}\\}", /* segnaposto */
    "<[@#:&!at][^<>\\s]*>", /* menzioni, emoji, date */
    "`[^`\\n]+`", /* codice */
    "https?:\\/\\/[^\\s)>\\]]+", /* link */
    "\\[\\[[^\\]]*\\]\\]", /* link del sito [[Etichetta|/percorso/]] */
    "[+/][a-z][a-z0-9-]{1,24}\\b", /* comandi */
    "\\*\\*\\*|\\*\\*|__|~~|\\|\\|", /* markdown */
    "#[\\w-]{2,40}", /* nomi dei canali */
    "\\n", /* a capo dentro la frase */
  ].join("|"),
  "g",
);

/* Marcatori ASCII: Google spesso mangia ⟦n⟧ (soprattutto su ja/zh/ar). __VCn__ resta stabile. */
function protectFor(text, tokens) {
  return text.replace(PROTECT, (m, ...rest) => {
    const at = rest[rest.length - 2];
    const src = rest[rest.length - 1];
    const sb = at === 0 || /\s/.test(src[at - 1]);
    const sa = at + m.length >= src.length || /\s/.test(src[at + m.length]);
    tokens.push({ t: m, sb, sa });
    return ` __VC${tokens.length - 1}__ `;
  });
}
const unprotect = (text, tokens) =>
  text
    .replace(/\s*(?:⟦\s*(\d+)\s*⟧|__\s*VC\s*(\d+)\s*__|_+\s*VC\s*(\d+)\s*_+)\s*/gi, (m, a, b, c, at, all) => {
      const n = a ?? b ?? c;
      const tok = tokens[Number(n)];
      if (tok == null) return m;
      const wordy = /^[\p{L}\p{N}]/u.test(tok.t) && /[\p{L}\p{N}]$/u.test(tok.t);
      const prev = all.slice(0, at).replace(/\s+$/, "").slice(-1);
      const next = all.slice(at + m.length).replace(/^\s+/, "").slice(0, 1);
      const before = tok.sb || (wordy && /[\p{L}\p{N}]/u.test(prev));
      const after = tok.sa || (wordy && /[\p{L}\p{N}]/u.test(next));
      return (before ? " " : "") + tok.t + (after ? " " : "");
    })
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,)])/g, "$1")
    .trim();

/** Se Google ha distorto i token, ripristina quelli dell'originale (stesso conteggio/ordine). */
function repairTokens(src, tr) {
  if (valid(src, tr)) return tr;
  const srcTok = String(src).match(TOKENS) || [];
  if (!srcTok.length) return tr;
  let i = 0;
  let out = String(tr || "");
  /* sostituisci eventuali token residui con quelli sorgente in ordine */
  out = out.replace(TOKENS, () => srcTok[i++] ?? "");
  while (i < srcTok.length) {
    out = out.trimEnd() + " " + srcTok[i++];
  }
  if (valid(src, out)) return out;
  /* ultima spiaggia: testo tradotto senza token + append dei token sorgente */
  const bare = String(tr || "").replace(TOKENS, " ").replace(/ {2,}/g, " ").trim();
  const joined = [bare, ...srcTok].filter(Boolean).join(" ");
  return valid(src, joined) ? joined : null;
}

async function gtx(text, lang) {
  const body = new URLSearchParams({ client: "gtx", sl: "it", tl: GT[lang] || lang, dt: "t", q: text });
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch("https://translate.googleapis.com/translate_a/single", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        body,
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * (attempt + 1) ** 2);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data?.[0]) ? data[0].map((r) => (r?.[0] != null ? String(r[0]) : "")).join("") : "";
    } catch (e) {
      last = e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw last || new Error("Google non risponde");
}

/* spazi iniziali e finali come nella frase originale */
const edges = (src, tr) => (src.match(/^\s*/)?.[0] || "") + tr + (src.match(/\s*$/)?.[0] || "");

/* indirizzi che accettano più frasi per richiesta (q=…&q=…) e rispondono con una traduzione per frase;
   se uno rallenta si passa al successivo */
const MULTI = [
  "https://translate.googleapis.com/translate_a/t?client=gtx",
  "https://clients5.google.com/translate_a/t?client=dict-chrome-ex",
  "https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex",
];
let multiAt = 0;

async function gtxMulti(lines, lang) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    const base = MULTI[multiAt % MULTI.length];
    const body = new URLSearchParams();
    for (const l of lines) body.append("q", l);
    try {
      const res = await fetch(`${base}&sl=it&tl=${encodeURIComponent(GT[lang] || lang)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        body,
      });
      if (res.status === 429 || res.status >= 500) {
        multiAt++;
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      /* una frase: a volte arriva una stringa sola; con più frasi un elenco (stringhe o [testo, lingua]) */
      const arr = Array.isArray(data) ? data : [data];
      const out = arr.map((x) => (Array.isArray(x) ? String(x[0] ?? "") : String(x ?? "")));
      if (out.length !== lines.length) throw new Error("risposta incompleta");
      return out;
    } catch (e) {
      last = e;
      multiAt++;
      await sleep(800 * (attempt + 1));
    }
  }
  throw last || new Error("Google non risponde");
}

/* più frasi per richiesta: molte meno chiamate a Google */
async function googleGroup(lang, items) {
  const tokens = items.map(() => []);
  const lines = items.map((s, i) => protectFor(s, tokens[i]).replace(/\s+/g, " ").trim());
  const back = await gtxMulti(lines, lang);
  const out = {};
  back.forEach((l, i) => {
    const src = items[i];
    let tr = edges(src, unprotect(l, tokens[i]));
    if (!valid(src, tr) || tr === src) {
      const fixed = repairTokens(src, tr);
      if (fixed) tr = fixed;
    }
    out[src] = tr;
  });
  return out;
}

/** Traduce solo i pezzi di testo tra i token protetti: i segnaposto restano intatti. */
async function translateSegments(src, lang) {
  const parts = [];
  let last = 0;
  const re = new RegExp(PROTECT.source, "g");
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ type: "text", value: src.slice(last, m.index) });
    parts.push({ type: "tok", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  const texts = parts.filter((p) => p.type === "text" && p.value.trim());
  if (!texts.length) return src;
  const translated = await gtxMulti(
    texts.map((p) => p.value.replace(/\s+/g, " ").trim()),
    lang,
  );
  let ti = 0;
  return parts
    .map((p) => {
      if (p.type === "tok") return p.value;
      if (!p.value.trim()) return p.value;
      const tr = translated[ti++] ?? p.value;
      return edges(p.value, tr);
    })
    .join("");
}

async function acceptTranslation(c, src, tr, stats, shown) {
  let final = tr;
  if (!valid(src, final)) {
    const fixed = repairTokens(src, final);
    if (fixed) final = fixed;
  }
  if (valid(src, final) && (final !== src || !stillItalian(src))) {
    c[src] = final;
    stats.ok++;
    if (args.mostra && shown.length < Number(args.mostra)) shown.push([src, final]);
    return true;
  }
  /* nomi propri / brand: salva com'è così non ripete all'infinito */
  if (!stillItalian(src) || /Vinili|Caffè|Radio |Rai |Ed Sheeran|Leonardo|Lucio |Sinéad|Hilal|Nassr|La Liga|La Land/i.test(src)) {
    c[src] = src;
    stats.ok++;
    return true;
  }
  stats.bad++;
  return false;
}

async function google() {
  const langs = pickLangs();
  const conc = Math.max(1, Number(args.concorrenza || 3));
  const limit = args.n ? Number(args.n) : Infinity;
  for (const lang of langs) {
    const todo = missing(lang).slice(0, limit);
    if (!todo.length) {
      console.log(`${lang}: niente da tradurre.`);
      continue;
    }
    const c = cacheOf(lang);
    const groups = chunk(todo, 50, 4000);
    let done = 0;
    const stats = { ok: 0, bad: 0 };
    let next = 0;
    let lastSave = Date.now();
    const shown = [];
    const hard = [];
    const worker = async () => {
      while (next < groups.length) {
        const g = groups[next++];
        try {
          const res = await googleGroup(lang, g);
          for (const [src, tr] of Object.entries(res)) {
            const ok = await acceptTranslation(c, src, tr, stats, shown);
            if (!ok) hard.push(src);
          }
        } catch (e) {
          for (const src of g) hard.push(src);
          console.log(`  ${lang}: gruppo saltato (${e?.message || e}), ripasso a segmenti.`);
          await sleep(2000);
        }
        done++;
        if (Date.now() - lastSave > 20_000) {
          saveCache(lang, c);
          lastSave = Date.now();
          process.stdout.write(`  ${lang}: ${done}/${groups.length} gruppi\r`);
        }
        await sleep(150);
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
    /* secondo passaggio: solo i pezzi di testo tra markdown/segnaposto */
    for (const src of hard) {
      if (stats.bad > 0) stats.bad--; /* annulla lo scarto del primo passaggio */
      try {
        const tr = await translateSegments(src, lang);
        await acceptTranslation(c, src, tr, stats, shown);
      } catch {
        stats.bad++;
      }
      await sleep(100);
    }
    saveCache(lang, c);
    console.log(`${lang}: ${stats.ok} tradotte, ${stats.bad} scartate (segnaposto cambiati o errori: si riprovano al prossimo giro).`);
    for (const [s, t] of shown) console.log(`\n· ${s}\n→ ${t}`);
  }
}

/* ───────────────────────── file finali ───────────────────────── */

function costruisci() {
  const src = readJson(SORGENTI, null);
  if (!src) throw new Error("Prima esegui: node Scripts/i18n/traduci.mjs estrai");
  const sito = new Set(src.sito);
  const bot = new Set(src.bot);
  for (const lang of Object.keys(LANGS)) {
    const c = cacheOf(lang);
    /* sito: testi dell'interfaccia (chiave = italiano) */
    const ui = {};
    for (const s of [...sito].sort()) if (c[s] != null && c[s] !== s) ui[s] = c[s];
    if (CURATED.includes(lang)) {
      const prev = readJson(path.join(SITE, "src", "lib", "i18n", `ui-${lang}.json`), {});
      Object.assign(ui, prev);
    }
    writeJson(path.join(SITE, "src", "lib", "i18n", `ui-${lang}.json`), ui, false);
    /* sito: dizionario della testata per le lingue non curate (chiave → testo) */
    if (!CURATED.includes(lang)) {
      const pack = {};
      for (const [k, it] of Object.entries(src.shell)) if (c[it] != null) pack[k] = c[it];
      writeJson(path.join(SITE, "public", "js", "i18n", "locales", `${lang}.json`), pack, false);
    }
    /* bot: frasi dei messaggi (chiave = italiano) */
    const b = {};
    for (const s of [...bot].sort()) if (c[s] != null && c[s] !== s) b[s] = c[s];
    writeJson(path.join(BOT, "shared", "i18n", "bot", `${lang}.json`), b, false);
    console.log(`${lang}: sito ${Object.keys(ui).length}/${sito.size} · bot ${Object.keys(b).length}/${bot.size}`);
  }
}

/* ───────────────────────── comandi ───────────────────────── */

const cmd = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  if (cmd === "estrai") estrai();
  else if (cmd === "stima") stima();
  else if (cmd === "prova") await prova();
  else if (cmd === "google") await google();
  else if (cmd === "invia") await invia();
  else if (cmd === "stato") await stato();
  else if (cmd === "scarica") await scarica();
  else if (cmd === "costruisci") costruisci();
  else if (cmd === "tutto") {
    estrai();
    await invia();
    while ((await stato()) > 0) await sleep(5 * 60_000);
    await scarica();
    costruisci();
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  if (e instanceof Anthropic.AuthenticationError) console.error("Chiave API non valida.");
  else if (e instanceof Anthropic.RateLimitError) console.error("Troppe richieste: riprova fra qualche minuto.");
  else if (e instanceof Anthropic.APIError) console.error(`Errore dell'API (${e.status}): ${e.message}`);
  else console.error(e?.message || e);
  process.exit(1);
}
