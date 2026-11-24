/** Number Quiz: elenco delle categorie e voci per giocare. Tutto pubblico, nessun login. */
import fs = require("fs");
import os = require("os");
import path = require("path");
import crypto = require("crypto");
const data = require("./siteNumberQuizData") as typeof import("./siteNumberQuizData");

const PLAYS_FILE = path.join(os.homedir(), ".vc-state", "number-quiz-plays.json");
let plays: Record<string, number> = {};
try {
  plays = JSON.parse(fs.readFileSync(PLAYS_FILE, "utf8")) || {};
} catch {
  plays = {};
}
let playsTimer: NodeJS.Timeout | null = null;
function savePlays() {
  if (playsTimer) return;
  playsTimer = setTimeout(() => {
    playsTimer = null;
    try {
      fs.mkdirSync(path.dirname(PLAYS_FILE), { recursive: true });
      fs.writeFileSync(PLAYS_FILE, JSON.stringify(plays), "utf8");
    } catch {
      /* il contatore non è importante */
    }
  }, 5000);
}

function publicCategory(c: (typeof data.CATEGORIES)[number]) {
  const st = data.categoryStatus(c.id);
  /* copertina: la prima voce con immagine tra le prime, così cambia poco */
  const cover = st.items.slice(0, 40).find((x) => x.image)?.image || "";
  return {
    id: c.id,
    topic: c.topic,
    title: c.title,
    question: c.question,
    description: c.description,
    emoji: c.emoji,
    unit: c.unit,
    format: c.format,
    count: st.count,
    ready: st.ready,
    cover,
    plays: plays[c.id] || 0,
  };
}

function handleNumberQuizCategoriesGet(_client?, _req?, res?) {
  data.warmNumberQuiz();
  res.set?.("Cache-Control", "public, max-age=60");
  return res.json({ ok: true, categories: data.CATEGORIES.map(publicCategory) });
}

function sample<T>(arr: T[], n: number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

async function handleNumberQuizCategoryGet(_client?, req?, res?) {
  try {
    data.warmNumberQuiz();
    const id = String(req.params?.id || "").trim();
    const cat = data.CATEGORIES.find((c) => c.id === id);
    if (!cat) return res.status(404).json({ ok: false, error: "not_found", message: "Questa categoria non esiste." });
    const items = await data.categoryItems(id, false);
    if (!items?.length) {
      return res.status(202).json({ ok: false, error: "preparing", message: "Stiamo preparando questa categoria: riprova tra un minuto." });
    }
    const n = Math.max(10, Math.min(120, Number(req.query?.n) || 80));
    let min = Infinity;
    let max = -Infinity;
    for (const x of items) {
      if (x.value < min) min = x.value;
      if (x.value > max) max = x.value;
    }
    return res.json({ ok: true, category: publicCategory(cat), items: sample(items, n), min, max });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] categoria:", err?.message || err);
    return res.status(500).json({ ok: false, error: "category_error" });
  }
}

function handleNumberQuizPlayPost(_client?, req?, res?) {
  const id = String(req.params?.id || "").trim();
  if (data.CATEGORIES.some((c) => c.id === id)) {
    plays[id] = (plays[id] || 0) + 1;
    savePlays();
  }
  return res.json({ ok: true });
}

/* Immagini per l'Attività di Discord: lì le immagini esterne sono bloccate, quindi passano da qui.
   Solo da questi siti (gli stessi delle categorie), solo immagini, al massimo 6 MB. */
const IMG_HOSTS = [
  /(^|\.)wikimedia\.org$/,
  /(^|\.)wikipedia\.org$/,
  /^cdn-images\.dzcdn\.net$/,
  /^e-cdns-images\.dzcdn\.net$/,
  /^static\.tvmaze\.com$/,
  /^s4\.anilist\.co$/,
  /^raw\.githubusercontent\.com$/,
  /^images\.openfoodfacts\.org$/,
];
const okHost = (u: URL) => u.protocol === "https:" && IMG_HOSTS.some((re) => re.test(u.hostname));

/* le immagini già scaricate restano: in memoria (le più recenti) e su disco, così non si chiede a Wikimedia ogni volta */
const IMG_DIR = path.join(os.homedir(), ".vc-state", "number-quiz-img");
const IMG_MEM_MAX = 80 * 1024 * 1024;
const imgMem = new Map<string, { type: string; buf: Buffer }>();
let imgMemBytes = 0;
const imgPending = new Map<string, Promise<{ type: string; buf: Buffer } | null>>();

function memPut(key: string, v: { type: string; buf: Buffer }) {
  if (imgMem.has(key)) return;
  imgMem.set(key, v);
  imgMemBytes += v.buf.length;
  while (imgMemBytes > IMG_MEM_MAX && imgMem.size) {
    const first = imgMem.keys().next().value as string;
    imgMemBytes -= imgMem.get(first)!.buf.length;
    imgMem.delete(first);
  }
}

/* Wikimedia rifiuta le raffiche: poche richieste alla volta verso lo stesso sito */
const hostBusy = new Map<string, number>();
async function hostSlot(host: string) {
  const max = /wikimedia|wikipedia/.test(host) ? 3 : 8;
  while ((hostBusy.get(host) || 0) >= max) await new Promise((r) => setTimeout(r, 60));
  hostBusy.set(host, (hostBusy.get(host) || 0) + 1);
  return () => hostBusy.set(host, Math.max(0, (hostBusy.get(host) || 1) - 1));
}

/* Wikimedia blocca i programmi che chiedono il file originale (quando la larghezza supera quella vera):
   in quel caso si riprova con miniature più piccole, che invece dà sempre */
async function downloadImage(url: URL): Promise<{ type: string; buf: Buffer } | null> {
  const filePath = /Special:FilePath/i.test(url.pathname);
  /* file originale su upload.wikimedia.org (non una miniatura): stessa cosa, si chiede la miniatura */
  const orig = url.hostname === "upload.wikimedia.org" && !url.pathname.includes("/thumb/")
    ? /^\/wikipedia\/([\w-]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/.exec(url.pathname)
    : null;
  const first = await downloadOnce(url, filePath || orig ? 1 : 4);
  if (first) return first;
  for (const w of ["500", "250", "120"]) {
    let smaller: URL | null = null;
    if (filePath) {
      smaller = new URL(url.href);
      smaller.searchParams.set("width", w);
    } else if (orig) {
      const [, wiki, a, ab, file] = orig;
      smaller = new URL(`https://upload.wikimedia.org/wikipedia/${wiki}/thumb/${a}/${ab}/${file}/${w}px-${file}`);
    }
    if (!smaller) return null;
    const v = await downloadOnce(smaller, 2);
    if (v) return v;
  }
  return null;
}

async function downloadOnce(url: URL, tries = 4): Promise<{ type: string; buf: Buffer } | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const release = await hostSlot(url.hostname);
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "NumberQuizGame/1.0 (quiz images)" }, signal: AbortSignal.timeout(15_000) });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
        continue;
      }
      const final = new URL(r.url || url.href);
      const type = String(r.headers.get("content-type") || "");
      if (!r.ok || !okHost(final) || !type.startsWith("image/")) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length > 6 * 1024 * 1024 ? null : { type, buf };
    } catch {
      await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)));
    } finally {
      release();
    }
  }
  return null;
}

async function cachedImage(url: URL) {
  const key = crypto.createHash("sha1").update(url.href).digest("hex");
  const hit = imgMem.get(key);
  if (hit) return hit;
  try {
    const type = fs.readFileSync(path.join(IMG_DIR, `${key}.type`), "utf8");
    const buf = fs.readFileSync(path.join(IMG_DIR, `${key}.bin`));
    const v = { type, buf };
    memPut(key, v);
    return v;
  } catch {
    /* non ancora su disco */
  }
  let job = imgPending.get(key);
  if (!job) {
    job = downloadImage(url).then((v) => {
      imgPending.delete(key);
      if (v) {
        memPut(key, v);
        try {
          fs.mkdirSync(IMG_DIR, { recursive: true });
          fs.writeFileSync(path.join(IMG_DIR, `${key}.bin`), v.buf);
          fs.writeFileSync(path.join(IMG_DIR, `${key}.type`), v.type);
        } catch {
          /* senza disco resta solo in memoria */
        }
      }
      return v;
    });
    imgPending.set(key, job);
  }
  return job;
}

async function handleNumberQuizImageGet(_client?, req?, res?) {
  let url: URL;
  try {
    url = new URL(String(req.query?.u || ""));
  } catch {
    return res.status(400).end();
  }
  if (!okHost(url)) return res.status(403).end();
  try {
    const v = await cachedImage(url);
    if (!v) return res.status(502).end();
    res.set?.("Content-Type", v.type);
    res.set?.("Cache-Control", "public, max-age=604800, immutable");
    return res.status(200).send(v.buf);
  } catch {
    return res.status(504).end();
  }
}

export = { handleNumberQuizCategoriesGet, handleNumberQuizCategoryGet, handleNumberQuizPlayPost, handleNumberQuizImageGet };
