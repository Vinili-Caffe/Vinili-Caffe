const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const { getPublicQuestions, normalizeAnswers, computeHouseFromAnswers, getHouseMeta, HOUSES } = require("./hogwartsSortingBank") as typeof import("./hogwartsSortingBank");
const { findExistingSort, shouldEnsureSortingGringott } = require("./hogwartsSortingResolve") as typeof import("./hogwartsSortingResolve");
const {
  resolveHogwartsEventConfig,
  resolveHubStartMs,
  isEventWindowOpen,
  isSortingWindowOpen,
  resolveEventWindowForViewer,
  resolveSortingWindowForViewer,
  formatSortingWindowIt,
} = require("./hogwartsSortingConfig") as typeof import("./hogwartsSortingConfig");
const { logHogwartsSortingCompleted } = require("../../Services/Community/hogwartsSortingLogService") as typeof import("../../Services/Community/hogwartsSortingLogService");
const { assignHouseRoles, ensureSortedMemberHouseRoles } = require("../../Services/Community/hogwartsSortingRoleService") as typeof import("../../Services/Community/hogwartsSortingRoleService");
const { logHogwartsShopPurchase } = require("../../Services/Community/hogwartsShopLogService") as typeof import("../../Services/Community/hogwartsShopLogService");
const {
  addGaleoni,
  ensureGringottStoredBalance,
  ensureHogwartsSortingReward,
  getGringottBalance,
  spendGaleoni,
  toPublicGringottPayload,
} = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");
const { getShopItemById, normalizeShopCategory, publicShopCatalog, resolveShopPurchaseOffer, SHOP_CATEGORY_LABELS } = require("./hogwartsShopCatalog") as typeof import("./hogwartsShopCatalog");
const { getConsumableById, normalizeConsumableCategory, publicConsumablesCatalog, CONSUMABLE_CATEGORY_LABELS } = require("./hogwartsShopConsumablesCatalog") as typeof import("./hogwartsShopConsumablesCatalog");
const {
  economyConsumablesLockMessage,
  getActiveConsumableBoosts,
  isEconomyConsumablesUnlocked,
  loadGuildConsumableBoosts,
  publicActiveBoostsPayload,
  publicConsumablesCatalogWithAvailability,
  purchaseAndActivateConsumable,
} = require("../../Services/Community/hogwartsConsumableBoostsService") as typeof import("../../Services/Community/hogwartsConsumableBoostsService");
const { buildPotionsRound, normalizePotionId } = require("./hogwartsPotionsCatalog") as typeof import("./hogwartsPotionsCatalog");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;

function setHogwartsMutationNoStore(res?) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
}

function resolveMainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

async function resolvePublicGringottForUser(client?, guildId?, userId?, eventKey?, ensureSortingReward = false) {
  if (ensureSortingReward) {
    await ensureHogwartsSortingReward(client, guildId, userId, "site").catch((err?) => {
      global.logger?.warn?.("[GRINGOTT] ensure sorting reward:", err?.message || err);
    });
  }
  const gringott = await getGringottBalance(guildId, userId, eventKey);
  return toPublicGringottPayload(gringott || { eventKey });
}

async function resolveGringottAfterSorting(client?, guildId?, userId?, eventKey?) {
  return resolvePublicGringottForUser(client, guildId, userId, eventKey, true);
}
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const {
  FORBIDDEN_DOC,
  normalizeForbiddenBookId,
  forbiddenEventOpen,
  canPreviewForbiddenBooks,
  forbiddenProgressPayload,
  getForbiddenClosure,
  getForbiddenUserDoc,
  resolveForbiddenBooksSchedule,
  resolveForbiddenRoundRuntime,
  buildForbiddenPublicStatusPayload,
} = require("../../Services/Community/hogwartsForbiddenBooksService") as typeof import("../../Services/Community/hogwartsForbiddenBooksService");
const POTIONS_PROFILE_PATH = "profile.events.hogwarts.potions";
const POTIONS_DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  startDate: "2026-08-24T12:00:00",
  cooldownMs: 12 * 60 * 60 * 1000,
  rewardGaleoni: 100,
  rewardHousePoints: 100,
  roundSize: 4,
});
const { housePointPeriodKey: resolveHousePointPeriod } = require("./hogwartsHousePointPeriods") as typeof import("./hogwartsHousePointPeriods");
const {
  assertHogwartsEventParticipationForUser,
  hasHogwartsSortingPreviewAccess,
  isHogwartsStaffPreviewViewer,
  HOGWARTS_PREVIEW_STAFF_ROLE_IDS,
} = require("./hogwartsEventParticipation") as typeof import("./hogwartsEventParticipation");
const { markHogwartsProfileRetainedUntil } = require("../../Services/Community/hogwartsLeaveRetention") as typeof import("../../Services/Community/hogwartsLeaveRetention");

async function gateHogwartsEventParticipation(client?, resolved?, cfg?) {
  const participation = await assertHogwartsEventParticipationForUser(
    client,
    resolved.member,
    resolved.userId,
  );
  if (!participation.ok) return participation;
  if (isHogwartsStaffPreviewViewer(cfg, resolved.member, resolved.userId)) {
    return {
      ok: true,
      windowState: resolveEventWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId),
      previewStaff: true,
    };
  }
  const windowState = isEventWindowOpen(cfg, Date.now(), resolved.userId, resolved.member);
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

async function gateHogwartsHubParticipation(client?, resolved?, cfg?) {
  const participation = await assertHogwartsEventParticipationForUser(
    client,
    resolved.member,
    resolved.userId,
  );
  if (!participation.ok) return participation;
  if (isHogwartsStaffPreviewViewer(cfg, resolved.member, resolved.userId)) {
    return {
      ok: true,
      windowState: resolveSortingWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId),
      previewStaff: true,
    };
  }
  const windowState = resolveSortingWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId);
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

function houseMetaFromCfg(cfg?, houseId?) {
  const id = String(houseId || "").trim();
  const crestUrl = String(cfg?.houses?.[id]?.crestUrl || "").trim();
  return getHouseMeta(id, crestUrl || undefined);
}

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function buildEventPayload(cfg?, windowState?) {
  return {
    enabled: Boolean(cfg.enabled),
    previewMode: Boolean(cfg.previewMode),
    timezone: cfg.timezone,
    startDate: cfg.sortingStartDate || cfg.startDate,
    endDate: cfg.endDate,
    eventKey: cfg.eventKey,
    gringott: {
      bank: "Gringott",
      currency: "Galeone d'Oro",
      currencyPlural: "Galeoni d'Oro",
      sortingReward: Number(cfg.gringott?.sortingReward || 0),
    },
    windowLabel: formatSortingWindowIt(cfg),
    phase: windowState.phase,
    open: Boolean(windowState.open),
    startsAtMs: windowState.startsAtMs || null,
    endsAtMs: windowState.endsAtMs || null,
  };
}

function isMongoDuplicateKeyError(err?) {
  return err?.code === 11000 || String(err?.message || "").includes("E11000");
}

async function claimHogwartsSortingRecord({ resolved, cfg, houseId, computed, answerCount }) {
  const filter = {
    docType: DOC,
    guildId: String(resolved.guild.id || ""),
    userId: String(resolved.userId || ""),
    dedupeKey: String(cfg.eventKey || ""),
  };
  const payload = {
    status: houseId,
    planKey: houseId,
    createdBy: "site",
    rawWebhook: {
      totals: computed.totals,
      decisive: computed.decisive,
      answerCount,
      roleResult: { roleAssigned: false, roleQueued: true },
    },
  };
  try {
    await SiteDocument.create({ ...filter, ...payload });
    return { claimed: true };
  } catch (err) {
    if (!isMongoDuplicateKeyError(err)) throw err;
    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
    if (existing?.status) return { claimed: false, existingHouse: existing.status, existing };
    throw err;
  }
}

async function maybeRepairSortedMemberRoles(member?, cfg?, existing?, houseId?) {
  if (!member || !houseId || existing?.fromRole) return;
  void ensureSortedMemberHouseRoles(member, cfg, houseId).catch((err?) => {
    global.logger?.warn?.("[hogwarts-sorting] role repair:", err?.message || err);
  });
}

async function commitHogwartsSortingSideEffects({ client, resolved, cfg, houseId, houseMeta, computed, answerCount }) {
  const claim = await claimHogwartsSortingRecord({ resolved, cfg, houseId, computed, answerCount });
  if (!claim.claimed) {
    return {
      duplicate: true,
      existingHouse: String(claim.existingHouse || "").trim(),
      existing: claim.existing || null,
    };
  }
  const gringottAward = await ensureHogwartsSortingReward(client, resolved.guild.id, resolved.userId, "site");
  await markHogwartsProfileRetainedUntil(resolved.guild.id, resolved.userId, client);
  void logHogwartsSortingCompleted({
    client,
    guild: resolved.guild,
    cfg,
    member: resolved.member,
    userId: resolved.userId,
    houseId,
    houseLabel: houseMeta?.label || houseId,
  }).catch((err?) => {
    global.logger?.warn?.("[hogwarts-sorting] log:", err?.message || err);
  });
  void assignHouseRoles(resolved.member, cfg, houseId).catch((err?) => {
    global.logger?.warn?.("[hogwarts-sorting] queued role assignment:", err?.message || err);
  });
  return { duplicate: false, gringottAward };
}

async function handleHogwartsSortingBootstrap(client?, req?, res?) {
  try {
    const cfg = resolveHogwartsEventConfig(client);
    const windowState = isSortingWindowOpen(cfg, Date.now(), null);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({
      ok: true,
      event: buildEventPayload(cfg, windowState),
      questions: getPublicQuestions(),
      houses: HOUSES.map((id?) => houseMetaFromCfg(cfg, id)),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting bootstrap:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsSortingEligibility(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }
    const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }
    const cfg = resolveHogwartsEventConfig(client);
    if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
  const windowState = resolveSortingWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId);
    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
      member: resolved.member,
      cfg,
    });
    const houseId = existing?.status ? String(existing.status).trim() : "";
    const meta = houseId ? houseMetaFromCfg(cfg, houseId) : null;
    const ensureGringott = await shouldEnsureSortingGringott(resolved.guild.id, resolved.userId, cfg.eventKey, {
      member: resolved.member,
      cfg,
    });
    const gringott = await resolvePublicGringottForUser(
      client,
      resolved.guild.id,
      resolved.userId,
      cfg.eventKey,
      ensureGringott,
    );
    await maybeRepairSortedMemberRoles(resolved.member, cfg, existing, houseId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      event: buildEventPayload(cfg, windowState),
      canSort: Boolean(windowState.open) && !houseId,
      alreadySorted: Boolean(houseId),
      house: houseId || null,
      houseMeta: meta,
      gringott,
      message: !windowState.open
        ? windowState.phase === "before_start"
          ? `Lo smistamento aprirà ${formatSortingWindowIt(cfg) || "a breve"}.`
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

async function handleHogwartsSortingSubmit(client?, req?, res?) {
  setHogwartsMutationNoStore(res);
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

    const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }

    const cfg = resolveHogwartsEventConfig(client);
    if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
    const windowState = resolveSortingWindowForViewer(cfg, Date.now(), resolved.member, resolved.userId);
    if (!windowState.open) {
      return res.status(403).json({
        ok: false,
        error: "event_closed",
        message:
          windowState.phase === "before_start"
            ? `Lo smistamento non è ancora aperto. ${formatSortingWindowIt(cfg) || ""}`.trim()
            : "Lo smistamento non è disponibile in questo momento.",
        event: buildEventPayload(cfg, windowState),
      });
    }

    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
      member: resolved.member,
      cfg,
    });
    const existingHouse = String(existing?.status || "").trim();
    if (existingHouse) {
      const meta = houseMetaFromCfg(cfg, existingHouse);
      const gringott = await resolveGringottAfterSorting(client, resolved.guild.id, resolved.userId, cfg.eventKey);
      await maybeRepairSortedMemberRoles(resolved.member, cfg, existing, existingHouse);
      return res.status(200).json({
        ok: true,
        alreadySorted: true,
        message: `Hai già completato lo smistamento (${meta?.label || existingHouse}).`,
        house: existingHouse,
        houseMeta: meta,
        gringott,
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
      houseMeta: meta,
      computed,
      answerCount: answers.length,
    });
    if (sideEffects?.duplicate) {
      const lockedHouse = String(sideEffects.existingHouse || "").trim() || houseId;
      const lockedMeta = houseMetaFromCfg(cfg, lockedHouse);
      const gringott = await resolveGringottAfterSorting(client, resolved.guild.id, resolved.userId, cfg.eventKey);
      await maybeRepairSortedMemberRoles(resolved.member, cfg, sideEffects.existing, lockedHouse);
      return res.status(200).json({
        ok: true,
        alreadySorted: true,
        message: `Hai già completato lo smistamento (${lockedMeta?.label || lockedHouse}).`,
        house: lockedHouse,
        houseMeta: lockedMeta,
        gringott,
      });
    }
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

async function handleHogwartsGringottGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }
    const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 500).json(resolved);
    }
    const cfg = resolveHogwartsEventConfig(client);
    const gate: any = await gateHogwartsHubParticipation(client, resolved, cfg);
    if (!gate.ok) return res.status(gate.status || 403).json(gate);
    const existing = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
      member: resolved.member,
      cfg,
    });
    const houseId = existing?.status ? String(existing.status).trim() : "";
    const ensureGringott = await shouldEnsureSortingGringott(resolved.guild.id, resolved.userId, cfg.eventKey, {
      member: resolved.member,
      cfg,
    });
    const gringott = await resolvePublicGringottForUser(
      client,
      resolved.guild.id,
      resolved.userId,
      cfg.eventKey,
      ensureGringott,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      gringott,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-gringott:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function normalizeShopInventory(raw?) {
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

async function getShopProfileState(guildId?, userId?, eventKey?) {
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

async function resolveShopParticipant(client?, req?) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }
  const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ok: false, status: Number(resolved.status) || 500, ...resolved };
  const cfg = resolveHogwartsEventConfig(client);
  const gate = await gateHogwartsHubParticipation(client, resolved, cfg);
  if (!gate.ok) return gate;
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
    member: resolved.member,
    cfg,
  });
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

async function handleHogwartsShopGet(client?, req?, res?) {
  try {
    const participant: any = await resolveShopParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, houseId, houseMeta, previewViewer } = participant;
    const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    const { getShopDurableBoostUsage } = require("../../Services/Community/hogwartsShopBoostsService") as typeof import("../../Services/Community/hogwartsShopBoostsService");
    const boostUsage = houseId
      ? await getShopDurableBoostUsage(client, resolved.guild.id, resolved.userId)
      : null;
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
      boostUsage,
      previewDisabled: Boolean(previewViewer),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-shop get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsShopPurchasePost(client?, req?, res?) {
  setHogwartsMutationNoStore(res);
  try {
    const participant: any = await resolveShopParticipant(client, req);
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
      const purchasedAtMs = Date.now();
      void logHogwartsShopPurchase({
        client,
        guild: resolved.guild,
        cfg,
        member: resolved.member,
        userId: resolved.userId,
        itemId: consumable.id,
        itemName: consumable.name,
        category: consumable.category,
        categoryLabel: CONSUMABLE_CATEGORY_LABELS[consumable.category] || consumable.category,
        galeoniPaid: Math.max(0, Math.floor(Number(result.spent) || consumable.price || 0)),
        mode: "consumable",
        houseId,
        houseLabel: houseMeta?.label || houseMeta?.name || "",
        purchasedAtMs,
        source: "site",
      }).catch((err?) => {
        global.logger?.warn?.("[hogwarts-shop] log consumable:", err?.message || err);
      });
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
    await ensureGringottStoredBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
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
      { new: true, upsert: !isUpgrade, setDefaultsOnInsert: false },
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
    void logHogwartsShopPurchase({
      client,
      guild: resolved.guild,
      cfg,
      member: resolved.member,
      userId: resolved.userId,
      itemId: item.id,
      itemName: item.name,
      category,
      categoryLabel: SHOP_CATEGORY_LABELS[category] || category,
      galeoniPaid: amountToPay,
      mode: isUpgrade ? "upgrade" : "purchase",
      houseId,
      houseLabel: houseMeta?.label || houseMeta?.name || "",
      purchasedAtMs: now.getTime(),
      source: "site",
    }).catch((err?) => {
      global.logger?.warn?.("[hogwarts-shop] log catalog:", err?.message || err);
    });
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

function safeInt(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolvePotionsConfig(client?) {
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

function potionsOpen(potionsCfg?, nowMs = Date.now()) {
  return Boolean(potionsCfg?.enabled) && Number.isFinite(Number(potionsCfg.startMs)) && Number(nowMs || Date.now()) >= Number(potionsCfg.startMs);
}

function canPreviewPotions(cfg?, member?, userId?) {
  return isHogwartsStaffPreviewViewer(cfg, member, userId);
}

function publicPotionsState(raw?, potionsCfg?) {
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

async function resolvePotionsParticipant(client?, req?) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
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
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
    member: resolved.member,
    cfg,
  });
  const houseId = String(sorting?.status || "").trim();
  if (!houseId && previewViewer) {
    return { ok: true, resolved, cfg, potionsCfg, houseId: "", houseMeta: null, previewViewer: true };
  }
  if (!houseId) return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per accedere alle pozioni." };
  return { ok: true, resolved, cfg, potionsCfg, houseId, houseMeta: houseMetaFromCfg(cfg, houseId), previewViewer: false };
}

function makePotionRoundKey(userId?) {
  return `${Date.now().toString(36)}_${String(userId || "").slice(-6)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePotionPreviewRoundKey(userId?) {
  return `preview:${String(userId || "staff")}:${new Date().toISOString().slice(0, 10)}`;
}

async function ensurePotionsRound(guildId?, userId?, eventKey?, potionsCfg?) {
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

function normalizePotionAnswers(body?) {
  const raw = body?.answers && typeof body.answers === "object" ? body.answers : {};
  const out: Record<string, any> = {};
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

async function previewPotionsHouseReward(client?, guildId?, userId?, basePoints?) {
  const base = safeInt(basePoints, 0, 0, 1000);
  const empty = {
    base,
    housePoints: base,
    petMultiplier: 1,
    petName: "",
    consumableMultiplier: 1,
    consumableLabels: [],
  };
  if (base <= 0) return empty;
  try {
    const {
      isHogwartsShopBoostActive,
      loadShopInventory,
      petHousePointsMultiplier,
      getShopDurableBoostUsage,
      SHOP_CATEGORIES,
    }: any = require("../../Services/Community/hogwartsShopBoostsService") as typeof import("../../Services/Community/hogwartsShopBoostsService");
    if (!isHogwartsShopBoostActive(client)) return empty;
    const inventory = await loadShopInventory(guildId, userId);
    const pet = inventory?.[SHOP_CATEGORIES.PET] || null;
    let petMult = petHousePointsMultiplier(pet);
    let petName = "";
    if (petMult > 1) {
      const usage = await getShopDurableBoostUsage(client, guildId, userId, SHOP_CATEGORIES.PET).catch(() => null);
      if (usage?.exhausted) petMult = 1;
      else petName = String(pet?.name || "").trim();
    } else {
      petMult = 1;
    }
    let consumableMult = 1;
    let consumableLabels = [];
    try {
      const { resolveHousePointsConsumableMultiplier } = require("../../Services/Community/hogwartsConsumableBoostsService") as typeof import("../../Services/Community/hogwartsConsumableBoostsService");
      const { resolveSortedHouseForUser } = require("../../Services/Community/galeoniEconomyService") as typeof import("../../Services/Community/galeoniEconomyService");
      const houseId = await resolveSortedHouseForUser(guildId, userId, client).catch(() => "");
      const consumable = await resolveHousePointsConsumableMultiplier(client, guildId, userId, houseId);
      consumableMult = Math.max(1, Number(consumable?.multiplier) || 1);
      consumableLabels = Array.isArray(consumable?.labels) ? consumable.labels : [];
    } catch (_) {}
    const afterPet = petMult <= 1 ? base : Math.max(0, Math.floor(base * petMult));
    const housePoints = consumableMult <= 1 ? afterPet : Math.max(0, Math.floor(afterPet * consumableMult));
    return {
      base,
      housePoints,
      petMultiplier: petMult > 1 ? petMult : 1,
      petName: petMult > 1 ? petName : "",
      consumableMultiplier: consumableMult > 1 ? consumableMult : 1,
      consumableLabels,
    };
  } catch (_) {
    return empty;
  }
}

function formatPotionsRewardMessage({ success, correct, total, galeoni, housePoints, petMultiplier, petName, consumableLabels }) {
  if (!success) return `Hai indovinato ${correct}/${total}. Potrai riprovare tra 12 ore.`;
  const g = Math.max(0, Math.floor(Number(galeoni) || 0));
  const hp = Math.max(0, Math.floor(Number(housePoints) || 0));
  const bits = [];
  const mult = Math.max(1, Number(petMultiplier) || 1);
  const name = String(petName || "").trim();
  if (mult > 1 && name) bits.push(`×${mult} ${name}`);
  else if (mult > 1) bits.push(`×${mult} animale`);
  const labels = Array.isArray(consumableLabels) ? consumableLabels.filter(Boolean) : [];
  if (labels.length) bits.push(labels.join(" + "));
  const boostTag = bits.length ? ` (${bits.join(" · ")})` : "";
  return `Pozioni abbinate alla perfezione: +${g} Galeoni e +${hp} punti casa${boostTag}.`;
}

async function awardPotionsHousePoints(client?, guildId?, userId?, houseId?, eventKey?, points?) {
  const base = safeInt(points, 0, 0, 1000);
  const house = String(houseId || "").trim();
  if (!base || !HOUSES.includes(house)) return null;
  const { applyPetHousePointsBoost } = require("../../Services/Community/hogwartsShopBoostsService") as typeof import("../../Services/Community/hogwartsShopBoostsService");
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
  const petMultiplier = Math.max(1, Number(boosted?.multiplier) || 1);
  return {
    houseId: house,
    points: amount,
    base,
    petMultiplier: petMultiplier > 1 ? petMultiplier : 0,
    petName: String(boosted?.petName || "").trim(),
    consumableMultiplier: Math.max(1, Number(boosted?.consumableMultiplier) || 1),
    consumableLabels: Array.isArray(boosted?.consumableLabels) ? boosted.consumableLabels : [],
  };
}

async function handleHogwartsPotionsGet(client?, req?, res?) {
  try {
    const participant: any = await resolvePotionsParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, potionsCfg, houseId, houseMeta, previewViewer } = participant;
    const previewRound = previewViewer ? buildPotionsRound(makePotionPreviewRoundKey(resolved.userId), potionsCfg.roundSize) : null;
    const { state, round } = previewViewer
      ? { state: {}, round: previewRound }
      : await ensurePotionsRound(resolved.guild.id, resolved.userId, cfg.eventKey, potionsCfg);
    const gringott = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    const rewardPreview = previewViewer
      ? { galeoni: 0, housePoints: 0, base: 0, petMultiplier: 1, petName: "", consumableMultiplier: 1, consumableLabels: [] }
      : await previewPotionsHouseReward(
          client,
          resolved.guild.id,
          resolved.userId,
          potionsCfg.rewardHousePoints,
        );
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
        housePoints: previewViewer ? 0 : rewardPreview.housePoints,
        housePointsBase: previewViewer ? 0 : potionsCfg.rewardHousePoints,
        petMultiplier: previewViewer ? 0 : rewardPreview.petMultiplier > 1 ? rewardPreview.petMultiplier : 0,
        petName: previewViewer ? "" : rewardPreview.petName || "",
        consumableMultiplier: previewViewer ? 1 : rewardPreview.consumableMultiplier || 1,
        consumableLabels: previewViewer ? [] : rewardPreview.consumableLabels || [],
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

async function handleHogwartsPotionsPost(client?, req?, res?) {
  setHogwartsMutationNoStore(res);
  try {
    const participant: any = await resolvePotionsParticipant(client, req);
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
      const requiredIds = round.potions.map((item?) => item.id);
      let correct = 0;
      const results: Record<string, any> = {};
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
    const requiredIds = round.potions.map((item?) => item.id);
    let correct = 0;
    const results: Record<string, any> = {};
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
    try {
      const { schedulePotionReminder } = require("../../Services/Community/hogwartsPotionReminderService") as typeof import("../../Services/Community/hogwartsPotionReminderService");
      schedulePotionReminder(client, resolved.guild.id, resolved.userId, nextAvailableAt);
    } catch (errSched) {
      global.logger?.warn?.("[HOGWARTS POTIONS] schedule reminder:", errSched?.message || errSched);
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
    const awardedGaleoni = success ? potionsCfg.rewardGaleoni : 0;
    const awardedHousePoints = success
      ? Math.max(
          0,
          Math.floor(
            Number(housePointsAward?.points) ||
              (housePointsAward ? 0 : potionsCfg.rewardHousePoints) ||
              0,
          ),
        )
      : 0;
    const petMultiplier = Math.max(0, Math.floor(Number(housePointsAward?.petMultiplier) || 0));
    const petName = String(housePointsAward?.petName || "").trim();
    const consumableLabels = Array.isArray(housePointsAward?.consumableLabels)
      ? housePointsAward.consumableLabels
      : [];
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      success,
      score: { correct, total },
      results,
      house: houseId,
      houseMeta,
      reward: {
        galeoni: awardedGaleoni,
        housePoints: awardedHousePoints,
        housePointsBase: success ? potionsCfg.rewardHousePoints : 0,
        petMultiplier,
        petName,
        consumableMultiplier: Math.max(1, Number(housePointsAward?.consumableMultiplier) || 1),
        consumableLabels,
        housePointsAward,
      },
      potions: publicPotionsState(updatedState, potionsCfg),
      gringott: toPublicGringottPayload(gringott || { eventKey: cfg.eventKey }),
      message: formatPotionsRewardMessage({
        success,
        correct,
        total,
        galeoni: awardedGaleoni,
        housePoints: awardedHousePoints,
        petMultiplier,
        petName,
        consumableLabels,
      }),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-potions post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function publicHousePointsPayload(doc?) {
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

async function handleHogwartsHousePointsGet(client?, req?, res?) {
  try {
    const cfg = resolveHogwartsEventConfig(client);
    if (cfg.previewMode) {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
      if (!resolved.ok) return res.status(Number(resolved.status) || 403).json({ ok: false, error: resolved.error, message: resolved.message });
      if (!hasHogwartsSortingPreviewAccess(cfg, resolved.member, resolved.userId)) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "In anteprima questa pagina è riservata all'High Staff del server." });
      }
    }
    const hubStart = resolveHubStartMs(cfg);
    if (Number.isFinite(hubStart) && Date.now() < hubStart) {
      res.setHeader("Cache-Control", cfg.previewMode ? "private, no-store" : "public, max-age=30");
      return res.status(200).json({ ok: true, eventKey: cfg.eventKey, points: publicHousePointsPayload(null) });
    }
    const guildId = resolveMainGuildId(client);
    const doc = guildId
      ? await SiteDocument.findOne({ docType: HOUSE_POINTS_DOC, guildId, userId: HOUSE_POINTS_OWNER_ID, dedupeKey: String(cfg.eventKey || "hogwarts") }).lean().catch(() => null)
      : null;
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, eventKey: cfg.eventKey, points: publicHousePointsPayload(doc) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-house-points:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function resolveForbiddenBookParticipant(client?, req?, options: Record<string, any> = {}) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) return { ok: false, status: 401, error: "missing_token", message: "Accedi con Discord per raccogliere i libri proibiti." };
  const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ...resolved, status: Number(resolved.status) || 500 };
  const cfg = resolveHogwartsEventConfig(client);
  const previewViewer = canPreviewForbiddenBooks(client, resolved.member, resolved.userId);
  const runtime = await resolveForbiddenRoundRuntime(client);
  if (runtime?.mode === "disabled" || runtime?.enabled === false) {
    return {
      ok: false,
      status: 403,
      error: "feature_disabled",
      message: "La caccia ai libri proibiti non è attiva.",
    };
  }
  if (!previewViewer) {
    const participation = await assertHogwartsEventParticipationForUser(
      client,
      resolved.member,
      resolved.userId,
    );
    if (!participation.ok) return participation;
  }
  if (!previewViewer) {
        if (runtime?.mode !== "finale_chaos") {
      const { endMs } = resolveForbiddenBooksSchedule(client);
      if (Number.isFinite(endMs) && Date.now() > endMs) {
        return {
          ok: false,
          status: 403,
          error: "event_closed",
          message: "La caccia ai libri proibiti è conclusa.",
        };
      }
    }
    if (!runtime.roundActive) {
      if (runtime.nextRoundStartMs) {
        return {
          ok: false,
          status: 403,
          error: "round_inactive",
          message: "Nessun round attivo al momento. Attendi il prossimo orario.",
          nextRoundId: runtime.nextRoundId,
          nextRoundStartMs: runtime.nextRoundStartMs,
        };
      }
      return {
        ok: false,
        status: 403,
        error: "event_closed",
        message: "La caccia ai libri proibiti è conclusa.",
      };
    }
  }
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey, {
    member: resolved.member,
    cfg,
  });
  const houseId = String(sorting?.status || "").trim();
  if (!houseId && options.allowPreviewViewer && previewViewer) {
    return {
      ok: true,
      resolved,
      cfg,
      houseId: "",
      dedupeKey: runtime.dedupeKey || "",
      bookIds: runtime.bookIds || [],
      runtime,
      previewViewer: true,
    };
  }
  if (!houseId) {
    return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per raccogliere i libri proibiti." };
  }
  return {
    ok: true,
    resolved,
    cfg,
    houseId,
    dedupeKey: runtime.dedupeKey || "",
    bookIds: runtime.bookIds || [],
    runtime,
    previewViewer: Boolean(previewViewer),
  };
}

async function handleHogwartsForbiddenBooksPublicStatus(client?, req?, res?) {
  try {
    const runtime = await resolveForbiddenRoundRuntime(client);
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return res.status(200).json(buildForbiddenPublicStatusPayload(runtime));
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-forbidden-books status:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsForbiddenBooksGet(client?, req?, res?) {
  try {
    const participant: any = await resolveForbiddenBookParticipant(client, req, { allowPreviewViewer: true });
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, dedupeKey, runtime } = participant;
    const progressOpts = {
      roundId: runtime?.roundId,
      roundLabel: runtime?.roundLabel,
      roundActive: runtime?.roundActive === true,
      roundStartMs: runtime?.roundStartMs,
      roundEndMs: runtime?.roundEndMs,
      nextRoundId: runtime?.nextRoundId,
      nextRoundStartMs: runtime?.nextRoundStartMs,
      bookIds: runtime?.bookIds || [],
    };
    const [doc, closure] = await Promise.all([
      dedupeKey ? getForbiddenUserDoc(resolved.guild.id, resolved.userId, dedupeKey) : null,
      dedupeKey ? getForbiddenClosure(resolved.guild.id, dedupeKey, runtime?.round) : null,
    ]);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      house: participant.houseId,
      previewViewer: Boolean(participant.previewViewer),
      ...forbiddenProgressPayload(doc, closure, progressOpts),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-forbidden-books get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleHogwartsForbiddenBooksClaim(client?, req?, res?) {
  setHogwartsMutationNoStore(res);
  try {
    const participant: any = await resolveForbiddenBookParticipant(client, req, { allowPreviewViewer: true });
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const bookIds = Array.isArray(participant.bookIds) ? participant.bookIds : [];
    const bookId = normalizeForbiddenBookId(req.body?.bookId, bookIds);
    if (!bookId) return res.status(400).json({ ok: false, error: "invalid_book", message: "Libro non valido." });
    const { resolved, houseId, dedupeKey, runtime } = participant;
    if (!dedupeKey) {
      return res.status(409).json({ ok: false, error: "round_inactive", message: "Nessun round attivo al momento." });
    }
    const progressOpts = {
      roundId: runtime?.roundId,
      roundLabel: runtime?.roundLabel,
      roundActive: runtime?.roundActive === true,
      roundStartMs: runtime?.roundStartMs,
      roundEndMs: runtime?.roundEndMs,
      nextRoundId: runtime?.nextRoundId,
      nextRoundStartMs: runtime?.nextRoundStartMs,
      bookIds,
    };
    const closedBefore = await getForbiddenClosure(resolved.guild.id, dedupeKey, runtime?.round);
    const closedProgress = forbiddenProgressPayload(null, closedBefore, progressOpts);
    if (closedProgress.closed) {
      return res.status(409).json({
        ok: false,
        error: "event_closed",
        message: "La caccia ai libri proibiti è già conclusa.",
        ...closedProgress,
      });
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
          rawWebhook: { houseId, collectedBookIds: [], bookIds, roundId: runtime?.roundId || null },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    await SiteDocument.updateOne(query, {
      $addToSet: { "rawWebhook.collectedBookIds": bookId },
      $set: {
        planKey: houseId,
        "rawWebhook.houseId": houseId,
        "rawWebhook.lastCollectedAt": new Date(),
        "rawWebhook.bookIds": bookIds,
        "rawWebhook.roundId": runtime?.roundId || null,
      },
    }).catch(() => null);
    let doc = await getForbiddenUserDoc(resolved.guild.id, resolved.userId, dedupeKey);
    const progress = forbiddenProgressPayload(doc, null, progressOpts);
    if (progress.completed && String(doc?.status || "") !== "completed") {
      doc = await SiteDocument.findOneAndUpdate(
        query,
        { $set: { status: "completed", "rawWebhook.completedAt": new Date() } },
        { new: true },
      ).lean().catch(() => doc);
    }
    if (runtime?.mode === "finale_chaos" && progress.completed && !participant.previewViewer) {
      try {
        const { tryAutoWinFinaleChaosForbidden } = require("../../Services/Community/hogwartsFinaleChaosDayService") as typeof import("../../Services/Community/hogwartsFinaleChaosDayService");
        await tryAutoWinFinaleChaosForbidden(client, {
          guildId: resolved.guild.id,
          userId: resolved.userId,
          houseId,
          runtime,
        });
      } catch (err) {
        global.logger?.warn?.("[WEBHOOK] finale chaos forbidden auto-win:", err?.message || err);
      }
    }
    const closure = await getForbiddenClosure(resolved.guild.id, dedupeKey, runtime?.round);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      claimedBookId: bookId,
      house: houseId,
      ...forbiddenProgressPayload(doc, closure, progressOpts),
    });
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

async function handleHogwartsSortingAccessGet(client?, req?, res?) {
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

    const resolved: any = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 403).json({
        ok: false,
        error: resolved.error,
        message: resolved.message,
      });
    }

    if (!HOGWARTS_PREVIEW_STAFF_ROLE_IDS.length) {
      return res.status(503).json({
        ok: false,
        error: "misconfigured",
        message: "Ruoli staff anteprima evento non configurati sul bot.",
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

export = { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsForbiddenBooksPublicStatus, handleHogwartsHousePointsGet, handleHogwartsPotionsGet, handleHogwartsPotionsPost, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet, setHogwartsMutationNoStore };