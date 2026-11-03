const { ActivityUserProfile } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { addGaleoni, formatGaleoni, getGringottBalance } = require("./gringottService") as typeof import("./gringottService");
const { assertSortedEconomyAccess, eventKey } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");
const { CURRENCY_CAFFE, formatCaffe, getServerWallet, spendCurrency } = require("./serverWalletService") as typeof import("./serverWalletService");
const { resolveEconomyPresentation } = require("../../Utils/Economy/economyPresentation") as typeof import("../../Utils/Economy/economyPresentation");

const BRIDGE_PATH = "profile.economy.server.bridge";

function int(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeId(value?) {
  return String(value || "").trim();
}

function dayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function bridgeConfig(client?) {
  const raw = client?.config?.serverEconomy?.bridge;
  const cfg = raw && typeof raw === "object" ? raw : {};
  const caffePerGaleone = int(cfg.caffePerGaleone, 4, 2, 50);
  return {
    enabled: cfg.enabled !== false,
    caffePerGaleone,
    minCaffeConvert: int(cfg.minCaffeConvert, 8, caffePerGaleone, 100000),
    maxCaffeConvert: int(cfg.maxCaffeConvert, 120, caffePerGaleone, 100000),
    dailyGaleoniCap: int(cfg.dailyGaleoniCap, 40, 1, 10000),
  };
}

function isEconomyBridgeEnabled(client?, nowMs = Date.now()) {
  const pres = resolveEconomyPresentation(client, nowMs);
  return pres.hogwartsEconomyLive && bridgeConfig(client).enabled;
}

async function readBridgeState(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: normalizeId(guildId), userId: normalizeId(userId) })
    .select(BRIDGE_PATH)
    .lean()
    .catch(() => null);
  const raw = doc?.profile?.economy?.server?.bridge;
  return raw && typeof raw === "object" ? raw : {};
}

async function getConversionStatus(client?, guildId?, userId?) {
  const cfg = bridgeConfig(client);
  const bridge = await readBridgeState(guildId, userId);
  const key = dayKey();
  const sameDay = bridge.convertDayKey === key;
  const convertedToday = sameDay ? int(bridge.galeoniConvertedToday, 0) : 0;
  const remainingGaleoni = Math.max(0, cfg.dailyGaleoniCap - convertedToday);
  return {
    cfg,
    convertDayKey: key,
    convertedToday,
    remainingGaleoni,
    rateLabel: `${cfg.caffePerGaleone} Caffè → 1 Galeone`,
  };
}

function quoteConversion(cfg?, caffeAmount?) {
  const caffe = int(caffeAmount, 0, 0, cfg.maxCaffeConvert);
  if (caffe < cfg.minCaffeConvert) {
    return { ok: false, message: `Converti almeno ${formatCaffe(cfg.minCaffeConvert)}.` };
  }
  if (caffe > cfg.maxCaffeConvert) {
    return { ok: false, message: `Massimo ${formatCaffe(cfg.maxCaffeConvert)} per conversione.` };
  }
  const unit = Math.max(1, cfg.caffePerGaleone);
  const galeoni = Math.floor(caffe / unit);
  if (galeoni < 1) {
    return { ok: false, message: `Servono almeno ${formatCaffe(unit)} per 1 Galeone.` };
  }
  const caffeSpent = galeoni * unit;
  return { ok: true, caffeRequested: caffe, caffeSpent, galeoni };
}

async function convertCaffeToGaleoni(client?, message?, caffeAmountRaw?) {
  const access = await assertSortedEconomyAccess(message, client);
  if (!access.ok) return access;
  if (!isEconomyBridgeEnabled(client)) {
    return { ok: false, message: "La conversione Caffè → Galeoni è disponibile solo durante l'evento Hogwarts." };
  }
  if (access.preview) {
    return { ok: false, message: "In anteprima puoi vedere i Galeoni, ma la conversione si sblocca con lo smistamento completato." };
  }

  const cfg = bridgeConfig(client);
  const quoted = quoteConversion(cfg, caffeAmountRaw);
  if (!quoted.ok) return quoted;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const wallet = await getServerWallet(guildId, userId);
  const caffeBalance = Math.max(0, Math.floor(Number(wallet?.caffe?.balance) || 0));
  if (caffeBalance < quoted.caffeSpent) {
    return { ok: false, message: `Non hai abbastanza Caffè: servono ${formatCaffe(quoted.caffeSpent)}.` };
  }

  const status = await getConversionStatus(client, guildId, userId);
  if (quoted.galeoni > status.remainingGaleoni) {
    return {
      ok: false,
      message: `Limite giornaliero: puoi ancora convertire fino a ${formatGaleoni(status.remainingGaleoni)} oggi.`,
    };
  }

  const spent = await spendCurrency({
    guildId,
    userId,
    currency: CURRENCY_CAFFE,
    amount: quoted.caffeSpent,
    reason: "Conversione in Galeoni (Gringott)",
    actorId: userId,
    source: "economy_bridge",
  });
  if (!spent?.ok) {
    return { ok: false, message: "Non sono riuscito a scalare i Caffè. Riprova." };
  }

  const evt = eventKey(client);
  const credited = await addGaleoni({
    guildId,
    userId,
    amount: quoted.galeoni,
    reason: `Conversione ${formatCaffe(quoted.caffeSpent)}`,
    actorId: userId,
    source: "economy_bridge",
    eventKey: evt,
  });
  if (!credited?.ok) {
    await require("./serverWalletService").addCurrency({
      guildId,
      userId,
      currency: CURRENCY_CAFFE,
      amount: quoted.caffeSpent,
      reason: "Rimborso conversione Galeoni",
      actorId: userId,
      source: "economy_bridge_refund",
    }).catch(() => null);
    return { ok: false, message: "Accredito Galeoni fallito: i Caffè sono stati rimborsati." };
  }

  const bridgeBefore = await readBridgeState(guildId, userId);
  const key = status.convertDayKey;
  const sameDay = bridgeBefore.convertDayKey === key;
  const convertedToday = (sameDay ? int(bridgeBefore.galeoniConvertedToday, 0) : 0) + quoted.galeoni;
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $set: {
        [`${BRIDGE_PATH}.convertDayKey`]: key,
        [`${BRIDGE_PATH}.galeoniConvertedToday`]: convertedToday,
        [`${BRIDGE_PATH}.updatedAt`]: new Date(),
        [`${BRIDGE_PATH}.lastCaffeSpent`]: quoted.caffeSpent,
        [`${BRIDGE_PATH}.lastGaleoniGained`]: quoted.galeoni,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    caffeSpent: quoted.caffeSpent,
    galeoniGained: quoted.galeoni,
    gringott: credited.state,
    wallet: spent.state,
    message: `Convertiti **${formatCaffe(quoted.caffeSpent)}** in **${formatGaleoni(quoted.galeoni)}** su Gringott.`,
  };
}

async function loadGaleoniWallet(client?, guildId?, userId?) {
  if (!resolveEconomyPresentation(client).showGaleoniWallet) return null;
  const evt = eventKey(client);
  const state = await getGringottBalance(guildId, userId, evt);
  if (!state) return null;
  return {
    balance: Math.max(0, Math.floor(Number(state.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(state.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(state.spent) || 0)),
  };
}

async function getBalBridgePanel(client?, message?, ownerId?, targetId?) {
  const showGaleoni = resolveEconomyPresentation(client).showGaleoniWallet;
  const canConvert = showGaleoni && isEconomyBridgeEnabled(client) && String(ownerId) === String(targetId);
  const galeoni = showGaleoni ? await loadGaleoniWallet(client, message.guild.id, targetId) : null;
  const conversion = canConvert ? await getConversionStatus(client, message.guild.id, targetId) : null;
  return {
    showGaleoni: Boolean(showGaleoni && galeoni),
    canConvert,
    galeoni: galeoni || { balance: 0, earned: 0, spent: 0 },
    conversion,
  };
}

export = {
  bridgeConfig,
  convertCaffeToGaleoni,
  getBalBridgePanel,
  getConversionStatus,
  isEconomyBridgeEnabled,
  loadGaleoniWallet,
  quoteConversion,
};