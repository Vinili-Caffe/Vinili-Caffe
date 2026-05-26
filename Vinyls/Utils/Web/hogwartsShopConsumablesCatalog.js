const CONSUMABLE_BOOST_TYPES = Object.freeze({ HOUSE_POINTS: "housePoints", EXP: "exp" });
const CONSUMABLE_BOOST_SCOPES = Object.freeze({ HOUSE: "house", PERSONAL: "personal", GLOBAL: "global" });
const CONSUMABLE_CATEGORIES = Object.freeze({ HOUSE_POINTS: "consumable-house-points", EXP: "consumable-exp" });
const CONSUMABLE_CATEGORY_LABELS = Object.freeze({ [CONSUMABLE_CATEGORIES.HOUSE_POINTS]: "Boost punti casa", [CONSUMABLE_CATEGORIES.EXP]: "Boost EXP" });
const CONSUMABLE_CATEGORY_HINTS = Object.freeze({ [CONSUMABLE_CATEGORIES.HOUSE_POINTS]: "Moltiplica ×2 i punti casa guadagnati per la durata indicata.", [CONSUMABLE_CATEGORIES.EXP]: "Moltiplica ×2 l'EXP guadagnata per la durata indicata." });
const HOGWARTS_SHOP_CONSUMABLES = Object.freeze([
  {
    id: "hufflepuff-merit-scroll",
    category: CONSUMABLE_CATEGORIES.HOUSE_POINTS,
    name: "Pergamena del Merito di Tassorosso",
    price: 6000,
    durationMs: 5 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.HOUSE_POINTS,
    scope: CONSUMABLE_BOOST_SCOPES.HOUSE,
    multiplier: 2,
    rarity: "Casa",
    accent: "#d4af37",
    icon: "fa-file-text-o",
    description: "Una pergamena dorata che infonde coraggio collettivo alla tua casa.",
    detail: "5 ore",
  },
  {
    id: "gryffindor-glory-elixir",
    category: CONSUMABLE_CATEGORIES.HOUSE_POINTS,
    name: "Elisir della Gloria di Grifondoro",
    price: 11000,
    durationMs: 10 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.HOUSE_POINTS,
    scope: CONSUMABLE_BOOST_SCOPES.HOUSE,
    multiplier: 2,
    rarity: "Casa",
    accent: "#c0392b",
    icon: "fa-flask",
    description: "Un elisir ardente che accende lo spirito di squadra per ore.",
    detail: "10 ore",
  },
  {
    id: "slytherin-audacity-vial",
    category: CONSUMABLE_CATEGORIES.HOUSE_POINTS,
    name: "Fiala dell'Audacia di Serpeverde",
    price: 4000,
    durationMs: 3 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.HOUSE_POINTS,
    scope: CONSUMABLE_BOOST_SCOPES.PERSONAL,
    multiplier: 2,
    rarity: "Personale",
    accent: "#2ecc71",
    icon: "fa-eyedropper",
    description: "Una dose concentrata di determinazione solo per te.",
    detail: "3 ore",
  },
  {
    id: "ravenclaw-union-horn",
    category: CONSUMABLE_CATEGORIES.HOUSE_POINTS,
    name: "Corno dell'Unione di Corvonero",
    price: 3500,
    durationMs: 2 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.HOUSE_POINTS,
    scope: CONSUMABLE_BOOST_SCOPES.GLOBAL,
    multiplier: 2,
    rarity: "Globale",
    accent: "#3498db",
    icon: "fa-bullhorn",
    description: "Un richiamo che risuona in tutte le sale comuni di Hogwarts.",
    detail: "2 ore",
  },
  {
    id: "shared-spells-manual",
    category: CONSUMABLE_CATEGORIES.EXP,
    name: "Manuale degli Incantesimi Condivisi",
    price: 5000,
    durationMs: 5 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.EXP,
    scope: CONSUMABLE_BOOST_SCOPES.HOUSE,
    multiplier: 2,
    rarity: "Casa",
    accent: "#e67e22",
    icon: "fa-book",
    description: "Incantesimi condivisi per studiare insieme e imparare più in fretta.",
    detail: "5 ore",
  },
  {
    id: "common-labors-clock",
    category: CONSUMABLE_CATEGORIES.EXP,
    name: "Orologio delle Fatiche Comuni",
    price: 9000,
    durationMs: 10 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.EXP,
    scope: CONSUMABLE_BOOST_SCOPES.HOUSE,
    multiplier: 2,
    rarity: "Casa",
    accent: "#8e44ad",
    icon: "fa-clock-o",
    description: "Ogni tic segnala un progresso condiviso per tutta la casa.",
    detail: "10 ore",
  },
  {
    id: "sharp-mind-potion",
    category: CONSUMABLE_CATEGORIES.EXP,
    name: "Pozione della Mente Acuta",
    price: 3000,
    durationMs: 3 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.EXP,
    scope: CONSUMABLE_BOOST_SCOPES.PERSONAL,
    multiplier: 2,
    rarity: "Personale",
    accent: "#1abc9c",
    icon: "fa-flask",
    description: "Concentrazione cristallina per chi vuole spiccare da solo.",
    detail: "3 ore",
  },
  {
    id: "magic-echo-crystal",
    category: CONSUMABLE_CATEGORIES.EXP,
    name: "Cristallo dell'Eco Magico",
    price: 2500,
    durationMs: 2 * 60 * 60 * 1000,
    boostType: CONSUMABLE_BOOST_TYPES.EXP,
    scope: CONSUMABLE_BOOST_SCOPES.GLOBAL,
    multiplier: 2,
    rarity: "Globale",
    accent: "#9b59b6",
    icon: "fa-diamond",
    description: "Un'eco che amplifica lo studio di ogni mago del castello.",
    detail: "2 ore",
  },
]);

function normalizeConsumableId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeConsumableCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return Object.values(CONSUMABLE_CATEGORIES).includes(category) ? category : "";
}

function getConsumableById(itemId) {
  const id = normalizeConsumableId(itemId);
  return HOGWARTS_SHOP_CONSUMABLES.find((item) => item.id === id) || null;
}

function consumablePrice(item) {
  return Math.max(0, Math.floor(Number(item?.price) || 0));
}

function publicConsumablesCatalog() {
  return {
    categories: Object.values(CONSUMABLE_CATEGORIES).map((id) => ({
      id,
      label: CONSUMABLE_CATEGORY_LABELS[id] || id,
      boostHint: CONSUMABLE_CATEGORY_HINTS[id] || "",
      items: HOGWARTS_SHOP_CONSUMABLES.filter((item) => item.category === id).map((item) => ({ ...item })),
    })),
  };
}

module.exports = { CONSUMABLE_BOOST_SCOPES, CONSUMABLE_BOOST_TYPES, CONSUMABLE_CATEGORIES, CONSUMABLE_CATEGORY_HINTS, CONSUMABLE_CATEGORY_LABELS, HOGWARTS_SHOP_CONSUMABLES, consumablePrice, getConsumableById, normalizeConsumableCategory, normalizeConsumableId, publicConsumablesCatalog };