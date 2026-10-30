// Toglie da un file .ts le dichiarazioni di primo livello (function / const / let) con i nomi dati,
// insieme ai commenti attaccati sopra. Serve per staccare codice morto senza toccare il resto.
//   node tools/togli-funzioni.cjs src/Vinili/x.ts nomeFunzione ALTRA_COSTANTE …
const fs = require("fs");
function writeRetry(f, data) {
  for (let i = 0; ; i += 1) {
    try {
      return fs.writeFileSync(f, data);
    } catch (err) {
      if (i >= 20 || !/UNKNOWN|EBUSY|EPERM/.test(String(err && err.code))) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
}
const path = require("path");
const ts = require("typescript");

const file = path.resolve(process.argv[2]);
const names = new Set(process.argv.slice(3));
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);

const cuts = [];
const found = new Set();
for (const st of sf.statements) {
  let name = "";
  if (ts.isFunctionDeclaration(st) && st.name) name = st.name.text;
  else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
    const d = st.declarationList.declarations[0];
    if (ts.isIdentifier(d.name)) name = d.name.text;
  }
  if (!name || !names.has(name)) continue;
  found.add(name);
  let start = st.getFullStart();
  const end = st.getEnd();
  // dall'inizio dei commenti/righe vuote sopra fino a fine riga
  while (start < end && /\s/.test(text[start])) start += 1;
  const lead = ts.getLeadingCommentRanges(text, st.getFullStart()) || [];
  if (lead.length) start = Math.min(start, lead[0].pos);
  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let stop = end;
  if (text[stop] === "\n") stop += 1;
  cuts.push([lineStart, stop]);
}
const missing = [...names].filter((n) => !found.has(n));
if (missing.length) {
  console.error(`non trovate in ${path.basename(file)}: ${missing.join(", ")}`);
  process.exit(1);
}
for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + text.slice(b);
text = text.replace(/\n{3,}/g, "\n\n");
writeRetry(file, crlf ? text.replace(/\n/g, "\r\n") : text);
console.log(`${path.basename(file)}: tolte ${cuts.length} dichiarazioni`);
