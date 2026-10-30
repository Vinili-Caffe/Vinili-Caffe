// Sostituisce ogni chiamata a una funzione con il testo di uno dei suoi argomenti (o con un testo fisso).
//   node tools/sostituisci-chiamata.cjs <file.ts> <nomeFunzione> arg:<indice> | testo:<testo>
// es. pickHogwartsBonusBank(cfg, "x", bancoNormale, getter) → bancoNormale con "arg:2"
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const [, , fileArg, name, how] = process.argv;
const file = path.resolve(fileArg);
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
let total = 0;
for (;;) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const edits = [];
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) {
      let repl;
      if (how.startsWith("arg:")) {
        const a = n.arguments[Number(how.slice(4))];
        if (!a) throw new Error(`argomento mancante alla riga ${text.slice(0, n.getStart()).split("\n").length}`);
        const t = text.slice(a.getStart(), a.getEnd());
        const simple = ts.isIdentifier(a) || ts.isCallExpression(a) || ts.isPropertyAccessExpression(a) || ts.isLiteralExpression(a) || ts.isParenthesizedExpression(a) || ts.isArrayLiteralExpression(a);
        repl = simple ? t : `(${t})`;
      } else repl = how.slice(6);
      edits.push([n.getStart(), n.getEnd(), repl]);
      return; // le chiamate annidate si fanno al giro dopo
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) break;
  for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + r + text.slice(b);
  total += edits.length;
}
fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
console.log(`${path.basename(file)}: ${total} chiamate a ${name} sostituite`);
