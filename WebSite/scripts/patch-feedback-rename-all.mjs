#!/usr/bin/env node
/**
 * Rename public "Suggerimenti" → "Feedback" and point links to /feedback/.
 * Skips dashboard/feedback (bot feedback) label confusion where needed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walk(root);
let n = 0;
for (const file of files) {
  let t = fs.readFileSync(file, "utf8");
  const orig = t;
  // URLs (absolute + relative + placeholder already /feedback from bake)
  t = t.replace(/https:\/\/www\.viniliecaffe\.it\/suggerimenti\/?/g, "https://www.viniliecaffe.it/feedback/");
  t = t.replace(/href="\/suggerimenti\/?"/g, 'href="/feedback/"');
  t = t.replace(/href='\/suggerimenti\/?'/g, "href='/feedback/'");
  // Nav / footer visible labels (keep legal body copy about "suggerimenti" as data concept unless nav)
  t = t.replace(
    /(<span[^>]*data-i18n="nav\.suggestions"[^>]*>)Suggerimenti(<\/span>)/g,
    "$1Feedback$2",
  );
  t = t.replace(
    /(<a[^>]*data-i18n="footer\.suggestions"[^>]*>)Suggerimenti(<\/a>)/g,
    "$1Feedback$2",
  );
  t = t.replace(
    /(<a[^>]*data-i18n="home\.suggestionsStrong"[^>]*>)Suggerimenti(<\/a>)/g,
    "$1Feedback$2",
  );
  t = t.replace(
    /(<strong[^>]*data-i18n="home\.suggestionsStrong"[^>]*>)Suggerimenti(<\/strong>)/g,
    "$1Feedback$2",
  );
  // Hardcoded nav row label next to lightbulb in Richieste menus
  t = t.replace(
    /(fa-lightbulb-o<\/i><\/span><span(?:[^>]*)?>)Suggerimenti(<\/span>)/g,
    "$1Feedback$2",
  );
  t = t.replace(
    /(fa-lightbulb-o"><\/i><\/span><span(?:[^>]*)?>)Suggerimenti(<\/span>)/g,
    "$1Feedback$2",
  );
  // Routes JSON on homepage
  t = t.replace(/"\/suggerimenti"/g, '"/feedback","/suggerimenti"');
  // Avoid double-duplicating if run twice
  t = t.replace(/"\/feedback","\/suggerimenti","\/feedback","\/suggerimenti"/g, '"/feedback","/suggerimenti"');
  if (t !== orig) {
    fs.writeFileSync(file, t, "utf8");
    n += 1;
  }
}
console.log("patched html files:", n);
