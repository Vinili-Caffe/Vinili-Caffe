const { verifyDashboardGuildAccess } = require("./siteDashboardApi");
const { listGuildPickerData } = require("./siteDashboardPartnershipApi");
const {
  MAX_ENTRIES,
  MAX_REASON,
  getGuildTicketBlacklist,
  addGuildTicketBlacklistEntry,
  removeGuildTicketBlacklistEntry,
  refreshTicketBlacklistCache,
} = require("../../MultiGuild/core/tenantTicketBlacklist");
const { getGuildPanels } = require("../../MultiGuild/core/tenantTicketPanels");

const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_entry: "Utente o ruolo non valido.",
  duplicate: "Questa entry è già in blacklist per il pannello selezionato.",
  quota: `Quota blacklist raggiunta (max ${MAX_ENTRIES}).`,
  not_found: "Entry non trovata.",
  invalid_panel: "Pannello non valido.",
};

function reasonToMessage(reason) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status, error, message) {
  return { ok: false, status, error, message };
}

async function resolveGuild(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  return (
    client.guilds.cache?.get(gid) ||
    (await client.guilds.fetch(gid).catch(() => null))
  );
}

async function resolveUserLabel(client, guild, userId) {
  try {
    const member =
      guild?.members?.cache?.get(userId) ||
      (await guild?.members?.fetch?.(userId).catch(() => null));
    const user =
      member?.user ||
      client?.users?.cache?.get(userId) ||
      (await client?.users?.fetch?.(userId).catch(() => null));
    const username = String(user?.username || "").trim();
    return username || null;
  } catch (_) {
    return null;
  }
}

async function serializeEntries(client, guild, entries, panels, roles) {
  const panelById = new Map((panels || []).map((p) => [String(p.id), p]));
  const roleById = new Map((roles || []).map((r) => [String(r.id), r]));
  const out = [];
  for (const entry of entries || []) {
    const panel = entry.panelId ? panelById.get(String(entry.panelId)) : null;
    let label = entry.targetId;
    if (entry.type === "role") {
      const role = roleById.get(String(entry.targetId));
      label = role?.name ? `@${role.name}` : `@${entry.targetId}`;
    } else {
      const username = await resolveUserLabel(client, guild, entry.targetId);
      label = username ? `@${username}` : `User ${String(entry.targetId).slice(-4)}`;
    }
    out.push({
      id: entry.id,
      type: entry.type,
      targetId: entry.targetId,
      label,
      panelId: entry.panelId || null,
      panelTitle: panel ? String(panel.title || panel.id) : null,
      reason: entry.reason || null,
      createdAt: entry.createdAt || null,
      createdBy: entry.createdBy || null,
    });
  }
  return out;
}

async function listDashboardTicketBlacklist(client, accessToken, guildId) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  await refreshTicketBlacklistCache().catch(() => null);
  const guild = await resolveGuild(client, gid);
  const [bucket, panelsBucket, pickers] = await Promise.all([
    getGuildTicketBlacklist(gid),
    getGuildPanels(gid).catch(() => ({ singles: [] })),
    listGuildPickerData(client, gid).catch(() => ({ roles: [] })),
  ]);
  const panels = (panelsBucket.singles || []).map((p) => ({
    id: p.id,
    title: p.title,
    ticketType: p.ticketType,
    disabled: p.disabled === true,
  }));
  const roles = Array.isArray(pickers?.roles) ? pickers.roles : [];
  const entries = await serializeEntries(client, guild, bucket.entries || [], panels, roles);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    entries,
    panels,
    pickers: { roles },
    quotas: { entries: entries.length, maxEntries: MAX_ENTRIES, maxReason: MAX_REASON },
  };
}

async function addDashboardTicketBlacklist(client, accessToken, guildId, body = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const type = String(body.type || "").trim().toLowerCase() === "role" ? "role" : "user";
  const targetId = String(body.targetId || body.id || body.userId || body.roleId || "").trim();
  let panelId = body.panelId != null ? String(body.panelId).trim() : "";
  if (!panelId || panelId === "all" || panelId === "*") panelId = null;

  if (panelId) {
    const panelsBucket = await getGuildPanels(gid).catch(() => ({ singles: [] }));
    const okPanel = (panelsBucket.singles || []).some((p) => String(p.id) === panelId);
    if (!okPanel) return fail(400, "invalid_panel", reasonToMessage("invalid_panel"));
  }

  const result = await addGuildTicketBlacklistEntry(gid, {
    type,
    targetId,
    panelId,
    reason: body.reason,
    createdBy: access.userId || null,
  });
  if (!result.ok) {
    return fail(
      result.reason === "not_found" ? 404 : 400,
      result.reason || "persist_failed",
      reasonToMessage(result.reason),
    );
  }

  const listed = await listDashboardTicketBlacklist(client, accessToken, gid);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    entry: (listed.entries || []).find((e) => String(e.id) === String(result.entry.id)) || result.entry,
    entries: listed.entries,
    panels: listed.panels,
    message: type === "role" ? "Ruolo aggiunto alla blacklist." : "Utente aggiunto alla blacklist.",
  };
}

async function deleteDashboardTicketBlacklist(client, accessToken, guildId, entryId) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const result = await removeGuildTicketBlacklistEntry(gid, entryId);
  if (!result.ok) {
    return fail(
      result.reason === "not_found" ? 404 : 500,
      result.reason || "persist_failed",
      reasonToMessage(result.reason),
    );
  }
  const listed = await listDashboardTicketBlacklist(client, accessToken, gid);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    guildId: gid,
    deletedId: String(entryId || ""),
    entries: listed.entries,
    panels: listed.panels,
    message: "Entry rimossa dalla blacklist.",
  };
}

module.exports = {
  listDashboardTicketBlacklist,
  addDashboardTicketBlacklist,
  deleteDashboardTicketBlacklist,
};
