// Sposta file .ts dentro src/ con git mv e aggiorna tutti i require/import relativi che li riguardano:
// quelli degli altri file verso i file spostati, e quelli dei file spostati verso il resto.
// Segnala i file spostati che usano __dirname: i percorsi verso dati/asset vanno ricontrollati a mano.
//   node tools/sposta-file.cjs '{"Vinili/Utils/Web/a.ts":"Vinili/Web/a.ts", …}'   (PROVA=1 → solo elenco)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const moves = JSON.parse(process.argv[2]);
const DRY = Boolean(process.env.PROVA);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}
const abs = (rel) => path.join(SRC, rel);
const oldToNew = new Map(Object.entries(moves).map(([a, b]) => [abs(a), abs(b)]));
for (const a of oldToNew.keys()) if (!fs.existsSync(a)) throw new Error(`manca ${a}`);
for (const b of oldToNew.values()) if (fs.existsSync(b)) throw new Error(`esiste già ${b}`);

function resolveFrom(file, spec) {
  const b = path.resolve(path.dirname(file), spec);
  for (const c of [b, b.replace(/\.js$/, ".ts"), `${b}.ts`, path.join(b, "index.ts")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
function specFor(fromFile, targetTs, originalSpec) {
  let rel = path.relative(path.dirname(fromFile), targetTs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  rel = rel.replace(/\.ts$/, "");
  if (/\.js$/.test(originalSpec)) rel += ".js";
  return rel;
}

const RE = /((?:require|import)\(\s*)(["'`])([^"'`$]+)\2(\s*\))/g;
const edits = new Map(); // file finale → testo
let changed = 0;
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  const finalFile = oldToNew.get(file) || file;
  const out = text.replace(RE, (m, pre, q, spec, post) => {
    if (!spec.startsWith(".")) return m;
    const target = resolveFrom(file, spec);
    if (!target) return m;
    const finalTarget = oldToNew.get(target) || target;
    if (finalFile === file && finalTarget === target) return m;
    const next = specFor(finalFile, finalTarget, spec);
    if (next === spec) return m;
    changed += 1;
    return `${pre}${q}${next}${q}${post}`;
  });
  if (out !== text) edits.set(file, out);
}
const dirnameWarn = [...oldToNew.keys()].filter((f) => /__dirname/.test(fs.readFileSync(f, "utf8")));
console.log(`${oldToNew.size} file da spostare, ${changed} percorsi da aggiornare in ${edits.size} file`);
if (dirnameWarn.length) console.log(`usano __dirname (ricontrollare): ${dirnameWarn.map((f) => path.relative(SRC, f)).join(", ")}`);
if (DRY) process.exit(0);

for (const [file, text] of edits) fs.writeFileSync(file, text);
for (const [a, b] of oldToNew) {
  fs.mkdirSync(path.dirname(b), { recursive: true });
  execFileSync("git", ["mv", a, b], { cwd: ROOT });
}
console.log("fatto");
