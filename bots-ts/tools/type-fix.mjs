// Analizza gli errori "la proprietà X non esiste" (TS2339/TS2551) risalendo a dove è dichiarata la variabile,
// e con --apply aggiunge i tipi nei casi sicuri. Aggiunge solo annotazioni di tipo: il JS compilato non cambia
// (dopo, npm run verify lo conferma).
//   node tools/type-fix.mjs            solo resoconto
//   node tools/type-fix.mjs --apply    corregge i casi sicuri
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const APPLY = process.argv.includes("--apply");

const cfgPath = path.join(TS_ROOT, "tsconfig.json");
const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, incremental: false } });
const checker = program.getTypeChecker();

function nodeAt(sf, pos) {
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

/** Dichiarazione "annotabile" del simbolo: variabile o parametro con nome semplice e senza tipo. */
function annotatable(decl) {
  if (!decl) return null;
  // nei for (const x of …) / for (const k in …) TypeScript non accetta il tipo sulla variabile
  if (ts.isVariableDeclaration(decl) && decl.parent && (ts.isForOfStatement(decl.parent.parent) || ts.isForInStatement(decl.parent.parent))) return null;
  if ((ts.isVariableDeclaration(decl) || ts.isParameter(decl)) && ts.isIdentifier(decl.name) && !decl.type) return decl;
  return null;
}

const stats = new Map();
const bump = (k) => stats.set(k, (stats.get(k) || 0) + 1);
const edits = new Map(); // file → Map(pos → text)
const suspicious = [];
const classFields = new Map(); // classe → { file, pos, names }

/** Parametro/variabile destrutturato senza tipo (`{ a, b } = {}`): in JS i campi mancanti o in più vanno bene. */
function annotatePattern(decl, why) {
  if (!decl || decl.type || !(ts.isParameter(decl) || ts.isVariableDeclaration(decl))) return false;
  if (!ts.isObjectBindingPattern(decl.name) && !ts.isIdentifier(decl.name)) return false;
  if (ts.isVariableDeclaration(decl) && (ts.isForOfStatement(decl.parent.parent) || ts.isForInStatement(decl.parent.parent))) return false;
  const file = decl.getSourceFile().fileName;
  if (file.includes("node_modules")) return false;
  if (!edits.has(file)) edits.set(file, new Map());
  const pos = decl.questionToken ? decl.questionToken.end : decl.name.end;
  edits.get(file).set(pos, ": any");
  bump(why);
  return true;
}

for (const d of ts.getPreEmitDiagnostics(program)) {
  if (!d.file) continue;
  // { campo in più } passato a una funzione che destruttura i parametri
  if (d.code === 2353) {
    let n = nodeAt(d.file, d.start);
    while (n && !ts.isObjectLiteralExpression(n)) n = n.parent;
    const call = n && n.parent && ts.isCallExpression(n.parent) ? n.parent : null;
    const decl = call ? checker.getResolvedSignature(call)?.declaration : null;
    const idx = call ? call.arguments.indexOf(n) : -1;
    if (!(decl && idx >= 0 && decl.parameters && decl.parameters[idx] && annotatePattern(decl.parameters[idx], "opzioni in più a parametro destrutturato"))) {
      bump("campo non previsto (altro)");
    }
    continue;
  }
  if (d.code !== 2339 && d.code !== 2551) continue;
  const sf = d.file;
  let n = nodeAt(sf, d.start);
  // const { a } = x / function f({ a } = {}) con a che per TypeScript non c'è
  {
    let b = n;
    while (b && !ts.isBindingElement(b) && !ts.isPropertyAccessExpression(b) && !ts.isElementAccessExpression(b)) b = b.parent;
    if (b && ts.isBindingElement(b) && ts.isObjectBindingPattern(b.parent) && b.parent.parent) {
      if (!annotatePattern(b.parent.parent, "campo mancante in un destrutturato")) bump("destrutturato non annotabile");
      continue;
    }
  }
  while (n && !ts.isPropertyAccessExpression(n) && !ts.isElementAccessExpression(n)) n = n.parent;
  if (!n) {
    bump("altro: non è un accesso a proprietà");
    continue;
  }
  const recv = n.expression;
  const recvType = checker.getTypeAtLocation(recv);
  // modulo importato che non esporta quel nome: possibile bug vero, si segnala e basta
  const typeText = checker.typeToString(recvType);
  if (/^typeof import\(/.test(typeText)) {
    bump("export che non esiste nel modulo (da controllare)");
    const { line } = sf.getLineAndCharacterOfPosition(d.start);
    suspicious.push(`${path.relative(TS_ROOT, sf.fileName)}:${line + 1}  ${n.getText(sf).slice(0, 90)}`);
    continue;
  }
  // this.x in una classe che crea i suoi campi al volo: `declare x: any;` nella classe (sparisce nel JS)
  if (recv.kind === ts.SyntaxKind.ThisKeyword && ts.isPropertyAccessExpression(n)) {
    let cls = n.parent;
    while (cls && !ts.isClassDeclaration(cls) && !ts.isClassExpression(cls) && !ts.isFunctionDeclaration(cls) && !ts.isFunctionExpression(cls)) cls = cls.parent;
    if (cls && (ts.isClassDeclaration(cls) || ts.isClassExpression(cls)) && cls.getSourceFile() === sf) {
      bump("campo di classe creato al volo");
      const name = n.name.text;
      const open = cls.members.pos; // subito dopo la graffa che apre il corpo della classe
      if (!classFields.has(cls)) classFields.set(cls, { file: sf.fileName, pos: open, names: new Set() });
      classFields.get(cls).names.add(name);
      continue;
    }
  }
  if (!ts.isIdentifier(recv)) {
    bump(`ricevente non semplice (${ts.SyntaxKind[recv.kind]})`);
    continue;
  }
  const sym = checker.getSymbolAtLocation(recv);
  const decl = annotatable(sym?.valueDeclaration);
  if (!decl) {
    bump(`dichiarazione non annotabile (${sym?.valueDeclaration ? ts.SyntaxKind[sym.valueDeclaration.kind] : "nessuna"})`);
    continue;
  }
  const init = decl.initializer;
  let kind;
  if (init && ts.isObjectLiteralExpression(init)) kind = "oggetto letterale poi esteso";
  else if (init) kind = `valore iniziale ${ts.SyntaxKind[init.kind]}`;
  else kind = ts.isParameter(decl) ? "parametro senza tipo" : "variabile senza valore";
  bump(kind);
  // dove TypeScript non riesce a seguire il JavaScript (risultati con più forme, documenti Mongo, errori con campi
  // in più…) la variabile torna libera come in JS: oggetto letterale esteso → Record<string, any>, il resto → any
  const file = decl.getSourceFile().fileName;
  if (file.includes("node_modules")) continue;
  if (!edits.has(file)) edits.set(file, new Map());
  edits.get(file).set(decl.questionToken ? decl.questionToken.end : decl.name.end, kind === "oggetto letterale poi esteso" ? ": Record<string, any>" : ": any");
}

console.log("errori di proprietà per tipo di causa:");
for (const [k, v] of [...stats].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`\ndichiarazioni correggibili in automatico: ${[...edits.values()].reduce((s, m) => s + m.size, 0)} in ${edits.size} file`);
fs.writeFileSync(path.join(TS_ROOT, "tools", "export-mancanti.txt"), suspicious.join("\n") + "\n");
console.log(`export mancanti da controllare: ${suspicious.length} (elenco in tools/export-mancanti.txt)`);

for (const { file, pos, names } of classFields.values()) {
  if (!edits.has(file)) edits.set(file, new Map());
  const text = fs.readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const decls = [...names].sort().map((nm) => `${eol}  declare ${nm}: any;`).join("");
  edits.get(file).set(pos, (edits.get(file).get(pos) || "") + decls);
}

if (APPLY) {
  for (const [file, m] of edits) {
    let text = fs.readFileSync(file, "utf8");
    // TypeScript conta le posizioni senza il BOM iniziale (carattere invisibile in testa ad alcuni file)
    const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    for (const [pos, add] of [...m].sort((a, b) => b[0] - a[0])) text = text.slice(0, pos + bom) + add + text.slice(pos + bom);
    fs.writeFileSync(file, text);
  }
  console.log("applicato.");
}
