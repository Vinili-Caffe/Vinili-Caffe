const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getShopItemById, SHOP_CATEGORIES } = require("../../Utils/Web/hogwartsShopCatalog");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const PET_HOUSE_POINTS_MULTIPLIER = Object.freeze({ "tabby-cat-pet": 2, "snowy-owl-pet": 3, "moon-toad-pet": 4, "mini-phoenix-pet": 5 });
const BROOM_ROB_SUCCESS_BONUS = Object.freeze({ "school-sweeper-broom": 10, "comet-copper-broom": 18, "stormchaser-broom": 26, "aurora-3000-broom": 35 });
const ROB_SUCCESS_CAP = 80;

function isHogwartsShopBoostActive(client, nowMs = Date.now()) {
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!eventCfg?.enabled) return false;
  const now = Number(nowMs || Date.now());
  const start = Number(eventCfg.sortingStartMs ?? eventCfg.startMs);
  const end = Number(eventCfg.endMs);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function normalizeShopInventory(raw) {
  const items = raw?.items && typeof raw.items === "object" ? raw.items : {};
  const out = { wand: null, broom: null, pet: null };
  for (const category of Object.keys(out)) {
    const row = items[category] && typeof items[category] === "object" ? items[category] : null;
    if (!row?.id) continue;
    const item = getShopItemById(row.id);
    if (!item || item.category !== category) continue;
    out[category] = { ...item, purchasedAt: row.purchasedAt || null };
  }
  return out;
}

async function loadShopInventory(guildId, userId) {
  const doc = await ActivityUserProfile.findOne({
    guildId: String(guildId || ""),
    userId: String(userId || ""),
  })
    .select("profile.events.hogwarts.shop")
    .lean()
    .catch(() => null);
  return normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop);
}

async function assertRobberHasBroom(client, guildId, userId) {
  const inventory = await loadShopInventory(guildId, userId);
  if (!inventory.broom?.id) {
    return {
      ok: false,
      code: "no_broom",
      message: "Acquista una **scopa** nello shop dell'evento Hogwarts prima di usare `+rob`.",
    };
  }
  return { ok: true, broom: inventory.broom };
}

function petHousePointsMultiplier(petItem) {
  const id = String(petItem?.id || "").trim();
  if (!id) return 1;
  return PET_HOUSE_POINTS_MULTIPLIER[id] ?? 1;
}

function broomRobSuccessBonus(broomItem) {
  const id = String(broomItem?.id || "").trim();
  if (!id) return 0;
  return BROOM_ROB_SUCCESS_BONUS[id] ?? 0;
}

/**
 * Applica moltiplicatore animale ai punti casa (solo se evento live).
 * @returns {Promise<{ points: number, multiplier: number, petName: string }>}
 */
async function applyPetHousePointsBoost(client, guildId, userId, basePoints) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  if (base <= 0 || !isHogwartsShopBoostActive(client)) {
    return { points: base, multiplier: 1, petName: "", consumableMultiplier: 1, consumableLabels: [] };
  }
  const inventory = await loadShopInventory(guildId, userId);
  const pet = inventory[SHOP_CATEGORIES.PET];
  const petMult = petHousePointsMultiplier(pet);
  const afterPet = petMult <= 1 ? base : Math.max(0, Math.floor(base * petMult));
  const { resolveHousePointsConsumableMultiplier } = require("./hogwartsConsumableBoostsService");
  const { resolveSortedHouseForUser } = require("./galeoniEconomyService");
  const houseId = await resolveSortedHouseForUser(guildId, userId, client).catch(() => "");
  const consumable = await resolveHousePointsConsumableMultiplier(client, guildId, userId, houseId);
  const consumableMult = Math.max(1, Number(consumable?.multiplier) || 1);
  const points = consumableMult <= 1 ? afterPet : Math.max(0, Math.floor(afterPet * consumableMult));
  return {
    points,
    multiplier: (petMult > 1 ? petMult : 1) * consumableMult,
    petName: petMult > 1 ? pet?.name || "" : "",
    consumableMultiplier: consumableMult > 1 ? consumableMult : 1,
    consumableLabels: Array.isArray(consumable?.labels) ? consumable.labels : [],
  };
}

/**
 * @returns {Promise<{ chance: number, bonus: number, broomName: string }>}
 */
async function resolveRobSuccessChance(client, guildId, userId, baseChance) {
  const base = Math.max(1, Math.min(ROB_SUCCESS_CAP, Math.floor(Number(baseChance) || 35)));
  if (!isHogwartsShopBoostActive(client)) {
    return { chance: base, bonus: 0, broomName: "" };
  }
  const inventory = await loadShopInventory(guildId, userId);
  const broom = inventory[SHOP_CATEGORIES.BROOM];
  const bonus = broomRobSuccessBonus(broom);
  if (bonus <= 0) return { chance: base, bonus: 0, broomName: "" };
  return {
    chance: Math.min(ROB_SUCCESS_CAP, base + bonus),
    bonus,
    broomName: broom?.name || "",
  };
}

module.exports = { BROOM_ROB_SUCCESS_BONUS, PET_HOUSE_POINTS_MULTIPLIER, ROB_SUCCESS_CAP, applyPetHousePointsBoost, assertRobberHasBroom, broomRobSuccessBonus, isHogwartsShopBoostActive, loadShopInventory, normalizeShopInventory, petHousePointsMultiplier, resolveRobSuccessChance };