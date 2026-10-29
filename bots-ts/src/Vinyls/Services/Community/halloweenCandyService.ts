const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { resolveHalloweenEventConfig, isHalloweenEventLive } = require("../../Utils/Web/halloweenEventConfig") as typeof import("../../Utils/Web/halloweenEventConfig");
const {
  getHalloweenCandyById,
  halloweenCandyTotal,
  listHalloweenCandyCatalog,
  normalizeCandyId,
} = require("../../Utils/Web/halloweenCandyCatalog") as typeof import("../../Utils/Web/halloweenCandyCatalog");

const CANDY_PATH = "profile.events.halloween.candy";
const SITE_ORIGIN = "https://www.viniliecaffe.it";
const UNLOCK_EMBED_COLOR = 0xff7a18;
const UNLOCK_AUTHOR_ICON = `${SITE_ORIGIN}/images/halloween/tot-knock.gif`;
const HALLOWEEN_EMOJI_MARK = "<:VC_Halloween:1558964785113206824>";

function candyProgressBar(owned?, total?, width = 12) {
  const t = Math.max(1, Math.floor(Number(total) || 1));
  const o = Math.max(0, Math.min(t, Math.floor(Number(owned) || 0)));
  const filled = Math.round((o / t) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function candyFlavorLine(name?) {
  const n = String(name || "").trim();
  const lines = [
    n ? `Un pezzo raro di **${n}** finisce nel tuo sacchetto.` : "Una caramella nuova finisce nel tuo sacchetto.",
    n ? `La notte ti lascia **${n}**. Gustala piano.` : "La notte ti lascia un dolce. Gustalo piano.",
    n ? `Ecco **${n}** — brillante sotto la luna.` : "Ecco una caramella — brillante sotto la luna.",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function normalizeId(value?) {
  return String(value || "").trim();
}

function safeInt(value?, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function resolveEventKey(client?, eventKey = "") {
  const fromArg = normalizeId(eventKey);
  if (fromArg) return fromArg;
  return normalizeId(resolveHalloweenEventConfig(client)?.eventKey) || "halloween_2026";
}

function normalizeOwnedIds(raw?) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const id = normalizeCandyId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a?, b?) => Number(a) - Number(b));
  return out;
}

/** Solo tipi mancanti: mai doppioni. */
function pickUniqueAwardIds(ownedIds?, amount?) {
  const catalog = listHalloweenCandyCatalog();
  const owned = new Set(normalizeOwnedIds(ownedIds));
  const missing = catalog.filter((c?) => !owned.has(c.id));
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

function readCandyRaw(doc?) {
  return doc?.profile?.events?.halloween?.candy || null;
}

async function getHalloweenCandy(guildId?, userId?, eventKey = "") {
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

function buildHalloweenCandyProfileSection(raw?, client?, eventKey = "", opts: Record<string, any> = {}) {
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
    items: catalog.map((c?) => ({
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
  }).catch((err?) => {
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
    const { invalidateProfileCacheForUser } = require("../../Utils/Web/siteUsersLeaderboardApi") as typeof import("../../Utils/Web/siteUsersLeaderboardApi");
    invalidateProfileCacheForUser(g, u);
  } catch {
    /* optional */
  }

  /* testGuildForceLive: sito legge sempre guild main → mirror caramelle sul main */
  try {
    const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
    const { isHalloweenForceLiveOnTestGuild } = require("../../Utils/Web/halloweenEventConfig") as typeof import("../../Utils/Web/halloweenEventConfig");
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
        const { invalidateProfileCacheForUser } = require("../../Utils/Web/siteUsersLeaderboardApi") as typeof import("../../Utils/Web/siteUsersLeaderboardApi");
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

/**
 * Embed + pulsante profilo quando sblocchi una caramella (hunt / dolcetto).
 * @returns {{ embeds: import("discord.js").EmbedBuilder[], components: import("discord.js").ActionRowBuilder[] } | null}
 */
function buildHalloweenCandyUnlockPayload({ candyResult, userId, expGained = 0 } = {}) {
  const first = candyResult?.firstAward;
  const name = String(first?.name || "").trim();
  if (!name) return null;

  const owned = Math.max(0, Math.floor(Number(candyResult?.ownedCount) || 0));
  const total = Math.max(owned, Math.floor(Number(candyResult?.total) || halloweenCandyTotal() || 0));
  const imageUrl = String(first?.imageUrl || "").trim();
  const uid = normalizeId(userId);
  const exp = Math.max(0, Math.floor(Number(expGained) || 0));
  const bar = total > 0 ? candyProgressBar(owned, total) : "";
  const complete = total > 0 && owned >= total;

  const desc = [
    candyFlavorLine(name),
    "",
    total > 0
      ? `${HALLOWEEN_EMOJI_MARK} Collezione  **${owned}/${total}**\n\`${bar}\``
      : `${HALLOWEEN_EMOJI_MARK} Nuova caramella nella collezione profilo.`,
  ];
  if (exp > 0) desc.push("", `✨ +**${exp}** exp`);
  if (complete) desc.push("", "🎃 Collezione completa — che notte!");

  const embed = new EmbedBuilder()
    .setColor(UNLOCK_EMBED_COLOR)
    .setAuthor({ name: "Dolcetto!", iconURL: UNLOCK_AUTHOR_ICON })
    .setTitle(`Hai sbloccato ${name}!`)
    .setDescription(desc.join("\n"))
    .setFooter({ text: "Halloween · Vinili & Caffè" });
  if (imageUrl) embed.setThumbnail(imageUrl);

  const components = [];
  if (uid) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Vedi collezione")
          .setURL(`${SITE_ORIGIN}/user/?id=${encodeURIComponent(uid)}`),
      ),
    );
  }

  return { embeds: [embed], components };
}

/** Preferisci chi ha già ≥1 caramella incompleta; altrimenti un attivo (weekly/total exp). */
async function pickPassAlongTargetUserId(guildId?, excludeUserId?, eventKey?, total?) {
  const g = normalizeId(guildId);
  const exclude = normalizeId(excludeUserId);
  const ek = normalizeId(eventKey) || "halloween_2026";
  const tot = Math.max(1, Math.floor(Number(total) || halloweenCandyTotal()));

  const collectorDocs = await ActivityUserProfile.find({
    guildId: g,
    [`${CANDY_PATH}.eventKey`]: ek,
    [`${CANDY_PATH}.owned.0`]: { $exists: true },
  })
    .select(`userId ${CANDY_PATH}`)
    .lean()
    .limit(300)
    .catch(() => []);

  const collectors = [];
  for (const doc of Array.isArray(collectorDocs) ? collectorDocs : []) {
    const uid = normalizeId(doc?.userId);
    if (!uid || uid === exclude) continue;
    const owned = normalizeOwnedIds(readCandyRaw(doc)?.owned);
    if (owned.length < 1 || owned.length >= tot) continue;
    collectors.push(uid);
  }
  if (collectors.length) {
    return {
      userId: collectors[Math.floor(Math.random() * collectors.length)],
      mode: "collector",
    };
  }

  // Nessun collezionista incompleto → tra i più attivi (weekly, poi total), random nel top
  const activeDocs = await ActivityUserProfile.find({
    guildId: g,
    userId: { $ne: exclude },
    $or: [
      { "profile.totals.exp.weeklyExp": { $gt: 0 } },
      { "profile.totals.exp.totalExp": { $gt: 0 } },
      { "profile.totals.messagesTotal": { $gt: 0 } },
    ],
  })
    .select(
      `userId ${CANDY_PATH} profile.totals.exp.weeklyExp profile.totals.exp.totalExp profile.totals.messagesTotal`,
    )
    .sort({
      "profile.totals.exp.weeklyExp": -1,
      "profile.totals.exp.totalExp": -1,
      "profile.totals.messagesTotal": -1,
    })
    .limit(100)
    .lean()
    .catch(() => []);

  const actives = [];
  for (const doc of Array.isArray(activeDocs) ? activeDocs : []) {
    const uid = normalizeId(doc?.userId);
    if (!uid || uid === exclude) continue;
    const raw = readCandyRaw(doc);
    const sameEvent = !raw?.eventKey || normalizeId(raw.eventKey) === ek;
    const owned = sameEvent ? normalizeOwnedIds(raw?.owned) : [];
    if (owned.length >= tot) continue;
    actives.push(uid);
  }
  if (!actives.length) return null;

  const poolSize = Math.min(25, actives.length);
  const pool = actives.slice(0, poolSize);
  return {
    userId: pool[Math.floor(Math.random() * pool.length)],
    mode: "active_random",
  };
}

/**
 * Se il vincitore ha già la collezione completa, passa la caramella
 * a un altro utente: prima chi ha ≥1 caramella e non è completo,
 * altrimenti una persona attiva a caso (top weekly/total exp).
 */
async function passAlongHalloweenCandy({
  guildId,
  excludeUserId,
  amount = 1,
  eventKey = "",
  reason = "pass_along",
  source = "pass_along",
  client = null,
} = {}) {
  const g = normalizeId(guildId);
  const exclude = normalizeId(excludeUserId);
  const ek = normalizeId(eventKey) || "halloween_2026";
  const amt = Math.max(1, Math.floor(Number(amount) || 1));
  const total = halloweenCandyTotal();
  if (!g || !exclude) return { ok: false, code: "bad_input", total };

  const pick = await pickPassAlongTargetUserId(g, exclude, ek, total);
  if (!pick?.userId) return { ok: false, code: "no_pass_target", total };

  const targetUserId = pick.userId;
  const result = await addHalloweenCandy({
    guildId: g,
    userId: targetUserId,
    amount: amt,
    eventKey: ek,
    reason: reason || "pass_along",
    source: source || "pass_along",
    client,
  });
  if (!result?.ok) return result || { ok: false, code: "pass_failed", total };
  return {
    ...result,
    code: "passed_along",
    passedFromUserId: exclude,
    passedToUserId: targetUserId,
    passAlongMode: pick.mode || "collector",
    winnerComplete: true,
  };
}

/** Premia; se collezione completa, redistribuisce a un altro collezionista incompleto. */
async function addHalloweenCandyWithPassAlong(opts: Record<string, any> = {}) {
  const result = await addHalloweenCandy(opts);
  if (result?.ok) return result;
  if (result?.code !== "collection_complete") return result;
  const passed = await passAlongHalloweenCandy({
    guildId: opts.guildId,
    excludeUserId: opts.userId,
    amount: opts.amount || 1,
    eventKey: opts.eventKey,
    reason: opts.reason,
    source: opts.source,
    client: opts.client,
  });
  if (passed?.ok) return passed;
  return result;
}

export = {
  getHalloweenCandy,
  addHalloweenCandy,
  addHalloweenCandyWithPassAlong,
  passAlongHalloweenCandy,
  resolveEventKey,
  buildHalloweenCandyProfileSection,
  buildHalloweenCandyUnlockPayload,
  normalizeOwnedIds,
  getHalloweenCandyById,
};
