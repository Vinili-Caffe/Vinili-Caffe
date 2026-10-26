// Controllo automatico di out/ prima di pubblicare su www (lo lancia scripts/deploy.sh www).
// Per ogni pagina, su PC e su telefono (con "riduci movimento"), cerca:
//   - errori JavaScript (eccezioni, errori React come #418, console.error)
//   - pagina più larga dello schermo (sbordo orizzontale)
//   - pagina senza contenuto
//   - script bloccati dalle regole di sicurezza (CSP)
// Nessuna dipendenza: usa un browser Chromium già installato (Playwright, Chrome, Edge o Brave)
// comandato via DevTools Protocol. Uscita 1 se trova problemi.
//   node scripts/check-site.mjs            tutte le pagine
//   node scripts/check-site.mjs / /wiki/   solo quelle indicate
//   CHECK_BROWSER="C:/.../chrome.exe"      per scegliere il browser
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const SERVE = fileURLToPath(new URL("./serve-out.mjs", import.meta.url));
const PORT = 4311;
const CDP_PORT = 9334;
// CHECK_ORIGIN=https://www.viniliecaffe.it → controlla il sito vero (dopo il deploy) invece di out/ in locale
const LIVE = (process.env.CHECK_ORIGIN || "").replace(/\/$/, "");
const ORIGIN = LIVE || `http://127.0.0.1:${PORT}`;
const PARALLEL = 4;
const SETTLE_MS = 2500;

/** Pagine che non hanno senso senza parametri o login: si controllano solo che non esplodano. */
const SKIP = new Set(["/404/", "/_not-found/"]);

/** Pagine di passaggio (senza login mostrano solo "Accedi" o rimandano altrove): niente controllo "vuota". */
const SHORT_OK = new Set([
  "/profilo/",
  "/staff/inbox/",
  "/user/",
  "/personalizza/", // senza login: solo gate Accedi
  "/dashboard/transcript/", // senza ?id= e login mostra solo il gate
  "/dashboard/",
  "/dashboard/faq/",
  "/dashboard/feedback/",
  "/dashboard/guild/",
  "/dashboard/premium/",
  "/dashboard/premium/crediti/",
  "/dashboard/profilo/",
  "/dashboard/profilo/abbonamento/",
  "/dashboard/recensioni/",
  "/staff/",
  "/staff/compiti/",
  "/staff/gestione/",
  "/staff/guida/",
  "/staff/organico/",
  "/staff/pause/",
  "/staff/profilo/",
  "/staff/punti-tolti/",
  "/staff/pm/",
  "/notifications/",
  "/tickets/",
  "/seratafilm/",
  "/seratafilm/accesso-richiesto/",
  "/appelli/",
  "/appelli/accesso-richiesto/",
  "/candidature/",
  "/candidature/accesso-richiesto/",
]);

/** Rumore noto che non dipende dal sito. */
const IGNORE = [/favicon/i, /googletagmanager|google-analytics|gtag/i, /Failed to load resource/i, /ERR_BLOCKED_BY_CLIENT/i, /WebSocket connection/i];

function findBrowser() {
  if (process.env.CHECK_BROWSER && existsSync(process.env.CHECK_BROWSER)) return process.env.CHECK_BROWSER;
  const la = process.env.LOCALAPPDATA || "";
  const pw = join(la, "ms-playwright");
  const cands = [];
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).sort().reverse()) {
      cands.push(join(pw, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe"));
      cands.push(join(pw, d, "chrome-win", "chrome.exe"));
    }
  }
  cands.push(
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    join(la, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    join(la, "BraveSoftware/Brave-Browser/Application/brave.exe"),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  );
  return cands.find((p) => existsSync(p)) || null;
}

function listPages() {
  const pages = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("_")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else if (name === "index.html") pages.push(rel);
    }
  };
  walk(OUT, "/");
  return pages.filter((p) => !SKIP.has(p)).sort();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {
      /* non ancora pronto */
    }
    await wait(200);
  }
  throw new Error(`timeout ${url}`);
}

/** Connessione CDP minima: un WebSocket, sessioni per scheda (flatten). */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  };
  const ready = new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  return { ready, send, on: (fn) => listeners.add(fn), close: () => ws.close() };
}

const MODES = [
  { name: "PC", width: 1366, height: 900, mobile: false, reduce: false },
  { name: "telefono", width: 390, height: 844, mobile: true, reduce: true },
];

async function checkPage(cdp, path, mode) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const problems = [];
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      const text = d.exception?.description || d.text || "eccezione";
      if (!IGNORE.some((r) => r.test(text))) problems.push(`errore JS: ${text.split("\n")[0].slice(0, 160)}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (!IGNORE.some((r) => r.test(text))) problems.push(`console.error: ${text.split("\n")[0].slice(0, 160)}`);
    }
  };
  cdp.on(onEvent);
  await s("Runtime.enable");
  await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.mobile });
  if (mode.mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: mode.reduce ? "reduce" : "no-preference" }] });
  // niente banner cookie a coprire, tema di default
  await s("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem("vc_cookie_consent","rejected")}catch(e){};document.addEventListener("securitypolicyviolation",function(e){console.error("CSP bloccato: "+e.violatedDirective+" "+(e.blockedURI||"inline"))});`,
  });
  await s("Page.navigate", { url: ORIGIN + path });
  await wait(SETTLE_MS);
  const measure = async () =>
    (
      await s("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const d = document.documentElement;
          const main = document.querySelector("main");
          return { overflow: d.scrollWidth - d.clientWidth, text: (main ? main.innerText : document.body.innerText).trim().length };
        })()`,
      })
    ).result.value || {};
  // i dati arrivano dal server: se la pagina sembra vuota si riprova un paio di volte prima di segnalarla
  let v = await measure();
  for (let i = 0; i < 3 && (v.text || 0) < 40; i++) {
    await wait(2000);
    v = await measure();
  }

  if (v.overflow > 1) problems.push(`sborda di ${v.overflow}px in larghezza`);
  if ((v.text || 0) < 40 && !SHORT_OK.has(path)) problems.push("pagina quasi vuota");
  await cdp.send("Target.closeTarget", { targetId });
  return problems;
}

async function main() {
  if (!LIVE && !existsSync(join(OUT, "index.html"))) {
    console.error("manca out/: lancia prima npm run build");
    process.exit(1);
  }
  const browser = findBrowser();
  if (!browser) {
    console.error("nessun browser Chromium trovato (imposta CHECK_BROWSER)");
    process.exit(1);
  }
  // Git Bash su Windows trasforma "/wiki/" in "C:/Program Files/Git/wiki/": si torna al percorso del sito
  const args = process.argv.slice(2).map((a) => {
    const p = a.replace(/\\/g, "/").replace(/^[A-Za-z]:\/.*?\/Git(?=\/)/, "");
    return (p.startsWith("/") ? p : `/${p}`).replace(/\/?$/, "/");
  });
  const pages = args.length ? args : listPages();

  const server = LIVE ? null : spawn(process.execPath, [SERVE], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  const profile = mkdtempSync(join(tmpdir(), "vc-check-"));
  const chrome = spawn(
    browser,
    [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--disable-gpu", "--mute-audio", "about:blank"],
    { stdio: "ignore" },
  );
  const cleanup = () => {
    try {
      chrome.kill();
    } catch {}
    try {
      server?.kill();
    } catch {}
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {}
    }, 500);
  };

  let failed = 0;
  try {
    if (!LIVE) await waitHttp(`${ORIGIN}/`);
    const ver = await (await waitHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    const cdp = connect(ver.webSocketDebuggerUrl);
    await cdp.ready;

    const jobs = pages.flatMap((p) => MODES.map((m) => ({ p, m })));
    console.log(`controllo ${pages.length} pagine × ${MODES.length} modalità con ${browser.split(/[\\/]/).pop()}…`);
    const report = [];
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        let problems;
        try {
          problems = await checkPage(cdp, job.p, job.m);
        } catch (e) {
          problems = [`controllo non riuscito: ${e.message}`];
        }
        if (problems.length) report.push({ ...job, problems: [...new Set(problems)] });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    cdp.close();

    report.sort((a, b) => a.p.localeCompare(b.p));
    for (const r of report) {
      console.log(`✗ ${r.p} (${r.m.name})`);
      for (const x of r.problems) console.log(`    ${x}`);
    }
    failed = report.length;
    console.log(failed ? `\n${failed} problemi: niente pubblicazione su www.` : "\ntutto ok ✓");
  } finally {
    cleanup();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
