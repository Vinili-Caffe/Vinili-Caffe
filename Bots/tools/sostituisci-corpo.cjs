// Sostituisce il corpo di funzioni di primo livello (per nome) con un testo dato. Serve per spegnere
// definitivamente rami di codice di eventi archiviati senza toccare chi chiama quelle funzioni.
//   node tools/sostituisci-corpo.cjs file.ts '{"nomeFunzione":"return false;", "altra":""}'
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

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

const file = path.resolve(process.argv[2]);
const bodies = JSON.parse(process.argv[3]);
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
const edits = [];
for (const st of sf.statements) {
  if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
  const name = st.name.text;
  if (!(name in bodies)) continue;
  const inner = String(bodies[name] || "").trim();
  edits.push([st.body.getStart(), st.body.getEnd(), inner ? `{\n  ${inner}\n}` : "{}"]);
  delete bodies[name];
}
const missing = Object.keys(bodies);
if (missing.length) {
  console.error(`non trovate: ${missing.join(", ")}`);
  process.exit(1);
}
for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + t + text.slice(b);
writeRetry(file, crlf ? text.replace(/\n/g, "\r\n") : text);
console.log(`${path.basename(file)}: ${edits.length} funzioni spente`);
