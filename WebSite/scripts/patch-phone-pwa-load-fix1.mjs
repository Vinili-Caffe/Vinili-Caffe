#!/usr/bin/env node
/** phonePwaLoadFix1: restore async CSS on phone paths, remove blocking vc-perf in head */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VER = "20260831phonePwaLoadFix1";
const SYNC_CSS =
  /(<link rel="stylesheet" href="[^"]*vc-landing\.css\?v=[^"]+")(\s*>)/gi;
const PERF_HEAD =
  /\n<script src="(?:\/|\.\.\/)*js\/vc-perf\.js\?v=[^"]+"><\/script>/gi;

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
let perfN = 0;
let filesN = 0;
for (const p of walk(ROOT)) {
  let t = fs.readFileSync(p, "utf8");
  const orig = t;
  t = t.replace(SYNC_CSS, (m, pre, post) => {
    if (m.includes("data-vc-async-css")) return m;
    asyncN++;
    return `${pre} media="print" onload="this.media='all'" data-vc-async-css="1"${post}`;
  });
  t = t.replace(PERF_HEAD, () => {
    perfN++;
    return "";
  });
  t = t.replace(/vc-page-cine-boot\.js\?v=[^"']+/g, `vc-page-cine-boot.js?v=${VER}`);
  t = t.replace(/vc-perf\.js\?v=[^"']+/g, `vc-perf.js?v=${VER}`);
  t = t.replace(/vc-landing\.js\?v=[^"']+/g, `vc-landing.js?v=${VER}`);
  if (t !== orig) {
    fs.writeFileSync(p, t, "utf8");
    filesN++;
  }
}
console.log("async_restored", asyncN, "perf_head_removed", perfN, "files", filesN, "VER", VER);
