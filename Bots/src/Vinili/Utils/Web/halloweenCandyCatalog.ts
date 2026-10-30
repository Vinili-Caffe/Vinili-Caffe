const CANDY_IMAGE_BASE = "/images/caramelle_del_porco_dio";
/** Media pubblici su Cloudflare R2 (cdn); fallback storico era api.viniliecaffe.it. */
const CANDY_PUBLIC_ORIGIN = "https://cdn.viniliecaffe.it";

const CANDY_NAMES = Object.freeze([
  "Zucchero d'osso",
  "Morso di zucca",
  "Caramella fantasma",
  "Goccia di pozione",
  "Teschio acidulo",
  "Ragno candito",
  "Occhio di gelatina",
  "Pipistrello zuccherino",
  "Strega acidula",
  "Scheletro croccante",
  "Luna di miele nera",
  "Vampiro al lampone",
  "Zanna di liquirizia",
  "Calderone speziato",
  "Ragnatela soffice",
  "Gatto nero fondente",
  "Lanterna di zucchero",
  "Presagio al cacao",
  "Nebbia alla menta",
  "Corvo croccante",
  "Tomba al caramello",
  "Stella stregata",
  "Bara candita",
  "Miele stregato",
  "Uva del grimorio",
  "Menta di mezzanotte",
  "Ululato al miele",
  "Burro d'osso",
  "Ciliegia della cripta",
  "Cialda del will-o'-wisp",
  "Gomma del ghoul",
  "Vortice magico",
  "Miele infestato",
  "Marshmallow mummia",
  "Lollipop pozione",
  "Zucchero d'ombra",
  "Bacca della banshee",
  "Uva della tomba",
  "Perla di zucca",
]);

function normalizeCandyId(value?) {
  const n = Math.floor(Number(String(value || "").trim()));
  if (!Number.isFinite(n) || n < 1 || n > CANDY_NAMES.length) return "";
  return String(n);
}

function candyImagePath(id?) {
  const cid = normalizeCandyId(id);
  return cid ? `${CANDY_IMAGE_BASE}/${cid}.png` : "";
}

function candyThumbPath(id?) {
  const cid = normalizeCandyId(id);
  return cid ? `${CANDY_IMAGE_BASE}/thumbs/${cid}.webp` : "";
}

function candySilhouettePath(id?) {
  const cid = normalizeCandyId(id);
  return cid ? `${CANDY_IMAGE_BASE}/sil2/${cid}.webp` : "";
}

function publicUrl(path?) {
  return path ? `${CANDY_PUBLIC_ORIGIN}${path}` : "";
}

function candyPublicImageUrl(id?) {
  return publicUrl(candyImagePath(id));
}

function candyPublicThumbUrl(id?) {
  return publicUrl(candyThumbPath(id));
}

function candyPublicSilhouetteUrl(id?) {
  return publicUrl(candySilhouettePath(id));
}

function candyEntry(id?, name?) {
  return {
    id,
    name,
    imagePath: candyImagePath(id),
    imageUrl: candyPublicImageUrl(id),
    thumbPath: candyThumbPath(id),
    thumbUrl: candyPublicThumbUrl(id),
    silhouettePath: candySilhouettePath(id),
    silhouetteUrl: candyPublicSilhouetteUrl(id),
  };
}

function listHalloweenCandyCatalog() {
  return CANDY_NAMES.map((name?, idx?) => candyEntry(String(idx + 1), name));
}

function getHalloweenCandyById(id?) {
  const cid = normalizeCandyId(id);
  if (!cid) return null;
  const idx = Number(cid) - 1;
  const name = CANDY_NAMES[idx];
  if (!name) return null;
  return candyEntry(cid, name);
}

function halloweenCandyTotal() {
  return CANDY_NAMES.length;
}

export = {
  CANDY_IMAGE_BASE,
  CANDY_PUBLIC_ORIGIN,
  listHalloweenCandyCatalog,
  getHalloweenCandyById,
  normalizeCandyId,
  candyImagePath,
  candyPublicImageUrl,
  candyPublicThumbUrl,
  candyPublicSilhouetteUrl,
  halloweenCandyTotal,
};
