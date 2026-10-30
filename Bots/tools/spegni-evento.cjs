// Spegne un evento concluso dentro un file: ogni funzione di primo livello il cui nome corrisponde al filtro
// diventa un corpo minimo con il valore "evento spento" adatto al tipo che restituisce (dal compilatore):
// boolean → false, number → 0, string → "", array → [], void → niente, altro → null.
// Chi le chiama resta invariato; poi tools/togli-inutilizzati.cjs toglie ciò che non serve più.
//   node tools/spegni-evento.cjs <file.ts> '<regex nomi>' ['<regex nomi da escludere>']   (PROVA=1 → solo elenco)
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const file = path.resolve(process.argv[2]);
const pick = new RegExp(process.argv[3]);
const skip = process.argv[4] ? new RegExp(process.argv[4]) : null;
const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(cfg, ts.sys, ROOT);
const program = ts.createProgram([file], { ...parsed.options, noEmit: true, incremental: false });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(file);
const text = sf.getFullText();

function offValue(sig, isAsync) {
  let t = checker.getReturnTypeOfSignature(sig);
  if (isAsync) {
    const sym = t.getSymbol();
    if (sym && sym.getName() === "Promise") {
      const args = checker.getTypeArguments(t);
      if (args && args[0]) t = args[0];
    }
  }
  const str = checker.typeToString(t);
  if (t.flags & ts.TypeFlags.Void || str === "void" || str === "undefined") return "";
  if (t.flags & ts.TypeFlags.BooleanLike || /^(true|false|boolean)$/.test(str)) return "return false;";
  if (t.flags & ts.TypeFlags.NumberLike || str === "number") return "return 0;";
  if (t.flags & ts.TypeFlags.StringLike || str === "string") return 'return "";';
  if (checker.isArrayType(t) || /\[\]$/.test(str)) return "return [];";
  return "return null as any;";
}

const edits = [];
for (const st of sf.statements) {
  if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
  const name = st.name.text;
  if (!pick.test(name) || (skip && skip.test(name))) continue;
  const sig = checker.getSignatureFromDeclaration(st);
  const isAsync = Boolean(st.modifiers && st.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
  const body = offValue(sig, isAsync);
  const lines = text.slice(st.getStart(), st.getEnd()).split("\n").length;
  edits.push({ name, start: st.body.getStart(), end: st.body.getEnd(), body, lines });
}
let saved = 0;
for (const e of edits) {
  saved += e.lines;
  console.log(`${String(e.lines).padStart(5)}r  ${e.name}  → ${e.body || "(vuota)"}`);
}
console.log(`${edits.length} funzioni, circa ${saved} righe`);
if (process.env.PROVA) process.exit(0);
let out = text;
for (const e of edits.sort((a, b) => b.start - a.start)) {
  out = out.slice(0, e.start) + (e.body ? `{\n  ${e.body}\n}` : "{}") + out.slice(e.end);
}
fs.writeFileSync(file, out);
console.log("fatto");
