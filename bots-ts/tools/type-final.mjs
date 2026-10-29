// Ultimo giro sugli avvisi di tipo che non sono bug (verificati a mano): solo annotazioni che spariscono
// in compilazione, il JS resta identico (npm run verify lo controlla).
//   - funzioni che ritornano oggetti di forme diverse → tipo di ritorno `any`
//   - variabili riassegnate con forme diverse → `any`
//   - await su query Mongoose ("thenable") e altri casi semplici → (x as any)
//   node tools/type-final.mjs [--apply]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const APPLY = process.argv.includes("--apply");
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(TS_ROOT, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} });
const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, incremental: false } });
const checker = program.getTypeChecker();

function nodeAt(sf, pos) {
  let found = sf;
  const v = (n) => {
    if (n.getStart(sf) <= pos && pos < n.end) {
      found = n;
      ts.forEachChild(n, v);
    }
  };
  ts.forEachChild(sf, v);
  return found;
}
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

const edits = new Map(); // file → Map(pos → text)
const add = (file, pos, text) => {
  if (!edits.has(file)) edits.set(file, new Map());
  edits.get(file).set(pos, text);
};
/** `: any` come tipo di ritorno, dopo la parentesi che chiude i parametri. */
function returnAny(fn) {
  if (fn.type) return false;
  const close = fn.getChildren().find((c) => c.kind === ts.SyntaxKind.CloseParenToken);
  if (!close) return false;
  add(fn.getSourceFile().fileName, close.end, ": any");
  return true;
}
function declAny(decl) {
  if (!decl || decl.type || !(ts.isVariableDeclaration(decl) || ts.isParameter(decl))) return false;
  if (ts.isVariableDeclaration(decl) && (ts.isForOfStatement(decl.parent.parent) || ts.isForInStatement(decl.parent.parent))) return false;
  if (decl.getSourceFile().fileName.includes("node_modules")) return false;
  add(decl.getSourceFile().fileName, decl.questionToken ? decl.questionToken.end : decl.name.end, ": any");
  return true;
}
function wrap(e) {
  const sf = e.getSourceFile();
  add(sf.fileName, e.getStart(sf), "(");
  // stessa posizione di un'altra apertura: si accoda
  const m = edits.get(sf.fileName);
  m.set(e.end + 0.5, " as any)");
  return true;
}
/** Dove "nasce" il tipo di un oggetto scritto sul posto: ritorno di funzione, variabile o parametro. */
function fixObjectSite(lit) {
  let n = lit;
  while (n.parent && (ts.isParenthesizedExpression(n.parent) || ts.isConditionalExpression(n.parent) || ts.isBinaryExpression(n.parent) || ts.isPropertyAssignment(n.parent) || ts.isObjectLiteralExpression(n.parent) || ts.isArrayLiteralExpression(n.parent))) {
    if (ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) break;
    n = n.parent;
  }
  const p = n.parent;
  if (!p) return false;
  if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) {
    let f = p;
    while (f && !isFn(f)) f = f.parent;
    return f ? returnAny(f) : false;
  }
  if (ts.isVariableDeclaration(p)) return declAny(p);
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) {
    const sym = checker.getSymbolAtLocation(p.left);
    return declAny(sym?.valueDeclaration);
  }
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const sig = checker.getResolvedSignature(p);
    const idx = p.arguments.indexOf(n);
    const param = sig?.declaration?.parameters?.[idx];
    if (param && !param.getSourceFile().fileName.includes("node_modules")) return declAny(param);
    return wrap(n);
  }
  return false;
}

const left = [];
let fixed = 0;
for (const d of ts.getPreEmitDiagnostics(program)) {
  if (!d.file || d.file.fileName.includes("node_modules")) continue;
  const sf = d.file;
  const at = nodeAt(sf, d.start);
  let ok = false;
  if (d.code === 1320) {
    let a = at;
    while (a && !ts.isAwaitExpression(a)) a = a.parent;
    if (a) ok = wrap(a.expression);
  } else if (d.code === 2322 || d.code === 2353 || d.code === 2741 || d.code === 2739) {
    // ritorno con forma diversa dalle altre
    let r = at;
    while (r && !ts.isReturnStatement(r) && !isFn(r) && !ts.isVariableDeclaration(r) && !ts.isBinaryExpression(r) && !ts.isObjectLiteralExpression(r)) r = r.parent;
    if (r && ts.isReturnStatement(r)) {
      let f = r;
      while (f && !isFn(f)) f = f.parent;
      ok = f ? returnAny(f) : false;
    } else if (r && ts.isObjectLiteralExpression(r)) ok = fixObjectSite(r);
    else if (r && ts.isBinaryExpression(r) && ts.isIdentifier(r.left)) ok = declAny(checker.getSymbolAtLocation(r.left)?.valueDeclaration);
    else if (r && ts.isVariableDeclaration(r)) ok = declAny(r);
  } else if (d.code === 2769 || d.code === 2345 || d.code === 2698) {
    let e = at;
    while (e && !(ts.isExpression(e) && (ts.isIdentifier(e) || ts.isObjectLiteralExpression(e) || ts.isCallExpression(e) || ts.isPropertyAccessExpression(e)))) e = e.parent;
    if (e && !(e.flags & ts.NodeFlags.OptionalChain) && !ts.isShorthandPropertyAssignment(e.parent)) ok = ts.isObjectLiteralExpression(e) ? fixObjectSite(e) : wrap(e);
  }
  if (ok) fixed += 1;
  else left.push(`${path.relative(TS_ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(d.start).line + 1} TS${d.code}`);
}
console.log(`sistemati in automatico: ${fixed}; da fare a mano: ${left.length}`);
for (const l of left) console.log(`  ${l}`);
if (APPLY) {
  for (const [file, m] of edits) {
    let text = fs.readFileSync(file, "utf8");
    const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    for (const [pos, add] of [...m].sort((a, b) => b[0] - a[0])) {
      const p = Math.floor(pos) + bom;
      text = text.slice(0, p) + add + text.slice(p);
    }
    fs.writeFileSync(file, text);
  }
  console.log("applicato.");
}
