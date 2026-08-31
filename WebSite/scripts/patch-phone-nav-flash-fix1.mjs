#!/usr/bin/env node
/** phoneNavFlashFix1: sync CSS, hide nav until styles ready, no fake vc-styles-ready */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VER = "20260831phoneNavFlashFix2";

const ASYNC =
  /\s+media="print"\s+onload="this\.media='all'"\s+data-vc-async-css="1"/gi;

const OLD_BOOT =
  '@media(hover:hover) and (pointer:fine){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{opacity:0!important;visibility:hidden!important;pointer-events:none!important}}@media(hover:none),(pointer:coarse){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{opacity:1!important;visibility:visible!important;pointer-events:auto!important}}';

const NEW_BOOT =
  "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{opacity:0!important;visibility:hidden!important;pointer-events:none!important}";

const NAV_GUARD =
  "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header,html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main,html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer{opacity:0!important;visibility:hidden!important;pointer-events:none!important}html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) #vc-mobile-nav-drawer,html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) .vc-mobile-nav-drawer{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header nav.vc-header-snav,html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header #header-quick-actions{display:none!important}";

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "dist" || name === "node_modules") continue;
      walk(p, out);
    } else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

let asyncN = 0;
let bootN = 0;
let navN = 0;
let filesN = 0;

for (const p of walk(ROOT)) {
  let t = fs.readFileSync(p, "utf8");
  const orig = t;

  t = t.replace(ASYNC, () => {
    asyncN++;
    return "";
  });

  if (t.includes(OLD_BOOT)) {
    t = t.replace(OLD_BOOT, NEW_BOOT);
    bootN++;
  }

  if (t.includes('id="vc-page-cine-boot-css"') && !t.includes("body.vc-body>header,html:not(.vc-core-styles-ready)")) {
    t = t.replace(
      /(<style id="vc-page-cine-boot-css">)([\s\S]*?)(<\/style>)/,
      (m, pre, body, post) => `${pre}${body}${NAV_GUARD}${post}`,
    );
    navN++;
  }

  if (t.includes('id="vc-nav-noflash"') && !t.includes("body.vc-body>header,html:not(.vc-core-styles-ready)")) {
    t = t.replace(
      /(<style id="vc-nav-noflash">)([\s\S]*?)(<\/style>)/,
      (m, pre, body, post) => {
        if (body.includes("vc-nav-boot-guard1")) return m;
        navN++;
        return `${pre}${body}${NAV_GUARD}${post}`;
      },
    );
  }

  t = t.replace(/vc-page-cine-boot\.js\?v=[^"']+/g, `vc-page-cine-boot.js?v=${VER}`);

  if (t !== orig) {
    fs.writeFileSync(p, t, "utf8");
    filesN++;
  }
}

console.log("async_removed", asyncN, "boot_patched", bootN, "nav_guard", navN, "files", filesN, "VER", VER);
