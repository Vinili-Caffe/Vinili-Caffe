import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..", "..");
const SITE = path.resolve(__dirname, "..");
const VER = process.env.VC_NAV_UNIFY_VER || "20260904brandGif1";
const LOGO = `https://www.viniliecaffe.it/images/og-server-icon.gif?v=20260904brandGif1

const {
  buildHeaderPromoBootHtml,
  buildHeaderPromoButtonHtml,
  buildHeaderPromoClientConfig,
  resolvePublicHeaderPromoMode,
} = require(path.join(ROOT, "Vinyls", "Utils", "Web", "hogwartsEventCalendar.js"));

const vinylsCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "Vinyls", "config.json"), "utf8"));
const eventRaw = vinylsCfg.hogwartsEvent || {};
const siteUrl = String(vinylsCfg.siteUrl || "https://www.viniliecaffe.it").replace(/\/+$/, "");
const candidatureUrl = `${siteUrl}/candidature/`;
const eventUrl = `${siteUrl}/evento/`;
const headerPromoClientConfig = buildHeaderPromoClientConfig({ eventRaw, eventUrl, candidatureUrl });
const headerPromoMode = resolvePublicHeaderPromoMode(eventRaw);
const promoButtonHtml = buildHeaderPromoButtonHtml({
  mode: headerPromoMode,
  eventUrl,
  candidatureUrl,
});

const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const criticalCss = (home.match(/<style id="vc-mobile-nav-critical-css">[\s\S]*?<\/style>/) || [null])[0];
const notifHtml = (home.match(/<details class="vc-notif-dropdown"[\s\S]*?<\/details>/) || [null])[0];
const langHtml = (home.match(/<div class="vc-lang-dropdown"[\s\S]*?<\/div>\s*<\/div>/) || [null])[0];
// lang match may be greedy; use fixed template
const LANG_HTML = `<div class="vc-lang-dropdown" id="vc-lang-dropdown">
                <button type="button" class="vc-lang-toggle" id="vc-lang-toggle" aria-label="Lingua" aria-haspopup="listbox" aria-expanded="false" data-i18n-attr="aria-label:nav.language"><span class="vc-lang-flag vc-lang-flag--it" id="vc-lang-flag" data-vc-lang-flag="it" aria-hidden="true"></span></button>
                <div class="vc-lang-panel" id="vc-lang-panel" role="listbox" hidden aria-label="Scegli lingua" data-i18n-attr="aria-label:nav.languageList">
                  <button type="button" class="vc-lang-option" data-vc-lang="it" role="option" aria-selected="true"><span class="vc-lang-flag vc-lang-flag--it" aria-hidden="true"></span><span data-i18n="lang.it">Italiano</span></button>
                  <button type="button" class="vc-lang-option" data-vc-lang="en" role="option" aria-selected="false"><span class="vc-lang-flag vc-lang-flag--en" aria-hidden="true"></span><span data-i18n="lang.en">English</span></button>
                </div>
              </div>`;

if (!criticalCss || !notifHtml) {
  console.error("missing templates", { criticalCss: !!criticalCss, notifHtml: !!notifHtml, langHtml: !!langHtml });
  process.exit(1);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "index.html") out.push(p);
  }
  return out;
}

function ensureScript(html, fileBase) {
  if (html.includes(fileBase)) {
    return html.replace(new RegExp(`${fileBase.replace(".", "\\.")}\\?v=[^"'\\s]+`, "g"), `${fileBase}?v=${VER}`);
  }
  const boot = `  <script src="/js/${fileBase}?v=${VER}" defer></script>\n`;
  if (html.includes("</body>")) return html.replace("</body>", `${boot}</body>`);
  return html + "\n" + boot;
}

function applyLogo(html) {
  let next = html;
  // src before class
  next = next.replace(
    /(<img\b[^>]*?\bsrc=")([^"]+)("[\s\S]*?\bclass="[^"]*\bvc-header-logo-img\b[^"]*")/gi,
    `$1${LOGO}$3`,
  );
  // class before src
  next = next.replace(
    /(<img\b[^>]*?\bclass="[^"]*\bvc-header-logo-img\b[^"]*"[^>]*?\bsrc=")([^"]+)(")/gi,
    `$1${LOGO}$3`,
  );
  // multiline homepage style
  next = next.replace(
    /(<img\b[\s\S]{0,200}?\bclass="[^"]*\bvc-header-logo-img\b[^"]*"[\s\S]{0,80}?\bsrc=")([^"]+)(")/gi,
    `$1${LOGO}$3`,
  );
  next = next.replace(
    /(<img\b[\s\S]{0,80}?\bsrc=")([^"]+)("[\s\S]{0,200}?\bclass="[^"]*\bvc-header-logo-img\b[^"]*")/gi,
    `$1${LOGO}$3`,
  );
  return next;
}

function applyCritical(html) {
  if (html.includes('id="vc-mobile-nav-critical-css"')) return html;
  if (html.includes('id="vc-auth-session-instant-css"')) {
    return html.replace(
      /(<style id="vc-auth-session-instant-css">[\s\S]*?<\/style>)/i,
      `$1\n  ${criticalCss}`,
    );
  }
  if (html.includes("</head>")) return html.replace("</head>", `  ${criticalCss}\n</head>`);
  return html;
}

function applyLang(html) {
  if (html.includes("vc-lang-dropdown")) return html;
  // Prefer after site-name / homepage link (never after logo alone).
  const re = /(<a\b[^>]*(?:vc-header-site-name|aria-label="Vai alla homepage")[^>]*>[\s\S]*?<\/a>)/i;
  if (re.test(html)) {
    return html.replace(re, `$1\n              ${LANG_HTML}`);
  }
  return html;
}

function applySiteNameClass(html) {
  if (!html.includes("vc-header-logo-link")) return html;
  let next = html.replace(
    /(<a class="vc-header-logo-link[^"]*"[^>]*>[\s\S]*?<\/a>\s*\n?\s*<a class=")(?!vc-header-site-name)/g,
    "$1vc-header-site-name ",
  );
  // multiline class on site name link after logo
  next = next.replace(
    /(<a\s+class="vc-header-logo-link[\s\S]*?<\/a>\s*<a\s+class=")(?!vc-header-site-name)([^"]*")/g,
    "$1vc-header-site-name $2",
  );
  // homepage-style: aria homepage link without class site-name
  next = next.replace(
    /(<a\s+class=")(?!vc-header-site-name)([^"]*"\s+href="[^"]*"\s+aria-label="Vai alla homepage")/g,
    "$1vc-header-site-name $2",
  );
  return next;
}

function extractBlock(html, startRe, endTag) {
  const m = html.match(startRe);
  if (!m) return { html, block: null, index: -1 };
  const start = m.index;
  const openEnd = start + m[0].length;
  // find matching end by simple search from start for endTag at depth 1 for details/div
  if (endTag === "</details>") {
    const close = html.indexOf("</details>", openEnd);
    if (close < 0) return { html, block: null, index: -1 };
    return { html, block: html.slice(start, close + endTag.length), index: start };
  }
  return { html, block: null, index: -1 };
}

function applyQuickActions(html) {
  const m = html.match(/<div([^>]*\bid="header-quick-actions"[^>]*)>/i);
  if (!m) return html;
  const start = m.index;
  const openTag = m[0];
  // find closing of this div by scanning
  let i = start + openTag.length;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) {
        const inner = html.slice(start + openTag.length, nextClose);
        let promo = "";
        const promoM = inner.match(/<a\b[^>]*\bid="vc-header-promo-btn"[^>]*>[\s\S]*?<\/a>/i);
        if (promoM) promo = promoM[0];
        else if (promoButtonHtml) promo = promoButtonHtml;

        let notif = "";
        const notifM = inner.match(/<details\b[^>]*\bid="vc-notif-dropdown"[^>]*>[\s\S]*?<\/details>/i);
        if (notifM) notif = notifM[0];
        else notif = notifHtml;

        let toggle = "";
        const toggleM = inner.match(/<button\b[^>]*\bid="vc-mobile-nav-toggle"[^>]*>[\s\S]*?<\/button>/i);
        if (toggleM) toggle = toggleM[0];
        else {
          toggle =
            `<button type="button" id="vc-mobile-nav-toggle" class="vc-mobile-nav-toggle vc-icon-btn" aria-label="Apri menu di navigazione" aria-controls="vc-mobile-nav-drawer" aria-expanded="false"><span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>`;
        }

        let loginBtn = "";
        const loginM = inner.match(/<button\b[^>]*\bid="discord-login-btn"[^>]*>[\s\S]*?<\/button>/i);
        if (loginM) loginBtn = loginM[0];
        else {
          const loginM2 = inner.match(/<button\b[^>]*\bdata-vc-discord-login\b[^>]*>[\s\S]*?<\/button>/i);
          if (loginM2) loginBtn = loginM2[0];
        }

        let loginState = "";
        const stateM = inner.match(/<div\b[^>]*\bid="discord-login-state"[^>]*>[\s\S]*?<\/div>/i);
        if (stateM) loginState = stateM[0];
        else loginState = `<div class="header-login-state" id="discord-login-state" hidden></div>`;

        // leftover custom widgets (keep after promo, before notif) — strip known
        let leftover = inner
          .replace(/<a\b[^>]*\bid="vc-header-promo-btn"[^>]*>[\s\S]*?<\/a>/gi, "")
          .replace(/<details\b[^>]*\bid="vc-notif-dropdown"[^>]*>[\s\S]*?<\/details>/gi, "")
          .replace(/<button\b[^>]*\bid="vc-mobile-nav-toggle"[^>]*>[\s\S]*?<\/button>/gi, "")
          .replace(/<button\b[^>]*\bid="discord-login-btn"[^>]*>[\s\S]*?<\/button>/gi, "")
          .replace(/<button\b[^>]*\bdata-vc-discord-login\b[^>]*>[\s\S]*?<\/button>/gi, "")
          .replace(/<div\b[^>]*\bid="discord-login-state"[^>]*>[\s\S]*?<\/div>/gi, "")
          .trim();

        const rebuilt =
          "\n          " +
          [promo, leftover, notif, toggle, loginBtn, loginState].filter(Boolean).join("\n          ") +
          "\n        ";
        return html.slice(0, start) + openTag + rebuilt + html.slice(nextClose);
      }
      i = nextClose + 6;
    }
  }
  return html;
}

function applyPromoBoot(html) {
  let next = html;
  const promoBootHtml = buildHeaderPromoBootHtml(headerPromoClientConfig, "/");
  // bump version in boot
  const boot = promoBootHtml.replace(/vc-header-promo\.js\?v=[^"'\\\s]+/g, `vc-header-promo.js?v=${VER}`);
  if (!next.includes("vc-header-promo.js")) {
    if (next.includes("</body>")) next = next.replace("</body>", `${boot}\n</body>`);
    else next += `\n${boot}`;
  } else {
    next = next.replace(/vc-header-promo\.js\?v=[^"'\\\s]+/g, `vc-header-promo.js?v=${VER}`);
    if (!next.includes("__VC_HEADER_PROMO") && boot.includes("__VC_HEADER_PROMO")) {
      const cfgLine = boot.split("\n")[0];
      next = next.replace(`<script src="/js/vc-header-promo.js?v=${VER}" defer></script>`, `${cfgLine}\n<script src="/js/vc-header-promo.js?v=${VER}" defer></script>`);
    }
  }
  return next;
}

function applyScripts(html) {
  let next = html;
  next = ensureScript(next, "vc-mobile-nav.js");
  next = ensureScript(next, "vc-mobile-nav-canonical.js");
  next = ensureScript(next, "vc-header-name-marquee.js");
  next = applyPromoBoot(next);
  // prefer marquee before promo if both present
  next = next.replace(
    new RegExp(
      `<script src="/js/vc-header-promo\\.js\\?v=${VER}" defer></script>\\s*\\n?\\s*<script src="/js/vc-header-name-marquee\\.js\\?v=${VER}" defer></script>`,
      "g",
    ),
    `<script src="/js/vc-header-name-marquee.js?v=${VER}" defer></script>\n<script src="/js/vc-header-promo.js?v=${VER}" defer></script>`,
  );
  return next;
}

const changed = [];
for (const file of walk(SITE)) {
  const rel = path.relative(SITE, file).replace(/\\/g, "/");
  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("vc-nav-shell") || !html.includes("header-quick-actions")) continue;
  // skip redirect-only shells
  if (rel === "staff/inbox/index.html") continue;

  const before = html;
  html = applyLogo(html);
  html = applyCritical(html);
  html = applySiteNameClass(html);
  html = applyLang(html);
  html = applyQuickActions(html);
  html = applyScripts(html);

  if (html !== before) {
    fs.writeFileSync(file, html, "utf8");
    changed.push(rel);
  }
}

console.log(`ver=${VER} mode=${headerPromoMode} patched=${changed.length}`);
console.log(changed.join("\n"));
