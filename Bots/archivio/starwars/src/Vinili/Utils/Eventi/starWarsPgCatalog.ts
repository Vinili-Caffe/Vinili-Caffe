/**
 * Catalogo PG Star Wars (immagini in arrivo — per ora solo nomi).
 */
"use strict";

const PG_CDN = "https://cdn.viniliecaffe.it/images/starwars/pg";
const PG_IMG_V = "20261104pg0";

const PG_CATALOG = Object.freeze([
  { id: "anakin", name: "Anakin" },
  { id: "obi-wan", name: "Obi-Wan" },
  { id: "padme", name: "Padmé" },
  { id: "ahsoka", name: "Ahsoka" },
  { id: "rex", name: "Rex" },
  { id: "grievous", name: "Grievous" },
  { id: "dooku", name: "Dooku" },
  { id: "maul", name: "Maul" },
  { id: "yoda", name: "Yoda" },
  { id: "mace", name: "Mace" },
]);

function normalizePgId(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePgGuess(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pgImageUrl(_id?) {
  /* immagini non ancora caricate — evita 404 sul profilo */
  return "";
}

function listPgCatalog() {
  return PG_CATALOG.map((r?) => ({
    id: r.id,
    name: r.name,
    imageUrl: "",
    thumbUrl: "",
    silhouetteUrl: "",
    hasImage: false,
  }));
}

function getPgById(id?) {
  const cid = normalizePgId(id);
  if (!cid) return null;
  const hit = PG_CATALOG.find((r?) => r.id === cid);
  if (!hit) return null;
  return { ...hit, imageUrl: "", thumbUrl: "", silhouetteUrl: "", hasImage: false };
}

function findPgByGuess(guess?) {
  const g = normalizePgGuess(guess);
  if (!g) return null;
  const gSlug = normalizePgId(g);
  return (
    PG_CATALOG.find((r?) => {
      const n = normalizePgGuess(r.name);
      return n === g || r.id === gSlug || normalizePgId(n) === gSlug;
    }) || null
  );
}

function pickRandomPg() {
  return PG_CATALOG[Math.floor(Math.random() * PG_CATALOG.length)];
}

function pgTotal() {
  return PG_CATALOG.length;
}

export = {
  PG_CDN,
  PG_IMG_V,
  PG_CATALOG,
  normalizePgId,
  normalizePgGuess,
  pgImageUrl,
  listPgCatalog,
  getPgById,
  findPgByGuess,
  pickRandomPg,
  pgTotal,
};
