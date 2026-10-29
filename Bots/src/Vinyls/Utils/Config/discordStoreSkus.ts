const DISCORD_STORE_SKUS = Object.freeze({});

function isDurableRoleSku() {
  return false;
}

function isGuildSubscriptionSku() {
  return false;
}

function getDiscordStoreSkuIds() {
  return [];
}

function getDiscordStoreRoleSkuIds() {
  return [];
}

function getDiscordStoreGuildSubscriptionSkuIds() {
  return [];
}

function resolveDiscordStoreSku() {
  return null;
}

function getDiscordStorePremiumSku() {
  return null;
}

export = {
  DISCORD_STORE_SKUS,
  getDiscordStoreSkuIds,
  getDiscordStoreRoleSkuIds,
  getDiscordStoreGuildSubscriptionSkuIds,
  getDiscordStorePremiumSku,
  resolveDiscordStoreSku,
  isDurableRoleSku,
  isGuildSubscriptionSku,
};
