const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { resolveHalloweenEventConfig, isHalloweenEventLive } = require("../../Utils/Web/halloweenEventConfig");
const {
  getHalloweenCandyById,
  halloweenCandyTotal,
  listHalloweenCandyCatalog,
  normalizeCandyId,
} = require("../../Utils/Web/halloweenCandyCatalog");

const CANDY_PATH = "profile.events.halloween.candy";

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function resolveEventKey(client, eventKey = "") {
  const fromArg = normalizeId(eventKey);
  if (fromArg) return fromArg;
  return normalizeId(resolveHalloweenEventConfig(client)?.eventKey) || "halloween_2026";
}

function normalizeOwnedIds(raw) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const id = normalizeCandyId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => Number(a) - Number(b));
  return out;
}

/** Solo tipi mancanti: mai doppioni. */
function pickUniqueAwardIds(ownedIds, amount) {
  const catalog = listHalloweenCandyCatalog();
  const owned = new Set(normalizeOwnedIds(ownedIds));
  const missing = catalog.filter((c) => !owned.has(c.id));
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const awarded = [];
  for (let i = 0; i < amt && missing.length; i += 1) {
    const idx = Math.floor(Math.random() * missing.length);
    const pick = missing.splice(idx, 1)[0];
    owned.add(pick.id);
    awarded.push({
      id: pick.id,
      name: pick.name,
      imagePath: pick.imagePath,
      imageUrl: pick.imageUrl,
      isNew: true,
    });
  }
  return awarded;
}

function readCandyRaw(doc) {
  return doc?.profile?.events?.halloween?.candy || null;
}

async function getHalloweenCandy(guildId, userId, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const total = halloweenCandyTotal();
  if (!isValidGuildUserId(g, u)) {
    return { balance: 0, eventKey: normalizeId(eventKey), owned: [], ownedCount: 0, total };
  }
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(CANDY_PATH)
    .lean()
    .catch(() => null);
  const raw = readCandyRaw(doc);
  const key = normalizeId(eventKey) || normalizeId(raw?.eventKey) || "halloween_2026";
  if (raw && normalizeId(raw.eventKey) && normalizeId(raw.eventKey) !== key) {
    return { balance: 0, eventKey: key, owned: [], ownedCount: 0, total, earned: 0 };
  }
  const owned = normalizeOwnedIds(raw?.owned);
  return {
    balance: safeInt(raw?.balance),
    eventKey: key,
    earned: safeInt(raw?.earned),
    owned,
    ownedCount: owned.length,
    total,
  };
}

function buildHalloweenCandyProfileSection(raw, client, eventKey = "", opts = {}) {
  const key = resolveEventKey(client, eventKey || raw?.eventKey);
  const owned = normalizeOwnedIds(raw?.owned);
  const balance = safeInt(raw?.balance);
  const eventLive = Boolean(isHalloweenEventLive(client, Date.now(), opts?.guildId || null));
  const forceVisible = Boolean(opts?.forceVisible);
  const visible = forceVisible || eventLive || owned.length > 0 || balance > 0;
  if (!visible) return null;
  const catalog = listHalloweenCandyCatalog();
  return {
    visible: true,
    preview: Boolean(forceVisible && !eventLive && owned.length < 1 && balance < 1),
    eventKey: key,
    balance,
    earned: safeInt(raw?.earned),
    ownedCount: owned.length,
    total: catalog.length,
    items: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      thumbUrl: c.thumbUrl,
      silhouetteUrl: c.silhouetteUrl,
      owned: owned.includes(c.id),
    })),
  };
}

async function tryClaimCandyId({ guildId, userId, eventKey, candyId, resetOwned = false }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const ek = normalizeId(eventKey) || "halloween_2026";
  const cid = normalizeCandyId(candyId);
  if (!isValidGuildUserId(g, u) || !cid) return null;

  const filter = { guildId: g, userId: u };
  if (!resetOwned) {
    filter[`${CANDY_PATH}.owned`] = { $ne: cid };
  }

  const update = {
    $set: {
      [`${CANDY_PATH}.eventKey`]: ek,
      [`${CANDY_PATH}.updatedAt`]: new Date(),
    },
    $inc: {
      [`${CANDY_PATH}.balance`]: 1,
      [`${CANDY_PATH}.earned`]: 1,
    },
    $setOnInsert: { guildId: g, userId: u },
  };
  if (resetOwned) {
    update.$set[`${CANDY_PATH}.owned`] = [cid];
  } else {
    update.$addToSet = { [`${CANDY_PATH}.owned`]: cid };
  }

  return ActivityUserProfile.findOneAndUpdate(filter, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: false,
  }).catch((err) => {
    global.logger?.warn?.("[HALLOWEEN-CANDY] claim failed", {
      guildId: g,
      userId: u,
      candyId: cid,
      err: err?.message || err,
    });
    return null;
  });
}

async function addHalloweenCandy({
  guildId,
  userId,
  amount = 1,
  eventKey = "",
  reason = "",
  source = "minigame",
  client = null,
} = {}) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const total = halloweenCandyTotal();
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input", total };
  const ek = normalizeId(eventKey) || "halloween_2026";

  const existing = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(CANDY_PATH)
    .lean()
    .catch(() => null);
  const raw = readCandyRaw(existing);
  let sameEvent = !raw?.eventKey || normalizeId(raw.eventKey) === ek;
  let ownedBefore = sameEvent ? normalizeOwnedIds(raw?.owned) : [];
  if (ownedBefore.length >= total) {
    return {
      ok: false,
      code: "collection_complete",
      eventKey: ek,
      reason,
      source,
      awarded: [],
      owned: ownedBefore,
      ownedCount: ownedBefore.length,
      total,
      balance: safeInt(raw?.balance),
      firstAward: null,
      complete: true,
    };
  }

  const awarded = [];
  let doc = null;
  const wanted = pickUniqueAwardIds(ownedBefore, amt);
  if (!wanted.length) {
    return {
      ok: false,
      code: "collection_complete",
      eventKey: ek,
      reason,
      source,
      awarded: [],
      owned: ownedBefore,
      ownedCount: ownedBefore.length,
      total,
      balance: safeInt(raw?.balance),
      firstAward: null,
      complete: true,
    };
  }

  for (const pick of wanted) {
    let claimed = null;
    let attemptOwned = ownedBefore.slice();
    let attempts = 0;
    let currentPick = pick;
    while (attempts < 8 && !claimed) {
      attempts += 1;
      claimed = await tryClaimCandyId({
        guildId: g,
        userId: u,
        eventKey: ek,
        candyId: currentPick.id,
        resetOwned: !sameEvent && awarded.length === 0 && attempts === 1 && ownedBefore.length === 0,
      });
      if (claimed) break;
      // race: qualcun altro / retry — rileggi owned e riprova con altro missing
      const fresh = await ActivityUserProfile.findOne({ guildId: g, userId: u })
        .select(CANDY_PATH)
        .lean()
        .catch(() => null);
      const freshRaw = readCandyRaw(fresh);
      const freshSame = !freshRaw?.eventKey || normalizeId(freshRaw.eventKey) === ek;
      attemptOwned = freshSame ? normalizeOwnedIds(freshRaw?.owned) : [];
      if (attemptOwned.length >= total) break;
      const next = pickUniqueAwardIds(attemptOwned, 1)[0];
      if (!next) break;
      currentPick = next;
      ownedBefore = attemptOwned;
    }
    if (!claimed) break;
    const meta = getHalloweenCandyById(currentPick.id) || currentPick;
    awarded.push({
      id: meta.id,
      name: meta.name,
      imagePath: meta.imagePath,
      imageUrl: meta.imageUrl,
      isNew: true,
    });
    ownedBefore = normalizeOwnedIds(readCandyRaw(claimed)?.owned);
    doc = claimed;
    sameEvent = true; // after first successful claim, subsequent use $addToSet only
  }

  if (!awarded.length) {
    const owned = ownedBefore;
    return {
      ok: false,
      code: owned.length >= total ? "collection_complete" : "save_failed",
      eventKey: ek,
      reason,
      source,
      awarded: [],
      owned,
      ownedCount: owned.length,
      total,
      balance: safeInt(raw?.balance),
      firstAward: null,
      complete: owned.length >= total,
    };
  }

  const next = readCandyRaw(doc);
  const owned = normalizeOwnedIds(next?.owned);
  try {
    const { invalidateProfileCacheForUser } = require("../../Utils/Web/siteUsersLeaderboardApi");
    invalidateProfileCacheForUser(g, u);
  } catch {
    /* optional */
  }

  /* testGuildForceLive: sito legge sempre guild main → mirror caramelle sul main */
  try {
    const IDs = require("../../Utils/Config/ids");
    const { isHalloweenForceLiveOnTestGuild } = require("../../Utils/Web/halloweenEventConfig");
    const mainId = normalizeId(IDs.guilds?.main);
    const testId = normalizeId(IDs.guilds?.test);
    if (
      mainId &&
      testId &&
      g === testId &&
      g !== mainId &&
      isHalloweenForceLiveOnTestGuild(client, testId) &&
      awarded.length
    ) {
      for (const a of awarded) {
        await tryClaimCandyId({
          guildId: mainId,
          userId: u,
          eventKey: ek,
          candyId: a.id,
          resetOwned: false,
        }).catch(() => null);
      }
      try {
        const { invalidateProfileCacheForUser } = require("../../Utils/Web/siteUsersLeaderboardApi");
        invalidateProfileCacheForUser(mainId, u);
      } catch {
        /* optional */
      }
    }
  } catch (mirrorErr) {
    global.logger?.warn?.("[HALLOWEEN-CANDY] mirror test→main failed:", mirrorErr?.message || mirrorErr);
  }

  return {
    ok: true,
    balance: safeInt(next?.balance),
    amount: awarded.length,
    eventKey: ek,
    reason,
    source,
    awarded,
    owned,
    ownedCount: owned.length,
    total,
    firstAward: awarded[0] || null,
    complete: owned.length >= total,
  };
}

module.exports = {
  getHalloweenCandy,
  addHalloweenCandy,
  resolveEventKey,
  buildHalloweenCandyProfileSection,
  normalizeOwnedIds,
  getHalloweenCandyById,
};
