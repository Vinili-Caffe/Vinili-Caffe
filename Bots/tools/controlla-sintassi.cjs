// Controllo sintassi di tutti i .js elencati, in un solo processo (node --check per file è lentissimo su Windows).
// Uso: node tools/controlla-sintassi.cjs <cartella> <lista.txt>
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [dir, lista] = process.argv.slice(2);
const files = fs.readFileSync(lista, "utf8").split(/\r?\n/).filter(Boolean);
let errors = 0;
for (const rel of files) {
  const file = path.join(dir, rel);
  try {
    // stessa forma che usa Node per i moduli CommonJS: compila senza eseguire
    // la riga "#!" iniziale Node la ignora: qui va tolta prima di avvolgere il codice
    const code = fs.readFileSync(file, "utf8").replace(/^#!.*/, "");
    new vm.Script(`(function (exports, require, module, __filename, __dirname) {${code}\n})`, { filename: file });
  } catch (err) {
    errors += 1;
    console.error(`${rel}: ${String(err && err.message || err)}`);
  }
}
if (errors) {
  console.error(`${errors} file con errori di sintassi`);
  process.exit(1);
}
