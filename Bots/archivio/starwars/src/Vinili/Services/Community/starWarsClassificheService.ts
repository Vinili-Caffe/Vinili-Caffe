/**
 * Classifiche evento SW: EXP fazione + top PEI/EXP (periodo e fase).
 * Fase = delta vs baseline podio (stesso snapshot fine-epoca).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili(
  "Community/schemas/communitySchemas",
)) as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const IDs = require(__eventCoreVinili("Config/ids"));
const {
  resolveStarWarsEventConfig,
} = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const {
  EPOCHS,
  resolveFeatureStateNow,
} = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { ROOT } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { FACTION_SLOT_NAMES } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const BASELINE_OWNER = "__starwars_phase_podium_baseline__";

const EPOCH_LABELS = Object.freeze({
  [EPOCHS.CLONE_WARS]: "Clone Wars",
  [EPOCHS.CIVIL_WAR]: "Guerra Civile",
  [EPOCHS.SEQUEL]: "Sequel",
});

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}
function safeNum(v?, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function factionDisplayName(epoch?, factionId?) {
  const names = FACTION_SLOT_NAMES[epoch] || FACTION_SLOT_NAMES[EPOCHS.CLONE_WARS];
  const fid = normalizeId(factionId).toLowerCase();
  const leftIds = ["repubblica", "ribellione", "nuova_repubblica"];
  const rightIds = ["separatisti", "impero", "nuovo_ordine"];
  if (leftIds.includes(fid)) return String(names.left || fid).replace(/^༄\s*/u, "").trim();
  if (rightIds.includes(fid)) return String(names.right || fid).replace(/^༄\s*/u, "").trim();
  return fid || "Fazione";
}

function baselineDedupe(eventKey?) {
  return `phase_podium_baseline_${String(eventKey || ADVENT_EVENT_KEY)}`;
}

async function loadBaselineUsers(eventKey?) {
  const doc = await SiteDocument.findOne({
    docType: DOC_TYPE,
    ownerId: BASELINE_OWNER,
    dedupeKey: baselineDedupe(eventKey),
  })
    .lean()
    .catch(() => null);
  const users = doc?.payload?.users;
  return users && typeof users === "object" ? users : {};
}

async function loadAllPlayers(eventKey?) {
  const rows = await ActivityUserProfile.find({
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.factionId`]: { $exists: true, $nin: [null, ""] },
  })
    .select(`userId ${ROOT}.factionId ${ROOT}.exp ${ROOT}.pei ${ROOT}.credits`)
    .lean()
    .catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .map((r?) => {
      const sw = r?.profile?.events?.starwars || {};
      return {
        userId: normalizeId(r?.userId),
        factionId: normalizeId(sw.factionId).toLowerCase() || null,
        exp: safeInt(sw.exp),
        pei: safeNum(sw.pei),
        credits: safeInt(sw.credits),
      };
    })
    .filter((p?) => p.userId && p.factionId);
}

async function enrichIdentities(client?, userIds: string[] = []) {
  const out: Record<string, { displayName: string; avatarUrl: string | null }> = {};
  const ids = [...new Set(userIds.map(normalizeId).filter(Boolean))];
  if (!ids.length) return out;
  const guildId = walletGuildId(client);
  const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
  for (const uid of ids) {
    let member = guild?.members?.cache?.get(uid) || null;
    if (!member && guild?.members?.fetch) {
      member = await guild.members.fetch(uid).catch(() => null);
    }
    const user = member?.user;
    const displayName =
      String(member?.displayName || user?.globalName || user?.username || "").trim() || uid;
    let avatarUrl = null;
    try {
      avatarUrl = user?.displayAvatarURL?.({ size: 64, extension: "png" }) || null;
    } catch (_) {
      avatarUrl = null;
    }
    out[uid] = { displayName, avatarUrl };
  }
  return out;
}

function withIdentity(row?, identities?) {
  const id = normalizeId(row?.userId);
  const idn = identities?.[id] || {};
  return {
    ...row,
    displayName: idn.displayName || id,
    avatarUrl: idn.avatarUrl || null,
  };
}

function rankUsers(players?, metric?, limit = 5) {
  const list = (Array.isArray(players) ? players.slice() : []).filter(
    (p?) => Number(p?.[metric] || 0) > 0,
  );
  list.sort((a, b) => {
    const av = Number(a?.[metric] || 0);
    const bv = Number(b?.[metric] || 0);
    if (bv !== av) return bv - av;
    return String(a.userId).localeCompare(String(b.userId));
  });
  return list.slice(0, Math.max(1, Math.min(25, limit))).map((p?, i?) => ({
    rank: i + 1,
    userId: p.userId,
    factionId: p.factionId || null,
    value: metric === "pei" ? safeNum(p.pei) : safeInt(p[metric]),
    exp: safeInt(p.exp),
    pei: safeNum(p.pei),
  }));
}

function factionBoard(players?, factions?, epoch?, metric = "exp") {
  const buckets = {};
  for (const f of factions) {
    buckets[f] = {
      factionId: f,
      label: factionDisplayName(epoch, f),
      value: 0,
      members: 0,
    };
  }
  for (const p of players || []) {
    const b = buckets[p.factionId];
    if (!b) continue;
    b.value += metric === "pei" ? safeNum(p.pei) : safeInt(p.exp);
    b.members += 1;
  }
  return factions
    .map((f?) => buckets[f])
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "it"))
    .map((row?, i?) => ({ ...row, rank: i + 1 }));
}

function applyBaseline(players?, baseline?) {
  return (players || []).map((p?) => {
    const base = baseline?.[p.userId] || {};
    return {
      ...p,
      exp: Math.max(0, safeInt(p.exp) - safeInt(base.exp)),
      pei: Math.max(0, safeNum(p.pei) - safeNum(base.pei)),
    };
  });
}

/**
 * Snapshot classifiche per il sito.
 */
async function getClassificheBoard(client?, { viewerUserId = null } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const state = resolveFeatureStateNow(new Date());
  const epoch = state.epoch || EPOCHS.CLONE_WARS;
  const factions = EPOCH_FACTIONS[epoch] || EPOCH_FACTIONS[EPOCHS.CLONE_WARS];

  const players = await loadAllPlayers(eventKey);
  const baseline = await loadBaselineUsers(eventKey);
  const phasePlayers = applyBaseline(players, baseline);

  const peiPeriod = rankUsers(players, "pei", 5);
  const peiPhase = rankUsers(phasePlayers, "pei", 5);
  const expPeriod = rankUsers(players, "exp", 5);
  const expPhase = rankUsers(phasePlayers, "exp", 5);

  const needIds = [
    ...peiPeriod,
    ...peiPhase,
    ...expPeriod,
    ...expPhase,
  ].map((r?) => r.userId);
  if (viewerUserId) needIds.push(normalizeId(viewerUserId));
  const identities = await enrichIdentities(client, needIds);

  const mapTop = (rows?) => (rows || []).map((r?) => withIdentity(r, identities));

  let me = null;
  const vid = normalizeId(viewerUserId);
  if (vid) {
    const self = players.find((p?) => p.userId === vid) || null;
    if (self) {
      const byPei = players.slice().sort((a, b) => b.pei - a.pei || a.userId.localeCompare(b.userId));
      const byExp = players.slice().sort((a, b) => b.exp - a.exp || a.userId.localeCompare(b.userId));
      me = withIdentity(
        {
          userId: vid,
          factionId: self.factionId,
          exp: self.exp,
          pei: self.pei,
          peiRank: byPei.findIndex((p?) => p.userId === vid) + 1 || null,
          expRank: byExp.findIndex((p?) => p.userId === vid) + 1 || null,
        },
        identities,
      );
    }
  }

  return {
    ok: true,
    eventKey,
    epoch,
    epochLabel: EPOCH_LABELS[epoch] || epoch,
    boards: {
      factionExpPeriod: factionBoard(players, factions, epoch, "exp"),
      factionExpPhase: factionBoard(phasePlayers, factions, epoch, "exp"),
      peiPeriod: mapTop(peiPeriod),
      peiPhase: mapTop(peiPhase),
      expPeriod: mapTop(expPeriod),
      expPhase: mapTop(expPhase),
    },
    me,
  };
}

export = {
  getClassificheBoard,
};
