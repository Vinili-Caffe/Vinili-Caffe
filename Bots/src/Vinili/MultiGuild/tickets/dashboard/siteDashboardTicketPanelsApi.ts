const { verifyDashboardGuildAccess } = require("../../dashboard/siteDashboardApi") as typeof import("../../dashboard/siteDashboardApi");
const { listGuildPickerData } = require("../../../Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Partner/dashboard/siteDashboardPartnershipApi");
const {
  getGuildPanels,
  mutateGuildPanels,
  normalizeSingle,
  normalizeMulti,
  newPanelId,
  MAX_SINGLES,
  MAX_MULTIS,
  ticketTypeLabel,
  refreshTicketPanelsCache,
} = require("../tenant/tenantTicketPanels") as typeof import("../tenant/tenantTicketPanels");
  const { getTicketSettingsForGuild } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
  const { publishSinglePanel, publishMultiPanel } = require("../discord/ticketPanelPublishRuntime") as typeof import("../discord/ticketPanelPublishRuntime");
  const { isMainGuild } = require("../../../Moderation/utils/permTenantBypass") as typeof import("../../../Moderation/utils/permTenantBypass");
  const { supportHoursLabel, defaultWelcomeForTicketType, isWelcomeEmpty } = require("../discord/ticketPanelOptions") as typeof import("../discord/ticketPanelOptions");
  const {
    ensureGuildDefaultTeam,
    getGuildTeams,
  } = require("../tenant/tenantTicketTeams") as typeof import("../tenant/tenantTicketTeams");

const MAIN_TICKETS_SITE_ONLY = "Sul server principale i ticket Discord non sono più usati: apri da /tickets/ sul sito.";

const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_channel: "Canale non valido.",
  not_found: "Pannello non trovato.",
  missing_channel: "Seleziona un canale per il pannello.",
  publish_failed: "Pubblicazione su Discord non riuscita.",
  edit_failed: "Messaggio Discord del pannello non aggiornato (potrebbe essere stato eliminato).",
  need_two_panels: "Un multi-panel richiede almeno 2 pannelli singoli.",
  quota_singles: `Quota pannelli raggiunta (max ${MAX_SINGLES}).`,
  quota_multis: `Quota multi-panel raggiunta (max ${MAX_MULTIS}).`,
  invalid_type: "Tipo ticket non valido.",
  invalid_panels: "Seleziona pannelli validi.",
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function resolvePanelChannelName(channelId?, pickers?) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  const channels = Array.isArray(pickers?.textChannels) ? pickers.textChannels : [];
  const ch = channels.find((c?) => String(c.id) === id);
  if (ch?.name) {
    const n = String(ch.name);
    return n.startsWith("#") ? n : `#${n}`;
  }
  return `#${id}`;
}

function serializeSingle(panel?, pickers?, settings?) {
  const effectiveChannelId =
    String(panel?.channelId || "").trim() || String(settings?.panelChannelId || "").trim() || null;
  const welcome = isWelcomeEmpty(panel?.welcome)
    ? defaultWelcomeForTicketType(panel?.ticketType)
    : panel.welcome;
  return {
    ...panel,
    welcome,
    ticketTypeLabel: ticketTypeLabel(panel.ticketType),
    channelName: resolvePanelChannelName(effectiveChannelId, pickers),
    supportHoursLabel:
      supportHoursLabel(panel?.supportHours) || panel?.supportHoursLabel || "24/7",
  };
}

function welcomeDefaultsMap() {
  return {
    supporto: defaultWelcomeForTicketType("supporto"),
    partnership: defaultWelcomeForTicketType("partnership"),
    high: defaultWelcomeForTicketType("high"),
    perks: defaultWelcomeForTicketType("perks"),
  };
}

function serializeMulti(multi?, bucket?, pickers?, settings?) {
  const effectiveChannelId =
    String(multi?.channelId || "").trim() || String(settings?.panelChannelId || "").trim() || null;
  const byId = new Map((bucket.singles || []).map((s?) => [String(s.id), s]));
  const linked = (multi.panelIds || [])
    .map((id?) => byId.get(String(id)))
    .filter(Boolean)
    .map((p?) => ({ id: p.id, title: p.title, ticketType: p.ticketType, ticketTypeLabel: ticketTypeLabel(p.ticketType) }));
  return {
    ...multi,
    channelName: resolvePanelChannelName(effectiveChannelId, pickers),
    panels: linked,
    panelCount: linked.length,
  };
}

async function listDashboardTicketPanels(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  await refreshTicketPanelsCache().catch(() => null);

  const guild =
    client?.guilds?.cache?.get(gid) ||
    (await client?.guilds?.fetch?.(gid).catch(() => null));
  if (!isMainGuild(gid)) {
    await ensureGuildDefaultTeam(gid, guild).catch(() => null);
  }

  const [bucket, settings, pickers, teamsBucket] = await Promise.all([
    getGuildPanels(gid),
    getTicketSettingsForGuild(gid).catch(() => null),
        listGuildPickerData(client, gid).catch(() => ({
      textChannels: [],
      roles: [],
      categories: [],
      emojis: [],
    })),
    getGuildTeams(gid).catch(() => ({ teams: [] })),
  ]);

  return {
    ok: true,
    status: 200,
    guildId: gid,
    quota: {
      singlesUsed: (bucket.singles || []).length,
      singlesMax: MAX_SINGLES,
      multisUsed: (bucket.multis || []).length,
      multisMax: MAX_MULTIS,
    },
    settings: {
      panelChannelId: settings?.panelChannelId || null,
      enabled: settings?.enabled === true,
      maxOpenTicketsPerUser: Math.max(1, Number(settings?.maxOpenTicketsPerUser) || 1),
      hideCloseButton: settings?.hideCloseButton === true,
      hideCloseReasonButton: settings?.hideCloseReasonButton === true,
      hideClaimButton: settings?.hideClaimButton === true,
      transcriptChannelId: settings?.transcriptChannelId || null,
      overflowCategoryId:
        settings?.overflowCategoryId && settings.overflowCategoryId !== "__custom__"
          ? String(settings.overflowCategoryId)
          : null,
      ticketPerms: {
        addReactions: settings?.ticketPerms?.addReactions !== false,
        sendTtsMessages: settings?.ticketPerms?.sendTtsMessages === true,
        embedLinks: settings?.ticketPerms?.embedLinks !== false,
        attachFiles: settings?.ticketPerms?.attachFiles !== false,
        useExternalEmojis: settings?.ticketPerms?.useExternalEmojis !== false,
        useExternalStickers: settings?.ticketPerms?.useExternalStickers !== false,
        sendVoiceMessages: settings?.ticketPerms?.sendVoiceMessages === true,
      },
    },
    singles: (bucket.singles || []).map((p?) => serializeSingle(p, pickers, settings)),
    multis: (bucket.multis || []).map((m?) => serializeMulti(m, bucket, pickers, settings)),
    teams: (teamsBucket.teams || []).map((t?) => ({
      id: t.id,
      name: t.name,
      isDefault: t.isDefault === true,
    })),
    welcomeDefaults: welcomeDefaultsMap(),
    pickers,
    syncedAt: bucket.syncedAt || null,
  };
}

async function createDashboardTicketPanel(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const now = new Date().toISOString();

  const before = await getGuildPanels(gid);
  if ((before.singles || []).length >= MAX_SINGLES) {
    return fail(400, "quota_singles", reasonToMessage("quota_singles"));
  }
  const panelDraft = normalizeSingle({
    ...src,
    id: newPanelId(),
    seedKey: null,
    messageId: null,
    createdAt: now,
    updatedAt: now,
  });
  if (!panelDraft.ticketType) return fail(400, "invalid_type", reasonToMessage("invalid_type"));

  const created = await mutateGuildPanels(gid, (prev?) => ({
    ...prev,
    singles: [...(prev.singles || []), panelDraft],
  }));

  if (!created.ok) return fail(500, created.reason || "persist_failed", reasonToMessage(created.reason));

  const panel = (created.bucket.singles || []).find((s?) => String(s.id) === String(panelDraft.id)) || panelDraft;
  let publish = null;
  if (src.publish === true && panel?.channelId && !isMainGuild(gid)) {
    publish = await publishSinglePanel(client, gid, panel.id);
    if (!publish.ok && publish.reason !== "missing_channel") {
      return {
        ok: true,
        status: 200,
        panel: serializeSingle(panel, null),
        publishWarning: reasonToMessage(publish.reason),
      };
    }
  }

  const fresh = await getGuildPanels(gid);
  const saved = (fresh.singles || []).find((s?) => String(s.id) === String(panel.id)) || panel;
  return { ok: true, status: 200, panel: serializeSingle(saved, null), published: Boolean(publish?.ok) };
}

async function updateDashboardTicketPanel(client?, accessToken?, guildId?, panelId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const pid = String(panelId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const now = new Date().toISOString();

  const before = await getGuildPanels(gid);
  if (!(before.singles || []).some((s?) => String(s.id) === pid)) {
    return fail(404, "not_found", reasonToMessage("not_found"));
  }

  const updated = await mutateGuildPanels(gid, (prev?) => {
    const idx = (prev.singles || []).findIndex((s?) => String(s.id) === pid);
    if (idx < 0) return prev;
    const next = normalizeSingle({ ...prev.singles[idx], ...src, id: pid, updatedAt: now });
    const singles = [...prev.singles];
    singles[idx] = next;
    return { ...prev, singles };
  });

  if (!updated.ok) return fail(500, updated.reason || "persist_failed", reasonToMessage(updated.reason));

  const panel = (updated.bucket.singles || []).find((s?) => String(s.id) === pid);
  let publish = null;
  if (!isMainGuild(gid)) {
    if (src.publish === true && src.syncExisting !== true && panel?.channelId) {
      publish = await publishSinglePanel(client, gid, pid);
    } else if (src.syncExisting === true && panel?.channelId && panel?.messageId) {
      publish = await publishSinglePanel(client, gid, pid, { editOnly: true });
    }
  }
  let permsSync = null;
  if (Object.prototype.hasOwnProperty.call(src, "ticketPerms")) {
    try {
      const { syncOpenTicketOpenerPermissions } = require("../discord/ticketGuildOptions") as typeof import("../discord/ticketGuildOptions");
      permsSync = await syncOpenTicketOpenerPermissions(client, gid);
    } catch (err) {
      global.logger?.warn?.("[dashboard ticket panels] open perms sync:", err?.message || err);
    }
  }
  const fresh = await getGuildPanels(gid);
  const saved = (fresh.singles || []).find((s?) => String(s.id) === pid) || panel;
  let publishWarning = null;
  if (publish && !publish.ok) {
    publishWarning = publish.clearedMessageId
      ? "Config salvata. Il messaggio Discord non c’è più: usa Pubblica per reinviarlo."
      : reasonToMessage(publish.reason);
  }
  return {
    ok: true,
    status: 200,
    panel: serializeSingle(saved, null),
    published: Boolean(publish?.ok),
    publishWarning,
    permsSync,
  };
}

async function deleteDashboardTicketPanel(client?, accessToken?, guildId?, panelId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const pid = String(panelId || "").trim();

  const before = await getGuildPanels(gid);
  if (!(before.singles || []).some((s?) => String(s.id) === pid)) {
    return fail(404, "not_found", reasonToMessage("not_found"));
  }
  const updated = await mutateGuildPanels(gid, (prev?) => ({
    ...prev,
    singles: (prev.singles || []).filter((s?) => String(s.id) !== pid),
    multis: (prev.multis || []).map((m?) =>
      normalizeMulti({
        ...m,
        panelIds: (m.panelIds || []).filter((id?) => String(id) !== pid),
      }),
    ),
  }));
  if (!updated.ok) return fail(500, updated.reason || "persist_failed", reasonToMessage(updated.reason));
  return { ok: true, status: 200, deleted: true, panelId: pid };
}

async function createDashboardTicketMultiPanel(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const now = new Date().toISOString();
  const bucket = await getGuildPanels(gid);
  const panelIds = Array.isArray(src.panelIds) ? src.panelIds.map((x?) => String(x).trim()).filter(Boolean) : [];
  const validIds = panelIds.filter((id?) => (bucket.singles || []).some((s?) => String(s.id) === id));
  if (validIds.length < 2) return fail(400, "need_two_panels", reasonToMessage("need_two_panels"));

  if ((bucket.multis || []).length >= MAX_MULTIS) {
    return fail(400, "quota_multis", reasonToMessage("quota_multis"));
  }
  const multiDraft = normalizeMulti({
    ...src,
    id: newPanelId(),
    panelIds: validIds,
    seedKey: null,
    messageId: null,
    createdAt: now,
    updatedAt: now,
  });
  const created = await mutateGuildPanels(gid, (prev?) => ({
    ...prev,
    multis: [...(prev.multis || []), multiDraft],
  }));

  if (!created.ok) return fail(500, created.reason || "persist_failed", reasonToMessage(created.reason));

  const multi = (created.bucket.multis || []).find((m?) => String(m.id) === String(multiDraft.id)) || multiDraft;
  let publish = null;
  if (src.publish === true && multi?.channelId && !isMainGuild(gid)) {
    publish = await publishMultiPanel(client, gid, multi.id);
  }
  const fresh = await getGuildPanels(gid);
  const saved = (fresh.multis || []).find((m?) => String(m.id) === String(multi.id)) || multi;
  return {
    ok: true,
    status: 200,
    panel: serializeMulti(saved, fresh, null),
    published: Boolean(publish?.ok),
    publishWarning: publish && !publish.ok ? reasonToMessage(publish.reason) : null,
  };
}

async function updateDashboardTicketMultiPanel(client?, accessToken?, guildId?, multiId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const mid = String(multiId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const now = new Date().toISOString();
  const bucket = await getGuildPanels(gid);

  if (Array.isArray(src.panelIds)) {
    const validIds = src.panelIds
      .map((x?) => String(x).trim())
      .filter((id?) => (bucket.singles || []).some((s?) => String(s.id) === id));
    if (validIds.length < 2) return fail(400, "need_two_panels", reasonToMessage("need_two_panels"));
    src.panelIds = validIds;
  }

  if (!(bucket.multis || []).some((m?) => String(m.id) === mid)) {
    return fail(404, "not_found", reasonToMessage("not_found"));
  }

  const updated = await mutateGuildPanels(gid, (prev?) => {
    const idx = (prev.multis || []).findIndex((m?) => String(m.id) === mid);
    if (idx < 0) return prev;
    const next = normalizeMulti({ ...prev.multis[idx], ...src, id: mid, updatedAt: now });
    const multis = [...prev.multis];
    multis[idx] = next;
    return { ...prev, multis };
  });

  if (!updated.ok) return fail(500, updated.reason || "persist_failed", reasonToMessage(updated.reason));

  let publish = null;
  if (!isMainGuild(gid)) {
    if (src.publish === true && src.syncExisting !== true) {
      publish = await publishMultiPanel(client, gid, mid);
    } else if (src.syncExisting === true) {
      const multiRow = (updated.bucket.multis || []).find((m?) => String(m.id) === mid);
      if (multiRow?.channelId && multiRow?.messageId) {
        publish = await publishMultiPanel(client, gid, mid, { editOnly: true });
      }
    }
  }
  const fresh = await getGuildPanels(gid);
  const saved = (fresh.multis || []).find((m?) => String(m.id) === mid);
  let publishWarning = null;
  if (publish && !publish.ok) {
    publishWarning = publish.clearedMessageId
      ? "Config salvata. Il messaggio Discord non c’è più: usa Pubblica per reinviarlo."
      : reasonToMessage(publish.reason);
  }
  return {
    ok: true,
    status: 200,
    panel: serializeMulti(saved, fresh, null),
    published: Boolean(publish?.ok),
    publishWarning,
  };
}

async function deleteDashboardTicketMultiPanel(client?, accessToken?, guildId?, multiId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const mid = String(multiId || "").trim();
  const before = await getGuildPanels(gid);
  if (!(before.multis || []).some((m?) => String(m.id) === mid)) {
    return fail(404, "not_found", reasonToMessage("not_found"));
  }
  const updated = await mutateGuildPanels(gid, (prev?) => ({
    ...prev,
    multis: (prev.multis || []).filter((m?) => String(m.id) !== mid),
  }));
  if (!updated.ok) return fail(500, updated.reason || "persist_failed", reasonToMessage(updated.reason));
  return { ok: true, status: 200, deleted: true, multiId: mid };
}

async function publishDashboardTicketPanel(client?, accessToken?, guildId?, panelId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  if (isMainGuild(guildId)) return fail(400, "main_site_only", MAIN_TICKETS_SITE_ONLY);
  const forceNew = body && typeof body === "object" ? body.forceNew === true : false;
  const out = await publishSinglePanel(client, String(guildId), String(panelId), { forceNew });
  if (!out.ok) return fail(400, out.reason || "publish_failed", reasonToMessage(out.reason));
  return { ok: true, status: 200, panel: serializeSingle(out.panel, null), messageId: out.messageId };
}

async function publishDashboardTicketMultiPanel(client?, accessToken?, guildId?, multiId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  if (isMainGuild(guildId)) return fail(400, "main_site_only", MAIN_TICKETS_SITE_ONLY);
  const forceNew = body && typeof body === "object" ? body.forceNew === true : false;
  const out = await publishMultiPanel(client, String(guildId), String(multiId), { forceNew });
  if (!out.ok) return fail(400, out.reason || "publish_failed", reasonToMessage(out.reason));
  return { ok: true, status: 200, panel: serializeMulti(out.panel, await getGuildPanels(guildId), null), messageId: out.messageId };
}

async function syncDashboardTicketPanels(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  if (isMainGuild(guildId)) return fail(400, "main_site_only", MAIN_TICKETS_SITE_ONLY);
  await refreshTicketPanelsCache().catch(() => null);
  return listDashboardTicketPanels(client, accessToken, guildId);
}

export = {
  listDashboardTicketPanels,
  createDashboardTicketPanel,
  updateDashboardTicketPanel,
  deleteDashboardTicketPanel,
  createDashboardTicketMultiPanel,
  updateDashboardTicketMultiPanel,
  deleteDashboardTicketMultiPanel,
  publishDashboardTicketPanel,
  publishDashboardTicketMultiPanel,
  syncDashboardTicketPanels,
};
