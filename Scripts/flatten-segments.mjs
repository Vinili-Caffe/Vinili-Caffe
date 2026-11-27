// Dopo `next build` (export statico): Next 16 scrive i dati di navigazione delle sottopagine in
//   out/faq/__next.faq/__PAGE__.txt
// ma il router nel browser li chiede "piatti":
//   /faq/__next.faq.__PAGE__.txt
// Creiamo anche la copia piatta, così la navigazione client funziona su qualsiasi hosting statico.
import { copyFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../WebSite/out/", import.meta.url));
let made = 0;

async function filesUnder(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await filesUnder(p)).map((f) => [name, ...f]));
    else out.push([name]);
  }
  return out;
}

async function walk(dir) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if (!(await stat(p)).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const parts of await filesUnder(p)) {
        if (!parts[parts.length - 1].endsWith(".txt")) continue;
        await copyFile(join(p, ...parts), join(dir, [name, ...parts].join(".")));
        made++;
      }
    } else {
      await walk(p);
    }
  }
}

await walk(OUT);
console.log(`flatten-segments: ${made} file di navigazione resi piatti`);
