/**
 * Apply new brand assets:
 * - VC_-_2.gif → logo (og-server-icon.gif + cache-bust refs)
 * - VC_-_1.gif → banner (og-banner.gif + replace og-banner.jpg refs)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, "..");
const ROOT = path.resolve(SITE, "..");
const VER = process.env.VC_BRAND_VER || "20260904brandGif1";
const IMG = path.join(SITE, "images");
const LOGO_SRC = path.join(IMG, "VC_-_2.gif");
const BANNER_SRC = path.join(IMG, "VC_-_1.gif");
const LOGO_DST = path.join(IMG, "og-server-icon.gif");
const BANNER_DST = path.join(IMG, "og-banner.gif");
const LOGO_URL = `https://www.viniliecaffe.it/images/og-server-icon.gif?v=${VER}`;
const BANNER_URL = `https://www.viniliecaffe.it/images/og-banner.gif?v=${VER}`;

function mustFile(p) {
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
}

mustFile(LOGO_SRC);
mustFile(BANNER_SRC);
fs.copyFileSync(LOGO_SRC, LOGO_DST);
fs.copyFileSync(BANNER_SRC, BANNER_DST);
console.log("copied logo→og-server-icon.gif banner→og-banner.gif");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    if (ent.name === "_stage_nav_unify1") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function patchText(text) {
  let next = text;
  // logo refs
  next = next.replace(
    /https:\/\/www\.viniliecaffe\.it\/images\/og-server-icon\.gif\?v=[^"'\\\s#]+/g,
    LOGO_URL,
  );
  next = next.replace(/\/images\/og-server-icon\.gif\?v=[^"'\\\s#]+/g, `/images/og-server-icon.gif?v=${VER}`);
  next = next.replace(
    /images\/og-server-icon\.gif\?v=[^"'\\\s#]+/g,
    `images/og-server-icon.gif?v=${VER}`,
  );
  // banner jpg → gif
  next = next.replace(
    /https:\/\/www\.viniliecaffe\.it\/images\/og-banner\.jpg\?v=[^"'\\\s#]+/g,
    BANNER_URL,
  );
  next = next.replace(/\/images\/og-banner\.jpg(\?v=[^"'\\\s#]+)?/g, `/images/og-banner.gif?v=${VER}`);
  next = next.replace(/images\/og-banner\.jpg(\?v=[^"'\\\s#]+)?/g, `images/og-banner.gif?v=${VER}`);
  // bare VC source names if any
  next = next.replace(/images\/VC_-_2\.gif/g, `images/og-server-icon.gif?v=${VER}`);
  next = next.replace(/images\/VC_-_1\.gif/g, `images/og-banner.gif?v=${VER}`);
  return next;
}

const exts = new Set([".html", ".js", ".mjs", ".json", ".css", ".webmanifest", ".md"]);
let changed = 0;
for (const base of [SITE, path.join(ROOT, "Vinyls"), path.join(ROOT, "deploy")]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    const ext = path.extname(file).toLowerCase();
    if (!exts.has(ext)) continue;
    // skip huge css dumps partially? still ok for string replace
    if (file.includes(`${path.sep}deploy${path.sep}_stage_`)) continue;
    if (file.endsWith(`${path.sep}apply-brand-gifs.mjs`)) continue;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (
      !text.includes("og-server-icon.gif") &&
      !text.includes("og-banner.jpg") &&
      !text.includes("VC_-_1.gif") &&
      !text.includes("VC_-_2.gif")
    ) {
      continue;
    }
    const next = patchText(text);
    if (next !== text) {
      fs.writeFileSync(file, next, "utf8");
      changed += 1;
      console.log("patched", path.relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
}

// site.config explicit
const cfgPath = path.join(SITE, "site.config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
cfg.openGraphImageUrl = LOGO_URL;
cfg.openGraphImageWidth = 512;
cfg.openGraphImageHeight = 512;
// optional banner field for consumers
cfg.siteBannerUrl = BANNER_URL;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
console.log("site.config updated");

// push notification icons
for (const rel of ["js/vc-landing.js", "sw.js"]) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, "utf8");
  const nt = t
    .replace(/\/images\/vc-server-icon\.png/g, `/images/og-server-icon.gif?v=${VER}`)
    .replace(/\/images\/og-server-icon\.gif\?v=[^"'\\\s]+/g, `/images/og-server-icon.gif?v=${VER}`);
  if (nt !== t) {
    fs.writeFileSync(p, nt, "utf8");
    console.log("patched", rel, "icons");
  }
}

// unify-nav default VER
{
  const p = path.join(SITE, "scripts", "unify-nav-shell-all.mjs");
  let t = fs.readFileSync(p, "utf8");
  const nt = t.replace(
    /const VER = process\.env\.VC_NAV_UNIFY_VER \|\| "[^"]+";/,
    `const VER = process.env.VC_NAV_UNIFY_VER || "${VER}";`,
  );
  if (nt !== t) {
    fs.writeFileSync(p, nt, "utf8");
    console.log("patched unify-nav-shell-all.mjs VER");
  }
}

// bake placeholders: first-party logo instead of Discord CDN guild icon
{
  const p = path.join(SITE, "scripts", "bake-broken-placeholders.py");
  if (fs.existsSync(p)) {
    let t = fs.readFileSync(p, "utf8");
    const nt = t.replace(
      /"\{\{GUILD_ICON_URL\}\}":\s*"[^"]+"/,
      `"{{GUILD_ICON_URL}}": "${LOGO_URL}"`,
    );
    if (nt !== t) {
      fs.writeFileSync(p, nt, "utf8");
      console.log("patched bake-broken-placeholders GUILD_ICON");
    }
  }
}

console.log(`DONE ver=${VER} filesChanged=${changed}`);
console.log(`LOGO ${LOGO_URL}`);
console.log(`BANNER ${BANNER_URL}`);
