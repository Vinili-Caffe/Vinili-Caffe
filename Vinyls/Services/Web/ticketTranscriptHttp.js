const fs = require("node:fs");
const path = require("node:path");
const Ticket = require("../Guild/guildFeatureBucketTicketModel");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const {
  normalizeTranscriptViewTokenParam,
  timingSafeHexEq,
} = require("../../Utils/Ticket/ticketTranscriptSecure");
const { resolvePublicSiteBase } = require("../../Utils/Web/verifyOauthPublicUrl");
const {
  fetchDiscordUserIdFromUserAccessToken,
  canUserViewTicketTranscript,
  parseAuthorizationBearer,
} = require("./ticketTranscriptAccess");

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const ipRate = new Map();
const RATE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "ticketTranscriptRateSnapshot.json");
let rateLoaded = false;

function ensureRateLoaded() {
  if (rateLoaded) return;
  rateLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: RATE_SNAPSHOT_PATH,
    walPath: `${RATE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_ticket_transcript_rate",
    version: 1,
    fallback: {},
  });
  const now = Date.now();
  for (const [ip, row] of Object.entries(raw || {})) {
    const resetAt = Number(row?.resetAt || 0);
    if (!ip || resetAt <= now) continue;
    ipRate.set(ip, {
      count: Math.max(0, Number(row?.count || 0)),
      resetAt,
    });
  }
}

function persistRateNow() {
  const now = Date.now();
  const payload = {};
  for (const [ip, row] of ipRate.entries()) {
    if (!ip || Number(row?.resetAt || 0) <= now) continue;
    payload[ip] = {
      count: Math.max(0, Number(row?.count || 0)),
      resetAt: Number(row?.resetAt || now + RATE_WINDOW_MS),
    };
  }
  writeSnapshotWithMeta({
    filePath: RATE_SNAPSHOT_PATH,
    walPath: `${RATE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_ticket_transcript_rate",
    version: 1,
    payload,
  });
}

const ACCESS_TOKEN_KEY = "vc_discord_access_token";
const EXPIRES_AT_KEY = "vc_discord_expires_at";

function transcriptClientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (xf) return xf;
  return String(req.socket?.remoteAddress || "unknown");
}

function allowTranscriptRate(ip) {
  ensureRateLoaded();
  const now = Date.now();
  let row = ipRate.get(ip);
  if (!row || row.resetAt <= now) {
    row = { count: 0, resetAt: now + RATE_WINDOW_MS };
    ipRate.set(ip, row);
  }
  row.count += 1;
  if (row.count > RATE_MAX) return false;
  if (ipRate.size > 50_000) ipRate.clear();
  persistRateNow();
  return true;
}

function wantsTranscriptGateHtml(req) {
  const a = String(req.headers.accept || "").toLowerCase();
  if (!a || a.includes("*/*") || a.includes("text/html")) return true;
  if (a.includes("application/json") && !a.includes("text/html")) return false;
  return true;
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTranscriptGateHtml(loginUrl, returnPath) {
  const hrefLogin = escHtml(loginUrl);
  const pathJson = JSON.stringify(returnPath);
  const tokenKey = JSON.stringify(ACCESS_TOKEN_KEY);
  const expKey = JSON.stringify(EXPIRES_AT_KEY);
  return (
    "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Transcript — accesso</title>" +
    "<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}" +
    ".box{max-width:28rem;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.5rem;}" +
    "h1{font-size:1.125rem;margin:0 0 .75rem;}" +
    "p{font-size:.925rem;line-height:1.5;color:#94a3b8;margin:0 0 1rem;}" +
    "a.btn{display:inline-block;background:#5865f2;color:#fff;text-decoration:none;padding:.65rem 1rem;border-radius:8px;font-weight:600;}" +
    "a.btn:hover{filter:brightness(1.05);}#err{color:#fca5a5;font-size:.9rem;margin-top:.75rem;}</style></head><body>" +
    '<div class="box"><h1>Accesso al transcript</h1><p>Per leggere il transcript devi accedere con Discord. ' +
    "Solo l'autore del ticket o lo staff del server possono visualizzarlo.</p>" +
    '<p><a class="btn" href="' +
    hrefLogin +
    '">Accedi con Discord</a></p>' +
    '<p id="vc-tr-wait" style="display:none;color:#94a3b8;font-size:.9rem;">Caricamento transcript…</p>' +
    '<p id="err" hidden></p></div>' +
    "<script>(function(){var P=" +
    pathJson +
    ";var TK=" +
    tokenKey +
    ";var EX=" +
    expKey +
    ";var wait=document.getElementById('vc-tr-wait');var err=document.getElementById('err');" +
    "function getTok(){try{var t=localStorage.getItem(TK)||'';var exp=Number(localStorage.getItem(EX)||0);if(!t||!exp||Date.now()>=exp)return '';return t;}catch(e){return '';}}" +
    "function showErr(m){if(err){err.hidden=false;err.textContent=m;}if(wait)wait.style.display='none';}" +
    "function loadTx(){var tok=getTok();if(!tok){return;}if(wait)wait.style.display='block';" +
    "fetch(P,{headers:{Authorization:'Bearer '+tok},credentials:'omit',cache:'no-store'})" +
    ".then(function(r){if(r.status===200)return r.text();if(r.status===401){try{localStorage.removeItem(TK);localStorage.removeItem(EX);}catch(e){}throw new Error('sessione');}" +
    "if(r.status===403)throw new Error('forbidden');throw new Error('http');})" +
    ".then(function(html){document.open('text/html','replace');document.write(html);document.close();})" +
    ".catch(function(e){if(wait)wait.style.display='none';if(String(e&&e.message)==='forbidden'){" +
    "showErr('Accesso negato: solo l\\'autore del ticket o lo staff possono leggere questo transcript.');}else if(String(e&&e.message)==='sessione'){" +
    "showErr('Sessione scaduta. Usa «Accedi con Discord».');}else{showErr('Impossibile caricare il transcript. Riprova.');}});}" +
    "loadTx();})();<\/script></body></html>"
  );
}

function sendTranscriptHtmlResponse(ticketDoc, res) {
  const inline = typeof ticketDoc.transcriptHtmlInline === "string" ? ticketDoc.transcriptHtmlInline : "";
  if (inline) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(inline);
  }
  const fp = String(ticketDoc.transcriptHtmlPath || "").trim();
  if (!fp || !fs.existsSync(fp)) {
    return res.status(404).type("text/plain").send("Transcript non disponibile.");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).sendFile(fp, (err) => {
    if (err) {
      global.logger?.warn?.("[TICKET TRANSCRIPT HTTP] sendFile:", err?.message || err);
      if (!res.headersSent) res.status(500).type("text/plain").send("Errore interno.");
    }
  });
}

function mountTicketTranscriptRoutes(app, client) {
  app.get("/ticket-transcript/:token", async (req, res) => {
    const ip = transcriptClientIp(req);
    if (!allowTranscriptRate(ip)) {
      res.setHeader("Retry-After", "60");
      return res.status(429).type("text/plain").send("Troppe richieste. Riprova tra poco.");
    }

    const param = normalizeTranscriptViewTokenParam(req.params?.token);
    if (!param) {
      return res.status(404).type("text/plain").send("Non trovato.");
    }

    let ticketDoc;
    try {
      ticketDoc = await Ticket.findOneByTranscriptViewToken(param);
    } catch (err) {
      global.logger?.warn?.("[TICKET TRANSCRIPT HTTP] lookup:", err?.message || err);
      return res.status(500).type("text/plain").send("Errore interno.");
    }

    if (!ticketDoc) {
      return res.status(404).type("text/plain").send("Non trovato.");
    }

    const storedTok = String(ticketDoc.transcriptViewToken || "").toLowerCase();
    if (!timingSafeHexEq(storedTok, param)) {
      return res.status(404).type("text/plain").send("Non trovato.");
    }

    const exp = ticketDoc.transcriptViewExpiresAt ? new Date(ticketDoc.transcriptViewExpiresAt).getTime() : 0;
    if (Number.isFinite(exp) && exp > 0 && exp < Date.now()) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.status(410).type("text/plain").send("Transcript scaduto.");
    }

    const bearer = parseAuthorizationBearer(req);
    if (!bearer) {
      if (!wantsTranscriptGateHtml(req)) {
        return res.status(401).json({
          ok: false,
          error: "login_required",
          message: "Richiesto login Discord: header Authorization: Bearer <token> (stesso token OAuth del sito).",
        });
      }
      const base = resolvePublicSiteBase();
      const returnPath = String(req.path || `/ticket-transcript/${param}`);
      const qs = new URLSearchParams({ r: returnPath });
      const loginUrl = `${base}/webhooks/site-verify/oauth-start?${qs.toString()}`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(buildTranscriptGateHtml(loginUrl, returnPath));
    }

    if (!client) {
      return res.status(503).type("text/plain").send("Servizio non disponibile.");
    }

    const authMe = await fetchDiscordUserIdFromUserAccessToken(bearer);
    if (!authMe.ok) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res
        .status(Number(authMe.status) || 401)
        .type("text/plain")
        .send(authMe.message || "Sessione non valida.");
    }

    const allow = await canUserViewTicketTranscript(client, authMe.userId, ticketDoc);
    if (!allow.ok) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res
        .status(Number(allow.status) || 403)
        .type("text/plain")
        .send(allow.message || "Accesso negato.");
    }

    return sendTranscriptHtmlResponse(ticketDoc, res);
  });
}

module.exports = { mountTicketTranscriptRoutes };