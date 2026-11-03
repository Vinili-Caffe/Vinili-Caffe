// Traduce i TypeScript di src/ in JavaScript per la VPS, con le stesse opzioni che usa tsx a runtime
// (esbuild: CommonJS, keepNames), così il codice che gira è identico a quello di prima. Sulla VPS ogni
// .ts è sostituito dal suo .js nella stessa cartella: dati, log e backup che usano __dirname restano dove sono.
// Il .js non va mai accanto al .ts: i caricatori di comandi/eventi caricherebbero i file due volte.
//   node Deploy/compila.mjs                       → tutto Bots/src/ in Bots/build/js/
//   node Deploy/compila.mjs Vinili/x.ts Caffè/y.ts → solo quei file
// COMPILA_ROOT=/tmp/stage  → usa stage/src e stage/build (pubblica remota)
// Su VPS: /opt/bot/bots-ts/tools/compila.mjs → ROOT = parent di tools/
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveRoot() {
  if (process.env.COMPILA_ROOT) return path.resolve(String(process.env.COMPILA_ROOT));
  // Locale: script in Deploy/ → Bots/
  const botsSibling = path.resolve(HERE, "..", "Bots");
  if (fs.existsSync(path.join(botsSibling, "src"))) return botsSibling;
  // VPS / legacy: script in bots-ts/tools/ → bots-ts/
  return path.resolve(HERE, "..");
}

const ROOT = resolveRoot();
const SRC = path.join(ROOT, "src");
const ARCHIVIO = path.join(ROOT, "archivio");
const OUT = path.join(ROOT, "build", "js");
const OUT_ARCH = path.join(ROOT, "build", "archivio");
const tsconfigPath = path.join(ROOT, "tsconfig.json");
const tsconfigFallback = path.join(HERE, "..", "Bots", "tsconfig.json");
const tsconfig = JSON.parse(
  fs.readFileSync(fs.existsSync(tsconfigPath) ? tsconfigPath : tsconfigFallback, "utf8"),
);

// esbuild: da Bots/node_modules in locale, da ROOT/node_modules su VPS/stage
const require = createRequire(
  fs.existsSync(path.join(ROOT, "package.json"))
    ? path.join(ROOT, "package.json")
    : path.join(HERE, "..", "Bots", "package.json"),
);
const esbuild = require("esbuild");
// node20: sulla VPS c'è anche Node 20 nel PATH (pm2 usa il 22 di nvm): il codice deve andare su entrambi
const NODE_TARGET = "node20";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function compileList(files, rootForRel, outRoot, label) {
  let errors = 0;
  let ok = 0;
  for (const file of files) {
    if (!file.endsWith(".ts") || !fs.existsSync(file)) {
      console.error(`manca o non è .ts: ${path.relative(rootForRel, file)}`);
      errors += 1;
      continue;
    }
    const rel = path.relative(rootForRel, file);
    try {
      const res = esbuild.transformSync(fs.readFileSync(file, "utf8"), {
        loader: "ts",
        format: "cjs",
        platform: "node",
        target: NODE_TARGET,
        keepNames: true,
        sourcefile: `${label}/${rel}`,
        tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
      });
      const dest = path.join(outRoot, rel.replace(/\.ts$/, ".js"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, res.code);
      ok += 1;
    } catch (err) {
      errors += 1;
      console.error(`errore in ${label}/${rel}: ${err?.message || err}`);
    }
  }
  return { ok, errors, total: files.length };
}

const args = process.argv.slice(2);
if (args.length) {
  const files = args.map((a) => path.join(SRC, a.replace(/\\/g, "/").replace(/^\.?\/?(src\/)?/, "")));
  const r = compileList(files, SRC, OUT, "src");
  console.log(`compilati ${r.ok} file in build/js${r.errors ? `, ${r.errors} errori` : ""}`);
  process.exit(r.errors ? 1 : 0);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(OUT_ARCH, { recursive: true, force: true });
const srcRes = compileList(walk(SRC), SRC, OUT, "src");
const archRes = compileList(walk(ARCHIVIO), ARCHIVIO, OUT_ARCH, "archivio");
console.log(
  `compilati src ${srcRes.ok}/${srcRes.total} → build/js; archivio ${archRes.ok}/${archRes.total} → build/archivio` +
    (srcRes.errors + archRes.errors ? `, ${srcRes.errors + archRes.errors} errori` : ""),
);
process.exit(srcRes.errors + archRes.errors ? 1 : 0);
