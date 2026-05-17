const IDs = require("../Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { getPublicQuestions, normalizeAnswers, computeHouseFromAnswers, getHouseMeta, HOUSES } = require("./hogwartsSortingBank");
const { resolveHogwartsEventConfig, isEventWindowOpen, formatEventWindowIt } = require("./hogwartsSortingConfig");
const {
  addGaleoni,
  awardHogwartsSortingReward,
  getGringottBalance,
  spendGaleoni,
  toPublicGringottPayload,
} = require("../../Services/Community/gringottService");
const { getShopItemById, normalizeShopCategory, publicShopCatalog } = require("./hogwartsShopCatalog");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const FORBIDDEN_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_FORBIDDEN_BOOKS;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const FORBIDDEN_EVENT_DEDUPE = "forbidden_section_books";
const FORBIDDEN_EVENT_OWNER_ID = "__event__";
const HOUSE_POINTS_OWNER_ID = "__event__";
const FORBIDDEN_BOOK_IDS = ["home", "faq", "wiki", "regole", "donazioni", "vote", "ruoli", "sponsor"];
const FORBIDDEN_START_MS = new Date("2026-06-20T00:00:00").getTime();
const FORBIDDEN_END_MS = new Date("2026-08-31T23:59:59.999").getTime();
const FORBIDDEN_REWARD_GALEONI = 50;
const FORBIDDEN_REWARD_HOUSE_POINTS = 100;

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
  const otherRoleIds = HOUSES.map((h) => String(cfg.houses?.[h]?.roleId || "").trim()).filter(
    (id) => id && id !== houseRoleId,
  );
  const toAdd = houseRoleId ? [houseRoleId] : [];
  const toRemove = otherRoleIds.filter((id) => member.roles.cache.has(id));
  if (!toAdd.length && !toRemove.length) {
    return { roleAssigned: false, roleSkippedReason: "roles_not_configured" };
  }
  try {
    if (toRemove.length) await member.roles.remove(toRemove, "Smistamento Evento");
    if (toAdd.length && !member.roles.cache.has(houseRoleId)) {
      await member.roles.add(houseRoleId, "Smistamento Evento");
    }
    return { roleAssigned: Boolean(houseRoleId), roleId: houseRoleId || null };
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
    if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
    const windowState = isEventWindowOpen(cfg, Date.now(), resolved.userId);
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
    if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
    const windowState = isEventWindowOpen(cfg, Date.now(), resolved.userId);
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
    if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
      const denied = previewAccessDeniedPayload();
      return res.status(denied.status).json(denied);
    }
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
  if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
    const denied = previewAccessDeniedPayload();
    return { ok: false, status: denied.status, error: denied.error, message: denied.message };
  }
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  if (!houseId) {
    return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per accedere allo shop." };
  }
  return { ok: true, resolved, cfg, houseId, houseMeta: houseMetaFromCfg(cfg, houseId) };
}

async function handleHogwartsShopGet(client, req, res) {
  try {
    const participant = await resolveShopParticipant(client, req);
    if (!participant.ok) return res.status(participant.status || 500).json(participant);
    const { resolved, cfg, houseId, houseMeta } = participant;
    const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      house: houseId,
      houseMeta,
      catalog: publicShopCatalog(),
      inventory: state.inventory,
      gringott: state.gringott,
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
    const { resolved, cfg, houseId, houseMeta } = participant;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const item = getShopItemById(body.itemId);
    const category = normalizeShopCategory(body.category || item?.category);
    if (!item || !category || item.category !== category) {
      return res.status(400).json({ ok: false, error: "invalid_item", message: "Oggetto shop non valido." });
    }
    const current = await getGringottBalance(resolved.guild.id, resolved.userId, cfg.eventKey);
    if (!current || current.balance < item.price) {
      return res.status(409).json({
        ok: false,
        error: "insufficient_funds",
        message: "Non hai abbastanza Galeoni per acquistare questo oggetto.",
        gringott: toPublicGringottPayload(current || { eventKey: cfg.eventKey }),
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
    const reserved = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId: resolved.guild.id,
        userId: resolved.userId,
        [`${itemPath}.id`]: { $exists: false },
      },
      {
        $set: {
          [itemPath]: purchase,
          "profile.events.hogwarts.shop.eventKey": cfg.eventKey,
          "profile.events.hogwarts.shop.updatedAt": now,
        },
        $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    if (!reserved) {
      const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
      return res.status(409).json({
        ok: false,
        error: "already_owned",
        message: "Hai già acquistato un oggetto per questa categoria.",
        inventory: state.inventory,
        gringott: state.gringott,
      });
    }
    const payment = await spendGaleoni({
      guildId: resolved.guild.id,
      userId: resolved.userId,
      amount: item.price,
      reason: `Shop Hogwarts: ${item.name}`,
      actorId: "site",
      source: "hogwarts_shop",
      eventKey: cfg.eventKey,
    });
    if (!payment?.ok) {
      await ActivityUserProfile.updateOne(
        { guildId: resolved.guild.id, userId: resolved.userId, [`${itemPath}.id`]: item.id },
        { $unset: { [itemPath]: "" }, $set: { "profile.events.hogwarts.shop.updatedAt": new Date() } },
      ).catch(() => null);
      const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
      return res.status(409).json({
        ok: false,
        error: payment?.code || "payment_failed",
        message: payment?.code === "insufficient_funds" ? "Non hai abbastanza Galeoni per acquistare questo oggetto." : "Acquisto non completato. Riprova tra poco.",
        inventory: state.inventory,
        gringott: state.gringott,
      });
    }
    const state = await getShopProfileState(resolved.guild.id, resolved.userId, cfg.eventKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      purchased: state.inventory[category],
      house: houseId,
      houseMeta,
      inventory: state.inventory,
      gringott: state.gringott,
      message: `${item.name} acquistato con successo.`,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-shop purchase:", err);
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
      if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
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

function normalizeForbiddenBookId(value) {
  const id = String(value || "").trim().toLowerCase();
  return FORBIDDEN_BOOK_IDS.includes(id) ? id : "";
}

function forbiddenEventDedupeKey(cfg) {
  return `${String(cfg?.eventKey || "").trim() || "hogwarts"}:${FORBIDDEN_EVENT_DEDUPE}`;
}

function forbiddenEventOpen(cfg) {
  const now = Date.now();
  if (cfg?.previewMode) return Number.isFinite(FORBIDDEN_END_MS) && now <= FORBIDDEN_END_MS;
  return Number.isFinite(FORBIDDEN_START_MS) && Number.isFinite(FORBIDDEN_END_MS) && now >= FORBIDDEN_START_MS && now <= FORBIDDEN_END_MS;
}

function forbiddenProgressPayload(doc, closureDoc = null) {
  const ids = Array.isArray(doc?.rawWebhook?.collectedBookIds)
    ? doc.rawWebhook.collectedBookIds.map(normalizeForbiddenBookId).filter(Boolean)
    : [];
  const unique = Array.from(new Set(ids));
  const completed = unique.length >= FORBIDDEN_BOOK_IDS.length;
  return {
    bookIds: FORBIDDEN_BOOK_IDS,
    collectedBookIds: unique,
    collectedCount: unique.length,
    requiredCount: FORBIDDEN_BOOK_IDS.length,
    completed,
    closed: String(closureDoc?.status || "") === "closed",
    closedAt: closureDoc?.rawWebhook?.closedAt || null,
    winners: Array.isArray(closureDoc?.rawWebhook?.winners) ? closureDoc.rawWebhook.winners : [],
  };
}

async function resolveForbiddenBookParticipant(client, req, options = {}) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  if (!accessToken) return { ok: false, status: 401, error: "missing_token", message: "Accedi con Discord per raccogliere i libri proibiti." };
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) return { ...resolved, status: Number(resolved.status) || 500 };
  const cfg = resolveHogwartsEventConfig(client);
  if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
    const denied = previewAccessDeniedPayload();
    return { ok: false, status: denied.status, error: denied.error, message: denied.message };
  }
  if (!forbiddenEventOpen(cfg)) {
    return { ok: false, status: 403, error: "event_closed", message: "La caccia ai libri proibiti non è attiva." };
  }
  const sorting = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  if (!houseId && options.allowPreviewViewer && cfg.previewMode) {
    return { ok: true, resolved, cfg, houseId: "", dedupeKey: forbiddenEventDedupeKey(cfg), previewViewer: true };
  }
  if (!houseId) {
    return { ok: false, status: 403, error: "not_sorted", message: "Completa prima lo smistamento per raccogliere i libri proibiti." };
  }
  return { ok: true, resolved, cfg, houseId, dedupeKey: forbiddenEventDedupeKey(cfg) };
}

async function getForbiddenClosure(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || ""),
    userId: FORBIDDEN_EVENT_OWNER_ID,
    dedupeKey,
  }).lean().catch(() => null);
}

async function getForbiddenUserDoc(guildId, userId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    dedupeKey,
  }).lean().catch(() => null);
}

async function maybeCloseForbiddenEvent(client, guildId, dedupeKey, eventKey) {
  const existingClosure = await getForbiddenClosure(guildId, dedupeKey);
  if (String(existingClosure?.status || "") === "closed") return existingClosure;
  const completed = await SiteDocument.find({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || ""),
    dedupeKey,
    status: "completed",
    userId: { $ne: FORBIDDEN_EVENT_OWNER_ID },
  }).sort({ updatedAt: 1, createdAt: 1 }).limit(40).lean().catch(() => []);
  const winners = [];
  const houses = new Set();
  for (const doc of completed) {
    const houseId = String(doc?.rawWebhook?.houseId || doc?.planKey || "").trim();
    if (!houseId || houses.has(houseId)) continue;
    houses.add(houseId);
    winners.push({ userId: String(doc.userId || ""), houseId, completedAt: doc?.rawWebhook?.completedAt || doc.updatedAt || doc.createdAt || new Date() });
    if (winners.length >= 2) break;
  }
  if (winners.length < 2) return existingClosure;
  const now = new Date();
  for (const winner of winners) {
    await addGaleoni({
      guildId,
      userId: winner.userId,
      amount: FORBIDDEN_REWARD_GALEONI,
      reason: "Avventura nella sezione proibita completata",
      actorId: "site",
      source: "hogwarts_forbidden_books",
      eventKey,
      rewardKey: `${eventKey}:forbidden_books:${winner.userId}`,
    }).catch(() => null);
  }
  const closure = await SiteDocument.findOneAndUpdate(
    { docType: FORBIDDEN_DOC, guildId: String(guildId || ""), userId: FORBIDDEN_EVENT_OWNER_ID, dedupeKey },
    {
      $setOnInsert: { docType: FORBIDDEN_DOC, guildId: String(guildId || ""), userId: FORBIDDEN_EVENT_OWNER_ID, dedupeKey, createdBy: "site" },
      $set: {
        status: "closed",
        planKey: "forbidden_section_closed",
        rawWebhook: {
          closedAt: now,
          winners,
          rewardGaleoni: FORBIDDEN_REWARD_GALEONI,
          rewardHousePoints: FORBIDDEN_REWARD_HOUSE_POINTS,
          requiredDistinctHouses: 2,
          bookIds: FORBIDDEN_BOOK_IDS,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean().catch(() => null);
  return closure || existingClosure;
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
    const participant = await resolveForbiddenBookParticipant(client, req);
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
    const closure = progress.completed ? await maybeCloseForbiddenEvent(client, resolved.guild.id, dedupeKey, cfg.eventKey) : await getForbiddenClosure(resolved.guild.id, dedupeKey);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, claimedBookId: bookId, house: houseId, ...forbiddenProgressPayload(doc, closure) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-forbidden-books claim:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();

function previewAccessDeniedPayload() {
  return {
    ok: false,
    status: 403,
    error: "preview_forbidden",
    message: "In anteprima lo smistamento è riservato all'High Staff del server.",
  };
}

function hasPreviewAccess(cfg, member, userId) {
  if (!cfg?.previewMode) return true;
  const uid = String(userId || "").trim();
  if (uid && Array.isArray(cfg.staffBypassUserIds) && cfg.staffBypassUserIds.includes(uid)) return true;
  if (!HIGH_STAFF_ROLE_ID) return false;
  return Boolean(member?.roles?.cache?.has(HIGH_STAFF_ROLE_ID));
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

    if (!HIGH_STAFF_ROLE_ID) {
      return res.status(503).json({
        ok: false,
        error: "misconfigured",
        message: "Ruolo High Staff non configurato sul bot.",
      });
    }

    if (!resolved.member?.roles?.cache?.has(HIGH_STAFF_ROLE_ID)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "In anteprima questa pagina è riservata all'High Staff del server.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, previewGate: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsHousePointsGet, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet };