const fs = require("fs");
const path = require("path");

const GLOBALS = new Set([
  "console", "Buffer", "process", "__dirname", "__filename", "require", "module", "exports", "global",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate", "clearImmediate",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "Array", "Object", "String", "Number", "Boolean",
  "Date", "RegExp", "Error", "Math", "JSON", "parseFloat", "parseInt", "isNaN", "isFinite",
  "decodeURIComponent", "encodeURIComponent", "encodeURI", "decodeURI", "globalThis", "Symbol",
  "Intl", "Reflect", "Proxy", "Map", "Set", "TextEncoder", "TextDecoder", "URL", "URLSearchParams",
  "AbortController", "BigInt", "ArrayBuffer", "Float32Array", "Float64Array", "Int32Array", "Uint8Array",
  "NaN", "undefined", "Infinity", "arguments", "logger", "MessageEmbed", "EmbedBuilder", "AttachmentBuilder"
]);

function extractRequireNames(content) {
  const names = new Set();
  const destructureRe = /const\s*\{([^}]+)\}\s*=\s*require\s*\([^)]+\)/g;
  let m;
  while ((m = destructureRe.exec(content)) !== null) {
    const inner = m[1];
    const parts = inner.split(",").map((s) => s.trim().replace(/\s*:.*$/, "").trim());
    parts.forEach((p) => names.add(p));
  }
  const singleRe = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*require\s*\([^)]+\)/g;
  while ((m = singleRe.exec(content)) !== null) names.add(m[1]);
  return names;
}

function extractLocalDefinitions(content) {
  const names = new Set();
  const funcDeclRe = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = funcDeclRe.exec(content)) !== null) names.add(m[1]);
  const asyncFuncRe = /\basync\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  while ((m = asyncFuncRe.exec(content)) !== null) names.add(m[1]);
  const constRe = /\b(?:const|let|var)\s+(?:(\{[^}]+\})|(?:\[[^\]]+\])|([A-Za-z_][A-Za-z0-9_]*))\s*=/g;
  while ((m = constRe.exec(content)) !== null) {
    if (m[2]) names.add(m[2]);
    else if (m[1]) {
      m[1].replace(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g, (_, n) => names.add(n));
    }
  }
  const classRe = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  while ((m = classRe.exec(content)) !== null) names.add(m[1]);
  return names;
}

function extractUsedIdentifiers(content) {
  const used = new Set();
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = callRe.exec(content)) !== null) used.add(m[1]);
  const memberRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\./g;
  while ((m = memberRe.exec(content)) !== null) used.add(m[1]);
  return used;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const imported = extractRequireNames(content);
  const local = extractLocalDefinitions(content);
  const used = extractUsedIdentifiers(content);
  const defined = new Set([...imported, ...local, ...GLOBALS]);
  const missing = [];
  for (const u of used) {
    if (defined.has(u)) continue;
    if (u.length <= 1) continue;
    missing.push(u);
  }
  return missing;
}

const root = path.join(__dirname, "..");
const jsFiles = [];
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(full);
    } else if (e.name.endsWith(".js")) jsFiles.push(full);
  }
}
walk(root);

const issues = [];
for (const f of jsFiles) {
  const rel = path.relative(root, f);
  try {
    const missing = checkFile(f);
    if (missing.length) issues.push({ file: rel, missing: [...missing].sort() });
  } catch (err) {
    issues.push({ file: rel, error: err.message });
  }
}

if (issues.length === 0) {
  console.log("OK: no missing-import issues found.");
  process.exit(0);
}

console.log("Potential missing imports (verify manually - may have false positives):\n");
for (const { file, missing, error } of issues) {
  if (error) {
    console.log(file, "Error:", error);
    continue;
  }
  const filtered = missing.filter(
    (m) => !/^(then|catch|finally|resolve|reject|reject|send|reply|editReply|deferUpdate|update|followUp|value|done|next|err)$/.test(m)
  );
  if (filtered.length) console.log(file, "->", filtered.join(", "));
}
process.exit(issues.length > 0 ? 1 : 0);
