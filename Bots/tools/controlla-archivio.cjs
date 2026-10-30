// Cerca in src/ i require/import verso file che non esistono più (es. spostati in archivio/).
// Il controllo dei tipi vede solo i require con "as typeof import(...)": questo li vede tutti.
// ERRORE: richiamo a un file mancante fuori da un try → sul server diventa "Cannot find module" (bot rotto).
// AVVISO: richiamo dentro un try (restituisce un valore vuoto): non rompe, ma è codice d'archivio da togliere.
//   node tools/controlla-archivio.cjs
const fs = require("fs");
const path = require("path");
const SRC = path.resolve(__dirname, "..", "src");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
// try { aperto nelle 6 righe sopra, senza un } catch in mezzo
function insideTry(lines, lineIdx) {
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 6); i -= 1) {
    if (/\}\s*catch\b/.test(lines[i]) && i !== lineIdx) return false;
    if (/\btry\s*\{/.test(lines[i])) return true;
  }
  return false;
}
const errors = [];
const warnings = [];
for (const f of walk(SRC)) {
  const s = fs.readFileSync(f, "utf8");
  const lines = s.split(/\r?\n/);
  for (const m of s.matchAll(/(?:require|import)\(\s*(["'`])([^"'`$]+)\1\s*\)/g)) {
    const spec = m[2];
    if (!spec.startsWith(".")) continue;
    const b = path.resolve(path.dirname(f), spec);
    const ok = [b, b.replace(/\.js$/, ".ts"), `${b}.ts`, `${b}.json`, path.join(b, "index.ts")].some(exists)
      || (fs.existsSync(b) && fs.statSync(b).isDirectory());
    if (ok) continue;
    const lineIdx = s.slice(0, m.index).split("\n").length - 1;
    const where = `${path.relative(SRC, f).replace(/\\/g, "/")}:${lineIdx + 1} → ${spec}`;
    (insideTry(lines, lineIdx) ? warnings : errors).push(where);
  }
}
for (const w of warnings) console.log(`avviso  ${w}`);
for (const e of errors) console.log(`ERRORE  ${e}`);
console.log(
  errors.length
    ? `${errors.length} richiami a file mancanti NON protetti: sul server sarebbero "Cannot find module"`
    : `nessun richiamo non protetto ✓${warnings.length ? ` (${warnings.length} protetti da togliere)` : ""}`,
);
process.exit(errors.length ? 1 : 0);
