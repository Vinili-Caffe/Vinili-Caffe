#!/usr/bin/env node
/**
 * cssCleanShell1: vc-shell.css = concatenazione meccanica (stesso ordine cascade live).
 * Visual lock: zero rewrite regole.
 */
const fs = require("fs");
const path = require("path");

const CSS = path.resolve(__dirname, "..", "css");
const OUT = path.join(CSS, "vc-shell.css");

/* Ordine = inject attuale (polish → chrome-ui → nav-menu → glow → nav-fix → kit → pill → footer-sys) */
const PARTS = [
  "vc-chrome-polish.css",
  "vc-site-chrome-ui.css",
  "vc-nav-menu-solid.css",
  "vc-glow-form.css",
  "vc-nav-chrome-fix.css",
  "vc-site-chrome-kit.css",
  "vc-chrome-pill-footer-fix.css",
  "vc-footer-sys-status.css",
];

const chunks = [];
chunks.push(
  "/* vc-shell.css — cssCleanShell1: merge meccanico chrome sitewide (visual lock).\n" +
    " * Parts: " +
    PARTS.join(" + ") +
    "\n" +
    " * Do not hand-edit rules here; rebuild via scripts/build_vc_shell.cjs\n */\n",
);

for (const name of PARTS) {
  const p = path.join(CSS, name);
  if (!fs.existsSync(p)) {
    console.error("MISSING", p);
    process.exit(1);
  }
  const body = fs.readFileSync(p, "utf8");
  chunks.push("\n/* ==== BEGIN " + name + " ==== */\n");
  chunks.push(body);
  if (!body.endsWith("\n")) chunks.push("\n");
  chunks.push("/* ==== END " + name + " ==== */\n");
}

fs.writeFileSync(OUT, chunks.join(""), "utf8");
const st = fs.statSync(OUT);
console.log("wrote", OUT, "bytes", st.size, "parts", PARTS.length);
