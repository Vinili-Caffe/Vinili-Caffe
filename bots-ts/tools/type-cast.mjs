// Ultimo passaggio sugli errori di tipo: dove TypeScript non riesce a seguire il JavaScript originale,
// l'espressione si scrive `(x as any)`. In compilazione TypeScript toglie sia il tipo sia le parentesi,
// quindi il JS resta identico (npm run verify lo controlla).
// Non tocca:
//   - TS2304 "nome inesistente": sono bug veri (il codice si rompe lì), restano come errore finché non si correggono;
//   - TS2307 "modulo non trovato".
// Le chiamate con argomenti in più (TS2554) si sistemano ma finiscono in tools/da-controllare.txt.
//   node tools/type-cast.mjs            resoconto
//   node tools/type-cast.mjs --apply    applica
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const APPLY = process.argv.includes("--apply");
const SKIP = new Set([2304, 2307]);

const cfg = ts.getParsedCommandLineOfConfigFile(path.join(TS_ROOT, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} });
const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, incremental: false } });

function smallestAt(sf, pos) {
  let found = sf;
  const visit = (n) => {
    if (n.getStart(sf) <= pos && pos < n.end) {
      found = n;
      ts.forEachChild(n, visit);
    }
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** Espressione più grande che comincia esattamente dove TypeScript segnala l'errore. */
function exprStartingAt(sf, pos) {
  let n = smallestAt(sf, pos);
  let best = null;
  while (n && n !== sf) {
    if (n.getStart(sf) !== pos) break;
    if (ts.isExpression(n) && !ts.isOmittedExpression(n) && wrappable(n)) return n;
    if (ts.isExpression(n) && !ts.isOmittedExpression(n) && !best) best = n;
    n = n.parent;
  }
  return best;
}

/**
 * Solo espressioni "semplici" (nomi, accessi, chiamate, valori): attorno a queste TypeScript toglie sempre
 * le parentesi di (x as any). Attorno a confronti, operazioni o ternari le terrebbe e il JS cambierebbe.
 * Mai la forma corta { nome } degli oggetti né i nomi di proprietà/dichiarazioni.
 */
function wrappable(e) {
  const p = e.parent;
  if (!p) return false;
  if (ts.isShorthandPropertyAssignment(p)) return false;
  // dentro una catena con ?. le parentesi spezzerebbero il "salta se manca": a?.b(x) ≠ (a?.b)(x)
  if (ts.isOptionalChain(e) || (e.flags & ts.NodeFlags.OptionalChain) !== 0) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyAccessExpression(p) || ts.isMethodDeclaration(p)) && p.name === e) return false;
  if (ts.isDeclaration?.(p) && p.name === e) return false;
  if (ts.isTaggedTemplateExpression(p) && p.tag === e) return false;
  return (
    ts.isIdentifier(e) ||
    ts.isPropertyAccessExpression(e) ||
    ts.isElementAccessExpression(e) ||
    ts.isCallExpression(e) ||
    ts.isNewExpression(e) ||
    ts.isStringLiteral(e) ||
    ts.isNumericLiteral(e) ||
    ts.isNoSubstitutionTemplateLiteral(e) ||
    ts.isTemplateExpression(e) ||
    ts.isArrayLiteralExpression(e) ||
    ts.isParenthesizedExpression(e) ||
    ts.isNonNullExpression(e) ||
    e.kind === ts.SyntaxKind.ThisKeyword ||
    e.kind === ts.SyntaxKind.NullKeyword ||
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword
  );
}

const isAssignTarget = (e) =>
  e.parent && ts.isBinaryExpression(e.parent) && e.parent.left === e && e.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && e.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;

/** Cosa avvolgere in (… as any) per l'errore dato. */
function target(d) {
  const sf = d.file;
  const at = smallestAt(sf, d.start);
  switch (d.code) {
    case 2339:
    case 2551: {
      let n = at;
      while (n && !ts.isPropertyAccessExpression(n)) n = n.parent;
      return n ? n.expression : null;
    }
    case 2554: {
      let n = at;
      while (n && !ts.isCallExpression(n) && !ts.isNewExpression(n)) n = n.parent;
      return n ? n.expression : null;
    }
    case 2322: {
      let n = at;
      while (n && !ts.isVariableDeclaration(n) && !ts.isBinaryExpression(n) && !ts.isPropertyAssignment(n) && !ts.isReturnStatement(n) && !ts.isParameter(n) && !ts.isPropertyDeclaration(n)) n = n.parent;
      if (!n) return null;
      if (ts.isBinaryExpression(n)) return n.right;
      if (ts.isReturnStatement(n)) return n.expression;
      return n.initializer || null;
    }
    case 2538: {
      let n = at;
      while (n && !ts.isElementAccessExpression(n)) n = n.parent;
      return n ? n.argumentExpression : exprStartingAt(sf, d.start);
    }
    default:
      return exprStartingAt(sf, d.start);
  }
}

const edits = new Map();
const review = [];
const left = new Map();
let fixed = 0;
for (const d of ts.getPreEmitDiagnostics(program)) {
  if (!d.file || d.file.fileName.includes("node_modules") || SKIP.has(d.code)) continue;
  const e = target(d);
  const where = `${path.relative(TS_ROOT, d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`;
  if (!e || isAssignTarget(e) || ts.isSpreadElement(e) || !wrappable(e)) {
    left.set(d.code, (left.get(d.code) || 0) + 1);
    continue;
  }
  const file = d.file.fileName;
  if (!edits.has(file)) edits.set(file, []);
  edits.get(file).push({ start: e.getStart(d.file), end: e.end });
  fixed += 1;
  if (d.code === 2554) review.push(`${where}  ${ts.flattenDiagnosticMessageText(d.messageText, " ")}  →  ${e.getText(d.file).slice(0, 60)}`);
}

console.log(`espressioni da segnare (x as any): ${fixed}`);
if (left.size) console.log(`non gestite: ${[...left].map(([c, n]) => `TS${c}×${n}`).join(", ")}`);
fs.writeFileSync(
  path.join(TS_ROOT, "tools", "da-controllare.txt"),
  `Chiamate con più argomenti di quelli che la funzione usa: in JS quelli in più si ignorano.\n` +
    `Da controllare: a volte è un parametro che la funzione dovrebbe usare e non usa.\n\n${review.join("\n")}\n`,
);

if (APPLY) {
  for (const [file, list] of edits) {
    let text = fs.readFileSync(file, "utf8");
    const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    // stessa espressione segnalata più volte: una sola volta
    const uniq = [...new Map(list.map((x) => [`${x.start}:${x.end}`, x])).values()];
    const ins = [];
    for (const { start, end } of uniq) ins.push({ pos: end + bom, text: " as any)", order: 0 }, { pos: start + bom, text: "(", order: 1 });
    // dalla fine all'inizio; a parità di posizione la chiusura prima dell'apertura
    ins.sort((a, b) => b.pos - a.pos || a.order - b.order);
    for (const x of ins) text = text.slice(0, x.pos) + x.text + text.slice(x.pos);
    fs.writeFileSync(file, text);
  }
  console.log("applicato.");
}
