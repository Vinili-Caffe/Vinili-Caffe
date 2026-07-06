const SHOP_CATEGORIES = Object.freeze({ WAND: "wand", BROOM: "broom", PET: "pet" });
const SHOP_DURABLE_BOOST_MAX_USES = 750;
const WAND_WIN_CHANCE = Object.freeze({ "willow-spark-wand": 58, "ash-moon-wand": 72, "elder-ember-wand": 86, "phoenix-legacy-wand": 100 });
const BROOM_ROB_SUCCESS_BONUS = Object.freeze({ "school-sweeper-broom": 10, "comet-copper-broom": 18, "stormchaser-broom": 26, "aurora-3000-broom": 35 });
const PET_HOUSE_POINTS_MULTIPLIER = Object.freeze({ "tabby-cat-pet": 2, "snowy-owl-pet": 3, "moon-toad-pet": 4, "mini-phoenix-pet": 5 });
const SHOP_BOOST_TYPE_LABELS = Object.freeze({ [SHOP_CATEGORIES.WAND]: "Duello", [SHOP_CATEGORIES.BROOM]: "Rubare", [SHOP_CATEGORIES.PET]: "Minigiochi" });
const SHOP_CATEGORY_LABELS = Object.freeze({ [SHOP_CATEGORIES.WAND]: "Bacchette", [SHOP_CATEGORIES.BROOM]: "Scope", [SHOP_CATEGORIES.PET]: "Animali" });
const SHOP_CATEGORY_BOOST_HINTS = Object.freeze({ [SHOP_CATEGORIES.WAND]: "Boost duello: più chance di vincere.", [SHOP_CATEGORIES.BROOM]: "Boost economia: più chance di furto riuscito.", [SHOP_CATEGORIES.PET]: "Boost minigiochi: moltiplica i punti casa." });
const HOGWARTS_SHOP_CATALOG = Object.freeze([
  {
    id: "willow-spark-wand",
    category: SHOP_CATEGORIES.WAND,
    name: "Bacchetta di Salice",
    price: 15,
    rarity: "Comune",
    imageKey: "wand-willow",
    imageFile: "bacchetta di salice.png",
    accent: "#d8b079",
    description: "Leggera e affidabile, perfetta per incantesimi quotidiani e primi duelli.",
    detail: "Salice, nucleo di piuma, 10 pollici e tre quarti.",
  },
  {
    id: "ash-moon-wand",
    category: SHOP_CATEGORIES.WAND,
    name: "Bacchetta di Frassino Lunare",
    price: 35,
    rarity: "Raffinata",
    imageKey: "wand-ash",
    imageFile: "bacchetta di frassino lunare.png",
    accent: "#a7c7e7",
    description: "Risponde bene agli studenti pazienti e precisi.",
    detail: "Frassino, corda di cuore, 11 pollici.",
  },
  {
    id: "elder-ember-wand",
    category: SHOP_CATEGORIES.WAND,
    name: "Bacchetta di Sambuco Ardente",
    price: 70,
    rarity: "Pregiata",
    imageKey: "wand-elder",
    imageFile: "Bacchetta_di_Sambuco_main.png",
    accent: "#f5a45d",
    description: "Elegante, capricciosa e potente nelle mani giuste.",
    detail: "Sambuco, crine di unicorno, 12 pollici.",
  },
  {
    id: "phoenix-legacy-wand",
    category: SHOP_CATEGORIES.WAND,
    name: "Bacchetta Eredità della Fenice",
    price: 120,
    rarity: "Leggendaria",
    imageKey: "wand-phoenix",
    imageFile: "bacchetta di fenice.png",
    accent: "#ffcf70",
    description: "Una bacchetta da collezione, avvolta da una tenue luce dorata.",
    detail: "Tasso rosso, piuma di fenice, 13 pollici.",
  },
  {
    id: "school-sweeper-broom",
    category: SHOP_CATEGORIES.BROOM,
    name: "Scopa da Cortile",
    price: 20,
    rarity: "Comune",
    imageKey: "broom-school",
    imageFile: "scopa da cortile.png",
    accent: "#c9864a",
    description: "Non è veloce, ma porta sempre a destinazione.",
    detail: "Manico robusto, setole corte, stabilità alta.",
  },
  {
    id: "comet-copper-broom",
    category: SHOP_CATEGORIES.BROOM,
    name: "Cometa di Rame",
    price: 45,
    rarity: "Sportiva",
    imageKey: "broom-comet",
    imageFile: "scopa cometa di rame.png",
    accent: "#f0a45f",
    description: "Scatto brillante e virate morbide per chi ama il Quidditch.",
    detail: "Impugnatura in cuoio, profilo aerodinamico.",
  },
  {
    id: "stormchaser-broom",
    category: SHOP_CATEGORIES.BROOM,
    name: "Cacciatempesta",
    price: 85,
    rarity: "Pregiata",
    imageKey: "broom-storm",
    imageFile: "scopa cacciatempesta.png",
    accent: "#9dd6ff",
    description: "Tiene quota anche quando il cielo decide di fare i capricci.",
    detail: "Setole incantate, assetto da gara.",
  },
  {
    id: "aurora-3000-broom",
    category: SHOP_CATEGORIES.BROOM,
    name: "Aurora 3000",
    price: 140,
    rarity: "Leggendaria",
    imageKey: "broom-aurora",
    imageFile: "scopa aurora 3000.png",
    accent: "#d8b4fe",
    description: "Una scia luminosa, un rombo basso, e sei già oltre le torri.",
    detail: "Serie limitata, controllo quasi telepatico.",
  },
  {
    id: "tabby-cat-pet",
    category: SHOP_CATEGORIES.PET,
    name: "Gatto Tigrato",
    price: 18,
    rarity: "Comune",
    imageKey: "pet-cat",
    imageFile: "gatto.png",
    accent: "#f2c98a",
    description: "Fiero, indipendente e sempre seduto sul libro che ti serve.",
    detail: "Compagno silenzioso, bonus eleganza naturale.",
  },
  {
    id: "snowy-owl-pet",
    category: SHOP_CATEGORIES.PET,
    name: "Gufo delle Nevi",
    price: 40,
    rarity: "Nobile",
    imageKey: "pet-owl",
    imageFile: "gufo delle nevi.png",
    accent: "#e8f4ff",
    description: "Consegna messaggi con grazia e giudica ogni tua scelta.",
    detail: "Piumaggio chiaro, occhi d'ambra.",
  },
  {
    id: "moon-toad-pet",
    category: SHOP_CATEGORIES.PET,
    name: "Rospo Lunare",
    price: 65,
    rarity: "Raro",
    imageKey: "pet-toad",
    imageFile: "rospo.png",
    accent: "#a7f3d0",
    description: "Brilla lievemente nelle notti serene e ama i davanzali.",
    detail: "Molto tranquillo, sorprendentemente fotogenico.",
  },
  {
    id: "mini-phoenix-pet",
    category: SHOP_CATEGORIES.PET,
    name: "Pulcino di Fenice",
    price: 150,
    rarity: "Leggendario",
    imageKey: "pet-phoenix",
    imageFile: "pulcino di fenice.png",
    accent: "#ff9f6e",
    description: "Piccolo, caldo e drammatico: rinasce anche dal pisolino.",
    detail: "Piume incandescenti, canto raro.",
  },
]);

function normalizeShopCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return Object.values(SHOP_CATEGORIES).includes(category) ? category : "";
}

function normalizeShopItemId(value) {
  return String(value || "").trim().toLowerCase();
}

function listShopCatalog() {
  return HOGWARTS_SHOP_CATALOG.map((item) => ({ ...item }));
}

function getShopItemById(itemId) {
  const id = normalizeShopItemId(itemId);
  return HOGWARTS_SHOP_CATALOG.find((item) => item.id === id) || null;
}

function shopItemPrice(item) {
  return Math.max(0, Math.floor(Number(item?.price) || 0));
}

function ownedTierPrice(ownedRow) {
  if (!ownedRow?.id) return 0;
  const catalog = getShopItemById(ownedRow.id);
  const paid = Math.max(0, Math.floor(Number(ownedRow.pricePaid) || 0));
  return Math.max(shopItemPrice(catalog), paid);
}

/**
 * @param {{ id?: string, pricePaid?: number }|null} ownedRow
 * @param {{ id: string, price: number, name?: string }} item
 */
function resolveShopPurchaseOffer(ownedRow, item) {
  if (!item?.id) return { ok: false, code: "invalid_item", message: "Oggetto shop non valido." };
  const newPrice = shopItemPrice(item);
  if (!ownedRow?.id) {
    return { ok: true, mode: "buy", amount: newPrice };
  }
  if (normalizeShopItemId(ownedRow.id) === normalizeShopItemId(item.id)) {
    return { ok: false, code: "already_owned", message: "Hai già questo oggetto equipaggiato." };
  }
  const ownedPrice = ownedTierPrice(ownedRow);
  if (newPrice <= ownedPrice) {
    return {
      ok: false,
      code: "not_upgrade",
      message: "Puoi solo passare a un oggetto di livello superiore nella stessa categoria.",
    };
  }
  return { ok: true, mode: "upgrade", amount: newPrice - ownedPrice, replacesId: ownedRow.id };
}

function resolveShopItemBoostPublic(item) {
  const category = normalizeShopCategory(item?.category);
  const boostType = SHOP_BOOST_TYPE_LABELS[category] || "";
  let boostMultiplier = "";
  if (category === SHOP_CATEGORIES.WAND) {
    const chance = WAND_WIN_CHANCE[item?.id];
    if (Number.isFinite(chance)) boostMultiplier = `${chance}%`;
  } else if (category === SHOP_CATEGORIES.BROOM) {
    const bonus = BROOM_ROB_SUCCESS_BONUS[item?.id];
    if (Number.isFinite(bonus)) boostMultiplier = `+${bonus}%`;
  } else if (category === SHOP_CATEGORIES.PET) {
    const mult = PET_HOUSE_POINTS_MULTIPLIER[item?.id];
    if (Number.isFinite(mult)) boostMultiplier = `×${mult}`;
  }
  return {
    boostType,
    boostMultiplier,
    boostMaxUses: SHOP_DURABLE_BOOST_MAX_USES,
  };
}

function publicShopItem(item) {
  const boost = resolveShopItemBoostPublic(item);
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    price: item.price,
    rarity: item.rarity,
    imageKey: item.imageKey,
    imageFile: item.imageFile,
    accent: item.accent,
    description: item.description,
    detail: item.detail,
    ...boost,
  };
}

function publicShopCatalog() {
  return {
    categories: Object.values(SHOP_CATEGORIES).map((id) => ({
      id,
      label: SHOP_CATEGORY_LABELS[id] || id,
      boostHint: SHOP_CATEGORY_BOOST_HINTS[id] || "",
      items: HOGWARTS_SHOP_CATALOG.filter((item) => item.category === id).map((item) => publicShopItem(item)),
    })),
  };
}

module.exports = { HOGWARTS_SHOP_CATALOG, SHOP_CATEGORIES, SHOP_CATEGORY_BOOST_HINTS, SHOP_CATEGORY_LABELS, getShopItemById, listShopCatalog, normalizeShopCategory, normalizeShopItemId, ownedTierPrice, publicShopCatalog, resolveShopPurchaseOffer, shopItemPrice };