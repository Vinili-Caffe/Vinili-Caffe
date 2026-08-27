import fs from "fs";
import path from "path";

const STAFF_DIR = path.resolve("WebSite/staff");
const JS_GLOB = path.resolve("WebSite/js");

const HTML_FIXES = [
  [/Verifica accesso staff[^\w<]{0,4}(?=<\/p>)/g, "Verifica accesso staff&hellip;"],
  [
    /(<a class="vc-staff-hero__crumb" href="\/staff\/">Staff<\/a>)\s*[^\w<&][^\w<]{0,2}\s*/g,
    "$1 &middot; ",
  ],
  [/warn\s[^\w\s-]{1,3}\s*stesse/gi, "warn &mdash; stesse"],
  [/procedure\s[^\w\s-]{1,3}\s*come/gi, "procedure &mdash; come"],
  [/chi\s[^\w\s]{1,3}\s*in pausa/gi, "chi &egrave; in pausa"],
  [/Perch[^\w]{1,3}e/g, "Perch&eacute;"],
  [/placeholder="Cerca nome, username o ID[^"]*"/g, 'placeholder="Cerca nome, username o ID&hellip;"'],
  [
    /placeholder="Perch&eacute; ti serve la pausa[^"]*"/g,
    'placeholder="Perch&eacute; ti serve la pausa&hellip;"',
  ],
  [/\uFFFD/g, ""],
];

const JS_REPLACEMENTS = [
  [" · ", " \\u00B7 "],
  [" — ", " \\u2014 "],
  ["…", "\\u2026"],
  [" → ", " \\u2192 "],
  ['"—"', '"\\u2014"'],
];

function walkHtml(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkHtml(p));
    else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function fixHtml(file) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [re, rep] of HTML_FIXES) text = text.replace(re, rep);
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    console.log("[html]", path.relative(process.cwd(), file));
  }
}

function fixStaffJs(file) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  if (/\uFFFD/.test(text)) text = text.replace(/\uFFFD/g, "");
  for (const [from, to] of JS_REPLACEMENTS) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    console.log("[js]", path.relative(process.cwd(), file));
  }
}

for (const html of walkHtml(STAFF_DIR)) fixHtml(html);

for (const ent of fs.readdirSync(JS_GLOB)) {
  if (!ent.startsWith("staff-") || !ent.endsWith(".js")) continue;
  fixStaffJs(path.join(JS_GLOB, ent));
}

console.log("Done.");
