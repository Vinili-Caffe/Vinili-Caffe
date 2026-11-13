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

async function memberOf(client?, guildId?, userId?): Promise<any | null> {
  if (!isId(guildId) || !isId(userId)) return null;
  return (client.rest as any).get(Routes.guildMember(String(guildId), String(userId))).catch(() => null);
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

  /* Partner Manager: il ruolo scelto nella Partnership di quel server */
  let isPartnerManager = false;
  try {
    const P = require("../../Partner/core/tenantPartnershipSettings") as any;
    const cfg: any = await P.getPartnershipConfig(String(guildId)).catch(() => null);
    const pmRole = String(cfg?.partnerManagerRoleId || "");
    isPartnerManager = Boolean(pmRole && Array.isArray(m.roles) && m.roles.includes(pmRole));
  } catch (_) {}

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
    const g: any = await (client.rest as any).get(Routes.guild(String(guildId))).catch(() => null);
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

export = { sharedGuilds, guildProfile, memberOf, viewerIdOf };
