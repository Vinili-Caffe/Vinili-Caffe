// Opzioni comuni degli script: per lavorare su una copia scaricata (es. il codice della VPS) invece che sul repo.
//   --from <cartella>   originali da leggere (altrimenti i file del repo tracciati da git)
//   --src <cartella>    dove stanno/vanno i .ts (default bots-ts/src)
//   --dist <cartella>   dove va il JS compilato (default bots-ts/dist)
import fs from "node:fs";
import path from "node:path";

export function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : "";
}

/** Tutti i file sotto le radici indicate, come percorsi relativi con "/", senza node_modules e .git. */
export function listTree(base, roots) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git" || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  };
  for (const r of roots) {
    const full = path.join(base, r);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else out.push(r);
  }
  return out.sort();
}
