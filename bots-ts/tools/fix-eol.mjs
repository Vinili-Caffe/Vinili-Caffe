// Riporta in src/ gli a capo dei file originali (\r\n o \n, riga per riga).
// Conta perché un testo su più righe tra `backtick` contiene l'a capo così com'è nel file: il bot manderebbe
// un messaggio diverso. Serve dopo strumenti che cambiano gli a capo (es. sed su Windows).
//   node tools/fix-eol.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(TS_ROOT, "..");
const SRC = path.join(TS_ROOT, "src");

let fixed = 0;
let skipped = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".ts")) check(full);
  }
};
function check(tsFile) {
  const rel = path.relative(SRC, tsFile).replace(/\.ts$/, ".js");
  const orig = path.join(REPO, rel);
  if (!fs.existsSync(orig)) return;
  const o = fs.readFileSync(orig, "utf8").split("\n");
  const s = fs.readFileSync(tsFile, "utf8").split("\n");
  if (o.length !== s.length) {
    // righe aggiunte (es. un commento): si allinea solo se l'originale era tutto con lo stesso a capo
    const crlf = o.slice(0, -1).filter((l) => l.endsWith("\r")).length;
    if (crlf !== 0 && crlf !== o.length - 1) return void (skipped += 1);
    const want = crlf ? "\r" : "";
    const out = s.map((l, i) => (i === s.length - 1 ? l : l.replace(/\r$/, "") + want)).join("\n");
    if (out !== s.join("\n")) (fs.writeFileSync(tsFile, out), (fixed += 1));
    return;
  }
  const out = s.map((l, i) => {
    if (i === s.length - 1) return l;
    const base = l.replace(/\r$/, "");
    return o[i].endsWith("\r") ? `${base}\r` : base;
  });
  const text = out.join("\n");
  if (text !== s.join("\n")) (fs.writeFileSync(tsFile, text), (fixed += 1));
}
walk(SRC);
console.log(`a capo sistemati in ${fixed} file${skipped ? `, ${skipped} da controllare a mano (righe diverse e a capo misti)` : ""}`);
