// Dà ai modelli Mongoose il tipo del loro schema. Erano scritti `models.X || model("X", schema)` e quel `||`
// faceva perdere a TypeScript la forma dei documenti (tutto ciò che si legge dal database diventava libero).
// Aggiunge solo un'annotazione sulla variabile (sparisce in compilazione: JS identico, lo conferma verify).
//   node tools/type-models.mjs [--apply]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "src");
const APPLY = process.argv.includes("--apply");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const isModelCall = (e) => {
  if (!ts.isCallExpression(e)) return false;
  const c = e.expression;
  const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
  return name === "model" && e.arguments.length >= 2 && ts.isIdentifier(e.arguments[1]);
};

let total = 0;
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("model(")) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const edits = [];
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !n.type && n.initializer) {
      const init = n.initializer;
      const call =
        ts.isBinaryExpression(init) && init.operatorToken.kind === ts.SyntaxKind.BarBarToken && isModelCall(init.right)
          ? init.right
          : isModelCall(init)
            ? init
            : null;
      if (call) {
        const schema = call.arguments[1].text;
        edits.push({ pos: n.name.end, text: `: import("mongoose").Model<import("mongoose").InferSchemaType<typeof ${schema}>>` });
        console.log(`${path.relative(SRC, file)}: ${n.name.text} ← ${schema}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  total += edits.length;
  if (APPLY) {
    const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    let out = text;
    for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos + bom) + e.text + out.slice(e.pos + bom);
    fs.writeFileSync(file, out);
  }
}
console.log(`${total} modelli${APPLY ? " tipizzati" : ""}`);
