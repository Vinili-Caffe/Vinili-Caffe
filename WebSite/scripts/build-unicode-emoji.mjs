/**
 * Genera src/lib/data/unicodeEmoji.json per il picker emoji del sito.
 * Fonte: il pacchetto emojibase-data (nomi e parole chiave in italiano e inglese, shortcode tipo Discord).
 *
 *   npm pack emojibase-data@16.0.3 && tar -xzf emojibase-data-16.0.3.tgz
 *   node scripts/build-unicode-emoji.mjs <cartella "package" estratta>
 *
 * Formato di ogni voce: [emoji, gruppo, nome italiano, testo di ricerca, tonalità?]
 * Le emoji più nuove di Unicode 15.1 sono escluse: Discord non le mostra ancora.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("Uso: node scripts/build-unicode-emoji.mjs <cartella package di emojibase-data>");
  process.exit(1);
}
const read = (p) => JSON.parse(fs.readFileSync(path.join(src, p), "utf8"));
const it = read("it/data.json");
const en = new Map(read("en/data.json").map((e) => [e.hexcode, e]));
const iamcal = read("en/shortcodes/iamcal.json");
const github = read("en/shortcodes/github.json");
const groups = read("it/messages.json").groups;

const MAX_VERSION = 15.1;
const LABELS = {
  "smileys-emotion": "Faccine ed emozioni",
  "people-body": "Persone",
  "animals-nature": "Animali e natura",
  "food-drink": "Cibo e bevande",
  "travel-places": "Viaggi e luoghi",
  activities: "Attività",
  objects: "Oggetti",
  symbols: "Simboli",
  flags: "Bandiere",
};
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .trim();

const out = [];
for (const e of it.sort((a, b) => a.order - b.order)) {
  if (e.group === 2 || e.group == null) continue; /* componenti (tonalità sciolte) */
  if (Number(e.version) > MAX_VERSION) continue;
  const eng = en.get(e.hexcode);
  const codes = [...list(iamcal[e.hexcode]), ...list(github[e.hexcode])];
  const words = new Set(
    [e.label, ...list(e.tags), eng?.label, ...list(eng?.tags), ...codes, ...codes.map((c) => `:${c}:`)]
      .map(norm)
      .filter(Boolean),
  );
  const row = [e.emoji, e.group, e.label, [...words].join("|")];
  const skins = (e.skins || []).filter((s) => typeof s.tone === "number" && Number(s.version) <= MAX_VERSION).sort((a, b) => a.tone - b.tone);
  if (skins.length === 5) row.push(skins.map((s) => s.emoji));
  out.push(row);
}

const data = {
  groups: groups.filter((g) => g.order !== 2).map((g) => ({ id: g.order, key: g.key, label: LABELS[g.key] || g.message })),
  emojis: out,
};
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "data", "unicodeEmoji.json");
fs.writeFileSync(dest, JSON.stringify(data));
console.log(`ok: ${out.length} emoji, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB → ${dest}`);
