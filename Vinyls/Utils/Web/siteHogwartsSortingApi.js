const IDs = require("../Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { getPublicQuestions, normalizeAnswers, computeHouseFromAnswers, getHouseMeta, HOUSES } = require("./hogwartsSortingBank");
const { resolveHogwartsEventConfig, isEventWindowOpen, resolveEventWindowForViewer, formatEventWindowIt } = require("./hogwartsSortingConfig");
const {
  addGaleoni,
  awardHogwartsSortingReward,
  getGringottBalance,
  spendGaleoni,
  toPublicGringottPayload,
} = require("../../Services/Community/gringottService");
const { getShopItemById, normalizeShopCategory, publicShopCatalog, resolveShopPurchaseOffer } = require("./hogwartsShopCatalog");
const { getConsumableById, normalizeConsumableCategory, publicConsumablesCatalog } = require("./hogwartsShopConsumablesCatalog");
const {
  economyConsumablesLockMessage,
  getActiveConsumableBoosts,
  isEconomyConsumablesUnlocked,
  loadGuildConsumableBoosts,
  publicActiveBoostsPayload,
  publicConsumablesCatalogWithAvailability,
  purchaseAndActivateConsumable,
} = require("../../Services/Community/hogwartsConsumableBoostsService");
const { buildPotionsRound, normalizePotionId } = require("./hogwartsPotionsCatalog");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const {
  FORBIDDEN_DOC,
  FORBIDDEN_BOOK_IDS,
  normalizeForbiddenBookId,
  forbiddenEventDedupeKey,
  forbiddenEventOpen,
  canPreviewForbiddenBooks,
  forbiddenProgressPayload,
  getForbiddenClosure,
  getForbiddenUserDoc,
  resolveForbiddenBooksSchedule,
} = require("../../Services/Community/hogwartsForbiddenBooksService");
const POTIONS_PROFILE_PATH = "profile.events.hogwarts.potions";
const POTIONS_DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  startDate: "2026-08-24T12:00:00",
  cooldownMs: 12 * 60 * 60 * 1000,
  rewardGaleoni: 10,
  rewardHousePoints: 10,
  roundSize: 4,
});
const { housePointPeriodKey: resolveHousePointPeriod } = require("./hogwartsHousePointPeriods");
const {
  assertHogwartsEventParticipationForUser,
  hasHogwartsSortingPreviewAccess,
  isHogwartsStaffPreviewViewer,
  HOGWARTS_EXCLUDED_STAFF_ROLE_IDS,
  memberIsHogwartsExcludedStaff,
} = require("./hogwartsEventParticipation");
const { markHogwartsProfileRetainedUntil } = require("../../Services/Community/hogwartsLeaveRetention");

async function gateHogwartsEventParticipation(client, resolved, cfg) {
  if (isHogwartsStaffPreviewViewer(cfg, resolved.member, resolved.userId)) {
    return {
      ok: true,
      windowState: resolveEventWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId),
      previewStaff: true,
    };
  }
  const participation = await assertHogwartsEventParticipationForUser(
    client,
    resolved.member,
    resolved.userId,
  );
  if (!participation.ok) return participation;
  const windowState = isEventWindowOpen(cfg, Date.now(), resolved.userId);
  if (windowState.open) return { ok: true, windowState };
  if (!cfg.previewMode) {
    return {
      ok: false,
      status: 403,
      error: "event_closed",
      message: "Questa sezione dell'evento Hogwarts non è disponibile.",
    };
  }
  return {
    ok: false,
    status: 403,
    error: "preview_forbidden",
    message: "In anteprima questa sezione è riservata all'High Staff del server.",
  };
}

function houseMetaFromCfg(cfg, houseId) {
  const id = String(houseId || "").trim();
  const crestUrl = String(cfg?.houses?.[id]?.crestUrl || "").trim();
  return getHouseMeta(id, crestUrl || undefined);
}

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function buildEventPayload(cfg, windowState) {
  return {
    enabled: Boolean(cfg.enabled),
    previewMode: Boolean(cfg.previewMode),
    timezone: cfg.timezone,
    startDate: cfg.startDate,
    endDate: cfg.endDate,
    eventKey: cfg.eventKey,
    gringott: {
      bank: "Gringott",
      currency: "Galeone d'Oro",
      currencyPlural: "Galeoni d'Oro",
      sortingReward: Number(cfg.gringott?.sortingReward || 0),
    },
    windowLabel: formatEventWindowIt(cfg),
    phase: windowState.phase,
    open: Boolean(windowState.open),
    startsAtMs: windowState.startsAtMs || null,
    endsAtMs: windowState.endsAtMs || null,
  };
}

async function findExistingSort(guildId, userId, eventKey) {
  return SiteDocument.findOne({
    docType: DOC,
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    dedupeKey: String(eventKey || ""),
  })
    .lean()
    .catch(() => null);
}

async function assignHouseRoles(member, cfg, houseId) {
  const houseRoleId = String(cfg.houses?.[houseId]?.roleId || "").trim();
  const participantRoleId = String(cfg.completionRoleId || "").trim();
  const otherRoleIds = HOUSES.map((h) => String(cfg.houses?.[h]?.roleId || "").trim()).filter(
    (id) => id && id !== houseRoleId,
  );
  const toAdd = [];
  if (houseRoleId && !member.roles.cache.has(houseRoleId)) toAdd.push(houseRoleId);
  if (participantRoleId && !member.roles.cache.has(participantRoleId)) toAdd.push(participantRoleId);
  const toRemove = otherRoleIds.filter((id) => member.roles.cache.has(id));
  if (!toAdd.length && !toRemove.length) {
    return { roleAssigned: false, roleSkippedReason: "roles_not_configured" };
  }
  try {
    if (toRemove.length) await member.roles.remove(toRemove, "Smistamento Evento");
    if (toAdd.length) await member.roles.add(toAdd, "Smistamento Evento");
    return {
      roleAssigned: Boolean(houseRoleId),
      roleId: houseRoleId || null,
      participantRoleAssigned: Boolean(participantRoleId && member.roles.cache.has(participantRoleId)),
      participantRoleId: participantRoleId || null,
    };
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting] assign roles:", err?.message || err);
    return { roleAssigned: false, roleError: String(err?.message || err).slice(0, 200) };
  }
}

async function commitHogwartsSortingSideEffects({ client, resolved, cfg, houseId, computed, answerCount }) {
  const roleResult = { roleAssigned: false, roleQueued: true };
  await SiteDocument.create({
    docType: DOC,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    dedupeKey: cfg.eventKey,
    status: houseId,
    planKey: houseId,
    createdBy: "site",
    rawWebhook: {
      totals: computed.totals,
      decisive: computed.decisive,
      answerCount,
      roleResult,
    },
  }).catch((err) => {
    if (String(err?.code) === "11000") return null;
    throw err;
  });
  const gringottAward = await awardHogwartsSortingReward(client, resolved.guild.id, resolved.userId, "site");
  await markHogwartsProfileRetainedUntil(resolved.guild.id, resolved.userId, client);
  void assignHouseRoles(resolved.member, cfg, houseId).catch((err) => {
    global.logger?.warn?.("[hogwarts-sorting] queued role assignment:", err?.message || err);
  });
  return { gringottAward };
}

async function handleHogwartsSortingBootstrap(client, req, res) {
  try {
    const cfg = resolveHogwartsEventConfig(client);
    const windowState = isEventWindowOpen(cfg, Date.now(), null);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({
      ok: true,
      event: buildEventPayload(cfg, windowState),
      questions: getPublicQuestions(),
      houses: HOUSES.map((id) => houseMetaFromCfg(cfg, id)),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting bootstrap:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsSortingEligibility(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }
    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }
    const cfg = resolveHogwartsEventConfig(client);
    if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
  const windowState = resolveEventWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId);
    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
    const houseId = existing?.status ? String(existing.status).trim() : "";
    const meta = houseId ? houseMetaFromCfg(cfg, houseId) : null;
    const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      event: buildEventPayload(cfg, windowState),
      canSort: Boolean(windowState.open) && !houseId,
      alreadySorted: Boolean(houseId),
      house: houseId || null,
      houseMeta: meta,
      gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
      message: !windowState.open
        ? windowState.phase === "before_start"
          ? `Lo smistamento aprirà ${formatEventWindowIt(cfg) || "a breve"}.`
          : windowState.phase === "after_end"
            ? "L'evento Hogwarts è terminato."
            : "Smistamento non disponibile al momento."
        : houseId
          ? `Sei già stato smistato in ${meta?.label || houseId}.`
          : "",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting eligibility:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsSortingSubmit(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const answers = normalizeAnswers(body.answers);
    if (!answers) {
      return res.status(400).json({
        ok: false,
        error: "invalid_answers",
        message: "Risposte non valide: invia tutte le domande del quiz.",
      });
    }

    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }

    const cfg = resolveHogwartsEventConfig(client);
    if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
    const windowState = resolveEventWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId);
    if (!windowState.open) {
      return res.status(403).json({
        ok: false,
        error: "event_closed",
        message:
          windowState.phase === "before_start"
            ? `Lo smistamento non è ancora aperto. ${formatEventWindowIt(cfg) || ""}`.trim()
            : "Lo smistamento non è disponibile in questo momento.",
        event: buildEventPayload(cfg, windowState),
      });
    }

    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
    if (existing?.status) {
      const meta = houseMetaFromCfg(cfg, existing.status);
      const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
      return res.status(200).json({
        ok: true,
        alreadySorted: true,
        message: `Hai già completato lo smistamento (${meta?.label || existing.status}).`,
        house: String(existing.status),
        houseMeta: meta,
        gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
      });
    }

    const computed = computeHouseFromAnswers(answers);
    if (!computed.ok) {
      return res.status(400).json({
        ok: false,
        error: computed.error || "invalid_answers",
        message: "Alcune risposte non sono valide. Ricarica la pagina e riprova.",
      });
    }

    const houseId = computed.house;
    const meta = houseMetaFromCfg(cfg, houseId);
    const sideEffects = await commitHogwartsSortingSideEffects({
      client,
      resolved,
      cfg,
      houseId,
      computed,
      answerCount: answers.length,
    });
    const gringottState =
      sideEffects?.gringottAward?.state ||
      (await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey));
    const sortingReward = Math.max(0, Math.floor(Number(cfg.gringott?.sortingReward) || 0));

    return res.status(200).json({
      ok: true,
      house: houseId,
      houseMeta: meta,
      roleAssigned: false,
      roleQueued: true,
      gringott: toPublicGringottPayload(gringottState || { eventKey: cfg.eventKey }),
      message: meta
        ? `Il Cappello Parlante ti assegna ${meta.label}! Ruolo Discord in assegnazione e ${sortingReward} Galeoni accreditati.`
        : "Smistamento completato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting submit:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsGringottGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }
    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }
    const cfg = resolveHogwartsEventConfig(client);
    const gate = await gateHogwartsEventParticipation(client, resolved, cfg);
    if (!gate.ok) return res.status(gate.status || 403).json(gate);
    const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-gringott:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function normalizeShopInventory(raw) {
  const items = raw?.items && typeof raw.items === "object" ? raw.items : {};
  const out = { wand: null, broom: null, pet: null };
  for (const category of Object.keys(out)) {
    const row = items[category] && typeof items[category] === "object" ? items[category] : null;
    if (!row?.id) continue;
    const item = getShopItemById(row.id);
    if (!item || item.category !== category) continue;
    out[category] = {
      ...item,
      purchasedAt: row.purchasedAt || null,
      pricePaid: Math.max(0, Math.floor(Number(row.pricePaid) || item.price || 0)),
    };
  }
  return out;
}

async function getShopProfileState(guildId, userId, eventKey) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select("profile.events.hogwarts.shop profile.events.hogwarts.gringott")
    .lean()
    .catch(() => null);
  const gringott = await getGringottBalance(guildId, userId, eventKey);
  return {
    inventory: normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop),
    gringott: toPublicGringottPayload(gringott || { eventKey }),
  };
}

async function resolveShopParticipant(client, req) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ok: false, status: Number(resolved.status) || 500, ...resolved };
  const cfg = resolveHogwartsEventConfig(client);
  const gate = await gateHogwartsEventParticipation(client, resolved, cfg);
  if (!gate.ok) return gate;
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  const previewViewer = isHogwartsStaffPreviewViewer(cfg, resolved.member, resolved.userId) && !houseId;
  if (!houseId && !previewViewer) {
    return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per accedere allo shop." };
  }
  if (!houseId) {
    return { ok: true, resolved, cfg, houseId: "", houseMeta: null, previewViewer: true };
  }
  return { ok: true, resolved, cfg, houseId, houseMeta: houseMetaFromCfg(cfg, houseId), previewViewer: false };
}

async function handleHogwartsShopGet(client, req, res) {
  try {
    const participant = await resolveShopParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, houseId, houseMeta, previewViewer } = participant;
    const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    const consumablesUnlocked = isEconomyConsumablesUnlocked(client);
    const consumablesPreviewVisible = !consumablesUnlocked && Boolean(cfg.previewMode && hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId));
    const activeBoostsRaw = houseId
      ? await getActiveConsumableBoosts(client, resolved.guild.id, resolved.userId, houseId)
      : { housePoints: {}, exp: {} };
    const activeBoosts = publicActiveBoostsPayload(activeBoostsRaw);
    const guildBoosts = await loadGuildConsumableBoosts(client, resolved.guild.id);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      previewViewer: Boolean(previewViewer),
      house: houseId,
      houseMeta,
      catalog: publicShopCatalog(),
      consumables: publicConsumablesCatalogWithAvailability(publicConsumablesCatalog(), activeBoostsRaw, guildBoosts),
      consumablesUnlocked,
      consumablesPreviewVisible,
      consumablesLockedMessage: consumablesUnlocked ? "" : economyConsumablesLockMessage(client),
      activeBoosts,
      inventory: state.inventory,
      gringott: state.gringott,
      previewDisabled: Boolean(previewViewer),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-shop get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsShopPurchasePost(client, req, res) {
  try {
    const participant = await resolveShopParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
  if (participant.previewViewer) {
      return res.status(403).json({
        ok: false,
        error: "preview_forbidden",
        message: "In anteprima puoi solo consultare lo shop. Completa lo smistamento per acquistare.",
      });
    }
    const { resolved, cfg, houseId, houseMeta } = participant;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const consumable = getConsumableById(body.itemId);
    if (consumable) {
      if (!isEconomyConsumablesUnlocked(client)) {
        return res.status(403).json({
          ok: false,
          error: "economy_locked",
          message: economyConsumablesLockMessage(client),
        });
      }
      const category = normalizeConsumableCategory(body.category || consumable.category);
      if (!category || consumable.category !== category) {
        return res.status(400).json({ ok: false, error: "invalid_item", message: "Boost consumabile non valido." });
      }
      const buyerDisplayName = resolved.member?.displayName || resolved.member?.user?.globalName || resolved.member?.user?.username || "Studente";
      const result = await purchaseAndActivateConsumable(client, {
        guildId: resolved.guild.id,
        userId: resolved.userId,
        houseId,
        itemId: consumable.id,
        eventKey: cfg.eventKey,
        buyerDisplayName,
        houseLabel: houseMeta?.label || houseMeta?.name || "",
      });
      const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
      const guildBoosts = await loadGuildConsumableBoosts(client, resolved.guild.id);
      const buildConsumablesPayload = async () => {
        const activeBoostsRaw = await getActiveConsumableBoosts(client, resolved.guild.id, resolved.userId, houseId);
        return {
          activeBoosts: publicActiveBoostsPayload(activeBoostsRaw),
          consumables: publicConsumablesCatalogWithAvailability(publicConsumablesCatalog(), activeBoostsRaw, guildBoosts),
        };
      };
      if (!result.ok) {
        const boostPayload = await buildConsumablesPayload();
        return res.status(result.code === "insufficient_funds" || result.code === "boost_active" ? 409 : 403).json({
          ok: false,
          error: result.code || "purchase_denied",
          message: result.message || "Attivazione non consentita.",
          inventory: state.inventory,
          gringott: state.gringott,
          activeBoosts: boostPayload.activeBoosts,
          consumables: boostPayload.consumables,
        });
      }
      const boostPayload = result.activeBoosts
        ? {
            activeBoosts: publicActiveBoostsPayload(result.activeBoosts),
            consumables: publicConsumablesCatalogWithAvailability(publicConsumablesCatalog(), result.activeBoosts, guildBoosts),
          }
        : await buildConsumablesPayload();
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        consumable: true,
        activated: result.item,
        expiresAt: result.expiresAt,
        house: houseId,
        houseMeta,
        inventory: state.inventory,
        gringott: state.gringott,
        activeBoosts: boostPayload.activeBoosts,
        consumables: boostPayload.consumables,
        message: result.message,
      });
    }
    const item = getShopItemById(body.itemId);
    const category = normalizeShopCategory(body.category || item?.category);
    if (!item || !category || item.category !== category) {
      return res.status(400).json({ ok: false, error: "invalid_item", message: "Oggetto shop non valido." });
    }
    const stateBefore = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    const ownedRow = stateBefore.inventory[category];
    const offer = resolveShopPurchaseOffer(ownedRow, item);
    if (!offer.ok) {
      return res.status(409).json({
        ok: false,
        error: offer.code || "purchase_denied",
        message: offer.message || "Acquisto non consentito.",
        inventory: stateBefore.inventory,
        gringott: stateBefore.gringott,
      });
    }
    const amountToPay = Math.max(0, Math.floor(Number(offer.amount) || 0));
    const current = stateBefore.gringott || (await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey));
    const balance = Math.max(0, Math.floor(Number(current?.balance) || 0));
    if (balance < amountToPay) {
      return res.status(409).json({
        ok: false,
        error: "insufficient_funds",
        message: offer.mode === "upgrade"
          ? "Non hai abbastanza Galeoni per migliorare questo oggetto."
          : "Non hai abbastanza Galeoni per acquistare questo oggetto.",
        gringott: toPublicGringottPayload(current || { eventKey: cfg.eventKey }),
        inventory: stateBefore.inventory,
      });
    }
    const now = new Date();
    const itemPath = `profile.events.hogwarts.shop.items.${category}`;
    const purchase = {
      id: item.id,
      category,
      pricePaid: item.price,
      purchasedAt: now,
    };
    const isUpgrade = offer.mode === "upgrade";
    const previousPurchase = isUpgrade && ownedRow?.id
      ? { id: ownedRow.id, category, pricePaid: ownedRow.pricePaid, purchasedAt: ownedRow.purchasedAt }
      : null;
    const filter = isUpgrade
      ? { guildId: resolved.guild.id, userId: resolved.userId, [`${itemPath}.id`]: offer.replacesId }
      : { guildId: resolved.guild.id, userId: resolved.userId, [`${itemPath}.id`]: { $exists: false } };
    const reserved = await ActivityUserProfile.findOneAndUpdate(
      filter,
      {
        $set: {
          [itemPath]: purchase,
          "profile.events.hogwarts.shop.eventKey": cfg.eventKey,
          "profile.events.hogwarts.shop.updatedAt": now,
        },
        $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
      },
      { new: true, upsert: !isUpgrade, setDefaultsOnInsert: true },
    ).catch(() => null);
    if (!reserved) {
      const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
      return res.status(409).json({
        ok: false,
        error: isUpgrade ? "upgrade_conflict" : "already_owned",
        message: isUpgrade
          ? "Impossibile completare il miglioramento. Ricarica lo shop e riprova."
          : "Hai già un oggetto per questa categoria.",
        inventory: state.inventory,
        gringott: state.gringott,
      });
    }
    const payment = await spendGaleoni({
      guildId: resolved.guild.id,
      userId: resolved.userId,
      amount: amountToPay,
      reason: isUpgrade ? `Shop Hogwarts: migliora ${item.name}` : `Shop Hogwarts: ${item.name}`,
      actorId: "site",
      source: "hogwarts_shop",
      eventKey: cfg.eventKey,
    });
    if (!payment?.ok) {
      const rollback = previousPurchase
        ? { $set: { [itemPath]: previousPurchase, "profile.events.hogwarts.shop.updatedAt": new Date() } }
        : { $unset: { [itemPath]: "" }, $set: { "profile.events.hogwarts.shop.updatedAt": new Date() } };
      await ActivityUserProfile.updateOne(
        { guildId: resolved.guild.id, userId: resolved.userId },
        rollback,
      ).catch(() => null);
      const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
      return res.status(409).json({
        ok: false,
        error: payment?.code || "payment_failed",
        message: payment?.code === "insufficient_funds"
          ? (isUpgrade ? "Non hai abbastanza Galeoni per migliorare questo oggetto." : "Non hai abbastanza Galeoni per acquistare questo oggetto.")
          : "Acquisto non completato. Riprova tra poco.",
        inventory: state.inventory,
        gringott: state.gringott,
      });
    }
    const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    const prevName = previousPurchase ? getShopItemById(previousPurchase.id)?.name : "";
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      purchased: state.inventory[category],
      house: houseId,
      houseMeta,
      inventory: state.inventory,
      gringott: state.gringott,
      upgraded: isUpgrade,
      message: isUpgrade
        ? `${item.name} equipaggiato al posto di ${prevName || "l'oggetto precedente"}.`
        : `${item.name} acquistato con successo.`,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-shop purchase:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolvePotionsConfig(client) {
  const raw = client?.config?.hogwartsPotions && typeof client.config.hogwartsPotions === "object" ? client.config.hogwartsPotions : {};
  const out = { ...POTIONS_DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.startDate = String(out.startDate || POTIONS_DEFAULT_CONFIG.startDate).trim();
  out.startMs = new Date(out.startDate).getTime();
  out.cooldownMs = safeInt(out.cooldownMs, POTIONS_DEFAULT_CONFIG.cooldownMs, 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000);
  out.rewardGaleoni = safeInt(out.rewardGaleoni, POTIONS_DEFAULT_CONFIG.rewardGaleoni, 0, 1000);
  out.rewardHousePoints = safeInt(out.rewardHousePoints, POTIONS_DEFAULT_CONFIG.rewardHousePoints, 0, 1000);
  out.roundSize = safeInt(out.roundSize, POTIONS_DEFAULT_CONFIG.roundSize, 2, 8);
  out.pageUrl = String(out.pageUrl || "/evento/pozioni").trim() || "/evento/pozioni";
  return out;
}

function potionsOpen(potionsCfg, nowMs = Date.now()) {
  return Boolean(potionsCfg?.enabled) && Number.isFinite(Number(potionsCfg.startMs)) && Number(nowMs || Date.now()) >= Number(potionsCfg.startMs);
}

function canPreviewPotions(cfg, member, userId) {
  return isHogwartsStaffPreviewViewer(cfg, member, userId);
}

function publicPotionsState(raw, potionsCfg) {
  const state = raw && typeof raw === "object" ? raw : {};
  const nextMs = new Date(state.nextAvailableAt || 0).getTime();
  const now = Date.now();
  return {
    lastPlayedAt: state.lastPlayedAt || null,
    nextAvailableAt: Number.isFinite(nextMs) && nextMs > now ? state.nextAvailableAt : null,
    available: !(Number.isFinite(nextMs) && nextMs > now),
    totalBrews: Math.max(0, Math.floor(Number(state.totalBrews) || 0)),
    successfulBrews: Math.max(0, Math.floor(Number(state.successfulBrews) || 0)),
    bestScore: Math.max(0, Math.floor(Number(state.bestScore) || 0)),
    cooldownMs: potionsCfg.cooldownMs,
  };
}

async function resolvePotionsParticipant(client, req) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ok: false, status: Number(resolved.status) || 500, ...resolved };
  const cfg = resolveHogwartsEventConfig(client);
  const potionsCfg = resolvePotionsConfig(client);
  const previewViewer = canPreviewPotions(cfg, resolved.member, resolved.userId);
  if (!previewViewer) {
    const participation = await assertHogwartsEventParticipationForUser(
      client,
      resolved.member,
      resolved.userId,
    );
    if (!participation.ok) return participation;
    if (!potionsOpen(potionsCfg)) {
      return {
        ok: false,
        status: 403,
        error: "event_not_started",
        message: "La classe di pozioni non è ancora aperta.",
        startsAt: potionsCfg.startDate,
        redirectUrl: potionsCfg.redirectUrl || "/evento/shop",
      };
    }
  }
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  if (!houseId && previewViewer) {
    return { ok: true, resolved, cfg, potionsCfg, houseId: "", houseMeta: null, previewViewer: true };
  }
  if (!houseId) return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per accedere alle pozioni." };
  return { ok: true, resolved, cfg, potionsCfg, houseId, houseMeta: houseMetaFromCfg(cfg, houseId), previewViewer: false };
}

function makePotionRoundKey(userId) {
  return `${Date.now().toString(36)}_${String(userId || "").slice(-6)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePotionPreviewRoundKey(userId) {
  return `preview:${String(userId || "staff")}:${new Date().toISOString().slice(0, 10)}`;
}

async function ensurePotionsRound(guildId, userId, eventKey, potionsCfg) {
  const now = Date.now();
  let doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select(POTIONS_PROFILE_PATH)
    .lean()
    .catch(() => null);
  const state = doc?.profile?.events?.hogwarts?.potions && typeof doc.profile.events.hogwarts.potions === "object" ? doc.profile.events.hogwarts.potions : {};
  const nextMs = new Date(state.nextAvailableAt || 0).getTime();
  const available = !(Number.isFinite(nextMs) && nextMs > now);
  if (!available) return { state, round: null };
  const activeRoundKey = String(state.activeRoundKey || "").trim();
  if (activeRoundKey) return { state, round: buildPotionsRound(activeRoundKey, potionsCfg.roundSize) };
  const activeSeed = `${String(eventKey || "hogwarts")}:potions:${userId}:${makePotionRoundKey(userId)}`;
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: {
        [`${POTIONS_PROFILE_PATH}.eventKey`]: eventKey,
        [`${POTIONS_PROFILE_PATH}.activeRoundKey`]: activeSeed,
        [`${POTIONS_PROFILE_PATH}.activeRoundCreatedAt`]: new Date(),
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select(POTIONS_PROFILE_PATH)
    .lean()
    .catch(() => null);
  const updatedState = doc?.profile?.events?.hogwarts?.potions && typeof doc.profile.events.hogwarts.potions === "object" ? doc.profile.events.hogwarts.potions : {};
  return { state: updatedState, round: buildPotionsRound(activeSeed, potionsCfg.roundSize) };
}

function normalizePotionAnswers(body) {
  const raw = body?.answers && typeof body.answers === "object" ? body.answers : {};
  const out = {};
  for (const [potionId, effectPotionId] of Object.entries(raw)) {
    const p = normalizePotionId(potionId);
    const e = normalizePotionId(effectPotionId);
    if (p && e) out[p] = e;
  }
  return out;
}

function housePointPeriodKey(nowMs = Date.now()) {
  const period = resolveHousePointPeriod(nowMs);
  return period?.key || "";
}

async function awardPotionsHousePoints(client, guildId, userId, houseId, eventKey, points) {
  const base = safeInt(points, 0, 0, 1000);
  const house = String(houseId || "").trim();
  if (!base || !HOUSES.includes(house)) return null;
  const { applyPetHousePointsBoost } = require("../../Services/Community/hogwartsShopBoostsService");
  const boosted = await applyPetHousePointsBoost(client, guildId, userId, base);
  const amount = Math.max(0, Math.floor(Number(boosted?.points) || 0));
  if (amount <= 0) return null;
  const now = new Date();
  const periodKey = housePointPeriodKey(now.getTime());
  const inc = {
    "rawWebhook.byGame.potions": amount,
    "rawWebhook.total": amount,
    [`rawWebhook.totals.${house}`]: amount,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${house}`] = amount;
  await SiteDocument.findOneAndUpdate(
    { docType: HOUSE_POINTS_DOC, guildId: String(guildId || ""), userId: HOUSE_POINTS_OWNER_ID, dedupeKey: String(eventKey || "hogwarts") },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: String(guildId || ""),
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: String(eventKey || "hogwarts"),
        createdBy: "hogwarts_potions",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": String(eventKey || "hogwarts"),
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { houseId: house, points: amount };
}

async function handleHogwartsPotionsGet(client, req, res) {
  try {
    const participant = await resolvePotionsParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, potionsCfg, houseId, houseMeta, previewViewer } = participant;
    const previewRound = previewViewer ? buildPotionsRound(makePotionPreviewRoundKey(resolved.userId), potionsCfg.roundSize) : null;
    const { state, round } = previewViewer
      ? { state: {}, round: previewRound }
      : await ensurePotionsRound(resolved.guild.id, resolved.userId, cfg.eventKey, potionsCfg);
    const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      previewViewer: Boolean(previewViewer),
      house: houseId,
      houseMeta,
      potions: publicPotionsState(state, potionsCfg),
      reward: {
        galeoni: previewViewer ? 0 : potionsCfg.rewardGaleoni,
        housePoints: previewViewer ? 0 : potionsCfg.rewardHousePoints,
        previewDisabled: Boolean(previewViewer),
      },
      round,
      gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-potions get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsPotionsPost(client, req, res) {
  try {
    const participant = await resolvePotionsParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, potionsCfg, houseId, houseMeta, previewViewer } = participant;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const roundKey = String(body.roundKey || "").trim();
    const answers = normalizePotionAnswers(body);
    const now = new Date();
    if (previewViewer) {
      const expectedRoundKey = makePotionPreviewRoundKey(resolved.userId);
      if (!roundKey || roundKey !== expectedRoundKey) {
        return res.status(409).json({ ok: false, error: "stale_round", message: "Round preview non valido. Ricarica la pagina e riprova." });
      }
      const round = buildPotionsRound(roundKey, potionsCfg.roundSize);
      const requiredIds = round.potions.map((item) => item.id);
      let correct = 0;
      const results = {};
      for (const potionId of requiredIds) {
        const ok = answers[potionId] === potionId;
        if (ok) correct += 1;
        results[potionId] = { selected: answers[potionId] || "", correct: potionId, ok };
      }
      const total = requiredIds.length;
      const success = total > 0 && correct === total;
      const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        previewViewer: true,
        success,
        score: { correct, total },
        results,
        house: houseId,
        houseMeta,
        reward: { galeoni: 0, housePoints: 0, previewDisabled: true },
        potions: publicPotionsState({}, potionsCfg),
        gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
        message: success
          ? "Preview completata: nessun premio reale assegnato."
          : `Preview: hai indovinato ${correct}/${total}. Nessun cooldown applicato.`,
      });
    }
    const existing = await ActivityUserProfile.findOne({ guildId: resolved.guild.id, userId: resolved.userId })
      .select(POTIONS_PROFILE_PATH)
      .lean()
      .catch(() => null);
    const state = existing?.profile?.events?.hogwarts?.potions && typeof existing.profile.events.hogwarts.potions === "object" ? existing.profile.events.hogwarts.potions : {};
    const nextMs = new Date(state.nextAvailableAt || 0).getTime();
    if (Number.isFinite(nextMs) && nextMs > Date.now()) {
      return res.status(409).json({ ok: false, error: "cooldown", message: "Hai già completato il minigioco. Torna quando il cooldown è finito.", potions: publicPotionsState(state, potionsCfg) });
    }
    if (!roundKey || roundKey !== String(state.activeRoundKey || "")) {
      return res.status(409).json({ ok: false, error: "stale_round", message: "Round non valido o scaduto. Ricarica la pagina e riprova." });
    }
    const round = buildPotionsRound(roundKey, potionsCfg.roundSize);
    const requiredIds = round.potions.map((item) => item.id);
    let correct = 0;
    const results = {};
    for (const potionId of requiredIds) {
      const ok = answers[potionId] === potionId;
      if (ok) correct += 1;
      results[potionId] = { selected: answers[potionId] || "", correct: potionId, ok };
    }
    const total = requiredIds.length;
    const success = total > 0 && correct === total;
    const nextAvailableAt = new Date(now.getTime() + potionsCfg.cooldownMs);
    const reserved = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId: resolved.guild.id,
        userId: resolved.userId,
        [`${POTIONS_PROFILE_PATH}.activeRoundKey`]: roundKey,
        $or: [
          { [`${POTIONS_PROFILE_PATH}.nextAvailableAt`]: { $exists: false } },
          { [`${POTIONS_PROFILE_PATH}.nextAvailableAt`]: { $lte: now } },
          { [`${POTIONS_PROFILE_PATH}.nextAvailableAt`]: null },
        ],
      },
      {
        $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
        $set: {
          [`${POTIONS_PROFILE_PATH}.eventKey`]: cfg.eventKey,
          [`${POTIONS_PROFILE_PATH}.lastPlayedAt`]: now,
          [`${POTIONS_PROFILE_PATH}.nextAvailableAt`]: nextAvailableAt,
          [`${POTIONS_PROFILE_PATH}.lastScore`]: correct,
          [`${POTIONS_PROFILE_PATH}.lastTotal`]: total,
          [`${POTIONS_PROFILE_PATH}.lastSuccess`]: success,
          [`${POTIONS_PROFILE_PATH}.lastRoundKey`]: roundKey,
          [`${POTIONS_PROFILE_PATH}.lastReminderSlot`]: "",
          [`${POTIONS_PROFILE_PATH}.activeRoundKey`]: "",
        },
        $inc: {
          [`${POTIONS_PROFILE_PATH}.totalBrews`]: 1,
          [`${POTIONS_PROFILE_PATH}.successfulBrews`]: success ? 1 : 0,
        },
        $max: {
          [`${POTIONS_PROFILE_PATH}.bestScore`]: correct,
        },
      },
      { new: true, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
    if (!reserved) {
      const current = await ActivityUserProfile.findOne({ guildId: resolved.guild.id, userId: resolved.userId })
        .select(POTIONS_PROFILE_PATH)
        .lean()
        .catch(() => null);
      const currentState = current?.profile?.events?.hogwarts?.potions || {};
      return res.status(409).json({
        ok: false,
        error: "round_already_used",
        message: "Questo round è già stato consegnato. Attendi il prossimo cooldown.",
        potions: publicPotionsState(currentState, potionsCfg),
      });
    }
    const rewardKey = `${cfg.eventKey}:potions:${resolved.userId}:${roundKey}`;
    let gringottAward = null;
    let housePointsAward = null;
    if (success && potionsCfg.rewardGaleoni > 0) {
      gringottAward = await addGaleoni({
        guildId: resolved.guild.id,
        userId: resolved.userId,
        amount: potionsCfg.rewardGaleoni,
        reason: "Compito di pozioni completato",
        actorId: "site",
        source: "hogwarts_potions",
        eventKey: cfg.eventKey,
        rewardKey,
      }).catch(() => null);
    }
    if (success && potionsCfg.rewardHousePoints > 0) {
      housePointsAward = await awardPotionsHousePoints(client, resolved.guild.id, resolved.userId, houseId, cfg.eventKey, potionsCfg.rewardHousePoints);
    }
    const updatedState = reserved?.profile?.events?.hogwarts?.potions || {};
    const gringott = gringottAward?.state || await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      success,
      score: { correct, total },
      results,
      house: houseId,
      houseMeta,
      reward: {
        galeoni: success ? potionsCfg.rewardGaleoni : 0,
        housePoints: success ? potionsCfg.rewardHousePoints : 0,
        housePointsAward,
      },
      potions: publicPotionsState(updatedState, potionsCfg),
      gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
      message: success
        ? `Pozioni abbinate alla perfezione: +${potionsCfg.rewardGaleoni} Galeoni e +${potionsCfg.rewardHousePoints} punti casa.`
        : `Hai indovinato ${correct}/${total}. Potrai riprovare tra 12 ore.`,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-potions post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function publicHousePointsPayload(doc) {
  const totals = doc?.rawWebhook?.totals && typeof doc.rawWebhook.totals === "object" ? doc.rawWebhook.totals : {};
  const out = { totals: {}, byPeriod: {} };
  for (const houseId of HOUSES) {
    out.totals[houseId] = Math.max(0, Math.floor(Number(totals[houseId]) || 0));
  }
  const byPeriod = doc?.rawWebhook?.byPeriod && typeof doc.rawWebhook.byPeriod === "object" ? doc.rawWebhook.byPeriod : {};
  for (const [periodKey, periodTotals] of Object.entries(byPeriod)) {
    const key = String(periodKey || "").trim();
    if (!key || !periodTotals || typeof periodTotals !== "object") continue;
    out.byPeriod[key] = {};
    for (const houseId of HOUSES) {
      out.byPeriod[key][houseId] = Math.max(0, Math.floor(Number(periodTotals[houseId]) || 0));
    }
  }
  return out;
}

async function handleHogwartsHousePointsGet(client, req, res) {
  try {
    const cfg = resolveHogwartsEventConfig(client);
    if (cfg.previewMode) {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
      if (!resolved.ok) return res.status(Number(resolved.status) || 403).json({ ok: false, error: resolved.error, message: resolved.message });
      if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "In anteprima questa pagina è riservata all'High Staff del server." });
      }
    }
    if (Number.isFinite(Number(cfg.startMs)) && Date.now() < Number(cfg.startMs)) {
      res.setHeader("Cache-Control", cfg.previewMode ? "private, no-store" : "public, max-age=30");
      return res.status(200).json({ ok: true, eventKey: cfg.eventKey, points: publicHousePointsPayload(null) });
    }
    const guildId = String(resolveGuild(client)?.id || "").trim();
    const doc = guildId
      ? await SiteDocument.findOne({ docType: HOUSE_POINTS_DOC, guildId, userId: HOUSE_POINTS_OWNER_ID, dedupeKey: String(cfg.eventKey || "hogwarts") }).lean().catch(() => null)
      : null;
    res.setHeader("Cache-Control", cfg.previewMode ? "private, no-store" : "public, max-age=30");
    return res.status(200).json({ ok: true, eventKey: cfg.eventKey, points: publicHousePointsPayload(doc) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-house-points:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function resolveForbiddenBookParticipant(client, req, options = {}) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) return { ok: false, status: 401, error: "missing_token", message: "Accedi con Discord per raccogliere i libri proibiti." };
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ...resolved, status: Number(resolved.status) || 500 };
  const cfg = resolveHogwartsEventConfig(client);
  const previewViewer = canPreviewForbiddenBooks(client, resolved.member, resolved.userId);
  if (!previewViewer) {
    const participation = await assertHogwartsEventParticipationForUser(
      client,
      resolved.member,
      resolved.userId,
    );
    if (!participation.ok) return participation;
  }
  if (!forbiddenEventOpen(client) && !previewViewer) {
    const now = Date.now();
    const { endMs } = resolveForbiddenBooksSchedule(client);
    if (Number.isFinite(endMs) && now > endMs) {
      return {
        ok: false,
        status: 403,
        error: "event_closed",
        message: "La caccia ai libri proibiti è conclusa.",
      };
    }
    return {
      ok: false,
      status: 403,
      error: "event_not_started",
      message: "La caccia ai libri proibiti inizia il 20 giugno 2026.",
    };
  }
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  if (!houseId && options.allowPreviewViewer && previewViewer) {
    return { ok: true, resolved, cfg, houseId: "", dedupeKey: forbiddenEventDedupeKey(cfg), previewViewer: true };
  }
  if (!houseId) {
    return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per raccogliere i libri proibiti." };
  }
  return { ok: true, resolved, cfg, houseId, dedupeKey: forbiddenEventDedupeKey(cfg), previewViewer: Boolean(previewViewer) };
}

async function handleHogwartsForbiddenBooksGet(client, req, res) {
  try {
    const participant = await resolveForbiddenBookParticipant(client, req, { allowPreviewViewer: true });
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, dedupeKey } = participant;
    const [doc, closure] = await Promise.all([
      getForbiddenUserDoc(resolved.guild.id, resolved.userId, dedupeKey),
      getForbiddenClosure(resolved.guild.id, dedupeKey),
    ]);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, house: participant.houseId, previewViewer: Boolean(participant.previewViewer), ...forbiddenProgressPayload(doc, closure) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-forbidden-books get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsForbiddenBooksClaim(client, req, res) {
  try {
    const participant = await resolveForbiddenBookParticipant(client, req, { allowPreviewViewer: true });
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const bookId = normalizeForbiddenBookId(req.body?.bookId);
    if (!bookId) return res.status(400).json({ ok: false, error: "invalid_book", message: "Libro non valido." });
    const { resolved, cfg, houseId, dedupeKey } = participant;
    const closedBefore = await getForbiddenClosure(resolved.guild.id, dedupeKey);
    if (String(closedBefore?.status || "") === "closed") {
      return res.status(409).json({ ok: false, error: "event_closed", message: "La caccia ai libri proibiti è già conclusa.", ...forbiddenProgressPayload(null, closedBefore) });
    }
    const query = { docType: FORBIDDEN_DOC, guildId: resolved.guild.id, userId: resolved.userId, dedupeKey };
    await SiteDocument.findOneAndUpdate(
      query,
      {
        $setOnInsert: {
          docType: FORBIDDEN_DOC,
          guildId: resolved.guild.id,
          userId: resolved.userId,
          dedupeKey,
          createdBy: "site",
          status: "active",
          planKey: houseId,
          rawWebhook: { houseId, collectedBookIds: [], bookIds: FORBIDDEN_BOOK_IDS },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    await SiteDocument.updateOne(query, {
      $addToSet: { "rawWebhook.collectedBookIds": bookId },
      $set: { planKey: houseId, "rawWebhook.houseId": houseId, "rawWebhook.lastCollectedAt": new Date(), "rawWebhook.bookIds": FORBIDDEN_BOOK_IDS },
    }).catch(() => null);
    let doc = await getForbiddenUserDoc(resolved.guild.id, resolved.userId, dedupeKey);
    const progress = forbiddenProgressPayload(doc, null);
    if (progress.completed && String(doc?.status || "") !== "completed") {
      doc = await SiteDocument.findOneAndUpdate(
        query,
        { $set: { status: "completed", "rawWebhook.completedAt": new Date() } },
        { new: true },
      ).lean().catch(() => doc);
    }
    const closure = await getForbiddenClosure(resolved.guild.id, dedupeKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, claimedBookId: bookId, house: houseId, ...forbiddenProgressPayload(doc, closure) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-forbidden-books claim:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function previewAccessDeniedPayload() {
  return {
    ok: false,
    status: 403,
    error: "preview_forbidden",
    message: "In anteprima lo smistamento non è ancora disponibile.",
  };
}

async function handleHogwartsSortingAccessGet(client, req, res) {
  try {
    const cfg = resolveHogwartsEventConfig(client);
    if (!cfg.previewMode) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json({ ok: true, previewGate: false });
    }

    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }

    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 403).json({
        ok: false,
        error: resolved.error,
        message: resolved.message,
      });
    }

    if (!HOGWARTS_EXCLUDED_STAFF_ROLE_IDS.length) {
      return res.status(503).json({
        ok: false,
        error: "misconfigured",
        message: "Ruoli staff dirigenziale non configurati sul bot.",
      });
    }

    if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "In anteprima questa pagina non è ancora disponibile.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, previewGate: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsHousePointsGet, handleHogwartsPotionsGet, handleHogwartsPotionsPost, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet };