/**
 * boardsInboxRevisione1: Bacheca pending → coda Inbox "revisione" (Server|Bot).
 * boardsInboxSelfNotif1: notifica anche il mittente se è staff (revisione).
 */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const BL = SITE_DOCUMENT_TYPE.BOARD_LISTING;
const QUEUE = "revisione";

function boardsRevisioneDedupeKey(listingId?) {
  const id = String(listingId || "").trim();
  return id ? `boards:revisione:${id}` : "";
}

function kindLabel(kind?) {
  return String(kind || "").toLowerCase() === "bot" ? "Bot" : "Server";
}

function listingPlain(doc?) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

function buildBoardsWorkflowFields(doc?) {
  const d = listingPlain(doc) || {};
  const kind = String(d.boardKind || "") === "bot" ? "bot" : "server";
  const cats = Array.isArray(d.boardCategories) ? d.boardCategories.map(String).filter(Boolean) : [];
  const locs = Array.isArray(d.boardLocales)
    ? d.boardLocales.map(String).filter(Boolean)
    : d.boardLocale
      ? [String(d.boardLocale)]
      : [];
  const invite = String(
    kind === "bot" ? d.boardBotInviteUrl || d.boardInviteUrl || "" : d.boardInviteUrl || "",
  ).trim();
  const rows = [
    { name: "Tipo", value: kindLabel(kind) },
    { name: "Nome scheda", value: String(d.title || "").trim() },
    { name: "Descrizione breve", value: String(d.boardTagline || "").trim() },
    {
      name: "Descrizione",
      value: String(d.boardMarkdown || d.content || "").trim().slice(0, 4000),
    },
    { name: "Categorie", value: cats.join(", ") },
    { name: "Lingue", value: locs.join(", ") },
    {
      name: kind === "bot" ? "Invite bot" : "Invite server",
      value: invite,
    },
    { name: "Sito", value: String(d.boardSiteUrl || "").trim() },
    { name: "Discord ID", value: String(d.boardDiscordId || "").trim() },
    { name: "Slug", value: String(d.boardSlug || "").trim() },
  ];
  return rows.filter((r?) => r.value);
}

/* boardsRevSheetUi1: meta strutturata per sheet staff (oltre alle rows QA) */
function buildBoardsWorkflowMeta(doc?) {
  const d = listingPlain(doc) || {};
  const kind = String(d.boardKind || "") === "bot" ? "bot" : "server";
  const cats = Array.isArray(d.boardCategories) ? d.boardCategories.map(String).filter(Boolean) : [];
  const locs = Array.isArray(d.boardLocales)
    ? d.boardLocales.map(String).filter(Boolean)
    : d.boardLocale
      ? [String(d.boardLocale)]
      : [];
  const invite = String(
    kind === "bot" ? d.boardBotInviteUrl || d.boardInviteUrl || "" : d.boardInviteUrl || "",
  ).trim();
  return {
    rows: buildBoardsWorkflowFields(d),
    kind,
    listingName: String(d.title || "").trim(),
    tagline: String(d.boardTagline || "").trim(),
    description: String(d.boardMarkdown || d.content || "").trim().slice(0, 50000),
    categories: cats,
    locales: locs,
    inviteUrl: invite,
    siteUrl: String(d.boardSiteUrl || "").trim(),
    discordId: String(d.boardDiscordId || "").trim(),
    slug: String(d.boardSlug || "").trim(),
    iconUrl: String(d.boardIconUrl || "").trim(),
    bannerUrl: String(d.boardBannerUrl || "").trim(),
  };
}

async function upsertBoardsRevisioneWorkflow(doc?, opts: Record<string, any> = {}) {
  const d = listingPlain(doc);
  if (!d) return null;
  const listingId = String(d._id || d.id || "").trim();
  if (!listingId) return null;
  const kind = String(d.boardKind || "") === "bot" ? "bot" : "server";
  const statusRaw = String(opts.status || d.status || "pending").trim().toLowerCase();
  const status =
    statusRaw === "approved"
      ? "accepted"
      : statusRaw === "rejected" || statusRaw === "suspended"
        ? "rejected"
        : statusRaw === "pending"
          ? "pending"
          : "closed";
  const name = String(d.title || "").trim() || "Scheda vetrina";
  const tagline = String(d.boardTagline || "").trim();
  const dedupeKey = boardsRevisioneDedupeKey(listingId);
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  const subjectName =
    String(opts.subjectName || d.boardModeration?.submittedByName || d.authorName || "").trim() ||
    String(d.userId || "");
  const iconUrl = String(d.boardIconUrl || "").trim();

  const { upsertStaffWorkflowItem } = require("../workflow/siteStaffWorkflowStore") as typeof import("../workflow/siteStaffWorkflowStore");
  const wfDoc = await upsertStaffWorkflowItem({
    guildId,
    queue: QUEUE,
    userId: String(d.userId || "").trim(),
    dedupeKey,
    messageId: listingId,
    channelId: "site-boards",
    kind,
    type: kind,
    status,
    title: `${kindLabel(kind)} · ${name}`.slice(0, 120),
    preview: tagline || `${kindLabel(kind)} in moderazione`,
    body: tagline || `${kindLabel(kind)} in moderazione`,
    content: String(d.boardMarkdown || d.content || tagline || "").slice(0, 50000),
    displayName: subjectName,
    avatarUrl: iconUrl,
    workflowFields: buildBoardsWorkflowMeta(d),
    decidedBy: opts.decidedBy || "",
    decidedByName: opts.decidedByName || "",
    staffReason: opts.staffReason || "",
    createdAt: d.boardModeration?.submittedAt || d.updatedAt || d.createdAt || new Date(),
  });

  try {
    const { broadcastSiteStaffWorkflowChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    broadcastSiteStaffWorkflowChanged(QUEUE);
  } catch (_) {}

  try {
    const { invalidateWorkflowSummaryCache } = require("../workflow/siteStaffWorkflowApi") as typeof import("../workflow/siteStaffWorkflowApi");
    invalidateWorkflowSummaryCache();
  } catch (_) {}

  return wfDoc;
}

async function notifyBoardsRevisioneStaff(client?, doc?, opts: Record<string, any> = {}) {
  const d = listingPlain(doc);
  if (!d) return 0;
  const listingId = String(d._id || d.id || "").trim();
  const kind = String(d.boardKind || "") === "bot" ? "bot" : "server";
  const name = String(d.title || "").trim() || "Scheda";
  const subjectName =
    String(opts.subjectName || d.boardModeration?.submittedByName || d.authorName || "").trim() ||
    "Un utente";
  const guildId = String(IDs.guilds?.main || "").trim();
  let guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (client?.guilds?.fetch ? await client.guilds.fetch(guildId).catch(() => null) : null);
  if (!guild) return 0;
  const { notifyInboxStaffNewItem } = require("../workflow/siteStaffWorkflowNotifications") as typeof import("../workflow/siteStaffWorkflowNotifications");
  const repend = Boolean(opts.repending);
  return notifyInboxStaffNewItem({
    guild,
    queue: QUEUE,
    subjectUserId: String(d.userId || "").trim(),
    subjectName,
    title: repend ? "Scheda vetrina da rivedere" : "Nuova scheda in revisione",
    body: repend
      ? `${subjectName} ha aggiornato campi sensibili di «${name}» (${kindLabel(kind)}).`
      : `${subjectName} ha inviato «${name}» (${kindLabel(kind)}) in moderazione.`,
    messageId: listingId,
    itemId: listingId,
    kind,
    dedupeKey: `inbox:revisione:new:${listingId}`,
    /* boardsRevPreview1 + boardsRevLangPath1: scheda?id= resiste a /en/… */
    openUrl: `/vetrina/scheda/?id=${encodeURIComponent(listingId)}&review=1`,
  }).catch(() => 0);
}

async function notifyBoardsOwnerDecision(doc?, opts: Record<string, any> = {}) {
  const d = listingPlain(doc);
  if (!d) return false;
  const listingId = String(d._id || d.id || "").trim();
  const userId = String(d.userId || "").trim();
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!listingId || !userId || !guildId) return false;
  const decision = String(opts.decision || d.status || "").trim().toLowerCase();
  const status =
    decision === "approve" || decision === "approved" || decision === "accepted"
      ? "accepted"
      : decision === "reject" || decision === "rejected" || decision === "suspend" || decision === "suspended"
        ? "rejected"
        : "";
  if (!status) return false;
  const kind = String(d.boardKind || "") === "bot" ? "bot" : "server";
  const name = String(d.title || "").trim() || "la tua scheda";
  const reason = String(opts.reason || d.staffReason || d.boardModeration?.rejectReason || "").trim();
  let title = "Scheda vetrina aggiornata";
  let body = `La scheda «${name}» è stata aggiornata.`;
  if (status === "accepted") {
    title = "Scheda approvata";
    body = `La scheda «${name}» (${kindLabel(kind)}) è stata approvata.`;
  } else if (decision === "suspend" || decision === "suspended") {
    title = "Scheda sospesa";
    body = `La scheda «${name}» è stata sospesa.` + (reason ? ` Motivo: ${reason}` : "");
  } else {
    title = "Scheda rifiutata";
    body = `La scheda «${name}» non è stata approvata.` + (reason ? ` Motivo: ${reason}` : "");
  }
  const { notifyWorkflowSubjectDecision } = require("../workflow/siteStaffWorkflowNotifications") as typeof import("../workflow/siteStaffWorkflowNotifications");
  return notifyWorkflowSubjectDecision({
    guildId,
    userId,
    queue: QUEUE,
    status,
    title,
    body: body.slice(0, 500),
    decidedByName: opts.decidedByName || "",
    dedupeKey: boardsRevisioneDedupeKey(listingId),
    notifDedupeKey: `wfc:decision:revisione:${listingId}:${status}`,
    openUrl: "/vetrina/le-mie/",
    workflow: { workflowKind: kind },
  }).catch(() => false);
}

async function onBoardsListingPending(client?, doc?, opts: Record<string, any> = {}) {
  const wf = await upsertBoardsRevisioneWorkflow(doc, { status: "pending", ...opts });
  if (opts.notify !== false) {
    void notifyBoardsRevisioneStaff(client, doc, opts).catch(() => 0);
  }
  return wf;
}

async function onBoardsListingDecided(client?, doc?, opts: Record<string, any> = {}) {
  const decision = String(opts.decision || doc?.status || "").trim().toLowerCase();
  const status =
    decision === "approve" || decision === "approved" ? "accepted" : "rejected";
  const wf = await upsertBoardsRevisioneWorkflow(doc, {
    status,
    decidedBy: opts.decidedBy || "",
    decidedByName: opts.decidedByName || "",
    staffReason: opts.reason || "",
  });
  try {
    const { clearWorkflowLifecycleNotifs } = require("../workflow/siteStaffWorkflowNotifications") as typeof import("../workflow/siteStaffWorkflowNotifications");
    if (wf) void clearWorkflowLifecycleNotifs(wf).catch(() => null);
  } catch (_) {}
  if (opts.notifyOwner !== false) {
    void notifyBoardsOwnerDecision(doc, opts).catch(() => false);
  }
  return wf;
}

/* boardsMineDelete1: ritiro/cancellazione owner → chiudi workflow + inbox staff */
/* boardsSchedaMissUi1: purge notif staff per openUrl scheda anche se workflow assente */
async function onBoardsListingWithdrawn(client?, doc?, opts: Record<string, any> = {}) {
  const d = listingPlain(doc);
  if (!d) return false;
  const listingId = String(d._id || d.id || "").trim();
  if (!listingId) return false;
  let wf = null;
  try {
    wf = await upsertBoardsRevisioneWorkflow(d, {
      status: "closed",
      staffReason: String(opts.reason || "owner_delete"),
    });
  } catch (_) {
    wf = null;
  }
  try {
    const { clearWorkflowLifecycleNotifs } = require("../workflow/siteStaffWorkflowNotifications") as typeof import("../workflow/siteStaffWorkflowNotifications");
    if (wf) void clearWorkflowLifecycleNotifs(wf).catch(() => null);
  } catch (_) {}
  try {
    const { removeInboxItemByDedupeKey, removeSiteInAppNotificationsMatching } = require(
      "../notifications/siteInAppNotificationsService",
    ) as typeof import("../notifications/siteInAppNotificationsService");
    const uid = String(d.userId || "").trim();
    if (uid) {
      void removeInboxItemByDedupeKey(uid, boardsRevisioneDedupeKey(listingId)).catch(() => false);
      void removeInboxItemByDedupeKey(uid, `inbox:revisione:new:${listingId}`).catch(() => false);
    }
    const openUrls = [
      `/bacheca/scheda/?id=${encodeURIComponent(listingId)}`,
      `/bacheca/scheda/?id=${encodeURIComponent(listingId)}&review=1`,
      `/bacheca/server/${encodeURIComponent(listingId)}/`,
      `/bacheca/server/${encodeURIComponent(listingId)}/?review=1`,
      `/bacheca/bots/${encodeURIComponent(listingId)}`,
      `/bacheca/bots/${encodeURIComponent(listingId)}?review=1`,
      /* vetrina1: le notifiche nuove puntano a /vetrina/, quelle vecchie restano su /bacheca/ */
      `/vetrina/scheda/?id=${encodeURIComponent(listingId)}`,
      `/vetrina/scheda/?id=${encodeURIComponent(listingId)}&review=1`,
    ];
    void removeSiteInAppNotificationsMatching({
      exactKeys: [`inbox:revisione:new:${listingId}`, boardsRevisioneDedupeKey(listingId)],
      openUrls,
      forceDismiss: true,
    }).catch(() => null);
  } catch (_) {}
  return true;
}

async function decideBoardsFromWorkflow(client?, access?, body: Record<string, any> = {}) {
  const listingId = String(body.listingId || body.messageId || body.id || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  if (!listingId) {
    return { ok: false, status: 400, error: "missing_fields", message: "listingId richiesto." };
  }
  const decision =
    action === "accept" || action === "approve"
      ? "approve"
      : action === "reject"
        ? "reject"
        : action === "suspend"
          ? "suspend"
          : "";
  if (!decision) {
    return { ok: false, status: 400, error: "bad_action", message: "Azione non valida (accept|reject)." };
  }
  const { modDecide } = require("./siteBoardsApi") as typeof import("./siteBoardsApi");
  const token = String(access?.accessToken || body.accessToken || "").trim();
  const out: any = await modDecide(client, {
    accessToken: token,
    listingId,
    decision,
    reason: body.reason || body.motivo || "",
    notes: body.notes || "",
  });
  if (!out?.ok) return out;
  return {
    ok: true,
    status: 200,
    message:
      decision === "approve"
        ? "Scheda approvata."
        : decision === "suspend"
          ? "Scheda sospesa."
          : "Scheda rifiutata.",
    item: out.listing
      ? {
          listingId,
          messageId: listingId,
          kind: out.listing.kind,
          status: decision === "approve" ? "accepted" : "rejected",
          canAct: false,
        }
      : null,
  };
}

export = {
  QUEUE,
  upsertBoardsRevisioneWorkflow,
  onBoardsListingPending,
  onBoardsListingDecided,
  onBoardsListingWithdrawn,
  decideBoardsFromWorkflow,
  kindLabel,
};
