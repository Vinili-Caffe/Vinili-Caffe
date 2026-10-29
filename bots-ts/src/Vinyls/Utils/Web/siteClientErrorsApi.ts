/* siteClientErrors1: registro degli errori JavaScript che capitano ai visitatori del sito.
   POST /webhooks/site-client-error { message, stack?, url?, kind? } → riga JSON in logs/site-client-errors.log
   - niente login (gli errori capitano anche agli ospiti), niente dati personali: solo testo dell'errore,
     pagina e browser; l'IP serve solo al limite di invii e non viene salvato
   - massimo 20 errori al minuto per IP e testi tagliati; il file ruota a 2 MB (tiene il precedente .1)
   GET /webhooks/site-client-error/recent?limit=50 con header X-Internal-Notify: ultimi errori (per lo staff tecnico) */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "site-client-errors.log");
const MAX_BYTES = 2 * 1024 * 1024;
const PER_MINUTE = 20;
const hits = new Map();

function clip(v?, n?) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
    .slice(0, n);
}

function clientIp(req?) {
  return String(req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.ip || "").slice(0, 64);
}

function allowed(ip?) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t?) => now - t < 60_000);
  if (list.length >= PER_MINUTE) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

function rotateIfNeeded() {
  try {
    if (fs.statSync(LOG_FILE).size > MAX_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    /* file non ancora creato */
  }
}

function handleSiteClientErrorPost(req?, res?) {
  const ip = clientIp(req);
  if (!allowed(ip)) return res.status(429).json({ ok: false });
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const message = clip(b.message, 400);
  if (!message) return res.status(400).json({ ok: false });
  const row = {
    at: new Date().toISOString(),
    kind: clip(b.kind || "error", 20),
    message,
    stack: clip(b.stack, 1500),
    url: clip(b.url, 300),
    ua: clip(req.headers["user-agent"], 200),
  };
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(row)}\n`);
  } catch (err) {
    global.logger?.warn?.("[siteClientErrors] scrittura:", err?.message || err);
  }
  return res.status(204).end();
}

function handleSiteClientErrorRecent(req?, res?) {
  const secret = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "").trim();
  if (!secret || secret === "local") return res.status(503).json({ ok: false, error: "misconfigured" });
  if (String(req.headers["x-internal-notify"] || "") !== secret) return res.status(403).json({ ok: false });
  const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 50));
  let rows = [];
  try {
    rows = fs
      .readFileSync(LOG_FILE, "utf8")
      .trim()
      .split("\n")
      .slice(-limit)
      .map((l?) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    rows = [];
  }
  return res.json({ ok: true, rows });
}

export = { handleSiteClientErrorPost, handleSiteClientErrorRecent };
