import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync(`${process.env.TEMP}/reliquie-catalog.json`, "utf8"));
const fixes = {
  "canna-di-oban-urr": "Canna di Oban-Urr",
  "sigillo-di-ahch-to": "Sigillo di Ahch-To",
  "tessitura-di-nomi-sunrider": "Tessitura di Nomi Sunrider",
  "holocron-di-darth-bane": "Holocron di Darth Bane",
};
const items = raw.map((r) => ({ id: r.id, name: fixes[r.id] || r.name }));
const lines = items.map((i) => `  { id: ${JSON.stringify(i.id)}, name: ${JSON.stringify(i.name)} },`).join("\n");

const body = `/**
 * Catalogo reliquie Star Wars (nome file = nome da indovinare).
 */
"use strict";

const RELIQUIE_CDN = "https://cdn.viniliecaffe.it/images/starwars/reliquie";
const RELIQUIE_IMG_V = "20261104rl1";

const RELIQUIE_CATALOG = Object.freeze([
${lines}
]);

function normalizeReliquieId(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeReliquieGuess(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9\\s-]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function reliquieImageUrl(id?) {
  const cid = normalizeReliquieId(id);
  return cid ? \`\${RELIQUIE_CDN}/\${cid}.png?v=\${RELIQUIE_IMG_V}\` : "";
}

function listReliquieCatalog() {
  return RELIQUIE_CATALOG.map((r?) => ({
    id: r.id,
    name: r.name,
    imageUrl: reliquieImageUrl(r.id),
    thumbUrl: reliquieImageUrl(r.id),
    silhouetteUrl: reliquieImageUrl(r.id),
  }));
}

function getReliquieById(id?) {
  const cid = normalizeReliquieId(id);
  if (!cid) return null;
  const hit = RELIQUIE_CATALOG.find((r?) => r.id === cid);
  if (!hit) return null;
  return {
    ...hit,
    imageUrl: reliquieImageUrl(hit.id),
    thumbUrl: reliquieImageUrl(hit.id),
    silhouetteUrl: reliquieImageUrl(hit.id),
  };
}

function findReliquieByGuess(guess?) {
  const g = normalizeReliquieGuess(guess);
  if (!g) return null;
  const gSlug = normalizeReliquieId(g);
  return (
    RELIQUIE_CATALOG.find((r?) => {
      const n = normalizeReliquieGuess(r.name);
      return n === g || r.id === gSlug || normalizeReliquieId(n) === gSlug;
    }) || null
  );
}

function pickRandomReliquie() {
  return RELIQUIE_CATALOG[Math.floor(Math.random() * RELIQUIE_CATALOG.length)];
}

function reliquieTotal() {
  return RELIQUIE_CATALOG.length;
}

export = {
  RELIQUIE_CDN,
  RELIQUIE_IMG_V,
  RELIQUIE_CATALOG,
  normalizeReliquieId,
  normalizeReliquieGuess,
  reliquieImageUrl,
  listReliquieCatalog,
  getReliquieById,
  findReliquieByGuess,
  pickRandomReliquie,
  reliquieTotal,
};
`;

const out =
  "c:/Users/corva/Desktop/Vinili & Caffè Bots/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsReliquieCatalog.ts";
fs.writeFileSync(out, body);
console.log("wrote", items.length, out);
