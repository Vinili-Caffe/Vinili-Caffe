// Elenca le chiamate che passano più argomenti di quelli che la funzione dichiara (in JS quelli in più si ignorano):
// spesso innocuo, a volte è un parametro che la funzione dovrebbe usare e non usa. Anche dove type-cast ha scritto
// (fn as any)(…) per zittire l'errore. Esclude funzioni che leggono `arguments` o hanno ...resto.
//   node tools/extra-args.mjs   → tools/da-controllare.txt
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(TS_ROOT, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} });
const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, incremental: false } });
const checker = program.getTypeChecker();

function unwrap(e) {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return e;
}
function usesArguments(fn) {
  let found = false;
  const v = (n) => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === "arguments") found = true;
    else if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n))) return; // arguments di un'altra funzione
    else ts.forEachChild(n, v);
  };
  if (fn.body) v(fn.body);
  return found;
}
function declOf(callee) {
  let sym = checker.getSymbolAtLocation(callee);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  let d = sym?.valueDeclaration || sym?.declarations?.[0];
  if (d && ts.isVariableDeclaration(d) && d.initializer) {
    const init = unwrap(d.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) d = init;
  }
  if (d && (ts.isPropertyAssignment(d)) && d.initializer) {
    const init = unwrap(d.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) d = init;
  }
  if (d && ts.isShorthandPropertyAssignment(d)) {
    // { fn } → la funzione fn vera
    const real = checker.getShorthandAssignmentValueSymbol(d);
    d = real?.valueDeclaration || real?.declarations?.[0];
    if (d && ts.isVariableDeclaration(d) && d.initializer) {
      const init = unwrap(d.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) d = init;
    }
  }
  return d && (ts.isFunctionDeclaration(d) || ts.isFunctionExpression(d) || ts.isArrowFunction(d) || ts.isMethodDeclaration(d)) ? d : null;
}

const out = [];
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      const d = declOf(target);
      if (d && !d.getSourceFile().fileName.includes("node_modules")) {
        const params = d.parameters;
        const rest = params.some((p) => p.dotDotDotToken);
        if (!rest && n.arguments.length > params.length && !usesArguments(d)) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          const dl = d.getSourceFile().getLineAndCharacterOfPosition(d.getStart(d.getSourceFile())).line + 1;
          out.push(
            `${path.relative(TS_ROOT, sf.fileName)}:${line + 1}  ${callee.getText(sf).slice(0, 60)}(${n.arguments.length} argomenti) ` +
              `→ la funzione ne usa ${params.length} (${path.relative(TS_ROOT, d.getSourceFile().fileName)}:${dl})`,
          );
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
fs.writeFileSync(
  path.join(TS_ROOT, "tools", "da-controllare.txt"),
  `Chiamate con più argomenti di quelli che la funzione usa (in JS quelli in più si ignorano).\n\n${out.join("\n")}\n`,
);
console.log(`${out.length} chiamate (elenco in tools/da-controllare.txt)`);
