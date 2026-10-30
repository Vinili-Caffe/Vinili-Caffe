// Cerca in src/ i require/import verso file che non esistono più (es. spostati in archivio/).
// Il controllo dei tipi vede solo i require con "as typeof import(...)": questo li vede tutti.
// Soft-dep Hogwarts: se il file usa isHogwartsRuntimeDisabled, i require verso moduli
// evento mancanti sono intenzionali (lazy + kill-switch ON = non caricati).
//   node tools/controlla-archivio.cjs
const fs = require("fs");
const path = require("path");
const SRC = path.resolve(__dirname, "..", "src");
const SOFT_ARCHIVIO = /hogwarts|burrobirra|gringott|galeoni/i;

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
let bad = 0;
for (const f of walk(SRC)) {
  const s = fs.readFileSync(f, "utf8");
  const softOk = /isHogwartsRuntimeDisabled/.test(s);
  for (const m of s.matchAll(/(?:require|import)\(\s*(["'`])([^"'`$]+)\1\s*\)/g)) {
    const spec = m[2];
    if (!spec.startsWith(".")) continue;
    if (softOk && SOFT_ARCHIVIO.test(spec)) continue;
    const b = path.resolve(path.dirname(f), spec);
    const ok = [b, b.replace(/\.js$/, ".ts"), `${b}.ts`, `${b}.json`, path.join(b, "index.ts")].some(exists)
      || (fs.existsSync(b) && fs.statSync(b).isDirectory());
    if (!ok) {
      bad += 1;
      const line = s.slice(0, m.index).split("\n").length;
      console.log(`${path.relative(SRC, f).replace(/\\/g, "/")}:${line} → ${spec}`);
    }
  }
}
console.log(bad ? `${bad} richiami a file che non esistono` : "nessun richiamo a file mancanti ✓");
process.exit(bad ? 1 : 0);
