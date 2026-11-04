/**
 * Safe migrate: <:name:id> → ${E.key}
 *
 * Uses placeholders so non-ident keys (E["1343arrowleft"]) never break
 * surrounding "..." / '...' strings before they are promoted to templates.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botsSrc = path.join(__dirname, "..", "..");
const catalogPath = path.join(__dirname, "emojiCatalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const tagToKey = new Map();
for (const [key, entry] of Object.entries(catalog)) {
  const discordName = entry.name || key.split("__")[0];
  tagToKey.set(`${entry.animated ? "a" : ""}:${discordName}:${entry.id}`, key);
  tagToKey.set(`:${discordName}:${entry.id}`, key);
}

function isIdent(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function exprForKey(key) {
  return isIdent(key) ? `E.${key}` : `E[${JSON.stringify(key)}]`;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (p.includes(`${path.sep}shared${path.sep}emojis`)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function resolveImportPath(fromFile) {
  let rel = path
    .relative(path.dirname(fromFile), path.join(__dirname, "emojiCatalog"))
    .split(path.sep)
    .join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function alreadyImportsE(src) {
  return /emojis\/emojiCatalog["']/.test(src) || /shared\/emojis/.test(src);
}

function insertImport(src, importPath) {
  const line = `const { E } = require("${importPath}") as typeof import("${importPath}");`;
  const lines = src.split(/\r?\n/);
  let lastReq = -1;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (/^\s*const\s+.*=\s*require\(/.test(lines[i]) || /^\s*import\s+/.test(lines[i])) lastReq = i;
    else if (
      lastReq >= 0 &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("//") &&
      !lines[i].trim().startsWith("*") &&
      !lines[i].trim().startsWith("/*") &&
      !/typeof import\(/.test(lines[i])
    ) {
      if (!/^\s*as typeof/.test(lines[i]) && !/^\s*\)/.test(lines[i])) break;
    }
  }
  if (lastReq >= 0) {
    let insertAt = lastReq + 1;
    while (
      insertAt < lines.length &&
      (/as typeof import\(/.test(lines[insertAt]) ||
        /^\s*\)/.test(lines[insertAt]) ||
        lines[insertAt].trim() === "")
    ) {
      insertAt++;
    }
    lines.splice(insertAt, 0, line);
    return lines.join("\n");
  }
  return line + "\n" + src;
}

const PH_OPEN = "\uE000EMOJI:";
const PH_CLOSE = "\uE001";

/** Convert "..." / '...' that contain placeholders or ${ into `...` */
function promoteStringsWithPlaceholders(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "`") {
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === "`") {
          out += "`";
          i++;
          break;
        }
        out += src[i++];
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let raw = "";
      i++;
      let closed = false;
      while (i < src.length) {
        if (src[i] === "\\") {
          raw += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          closed = true;
          i++;
          break;
        }
        if (src[i] === "\n") break;
        raw += src[i++];
      }
      if (closed && (raw.includes("${") || raw.includes(PH_OPEN))) {
        // Sole placeholder → keep as quoted for now; unwrap after placeholder→expr
        const solePh = raw.match(new RegExp(`^${PH_OPEN}([^${PH_CLOSE}]+)${PH_CLOSE}$`));
        if (solePh) {
          out += quote + raw + quote;
        } else {
          const templ = raw.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/`/g, "\\`");
          out += "`" + templ + "`";
        }
      } else {
        out += quote + raw + (closed ? quote : "");
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function placeholdersToExprs(src) {
  const phRx = new RegExp(`${PH_OPEN}([^${PH_CLOSE}]+)${PH_CLOSE}`, "g");
  return src.replace(phRx, (_, key) => `\${${exprForKey(key)}}`);
}

/** "${E.x}" / '${E.x}' / "`${E.x}`" sole → E.x ; same for E["k"] */
function unwrapSoleEmojiStrings(src) {
  let out = src;
  out = out.replace(/["'`]\$\{(E\.[A-Za-z_$][A-Za-z0-9_$]*)\}["'`]/g, "$1");
  out = out.replace(/["'`]\$\{(E\[[^\]]+\])\}["'`]/g, "$1");
  return out;
}

export function migrateSource(src, file) {
  const tagRx = /<(a)?:([A-Za-z0-9_]+):(\d+)>/g;
  if (!tagRx.test(src)) return { src, replacements: 0, missing: [] };
  tagRx.lastIndex = 0;
  let fileRepl = 0;
  const missing = [];
  let next = src.replace(tagRx, (full, a, name, id) => {
    const animated = a === "a";
    let key =
      tagToKey.get(`${animated ? "a" : ""}:${name}:${id}`) || tagToKey.get(`:${name}:${id}`);
    if (!key) {
      const ent = catalog[name];
      if (ent && ent.id === id) key = name;
    }
    if (!key) {
      missing.push(`${name}:${id}`);
      return full;
    }
    fileRepl++;
    return `${PH_OPEN}${key}${PH_CLOSE}`;
  });
  if (fileRepl === 0) return { src, replacements: 0, missing };
  next = promoteStringsWithPlaceholders(next);
  next = placeholdersToExprs(next);
  next = unwrapSoleEmojiStrings(next);
  if (!alreadyImportsE(next)) {
    next = insertImport(next, resolveImportPath(file));
  }
  return { src: next, replacements: fileRepl, missing };
}

const dry = process.argv.includes("--dry");
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = walk(botsSrc);
  let changedFiles = 0;
  let replacements = 0;
  const missing = new Map();

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const { src: next, replacements: n, missing: miss } = migrateSource(src, file);
    for (const m of miss || []) missing.set(m, (missing.get(m) || 0) + 1);
    if (n === 0) continue;
    if (!dry) fs.writeFileSync(file, next, "utf8");
    changedFiles++;
    replacements += n;
    console.log("updated", path.relative(botsSrc, file), "+", n);
  }

  console.log("\nDONE files", changedFiles, "replacements", replacements, dry ? "(dry)" : "");
  if (missing.size) {
    console.log("UNMAPPED tags:");
    for (const [k, n] of [...missing.entries()].sort((a, b) => b[1] - a[1])) console.log(" ", n, k);
  }
}
