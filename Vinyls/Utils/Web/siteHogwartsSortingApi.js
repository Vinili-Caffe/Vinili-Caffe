const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { getPublicQuestions, normalizeAnswers, computeHouseFromAnswers, getHouseMeta, HOUSES } = require("./hogwartsSortingBank");
const { resolveHogwartsEventConfig, isEventWindowOpen, formatEventWindowIt } = require("./hogwartsSortingConfig");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;

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
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      event: buildEventPayload(cfg, windowState),
      canSort: Boolean(windowState.open) && !houseId,
      alreadySorted: Boolean(houseId),
      house: houseId || null,
      houseMeta: meta,
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
      return res.status(409).json({
        ok: false,
        error: "already_sorted",
        message: `Hai già completato lo smistamento (${meta?.label || existing.status}).`,
        house: String(existing.status),
        houseMeta: meta,
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
    const roleResult = await assignHouseRoles(resolved.member, cfg, houseId);

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
        answerCount: answers.length,
        roleResult,
      },
    }).catch((err) => {
      if (String(err?.code) === "11000") return null;
      throw err;
    });

    const after = await findExistingSort(resolved.guild.id, resolved.userId, cfg.eventKey);
    if (!after?.status) {
      return res.status(500).json({ ok: false, error: "save_failed", message: "Impossibile salvare lo smistamento." });
    }

    return res.status(200).json({
      ok: true,
      house: houseId,
      houseMeta: meta,
      roleAssigned: Boolean(roleResult?.roleAssigned),
      message: meta
        ? `Il Cappello Parlante ti assegna ${meta.label}!${roleResult?.roleAssigned ? " Ruolo applicato su Discord." : ""}`
        : "Smistamento completato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] hogwarts-sorting submit:", err);
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

module.exports = { handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet };