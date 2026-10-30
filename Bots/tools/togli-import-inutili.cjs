// Toglie dai file indicati gli import (const { a, b } = require(...)) che non si usano più:
// il singolo nome dalla graffa, o tutta la riga se non resta niente.
// Poi toglie dagli "export = { … }" dei moduli nuovi i nomi che nessun altro file della cartella richiede.
//   node tools/togli-import-inutili.cjs <file.ts> [altri…]
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const files = process.argv.slice(2).map((f) => path.resolve(f));
const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(cfg, ts.sys, ROOT);

function isRequireInit(e) {
  while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e))) e = e.expression;
  if (e && ts.isPropertyAccessExpression(e)) e = e.expression;
  return Boolean(e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "require");
}
const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const write = (f, t, crlf) => fs.writeFileSync(f, crlf ? t.replace(/\n/g, "\r\n") : t);

let total = 0;
for (let round = 0; round < 10; round += 1) {
  const program = ts.createProgram(files, { ...parsed.options, noEmit: true, incremental: false, noUnusedLocals: true });
  let changed = 0;
  for (const file of files) {
    const diags = ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).filter((d) => [6133, 6192, 6198].includes(d.code));
    if (!diags.length) continue;
    const raw = fs.readFileSync(file, "utf8");
    const crlf = raw.includes("\r\n");
    const text = read(file);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
    // posizioni dei diagnostici ricalcolate sul testo senza \r
    const lineOf = (pos) => raw.slice(0, pos).split("\n").length;
    const colOf = (pos) => pos - raw.lastIndexOf("\n", pos - 1) - 1;
    const hits = diags.map((d) => ({ line: lineOf(d.start), col: colOf(d.start), code: d.code }));
    const at = (node) => {
      const lc = sf.getLineAndCharacterOfPosition(node.getStart());
      return hits.some((h) => h.line === lc.line + 1 && h.col === lc.character);
    };
    const edits = [];
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st) || st.declarationList.declarations.length !== 1) continue;
      const d = st.declarationList.declarations[0];
      if (!isRequireInit(d.initializer)) continue;
      const whole = () => {
        let a = st.getFullStart();
        edits.push([a, st.getEnd(), ""]);
      };
      if (ts.isIdentifier(d.name)) {
        if (at(d.name) || at(st)) whole();
        continue;
      }
      if (!ts.isObjectBindingPattern(d.name)) continue;
      if (at(d) || at(st) || at(d.name)) {
        whole();
        continue;
      }
      const keep = d.name.elements.filter((el) => !at(el.name) && !at(el));
      if (keep.length === d.name.elements.length) continue;
      if (!keep.length) {
        whole();
        continue;
      }
      const multiline = d.name.getText().includes("\n");
      const inner = multiline ? `{\n${keep.map((el) => `  ${el.getText()},`).join("\n")}\n}` : `{ ${keep.map((el) => el.getText()).join(", ")} }`;
      edits.push([d.name.getStart(), d.name.getEnd(), inner]);
    }
    if (!edits.length) continue;
    let out = text;
    for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + r + out.slice(b);
    write(file, out, crlf);
    changed += edits.length;
  }
  total += changed;
  if (!changed) break;
}

// export = { … }: via i nomi che nessuno richiede (si guardano tutti i .ts della cartella src)
const SRC = path.join(ROOT, "src");
const all = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".ts")) all.push(p);
  }
};
walk(SRC);
let exportsRemoved = 0;
for (const file of files) {
  const base = path.basename(file, ".ts");
  if (base === "minigameService") continue; // la sua interfaccia la usano altri servizi: non si tocca
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const text = read(file);
  const m = text.match(/\nexport = \{ ([^}]*) \};\n?$/);
  if (!m) continue;
  const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  // nomi richiesti dagli altri file: const { a, b: c } = require(".../base") e require(".../base").a
  const wanted = new Set();
  let wholeModule = false;
  for (const f of all) {
    if (f === file) continue;
    const t = read(f);
    if (!t.includes(`/${base}")`)) continue;
    const s2 = ts.createSourceFile(f, t, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
    const isOurRequire = (e) => {
      while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e))) e = e.expression;
      return e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "require" && e.arguments[0] && ts.isStringLiteral(e.arguments[0]) && path.basename(e.arguments[0].text) === base;
    };
    const visit = (x) => {
      if (ts.isVariableDeclaration(x) && x.initializer && isOurRequire(x.initializer)) {
        if (ts.isObjectBindingPattern(x.name)) x.name.elements.forEach((el) => wanted.add((el.propertyName || el.name).getText()));
        else wholeModule = true;
      } else if (ts.isPropertyAccessExpression(x) && isOurRequire(x.expression)) wanted.add(x.name.text);
      ts.forEachChild(x, visit);
    };
    visit(s2);
  }
  if (wholeModule) continue;
  const used = names.filter((n) => wanted.has(n));
  if (used.length === names.length) continue;
  exportsRemoved += names.length - used.length;
  write(file, text.replace(m[0], `\nexport = { ${used.join(", ")} };\n`), crlf);
}
console.log(`tolti ${total} import inutilizzati, ${exportsRemoved} nomi esportati che nessuno usa`);
