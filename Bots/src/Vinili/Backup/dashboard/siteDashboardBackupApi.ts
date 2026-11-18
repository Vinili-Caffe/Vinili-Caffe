/**
 * Dashboard: snapshot Discord del server (modulo Backup — parity con +backup).
 * Create è async (202 + poll): gli snapshot del principale sono decine di MB compressi.
 */
const { verifyDashboardGuildAccess } = require("../../../MultiGuild/site/dashboard/siteDashboardApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardApi");
const {
  createGuildBackup,
  listGuildBackupMetas,
  readBackupMetaFile,
  readBackupMeta,
  deleteGuildBackup,
} = require("../services/serverBackupService") as typeof import("../services/serverBackupService");
const {
  getBackupSettings,
  setBackupSettings,
  captureOptionsFrom,
} = require("../services/backupSettingsService") as typeof import("../services/backupSettingsService");
const {
  LOAD_ACTIONS,
  DEFAULT_MESSAGES_LIMIT,
  createLoadSession,
  getLoadSession,
  updateLoadSessionActions,
  updateLoadSessionMessagesLimit,
  deleteLoadSession,
  formatMessagesLimit,
  normalizeMessagesLimit,
} = require("../services/backupLoadSessions") as typeof import("../services/backupLoadSessions");
const {
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
} = require("../services/backupLoadActive") as typeof import("../services/backupLoadActive");
const {
  startCreateIfIdle,
  updateCreate,
  getGuildBackupCreateStatus,
  isCreateRunning,
} = require("../services/backupCreateActive") as typeof import("../services/backupCreateActive");
const { confirmBackupLoad } = require("../services/backupLoadConfirm") as typeof import("../services/backupLoadConfirm");
const { readBackupByIdGlobal } = require("../services/serverBackupService") as typeof import("../services/serverBackupService");

function fail(status: number, error: string, message: string) {
  return { ok: false, status, error, message };
}

async function access(client?, token?, guildId?) {
  const a: any = await verifyDashboardGuildAccess(client, token, guildId);
  if (!a.ok) return a;
  if (!a.botPresent) return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  const MS = require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches");
  if (!MS.isModuleOn(a.guildId, "backup")) {
    return fail(403, "module_off", "Il modulo Backup server è spento: riaccendilo da Moduli.");
  }
  return a;
}

async function resolveGuild(client?, guildId?) {
  const gid = String(guildId || "");
  if (!gid) return null;
  return (
    client?.guilds?.cache?.get?.(gid) ||
    (typeof client?.guilds?.fetch === "function" ? await client.guilds.fetch(gid).catch(() => null) : null) ||
    null
  );
}

function sessionPayload(session?) {
  if (!session) return null;
  return {
    id: String(session.id || ""),
    guildId: String(session.guildId || ""),
    userId: String(session.userId || ""),
    backupId: String(session.backupId || ""),
    sourceGuildId: session.sourceGuildId ? String(session.sourceGuildId) : null,
    actions: Array.from(session.actions || []),
    messagesLimit: session.messagesLimit == null ? null : Number(session.messagesLimit),
    messagesLimitLabel: formatMessagesLimit(session.messagesLimit),
    expiresAt: Number(session.expiresAt || 0),
  };
}

function emptyCounts() {
  return {
    roles: 0,
    channels: 0,
    threads: 0,
    members: 0,
    bans: 0,
    emojis: 0,
    stickers: 0,
    webhooks: 0,
    invites: 0,
    events: 0,
    automodRules: 0,
    messages: 0,
  };
}

function countsFromStats(stats?) {
  const s = stats && typeof stats === "object" ? stats : {};
  return {
    roles: Number(s.roles || 0),
    channels: Number(s.channels || 0),
    threads: Number(s.threads || 0),
    members: Number(s.members || 0),
    bans: Number(s.bans || 0),
    emojis: Number(s.emojis || 0),
    stickers: Number(s.stickers || 0),
    webhooks: Number(s.webhooks || 0),
    invites: Number(s.invites || 0),
    events: Number(s.scheduledEvents || 0),
    automodRules: Number(s.automodRules || 0),
    messages: Number(s.messages || 0),
  };
}

function summarizeMeta(meta?, guildId?) {
  const stats = meta?.stats && typeof meta.stats === "object" ? meta.stats : null;
  return {
    backupId: String(meta?.backupId || "").toUpperCase(),
    guildId: String(meta?.guildId || guildId || ""),
    guildName: String(meta?.guildName || ""),
    createdAt: meta?.createdAt || null,
    source: String(meta?.source || "manual"),
    schemaVersion: Number(meta?.schemaVersion || 0) || null,
    sizeBytes: Number(meta?.file?.sizeBytes || 0) || null,
    counts: stats ? countsFromStats(stats) : emptyCounts(),
    countsAvailable: Boolean(stats),
  };
}

async function listBackups(client?, token?, guildId?, query: Record<string, any> = {}) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const pageSize = Math.max(1, Math.min(50, Number(query.pageSize || 20) || 20));
  const page = Math.max(1, Number(query.page || 1) || 1);
  const search = String(query.search || "").trim();
  const all = await listGuildBackupMetas(a.guildId, { search, limit: 2000, offset: 0 });
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const finalPage = Math.min(page, totalPages);
  const start = (finalPage - 1) * pageSize;
  const items = all.slice(start, start + pageSize).map((row) => ({
    backupId: String(row.backupId || ""),
    guildId: String(a.guildId),
    guildName: String(row.guildName || ""),
    createdAt: row.createdAt || null,
    source: String(row.source || "manual"),
    label: String(row.label || row.backupId || ""),
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
  }));
  return {
    ok: true,
    status: 200,
    items,
    total,
    page: finalPage,
    pageSize,
    totalPages,
    loadStatus: getGuildBackupLoadStatus(a.guildId),
    createStatus: getGuildBackupCreateStatus(a.guildId),
  };
}

async function getSettings(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const settings = await getBackupSettings(a.guildId);
  return {
    ok: true,
    status: 200,
    settings,
    hints: {
      messages:
        "0 = non salvare messaggi. Valori alti allungano molto il backup (soprattutto in automatico).",
      automatic:
        "L'automatico gira al massimo una volta al giorno, all'ora scelta (fuso Europe/Rome).",
    },
  };
}

async function patchSettings(client?, token?, guildId?, body: Record<string, any> = {}) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const settings = await setBackupSettings(a.guildId, body || {});
  if (!settings) return fail(400, "invalid_guild", "Server non valido.");
  return { ok: true, status: 200, settings };
}

async function createBackup(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const guild = await resolveGuild(client, a.guildId);
  if (!guild) return fail(404, "guild_missing", "Server non trovato nella cache del bot.");

  const started = startCreateIfIdle({ guildId: a.guildId, userId: a.userId });
  if (!started) {
    return fail(409, "create_busy", "C'è già una creazione backup in corso su questo server.");
  }

  const settings = await getBackupSettings(a.guildId);
  const capture = captureOptionsFrom(settings, "manual");

  void (async () => {
    try {
      const created = await createGuildBackup(guild, {
        ...capture,
        userId: a.userId,
        onProgress: (p: Record<string, any> = {}) => {
          updateCreate(a.guildId, {
            phase: String(p.phase || "creating"),
            label: String(p.label || ""),
            percent: Number(p.percent || 0),
            current: p.current == null ? null : Number(p.current),
            total: p.total == null ? null : Number(p.total),
            backupId: p.backupId ? String(p.backupId).toUpperCase() : undefined,
          });
        },
      });
      updateCreate(a.guildId, {
        phase: "done",
        label: "Backup completato",
        percent: 100,
        backupId: String(created?.backupId || "").toUpperCase() || null,
        sizeBytes: Number(created?.sizeBytes || 0) || null,
        error: null,
      });
      global.logger?.info?.("[dashboard.backup] create done", { guildId: a.guildId, backupId: created?.backupId });
    } catch (err: any) {
      global.logger?.error?.("[dashboard.backup] create failed:", err);
      updateCreate(a.guildId, {
        phase: "failed",
        label: "Creazione fallita",
        percent: 0,
        error: String(err?.message || "Creazione backup non riuscita.").slice(0, 200),
      });
    }
  })();

  return {
    ok: true,
    status: 202,
    started: true,
    createStatus: getGuildBackupCreateStatus(a.guildId),
  };
}

async function createStatus(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return { ok: true, status: 200, createStatus: getGuildBackupCreateStatus(a.guildId) };
}

async function getBackup(client?, token?, guildId?, backupId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const id = String(backupId || "").trim().toUpperCase();
  if (!id) return fail(400, "invalid_id", "ID backup non valido.");
  try {
    const meta = await readBackupMeta(a.guildId, id);
    if (!meta?.backupId) return fail(404, "not_found", "Backup non trovato.");
    const fileMeta = await readBackupMetaFile(a.guildId, id);
    if (fileMeta?.guildId && String(fileMeta.guildId) !== String(a.guildId)) {
      return fail(403, "wrong_guild", "Questo backup appartiene a un altro server.");
    }
    const { getOrBuildBackupPreview } = require("../services/backupPreviewService") as typeof import("../services/backupPreviewService");
    let preview = null;
    let previewCached = true;
    try {
      const built = await getOrBuildBackupPreview(a.guildId, id, { ...fileMeta, ...meta });
      preview = built.preview;
      previewCached = Boolean(built.cached);
    } catch (previewErr: any) {
      global.logger?.warn?.("[dashboard.backup] preview failed:", previewErr);
    }
    return {
      ok: true,
      status: 200,
      backup: summarizeMeta({ ...fileMeta, ...meta, stats: fileMeta?.stats || meta.stats }, a.guildId),
      preview,
      previewCached,
      meta: fileMeta || null,
    };
  } catch (err: any) {
    if (err?.code === "ENOENT" || /non trov|non leggibile/i.test(String(err?.message || ""))) {
      return fail(404, "not_found", "Backup non trovato.");
    }
    global.logger?.error?.("[dashboard.backup] get failed:", err);
    return fail(500, "read_failed", String(err?.message || "Lettura backup non riuscita.").slice(0, 200));
  }
}

async function deleteBackup(client?, token?, guildId?, backupId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const id = String(backupId || "").trim().toUpperCase();
  if (!id) return fail(400, "invalid_id", "ID backup non valido.");
  try {
    const meta = await readBackupMetaFile(a.guildId, id);
    if (!meta) {
      /* prova comunque: file senza meta */
      const light = await readBackupMeta(a.guildId, id).catch(() => null);
      if (!light?.backupId) return fail(404, "not_found", "Backup non trovato.");
    } else if (meta.guildId && String(meta.guildId) !== String(a.guildId)) {
      return fail(403, "wrong_guild", "Questo backup appartiene a un altro server.");
    }
    await deleteGuildBackup(a.guildId, id);
    return { ok: true, status: 200, deleted: { backupId: id, guildId: String(a.guildId) } };
  } catch (err: any) {
    global.logger?.error?.("[dashboard.backup] delete failed:", err);
    return fail(500, "delete_failed", String(err?.message || "Eliminazione non riuscita.").slice(0, 200));
  }
}

async function listLoadActions(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return {
    ok: true,
    status: 200,
    actions: LOAD_ACTIONS.map((row) => ({
      key: String(row.key),
      label: String(row.label || row.key),
      description: String(row.description || ""),
    })),
    defaultMessagesLimit: DEFAULT_MESSAGES_LIMIT == null ? "ALL" : DEFAULT_MESSAGES_LIMIT,
    messagesLimitOptions: [
      { value: "ALL", label: "Tutti (integrale)" },
      { value: "100", label: "100" },
      { value: "500", label: "500" },
      { value: "1000", label: "1.000" },
      { value: "5000", label: "5.000" },
      { value: "10000", label: "10.000" },
    ],
  };
}

async function createSession(client?, token?, guildId?, body: Record<string, any> = {}) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (isCreateRunning(a.guildId)) {
    return fail(409, "create_busy", "Aspetta che finisca la creazione del backup prima di ripristinare.");
  }
  const backupId = String(body.backupId || "").trim().toUpperCase();
  if (!backupId) return fail(400, "invalid_id", "Scegli un backup da caricare.");
  const meta = await readBackupMetaFile(a.guildId, backupId);
  if (!meta) {
    const light = await readBackupMeta(a.guildId, backupId).catch(() => null);
    if (!light?.backupId) return fail(404, "not_found", "Backup non trovato.");
  } else if (meta.guildId && String(meta.guildId) !== String(a.guildId)) {
    return fail(403, "wrong_guild", "Questo backup appartiene a un altro server.");
  }
  const sessionId = createLoadSession({
    guildId: a.guildId,
    userId: a.userId,
    backupId,
    sourceGuildId: a.guildId,
    selectedActions: Array.isArray(body.actions) ? body.actions : null,
    messagesLimit: body.messagesLimit ?? DEFAULT_MESSAGES_LIMIT,
  });
  const session = getLoadSession(sessionId);
  return { ok: true, status: 200, session: sessionPayload(session) };
}

async function patchSession(client?, token?, guildId?, sessionId?, body: Record<string, any> = {}) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const session = getLoadSession(sessionId);
  if (!session) return fail(404, "session_expired", "Sessione scaduta: riparti dal ripristino.");
  if (String(session.guildId) !== String(a.guildId)) {
    return fail(403, "wrong_guild", "Sessione di un altro server.");
  }
  if (String(session.userId) !== String(a.userId)) {
    return fail(403, "not_owner", "Questa sessione non è tua.");
  }
  if (Array.isArray(body.actions)) updateLoadSessionActions(sessionId, body.actions);
  if (body.messagesLimit !== undefined) updateLoadSessionMessagesLimit(sessionId, body.messagesLimit);
  return { ok: true, status: 200, session: sessionPayload(getLoadSession(sessionId)) };
}

async function preflightSession(client?, token?, guildId?, sessionId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const session = getLoadSession(sessionId);
  if (!session) return fail(404, "session_expired", "Sessione scaduta: riparti dal ripristino.");
  if (String(session.guildId) !== String(a.guildId)) {
    return fail(403, "wrong_guild", "Sessione di un altro server.");
  }
  if (String(session.userId) !== String(a.userId)) {
    return fail(403, "not_owner", "Questa sessione non è tua.");
  }
  const guild = await resolveGuild(client, a.guildId);
  if (!guild) return fail(404, "guild_missing", "Server non trovato nella cache del bot.");

  const fileMeta = await readBackupMetaFile(a.guildId, session.backupId);
  const light = await readBackupMeta(a.guildId, session.backupId).catch(() => null);
  if (!fileMeta && !light?.backupId) return fail(404, "not_found", "Backup non trovato.");

  const summary = summarizeMeta({ ...(fileMeta || {}), ...(light || {}), stats: fileMeta?.stats || light?.stats }, a.guildId);
  const actions = Array.from(session.actions || []);
  const actionSet = new Set(actions);
  const rolesToDelete = [...guild.roles.cache.values()].filter(
    (r) => r.editable && !r.managed && r.id !== guild.id,
  ).length;
  const limit = normalizeMessagesLimit(session.messagesLimit, DEFAULT_MESSAGES_LIMIT);
  const warnings: string[] = [];
  if (actionSet.has("delete_roles")) warnings.push(`Verranno eliminati circa ${rolesToDelete} ruoli modificabili.`);
  if (actionSet.has("delete_channels")) warnings.push(`Verranno eliminati ${guild.channels.cache.size} canali attuali.`);
  if (actionSet.has("load_messages")) {
    if (summary.countsAvailable) {
      const total = summary.counts.messages;
      const loadable = limit == null ? total : Math.min(total, limit);
      warnings.push(`Verranno ripristinati fino a ${loadable} messaggi (nel backup ce ne sono ${total}).`);
    } else {
      warnings.push("Il backup non ha conteggi salvati: i messaggi verranno comunque ripristinati secondo il limite scelto.");
    }
  }
  warnings.push("Il ripristino è distruttivo: parti da un checkpoint automatico, ma non c'è rollback completo.");

  return {
    ok: true,
    status: 200,
    session: sessionPayload(session),
    backup: summary,
    live: {
      rolesEditable: rolesToDelete,
      channels: guild.channels.cache.size,
      roles: guild.roles.cache.size,
    },
    warnings,
    messagesLimitLabel: formatMessagesLimit(session.messagesLimit),
  };
}

async function confirmSession(client?, token?, guildId?, sessionId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (isCreateRunning(a.guildId)) {
    return fail(409, "create_busy", "Aspetta che finisca la creazione del backup prima di ripristinare.");
  }
  const session = getLoadSession(sessionId);
  if (!session) return fail(404, "session_expired", "Sessione scaduta: riparti dal ripristino.");
  if (String(session.guildId) !== String(a.guildId)) {
    return fail(403, "wrong_guild", "Sessione di un altro server.");
  }
  if (String(session.userId) !== String(a.userId)) {
    return fail(403, "not_owner", "Questa sessione non è tua.");
  }
  const guild = await resolveGuild(client, a.guildId);
  if (!guild) return fail(404, "guild_missing", "Server non trovato nella cache del bot.");

  /* Verifica esistenza senza decomprimere lo snapshot intero. */
  const meta = await readBackupMetaFile(a.guildId, session.backupId);
  if (!meta) {
    try {
      await readBackupByIdGlobal(`${a.guildId}:${session.backupId}`);
    } catch {
      return fail(404, "not_found", "Backup non trovato.");
    }
  }

  const started = await confirmBackupLoad({
    guild,
    userId: session.userId,
    backupId: session.backupId,
    actions: [...session.actions],
    messagesLimit: session.messagesLimit,
    sourceGuildId: session.sourceGuildId || a.guildId,
  });
  if (!started.ok) {
    if (started.busy) {
      return fail(409, "load_busy", "C'è già un ripristino in corso su questo server.");
    }
    return fail(500, "start_failed", "Impossibile avviare il ripristino.");
  }

  deleteLoadSession(sessionId);
  void started.run.then((result) => {
    if (!result.ok && !result.cancelled) {
      global.logger?.error?.("[dashboard.backup] load failed:", result.error);
    } else if (result.cancelled) {
      global.logger?.info?.("[dashboard.backup] load cancelled", { guildId: a.guildId, backupId: session.backupId });
    } else {
      global.logger?.info?.("[dashboard.backup] load done", { guildId: a.guildId, backupId: session.backupId });
    }
  });

  return {
    ok: true,
    status: 202,
    started: true,
    loadStatus: getGuildBackupLoadStatus(a.guildId),
  };
}

async function loadStatus(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return {
    ok: true,
    status: 200,
    loadStatus: getGuildBackupLoadStatus(a.guildId),
    createStatus: getGuildBackupCreateStatus(a.guildId),
  };
}

async function cancelLoad(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const cancelled = cancelGuildBackupLoad(a.guildId);
  if (!cancelled) return fail(404, "not_running", "Nessun ripristino in corso.");
  return { ok: true, status: 200, cancelled: true, loadStatus: getGuildBackupLoadStatus(a.guildId) };
}

export = {
  listBackups,
  createBackup,
  createStatus,
  getBackup,
  deleteBackup,
  getSettings,
  patchSettings,
  listLoadActions,
  createSession,
  patchSession,
  preflightSession,
  confirmSession,
  loadStatus,
  cancelLoad,
};
