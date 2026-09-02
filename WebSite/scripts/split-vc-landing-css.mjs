import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_DIR = path.join(__dirname, "..", "css");
const SRC = path.join(CSS_DIR, "vc-landing.css");
const VER = process.env.VC_CSS_SPLIT_VER || "20260831cssSplitFix1";

const EXT_TOKENS = [
  "vc-dashboard",
  "vc-dash-",
  "vc-workflow",
  "vc-staff-tools",
  "vc-staff-inbox",
  "vc-staff-profile",
  "vc-wt-layout",
  "vc-wt-chat",
  "vc-rank-customize",
  "vc-user-profile",
  "vc-user-leader",
  "vc-users-page",
  "vc-roles-page",
  "vc-custom-profile",
  "vc-notif-staff",
  "vc-seratafilm",
  "vc-hogwarts",
  "vc-hw-page",
  "vc-bgm-player",
  "vc-bgm-",
  "vc-guild-dash",
  "vc-dashboard-guild",
  "vc-premium-footer",
  "vc-ul-loading",
  "vc-pers-tab",
  "vc-maintenance-overlay",
];

function chunkExt(text) {
  const t = String(text || "").toLowerCase();
  return EXT_TOKENS.some((tok) => t.includes(tok));
}

function tokenizeCss(css) {
  const blocks = [];
  let i = 0;
  const n = css.length;

  function skipWs() {
    while (i < n && /\s/.test(css[i])) i += 1;
  }

  function readUntil(sep) {
    const start = i;
    while (i < n && css[i] !== sep) i += 1;
    return css.slice(start, i);
  }

  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (css[i] === "/") {
      if (css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        const slice = css.slice(i, end >= 0 ? end + 2 : n);
        blocks.push({ kind: "comment", text: slice, ext: chunkExt(slice) });
        i = end >= 0 ? end + 2 : n;
        continue;
      }
      i += 1;
      continue;
    }
    if (css[i] === "@") {
      const prelude = readUntil("{");
      const at = ("@" + prelude).trim();
      if (at.startsWith("@import") || at.startsWith("@charset")) {
        let j = i;
        while (j < n && css[j] !== ";") j += 1;
        const slice = css.slice(i, j + 1);
        blocks.push({ kind: "at", text: slice, ext: false });
        i = j + 1;
        continue;
      }
      i += 1;
      let depth = 1;
      const bodyStart = i;
      while (i < n && depth > 0) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") depth -= 1;
        i += 1;
      }
      const slice = css.slice(prelude.startsWith("@") ? prelude.indexOf("@") : 0);
      const full = css.slice(css.lastIndexOf("@", i - 1), i);
      const atLower = full.slice(0, full.indexOf("{")).toLowerCase();
      const body = full.slice(full.indexOf("{") + 1, full.lastIndexOf("}"));
      const ext = chunkExt(atLower) || chunkExt(body);
      blocks.push({ kind: "atblock", text: full, ext });
      continue;
    }
    const selStart = i;
    readUntil("{");
    i += 1;
    let depth = 1;
    while (i < n && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    const full = css.slice(selStart, i);
    blocks.push({ kind: "rule", text: full, ext: chunkExt(full) });
  }
  return blocks;
}

function splitBlocks(css) {
  const blocks = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i += 1;
    if (i >= n) break;

    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const text = css.slice(i, end >= 0 ? end + 2 : n);
      blocks.push({ text, ext: chunkExt(text) });
      i = end >= 0 ? end + 2 : n;
      continue;
    }

    if (css[i] === "@") {
      const brace = css.indexOf("{", i);
      if (brace < 0) break;
      const head = css.slice(i, brace).trim().toLowerCase();
      if (head.startsWith("@import") || head.startsWith("@charset")) {
        const semi = css.indexOf(";", i);
        const text = css.slice(i, semi >= 0 ? semi + 1 : n);
        blocks.push({ text, ext: false });
        i = semi >= 0 ? semi + 1 : n;
        continue;
      }
      let depth = 0;
      let j = brace;
      while (j < n) {
        if (css[j] === "{") depth += 1;
        else if (css[j] === "}") {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
        j += 1;
      }
      const text = css.slice(i, j);
      const inner = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
      blocks.push({ text, ext: chunkExt(text) || chunkExt(inner) });
      i = j;
      continue;
    }

    const brace = css.indexOf("{", i);
    if (brace < 0) break;
    let depth = 0;
    let j = brace;
    while (j < n) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
      j += 1;
    }
    const text = css.slice(i, j);
    blocks.push({ text, ext: chunkExt(text) });
    i = j;
  }
  return blocks;
}

function buildSplit() {
  const css = fs.readFileSync(SRC, "utf8");
  const blocks = splitBlocks(css);
  let core = `/* vc-landing-core v=${VER} */\n`;
  let ext = `/* vc-landing-ext v=${VER} */\n`;
  let coreN = 0;
  let extN = 0;
  for (const b of blocks) {
    if (b.ext) {
      ext += b.text + "\n";
      extN += 1;
    } else {
      core += b.text + "\n";
      coreN += 1;
    }
  }
  fs.writeFileSync(path.join(CSS_DIR, "vc-landing-core.css"), core, "utf8");
  fs.writeFileSync(path.join(CSS_DIR, "vc-landing-ext.css"), ext, "utf8");
  console.log(
    "blocks",
    blocks.length,
    "core",
    coreN,
    Math.round(core.length / 1024),
    "KB ext",
    extN,
    Math.round(ext.length / 1024),
    "KB VER",
    VER,
  );
}

buildSplit();
