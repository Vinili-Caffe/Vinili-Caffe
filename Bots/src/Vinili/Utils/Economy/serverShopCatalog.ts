const { CURRENCY_CAFFE, CURRENCY_VINILI } = require("../../Services/Community/serverWalletService") as typeof import("../../Services/Community/serverWalletService");

const SERVER_SHOP_CATALOG = Object.freeze([
  {
    id: "caffe-rush",
    currency: CURRENCY_CAFFE,
    name: "Espresso Sprint",
    emoji: "☕",
    price: 14,
    description: "Azzera il cooldown del lavoro se è attivo.",
    effect: "clear_work_cooldown",
  },
  {
    id: "caffe-shield",
    currency: CURRENCY_CAFFE,
    name: "Scudo Anti-Furto",
    emoji: "🛡️",
    price: 20,
    description: "Protezione dal furto per 6 ore.",
    effect: "rob_shield_6h",
  },
  {
    id: "caffe-streak",
    currency: CURRENCY_CAFFE,
    name: "Zucchero Extra",
    emoji: "🍬",
    price: 18,
    description: "Prossima daily, weekly o monthly: +25% sul bonus streak.",
    effect: "fixed_income_streak_bonus_25",
  },
  {
    id: "vinili-overtime",
    currency: CURRENCY_VINILI,
    name: "Straordinario",
    emoji: "💿",
    price: 24,
    description: "Prossimo lavoro: +60% sulla ricompensa base.",
    effect: "work_reward_bonus_60",
  },
  {
    id: "vinili-heist-kit",
    currency: CURRENCY_VINILI,
    name: "Kit Scasso",
    emoji: "🥷",
    price: 30,
    description: "Prossimo furto: +12% probabilità di successo.",
    effect: "rob_success_bonus_12",
  },
  {
    id: "vinili-lucky-vinyl",
    currency: CURRENCY_VINILI,
    name: "Vinile Portafortuna",
    emoji: "🍀",
    price: 26,
    description: "Prossime 3 vittorie ai giochi: +15% sul payout.",
    effect: "gamble_payout_bonus_15x3",
  },
]);

function getShopItemById(itemId?) {
  const id = String(itemId || "").trim();
  return SERVER_SHOP_CATALOG.find((row?) => row.id === id) || null;
}

function listShopItems(currency?) {
  const cur = String(currency || "").trim().toLowerCase();
  return SERVER_SHOP_CATALOG.filter((row?) => !cur || row.currency === cur);
}

export = {
  SERVER_SHOP_CATALOG,
  getShopItemById,
  listShopItems,
};