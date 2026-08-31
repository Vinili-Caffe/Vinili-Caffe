#!/usr/bin/env node
/** Patch HTML for sitePerfFlash1 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VER = "20260831sitePerfFlash1";
const ASYNC =
  /\s+media="print"\s+onload="this\.media='all'"\s+data-vc-async-css="1"/gi;
const FULL_OLD =
  "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header,body.vc-body>main,body.vc-body>footer,body.vc-body>header,#vc-page-content,.vc-page-cine-body{opacity:1!important;visibility:visible!important;pointer-events:auto!important}";
const BOOT_VISIBILITY =
  "@media(hover:hover) and (pointer:fine){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{opacity:0!important;visibility:hidden!important;pointer-events:none!important}}@media(hover:none),(pointer:coarse){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{opacity:1!important;visibility:visible!important;pointer-events:auto!important}}";
const BROKEN_BOOT =
  "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header@media(hover:hover) and (pointer:fine){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer{opacity:0!important;visibility:hidden!important;pointer-events:none!important}}@media(hover:none),(pointer:coarse){html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>main,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>footer,html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body.vc-body>header{opacity:1!important;visibility:visible!important;pointer-events:auto!important}}";

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
let filesN = 0;
for (const p of walk(ROOT)) {
  let t = fs.readFileSync(p, "utf8");
  const orig = t;
  t = t.replace(ASYNC, () => {
    asyncN++;
    return "";
  });
  if (t.includes(BROKEN_BOOT)) {
    t = t.replace(BROKEN_BOOT, BOOT_VISIBILITY);
    bootN++;
  } else if (t.includes(FULL_OLD)) {
    t = t.replace(FULL_OLD, BOOT_VISIBILITY);
    bootN++;
  }
  t = t.replace(/vc-landing\.css\?v=[^"']+/g, `vc-landing.css?v=${VER}`);
  t = t.replace(/vc-page-cine-boot\.js\?v=[^"']+/g, `vc-page-cine-boot.js?v=${VER}`);
  t = t.replace(/vc-home-cine\.js\?v=[^"']+/g, `vc-home-cine.js?v=${VER}`);
  t = t.replace(/vc-site-polish\.js\?v=[^"']+/g, `vc-site-polish.js?v=${VER}`);
  t = t.replace(/vc-perf\.js\?v=[^"']+/g, `vc-perf.js?v=${VER}`);
  if (t.includes("vc-page-cine-boot.js") && !t.includes("vc-perf.js")) {
    t = t.replace(
      /(<script src="[^"]*vc-page-cine-boot\.js\?v=[^"]+"><\/script>)/,
      `$1\n<script src="/js/vc-perf.js?v=${VER}"></script>`,
    );
  }
  if (t !== orig) {
    fs.writeFileSync(p, t, "utf8");
    filesN++;
  }
}
console.log("async_removed", asyncN, "boot_patched", bootN, "files", filesN, "VER", VER);
