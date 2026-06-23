const fs = require("fs");
const path = require("path");

const distRoot = path.resolve(process.argv[2] || path.join(__dirname, "..", "WebSite", "dist"));
const bad = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/i;
const skipDirs = new Set(["node_modules"]);
const exts = new Set([".html"]);

function walk(dir, hits) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!skipDirs.has(name)) walk(full, hits);
      continue;
    }
    if (!exts.has(path.extname(name).toLowerCase())) continue;
    const text = fs.readFileSync(full, "utf8");
    if (bad.test(text)) hits.push(path.relative(distRoot, full));
  }
}

const hits = [];
if (fs.existsSync(distRoot)) walk(distRoot, hits);
if (hits.length) {
  console.error("check-dist-no-localhost: riferimenti localhost in dist:");
  for (const h of hits) console.error(" -", h);
  process.exit(1);
}