// Compila bots-ts/src in bots-ts/dist con la stessa struttura di /opt/bot (Vinyls/, Coffee/, shared/, loader.js…).
// Ogni .ts diventa un .js; gli altri file si copiano. Non controlla i tipi (per quello: npm run check).
// TypeScript aggiunge in cima ai file `"use strict";` e il segno `__esModule`: se l'originale non li aveva
// si tolgono, così il JavaScript che gira è lo stesso degli originali (stessa modalità, stessi export).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arg } from "./args.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const SRC = arg("--src") || path.join(TS_ROOT, "src");
const DIST = arg("--dist") || path.join(TS_ROOT, "dist");

export const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2023,
  moduleDetection: ts.ModuleDetectionKind.Force,
  alwaysStrict: false,
  esModuleInterop: false,
  removeComments: false,
  newLine: ts.NewLineKind.LineFeed,
};

const ESMODULE_LINE = /^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\r?\n/m;

/** Il sorgente comincia con la direttiva "use strict"? (dopo commenti e shebang) */
function hasUseStrict(source) {
  const sf = ts.createSourceFile("x.ts", source, ts.ScriptTarget.ES2023, false, ts.ScriptKind.TS);
  const first = sf.statements[0];
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use strict");
}

export function compile(source, fileName) {
  const r = ts.transpileModule(source, { compilerOptions: COMPILER_OPTIONS, fileName, reportDiagnostics: true });
  const errors = (r.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  let out = r.outputText;
  if (!hasUseStrict(source)) out = out.replace(/^((?:#![^\n]*\n)?)"use strict";\r?\n/, "$1");
  out = out.replace(ESMODULE_LINE, "");
  return { out, errors };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // mai dentro node_modules o i collegamenti: sono i pacchetti veri degli originali
    if (e.name === "node_modules" || e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("manca src/: lancia prima npm run convert");
    process.exit(1);
  }
  const wanted = new Set();
  let compiled = 0;
  let copied = 0;
  const failures = [];
  for (const full of walk(SRC)) {
    const rel = path.relative(SRC, full);
    const isTs = rel.endsWith(".ts") && !rel.endsWith(".d.ts");
    const dest = path.join(DIST, isTs ? rel.replace(/\.ts$/, ".js") : rel);
    wanted.add(path.normalize(dest));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (isTs) {
      const { out, errors } = compile(fs.readFileSync(full, "utf8"), rel);
      if (errors.length) {
        failures.push(`${rel}: ${ts.flattenDiagnosticMessageText(errors[0].messageText, " ")}`);
        continue;
      }
      if (!fs.existsSync(dest) || fs.readFileSync(dest, "utf8") !== out) fs.writeFileSync(dest, out);
      compiled += 1;
    } else {
      const data = fs.readFileSync(full);
      if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(data)) fs.writeFileSync(dest, data);
      copied += 1;
    }
  }
  let removed = 0;
  if (fs.existsSync(DIST)) {
    for (const full of walk(DIST)) if (!wanted.has(path.normalize(full))) (fs.rmSync(full), (removed += 1));
  }
  // i pacchetti propri di Vinyls/Coffee (es. canvas) stanno nei loro node_modules: in locale dist li usa tramite un
  // collegamento, così trova gli stessi pacchetti degli originali (sulla VPS dist va in /opt/bot, dove ci sono già)
  const REPO = path.resolve(TS_ROOT, "..");
  for (const bot of ["Vinyls", "Coffee"]) {
    const target = path.join(REPO, bot, "node_modules");
    const link = path.join(DIST, bot, "node_modules");
    if (fs.existsSync(target) && !fs.existsSync(link)) fs.symlinkSync(target, link, "junction");
  }
  console.log(`compilati ${compiled} file, copiati ${copied}, tolti ${removed} vecchi`);
  if (failures.length) {
    console.error(`\n${failures.length} file con errori di sintassi:`);
    for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
