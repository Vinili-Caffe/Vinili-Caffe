// Prova che i .js compilati (build/js) si comportano come i .ts: carica ogni modulo una volta con tsx dai .ts
// e una volta con node puro da una copia di src/ dove i .ts sono sostituiti dai .js (com'è sulla VPS),
// poi confronta cosa esporta. Salta gli avvii (index, *App, loader) che accenderebbero i bot.
//   node tools/compila.mjs && node tools/confronta-js.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "src");
const JS = path.join(ROOT, "build", "js");
const MIRROR = path.join(ROOT, "build", "mirror", "src");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// copia di src senza .ts, con i .js compilati e node_modules collegati
fs.rmSync(path.dirname(MIRROR), { recursive: true, force: true });
for (const f of walk(SRC)) {
  if (f.endsWith(".ts") && !f.endsWith(".d.ts")) continue;
  const dest = path.join(MIRROR, path.relative(SRC, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
for (const f of walk(JS)) {
  const dest = path.join(MIRROR, path.relative(JS, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
for (const bot of ["Vinili", "Caffè"]) {
  const nm = path.join(SRC, bot, "node_modules");
  if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(MIRROR, bot, "node_modules"), "junction");
}

const SKIP = /(^|\/)(index|loader|wait-for-lavalink|run-sharded)\.ts$|App\.ts$|(^|\/)(scripts|Scripts|tools)\//;
const mods = walk(SRC)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => path.relative(SRC, f).replace(/\\/g, "/"))
  .filter((r) => !SKIP.test(r));

const probe = (base, ext) => `
const path=require("path");const out={};
global.logger=global.logger||{info(){},warn(){},error(){},debug(){}};
for(const r of ${JSON.stringify(mods)}){
  const f=path.join(${JSON.stringify(base)},r.replace(/\\.ts$/,${JSON.stringify(ext)}));
  try{const m=require(f);const v=m&&typeof m==="object"||typeof m==="function"?m:{};
    out[r]=typeof m+":"+Object.keys(v).sort().map(k=>k+"="+typeof v[k]).join(",");}
  catch(e){out[r]="ERR "+String(e&&e.message||e).split("\\n")[0].slice(0,160)}
}
process.stdout.write("@@"+JSON.stringify(out));process.exit(0);`;

function run(args, code, cwd) {
  // il codice va in un file: la riga di comando di Windows è troppo corta per 1000+ moduli
  const probeFile = path.join(cwd, `__probe_${process.pid}.cjs`);
  fs.writeFileSync(probeFile, code);
  const r = spawnSync(process.execPath, [...args, probeFile], { cwd, encoding: "utf8", maxBuffer: 64 << 20, timeout: 600_000, env: { ...process.env, NODE_ENV: "test" } });
  fs.rmSync(probeFile, { force: true });
  const at = String(r.stdout || "").lastIndexOf("@@");
  if (at < 0) throw new Error(`nessun risultato:\n${String(r.stderr || "").slice(-2000)}`);
  return JSON.parse(r.stdout.slice(at + 2));
}

console.log(`confronto ${mods.length} moduli…`);
const a = run(["--disable-warning=ExperimentalWarning", "--import", "tsx"], probe(SRC, ".ts"), SRC);
const b = run([], probe(MIRROR, ".js"), MIRROR);
let diff = 0;
for (const r of mods) {
  if (a[r] === b[r]) continue;
  diff += 1;
  console.log(`≠ ${r}\n   ts: ${String(a[r]).slice(0, 220)}\n   js: ${String(b[r]).slice(0, 220)}`);
}
const errs = mods.filter((r) => String(a[r]).startsWith("ERR")).length;
console.log(diff ? `${diff} moduli diversi` : `tutti uguali ✓ (${errs} non caricabili fuori dalla VPS in entrambi i modi)`);
process.exit(diff ? 1 : 0);
