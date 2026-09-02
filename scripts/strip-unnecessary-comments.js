/**
 * Strip comments that are not required for tooling/runtime.
 * Keeps: @ts-*, eslint, prettier-ignore, webpack magic, #__PURE__,
 * istanbul/c8/v8 ignore, sourceMappingURL, @jsx.
 *
 * Usage:
 *   node scripts/strip-unnecessary-comments.js          # dry-run
 *   node scripts/strip-unnecessary-comments.js --fix
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const FIX = process.argv.includes("--fix");

const TARGET_EXT = new Set([".js", ".cjs", ".mjs", ".css", ".html", ".htm", ".py", ".sh", ".ps1"]);
const SKIP_DIRS = new Set([
  ".git",
  ".cursor",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "out",
  "deploy",
  "Lavalink",
]);

const KEEP_RE =
  /@ts-|eslint|prettier-ignore|webpack|#__PURE__|#__NO_SIDE_EFFECTS__|istanbul\s+ignore|c8\s+ignore|v8\s+ignore|sourceMappingURL|@jsx\b|biome-ignore|oxlint|@license\b|SPDX-|Copyright\b/i;

function keepCommentBody(body) {
  return KEEP_RE.test(String(body || ""));
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TARGET_EXT.has(ext)) continue;
        if (/\.min\.(js|css)$/i.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function collapseBlankRuns(text) {
  return text.replace(/\n{3,}/g, "\n\n");
}

function stripJsFallback(code) {
    let out = "";
  let i = 0;
  let removed = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = code[i];
        out += c;
        if (c === "\\") {
          if (i + 1 < n) {
            out += code[i + 1];
            i += 2;
            continue;
          }
        }
        if (quote === "`" && c === "$" && code[i + 1] === "{") {
                    out += "{";
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const e = code[i];
            if (e === '"' || e === "'" || e === "`") {
              const q2 = e;
              out += e;
              i += 1;
              while (i < n) {
                const ee = code[i];
                out += ee;
                if (ee === "\\") {
                  if (i + 1 < n) {
                    out += code[i + 1];
                    i += 2;
                    continue;
                  }
                }
                i += 1;
                if (ee === q2) break;
              }
              continue;
            }
            if (e === "{") depth += 1;
            if (e === "}") depth -= 1;
            out += e;
            i += 1;
          }
          continue;
        }
        i += 1;
        if (c === quote) break;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      let j = i + 2;
      while (j < n && code[j] !== "\n" && code[j] !== "\r") j += 1;
      const body = code.slice(i + 2, j);
      if (keepCommentBody(body)) {
        out += code.slice(i, j);
        i = j;
      } else {
        removed += 1;
        if (out.endsWith(" ")) out = out.slice(0, -1);
        i = j;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j + 1 < n && !(code[j] === "*" && code[j + 1] === "/")) j += 1;
      const end = j + 1 < n ? j + 2 : n;
      const body = code.slice(i + 2, end >= 2 ? end - 2 : end);
      if (keepCommentBody(body)) {
        out += code.slice(i, end);
      } else {
        removed += 1;
      }
      i = end;
      continue;
    }

    out += ch;
    i += 1;
  }
  return { ok: true, code: collapseBlankRuns(out), removed };
}

function stripJsWithAcorn(code) {
  const comments = [];
  const tryOpts = [
    { sourceType: "module", ecmaVersion: "latest", allowHashBang: true, allowReturnOutsideFunction: true },
    { sourceType: "script", ecmaVersion: "latest", allowHashBang: true, allowReturnOutsideFunction: true },
  ];
  let parsed = false;
  let lastErr = null;
  for (const base of tryOpts) {
    try {
      acorn.parse(code, {
        ...base,
        locations: true,
        onComment(block, text, start, end) {
          comments.push({ block, text, start, end });
        },
      });
      parsed = true;
      break;
    } catch (err) {
      lastErr = err;
      comments.length = 0;
    }
  }
  if (!parsed) {
    return stripJsFallback(code);
  }

  if (!comments.length) return { ok: true, code, removed: 0 };

  const sorted = comments.slice().sort((a, b) => b.start - a.start);
  let out = code;
  let removed = 0;
  for (const c of sorted) {
    if (keepCommentBody(c.text)) continue;
    let start = c.start;
    let end = c.end;
    const before = out.slice(0, start);
    const after = out.slice(end);
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineOnlyComment = before.slice(lineStart).trim() === "";
    const nextIsNl = after.startsWith("\n") || after.startsWith("\r\n");
    if (lineOnlyComment && nextIsNl) {
      end += after.startsWith("\r\n") ? 2 : 1;
    } else if (lineOnlyComment) {
      start = lineStart;
    } else if (!c.block && before.endsWith(" ")) {
      start -= 1;
    }
    out = out.slice(0, start) + out.slice(end);
    removed += 1;
  }
  return { ok: true, code: collapseBlankRuns(out), removed };
}

function stripCssComments(code) {
  let out = "";
  let i = 0;
  let removed = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

        if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = code[i];
        out += c;
        if (c === "\\") {
          if (i + 1 < n) {
            out += code[i + 1];
            i += 2;
            continue;
          }
        }
        i += 1;
        if (c === quote) break;
      }
      continue;
    }

        if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j + 1 < n && !(code[j] === "*" && code[j + 1] === "/")) j += 1;
      const end = j + 1 < n ? j + 2 : n;
      const body = code.slice(i + 2, end - 2);
      if (keepCommentBody(body)) {
        out += code.slice(i, end);
      } else {
        removed += 1;
                let k = end;
        if (code[k] === "\r" && code[k + 1] === "\n") k += 2;
        else if (code[k] === "\n") k += 1;
                let lineStart = out.length;
        while (lineStart > 0 && out[lineStart - 1] !== "\n") lineStart -= 1;
        if (out.slice(lineStart).trim() === "") {
          out = out.slice(0, lineStart);
        }
        i = k;
        continue;
      }
      i = end;
      continue;
    }

    out += ch;
    i += 1;
  }
  return { code: collapseBlankRuns(out), removed };
}

function stripHtmlComments(code) {
  let removed = 0;
    let out = "";
  let i = 0;
  const lower = code.toLowerCase();
  while (i < code.length) {
    const scriptOpen = lower.indexOf("<script", i);
    const styleOpen = lower.indexOf("<style", i);
    let nextOpen = -1;
    let kind = null;
    if (scriptOpen >= 0 && (styleOpen < 0 || scriptOpen < styleOpen)) {
      nextOpen = scriptOpen;
      kind = "script";
    } else if (styleOpen >= 0) {
      nextOpen = styleOpen;
      kind = "style";
    }

    const chunkEnd = nextOpen < 0 ? code.length : nextOpen;
    const chunk = code.slice(i, chunkEnd);
    const strippedChunk = chunk.replace(/<!--([\s\S]*?)-->/g, (full, body) => {
      const b = String(body || "");
      if (/^\s*\[if\b/i.test(b) || /<!\[endif\]/i.test(b)) return full;
      if (keepCommentBody(b)) return full;
      removed += 1;
      return "";
    });
    out += strippedChunk;
    if (nextOpen < 0) break;

    const gt = code.indexOf(">", nextOpen);
    if (gt < 0) {
      out += code.slice(nextOpen);
      break;
    }
    out += code.slice(nextOpen, gt + 1);
    const closeTag = kind === "script" ? "</script>" : "</style>";
    const closeAt = lower.indexOf(closeTag, gt + 1);
    if (closeAt < 0) {
      out += code.slice(gt + 1);
      break;
    }
    const inner = code.slice(gt + 1, closeAt);
    if (kind === "script") {
      const r = stripJsWithAcorn(inner);
      removed += r.removed || 0;
      out += r.code;
    } else {
      const r = stripCssComments(inner);
      removed += r.removed || 0;
      out += r.code;
    }
    out += code.slice(closeAt, closeAt + closeTag.length);
    i = closeAt + closeTag.length;
  }
  return { code: collapseBlankRuns(out), removed };
}

function stripHashComments(code, { keepShebang = true } = {}) {
  const lines = code.split(/\r?\n/);
  let removed = 0;
  const next = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (keepShebang && idx === 0 && /^#!/.test(line)) {
      next.push(line);
      continue;
    }
        let inStr = null;
    let outLine = "";
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inStr) {
        outLine += ch;
        if (ch === "`" && inStr === '"') {
                    if (i + 1 < line.length) {
            outLine += line[i + 1];
            i += 2;
            continue;
          }
        }
        if (ch === "\\" && (inStr === '"' || inStr === "'")) {
          if (i + 1 < line.length) {
            outLine += line[i + 1];
            i += 2;
            continue;
          }
        }
        if (ch === inStr) inStr = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        outLine += ch;
        i += 1;
        continue;
      }
      if (ch === "#") {
        const body = line.slice(i + 1);
        if (keepCommentBody(body)) {
          outLine += line.slice(i);
        } else {
          removed += 1;
                    outLine = outLine.replace(/[ \t]+$/, "");
        }
        break;
      }
      outLine += ch;
      i += 1;
    }
    if (outLine.trim() === "" && line.trim().startsWith("#") && !(keepShebang && idx === 0)) {
            continue;
    }
    next.push(outLine);
  }
  return { code: collapseBlankRuns(next.join("\n")), removed };
}

function stripPs1Comments(code) {
    let removed = 0;
  let out = code.replace(/<#([\s\S]*?)#>/g, (full, body) => {
    if (keepCommentBody(body)) return full;
    removed += 1;
    return "";
  });
  const lineStrip = stripHashComments(out, { keepShebang: true });
  return { code: lineStrip.code, removed: removed + lineStrip.removed };
}

function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");
  let result;

  if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
    result = stripJsWithAcorn(raw);
  } else if (ext === ".css") {
    result = stripCssComments(raw);
    result = { ok: true, ...result };
  } else if (ext === ".html" || ext === ".htm") {
        result = stripHtmlComments(raw);
    result = { ok: true, ...result };
  } else if (ext === ".py" || ext === ".sh") {
    result = stripHashComments(raw, { keepShebang: true });
    result = { ok: true, ...result };
  } else if (ext === ".ps1") {
    result = stripPs1Comments(raw);
    result = { ok: true, ...result };
  } else {
    return { changed: false, removed: 0 };
  }

  let next = result.code;
  if (raw.endsWith("\n") && !next.endsWith("\n")) next += "\n";
  if (!raw.endsWith("\n")) next = next.replace(/\n+$/g, "");

  if (next === raw) return { changed: false, removed: 0 };
  if (FIX) fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, removed: result.removed || 0 };
}

function main() {
  const files = walk(ROOT);
  let filesChanged = 0;
  let removedTotal = 0;
  let skipped = 0;
  const errors = [];
  for (const file of files) {
    const r = processFile(file);
    if (r.skipped) {
      skipped += 1;
      if (errors.length < 30) {
        errors.push(path.relative(ROOT, file) + ": " + r.error);
      }
      continue;
    }
    if (!r.changed) continue;
    filesChanged += 1;
    removedTotal += r.removed;
  }
  console.log(
    FIX ? "fixed" : "dry-run",
    "files_changed",
    filesChanged,
    "comments_removed",
    removedTotal,
    "js_parse_skipped",
    skipped,
    "scanned",
    files.length,
  );
  if (errors.length) {
    console.log("skip_samples:");
    for (const e of errors) console.log(" ", e);
  }
}

main();
