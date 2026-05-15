import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** Librerie già compresse o bundle di terze parti: non offuscare (rischio rotture / inutile). */
const SKIP_JS_OBFUSCATION = new Set([
  "jquery-2.1.3.min.js",
  "pace.min.js",
  "modernizr.js",
  "plugins.js",
  "hogwarts-intro-cinema.js",
  "hogwarts-sorting-page.js",
  "hogwarts-access-gate.js",
  "hogwarts-bgm-youtube.js",
  "vc-suppress-extension-errors.js",
]);

const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: "variable",
  unicodeEscapeSequence: false,
  target: "browser",
};

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  keepClosingSlash: true,
  minifyCSS: false,
  minifyJS: false,
};

function walkFilesRecursive(dir, test, out) {
  const acc = out || [];
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFilesRecursive(p, test, acc);
    else if (test(ent.name, p)) acc.push(p);
  }
  return acc;
}

/**
 * Offusca gli script del sito in `dist/js` (non le librerie in SKIP_*).
 * Il sorgente in `WebSite/js` resta leggibile; solo l’output di build cambia.
 */
export function obfuscateProjectJsInDist(distRoot) {
  let JavaScriptObfuscator;
  try {
    JavaScriptObfuscator = require("javascript-obfuscator");
  } catch {
    console.warn("[build-site] javascript-obfuscator non installato: salto offuscamento JS.");
    return;
  }
  const jsDir = path.join(distRoot, "js");
  const files = walkFilesRecursive(
    jsDir,
    (name) => name.endsWith(".js") && !SKIP_JS_OBFUSCATION.has(name),
    [],
  );
  let n = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const ob = JavaScriptObfuscator.obfuscate(src, OBF_OPTIONS);
    const out = ob.getObfuscatedCode();
    fs.writeFileSync(file, out, "utf8");
    n += 1;
  }
  if (n) console.log("[build-site] Offuscamento JS:", n, "file in dist/js");
}

/**
 * Minifica HTML in `dist` (spazi e commenti): ispezione mostra meno struttura leggibile.
 */
export async function minifyHtmlFilesInDist(distRoot) {
  let minify;
  try {
    ({ minify } = await import("html-minifier-terser"));
  } catch {
    console.warn("[build-site] html-minifier-terser non installato: salto minify HTML.");
    return;
  }
  if (typeof minify !== "function") {
    console.warn("[build-site] minify HTML non disponibile (API modulo).");
    return;
  }
  const htmlFiles = walkFilesRecursive(
    distRoot,
    (name, p) => name.endsWith(".html") && !p.includes(`${path.sep}node_modules${path.sep}`),
  );
  let n = 0;
  for (const file of htmlFiles) {
    const raw = fs.readFileSync(file, "utf8");
    const next = await minify(raw, HTML_MINIFY_OPTIONS);
    if (next && next !== raw) {
      fs.writeFileSync(file, next, "utf8");
      n += 1;
    }
  }
  if (n) console.log("[build-site] Minify HTML:", n, "file in dist");
}