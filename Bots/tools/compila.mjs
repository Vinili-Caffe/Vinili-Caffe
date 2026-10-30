// Traduce i TypeScript di src/ in JavaScript per la VPS, con le stesse opzioni che usa tsx a runtime
// (esbuild: CommonJS, keepNames), così il codice che gira è identico a quello di prima. Sulla VPS ogni
// .ts è sostituito dal suo .js nella stessa cartella: dati, log e backup che usano __dirname restano dove sono.
// Il .js non va mai accanto al .ts: i caricatori di comandi/eventi caricherebbero i file due volte.
//   node tools/compila.mjs                       → tutto src/ in build/js/
//   node tools/compila.mjs Vinili/x.ts Caffè/y.ts → solo quei file
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "build", "js");
const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8"));
// node20: sulla VPS c'è anche Node 20 nel PATH (pm2 usa il 22 di nvm): il codice deve andare su entrambi
const NODE_TARGET = "node20";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((a) => path.join(SRC, a.replace(/\\/g, "/").replace(/^\.?\/?(src\/)?/, "")))
  : walk(SRC);
if (!args.length) fs.rmSync(OUT, { recursive: true, force: true });

let errors = 0;
for (const file of files) {
  if (!file.endsWith(".ts") || !fs.existsSync(file)) {
    console.error(`manca o non è .ts: ${path.relative(SRC, file)}`);
    errors += 1;
    continue;
  }
  const rel = path.relative(SRC, file);
  try {
    const res = esbuild.transformSync(fs.readFileSync(file, "utf8"), {
      loader: "ts",
      format: "cjs",
      platform: "node",
      target: NODE_TARGET,
      keepNames: true,
      sourcefile: rel,
      tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
    });
    const dest = path.join(OUT, rel.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, res.code);
  } catch (err) {
    errors += 1;
    console.error(`errore in ${rel}: ${err?.message || err}`);
  }
}
console.log(`compilati ${files.length - errors} file in build/js${errors ? `, ${errors} errori` : ""}`);
process.exit(errors ? 1 : 0);
