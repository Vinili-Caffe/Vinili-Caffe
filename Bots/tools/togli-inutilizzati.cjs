// Toglie da un file le dichiarazioni di primo livello (function/const/let) che nessuno usa più, a giri,
// finché ce ne sono (togliendo una funzione possono diventare inutili quelle che usava). Non tocca le esportate.
//   node tools/togli-inutilizzati.cjs <file.ts> [regex nomi da considerare]
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const file = path.resolve(process.argv[2]);
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(cfg, ts.sys, ROOT);

function topLevelNames(text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const names = new Set();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) names.add(st.name.text);
    else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
      const d = st.declarationList.declarations[0];
      if (ts.isIdentifier(d.name)) names.add(d.name.text);
    }
  }
  return names;
}

let round = 0;
let removedTotal = 0;
for (;;) {
  round += 1;
  // un solo file + noUnusedLocals: veloce, i tipi degli import vengono comunque letti
  const program = ts.createProgram([file], { ...parsed.options, noEmit: true, incremental: false, noUnusedLocals: true });
  const diags = ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).filter((d) => d.code === 6133 || d.code === 6196);
  const text = fs.readFileSync(file, "utf8");
  const top = topLevelNames(text);
  const unused = new Set();
  for (const d of diags) {
    const m = ts.flattenDiagnosticMessageText(d.messageText, " ").match(/'([^']+)'/);
    if (m && top.has(m[1]) && (!only || only.test(m[1]))) unused.add(m[1]);
  }
  // const locali inutilizzate con un valore semplice (const x = false;) → via
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const lines = new Set(diags.map((d) => d.start));
  const cuts = [];
  const simple = (e) => e && (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword || ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isIdentifier(e) || (ts.isArrayLiteralExpression(e) && !e.elements.length) || (ts.isObjectLiteralExpression(e) && !e.properties.length));
  const visit = (n) => {
    if (ts.isVariableStatement(n) && n.parent !== sf && n.declarationList.declarations.length === 1) {
      const d = n.declarationList.declarations[0];
      if (ts.isIdentifier(d.name) && lines.has(d.name.getStart()) && simple(d.initializer)) {
        const start = text.lastIndexOf("\n", n.getStart() - 1) + 1;
        let end = n.getEnd();
        if (text[end] === "\r") end += 1;
        if (text[end] === "\n") end += 1;
        if (text.slice(start, n.getStart()).trim() === "") cuts.push([start, end]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (cuts.length) {
    let out = text;
    for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b);
    fs.writeFileSync(file, out);
    removedTotal += cuts.length;
    console.log(`giro ${round}: tolte ${cuts.length} const locali inutilizzate`);
    if (!unused.size) continue;
  }
  if (!unused.size) break;
  execFileSync(process.execPath, [path.join(__dirname, "togli-funzioni.cjs"), file, ...unused], { stdio: "ignore" });
  removedTotal += unused.size;
  console.log(`giro ${round}: tolte ${unused.size} (${[...unused].slice(0, 12).join(", ")}${unused.size > 12 ? "…" : ""})`);
  if (round > 40) break;
}
console.log(`${path.basename(file)}: tolte ${removedTotal} dichiarazioni inutilizzate, ora ${fs.readFileSync(file, "utf8").split("\n").length} righe`);
