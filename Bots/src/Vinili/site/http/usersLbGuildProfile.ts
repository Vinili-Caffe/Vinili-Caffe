/**
 * Profilo per server (sito → /user/?id=…&g=…).
 *  - serverInComune: i server dove ci siete sia tu sia la persona del profilo (e il bot). Mai gli altri:
 *    un profilo non deve rivelare in quali server sta qualcuno.
 *  - profiloNelServer: nome e foto in quel server, da quando c'è, compleanno (se lo vuole mostrare lì),
 *    se è Partner Manager (ruolo impostato nella Partnership di quel server).
 * Tutto con il login e solo se chi guarda è nel server. Membri e ruoli si chiedono a Discord:
 * il processo del sito non tiene in memoria tutti i server del bot.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");

const isId = (v?) => /^\d{16,22}$/.test(String(v || ""));

function tokenOf(req?) {
  return String(req?.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

async function viewerIdOf(req?) {
  const token = tokenOf(req);
  if (!token) return "";
  const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");
  const me: any = await fetchDiscordOAuthMe(token).catch(() => null);
  return String(me?.me?.id || "");
}

/**
 * Chiamata REST del bot che non lancia mai: null se la connessione non c'è o Discord risponde errore.
 * (nel processo del sito la REST può stare in client._rest; senza, la pagina dava errore 500)
 */
async function restGet(client?, route?: string, options?: any): Promise<any | null> {
  try {
    const rest = client?._rest || client?.rest;
    if (!rest?.get) return null;
    return await rest.get(route, options);
  } catch (_) {
    return null;
  }
}

async function memberOf(client?, guildId?, userId?): Promise<any | null> {
  if (!isId(guildId) || !isId(userId)) return null;
  return restGet(client, Routes.guildMember(String(guildId), String(userId)));
}

/** Server in comune tra chi guarda e la persona del profilo (con il bot dentro). */
async function sharedGuilds(client?, req?, targetId?, mainId?) {
  const token = tokenOf(req);
  if (!token) return { status: 401, body: { ok: false, error: "missing_token", message: "Accedi per vedere gli altri server." } };
  const D = require("../../../MultiGuild/site/dashboard/siteDashboardApi") as any;
  const mine: any = await D.fetchUserGuilds(token).catch(() => null);
  if (!mine?.ok) return { status: Number(mine?.status) || 503, body: { ok: false, error: mine?.error || "guilds_failed", message: mine?.message || "Non riesco a leggere i tuoi server." } };
  const viewerId = await viewerIdOf(req);
  const botIds: Set<string> = D.buildKnownBotGuildIdSet(client);
  let list = (mine.guilds as any[]).filter((g) => botIds.has(String(g.id))).slice(0, 40);
  /* profilo di un altro: solo i server dove c'è anche lui */
  if (isId(targetId) && String(targetId) !== viewerId) {
    const checks = await Promise.all(list.map((g) => memberOf(client, g.id, targetId).then(Boolean)));
    list = list.filter((_, i) => checks[i]);
  }
  const guilds = list
    .map((g) => ({
      id: String(g.id),
      name: String(g.name || ""),
      iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
      isMain: String(g.id) === String(mainId),
    }))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name, "it"));
  return { status: 200, body: { ok: true, guilds } };
}

/** Profilo della persona in un server (diverso dal principale). */
async function guildProfile(client?, req?, guildId?, targetId?, mainId?) {
  const viewerId = await viewerIdOf(req);
  if (!viewerId) return { status: 401, body: { ok: false, error: "missing_token", message: "Accedi per vedere gli altri server." } };
  if (!(await memberOf(client, guildId, viewerId))) {
    return { status: 403, body: { ok: false, error: "not_member", message: "Puoi vedere solo i server dove sei anche tu." } };
  }
  const m: any = await memberOf(client, guildId, targetId);
  if (!m?.user) return { status: 404, body: { ok: false, error: "not_found", message: "Non è in questo server." } };
  const u = m.user;
  const avatarUrl = m.avatar
    ? `https://cdn.discordapp.com/guilds/${guildId}/users/${u.id}/avatars/${m.avatar}.png?size=256`
    : u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) >> 22n) % 6}.png`;

  /* Partner Manager: il ruolo scelto nella Partnership di quel server (solo col modulo Partnership acceso) */
  const pmRole = await pmRoleOf(guildId);
  const isPartnerManager = Boolean(pmRole && Array.isArray(m.roles) && m.roles.includes(pmRole));

  /* compleanno: uno per persona; fuori dal principale solo se ha scelto "in tutti i miei server" */
  let birthday: any = null;
  try {
    const { getBirthdayProfile } = require("../../Community/services/profileStore") as any;
    const { buildPublicBirthdayPayload } = require("./usersLbBirthdays") as any;
    const { getRomeDateParts } = require("../../Community/services/birthdayService") as any;
    const b: any = await getBirthdayProfile(String(mainId), String(targetId)).catch(() => null);
    if (b && (String(b.announceScope || "all") === "all")) birthday = buildPublicBirthdayPayload(b, getRomeDateParts());
  } catch (_) {}

  let guildName = "";
  try {
    const g: any = await restGet(client, Routes.guild(String(guildId)));
    guildName = String(g?.name || "");
  } catch (_) {}

  return {
    status: 200,
    body: {
      ok: true,
      guild: { id: String(guildId), name: guildName },
      profile: {
        userId: String(u.id),
        username: String(u.username || ""),
        displayName: String(m.nick || u.global_name || u.username || "").trim(),
        avatarUrl,
        joinedAt: m.joined_at || null,
        isPartnerManager,
        birthday,
      },
    },
  };
}

/* ───────────── Partner Manager di un server ───────────── */

const partnershipOn = (guildId?) => {
  try {
    return (require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(String(guildId || ""), "partnership");
  } catch (_) {
    return false;
  }
};

async function pmRoleOf(guildId?) {
  if (!partnershipOn(guildId)) return "";
  try {
    const R = require("../../Partner/core/partnershipConfigResolver") as any;
    const id = String(R.getPartnerManagerRoleId?.(String(guildId)) || "");
    if (id) return id;
  } catch (_) {}
  try {
    const P = require("../../Partner/core/tenantPartnershipSettings") as any;
    const cfg: any = await P.getPartnershipConfig(String(guildId)).catch(() => null);
    return String(cfg?.partnerManagerRoleId || "");
  } catch (_) {
    return "";
  }
}

const memberAvatar = (guildId: string, m: any) => {
  const u = m?.user || {};
  if (m?.avatar) return `https://cdn.discordapp.com/guilds/${guildId}/users/${u.id}/avatars/${m.avatar}.png?size=64`;
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  return null;
};

/** Partner Manager del server (per "Lista staff"): membri con il ruolo scelto nella Partnership. 5 minuti in memoria. */
const pmListCache = new Map<string, { at: number; list: any[] }>();
async function partnerManagers(client?, guildId?, roleId?) {
  const key = `${guildId}:${roleId}`;
  const hit = pmListCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.list;
  const out: any[] = [];
  let after = "0";
  for (let page = 0; page < 5; page++) {
    const rows: any[] = (await restGet(client, Routes.guildMembers(String(guildId)), { query: new URLSearchParams({ limit: "1000", after }) })) || [];
    if (!Array.isArray(rows) || !rows.length) break;
    for (const m of rows) {
      if (!m?.user?.bot && Array.isArray(m.roles) && m.roles.includes(roleId) && isOnlyPmOnMain(guildId, m.roles)) {
        out.push({ userId: String(m.user.id), displayName: String(m.nick || m.user.global_name || m.user.username || ""), avatarUrl: memberAvatar(String(guildId), m) });
      }
    }
    if (rows.length < 1000) break;
    after = String(rows[rows.length - 1]?.user?.id || after);
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));
  pmListCache.set(key, { at: Date.now(), list: out });
  return out;
}

/** La tab Staff di un Partner Manager in un server: le statistiche di +profile. */
async function guildStaff(client?, req?, guildId?, targetId?) {
  const viewerId = await viewerIdOf(req);
  if (!viewerId) return { status: 401, body: { ok: false, error: "missing_token", message: "Accedi per vedere lo staff." } };
  if (!(await memberOf(client, guildId, viewerId))) {
    return { status: 403, body: { ok: false, error: "not_member", message: "Puoi vedere solo i server dove sei anche tu." } };
  }
  const roleId = await pmRoleOf(guildId);
  const m: any = roleId ? await memberOf(client, guildId, targetId) : null;
  if (!roleId || !m || !Array.isArray(m.roles) || !m.roles.includes(roleId) || !isOnlyPmOnMain(guildId, m.roles)) {
    /* non è un errore: semplicemente non ha la tab (200, così la console del browser resta pulita) */
    return { status: 200, body: { ok: true, notPm: true, staff: null, message: "Non è Partner Manager in questo server." } };
  }
  const { getTenantProfileSnapshot } = require("../../Partner/services/tenantProfileProgressService") as any;
  const snap: any = await getTenantProfileSnapshot(String(guildId), String(targetId), { client, evaluateObjectives: false }).catch(() => null);
  if (!snap) return { status: 503, body: { ok: false, error: "unavailable", message: "Statistiche non disponibili ora." } };
  /* partnership contate solo in questo server (+profile le conta su tutti) */
  try {
    const L = require("../../Partner/services/tenantLeaderboardService") as any;
    const here = await L.getUserPartnershipScoresForGuild(String(guildId), String(targetId));
    if (here) snap.scores = here;
  } catch (_) {}
  const selected = (Array.isArray(snap.prefs?.selectedBadges) ? snap.prefs.selectedBadges : [])
    .map((id: string) => snap.badgeMap?.get?.(id))
    .filter(Boolean)
    .map((b: any) => ({ id: String(b.id), emoji: String(b.emoji || ""), title: String(b.title || "") }));
  return {
    status: 200,
    body: {
      ok: true,
      staff: {
        roleId,
        scores: { total: Number(snap.scores?.total) || 0, daily: Number(snap.scores?.daily) || 0, weekly: Number(snap.scores?.weekly) || 0 },
        awardsPercent: Number(snap.awardsPercent) || 0,
        selectedBadges: selected,
        badges: (snap.unlockedBadges || []).map((b: any) => ({ id: String(b.id), emoji: String(b.emoji || ""), title: String(b.title || "") })),
        objectives: (snap.objectives || []).map((o: any) => ({
          id: String(o.id),
          emoji: String(o.emoji || ""),
          title: String(o.title || ""),
          desc: String(o.desc || ""),
          current: Number(o.progress?.current) || 0,
          target: Math.max(1, Number(o.progress?.target) || 1),
          done: o.progress?.done === true,
        })),
        managers: await partnerManagers(client, guildId, roleId).catch(() => []),
      },
    },
  };
}

/**
 * Sul principale il profilo partnership è solo di chi è Partner Manager e basta:
 * chi ha anche un ruolo dello staff (Helper, Mod, Staff, High Staff, Manager…) non ce l'ha.
 */
function isOnlyPmOnMain(guildId?, roles: string[] = []) {
  let IDs: any = null;
  try {
    IDs = require("../../Config/ids");
  } catch (_) {
    return true;
  }
  if (String(guildId || "") !== String(IDs?.guilds?.main || "")) return true;
  const r = IDs?.roles || {};
  const staff = [r.Founder, r.Manager, r.Admin, r.Director, r.HighStaff, r.SeniorModerator, r.Mod, r.Helper, r.Staff]
    .map((x: unknown) => String(x || ""))
    .filter(Boolean);
  return !roles.some((id) => staff.includes(String(id)));
}

/** È Partner Manager in quel server? (modulo Partnership acceso, ruolo addosso, sul principale senza altri ruoli staff) */
async function isPartnerManagerIn(client?, guildId?, userId?) {
  const roleId = await pmRoleOf(guildId);
  if (!roleId) return false;
  const m: any = await memberOf(client, guildId, userId);
  return Boolean(m && Array.isArray(m.roles) && m.roles.includes(roleId) && isOnlyPmOnMain(guildId, m.roles));
}

export = { sharedGuilds, guildProfile, guildStaff, memberOf, viewerIdOf, restGet, isPartnerManagerIn };
