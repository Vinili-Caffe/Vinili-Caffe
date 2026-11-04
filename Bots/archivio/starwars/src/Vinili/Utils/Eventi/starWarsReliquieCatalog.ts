/**
 * Catalogo reliquie Star Wars (nome file = nome da indovinare).
 */
"use strict";

const RELIQUIE_CDN = "https://cdn.viniliecaffe.it/images/starwars/reliquie";
const RELIQUIE_IMG_V = "20261104rl1";

const RELIQUIE_CATALOG = Object.freeze([
  { id: "amuleto-di-exar-kun", name: "Amuleto di Exar Kun" },
  { id: "anello-di-satele-shan", name: "Anello di Satele Shan" },
  { id: "astrolabio-di-tython", name: "Astrolabio di Tython" },
  { id: "bandiera-di-chandrila", name: "Bandiera di Chandrila" },
  { id: "bracciali-di-kashyyyk", name: "Bracciali di Kashyyyk" },
  { id: "calice-di-alderaan", name: "Calice di Alderaan" },
  { id: "calice-di-korriban", name: "Calice di Korriban" },
  { id: "campana-di-lothal", name: "Campana di Lothal" },
  { id: "canna-di-oban-urr", name: "Canna di Oban-Urr" },
  { id: "catena-di-darth-sidious", name: "Catena di Darth Sidious" },
  { id: "chiave-di-coruscant", name: "Chiave di Coruscant" },
  { id: "chiave-di-exegol", name: "Chiave di Exegol" },
  { id: "clessidra-di-malachor", name: "Clessidra di Malachor" },
  { id: "clessidra-di-ossus", name: "Clessidra di Ossus" },
  { id: "codice-jedi", name: "Codice Jedi" },
  { id: "codice-sith", name: "Codice Sith" },
  { id: "corona-di-anagri", name: "Corona di Anagri" },
  { id: "cristallo-di-ilum", name: "Cristallo di Ilum" },
  { id: "cristallo-di-moraband", name: "Cristallo di Moraband" },
  { id: "diapason-di-ruusan", name: "Diapason di Ruusan" },
  { id: "elmo-di-darth-vader", name: "Elmo di Darth Vader" },
  { id: "fibula-di-bastila-shan", name: "Fibula di Bastila Shan" },
  { id: "holocron-di-darth-bane", name: "Holocron di Darth Bane" },
  { id: "incensiere-di-moraband", name: "Incensiere di Moraband" },
  { id: "lanterna-di-jedha", name: "Lanterna di Jedha" },
  { id: "mantello-di-yoda", name: "Mantello di Yoda" },
  { id: "maschera-di-darth-nihilus", name: "Maschera di Darth Nihilus" },
  { id: "paramani-di-cortosis", name: "Paramani di Cortosis" },
  { id: "pendolo-di-ziost", name: "Pendolo di Ziost" },
  { id: "pietra-di-dantooine", name: "Pietra di Dantooine" },
  { id: "pietra-di-mustafar", name: "Pietra di Mustafar" },
  { id: "prisma-di-darth-traya", name: "Prisma di Darth Traya" },
  { id: "scettro-di-vitiate", name: "Scettro di Vitiate" },
  { id: "sfera-di-dathomir", name: "Sfera di Dathomir" },
  { id: "sfera-di-manaan", name: "Sfera di Manaan" },
  { id: "sigillo-di-ahch-to", name: "Sigillo di Ahch-To" },
  { id: "sigillo-di-jocasta-nu", name: "Sigillo di Jocasta Nu" },
  { id: "spada-di-khashyun", name: "Spada di Khashyun" },
  { id: "tessitura-di-nomi-sunrider", name: "Tessitura di Nomi Sunrider" },
  { id: "veste-di-darth-revan", name: "Veste di Darth Revan" },
]);

function normalizeReliquieId(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeReliquieGuess(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reliquieImageUrl(id?) {
  const cid = normalizeReliquieId(id);
  return cid ? `${RELIQUIE_CDN}/${cid}.png?v=${RELIQUIE_IMG_V}` : "";
}

function listReliquieCatalog() {
  return RELIQUIE_CATALOG.map((r?) => ({
    id: r.id,
    name: r.name,
    imageUrl: reliquieImageUrl(r.id),
    thumbUrl: reliquieImageUrl(r.id),
    silhouetteUrl: reliquieImageUrl(r.id),
    hasImage: true,
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
