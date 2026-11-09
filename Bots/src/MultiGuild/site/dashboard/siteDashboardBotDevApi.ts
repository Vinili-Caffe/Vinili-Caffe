const {
  assertDashboardBotDevAccess,
  isDashboardBotDevUser,
} = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { isViniliProtectedGuild, normalizeGuildId } = require("../../core/viniliProtectedGuilds") as typeof import("../../core/viniliProtectedGuilds");
const {
  listBotUsageBlacklist,
  addGuildBotUsageBlacklist,
  addUserBotUsageBlacklist,
  leaveGuildIfPresent,
  normalizeSnowflake,
} = require("../../../Vinili/Moderation/services/botUsageBlacklistService") as typeof import("../../../Vinili/Moderation/services/botUsageBlacklistService");
const {
  listBotGuildLifecycleEvents,
  appendBotGuildLifecycleEvent,
  snapshotGuildMeta,
} = require("../../../Vinili/Moderation/services/botGuildLifecycleLogService") as typeof import("../../../Vinili/Moderation/services/botGuildLifecycleLogService");
const { loadTenantRegistryMap } = require("../../core/tenantRegistryStore") as typeof import("../../core/tenantRegistryStore");
const { handleTenantGuildBotRemoved } = require("../../../Vinili/Partner/services/tenantPartnershipLeaveService") as typeof import("../../../Vinili/Partner/services/tenantPartnershipLeaveService");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { Routes } = require("discord.js") as typeof import("discord.js");
const {
  getPremiumCredits,
  adjustPremiumCredits,
  listPremiumCreditHolders,
  findLastPremiumSpendForGuild,
} = require("../../../Vinili/Community/services/premiumCreditsService") as typeof import("../../../Vinili/Community/services/premiumCreditsService");
const {
  getTenantPremium,
  revokeTenantPremium,
  ensureTenantPremiumCacheFresh,
  isTenantPremiumActiveSync,
} = require("../../core/tenantPremium") as typeof import("../../core/tenantPremium");

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function reasonMessage(reason?) {
  const map = {
    invalid_id: "ID non valido.",
    protected_guild: "I server Vinili protetti non possono essere modificati così.",
    not_in_guild: "Il bot non è in questo server.",
    persist_failed: "Salvataggio non riuscito.",
    leave_failed: "Uscita dal server non riuscita.",
    reset_failed: "Reset dati non riuscito.",
    invalid_delta: "Importo non valido.",
    adjust_failed: "Aggiornamento crediti non riuscito.",
    bad_user: "ID utente non valido.",
    bad_delta: "Importo non valido.",
    mongo_unavailable: "Database non disponibile.",
    premium_inactive: "Questo server non ha Premium attivo.",
    refund_user_missing:
      "Premium revocato, ma non ho trovato a chi riaccreditare (manca updatedBy / spesa collegata).",
    refund_amount_missing:
      "Premium revocato, ma non ho trovato l’importo crediti da rimborsare per questo server.",
  };
  return map[String(reason || "")] || "Operazione non riuscita.";
}

/* site-api gira con un client solo REST: la sua cache dei server non è aggiornata.
   La lista vera dei server la dà Discord (/users/@me/guilds); i dettagli mancanti
   (membri, proprietario) si chiedono a parte e restano in memoria 10 minuti. */
const DEV_GUILD_META_TTL_MS = 10 * 60 * 1000;
const devGuildMetaCache = new Map();

async function listBotGuildsFromRest(client?) {
  const rest = client?._rest || client?.rest;
  if (!rest) return null;
  const out = [];
  try {
    let after = "";
    for (let page = 0; page < 25; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (after) query.set("after", after);
      const batch = await rest.get(`${Routes.userGuilds()}?${query.toString()}`);
      if (!Array.isArray(batch) || !batch.length) break;
      for (const row of batch) {
        const id = String(row?.id || "").trim();
        if (/^\d{16,22}$/.test(id)) out.push({ id, name: String(row?.name || "").trim() || id, icon: row?.icon || null });
      }
      after = String(batch[batch.length - 1]?.id || "").trim();
      if (!after || batch.length < 200) break;
    }
  } catch (err) {
    global.logger?.warn?.("[DEV GUILDS] lista REST non riuscita:", err?.message || err);
    return out.length ? out : null;
  }
  return out;
}

async function fetchDevGuildMeta(client?, guildId?) {
  const hit = devGuildMetaCache.get(guildId);
  if (hit && Date.now() - hit.at < DEV_GUILD_META_TTL_MS) return hit.meta;
  const rest = client?._rest || client?.rest;
  if (!rest) return null;
  try {
    const raw: any = await rest.get(Routes.guild(String(guildId)), { query: new URLSearchParams({ with_counts: "true" }) });
    const members = Number(raw?.approximate_member_count ?? raw?.member_count);
    const meta = {
      ownerId: raw?.owner_id ? String(raw.owner_id) : null,
      memberCount: Number.isFinite(members) && members >= 0 ? members : 0,
    };
    devGuildMetaCache.set(guildId, { at: Date.now(), meta });
    return meta;
  } catch {
    return null;
  }
}

/** Server dove sta il bot: Discord via REST se possibile, altrimenti la cache del client. */
async function collectDevGuilds(client?) {
  const cache = client?.guilds?.cache;
  const fromRest = await listBotGuildsFromRest(client);
  if (!fromRest) {
    return Array.from(cache?.values?.() || []).map((guild: any) => ({ id: String(guild.id), guild, partial: false }));
  }
  return fromRest.map((row?) => {
    const cached = cache?.get?.(row.id) || null;
    const full = cached && cached.partial !== true && Number(cached.memberCount) > 0;
    return {
      id: row.id,
      guild: full ? cached : { id: row.id, name: row.name, icon: row.icon, partial: true },
      partial: !full,
    };
  });
}

async function getDashboardBotDevOverview(client?, accessToken?) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const guilds = await collectDevGuilds(client);
  const blacklist = await listBotUsageBlacklist("all").catch(() => []);
  const events = await listBotGuildLifecycleEvents({ limit: 8 }).catch(() => []);
  let registrySize = 0;
  try {
    const map = await loadTenantRegistryMap();
    registrySize = map && typeof map === "object" && !Array.isArray(map) ? Object.keys(map).length : 0;
  } catch {
    registrySize = 0;
  }

  return {
    ok: true,
    status: 200,
    botDev: true,
    botTag: client?.user?.tag || null,
    botId: client?.user?.id || null,
    guildCount: guilds.length,
    registryCount: registrySize,
    blacklistUsers: blacklist.filter((r?) => r.type === "user").length,
    blacklistGuilds: blacklist.filter((r?) => r.type === "guild").length,
    recentEvents: events,
  };
}

async function listDashboardBotDevGuilds(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const q = String(query?.q || query?.search || "").trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Math.floor(Number(query?.limit) || 100)));

  let registry: Record<string, any> = {};
  try {
    registry = await loadTenantRegistryMap();
    if (!registry || typeof registry !== "object" || Array.isArray(registry)) registry = {};
  } catch {
    registry = {};
  }

  await ensureTenantPremiumCacheFresh().catch(() => null);
  const all = await collectDevGuilds(client);
  /* dettagli REST solo per i server che finiscono in pagina (con la ricerca sul nome prima) */
  const candidates = q
    ? all.filter(({ id, guild }) => `${guild.name || ""} ${id} ${guild.ownerId || ""}`.toLowerCase().includes(q) || guild.partial === true)
    : all;
  const metaById = new Map();
  const needMeta = candidates.filter((c?) => c.partial).slice(0, limit);
  for (let i = 0; i < needMeta.length; i += 8) {
    const chunk = needMeta.slice(i, i + 8);
    const metas = await Promise.all(chunk.map((c?) => fetchDevGuildMeta(client, c.id)));
    chunk.forEach((c?, j?) => metaById.set(c.id, metas[j]));
  }
  const rows = [];
  for (const { id: gid, guild, partial } of candidates) {
    const id = String(gid || "").trim();
    if (!id) continue;
    const meta = partial ? metaById.get(id) || null : null;
    const name = String(guild.name || "").trim() || id;
    const ownerId = String((partial ? meta?.ownerId : guild.ownerId) || "").trim() || null;
    if (q) {
      const hay = `${name} ${id} ${ownerId || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const reg = registry[id] || null;
    const joinedMs = Number(guild.joinedTimestamp) || Number(reg?.t) || 0;
    rows.push({
      id,
      name,
      iconUrl: (() => {
        try {
          return guildIconUrl(guild, { size: 64 });
        } catch {
          return null;
        }
      })(),
      ownerId,
      memberCount: Math.max(0, Math.floor(Number(partial ? meta?.memberCount : guild.memberCount) || 0)),
      protected: isViniliProtectedGuild(id),
      premiumActive: isTenantPremiumActiveSync(id),
      registeredAt: reg?.t ? new Date(reg.t).toISOString() : null,
      joinedAt: joinedMs > 0 ? new Date(joinedMs).toISOString() : null,
      joinedAtMs: joinedMs > 0 ? joinedMs : 0,
      botPresent: true,
    });
  }

    rows.sort((a?, b?) => {
    const dj = (Number(b.joinedAtMs) || 0) - (Number(a.joinedAtMs) || 0);
    if (dj !== 0) return dj;
    return String(a.name).localeCompare(String(b.name), "it");
  });
  return {
    ok: true,
    status: 200,
    total: rows.length,
    guilds: rows.slice(0, limit).map(({ joinedAtMs, ...rest }) => rest),
  };
}

async function listDashboardBotDevEvents(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  const events = await listBotGuildLifecycleEvents({
    limit: query?.limit,
    type: query?.type,
  });
  return { ok: true, status: 200, events };
}

async function resolveGuildForDevAction(client?, guildId?) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  if (isViniliProtectedGuild(gid)) return { ok: false, reason: "protected_guild", id: gid };
  let guild = client?.guilds?.cache?.get(gid) || null;
  if (!guild && client?.guilds?.fetch) {
    guild = await client.guilds.fetch(gid).catch(() => null);
  }
  return { ok: true, id: gid, guild };
}

function bodyGuildId(body: Record<string, any> = {}) {
  return body?.guildId || body?.id || body?.guild || null;
}

async function postDashboardBotDevLeaveGuild(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const resolved = await resolveGuildForDevAction(client, bodyGuildId(body));
  if (!resolved.ok) return fail(400, resolved.reason, reasonMessage(resolved.reason));

  const note = String(body?.note || "").trim().slice(0, 300);
  const left = await leaveGuildIfPresent(client, resolved.id);
  if (!left?.ok) return fail(400, left?.reason || "leave_failed", reasonMessage(left?.reason || "leave_failed"));

  await appendBotGuildLifecycleEvent({
    type: "manual_leave",
    guildId: resolved.id,
    ...snapshotGuildMeta(resolved.guild),
    guildName: left.guildName || resolved.guild?.name || null,
    actorId: gate.userId,
    note: note || "Manual leave from Dev panel",
  }).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: resolved.id,
    left: Boolean(left.left),
    message: left.left ? "Bot uscito dal server." : "Il bot non era in questo server.",
  };
}

async function postDashboardBotDevGuildBotban(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const resolved = await resolveGuildForDevAction(client, bodyGuildId(body));
  if (!resolved.ok) return fail(400, resolved.reason, reasonMessage(resolved.reason));

  const note = String(body?.note || "").trim().slice(0, 500) || "Botban from Dev panel";
  const guildName = String(resolved.guild?.name || "").trim() || null;
  const ban = await addGuildBotUsageBlacklist(resolved.id, gate.userId, note, { guildName });
  if (!ban?.ok) return fail(400, ban?.reason || "persist_failed", reasonMessage(ban?.reason || "persist_failed"));

  const left = await leaveGuildIfPresent(client, resolved.id).catch(() => null);
  await appendBotGuildLifecycleEvent({
    type: "botban_leave",
    guildId: resolved.id,
    ...snapshotGuildMeta(resolved.guild),
    guildName: guildName || left?.guildName || null,
    ownerId: resolved.guild?.ownerId || null,
    actorId: gate.userId,
    note,
  }).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: resolved.id,
    left: Boolean(left?.left),
    message: "Server messo in blacklist e bot rimosso se presente.",
  };
}

async function postDashboardBotDevOwnerBotban(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const resolved = await resolveGuildForDevAction(client, bodyGuildId(body));
  if (!resolved.ok) return fail(400, resolved.reason, reasonMessage(resolved.reason));

  let ownerId = String(body?.ownerId || resolved.guild?.ownerId || "").trim();
  if (!ownerId && resolved.guild?.fetchOwner) {
    const owner = await resolved.guild.fetchOwner().catch(() => null);
    ownerId = String(owner?.id || "").trim();
  }
  if (!normalizeSnowflake(ownerId)) {
    return fail(400, "invalid_id", "Owner del server non trovato.");
  }

  const note =
    String(body?.note || "").trim().slice(0, 500) ||
    `Owner ban from guild ${resolved.id}`;
  const ban = await addUserBotUsageBlacklist(ownerId, gate.userId, note);
  if (!ban?.ok) return fail(400, ban?.reason || "persist_failed", reasonMessage(ban?.reason || "persist_failed"));

  return {
    ok: true,
    status: 200,
    guildId: resolved.id,
    ownerId,
    message: "Owner aggiunto alla blacklist bot.",
  };
}

async function postDashboardBotDevResetGuild(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const resolved = await resolveGuildForDevAction(client, bodyGuildId(body));
  if (!resolved.ok) return fail(400, resolved.reason, reasonMessage(resolved.reason));

  const alsoLeave = body?.leave === true;
  await handleTenantGuildBotRemoved(resolved.id).catch(() => null);

  let left = null;
  if (alsoLeave) {
    left = await leaveGuildIfPresent(client, resolved.id).catch(() => null);
  }

  await appendBotGuildLifecycleEvent({
    type: "reset",
    guildId: resolved.id,
    ...snapshotGuildMeta(resolved.guild),
    actorId: gate.userId,
    note: String(body?.note || "").trim().slice(0, 300) || "Tenant data reset from Dev panel",
  }).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: resolved.id,
    left: Boolean(left?.left),
    message: alsoLeave
      ? "Dati tenant resettati e bot rimosso se presente."
      : "Dati tenant resettati. Il bot resta nel server.",
  };
}

async function postDashboardBotDevRevokePremium(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const resolved = await resolveGuildForDevAction(client, bodyGuildId(body));
  if (!resolved.ok) return fail(400, resolved.reason, reasonMessage(resolved.reason));

  const refundCredits = body?.refundCredits === true || body?.refund === true;
  const note = String(body?.note || "").trim().slice(0, 300) || null;

  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);
  const before = await getTenantPremium(resolved.id);
  if (!before?.active) {
    return fail(400, "premium_inactive", reasonMessage("premium_inactive"));
  }

  const revoke = await revokeTenantPremium(resolved.id, {
    source: "botdev_revoke",
    updatedBy: gate.userId,
    note: note || (refundCredits ? "Dev revoke + credit refund" : "Dev revoke (no credit refund)"),
  });
  if (!revoke.ok) {
    return fail(400, revoke.reason || "persist_failed", reasonMessage(revoke.reason || "persist_failed"));
  }

  let refund = null;
  if (refundCredits) {
    const spend = await findLastPremiumSpendForGuild(resolved.id, before.updatedBy);
    const userId = String(spend?.userId || before.updatedBy || "").trim();
    const amount = Math.floor(Number(spend?.credits) || 0);
    if (!/^\d{16,20}$/.test(userId)) {
      return {
        ok: true,
        status: 200,
        guildId: resolved.id,
        revoked: true,
        refund: null,
        warning: "refund_user_missing",
        message: reasonMessage("refund_user_missing"),
      };
    }
    if (!(amount > 0)) {
      return {
        ok: true,
        status: 200,
        guildId: resolved.id,
        revoked: true,
        refund: null,
        warning: "refund_amount_missing",
        message: reasonMessage("refund_amount_missing"),
      };
    }
    const credited: any = await adjustPremiumCredits(userId, amount, {
      by: gate.userId,
      reason: "botdev_premium_refund",
      note: note || `Refund after premium revoke guild ${resolved.id}`,
      guildId: resolved.id,
    });
    if (!credited.ok) {
      return {
        ok: true,
        status: 200,
        guildId: resolved.id,
        revoked: true,
        refund: null,
        warning: credited.error || "adjust_failed",
        message:
          "Premium revocato, ma il riaccredito crediti non è riuscito: " +
          reasonMessage(credited.error || "adjust_failed"),
      };
    }
    refund = { userId, credits: amount, balance: credited.credits };
  }

  await appendBotGuildLifecycleEvent({
    type: "premium_revoke",
    guildId: resolved.id,
    ...snapshotGuildMeta(resolved.guild),
    actorId: gate.userId,
    note:
      note ||
      (refund
        ? `Premium revocato + rimborso ${refund.credits} crediti a ${refund.userId}`
        : "Premium revocato senza rimborso crediti"),
  }).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: resolved.id,
    revoked: true,
    refund,
    message: refund
      ? `Premium revocato. Riaccreditati ${refund.credits} crediti a ${refund.userId}.`
      : "Premium revocato. Nessun riaccredito crediti.",
  };
}

function creditsUserAvatarUrl(user?) {
  const id = String(user?.id || "").trim();
  if (!id) return null;
  if (typeof user?.displayAvatarURL === "function") {
    try {
      return user.displayAvatarURL({ size: 64 }) || null;
    } catch {
          }
  }
  return null;
}

async function enrichCreditsUserRow(client?, row?) {
  const userId = String(row?.userId || "").trim();
  let username = null;
  let displayName = null;
  let avatarUrl = null;
  if (userId && typeof client?.users?.fetch === "function") {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      username = String(user.username || "").trim() || null;
      displayName = String(user.globalName || user.username || "").trim() || username;
      avatarUrl = creditsUserAvatarUrl(user);
    }
  }
  return {
    userId,
    credits: Number(row?.credits) || 0,
    updatedAt: row?.updatedAt != null ? Number(row.updatedAt) : null,
    username,
    displayName,
    avatarUrl,
  };
}

async function listDashboardBotDevCredits(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const listed = await listPremiumCreditHolders({
    page: query?.page,
    limit: query?.limit,
    q: query?.q || query?.query || "",
  });
  if (!listed?.ok) {
    return fail(500, "list_failed", "Impossibile caricare i crediti.");
  }

  const users = [];
  for (const row of listed.users) {
    users.push(await enrichCreditsUserRow(client, row));
  }

  return {
    ok: true,
    status: 200,
    users,
    total: listed.total,
    page: listed.page,
    pages: listed.pages,
    limit: listed.limit,
    from: listed.from,
    to: listed.to,
  };
}

/** Profilo Discord di un utente (anteprima del proprietario nel pannello sviluppatore). */
const devUserCache = new Map();
async function getDashboardBotDevUser(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  const userId = normalizeSnowflake(query?.userId || query?.id || "");
  if (!userId) return fail(400, "invalid_id", "ID utente non valido.");
  const hit = devUserCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return { ok: true, status: 200, user: hit.user };
  let raw: any = null;
  try {
    const rest = client?._rest || client?.rest;
    if (rest) raw = await rest.get(Routes.user(userId));
  } catch {
    raw = null;
  }
  if (!raw?.id) {
    const u: any = await client?.users?.fetch?.(userId).catch(() => null);
    if (u) raw = { id: u.id, username: u.username, global_name: u.globalName, avatar: u.avatar, bot: u.bot, banner: u.banner, accent_color: u.accentColor };
  }
  if (!raw?.id) return fail(404, "not_found", "Utente non trovato su Discord.");
  const avatar = raw.avatar
    ? `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.${String(raw.avatar).startsWith("a_") ? "gif" : "png"}?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(raw.id) >> 22n) % 6n)}.png`;
  const banner = raw.banner
    ? `https://cdn.discordapp.com/banners/${raw.id}/${raw.banner}.${String(raw.banner).startsWith("a_") ? "gif" : "png"}?size=480`
    : null;
  const user = {
    id: String(raw.id),
    username: String(raw.username || ""),
    displayName: String(raw.global_name || raw.username || raw.id),
    avatarUrl: avatar,
    bannerUrl: banner,
    accentColor: raw.accent_color != null ? Number(raw.accent_color) : null,
    bot: raw.bot === true,
    createdAt: new Date(Number(BigInt(raw.id) >> 22n) + 1420070400000).toISOString(),
  };
  devUserCache.set(userId, { at: Date.now(), user });
  return { ok: true, status: 200, user };
}

async function getDashboardBotDevCredits(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const userId = normalizeSnowflake(query?.userId || query?.user || "");
  if (!userId) {
    return listDashboardBotDevCredits(client, accessToken, query);
  }

  const credits = await getPremiumCredits(userId);
  return { ok: true, status: 200, userId, credits };
}

async function postDashboardBotDevCredits(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;

  const userId = normalizeSnowflake(body?.userId || body?.user || "");
  if (!userId) return fail(400, "invalid_id", "ID utente non valido.");
  const delta = Math.floor(Number(body?.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return fail(400, "invalid_delta", "Importo non valido.");
  }
  const note = String(body?.note || "").trim().slice(0, 300) || null;

  const result: any = await adjustPremiumCredits(userId, delta, {
    by: gate.userId,
    reason: "botdev_adjust",
    note,
  });
  if (!result.ok) {
    return fail(400, result.error || "adjust_failed", reasonMessage(result.error || "adjust_failed"));
  }

  return { ok: true, status: 200, userId, credits: result.credits, delta };
}

export = {
  isDashboardBotDevUser,
  getDashboardBotDevOverview,
  listDashboardBotDevGuilds,
  listDashboardBotDevEvents,
  postDashboardBotDevLeaveGuild,
  postDashboardBotDevGuildBotban,
  postDashboardBotDevOwnerBotban,
  postDashboardBotDevResetGuild,
  postDashboardBotDevRevokePremium,
  getDashboardBotDevCredits,
  postDashboardBotDevCredits,
  getDashboardBotDevUser,
};
