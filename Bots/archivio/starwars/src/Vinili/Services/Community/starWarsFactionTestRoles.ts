/**
 * Su server test: sincronizza ruoli Discord fazione dallo smistamento in DB.
 * Nomi: ༄ Repubblica / ༄ Separatisti. Mai sul main.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const IDs = require(__eventCoreVinili("Config/ids"));

const SW_FACTION_PATH = "profile.events.starwars.factionId";

const FACTION_ROLE_NAMES = Object.freeze({
  repubblica: "༄ Repubblica",
  separatisti: "༄ Separatisti",
  ribellione: "༄ Ribellione",
  impero: "༄ Impero Galattico",
  nuova_repubblica: "༄ Nuova Repubblica",
  nuovo_ordine: "༄ Primo Ordine",
});

const FACTION_SLOT = Object.freeze({
  left: Object.freeze(["repubblica", "ribellione", "nuova_repubblica"]),
  right: Object.freeze(["separatisti", "impero", "nuovo_ordine"]),
});

function normalizeId(v?) {
  return String(v || "").trim();
}

function testGuildId() {
  return normalizeId(IDs.guilds?.test);
}

function walletGuildId(client?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  return normalizeId(IDs.guilds?.main);
}

function normalizeFactionId(factionId?) {
  const f = normalizeId(factionId).toLowerCase();
  if (FACTION_SLOT.left.includes(f)) return "repubblica";
  if (FACTION_SLOT.right.includes(f)) return "separatisti";
  return "";
}

function resolveFactionRoleByName(guild?, factionId?) {
  if (!guild?.roles?.cache) return null;
  const slot = normalizeFactionId(factionId);
  if (!slot) return null;
  try {
    const { resolveFeatureStateNow, EPOCHS } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
    const { FACTION_SLOT_NAMES } = require("./starWarsCalendarRoleSync") as typeof import("./starWarsCalendarRoleSync");
    const epoch = resolveFeatureStateNow(new Date()).epoch || EPOCHS.CLONE_WARS;
    const names = FACTION_SLOT_NAMES[epoch] || FACTION_SLOT_NAMES[EPOCHS.CLONE_WARS];
    const wantName = String(slot === "repubblica" ? names.left : names.right)
      .normalize("NFC")
      .trim()
      .toLowerCase();
    const aliases =
      slot === "repubblica"
        ? ["༄ Repubblica", "༄ Ribellione", "༄ Nuova Repubblica", "Repubblica", "Ribellione", "Nuova Repubblica"]
        : ["༄ Separatisti", "༄ Impero Galattico", "༄ Primo Ordine", "Separatisti", "Impero Galattico", "Primo Ordine", "Impero"];
    const wanted = new Set(aliases.map((a?) => String(a).normalize("NFC").trim().toLowerCase()));
    const bareWanted = new Set([...wanted].map((a?) => a.replace(/^༄\s*/u, "").trim()));
    for (const role of guild.roles.cache.values()) {
      const full = String(role?.name || "").normalize("NFC").trim().toLowerCase();
      const bare = full.replace(/^༄\s*/u, "").trim();
      if (wanted.has(full) || bareWanted.has(bare) || full === wantName) {
        return role;
      }
    }
  } catch (_) {}
  const wanted = String(FACTION_ROLE_NAMES[slot] || "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  return (
    [...guild.roles.cache.values()].find((r?) => {
      const bare = String(r?.name || "")
        .normalize("NFC")
        .replace(/^༄\s*/u, "")
        .trim()
        .toLowerCase();
      const full = String(r?.name || "").normalize("NFC").trim().toLowerCase();
      return full === wanted || bare === wanted.replace(/^༄\s*/u, "").trim();
    }) || null
  );
}

function allFactionRoles(guild?) {
  return {
    repubblica: resolveFactionRoleByName(guild, "repubblica"),
    separatisti: resolveFactionRoleByName(guild, "separatisti"),
  };
}

/** Assegna/allinea ruolo fazione su server test da factionId DB. */
async function applyStarWarsFactionRoleOnTest(client?, { userId, factionId } = {}) {
  const uid = normalizeId(userId);
  const fid = normalizeFactionId(factionId);
  const tg = testGuildId();
  if (!client || !uid || !fid || !tg) return { ok: false, error: "bad_args" };

  const guild = client.guilds.cache.get(tg) || (await client.guilds.fetch(tg).catch(() => null));
  if (!guild) return { ok: false, error: "no_test_guild" };

  await guild.roles.fetch().catch(() => null);
  const roles = allFactionRoles(guild);
  const targetRole = roles[fid];
  if (!targetRole) return { ok: false, error: "no_role", factionId: fid };

  const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  if (!member) return { ok: false, error: "not_in_test_guild" };

  const otherId = fid === "repubblica" ? "separatisti" : "repubblica";
  const otherRole = roles[otherId];
  if (otherRole && member.roles.cache.has(otherRole.id)) {
    await member.roles.remove(otherRole, "SW smistamento test — swap fazione").catch(() => null);
  }
  if (!member.roles.cache.has(targetRole.id)) {
    const added = await member.roles.add(targetRole, "SW smistamento test — da DB").then(() => true).catch(() => false);
    if (!added) return { ok: false, error: "role_add_failed", roleId: targetRole.id };
  }
  return { ok: true, guildId: tg, roleId: targetRole.id, factionId: fid };
}

/** Legge smistati dal DB (wallet main) e assegna ruoli sul server test. */
async function syncStarWarsFactionRolesOnTestFromDb(client?) {
  const tg = testGuildId();
  if (!client || !tg) return { ok: false, error: "bad_args", synced: 0 };

  const profileGuild = walletGuildId(client);
  const rows = await ActivityUserProfile.find({
    guildId: { $in: [profileGuild, tg].filter(Boolean) },
    [SW_FACTION_PATH]: { $exists: true, $nin: [null, ""] },
  })
    .select({ userId: 1, "profile.events.starwars.factionId": 1 })
    .lean()
    .catch(() => []);

  let synced = 0;
  let skipped = 0;
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = normalizeId(row?.userId);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const faction = normalizeFactionId(row?.profile?.events?.starwars?.factionId);
    if (!faction) {
      skipped += 1;
      continue;
    }
    const res = await applyStarWarsFactionRoleOnTest(client, { userId: uid, factionId: faction });
    if (res.ok) synced += 1;
    else skipped += 1;
  }
  return { ok: true, synced, skipped, testGuildId: tg, profileGuild };
}

export = {
  FACTION_ROLE_NAMES,
  testGuildId,
  walletGuildId,
  normalizeFactionId,
  resolveFactionRoleByName,
  applyStarWarsFactionRoleOnTest,
  syncStarWarsFactionRolesOnTestFromDb,
};
