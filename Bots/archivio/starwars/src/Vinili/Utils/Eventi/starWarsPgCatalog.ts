/**
 * Catalogo PG Star Wars (inventati) — immagini su CDN.
 */
"use strict";

const PG_CDN = "https://cdn.viniliecaffe.it/images/starwars/pg";
const PG_IMG_V = "20261104pg1";

const PG_CATALOG = Object.freeze([
  { id: "vaelen_sun", name: "Vaelen Sun" },
  { id: "tarek_kor", name: "Tarek Kor" },
  { id: "nala_vess", name: "Nala Vess" },
  { id: "jorad_ty", name: "Jorad Ty" },
  { id: "zin_kraal", name: "Zin Kraal" },
  { id: "rynn_valo", name: "Rynn Valo" },
  { id: "brak_kar", name: "Brak'kar" },
  { id: "darth_vane", name: "Darth Vane" },
  { id: "kaelen_vex", name: "Kaelen Vex" },
  { id: "nyx_draven", name: "Nyx Draven" },
  { id: "lord_malakor", name: "Lord Malakor" },
  { id: "vespera_thul", name: "Vespera Thul" },
  { id: "kull_il_devastatore", name: "Kull il Devastatore" },
  { id: "vaelen_kryze", name: "Vaelen Kryze" },
  { id: "krakk", name: "Krakk" },
  { id: "zorri_skarr", name: "Zorri Skarr" },
  { id: "jaxen_fett", name: "Jaxen Fett" },
  { id: "brakka", name: "Brakka" },
  { id: "capitano_vanguard", name: "Capitano CT-8844 \"Vanguard\"" },
  { id: "trooper_glitch", name: "Trooper \"Glitch\"" },
  { id: "sergente_vane", name: "Sergente Vane" },
  { id: "comandante_kael", name: "Comandante Kael" },
  { id: "bx_770", name: "BX-770" },
  { id: "k_4so_vigil", name: "K-4SO \"Vigil\"" },
  { id: "r4_d9", name: "R4-D9" },
  { id: "hk_55_executioner", name: "HK-55 \"Executioner\"" },
  { id: "tikka", name: "Tikka" },
  { id: "gazzak", name: "Gazzak" },
  { id: "rinn_vox", name: "Rinn Vox" },
  { id: "orla_vane", name: "Orla Vane" },
  { id: "borkus", name: "Borkus" },
  { id: "zeth_kor", name: "Zeth'kor" },
  { id: "talon_vex", name: "Talon Vex" },
  { id: "ka_ree", name: "Ka'ree" },
  { id: "darth_skar", name: "Darth Skar" },
  { id: "vexina", name: "Vexina" },
  { id: "corvus", name: "Corvus" },
  { id: "krayt", name: "Krayt" },
  { id: "xander", name: "Xander" },
  { id: "balthazar", name: "Balthazar" },
]);

function normalizePgId(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function pgImageUrl(id?) {
  const cid = normalizePgId(id);
  return cid ? `${PG_CDN}/${cid}.jpg?v=${PG_IMG_V}` : "";
}

function listPgCatalog() {
  return PG_CATALOG.map((r?) => ({
    id: r.id,
    name: r.name,
    imageUrl: pgImageUrl(r.id),
    thumbUrl: pgImageUrl(r.id),
    silhouetteUrl: pgImageUrl(r.id),
    hasImage: true,
  }));
}

function getPgById(id?) {
  const cid = normalizePgId(id);
  if (!cid) return null;
  const hit = PG_CATALOG.find((r?) => r.id === cid || normalizePgId(r.id) === cid);
  if (!hit) return null;
  return {
    ...hit,
    imageUrl: pgImageUrl(hit.id),
    thumbUrl: pgImageUrl(hit.id),
    silhouetteUrl: pgImageUrl(hit.id),
    hasImage: true,
  };
}

function findPgByGuess(guess?) {
  const g = normalizePgGuess(guess);
  if (!g) return null;
  const gSlug = normalizePgId(g);
  return (
    PG_CATALOG.find((r?) => {
      const n = normalizePgGuess(r.name);
      return n === g || r.id === gSlug || normalizePgId(n) === gSlug || normalizePgId(r.id) === gSlug;
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
