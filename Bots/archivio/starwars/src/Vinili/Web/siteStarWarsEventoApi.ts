/**
 * API sito evento Star Wars.
 * Accesso: High Staff sempre; pubblico SOLO se starWarsEvent.publicEnabled=true.
 *
 * GET  /webhooks/site-evento
 * GET  /webhooks/site-evento/avvento
 * POST /webhooks/site-evento/avvento/claim
 * GET  /webhooks/site-evento/calendar
 * GET  /webhooks/site-evento/smistamento
 * POST /webhooks/site-evento/smistamento
 * GET  /webhooks/site-evento/shop
 * POST /webhooks/site-evento/shop/buy
 * POST /webhooks/site-evento/shop/attack
 * GET  /webhooks/site-evento/minigames
 * GET/POST accademia | gara | miniera | pei | traditore
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../src/Vinili"), rel);

const IDs = require(__eventCoreVinili("Config/ids"));
const { resolveWebsiteGuildMember } = require(__eventCoreVinili("site/http/siteRoleRequestApi"));
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Staff/utils/staffRoleHierarchy"));
const {
  resolveStarWarsEventConfig,
  isStarWarsPublicWindowOpen,
  isStarWarsEventLive,
  romeYmd,
} = require("../Utils/Eventi/starWarsEventConfig") as typeof import("../Utils/Eventi/starWarsEventConfig");
const {
  resolveFeatureStateNow,
  adventSlotForRomeDate,
  listCalendarDays,
  getCalendarDay,
  getAdventDayActivity,
  isFeatureUnlockedPersistent,
  FEATURES,
  EPOCHS,
} = require("../Utils/Eventi/starWarsEventCalendar") as typeof import("../Utils/Eventi/starWarsEventCalendar");
const { buildStarWarsDeckProfileSections } = require("../Services/Community/starWarsDeckProfileService") as typeof import("../Services/Community/starWarsDeckProfileService");
const {
  getStarWarsWallet,
  claimAdventDay,
  setStarWarsFaction,
  openStarWarsCrate,
  adventPublicCatalog,
  CRATE_LABELS,
} = require("../Services/Community/starWarsEventWalletService") as typeof import("../Services/Community/starWarsEventWalletService");
const {
  useStarWarsUtilityItem,
  publicUtilityCatalog,
  UTILITY_ITEM_LABELS,
} = require("../Services/Community/starWarsUtilityItemsService") as typeof import("../Services/Community/starWarsUtilityItemsService");
const {
  getPublicQuestions,
  normalizeAnswers,
  computeFactionFromAnswers,
  getFactionMeta,
  FACTION_META,
} = require("../Utils/Eventi/starWarsSortingBank") as typeof import("../Utils/Eventi/starWarsSortingBank");
const { listMinigamesStatus, REGISTRY } = require("../Utils/Eventi/starWarsMinigamesRegistry") as typeof import("../Utils/Eventi/starWarsMinigamesRegistry");

function activityPayloadForAdvent(adventDay?) {
  const raw = getAdventDayActivity(adventDay);
  if (!raw) return null;
  const byFeature = new Map<string, any>((REGISTRY || []).map((r?) => [String(r.feature), r]));
  const features = (raw.on || [])
    .map((fid?) => {
      const meta = byFeature.get(String(fid || ""));
      if (!meta) return { id: fid, label: fid, href: null, kind: "feature" };
      return {
        id: meta.id,
        feature: meta.feature,
        label: meta.label,
        href: meta.href || null,
        kind: meta.kind,
      };
    })
    .filter(Boolean);
  return {
    date: raw.date,
    at: raw.at,
    note: raw.note,
    film: raw.film,
    economyPhase: raw.economyPhase,
    features,
  };
}
const {
  getEconomySnapshot,
  buyUnit,
  attackFaction,
  unitPower,
  getFactionBank,
  attachFactionArsenalToWallet,
} = require("../Services/Community/starWarsEconomyService") as typeof import("../Services/Community/starWarsEconomyService");
const {
  getAccademiaState,
  submitAccademia,
  getGaraState,
  pickGaraPod,
  getMinieraState,
  digMiniera,
  getPuzzleState,
  startPuzzleAttempt,
  completePuzzleAttempt,
  beginPuzzleAdSession,
  finishPuzzleAdSession,
} = require("../Services/Community/starWarsSiteGamesService") as typeof import("../Services/Community/starWarsSiteGamesService");
const {
  ensureEpochAlignment,
  getPeiLeaderboard,
  getUserPeiRanks,
  getOrSpawnTraditore,
  accuseTraditore,
  grantPhaseEndRewards,
} = require("../Services/Community/starWarsTransversalService") as typeof import("../Services/Community/starWarsTransversalService");
const { publicShopCatalog } = require("../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../Utils/Eventi/starWarsEconomyCatalog");
const { factionDisplayName } = require("../Services/Community/starWarsPeiStandingService") as typeof import("../Services/Community/starWarsPeiStandingService");
const { hasStarWarsFaction } = require("../Utils/Eventi/starWarsRuntimeGate") as typeof import("../Utils/Eventi/starWarsRuntimeGate");

function bearer(raw?) {
  const v = String(raw || "").trim();
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
}

function mainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

async function resolveAuth(client?, req?) {
  const token = bearer(req.headers?.authorization);
  if (!token) return null;
  const resolved = await resolveWebsiteGuildMember(client, token).catch(() => null);
  if (!resolved?.ok) return null;
  return resolved;
}

function accessFlags(client?, auth?) {
  const cfg = resolveStarWarsEventConfig(client);
  const publicOpen = isStarWarsPublicWindowOpen(client);
  const live = isStarWarsEventLive(client);
  const highStaff = Boolean(auth?.member && memberIsHighStaffEligible(auth.member));
  const canPreview = highStaff;
  const canParticipate = publicOpen || canPreview;
  return {
    publicEnabled: Boolean(cfg.publicEnabled),
    publicOpen,
    live,
    highStaff,
    canPreview,
    canParticipate,
  };
}

function denyNotOpen(access?) {
  return {
    ok: false,
    error: "not_open",
    message: access.publicEnabled
      ? "L'evento non è ancora aperto al pubblico."
      : "Evento in anteprima High Staff — non pubblico.",
    publicEnabled: access.publicEnabled,
    publicOpen: access.publicOpen,
    highStaff: access.highStaff,
  };
}

function requireParticipate(access?, res?) {
  if (access.canParticipate) return true;
  res.status(403).json(denyNotOpen(access));
  return false;
}

function denyNotSorted() {
  return {
    ok: false,
    error: "not_sorted",
    message: "Devi prima smistarti.",
  };
}

/** Blocca azioni evento se il wallet non ha factionId (smistamento). */
function requireSmistato(wallet?, res?) {
  if (hasStarWarsFaction(wallet)) return true;
  res.status(403).json(denyNotSorted());
  return false;
}

async function handleSiteEventoStatusGet(client?, req?, res?) {
  try {
    const cfg = resolveStarWarsEventConfig(client);
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    const rome = romeYmd(new Date(), cfg.timezone);
    const features = resolveFeatureStateNow(new Date());
    const todayAdvent = adventSlotForRomeDate(new Date());
    const todayRow = getCalendarDay(rome.iso);

    let wallet = null;
    let levelCatalog = undefined;
    let standing = null;
    let factionLabel = null;
    let unitLabels = undefined;
    let armyPower = 0;
    if (access.canParticipate) {
      try {
        const { publicLevelCatalog } = require("../Services/Community/starWarsLevelService") as typeof import("../Services/Community/starWarsLevelService");
        levelCatalog = publicLevelCatalog();
      } catch (_) {}
    }
    if (auth?.userId && access.canParticipate) {
      const aligned = await ensureEpochAlignment(client, {
        guildId: mainGuildId(client),
        userId: auth.userId,
      });
      wallet = aligned.wallet || (await getStarWarsWallet(mainGuildId(client), auth.userId, cfg.eventKey));
      /* Catch-up livelli se l'utente ha già EXP evento ma non ha ancora i premi milestone. */
      try {
        const { applyStarWarsLevelProgress } = require("../Services/Community/starWarsLevelService") as typeof import("../Services/Community/starWarsLevelService");
        const prog = await applyStarWarsLevelProgress(client, {
          guildId: mainGuildId(client),
          userId: auth.userId,
        });
        if (prog?.wallet) wallet = prog.wallet;
      } catch (_) {}

      const epoch = wallet?.epoch || features.epoch || EPOCHS.CLONE_WARS;
      const factionId = wallet?.factionId || null;
      if (factionId) {
        try {
          factionLabel = factionDisplayName(epoch, factionId);
        } catch (_) {
          factionLabel = getFactionMeta(factionId)?.label || factionId;
        }
      }
      try {
        const shop = publicShopCatalog(epoch, factionId);
        unitLabels = Object.fromEntries((shop.units || []).map((u?) => [u.id, u.label]));
        if (factionId) {
          const bank = await getFactionBank(cfg.eventKey || wallet?.eventKey, factionId);
          armyPower = unitPower(bank.units || {}, epoch);
        } else {
          armyPower = 0;
        }
      } catch (_) {}
      try {
        wallet = await attachFactionArsenalToWallet(wallet, cfg.eventKey || wallet?.eventKey);
      } catch (_) {}
      try {
        standing = await getUserPeiRanks(client, {
          userId: auth.userId,
          factionId,
          pei: wallet?.pei || 0,
        });
      } catch (_) {
        standing = null;
      }
    }

    const needsSort = Boolean(auth?.userId && access.canParticipate && !hasStarWarsFaction(wallet));

    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      enabled: cfg.enabled,
      publicEnabled: access.publicEnabled,
      timezone: cfg.timezone,
      publicOpen: access.publicOpen,
      live: access.live,
      highStaff: access.highStaff,
      canPreview: access.canPreview,
      canParticipate: access.canParticipate,
      needsSort,
      romeDate: rome.iso,
      todayAdvent: access.canParticipate ? todayAdvent : null,
      features: access.canParticipate ? features : { date: rome.iso, epoch: null, economyPhase: null, economyOn: false, features: [] },
      today:
        access.canParticipate && todayRow
          ? {
              date: todayRow.date,
              advent: todayRow.advent ?? null,
              film: todayRow.film || null,
              note: todayRow.note || null,
              on: todayRow.on || [],
              off: todayRow.off || [],
            }
          : null,
      calendarDays: access.canParticipate ? listCalendarDays().length : undefined,
      crateLabels: access.canParticipate ? CRATE_LABELS : undefined,
      utilityItems: access.canParticipate ? publicUtilityCatalog() : undefined,
      utilityLabels: access.canParticipate ? UTILITY_ITEM_LABELS : undefined,
      unitLabels,
      armyPower: wallet ? armyPower : undefined,
      factionLabel,
      standing,
      levelCatalog,
      wallet,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento status:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteEventoAvventoGet(client?, req?, res?) {
  try {
    const cfg = resolveStarWarsEventConfig(client);
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;

    const todayAdvent = adventSlotForRomeDate(new Date());
    /* Fuori stagione: chiuso al pubblico; High Staff tiene anteprima illimitata. */
    if (todayAdvent == null && !access.highStaff) {
      return res.status(410).json({
        ok: false,
        error: "advent_closed",
        message: "Il calendario dell'avvento è terminato.",
        todayAdvent: null,
      });
    }
    let wallet = null;
    let claimed: Record<string, any> = {};
    if (auth?.userId) {
      wallet = await getStarWarsWallet(mainGuildId(client), auth.userId, cfg.eventKey);
      claimed = wallet.advent?.claimed || {};
    }

    const days = adventPublicCatalog().map((d?) => {
      const isClaimed = Boolean(claimed[String(d.day)]);
      const isPast = todayAdvent != null && d.day < todayAdvent;
      const isToday = todayAdvent != null && d.day === todayAdvent;
      const missed = isPast && !isClaimed && !access.highStaff;
      let canClaim = false;
      if (auth?.userId && !isClaimed) {
        if (access.highStaff) canClaim = true;
        else if (isToday) canClaim = true;
      }
      return {
        ...d,
        claimed: isClaimed,
        claimedAt: claimed[String(d.day)] || null,
        canClaim,
        missed,
        unlocked: access.highStaff || (todayAdvent != null && d.day <= todayAdvent),
        activity: activityPayloadForAdvent(d.day),
      };
    });

    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      todayAdvent,
      highStaff: access.highStaff,
      canPreview: access.canPreview,
      days,
      wallet,
      crateLabels: CRATE_LABELS,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento avvento:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteEventoAvventoClaimPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Accedi con Discord per ritirare il premio.",
      });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfg = resolveStarWarsEventConfig(client);
    const walletClaim = await getStarWarsWallet(mainGuildId(client), auth.userId, cfg.eventKey);
    if (!requireSmistato(walletClaim, res)) return;

    if (adventSlotForRomeDate(new Date()) == null && !access.highStaff) {
      return res.status(410).json({
        ok: false,
        error: "advent_closed",
        message: "Il calendario dell'avvento è terminato.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const day = Math.floor(Number(body.day));
    const out = await claimAdventDay(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      day,
      /* HS: qualsiasi giorno, anche fuori stagione. */
      staffPreview: access.highStaff,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento claim:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteEventoCalendarGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    return res.status(200).json({
      ok: true,
      days: listCalendarDays(),
      featuresNow: resolveFeatureStateNow(new Date()),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento calendar:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoSmistamentoGet(client?, req?, res?) {
  try {
    const cfg = resolveStarWarsEventConfig(client);
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;

    let wallet = null;
    if (auth?.userId) {
      wallet = await getStarWarsWallet(mainGuildId(client), auth.userId, cfg.eventKey);
    }
    const factionId = wallet?.factionId || null;
    const meta = factionId ? getFactionMeta(factionId) : null;

    return res.status(200).json({
      ok: true,
      eventKey: cfg.eventKey,
      factions: Object.values(FACTION_META),
      questions: getPublicQuestions(),
      alreadySorted: Boolean(factionId),
      factionId,
      factionMeta: meta,
      canSort: Boolean(auth?.userId) && !factionId,
      wallet,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento smistamento get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteEventoSmistamentoPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Accedi con Discord per lo smistamento.",
      });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const answers = normalizeAnswers(body.answers);
    if (!answers) {
      return res.status(400).json({
        ok: false,
        error: "invalid_answers",
        message: "Risposte non valide.",
      });
    }
    const computed = computeFactionFromAnswers(answers);
    if (!computed.ok) {
      return res.status(400).json({
        ok: false,
        error: computed.error || "invalid_answers",
        message: "Completa tutte le domande del quiz.",
        expected: computed.expected,
        got: computed.got,
      });
    }

    const out = await setStarWarsFaction(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      factionId: computed.factionId,
      epoch: EPOCHS.CLONE_WARS,
      scores: computed.scores,
    });
    if (!out.ok) {
      return res.status(Number(out.status) || 500).json({
        ...out,
        factionMeta: out.factionId ? getFactionMeta(out.factionId) : null,
      });
    }
    return res.status(200).json({
      ok: true,
      factionId: out.factionId,
      factionMeta: getFactionMeta(out.factionId),
      scores: computed.scores,
      wallet: out.wallet,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento smistamento post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteEventoShopGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    if (auth?.userId) {
      await ensureEpochAlignment(client, { guildId: mainGuildId(client), userId: auth.userId });
    }
    const snap = await getEconomySnapshot(client, {
      guildId: mainGuildId(client),
      userId: auth?.userId || null,
    });
    return res.status(200).json(snap);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento shop:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoShopBuyPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgBuy = resolveStarWarsEventConfig(client);
    const walletBuy = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgBuy.eventKey);
    if (!requireSmistato(walletBuy, res)) return;
    const snap = await getEconomySnapshot(client, { guildId: mainGuildId(client), userId: auth.userId });
    if (!snap.buyEnabled) {
      return res.status(403).json({ ok: false, error: "economy_off", message: "Acquisti non attivi." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await buyUnit(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      unitId: body.unitId || body.unit,
      qty: body.qty || 1,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento shop buy:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoShopAttackPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgAtk = resolveStarWarsEventConfig(client);
    const walletAtk = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgAtk.eventKey);
    if (!requireSmistato(walletAtk, res)) return;
    const snap = await getEconomySnapshot(client, { guildId: mainGuildId(client), userId: auth.userId });
    if (!snap.attackEnabled) {
      return res.status(403).json({ ok: false, error: "economy_off", message: "Attacchi non attivi." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await attackFaction(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      defend: Boolean(body.defend),
      useBacta: Boolean(body.useBacta),
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento shop attack:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoMinigamesGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    return res.status(200).json({
      ok: true,
      ...listMinigamesStatus(new Date()),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento minigames:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoCrateOpenPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgCrate = resolveStarWarsEventConfig(client);
    const walletCrate = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgCrate.eventKey);
    if (!requireSmistato(walletCrate, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await openStarWarsCrate(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      crateId: body.crateId || body.crate,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento crate open:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoItemUsePost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgItem = resolveStarWarsEventConfig(client);
    const walletItem = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgItem.eventKey);
    if (!requireSmistato(walletItem, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await useStarWarsUtilityItem(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      itemId: body.itemId || body.item || body.id,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento item use:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoAccademiaGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const st = await getAccademiaState(client, { guildId: mainGuildId(client), userId: auth?.userId || null });
    return res.status(200).json(st);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento accademia get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoAccademiaPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgAcc = resolveStarWarsEventConfig(client);
    const walletAcc = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgAcc.eventKey);
    if (!requireSmistato(walletAcc, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await submitAccademia(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      hits: body.hits,
      playToken: body.playToken,
      startedAt: body.startedAt,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento accademia post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoGaraGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const st = await getGaraState(client, { guildId: mainGuildId(client), userId: auth?.userId || null });
    return res.status(200).json(st);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento gara get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoGaraPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgGara = resolveStarWarsEventConfig(client);
    const walletGara = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgGara.eventKey);
    if (!requireSmistato(walletGara, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await pickGaraPod(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      podId: body.podId || body.pod,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento gara post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoMinieraGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const st = await getMinieraState(client, { guildId: mainGuildId(client), userId: auth?.userId || null });
    return res.status(200).json(st);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento miniera get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoMinieraPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgMin = resolveStarWarsEventConfig(client);
    const walletMin = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgMin.eventKey);
    if (!requireSmistato(walletMin, res)) return;
    const out = await digMiniera(client, { guildId: mainGuildId(client), userId: auth.userId });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento miniera post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoPuzzleGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const st = await getPuzzleState(client, { guildId: mainGuildId(client), userId: auth?.userId || null });
    return res.status(200).json(st);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento puzzle get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoPuzzlePost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord per giocare." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgPuz = resolveStarWarsEventConfig(client);
    const walletPuz = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgPuz.eventKey);
    if (!requireSmistato(walletPuz, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "start").trim().toLowerCase();
    const difficultyId = body.difficultyId || body.difficulty || body.id;
    if (action === "complete" || action === "claim") {
      const out = await completePuzzleAttempt(client, {
        guildId: mainGuildId(client),
        userId: auth.userId,
        difficultyId,
        attemptId: body.attemptId,
        elapsedMs: body.elapsedMs,
      });
      return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
    }
    if (action === "ad_start" || action === "ad-start") {
      const out = await beginPuzzleAdSession(client, {
        guildId: mainGuildId(client),
        userId: auth.userId,
        kind: body.kind,
        difficultyId,
        attemptId: body.attemptId,
      });
      return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
    }
    if (action === "ad_finish" || action === "ad-finish" || action === "ad_complete") {
      const out = await finishPuzzleAdSession(client, {
        guildId: mainGuildId(client),
        userId: auth.userId,
        adSessionId: body.adSessionId,
      });
      return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
    }
    const out = await startPuzzleAttempt(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      difficultyId,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento puzzle post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoPeiGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const board = await getPeiLeaderboard(client, { limit: Number(req.query?.limit) || 25 });
    return res.status(200).json(board);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento pei:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoTraditoreGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const st = await getOrSpawnTraditore(client, { guildId: mainGuildId(client) });
    /* mai rivelare spyUserId al client */
    const safe = { ...st };
    delete safe.spyUserId;
    return res.status(200).json(safe);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento traditore get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoTraditorePost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    }
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;
    const cfgTr = resolveStarWarsEventConfig(client);
    const walletTr = await getStarWarsWallet(mainGuildId(client), auth.userId, cfgTr.eventKey);
    if (!requireSmistato(walletTr, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await accuseTraditore(client, {
      guildId: mainGuildId(client),
      userId: auth.userId,
      accusedUserId: body.accusedUserId || body.userId,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento traditore post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

/** Collezioni PG + Reliquie: sblocco persistente fino a fine evento (anche se feature off). */
async function handleSiteEventoCollezioniGet(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    const access = accessFlags(client, auth);
    if (!requireParticipate(access, res)) return;

    const now = new Date();
    const featureState = resolveFeatureStateNow(now);
    const active = new Set(featureState.features || []);
    const pgUnlocked = Boolean(access.highStaff || isFeatureUnlockedPersistent(FEATURES.GAME_COLLEZIONA_PG, now));
    const relicUnlocked = Boolean(access.highStaff || isFeatureUnlockedPersistent(FEATURES.GAME_RELIQUIE, now));

    if (!pgUnlocked && !relicUnlocked) {
      return res.status(200).json({
        ok: true,
        visible: false,
        highStaff: access.highStaff,
        pg: null,
        reliquie: null,
      });
    }

    let deckSlice = { deckPG: [], deckReliquie: [] };
    let needsSort = false;
    if (auth?.userId) {
      const wallet = await getStarWarsWallet(mainGuildId(client), auth.userId);
      needsSort = !hasStarWarsFaction(wallet);
      deckSlice = {
        deckPG: Array.isArray(wallet?.deckPG) ? wallet.deckPG : [],
        deckReliquie: Array.isArray(wallet?.deckReliquie) ? wallet.deckReliquie : [],
      };
    }

    const decks = buildStarWarsDeckProfileSections(
      { profile: { events: { starwars: deckSlice } } },
      client,
      { forceVisible: true, guildId: mainGuildId(client) },
    );

    const pack = (section?, unlocked?, featureKey?) => {
      if (!unlocked || !section) return null;
      return {
        unlocked: true,
        locked: needsSort,
        active: active.has(featureKey),
        kind: section.kind,
        title: section.title,
        ownedCount: needsSort ? 0 : section.ownedCount,
        total: section.total,
        items: needsSort ? [] : section.items,
      };
    };

    return res.status(200).json({
      ok: true,
      visible: true,
      highStaff: access.highStaff,
      needsSort,
      locked: needsSort,
      message: needsSort ? "Devi prima smistarti." : undefined,
      pg: pack(decks?.pg, pgUnlocked, FEATURES.GAME_COLLEZIONA_PG),
      reliquie: pack(decks?.reliquie, relicUnlocked, FEATURES.GAME_RELIQUIE),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento collezioni:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteEventoPhaseEndPost(client?, req?, res?) {
  try {
    const auth = await resolveAuth(client, req);
    if (!auth?.userId) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }
    const access = accessFlags(client, auth);
    if (!access.highStaff) {
      return res.status(403).json({ ok: false, error: "hs_only", message: "Solo High Staff." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await grantPhaseEndRewards(client, {
      guildId: mainGuildId(client),
      phase: body.phase,
      winningFactionId: body.winningFactionId || body.factionId,
    });
    return res.status(Number(out.status) || (out.ok ? 200 : 500)).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-evento phase-end:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = {
  handleSiteEventoStatusGet,
  handleSiteEventoAvventoGet,
  handleSiteEventoAvventoClaimPost,
  handleSiteEventoCalendarGet,
  handleSiteEventoSmistamentoGet,
  handleSiteEventoSmistamentoPost,
  handleSiteEventoShopGet,
  handleSiteEventoShopBuyPost,
  handleSiteEventoShopAttackPost,
  handleSiteEventoMinigamesGet,
  handleSiteEventoCrateOpenPost,
  handleSiteEventoItemUsePost,
  handleSiteEventoAccademiaGet,
  handleSiteEventoAccademiaPost,
  handleSiteEventoGaraGet,
  handleSiteEventoGaraPost,
  handleSiteEventoMinieraGet,
  handleSiteEventoMinieraPost,
  handleSiteEventoPuzzleGet,
  handleSiteEventoPuzzlePost,
  handleSiteEventoPeiGet,
  handleSiteEventoTraditoreGet,
  handleSiteEventoTraditorePost,
  handleSiteEventoCollezioniGet,
  handleSiteEventoPhaseEndPost,
};
