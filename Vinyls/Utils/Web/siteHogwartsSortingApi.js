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
const { buildPotionsRound, normalizePotionId } = require("./hogwartsPotionsCatalog");
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
const POTIONS_PROFILE_PATH = "profile.events.hogwarts.potions";
const POTIONS_DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  startDate: "2026-08-24T00:00:00",
  cooldownMs: 12 * 60 * 60 * 1000,
  rewardGaleoni: 10,
  rewardHousePoints: 10,
  roundSize: 4,
});
const HOUSE_POINT_PERIODS = Object.freeze([
  { key: "2026-06-01_2026-06-14", start: "2026-06-01", end: "2026-06-14" },
  { key: "2026-06-15_2026-06-28", start: "2026-06-15", end: "2026-06-28" },
  { key: "2026-06-29_2026-07-12", start: "2026-06-29", end: "2026-07-12" },
  { key: "2026-07-13_2026-07-26", start: "2026-07-13", end: "2026-07-26" },
  { key: "2026-07-27_2026-08-09", start: "2026-07-27", end: "2026-08-09" },
  { key: "2026-08-10_2026-08-23", start: "2026-08-10", end: "2026-08-23" },
  { key: "2026-08-24_2026-08-31", start: "2026-08-24", end: "2026-08-31" },
]);

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

function canPreviewPotions(cfg, potionsCfg, member, userId, nowMs = Date.now()) {
  return Boolean(cfg?.previewMode) && !potionsOpen(potionsCfg, nowMs) && hasPreviewAccess(cfg, member, userId);
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
  if (!hasPreviewAccess(cfg, resolved.member, resolved.userId)) {
    const denied = previewAccessDeniedPayload();
    return { ok: false, status: denied.status, error: denied.error, message: denied.message };
  }
  const potionsCfg = resolvePotionsConfig(client);
  const previewViewer = canPreviewPotions(cfg, potionsCfg, resolved.member, resolved.userId);
  if (!potionsOpen(potionsCfg) && !previewViewer) {
    return {
      ok: false,
      status: 403,
      error: "event_not_started",
      message: "La classe di pozioni non è ancora aperta.",
      startsAt: potionsCfg.startDate,
      redirectUrl: potionsCfg.redirectUrl || "/evento/shop",
    };
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

function dateOnlyMs(value, endOfDay = false) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function housePointPeriodKey(nowMs = Date.now()) {
  const now = Number(nowMs || Date.now());
  for (const period of HOUSE_POINT_PERIODS) {
    const start = dateOnlyMs(period.start, false);
    const end = dateOnlyMs(period.end, true);
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return period.key;
  }
  return "";
}

async function awardPotionsHousePoints(guildId, houseId, eventKey, points) {
  const amount = safeInt(points, 0, 0, 1000);
  const house = String(houseId || "").trim();
  if (!amount || !HOUSES.includes(house)) return null;
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
      housePointsAward = await awardPotionsHousePoints(resolved.guild.id, houseId, cfg.eventKey, potionsCfg.rewardHousePoints);
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

module.exports = { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsHousePointsGet, handleHogwartsPotionsGet, handleHogwartsPotionsPost, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet };