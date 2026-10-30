// Toglie il codice di un evento concluso semplificando le condizioni che, a evento chiuso, hanno un valore certo.
// Lavora sul testo (non riformatta il file) ed è prudente: semplifica solo se le parti scartate non hanno
// effetti (niente await, assegnazioni o chiamate sconosciute). Ripete finché non c'è più niente da fare.
//   node tools/semplifica-evento.cjs <file.ts> <regole.json>      (PROVA=1 → conta senza scrivere)
// regole.json: {
//   "falseCalls": ["isX", …],        chiamate sempre false      "trueCalls": [...] sempre vere
//   "falseProps": ["hogwartsEventLive", …]   x.prop / x?.prop sempre falsy
//   "deadTypes": "^(hogwarts|findScroll$)"   stringhe di tipi di gioco che non esistono più
//   "pureCalls": "^(is|has|should|String|Boolean|Number)"   chiamate che si possono scartare
//   "dropCalls": ["stampX", …]       istruzioni "x(…);" / "await x(…);" / "void x(…);" da togliere (non fanno più niente)
//   "identityCalls": {"applyX": 0}   x(a, b) → argomento indicato (la funzione lo restituisce invariato)
// }
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const file = path.resolve(process.argv[2]);
const rules = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const falseCalls = new Set(rules.falseCalls || []);
const trueCalls = new Set(rules.trueCalls || []);
const falseProps = new Set(rules.falseProps || []);
const deadType = new RegExp(rules.deadTypes || "^$^");
const pureCall = new RegExp(rules.pureCalls || "^(is|has|should|String|Boolean|Number)");
const dropCalls = new Set(rules.dropCalls || []);
const identityCalls = new Map(Object.entries(rules.identityCalls || {}));
const T = 1, F = 0, U = -1;

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return "";
}
function knownCall(call) {
  const name = calleeName(call);
  return falseCalls.has(name) || trueCalls.has(name);
}
function isPure(n) {
  let ok = true;
  const visit = (x) => {
    if (!ok) return;
    if (ts.isAwaitExpression(x) && ts.isCallExpression(strip(x.expression)) && knownCall(strip(x.expression))) { ts.forEachChild(x, visit); return; }
    if (ts.isAwaitExpression(x) || ts.isYieldExpression(x) || ts.isNewExpression(x) || ts.isDeleteExpression(x)) ok = false;
    else if (ts.isBinaryExpression(x) && x.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && x.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ok = false;
    else if (ts.isPrefixUnaryExpression(x) && (x.operator === ts.SyntaxKind.PlusPlusToken || x.operator === ts.SyntaxKind.MinusMinusToken)) ok = false;
    else if (ts.isPostfixUnaryExpression(x)) ok = false;
    else if (ts.isCallExpression(x)) {
      const name = calleeName(x);
      if (!(falseCalls.has(name) || trueCalls.has(name) || pureCall.test(name))) ok = false;
    } else if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return; // non eseguite qui
    ts.forEachChild(x, visit);
  };
  visit(n);
  return ok;
}
function isLogic(x) {
  return ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken);
}
function inBooleanContext(n) {
  for (let x = n; x.parent; x = x.parent) {
    const p = x.parent;
    if (ts.isParenthesizedExpression(p) || isLogic(p)) continue;
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return true;
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === x) return true;
    if (ts.isConditionalExpression(p) && p.condition === x) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "Boolean") return true;
    return false;
  }
  return false;
}
function strip(n) {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) n = n.expression;
  return n;
}
// valori noti di const locali (const x = <espressione nota>)
function evalExpr(n, env) {
  n = strip(n);
  if (ts.isAwaitExpression(n) && ts.isCallExpression(strip(n.expression)) && knownCall(strip(n.expression))) n = strip(n.expression);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return T;
  if (n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) return F;
  if (ts.isIdentifier(n)) {
    if (n.text === "undefined") return F;
    return env.has(n.text) ? env.get(n.text) : U;
  }
  if (ts.isCallExpression(n)) {
    const name = calleeName(n);
    if (falseCalls.has(name)) return F;
    if (trueCalls.has(name)) return T;
    if (name === "Boolean" && n.arguments.length === 1) return evalExpr(n.arguments[0], env);
    return U;
  }
  if (ts.isPropertyAccessExpression(n)) {
    if (falseProps.has(n.name.text)) return F;
    // a.vuoto?.x / a.vuoto.x: se l'oggetto è sempre vuoto lo è anche la proprietà
    return evalExpr(n.expression, env) === F && !ts.isIdentifier(strip(n.expression)) ? F : U;
  }
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
    const v = evalExpr(n.operand, env);
    return v === U ? U : v === T ? F : T;
  }
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      const a = evalExpr(n.left, env);
      const b = evalExpr(n.right, env);
      const and = op === ts.SyntaxKind.AmpersandAmpersandToken;
      const absorbing = and ? F : T;
      if (a === absorbing) return absorbing; // il lato destro non viene eseguito comunque
      if (b === absorbing && isPure(n.left)) return absorbing;
      if (a !== U && b !== U) return and ? (a && b ? T : F) : a || b ? T : F;
      if (a === (and ? T : F)) return b;
      if (b === (and ? T : F) && isPure(n.right)) return a;
      return U;
    }
    const eq = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
    const neq = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
    if ((eq || neq) && (isPure(n.left) && isPure(n.right))) {
      const lit = ts.isStringLiteral(strip(n.right)) ? strip(n.right) : ts.isStringLiteral(strip(n.left)) ? strip(n.left) : null;
      if (lit && deadType.test(lit.text)) return eq ? F : T;
    }
  }
  return U;
}

function lineStart(text, pos) {
  return text.lastIndexOf("\n", pos - 1) + 1;
}
function blockInner(text, block) {
  // contenuto di { … } senza graffe, riallineato di un livello
  const inner = text.slice(block.getStart() + 1, block.getEnd() - 1).replace(/^\n/, "").replace(/\n[ \t]*$/, "\n");
  return inner.replace(/^( {2}|\t)/gm, "");
}
function canUnwrap(block) {
  return block.statements.every((s) => !(ts.isVariableStatement(s) && s.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) && !ts.isFunctionDeclaration(s) && !ts.isClassDeclaration(s));
}

function onePass(text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const edits = [];
  const taken = [];
  const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);
  function envFor(node) {
    const env = new Map();
    let fn = node.parent;
    while (fn && !ts.isFunctionLike(fn) && !ts.isSourceFile(fn)) fn = fn.parent;
    if (!fn) return env;
    const scan = (x) => {
      if (ts.isVariableDeclaration(x) && ts.isIdentifier(x.name) && x.initializer && x.parent.flags & ts.NodeFlags.Const) {
        const v = evalExpr(x.initializer, env);
        if (v !== U && isPure(x.initializer)) env.set(x.name.text, v);
      }
      if (x !== fn && ts.isFunctionLike(x)) return;
      ts.forEachChild(x, scan);
    };
    scan(fn);
    return env;
  }
  const visit = (n) => {
    if (ts.isBlock(n)) {
      const i = n.statements.findIndex((st) => ts.isReturnStatement(st) || ts.isThrowStatement(st));
      const rest = i >= 0 ? n.statements.slice(i + 1) : [];
      if (rest.length && rest.every((st) => !ts.isFunctionDeclaration(st))) {
        const start = n.statements[i].getEnd();
        const end = rest[rest.length - 1].getEnd();
        if (!overlaps(start, end)) {
          edits.push([start, end, ""]);
          taken.push([start, end]);
        }
      }
    }
    if (ts.isExpressionStatement(n)) {
      let e = strip(n.expression);
      if (ts.isAwaitExpression(e) || ts.isVoidExpression(e)) e = strip(e.expression);
      const inBlock = ts.isBlock(n.parent) || ts.isSourceFile(n.parent) || ts.isCaseClause(n.parent) || ts.isDefaultClause(n.parent);
      if (inBlock && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && dropCalls.has(e.expression.text) && e.arguments.every(isPure)) {
        const start = lineStart(text, n.getStart());
        let end = n.getEnd();
        if (text[end] === "\n") end += 1;
        if (!overlaps(start, end) && text.slice(start, n.getStart()).trim() === "") {
          edits.push([start, end, ""]);
          taken.push([start, end]);
          return;
        }
      }
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && identityCalls.has(n.expression.text) && !overlaps(n.getStart(), n.getEnd())) {
      const a = n.arguments[Number(identityCalls.get(n.expression.text))];
      if (a && n.arguments.every((x) => x === a || isPure(x))) {
        const k = text.slice(a.getStart(), a.getEnd());
        const simple = ts.isIdentifier(a) || ts.isCallExpression(a) || ts.isPropertyAccessExpression(a) || ts.isLiteralExpression(a) || ts.isParenthesizedExpression(a);
        edits.push([n.getStart(), n.getEnd(), simple ? k : `(${k})`]);
        taken.push([n.getStart(), n.getEnd()]);
        return;
      }
    }
    // if (…) types.push("tipoMorto");  → via
    if (ts.isIfStatement(n) && !n.elseStatement && (ts.isBlock(n.parent) || ts.isSourceFile(n.parent))) {
      let th = n.thenStatement;
      if (ts.isBlock(th) && th.statements.length === 1) th = th.statements[0];
      const call = ts.isExpressionStatement(th) && ts.isCallExpression(th.expression) ? th.expression : null;
      if (call && calleeName(call) === "push" && call.arguments.length === 1 && ts.isStringLiteral(call.arguments[0]) && deadType.test(call.arguments[0].text) && isPure(n.expression)) {
        const start = lineStart(text, n.getStart());
        let end = n.getEnd();
        if (text[end] === "\n") end += 1;
        if (!overlaps(start, end)) {
          edits.push([start, end, ""]);
          taken.push([start, end]);
          return;
        }
      }
    }
    if (ts.isIfStatement(n)) {
      const v = evalExpr(n.expression, envFor(n));
      // "} else if (…) {…}": si sostituisce solo da dopo la "}" del blocco precedente
      if (v !== U && isPure(n.expression) && ts.isIfStatement(n.parent) && n.parent.elseStatement === n) {
        const start = n.parent.thenStatement.getEnd();
        const end = n.getEnd();
        if (!overlaps(start, end)) {
          const keep = v === T ? n.thenStatement : n.elseStatement;
          edits.push([start, end, keep ? ` else ${text.slice(keep.getStart(), keep.getEnd())}` : ""]);
          taken.push([start, end]);
          return;
        }
      }
      const inBlock = ts.isBlock(n.parent) || ts.isSourceFile(n.parent) || ts.isCaseClause(n.parent) || ts.isDefaultClause(n.parent) || ts.isModuleBlock(n.parent);
      if (v !== U && isPure(n.expression) && inBlock) {
        const start = lineStart(text, n.getStart());
        let end = n.getEnd();
        if (text[end] === "\n") end += 1;
        if (!overlaps(start, end)) {
          const indent = text.slice(start, n.getStart());
          const keep = v === T ? n.thenStatement : n.elseStatement;
          let repl = "";
          if (keep) {
            if (ts.isBlock(keep) && canUnwrap(keep)) {
              repl = blockInner(text, keep);
            } else {
              repl = `${indent}${text.slice(keep.getStart(), keep.getEnd())}\n`;
            }
            if (repl && !repl.endsWith("\n")) repl += "\n";
          }
          edits.push([start, end, repl]);
          taken.push([start, end]);
          return;
        }
      }
    }
    // "a || <falso>" → a, "<vero> && b" → b (il lato tolto deve essere puro)
    if (isLogic(n) && !overlaps(n.getStart(), n.getEnd())) {
      const and = n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
      const neutral = and ? T : F;
      const env = envFor(n);
      const l = evalExpr(n.left, env);
      const r = evalExpr(n.right, env);
      let keep = null;
      if (l === neutral && r === U && isPure(n.left)) keep = n.right;
      // togliere il lato destro cambia il valore (a || null ≠ a): solo dove conta il vero/falso
      else if (r === neutral && l === U && isPure(n.right) && inBooleanContext(n)) keep = n.left;
      if (keep) {
        const k = text.slice(keep.getStart(), keep.getEnd());
        edits.push([n.getStart(), n.getEnd(), isLogic(keep) && isLogic(n.parent) ? `(${k})` : k]);
        taken.push([n.getStart(), n.getEnd()]);
        return;
      }
    }
    // "a && b" / "a || b" dal valore certo (fuori da if/ternari) → false/true; "await false" → false
    if (isLogic(n) && !isLogic(strip(n.parent)) && !isLogic(n.parent) && !ts.isIfStatement(n.parent) && !ts.isConditionalExpression(n.parent)) {
      const v = evalExpr(n, envFor(n));
      if (v !== U && isPure(n) && !overlaps(n.getStart(), n.getEnd())) {
        edits.push([n.getStart(), n.getEnd(), v === T ? "true" : "false"]);
        taken.push([n.getStart(), n.getEnd()]);
        return;
      }
    }
    if (ts.isAwaitExpression(n) && (n.expression.kind === ts.SyntaxKind.FalseKeyword || n.expression.kind === ts.SyntaxKind.TrueKeyword) && !overlaps(n.getStart(), n.getEnd())) {
      edits.push([n.getStart(), n.getEnd(), n.expression.getText()]);
      taken.push([n.getStart(), n.getEnd()]);
      return;
    }
    if (ts.isConditionalExpression(n)) {
      const v = evalExpr(n.condition, envFor(n));
      if (v !== U && isPure(n.condition) && !overlaps(n.getStart(), n.getEnd())) {
        const keep = v === T ? n.whenTrue : n.whenFalse;
        const k = text.slice(keep.getStart(), keep.getEnd());
        const simple = ts.isIdentifier(keep) || ts.isLiteralExpression(keep) || ts.isCallExpression(keep) || ts.isPropertyAccessExpression(keep) || ts.isParenthesizedExpression(keep) || ts.isArrayLiteralExpression(keep) || ts.isObjectLiteralExpression(keep) || keep.kind === ts.SyntaxKind.NullKeyword || keep.kind === ts.SyntaxKind.TrueKeyword || keep.kind === ts.SyntaxKind.FalseKeyword || ts.isTemplateExpression(keep) || ts.isNoSubstitutionTemplateLiteral(keep);
        edits.push([n.getStart(), n.getEnd(), simple ? k : `(${k})`]);
        taken.push([n.getStart(), n.getEnd()]);
        return;
      }
    }
    // un case con corpo in cui "cade" il case precedente vuoto non si toglie: il precedente perderebbe il suo codice
    const prevClause = ts.isCaseClause(n) ? n.parent.clauses[n.parent.clauses.indexOf(n) - 1] : null;
    const fedByPrevious = Boolean(prevClause && prevClause.statements.length === 0 && n.statements.length > 0);
    if (ts.isCaseClause(n) && !fedByPrevious && ts.isStringLiteral(strip(n.expression)) && deadType.test(strip(n.expression).text)) {
      const start = lineStart(text, n.getStart());
      let end = n.getEnd();
      if (text[end] === "\n") end += 1;
      if (!overlaps(start, end)) {
        // con corpo: tolta tutta; senza corpo (cade nel caso dopo): tolta solo l'etichetta
        edits.push([start, end, ""]);
        taken.push([start, end]);
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = text;
  for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + r + out.slice(b);
  return { out, n: edits.length, edits };
}

let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
text = text.replace(/\r\n/g, "\n");
const before = text.split("\n").length;
let total = 0;
for (let i = 0; i < 50; i += 1) {
  const { out, n, edits } = onePass(text);
  if (!n) break;
  const chk = ts.createSourceFile(file, out, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  if (chk.parseDiagnostics.length) {
    const d = chk.parseDiagnostics[0];
    const line = out.slice(0, d.start).split("\n").length;
    console.error(`errore di sintassi dopo la passata ${i + 1} (riga ${line}): ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    // la modifica colpevole: quella il cui risultato, da sola, rompe la sintassi
    for (const [x, y, r] of edits) {
      const alone = text.slice(0, x) + r + text.slice(y);
      if (ts.createSourceFile(file, alone, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS).parseDiagnostics.length) {
        const l = text.slice(0, x).split("\n").length;
        console.error(`--- modifica alla riga ${l}:\nPRIMA:\n${text.slice(x, y).slice(0, 900)}\nDOPO:\n${r.slice(0, 900)}`);
      }
    }
    process.exit(1);
  }
  total += n;
  text = out;
}
const after = text.split("\n").length;
console.log(`${path.basename(file)}: ${total} semplificazioni, righe ${before} → ${after}`);
if (!process.env.PROVA) fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
