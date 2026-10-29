// Carica ogni modulo dei bot (originale e versione TS compilata) e confronta cosa esporta:
// stesso tipo, stesse chiavi, stessi errori di caricamento. Prova pratica che i due alberi si comportano uguali.
//   node tools/load-compare.cjs            (gira da solo in due processi separati)
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TS_ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(TS_ROOT, "..");
const DIRS = ["Vinyls", "Coffee", "shared"];
/** File di avvio e script a sé: caricarli farebbe partire i bot (token, Discord, Mongo), quindi si saltano. */
const SKIP = [/^(Vinyls|Coffee)\/index\.js$/, /^Vinyls\/run-sharded\.js$/, /(^|\/)scripts?\//i];

function listJs(base) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js")) {
        const rel = path.relative(base, full).split(path.sep).join("/");
        if (!SKIP.some((r) => r.test(rel))) out.push(rel);
      }
    }
  };
  for (const d of DIRS) walk(path.join(base, d));
  return out.sort();
}

function describe(v) {
  const t = v === null ? "null" : typeof v;
  if (t === "function") return `function(${v.length}):${Object.keys(v).sort().join(",")}`;
  if (t === "object") return `object:${Object.keys(v).sort().join(",")}`;
  return t;
}

if (process.argv[2] === "--child") {
  // processo figlio: carica tutto da una radice e stampa il risultato in JSON
  const base = process.argv[3];
  const res = {};
  const origLog = console.log;
  for (const k of ["log", "info", "warn", "error", "debug"]) console[k] = () => {};
  process.on("unhandledRejection", () => {});
  // un modulo che chiude il processo conta come errore di caricamento, uguale nei due alberi
  process.exit = (code) => {
    throw new Error(`process.exit(${code})`);
  };
  process.on("uncaughtException", () => {});
  for (const rel of listJs(base)) {
    // ogni modulo come lo caricherebbe il bot; gli errori si confrontano solo per tipo e messaggio senza percorso
    try {
      res[rel] = describe(require(path.join(base, rel)));
    } catch (e) {
      res[rel] = `ERRORE ${e && e.code ? e.code : ""} ${String(e && e.message).split("\n")[0].replace(/[A-Z]:\\[^']*?(?:bots-ts\\dist\\)?(Vinyls|Coffee|shared)/g, "$1").replace(/\\/g, "/")}`;
    }
  }
  fs.writeFileSync(process.argv[4], JSON.stringify(res));
  origLog("ok");
  process.reallyExit(0);
}

const tmp = (n) => path.join(require("node:os").tmpdir(), `vc-load-${n}.json`);
for (const [n, base] of [["orig", REPO], ["ts", path.join(TS_ROOT, "dist")]]) {
  execFileSync(process.execPath, [__filename, "--child", base, tmp(n)], { stdio: "ignore", timeout: 600_000, cwd: require("node:os").tmpdir() });
}
const a = JSON.parse(fs.readFileSync(tmp("orig"), "utf8"));
const b = JSON.parse(fs.readFileSync(tmp("ts"), "utf8"));
const diffs = [];
// correzioni fatte apposta in bots-ts (tools/differenze-volute.json): si mostrano ma non sono errori
let INTENTIONAL = {};
try {
  INTENTIONAL = JSON.parse(fs.readFileSync(path.join(__dirname, "differenze-volute.json"), "utf8"));
} catch {}
const intentional = [];
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k] && INTENTIONAL[k]) intentional.push(`${k} (${INTENTIONAL[k]})`);
  else if (a[k] !== b[k]) diffs.push(`${k}\n    orig: ${a[k]}\n    ts:   ${b[k]}`);
const loaded = Object.values(a).filter((v) => !v.startsWith("ERRORE")).length;
console.log(`${Object.keys(a).length} moduli, ${loaded} caricati senza errori (gli altri falliscono uguale in entrambi)`);
if (intentional.length) console.log(`${intentional.length} moduli diversi apposta: ${intentional.join(", ")}`);
if (diffs.length) {
  console.log(`${diffs.length} differenze:\n${diffs.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("stessi export in tutti i moduli ✓");
