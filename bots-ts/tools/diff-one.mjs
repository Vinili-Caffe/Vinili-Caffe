// Mostra dove il codice compilato di un file differisce dall'originale (per capire i casi segnalati da verify).
//   node tools/diff-one.mjs Vinyls/index.js
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(TS_ROOT, "..");
const rel = process.argv[2];
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const canon = (p) => printer.printFile(ts.createSourceFile(rel, fs.readFileSync(p, "utf8"), ts.ScriptTarget.ES2023, false, ts.ScriptKind.JS)).split("\n");
const a = canon(path.join(REPO, rel));
const b = canon(path.join(TS_ROOT, "dist", rel));
let shown = 0;
for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
  if (a[i] !== b[i]) {
    console.log(`riga ${i + 1}\n  orig: ${String(a[i]).slice(0, 220)}\n  dist: ${String(b[i]).slice(0, 220)}`);
    shown += 1;
  }
}
