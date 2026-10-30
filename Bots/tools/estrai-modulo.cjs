// Sposta un gruppo di dichiarazioni di primo livello da un file a un modulo nuovo (stessa cartella),
// insieme a tutto quello che usano. Il modulo nuovo non richiama mai il file di partenza (niente giri circolari):
// se una dichiarazione dipende da una "let" (stato che cambia) o da un'istruzione che non si può spostare, resta dov'è.
//   node tools/estrai-modulo.cjs <sorgente.ts> <nuovo.ts> '<regex nomi da spostare>' ["commento in testa"]
//   PROVA=1 → mostra cosa sposterebbe, senza scrivere
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const [, , srcArg, dstArg, seedRe, header] = process.argv;
const src = path.resolve(srcArg);
const dst = path.resolve(dstArg);
if (path.dirname(src) !== path.dirname(dst)) throw new Error("il modulo nuovo deve stare nella stessa cartella");
if (fs.existsSync(dst)) throw new Error(`${dst} esiste già`);
let text = fs.readFileSync(src, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
const sf = ts.createSourceFile(src, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);

function isRequireInit(e) {
  while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e))) e = e.expression;
  if (e && ts.isPropertyAccessExpression(e)) e = e.expression; // require("x").default
  return Boolean(e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "require");
}
// dichiarazioni di primo livello
const decls = []; // {names, stmt, kind: import|func|const|let|other}
for (const st of sf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) decls.push({ names: [st.name.text], stmt: st, kind: "func" });
  else if (ts.isVariableStatement(st)) {
    const dl = st.declarationList;
    const names = [];
    for (const d of dl.declarations) {
      if (ts.isIdentifier(d.name)) names.push(d.name.text);
      else d.name.elements.forEach((el) => names.push(el.name.getText()));
    }
    const allRequire = dl.declarations.every((d) => isRequireInit(d.initializer));
    const kind = allRequire ? "import" : dl.flags & ts.NodeFlags.Let || !(dl.flags & ts.NodeFlags.Const) ? "let" : "const";
    decls.push({ names, stmt: st, kind });
  } else decls.push({ names: [], stmt: st, kind: "other" });
}
const byName = new Map();
for (const d of decls) for (const n of d.names) byName.set(n, d);

// identificatori liberi usati da un nodo che sono nomi di primo livello
function deps(node) {
  const out = new Set();
  const visit = (x) => {
    if (ts.isIdentifier(x) && byName.has(x.text)) {
      const p = x.parent;
      const isProp = p && ((ts.isPropertyAccessExpression(p) && p.name === x) || (ts.isPropertyAssignment(p) && p.name === x) || (ts.isMethodDeclaration(p) && p.name === x) || ts.isPropertySignature(p) && p.name === x);
      if (!isProp) out.add(x.text);
    }
    ts.forEachChild(x, visit);
  };
  visit(node);
  return out;
}
const depsOf = new Map(decls.map((d) => [d, deps(d.stmt)]));

const seed = new RegExp(seedRe);
let chosen = new Set(decls.filter((d) => d.kind !== "import" && d.kind !== "other" && d.names.some((n) => seed.test(n))));
// chiusura: tutte le dipendenze non-import vanno spostate con loro; se una è "let" o "other", il seme resta
const blocked = new Map();
for (;;) {
  let changed = false;
  const closure = new Set(chosen);
  for (const d of closure) {
    for (const n of depsOf.get(d)) {
      const dd = byName.get(n);
      if (dd === d || dd.kind === "import") continue;
      if (!closure.has(dd)) {
        closure.add(dd);
        changed = true;
      }
    }
  }
  // le istruzioni sciolte che inizializzano una let spostata vanno con lei (es. try { x = require("canvas") })
  for (const d of decls) {
    if (d.kind !== "other" || closure.has(d)) continue;
    const ds = [...depsOf.get(d)];
    if (ds.some((n) => closure.has(byName.get(n)) && byName.get(n).kind === "let")) {
      closure.add(d);
      changed = true;
    }
  }
  // una let si può spostare solo se nessuno fuori dal gruppo la usa (fuori se ne vedrebbe una copia ferma);
  // un'istruzione sciolta solo se usa soltanto cose del gruppo o import
  const referencedOutside = (d) => decls.some((o) => !closure.has(o) && d.names.some((n) => depsOf.get(o).has(n)));
  const bad = new Set([...closure].filter((d) =>
    (d.kind === "let" && referencedOutside(d)) ||
    (d.kind === "other" && [...depsOf.get(d)].some((n) => !closure.has(byName.get(n)) && byName.get(n).kind !== "import"))));
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of closure) {
      if (bad.has(d)) continue;
      for (const n of depsOf.get(d)) {
        const dd = byName.get(n);
        if (dd !== d && bad.has(dd)) {
          bad.add(d);
          blocked.set(d.names[0], n);
          grew = true;
          break;
        }
      }
    }
  }
  const next = new Set([...closure].filter((d) => !bad.has(d)));
  if (!changed && next.size === chosen.size) break;
  if (next.size === chosen.size && [...next].every((d) => chosen.has(d))) break;
  chosen = next;
}
const moved = decls.filter((d) => chosen.has(d)); // ordine originale
const movedNames = new Set(moved.flatMap((d) => d.names));
const stay = decls.filter((d) => !chosen.has(d));

// nomi spostati che il sorgente usa ancora
const usedBySource = new Set();
for (const d of stay) for (const n of depsOf.get(d)) if (movedNames.has(n)) usedBySource.add(n);

// import che servono al modulo nuovo (solo gli elementi usati)
const usedByMoved = new Set();
for (const d of moved) for (const n of depsOf.get(d)) usedByMoved.add(n);
const importLines = [];
for (const d of decls.filter((x) => x.kind === "import")) {
  const need = d.names.filter((n) => usedByMoved.has(n));
  if (!need.length) continue;
  const dl = d.stmt.declarationList;
  if (dl.declarations.length === 1 && ts.isObjectBindingPattern(dl.declarations[0].name)) {
    const decl = dl.declarations[0];
    const els = decl.name.elements.filter((el) => need.includes(el.name.getText())).map((el) => el.getText());
    importLines.push(`const { ${els.join(", ")} } = ${decl.initializer.getText()};`);
  } else importLines.push(d.stmt.getText());
}

const report = `${moved.length} dichiarazioni da spostare (${movedNames.size} nomi), ${usedBySource.size} ancora usate da ${path.basename(src)}`;
if (process.env.PROVA) {
  console.log(report);
  console.log("spostate:", [...movedNames].join(", "));
  if (blocked.size) console.log("restano (dipendono da stato/istruzioni):", [...blocked].slice(0, 40).map(([a, b]) => `${a}←${b}`).join(", "));
  process.exit(0);
}
if (!moved.length) throw new Error("niente da spostare");

// testo del modulo nuovo
// ogni dichiarazione con i suoi commenti e la spaziatura originale (al massimo una riga vuota)
const body = moved.map((d) => {
  const t = text.slice(d.stmt.getFullStart(), d.stmt.getEnd());
  return t.startsWith("\n") ? t : `\n${t}`;
}).join("").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
const exportNames = [...movedNames].filter((n) => usedBySource.has(n));
const out = `${header ? `/** ${header} */\n` : ""}${importLines.length ? `${importLines.join("\n")}\n\n` : ""}${body}\n\nexport = { ${exportNames.join(", ")} };\n`;

// sorgente: via le dichiarazioni spostate, require del modulo nuovo dopo gli import iniziali
let s = text;
for (const d of [...moved].sort((a, b) => b.stmt.getFullStart() - a.stmt.getFullStart())) {
  // dall'a capo prima (compresi i commenti in testa) fino alla fine: l'a capo dopo resta
  s = s.slice(0, d.stmt.getFullStart()) + s.slice(d.stmt.getEnd());
}
const rel = `./${path.basename(dst).replace(/\.ts$/, "")}`;
const reqLine = `const { ${exportNames.join(", ")} } = require("${rel}") as typeof import("${rel}");\n`;
const sf2 = ts.createSourceFile(src, s, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
const firstNonImport = sf2.statements.find((st) => !(ts.isVariableStatement(st) && st.declarationList.declarations.every((d) => isRequireInit(d.initializer))));
const at = firstNonImport ? firstNonImport.getFullStart() : s.length;
s = exportNames.length ? s.slice(0, at) + (s[at - 1] === "\n" ? "" : "\n") + reqLine + s.slice(at) : s;

const w = (f, t) => fs.writeFileSync(f, crlf ? t.replace(/\n/g, "\r\n") : t);
w(dst, out);
w(src, s);
console.log(report);
console.log(`${path.basename(dst)}: ${out.split("\n").length} righe; ${path.basename(src)}: ${s.split("\n").length} righe`);
