// Per le funzioni di primo livello che corrispondono al filtro: chi le usa tra le dichiarazioni che NON corrispondono
// (cioè il codice "normale"). Serve a capire quali funzioni di un evento toccano il resto e come.
//   node tools/chiamanti.cjs <file.ts> '<regex nomi>'
const fs = require("fs");
const ts = require("typescript");
const file = process.argv[2];
const pick = new RegExp(process.argv[3]);
const text = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
const decls = [];
for (const st of sf.statements) {
  let name = "";
  if (ts.isFunctionDeclaration(st) && st.name) name = st.name.text;
  else if (ts.isVariableStatement(st)) {
    const d = st.declarationList.declarations[0];
    if (d && ts.isIdentifier(d.name)) name = d.name.text;
  }
  if (name) decls.push({ name, body: text.slice(st.getStart(), st.getEnd()), fn: ts.isFunctionDeclaration(st) });
}
const exportBlock = (text.match(/export\s*=\s*\{([\s\S]*?)\};?\s*$/) || [])[1] || "";
const picked = decls.filter((d) => d.fn && pick.test(d.name));
let n = 0;
for (const p of picked) {
  const re = new RegExp(`\\b${p.name}\\b`);
  const users = decls.filter((d) => d.name !== p.name && !(d.fn && pick.test(d.name)) && re.test(d.body)).map((d) => d.name);
  const exported = re.test(exportBlock);
  if (!users.length && !exported) continue;
  n += 1;
  console.log(`${p.name}${exported ? " [ESPORTATA]" : ""} ← ${users.join(", ")}`);
}
console.log(`${n} su ${picked.length} toccano il codice normale`);
