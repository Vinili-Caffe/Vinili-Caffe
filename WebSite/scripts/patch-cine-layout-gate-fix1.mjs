#!/usr/bin/env node
/** cineLayoutGateFix1: boot non rivela prima del layout; vc-home-cine in head */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VC_SITE_ROOT || path.join(__dirname, "..");
const VER = "20260831cineLayoutGateFix1";
const HOME_CINE = `<script src="/js/vc-home-cine.js?v=${VER}" defer></script>`;

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

function relHomeCine(fromDir) {
  const norm = String(fromDir || ".").replace(/\\/g, "/");
  if (!norm || norm === ".") return HOME_CINE;
  const depth = norm.split("/").filter(Boolean).length;
  return `<script src="${"../".repeat(depth)}js/vc-home-cine.js?v=${VER}" defer></script>`;
}

let moved = 0;
let bootN = 0;
let dupRemoved = 0;

for (const p of walk(ROOT)) {
  let t = fs.readFileSync(p, "utf8");
  const orig = t;
  if (!t.includes("vc-page-cine-boot") && !t.includes("vc-site-polish")) continue;

  t = t.replace(/vc-page-cine-boot\.js\?v=[^"']+/g, `vc-page-cine-boot.js?v=${VER}`);

  const dir = path.relative(ROOT, path.dirname(p));
  const homeTag = dir === "." ? HOME_CINE : relHomeCine(dir);

  if (t.includes("vc-home-cine.js") && !t.includes(`vc-home-cine.js?v=${VER}`)) {
    t = t.replace(/<script[^>]*vc-home-cine\.js[^>]*><\/script>\s*/gi, "");
    dupRemoved += 1;
  }

  if (!t.includes("vc-home-cine.js")) {
    t = t.replace(
      /(<script src="[^"]*vc-page-cine-boot\.js[^"]*"><\/script>)/i,
      `$1\n${homeTag}`,
    );
    moved += 1;
  }

  if (t !== orig) {
    fs.writeFileSync(p, t, "utf8");
    bootN += 1;
  }
}

console.log("files", bootN, "home_cine_head", moved, "dup_removed", dupRemoved, "VER", VER);
