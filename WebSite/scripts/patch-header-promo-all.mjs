import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = process.env.VC_REPO_ROOT
  ? path.resolve(process.env.VC_REPO_ROOT)
  : path.resolve(__dirname, "..", "..");
const SITE = process.env.VC_SITE_ROOT
  ? path.resolve(process.env.VC_SITE_ROOT)
  : path.resolve(__dirname, "..");

const {
  buildHeaderPromoBootHtml,
  buildHeaderPromoButtonHtml,
  buildHeaderPromoClientConfig,
  resolvePublicHeaderPromoMode,
} = require(path.join(ROOT, "Vinyls", "Utils", "Web", "hogwartsEventCalendar.js"));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const vinylsCfg = readJson(path.join(ROOT, "Vinyls", "config.json"));
const eventRaw = vinylsCfg.hogwartsEvent || {};
const siteUrl = String(vinylsCfg.siteUrl || "https://www.viniliecaffe.it").replace(/\/+$/, "");
const candidatureUrl = `${siteUrl}/candidature/`;
const eventUrl = `${siteUrl}/evento/`;

const headerPromoClientConfig = buildHeaderPromoClientConfig({
  eventRaw,
  eventUrl,
  candidatureUrl,
});
const headerPromoMode = resolvePublicHeaderPromoMode(eventRaw);
const promoButtonHtml = buildHeaderPromoButtonHtml({
  mode: headerPromoMode,
  eventUrl,
  candidatureUrl,
});

function relativeScriptPrefix() {
  return "/";
}

function shouldSkip(rel, html) {
  const r = rel.replace(/\\/g, "/").toLowerCase();
  if (r.startsWith("dashboard/")) return true;
  if (r.startsWith("staff/")) return true;
  if (r.includes("seratafilm/")) return true;
  if (/<body\b[^>]*\bvc-dashboard-page\b/i.test(html)) return true;
  if (!html.includes('id="header-quick-actions"')) return true;
  return false;
}

function applyHeaderPromo(html, promoBootHtml) {
  let next = html;
  if (promoButtonHtml && !next.includes('id="vc-header-promo-btn"')) {
    next = next.replace(
      /(<div[^>]*id="header-quick-actions"[^>]*>)/i,
      `$1\n          ${promoButtonHtml}`,
    );
  }
  if (promoBootHtml && !next.includes("vc-header-promo.js")) {
    if (next.includes("</body>")) next = next.replace("</body>", `${promoBootHtml}\n</body>`);
    else next += `\n${promoBootHtml}`;
  }
  return next;
}

function applyHeaderSiteNameClass(html) {
  if (!html.includes("vc-header-logo-link")) return html;
  return html.replace(
    /(<a class="vc-header-logo-link[^"]*"[^>]*>[\s\S]*?<\/a>\s*\n?\s*<a class=")(?!vc-header-site-name)/g,
    "$1vc-header-site-name ",
  );
}

function applyHeaderNameMarquee(html, assetVersion = "") {
  if (!html.includes("vc-header-bar") && !html.includes("vc-landing.css")) return html;
  if (html.includes("vc-header-name-marquee.js")) return html;
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const boot = `  <script src="/js/vc-header-name-marquee.js${suffix}" defer></script>\n`;
  if (html.includes("</body>")) return html.replace("</body>", `${boot}  </body>`);
  if (html.includes("</head>")) return html.replace("</head>", `${boot}  </head>`);
  return `${html}\n${boot}`;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const assetVersion = String(process.env.VC_BUILD_ASSET_VERSION || "20260902headerMarqueeFix1");

function applyMobileNavCanonical(html, assetVersion = "") {
  if (!html.includes("header-quick-actions")) return html;
  if (html.includes("vc-mobile-nav-canonical.js")) return html;
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const boot = `  <script src="/js/vc-mobile-nav-canonical.js${suffix}" defer></script>\n`;
  if (html.includes("</body>")) return html.replace("</body>", `${boot}  </body>`);
  if (html.includes("</head>")) return html.replace("</head>", `${boot}  </head>`);
  return `${html}\n${boot}`;
}

function bumpScriptVersions(html) {
  let next = html;
  next = next.replace(/vc-header-promo\.js\?v=[^"'\\s]+/g, `vc-header-promo.js?v=${assetVersion}`);
  next = next.replace(/vc-header-name-marquee\.js\?v=[^"'\\s]+/g, `vc-header-name-marquee.js?v=${assetVersion}`);
  next = next.replace(/vc-mobile-nav-canonical\.js\?v=[^"'\\s]+/g, `vc-mobile-nav-canonical.js?v=${assetVersion}`);
  next = next.replace(/vc-landing-ext\.css\?v=[^"'\\s]+/g, `vc-landing-ext.css?v=${assetVersion}`);
  return next;
}

function fixHeaderMarqueeScriptOrder(html) {
  const promoRe = /<script src="[^"]*vc-header-promo\.js\?v=[^"]+" defer><\/script>\s*\n?\s*<script src="[^"]*vc-header-name-marquee\.js\?v=[^"]+" defer><\/script>/g;
  return html.replace(
    promoRe,
    `<script src="/js/vc-header-name-marquee.js?v=${assetVersion}" defer></script>\n<script src="/js/vc-header-promo.js?v=${assetVersion}" defer></script>`,
  );
}

const changed = [];
let scanned = 0;
for (const file of walk(SITE)) {
  scanned++;
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  if (shouldSkip(rel, html)) continue;
  const prefix = relativeScriptPrefix();
  const promoBootHtml = buildHeaderPromoBootHtml(headerPromoClientConfig, prefix);
  let next = applyHeaderPromo(html, promoBootHtml);
  next = applyHeaderSiteNameClass(next);
  next = applyHeaderNameMarquee(next, assetVersion);
  next = applyMobileNavCanonical(next, assetVersion);
  next = fixHeaderMarqueeScriptOrder(next);
  next = bumpScriptVersions(next);
  if (next === html) continue;
  fs.writeFileSync(file, next, "utf8");
  changed.push(rel.replace(/\\/g, "/"));
}

console.log(`scanned=${scanned} patched=${changed.length} root=${SITE} mode=${headerPromoMode}`);
for (const rel of changed) console.log("  +", rel);
