/**
 * Rename + icon automatici ruoli Discord SW (stesso role id):
 * - Hunt: Cacciatore di taglie ↔ Jedi (da Ordine 66)
 * - Fazioni: Repubblica/Separatisti → Ribellione/Impero → Nuova Repubblica/Primo Ordine
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const IDs = require(__eventCoreVinili("Config/ids"));
const {
  FEATURES,
  EPOCHS,
  resolveFeatureStateNow,
  isCalendarFeatureActive,
} = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");

const HUNT_ROLE_TARGET = Object.freeze({
  bounty: "༄ Cacciatore di taglie",
  jedi: "༄ Jedi",
});

const HUNT_ROLE_ALIASES = Object.freeze([
  "༄ cacciatore di taglie",
  "cacciatore di taglie",
  "༄ jedi",
  "jedi",
]);

/** Slot fazione stabile (linea “blu” / “rossa”) → nomi per epoca. */
const FACTION_SLOT_NAMES = Object.freeze({
  [EPOCHS.CLONE_WARS]: Object.freeze({
    left: "༄ Repubblica",
    right: "༄ Separatisti",
  }),
  [EPOCHS.CIVIL_WAR]: Object.freeze({
    left: "༄ Ribellione",
    right: "༄ Impero Galattico",
  }),
  [EPOCHS.SEQUEL]: Object.freeze({
    left: "༄ Nuova Repubblica",
    right: "༄ Primo Ordine",
  }),
});

const FACTION_SLOT_ALIASES = Object.freeze({
  left: Object.freeze([
    "༄ repubblica",
    "repubblica",
    "༄ ribellione",
    "ribellione",
    "༄ nuova repubblica",
    "nuova repubblica",
  ]),
  right: Object.freeze([
    "༄ separatisti",
    "separatisti",
    "༄ impero galattico",
    "impero galattico",
    "༄ impero",
    "impero",
    "༄ primo ordine",
    "primo ordine",
    "༄ nuovo ordine",
    "nuovo ordine",
  ]),
});

const ROLE_ICON_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const ROLE_ICON_V = "20261104ri2";

/** Chiavi icona per epoca / hunt phase. */
const FACTION_SLOT_ICONS = Object.freeze({
  [EPOCHS.CLONE_WARS]: Object.freeze({
    left: `${ROLE_ICON_CDN}/role-icon-repubblica.png?v=${ROLE_ICON_V}`,
    right: `${ROLE_ICON_CDN}/role-icon-separatisti.png?v=${ROLE_ICON_V}`,
  }),
  [EPOCHS.CIVIL_WAR]: Object.freeze({
    left: `${ROLE_ICON_CDN}/role-icon-ribellione.png?v=${ROLE_ICON_V}`,
    right: `${ROLE_ICON_CDN}/role-icon-impero.png?v=${ROLE_ICON_V}`,
  }),
  [EPOCHS.SEQUEL]: Object.freeze({
    left: `${ROLE_ICON_CDN}/role-icon-nuova-repubblica.png?v=${ROLE_ICON_V}`,
    right: `${ROLE_ICON_CDN}/role-icon-primo-ordine.png?v=${ROLE_ICON_V}`,
  }),
});

const HUNT_ROLE_ICONS = Object.freeze({
  bounty: `${ROLE_ICON_CDN}/role-icon-cacciatore.png?v=${ROLE_ICON_V}`,
  jedi: `${ROLE_ICON_CDN}/role-icon-jedi.png?v=${ROLE_ICON_V}`,
});

const iconBufferCache = new Map();
/** Guild senza ROLE_ICONS (es. test): non ritentare setIcon ogni tick. */
const iconBlockedGuildIds = new Set();

function normalizeId(v?) {
  return String(v || "").trim();
}

function mainGuildId() {
  return normalizeId(IDs.guilds?.main);
}

/** Icone ruolo solo sul server main (serve boost L2+ / ROLE_ICONS). Rename ok anche sul test. */
function guildAllowsRoleIcons(guild?) {
  const gid = normalizeId(guild?.id || guild);
  return Boolean(gid && gid === mainGuildId());
}

function bareRoleName(name?) {
  return String(name || "")
    .normalize("NFC")
    .replace(/^༄\s*/u, "")
    .trim()
    .toLowerCase();
}

function fullRoleKey(name?) {
  return String(name || "").normalize("NFC").trim().toLowerCase();
}

function findRoleByAliases(guild?, aliases?) {
  if (!guild?.roles?.cache) return null;
  const wanted = new Set((Array.isArray(aliases) ? aliases : []).map((a?) => fullRoleKey(a)).filter(Boolean));
  const bareWanted = new Set(
    [...wanted].map((a?) => a.replace(/^༄\s*/u, "").trim()).filter(Boolean),
  );
  for (const role of guild.roles.cache.values()) {
    const full = fullRoleKey(role?.name);
    const bare = bareRoleName(role?.name);
    if (wanted.has(full) || bareWanted.has(bare)) return role;
  }
  return null;
}

function desiredHuntRoleName(now = new Date()) {
  /* Da attivazione Ordine 66 in poi → Jedi; prima → Cacciatore (anche durante il minigame omonimo). */
  const ordineOnOrPast =
    isCalendarFeatureActive(FEATURES.MINIGAME_ORDINE66, now) ||
    romePastOrdine66Start(now);
  return ordineOnOrPast ? HUNT_ROLE_TARGET.jedi : HUNT_ROLE_TARGET.bounty;
}

function desiredHuntRoleKey(now = new Date()) {
  return desiredHuntRoleName(now) === HUNT_ROLE_TARGET.jedi ? "jedi" : "bounty";
}

function romePastOrdine66Start(now = new Date()) {
  const { romeDateTimeStamp } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
  return romeDateTimeStamp(now) >= "2026-12-24T12:00";
}

async function fetchIconBuffer(url?) {
  const u = String(url || "").trim();
  if (!u) return null;
  if (iconBufferCache.has(u)) return iconBufferCache.get(u);
  try {
    const res = await fetch(u, { redirect: "follow" });
    if (!res?.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length || buf.length > 256 * 1024) return null;
    iconBufferCache.set(u, buf);
    return buf;
  } catch (_) {
    return null;
  }
}

async function renameRoleIfNeeded(role?, wantedName?, reason?) {
  if (!role || !wantedName) return { ok: false, changed: false };
  const cur = String(role.name || "").normalize("NFC").trim();
  const want = String(wantedName).normalize("NFC").trim();
  if (cur === want) return { ok: true, changed: false, roleId: role.id, name: cur };
  const edited = await role.setName(want, reason || "SW calendar role rename").then(() => true).catch(() => false);
  return { ok: edited, changed: edited, roleId: role.id, name: want, from: cur };
}

/**
 * Imposta icona ruolo da URL CDN (richiede ROLE_ICONS sul server).
 * Confronta hash grezzo del buffer con icona attuale quando possibile.
 */
async function setRoleIconIfNeeded(role?, iconUrl?, reason?) {
  if (!role || !iconUrl) return { ok: false, changed: false };
  if (typeof role.setIcon !== "function") return { ok: false, changed: false, error: "no_setIcon" };
  const gid = normalizeId(role.guild?.id || role.guildId);
  if (!guildAllowsRoleIcons(gid)) {
    return { ok: true, changed: false, skipped: true, reason: "icons_main_only", guildId: gid };
  }
  if (gid && iconBlockedGuildIds.has(gid)) {
    return { ok: false, changed: false, skipped: true, reason: "icons_blocked", guildId: gid };
  }
  const buf = await fetchIconBuffer(iconUrl);
  if (!buf) return { ok: false, changed: false, error: "icon_fetch_failed", url: iconUrl };

  const currentHash = String(role.icon || role.iconHash || "").trim();
  const stamp = `swicon:${buf.length}:${buf[0]}:${buf[Math.floor(buf.length / 2)]}:${buf[buf.length - 1]}`;
  /* Se già settata e marker in memoria matcha, skip. */
  if ((role as any).__swIconStamp === stamp && currentHash) {
    return { ok: true, changed: false, roleId: role.id };
  }

  const edited = await role
    .setIcon(buf, reason || "SW calendar role icon")
    .then(() => true)
    .catch((err?) => {
      const code = err?.code || err?.rawError?.code;
      /* 50101: server senza boost ROLE_ICONS — stop retry su questo guild. */
      if (Number(code) === 50101 && gid) iconBlockedGuildIds.add(gid);
      global.logger?.warn?.("[SW ROLE ICON]", role?.id, err?.message || err, code || "");
      return false;
    });
  if (edited) (role as any).__swIconStamp = stamp;
  return { ok: edited, changed: edited, roleId: role.id, url: iconUrl };
}

async function syncHuntRoleOnGuild(guild?, now = new Date()) {
  if (!guild) return { ok: false };
  await guild.roles.fetch().catch(() => null);
  const role = findRoleByAliases(guild, HUNT_ROLE_ALIASES);
  if (!role) return { ok: false, error: "no_hunt_role" };
  const key = desiredHuntRoleKey(now);
  const name = await renameRoleIfNeeded(role, desiredHuntRoleName(now), "SW: Cacciatore↔Jedi");
  const icon = await setRoleIconIfNeeded(role, HUNT_ROLE_ICONS[key], "SW: hunt role icon");
  return { ok: true, name, icon, key };
}

async function syncFactionRolesOnGuild(guild?, now = new Date()) {
  if (!guild) return { ok: false, changed: 0 };
  await guild.roles.fetch().catch(() => null);
  const epoch = resolveFeatureStateNow(now).epoch || EPOCHS.CLONE_WARS;
  const names = FACTION_SLOT_NAMES[epoch] || FACTION_SLOT_NAMES[EPOCHS.CLONE_WARS];
  const icons = FACTION_SLOT_ICONS[epoch] || FACTION_SLOT_ICONS[EPOCHS.CLONE_WARS];
  const left = findRoleByAliases(guild, FACTION_SLOT_ALIASES.left);
  const right = findRoleByAliases(guild, FACTION_SLOT_ALIASES.right);
  const results = [];
  if (left) {
    results.push(await renameRoleIfNeeded(left, names.left, `SW fazione epoch ${epoch}`));
    results.push(await setRoleIconIfNeeded(left, icons.left, `SW fazione icon ${epoch}`));
  }
  if (right) {
    results.push(await renameRoleIfNeeded(right, names.right, `SW fazione epoch ${epoch}`));
    results.push(await setRoleIconIfNeeded(right, icons.right, `SW fazione icon ${epoch}`));
  }
  return {
    ok: true,
    epoch,
    changed: results.filter((r?) => r.changed).length,
    results,
  };
}

/** @deprecated alias → syncHuntRoleOnGuild */
async function syncHuntRoleNameOnGuild(guild?, now = new Date()) {
  return syncHuntRoleOnGuild(guild, now);
}

/** @deprecated alias → syncFactionRolesOnGuild */
async function syncFactionRoleNamesOnGuild(guild?, now = new Date()) {
  return syncFactionRolesOnGuild(guild, now);
}

function eventGuildIds() {
  return [...new Set([normalizeId(IDs.guilds?.main), normalizeId(IDs.guilds?.test)].filter(Boolean))];
}

async function syncStarWarsCalendarRoleNames(client?, now = new Date()) {
  if (!client) return { ok: false };
  const out = { ok: true, guilds: [] };
  for (const gid of eventGuildIds()) {
    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) continue;
    const hunt = await syncHuntRoleOnGuild(guild, now);
    const factions = await syncFactionRolesOnGuild(guild, now);
    out.guilds.push({ guildId: gid, hunt, factions });
  }
  return out;
}

function resolveHuntTargetRole(guild?) {
  return findRoleByAliases(guild, HUNT_ROLE_ALIASES);
}

export = {
  HUNT_ROLE_TARGET,
  HUNT_ROLE_ICONS,
  FACTION_SLOT_NAMES,
  FACTION_SLOT_ICONS,
  desiredHuntRoleName,
  resolveHuntTargetRole,
  syncHuntRoleNameOnGuild,
  syncFactionRoleNamesOnGuild,
  syncHuntRoleOnGuild,
  syncFactionRolesOnGuild,
  syncStarWarsCalendarRoleNames,
};
