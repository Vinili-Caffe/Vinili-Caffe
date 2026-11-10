/**
 * Estrae i testi italiani dell'interfaccia (testi JSX, stringhe e template) da un insieme di file,
 * per tradurli col traduttore di testo (src/lib/i18n-text.ts).
 *
 *   node scripts/extract-ui-texts.mjs <uscita.json> <cartella-o-file> [altri…]
 *
 * Le parti variabili dei template (`${x}`) e i numeri diventano {0}, {1}… come nel traduttore.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) {
  console.error("Uso: node scripts/extract-ui-texts.mjs <uscita.json> <cartella-o-file> …");
  process.exit(1);
}

const files = [];
const walk = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (/\.(tsx?|mts)$/.test(p) && !p.endsWith(".d.ts")) files.push(p);
};
inputs.forEach(walk);

const SKIP_ATTRS = new Set(["className", "href", "src", "key", "id", "type", "name", "role", "rel", "target", "method", "autoComplete", "inputMode", "lang", "dir", "style", "htmlFor", "accept", "mode", "variant", "size", "tone", "sizes", "loading", "decoding", "as", "aria-haspopup", "aria-live", "aria-current"]);
const SKIP_PROPS = new Set(["className", "href", "src", "id", "key", "type", "value", "icon", "path", "url", "color", "tone", "mode", "variant", "kind", "status", "level", "area", "match", "behavior", "style", "anchor", "query", "hexcode", "token"]);
const SKIP_CALLS = new Set(["cn", "require", "fetch", "encodeURIComponent", "querySelector", "querySelectorAll", "getItem", "setItem", "removeItem", "getAttribute", "setAttribute", "addEventListener", "removeEventListener", "includes", "startsWith", "endsWith", "split", "join", "replace", "test", "match", "matchAll", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "Intl", "page", "cdnUrl", "call", "get", "set", "has", "delete", "post", "put", "patch", "dispatchEvent", "CustomEvent", "Error", "RegExp", "URLSearchParams", "useState", "createElement", "log", "warn", "error", "info", "debug", "postMessage", "pushState", "replaceState", "Date", "Number", "String", "parseInt", "padStart", "slice", "localeCompare", "isGuildSection", "guildSectionHref", "loadGuildEmojis"]);

const tailwindToken = /^!?(?:[a-z0-9-]+:)*-?[a-z0-9]+(?:-[a-z0-9.\/\[\]#%(),_'"=&>+*~]+)*(?:\/[0-9.\[\]]+)?$/;
const looksLikeCode = (s) => {
  const t = s.trim();
  if (!t) return true;
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return true;
  if (/^(https?:|\/|\.\/|#|@|data:|mailto:)/.test(t)) return true;
  if (/^[a-z][a-zA-Z0-9_]*$/.test(t) && !/[àèéìòù]/.test(t) && t.length < 24 && !/^(ok|no|si|sì)$/i.test(t)) return true; /* identificatori */
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3) return true; /* COSTANTI */
  if (/^[a-z0-9_.:-]+$/.test(t) && /[._:-]/.test(t)) return true; /* chiavi, percorsi */
  const toks = t.split(/\s+/);
  if (toks.length > 1 && toks.every((x) => tailwindToken.test(x)) && toks.some((x) => x.includes("-") || x.includes(":"))) return true;
  if (/^[\w-]+=/.test(t)) return true;
  if (/[{};]\s*$/.test(t) && /[:=]/.test(t)) return true;
  if (/^\s*[<{[(]/.test(t) && /[>}\])]\s*$/.test(t)) return true;
  return false;
};

const decode = (s) =>
  s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const norm = (s) => decode(s).replace(/\s+/g, " ").trim();
/* numeri → {n} come nel traduttore */
const withNums = (s) => {
  let i = 0;
  const parts = s.split(/(\{\d+\})/);
  const counter = { n: 0 };
  void counter;
  return parts.map((p) => (/^\{\d+\}$/.test(p) ? p : p)).join("");
};

const found = new Map();
const add = (raw, file) => {
  let s = norm(raw);
  if (!s || s.length < 2 || looksLikeCode(s)) return;
  /* numeri letterali diventano segnaposto in ordine dopo quelli dei template */
  let idx = (s.match(/\{\d+\}/g) || []).length;
  s = s.replace(/(?<![{\w])\d+(?:[.,]\d+)*(?![}\w])/g, () => `{${idx++}}`);
  /* rinumera i segnaposto in ordine di comparsa */
  let k = 0;
  const map = new Map();
  s = s.replace(/\{(\d+)\}/g, (m) => {
    if (!map.has(m)) map.set(m, `{${k++}}`);
    return map.get(m);
  });
  if (!found.has(s)) found.set(s, new Set());
  found.get(s).add(path.basename(file));
};

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node, ctx) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (SKIP_ATTRS.has(name) || name.startsWith("data-")) return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/["']/g, "");
      if (SKIP_PROPS.has(name)) return;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf).split(".").pop() || "";
      if (SKIP_CALLS.has(callee)) {
        /* visita solo gli argomenti che non sono stringhe */
        node.arguments.forEach((a) => !ts.isStringLiteralLike(a) && visit(a, ctx));
        return;
      }
    }
    if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
    if (ts.isElementAccessExpression(node)) return;
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) return;
    if (ts.isCaseClause(node)) {
      node.statements.forEach((s) => visit(s, ctx));
      return;
    }
    if (ts.isJsxText(node)) add(node.getText(sf), file);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text, file);
    else if (ts.isTemplateExpression(node)) {
      let s = node.head.text;
      node.templateSpans.forEach((span, i) => {
        s += `{${i}}` + span.literal.text;
        visit(span.expression, ctx);
      });
      add(s, file);
      return;
    }
    ts.forEachChild(node, (c) => visit(c, ctx));
  };
  visit(sf, {});
}

const list = [...found.keys()].sort((a, b) => a.localeCompare(b, "it"));
fs.writeFileSync(out, JSON.stringify(list, null, 1));
console.log(`${list.length} testi da ${files.length} file → ${out}`);
void withNums;
