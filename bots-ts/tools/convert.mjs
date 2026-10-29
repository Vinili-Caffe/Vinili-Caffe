// Converte i bot originali (JavaScript) in TypeScript dentro bots-ts/src, senza toccare gli originali.
// Il codice resta identico: cambiano solo
//   - `module.exports = X`      →  `export = X`            (stesso JS una volta compilato)
//   - `const a = require("m")`  →  `... require("m") as typeof import("m")`  (solo il tipo, sparisce in compilazione)
// così TypeScript conosce cosa esporta ogni file e controlla chi lo usa.
// Gli altri file (json, font, immagini…) si copiano uguali. Si può rilanciare quando gli originali cambiano:
//   node tools/convert.mjs
import { execFileSync } from "node:child_process";
import { builtinModules, createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, listTree } from "./args.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(TS_ROOT, "..");
const SRC = arg("--src") || path.join(TS_ROOT, "src");
/** Da dove leggere gli originali: il repo (file tracciati da git) o una cartella scaricata con --from. */
const FROM = arg("--from");
const ORIG = FROM || REPO;
/** Cosa fa parte dei bot (stesse cartelle che finiscono sulla VPS in /opt/bot). */
const ROOTS = ["Vinyls", "Coffee", "shared", "loader.js", "wait-for-lavalink.js"];

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

function trackedFiles() {
  if (FROM) return listTree(FROM, ROOTS);
  const out = execFileSync("git", ["ls-files", "-z", "--", ...ROOTS], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((rel) => fs.existsSync(path.join(REPO, rel)));
}

const parsed = new Map();
function parse(rel) {
  if (!parsed.has(rel)) {
    const text = fs.readFileSync(path.join(ORIG, rel), "utf8");
    parsed.set(rel, { text, sf: ts.createSourceFile(rel, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.JS) });
  }
  return parsed.get(rel);
}

function isModuleExports(n) {
  return ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "module" && n.name.text === "exports";
}

/** Un file si può scrivere con `export =` se assegna module.exports una volta sola, in cima al file, e non lo tocca altrove. */
const shapes = new Map();
function exportShape(rel) {
  if (shapes.has(rel)) return shapes.get(rel);
  const { sf } = parse(rel);
  const assigns = [];
  for (const st of sf.statements) {
    if (
      ts.isExpressionStatement(st) &&
      ts.isBinaryExpression(st.expression) &&
      st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isModuleExports(st.expression.left)
    ) {
      assigns.push(st.expression);
    }
  }
  const assignLefts = new Set(assigns.map((a) => a.left));
  let other = 0;
  const visit = (n) => {
    if (isModuleExports(n) && !assignLefts.has(n)) other += 1;
    else if (ts.isIdentifier(n) && n.text === "exports") {
      const p = n.parent;
      const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n);
      if (!isName) other += 1;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // TypeScript sposta `export =` in fondo al file: va bene solo se dopo ci sono soltanto funzioni
  // (che esistono già da prima), altrimenti cambierebbe l'ordine in cui gira il codice.
  let tailOk = false;
  if (assigns.length === 1) {
    const idx = sf.statements.indexOf(assigns[0].parent);
    tailOk = sf.statements.slice(idx + 1).every((st) => ts.isFunctionDeclaration(st) || ts.isEmptyStatement(st));
  }
  const shape = assigns.length === 1 && other === 0 && tailOk ? { kind: "exportEquals", node: assigns[0] } : { kind: "other" };
  shapes.set(rel, shape);
  return shape;
}

const typedPackages = new Map();
function packageHasTypes(spec) {
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  if (typedPackages.has(name)) return typedPackages.get(name);
  let ok = false;
  for (const base of [path.join(REPO, "Vinyls"), REPO]) {
    const dir = path.join(base, "node_modules", name);
    const pj = path.join(dir, "package.json");
    if (fs.existsSync(pj)) {
      const j = JSON.parse(fs.readFileSync(pj, "utf8"));
      ok = Boolean(j.types || j.typings || fs.existsSync(path.join(dir, "index.d.ts")) || (j.exports && JSON.stringify(j.exports).includes(".d.ts")));
      if (!ok) ok = fs.existsSync(path.join(base, "node_modules", "@types", name.replace(/^@/, "").replace("/", "__")));
      break;
    }
  }
  typedPackages.set(name, ok);
  return ok;
}

/** File del repo a cui punta un require relativo (come lo risolverebbe Node), o null. */
function resolveRelative(fromRel, spec, tracked) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  for (const cand of [base, `${base}.js`, `${base}.json`, `${base}/index.js`]) {
    if (tracked.has(cand)) return cand;
  }
  return null;
}

/** Il require si può tipizzare senza falsi errori? */
function typeableRequire(fromRel, spec, tracked) {
  if (BUILTINS.has(spec)) return true;
  if (spec.startsWith(".")) {
    const target = resolveRelative(fromRel, spec, tracked);
    if (!target) return false;
    if (target.endsWith(".json")) return true;
    return target.endsWith(".js") && exportShape(target).kind === "exportEquals";
  }
  return packageHasTypes(spec);
}

function convertJs(rel, tracked) {
  const { text, sf } = parse(rel);
  const edits = []; // { pos, end, text }
  const shape = exportShape(rel);
  if (shape.kind === "exportEquals") {
    const b = shape.node;
    edits.push({ pos: b.left.getStart(sf), end: b.operatorToken.end, text: "export =" });
  }
  let typed = 0;
  /** `x = {}` riempito dopo (opzioni, payload, mappe): per TypeScript sarebbe un oggetto senza campi. */
  const emptyObjectType = (n) =>
    (ts.isVariableDeclaration(n) || ts.isParameter(n)) &&
    ts.isIdentifier(n.name) &&
    !n.type &&
    n.initializer &&
    ts.isObjectLiteralExpression(n.initializer) &&
    n.initializer.properties.length === 0;
  /** `const data = await res.json()`: la risposta di un server non ha un tipo noto (unknown) → any. */
  const jsonBody = (n) =>
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    !n.type &&
    n.initializer &&
    ts.isAwaitExpression(n.initializer) &&
    ts.isCallExpression(n.initializer.expression) &&
    ts.isPropertyAccessExpression(n.initializer.expression.expression) &&
    n.initializer.expression.expression.name.text === "json";
  /**
   * In JavaScript ogni parametro si può omettere; TypeScript li vorrebbe tutti. Il `?` (solo tipo) li rende facoltativi
   * come prima. Si parte dal fondo e ci si ferma a un parametro destrutturato senza valore di default.
   */
  const markOptionalParams = (params) => {
    for (let i = params.length - 1; i >= 0; i--) {
      const p = params[i];
      if (p.dotDotDotToken || p.initializer) continue;
      if (!ts.isIdentifier(p.name) || p.questionToken) break;
      if (p.name.text === "this") break;
      edits.push({ pos: p.name.end, end: p.name.end, text: "?" });
    }
  };
  const visit = (n) => {
    if (emptyObjectType(n)) edits.push({ pos: n.name.end, end: n.name.end, text: ": Record<string, any>" });
    if (jsonBody(n)) edits.push({ pos: n.name.end, end: n.name.end, text: ": any" });
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)) {
      // le arrow con un solo parametro senza parentesi (x => …) non possono avere `?`
      const bareArrow = ts.isArrowFunction(n) && n.parameters.length === 1 && !sf.text.slice(n.getStart(sf), n.parameters[0].getStart(sf)).includes("(");
      if (!bareArrow) markOptionalParams(n.parameters);
    }
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === "require" &&
      n.initializer.arguments.length === 1 &&
      ts.isStringLiteral(n.initializer.arguments[0])
    ) {
      const spec = n.initializer.arguments[0].text;
      if (typeableRequire(rel, spec, tracked)) {
        edits.push({ pos: n.initializer.end, end: n.initializer.end, text: ` as typeof import(${JSON.stringify(spec)})` });
        typed += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.pos - a.pos);
  let out = text;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return { out, exportEquals: shape.kind === "exportEquals", typed };
}

function main() {
  // da quando i bot si sviluppano in TypeScript, src/ è l'originale: riconvertire cancellerebbe il lavoro fatto lì
  if (fs.existsSync(SRC) && fs.readdirSync(SRC).length && !process.argv.includes("--force")) {
    console.error(`${SRC} esiste già ed è il codice su cui si lavora: la conversione lo sovrascriverebbe.`);
    console.error("Se serve davvero (es. su una cartella di prova), aggiungi --force.");
    process.exit(1);
  }
  const files = trackedFiles();
  const tracked = new Set(files);
  const wanted = new Set();
  const stats = { ts: 0, exportEquals: 0, typedRequires: 0, copied: 0, unchanged: 0 };
  for (const rel of files) {
    const isJs = rel.endsWith(".js");
    const outRel = isJs ? rel.replace(/\.js$/, ".ts") : rel;
    const dest = path.join(SRC, outRel);
    wanted.add(path.normalize(dest));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let data;
    if (isJs) {
      const r = convertJs(rel, tracked);
      data = Buffer.from(r.out, "utf8");
      stats.ts += 1;
      if (r.exportEquals) stats.exportEquals += 1;
      stats.typedRequires += r.typed;
    } else {
      data = fs.readFileSync(path.join(ORIG, rel));
      stats.copied += 1;
    }
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(data)) {
      stats.unchanged += 1;
      continue;
    }
    fs.writeFileSync(dest, data);
  }
  // file spariti dagli originali: via anche dalla copia TS
  let removed = 0;
  const sweep = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) sweep(full);
      else if (!wanted.has(path.normalize(full))) (fs.rmSync(full), (removed += 1));
    }
  };
  sweep(SRC);
  console.log(
    `convertiti ${stats.ts} file in .ts (${stats.exportEquals} con export =, ${stats.typedRequires} require con tipo), ` +
      `copiati ${stats.copied} altri file, invariati ${stats.unchanged}, tolti ${removed}`,
  );
}

main();
