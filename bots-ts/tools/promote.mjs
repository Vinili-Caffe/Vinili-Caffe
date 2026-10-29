// Copia bots-ts/dist → radice repo (Vinyls/, Coffee/, shared/, loader.js, wait-for-lavalink.js).
// Così il runtime (loader, PM2, VPS /opt/bot) resta uguale, ma la sorgente è solo bots-ts/src.
// Preserva node_modules già presenti sotto Vinyls/ e Coffee/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arg } from "./args.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(TS_ROOT, "..");
const DIST = arg("--dist") || path.join(TS_ROOT, "dist");
const ROOTS = ["Vinyls", "Coffee", "shared", "loader.js", "wait-for-lavalink.js"];

function rmGenerated(dest) {
  if (!fs.existsSync(dest)) return;
  const st = fs.statSync(dest);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(dest)) {
      if (name === "node_modules") continue;
      rmGenerated(path.join(dest, name));
    }
    // togli la cartella solo se resta vuota o solo node_modules
    const left = fs.readdirSync(dest);
    if (left.length === 0) fs.rmSync(dest, { recursive: true, force: true });
    return;
  }
  fs.rmSync(dest, { force: true });
}

function copyTree(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === "node_modules") continue;
      copyTree(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error("manca dist/: lancia prima npm run build (in bots-ts)");
    process.exit(1);
  }
  for (const r of ROOTS) {
    const from = path.join(DIST, r);
    if (!fs.existsSync(from)) {
      console.error(`manca dist/${r}`);
      process.exit(1);
    }
  }

  let files = 0;
  for (const r of ROOTS) {
    const from = path.join(DIST, r);
    const to = path.join(REPO, r);
    rmGenerated(to);
    copyTree(from, to);
    if (fs.statSync(from).isDirectory()) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name === "node_modules") continue;
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else files += 1;
        }
      };
      walk(from);
    } else {
      files += 1;
    }
  }

  // collegamenti node_modules in dist (per check locale su dist/) → punta agli stessi di root
  for (const bot of ["Vinyls", "Coffee"]) {
    const target = path.join(REPO, bot, "node_modules");
    const link = path.join(DIST, bot, "node_modules");
    if (fs.existsSync(target) && !fs.existsSync(link)) {
      try {
        fs.symlinkSync(target, link, "junction");
      } catch (e) {
        console.warn(`symlink ${bot}/node_modules: ${e.message}`);
      }
    }
  }

  console.log(`promossi ${files} file da dist/ → root (Vinyls, Coffee, shared, loader, wait-for-lavalink)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
