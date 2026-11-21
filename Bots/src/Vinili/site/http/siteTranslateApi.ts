/**
 * Traduzione al volo dei testi che il sito non ha nei dizionari: soprattutto quelli scritti dagli utenti
 * (recensioni, feedback, confessionale…). Il sito manda i testi visibili nella pagina, qui si traducono con
 * Google Traduttore e si tengono in memoria, così lo stesso testo si traduce una volta sola.
 *
 *   POST /webhooks/site-translate  { lang: "en", texts: ["…", "…"] }  →  { ok, translations: ["…", "…"] }
 *
 * Niente dati dell'utente oltre al testo già pubblico sulla pagina; nessun salvataggio su disco.
 */
const LANGS = new Set(["en", "es", "fr", "de", "pt", "ru", "zh", "ja", "ko", "ar", "nl", "pl", "tr", "hi", "id", "uk", "vi", "ro", "sv"]);
const GT: Record<string, string> = { zh: "zh-CN" };
const MAX_TEXTS = 40;
const MAX_LEN = 1500;
const MAX_TOTAL = 20_000;
const CACHE_MAX = 60_000;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function remember(key: string, value: string) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/* indirizzi di Google che accettano più testi insieme; se uno rallenta si passa al successivo */
const ENDPOINTS = [
  "https://translate.googleapis.com/translate_a/t?client=gtx",
  "https://clients5.google.com/translate_a/t?client=dict-chrome-ex",
];
let endpointAt = 0;

/* menzioni, emoji di Discord e link restano come sono */
const KEEP = /<[@#:&!at][^<>\s]*>|https?:\/\/\S+/g;

async function googleMany(texts: string[], lang: string): Promise<string[] | null> {
  const tokens: string[][] = texts.map(() => []);
  const lines = texts.map((t, i) => t.replace(KEEP, (m) => `⟦${tokens[i].push(m) - 1}⟧`));
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const base = ENDPOINTS[endpointAt % ENDPOINTS.length];
    const body = new URLSearchParams();
    for (const l of lines) body.append("q", l);
    try {
      const res = await fetch(`${base}&sl=auto&tl=${encodeURIComponent(GT[lang] || lang)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [data];
      const out = arr.map((x: any) => (Array.isArray(x) ? String(x[0] ?? "") : String(x ?? "")));
      if (out.length !== texts.length) throw new Error("risposta incompleta");
      return out.map((t, i) => t.replace(/⟦\s*(\d+)\s*⟧/g, (m, n) => tokens[i][Number(n)] ?? m));
    } catch {
      endpointAt++;
    }
  }
  return null;
}

/* limite semplice per indirizzo: quanti testi al minuto */
const perIp = new Map<string, { n: number; at: number }>();
function allowed(ip: string, n: number): boolean {
  const now = Date.now();
  const row = perIp.get(ip);
  if (!row || now - row.at > 60_000) {
    perIp.set(ip, { n, at: now });
    if (perIp.size > 20_000) perIp.clear();
    return true;
  }
  row.n += n;
  return row.n <= 400;
}

export function mountSiteTranslateRoutes(app: any) {
  app.post("/webhooks/site-translate", async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    const lang = String(req.body?.lang || "").toLowerCase();
    const raw = Array.isArray(req.body?.texts) ? req.body.texts : [];
    if (!LANGS.has(lang) || !raw.length) return res.status(400).json({ ok: false, error: "richiesta non valida" });
    const texts: string[] = raw.slice(0, MAX_TEXTS).map((t: unknown) => String(t ?? "").slice(0, MAX_LEN));
    if (texts.reduce((a, t) => a + t.length, 0) > MAX_TOTAL) return res.status(413).json({ ok: false, error: "troppo testo" });
    const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    if (!allowed(ip, texts.length)) return res.status(429).json({ ok: false, error: "troppe richieste" });

    const out: (string | null)[] = texts.map((t) => cache.get(`${lang}\u0001${t}`) ?? null);
    const missing = [...new Set(texts.filter((t, i) => out[i] == null && t.trim()))];
    if (missing.length) {
      /* stessi testi chiesti da più visitatori insieme: una sola richiesta a Google */
      const own = missing.filter((t) => !inflight.has(`${lang}\u0001${t}`));
      if (own.length) {
        const job = googleMany(own, lang);
        own.forEach((t, i) =>
          inflight.set(
            `${lang}\u0001${t}`,
            job.then((r) => (r ? r[i] : null)),
          ),
        );
        const r = await job;
        own.forEach((t, i) => {
          inflight.delete(`${lang}\u0001${t}`);
          if (r?.[i]) remember(`${lang}\u0001${t}`, r[i]);
        });
      }
      for (const t of missing) {
        const p = inflight.get(`${lang}\u0001${t}`);
        if (p) {
          const v = await p.catch(() => null);
          if (v) remember(`${lang}\u0001${t}`, v);
        }
      }
      texts.forEach((t, i) => {
        if (out[i] == null) out[i] = cache.get(`${lang}\u0001${t}`) ?? null;
      });
    }
    return res.json({ ok: true, translations: out });
  });
}
