const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { resolveSubmissionChannel } = require("../../site/staff/candidature/candidatureApplicationHandlers") as typeof import("../../site/staff/candidature/candidatureApplicationHandlers");
const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { applyWebsiteUnmute } = require("../../site/staff/appeals/unmuteWebsiteHandlers") as typeof import("../../site/staff/appeals/unmuteWebsiteHandlers");
const { sendDm } = require("../../Community/utils/noDmList") as typeof import("../../Community/utils/noDmList");
const {
  getAppealsSettingsFresh,
  resolveAppealInviteUrl,
} = require("../../../MultiGuild/core/tenantAppealsRuntime") as typeof import("../../../MultiGuild/core/tenantAppealsRuntime");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");

function appealSubjectOpenUrl(messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid) return "/appelli/";
  return `/appelli/?chat=${encodeURIComponent(`appelli:${mid}`)}`;
}

async function notifyAppealSubject(guildId, userId, { title, body, dedupeKey, messageId }) {
  return enqueueSiteInAppNotification({
    guildId,
    userId,
    title,
    body,
    kind: "workflow_decision",
    channel: "personal",
    openUrl: appealSubjectOpenUrl(messageId),
    dedupeKey,
    dedupeWindowMs: 86_400_000,
    replaceDedupe: true,
  });
}

async function sendAppealDecisionDm(guild?, userId?, { title, body, inviteUrl = "" } = {}) {
  const uid = String(userId || "").trim();
  if (!uid || !guild?.client) return false;
  let user = guild.client.users.cache.get(uid) || null;
  if (!user) user = await guild.client.users.fetch(uid).catch(() => null);
  if (!user) return false;
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle(String(title || "Aggiornamento ricorso").slice(0, 250))
    .setDescription(String(body || "").slice(0, 4000));
  let components = undefined;
  const url = String(inviteUrl || "").trim();
  if (url && /^https?:\/\//i.test(url)) {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Rientra nel server")
          .setEmoji(E.link)
          .setURL(url),
      ),
    ];
  }
  return Boolean(
    await sendDm(user, { embeds: [embed], components }, { guildId: guild.id, bypassNoDm: true }).catch(() => false),
  );
}
const UNBAN_ACC = "website_unban_acc";
const UNBAN_REJ = "website_unban_rej";
const UNMUTE_ACC = "website_unmute_acc";
const UNMUTE_REJ = "website_unmute_rej";
const ACCEPTED_COLOR = "#2ECC71";
const REJECTED_COLOR = "#ED4245";
const OBSOLETE_APPEAL_COLOR = "#95A5A6";
const WORKFLOW_DOC = "staff_workflow";

function stripDiscordDecorations(text?, opts: Record<string, any> = {}) {
  const keepNewlines = Boolean(opts?.keepNewlines);
  let s = String(text || "")
    .replace(/<a?:[\w~-]+:\d+>/g, "")
    .replace(/<(?:@(?:!|&)?|#)\d+>/g, "")
        .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[*_`~|]+/g, "");
  if (keepNewlines) {
    return s
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

function parseAppealFromMessage(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id.startsWith(`${UNBAN_ACC}:`) || id.startsWith(`${UNBAN_REJ}:`)) {
        const uid = id.split(":").slice(1).join(":").trim();
        if (/^\d{17,20}$/.test(uid)) return { kind: "unban", userId: uid };
      }
      if (id.startsWith(`${UNMUTE_ACC}:`) || id.startsWith(`${UNMUTE_REJ}:`)) {
        const uid = id.split(":").slice(1).join(":").trim();
        if (/^\d{17,20}$/.test(uid)) return { kind: "unmute", userId: uid };
      }
    }
  }
  return null;
}

function parseAppealKindFromEmbed(message?) {
  const title = String(message?.embeds?.[0]?.title || "").toLowerCase();
  if (title.includes("unban")) return "unban";
  if (title.includes("unmute")) return "unmute";
  return null;
}

function parseUserIdFromAppealMessage(message?) {
  const footer = String(message?.embeds?.[0]?.footer?.text || "");
  let m = footer.match(/User ID:\s*(\d{16,20})/i);
  if (m) return String(m[1]);
  const desc = String(message?.embeds?.[0]?.description || "");
  m = desc.match(/<@!?(\d{16,20})>/);
  if (m) return String(m[1]);
  return "";
}

function parseAppealFromMessageOrEmbed(message?) {
  const fromButtons = parseAppealFromMessage(message);
  if (fromButtons) return fromButtons;
  const kind = parseAppealKindFromEmbed(message);
  if (!kind) return null;
  const userId = parseUserIdFromAppealMessage(message);
  if (!/^\d{16,20}$/.test(userId)) return null;
  return { kind, userId };
}

function messageHasPendingAppealButtons(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (
        id.startsWith(`${UNBAN_ACC}:`) ||
        id.startsWith(`${UNBAN_REJ}:`) ||
        id.startsWith(`${UNMUTE_ACC}:`) ||
        id.startsWith(`${UNMUTE_REJ}:`)
      ) {
        return true;
      }
    }
  }
  return false;
}

function deriveAppealStatus(message?) {
  if (messageHasPendingAppealButtons(message)) return "pending";
  const color = Number(message?.embeds?.[0]?.color ?? 0);
  if (color === 0x2ecc71) return "accepted";
  if (color === 0xed4245) return "rejected";
  return "closed";
}

function embedFieldsToPlain(embed?) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  return fields
    .map((field?) => ({
      name: String(field?.name || "").trim(),
      value: stripDiscordDecorations(field?.value || ""),
    }))
    .filter((field?) => field.name || field.value);
}

function buildAppealListItem(msg?, channel?, parsed?) {
  const embed = msg.embeds?.[0];
  const status = deriveAppealStatus(msg);
  return {
    messageId: String(msg.id),
    channelId: String(msg.channelId || channel.id),
    kind: parsed.kind,
    userId: parsed.userId,
    title: String(embed?.title || (parsed.kind === "unban" ? "Richiesta Unban" : "Richiesta Unmute")).trim(),
    preview: stripDiscordDecorations(String(embed?.description || ""), { keepNewlines: true }).slice(0, 500),
    createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
    status,
    canAct: status === "pending",
  };
}

async function getAppealDetail(guild?, messageId?) {
  const channel = await resolveSubmissionChannel(guild);
  const msg = channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  if (!msg) return null;
  const parsed = parseAppealFromMessageOrEmbed(msg);
  if (!parsed) return null;
  const embed = msg.embeds?.[0];
  const status = deriveAppealStatus(msg);
  const item: Record<string, any> = {
    ...buildAppealListItem(msg, channel, parsed),
    body: stripDiscordDecorations(String(embed?.description || ""), { keepNewlines: true }),
    fields: embedFieldsToPlain(embed),
  };

    const uid = String(parsed.userId || "").trim();
  if (uid && /^\d{16,20}$/.test(uid)) {
    const member =
      guild?.members?.cache?.get(uid) || (await guild?.members?.fetch(uid).catch(() => null));
    const user =
      member?.user ||
      guild?.client?.users?.cache?.get(uid) ||
      (await guild?.client?.users?.fetch(uid).catch(() => null));
    const displayName = String(
      member?.displayName || user?.globalName || user?.username || "",
    ).trim();
    const avatarUrl =
      (typeof member?.displayAvatarURL === "function"
        ? member.displayAvatarURL({ size: 128, extension: "png", forceStatic: true })
        : "") ||
      (typeof user?.displayAvatarURL === "function"
        ? user.displayAvatarURL({ size: 128, extension: "png", forceStatic: true })
        : "") ||
      "";
    if (displayName) item.displayName = displayName;
    if (avatarUrl) item.avatarUrl = avatarUrl;
    item.fields = (Array.isArray(item.fields) ? item.fields : []).map((field?) => {
      const fname = String(field?.name || "").trim();
      if (!/^utente$/i.test(fname)) return field;
      const parts = [];
      if (displayName) parts.push(displayName);
      parts.push(uid);
      return { name: field.name, value: parts.join("\n") };
    });
    if (!item.fields.some((f?) => /^utente$/i.test(String(f?.name || "").trim()))) {
      item.fields = [
        { name: "Utente", value: displayName ? `${displayName}\n${uid}` : uid },
        ...item.fields,
      ];
    }
  }
  item.preview = stripDiscordDecorations(String(item.preview || ""), { keepNewlines: true })
    .replace(/^Utente\s*:?\s*/im, "")
    .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/\b\d{16,20}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
  return item;
}

async function deleteAppealStarterThread(message?) {
  if (!message?.id) return;
  let thread = message.thread;
  if (!thread) {
    const full = await message.fetch({ force: true }).catch(() => null);
    thread = full?.thread || null;
  }
  if (!thread) return;
  await thread.delete().catch(() => null);
}

function appealAutoCloseLabel(kind?) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "unban") return "Chiusa (ban già revocato)";
  if (k === "unmute") return "Chiusa (mute già revocato)";
  return "Chiusa (sanzione non più attiva)";
}

async function isUserBanned(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !/^\d{16,20}$/.test(uid)) return false;
  const ban = await guild.bans.fetch(uid).catch(() => null);
  return Boolean(ban);
}

async function appealSanctionStillActive(guild?, kind?, userId?) {
  const k = String(kind || "").trim().toLowerCase();
  const uid = String(userId || "").trim();
  if (!guild || !/^\d{16,20}$/.test(uid)) return true;
  if (k === "unban") return isUserBanned(guild, uid);
  if (k === "unmute") {
    const member =
      guild.members?.cache?.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (!member) return false;
    const { memberIsMuted } = require("../../site/staff/appeals/unmuteWebsiteHandlers") as typeof import("../../site/staff/appeals/unmuteWebsiteHandlers");
    return memberIsMuted(member);
  }
  return true;
}

async function notifyAppealAutoClosed(guild?, userId?, kind?, messageId?) {
  const k = String(kind || "").trim().toLowerCase();
  const uid = String(userId || "").trim();
  if (!guild?.id || !uid) return;
  const isUnban = k === "unban";
  await notifyAppealSubject(guild.id, uid, {
    title: isUnban ? "Richiesta unban chiusa" : "Richiesta unmute chiusa",
    body: isUnban
      ? "La tua richiesta unban è stata chiusa automaticamente perché il ban non risulta più attivo."
      : "La tua richiesta unmute è stata chiusa automaticamente perché il mute non risulta più attivo.",
    dedupeKey: `appeal-auto-close:${k}:${uid}:${messageId || "x"}`,
    messageId,
  }).catch(() => null);
}

async function closeAppealAsObsolete(guild?, message?, parsed?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const kind = String(parsed?.kind || opts.kind || "").trim().toLowerCase();
  const userId = String(parsed?.userId || opts.userId || "").trim();
  const messageId = String(message?.id || opts.messageId || "").trim();
  if (!gid || !kind || !userId) return false;

  const statusLabel = String(opts.statusLabel || appealAutoCloseLabel(kind)).slice(0, 200);
  const extras = {
    statusLabel,
    staffReason: statusLabel,
    decidedBy: "system",
    decidedByName: "",
  };

  if (message?.editable && messageHasPendingAppealButtons(message)) {
    const embeds = (message.embeds || []).map((embed?) =>
      EmbedBuilder.from(embed).setColor(OBSOLETE_APPEAL_COLOR),
    );
    await message.edit({ embeds, components: [] }).catch(() => null);
    await deleteAppealStarterThread(message);
  } else if (messageId) {
    const channel = await resolveSubmissionChannel(guild);
    const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (msg?.editable && messageHasPendingAppealButtons(msg)) {
      const embeds = (msg.embeds || []).map((embed?) =>
        EmbedBuilder.from(embed).setColor(OBSOLETE_APPEAL_COLOR),
      );
      await msg.edit({ embeds, components: [] }).catch(() => null);
      await deleteAppealStarterThread(msg);
    }
  }

  if (messageId) {
    try {
      const { updateStaffWorkflowFromMessage } = require("../workflow/siteStaffWorkflowStore") as typeof import("../workflow/siteStaffWorkflowStore");
      await updateStaffWorkflowFromMessage(gid, "appelli", messageId, "cancelled", extras);
    } catch (_) {}
  }

  if (opts.notify !== false) {
    await notifyAppealAutoClosed(guild, userId, kind, messageId);
  }
  return true;
}

async function autoClosePendingAppealsForUser(guild?, userId?, kind = "", opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const filterKind = String(kind || "").trim().toLowerCase();
  if (!gid || !/^\d{16,20}$/.test(uid)) return 0;

  const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "appelli",
    status: "pending",
  };
  if (filterKind === "unban" || filterKind === "unmute") filter.workflowKind = filterKind;

  const pendingDocs = await SiteDocument.find(filter)
    .select("workflowKind workflowMessageId userId")
    .limit(20)
    .lean()
    .catch(() => []);
  if (!pendingDocs?.length) return 0;

  let closed = 0;
  const channel = await resolveSubmissionChannel(guild);
  for (const doc of pendingDocs) {
    const appealKind = String(doc?.workflowKind || filterKind || "").trim().toLowerCase();
    if (appealKind !== "unban" && appealKind !== "unmute") continue;
    if (await appealSanctionStillActive(guild, appealKind, uid)) continue;

    const messageId = String(doc?.workflowMessageId || "").trim();
    let message = null;
    if (messageId && channel?.messages?.fetch) {
      message = await channel.messages.fetch(messageId).catch(() => null);
    }
    const parsed = message
      ? parseAppealFromMessageOrEmbed(message) || { kind: appealKind, userId: uid }
      : { kind: appealKind, userId: uid };
    const ok = await closeAppealAsObsolete(guild, message, parsed, {
      messageId,
      notify: opts.notify !== false,
    });
    if (ok) closed += 1;
  }
  return closed;
}

async function autoCloseObsoletePendingAppeals(guild?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !guild) return 0;

  const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const pendingDocs = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "appelli",
    status: "pending",
  })
    .select("workflowKind workflowMessageId userId")
    .limit(Math.min(100, Math.max(1, Number(opts.limit) || 40)))
    .lean()
    .catch(() => []);
  if (!pendingDocs?.length) return 0;

  const channel = await resolveSubmissionChannel(guild);
  let closed = 0;
  for (const doc of pendingDocs) {
    const uid = String(doc?.userId || "").trim();
    const appealKind = String(doc?.workflowKind || "").trim().toLowerCase();
    if (!uid || (appealKind !== "unban" && appealKind !== "unmute")) continue;
    if (await appealSanctionStillActive(guild, appealKind, uid)) continue;

    const messageId = String(doc?.workflowMessageId || "").trim();
    let message = null;
    if (messageId && channel?.messages?.fetch) {
      message = await channel.messages.fetch(messageId).catch(() => null);
    }
    const parsed = message
      ? parseAppealFromMessageOrEmbed(message) || { kind: appealKind, userId: uid }
      : { kind: appealKind, userId: uid };
    const ok = await closeAppealAsObsolete(guild, message, parsed, {
      messageId,
      notify: opts.notify !== false,
    });
    if (ok) closed += 1;
  }
  return closed;
}

async function setAppealMessageStatus(message?, accept?, decidedBy = "", decidedByName = "") {
  if (!message?.editable) return;
  const embeds = (message.embeds || []).map((embed?) =>
    EmbedBuilder.from(embed).setColor(accept ? ACCEPTED_COLOR : REJECTED_COLOR),
  );
  await message.edit({ embeds, components: [] }).catch(() => null);
  try {
    const { updateStaffWorkflowFromMessage } = require("../workflow/siteStaffWorkflowStore") as typeof import("../workflow/siteStaffWorkflowStore");
    await updateStaffWorkflowFromMessage(message.guild?.id, "appelli", message.id, accept ? "accepted" : "rejected", {
      decidedBy: String(decidedBy || ""),
      decidedByName: String(decidedByName || ""),
    });
  } catch (_) {}
}

function appealActorExtras(actorMember?) {
  const id = String(actorMember?.id || "").trim();
  const name = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  ).trim();
  return { decidedBy: id, decidedByName: name };
}

/** unbanAcceptFix1: site-api REST espone bans.remove; gateway espone members.unban */
async function guildUnbanUser(guild?, userId?, reason?) {
  const uid = String(userId || "").trim();
  const why = reason ? String(reason).slice(0, 512) : undefined;
  if (typeof guild?.members?.unban === "function") {
    return guild.members.unban(uid, why);
  }
  if (typeof guild?.bans?.remove === "function") {
    return guild.bans.remove(uid, why);
  }
  throw new Error("unban_unsupported");
}

async function decideUnbanAppeal(guild?, userId?, messageId?, accept?, actorMember = null) {
  const channel = await resolveSubmissionChannel(guild).catch(() => null);
  const msg = channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  const extras = appealActorExtras(actorMember);

  const syncWorkflow = async (accepted?) => {
    if (msg) {
      await setAppealMessageStatus(msg, accepted, extras.decidedBy, extras.decidedByName);
      await deleteAppealStarterThread(msg);
      return;
    }
    try {
      const { updateStaffWorkflowFromMessage } = require("../workflow/siteStaffWorkflowStore") as typeof import("../workflow/siteStaffWorkflowStore");
      await updateStaffWorkflowFromMessage(
        guild.id,
        "appelli",
        String(messageId),
        accepted ? "accepted" : "rejected",
        extras,
      );
    } catch (_) {}
  };

  if (accept) {
    let staffNote = "";
    let unbannedOk = false;
    try {
      await guildUnbanUser(guild, userId, "Richiesta unban accettata (sito)");
      unbannedOk = true;
      staffNote = "Unban completato.";
    } catch (err) {
      const notBanned =
        err?.code === 10026 || String(err?.message || "").toLowerCase().includes("not banned");
      if (notBanned) {
        unbannedOk = true;
        staffNote = "L'utente non risultava bannato.";
      } else {
        global.logger?.error?.("[appeals] unban failed:", err?.code || err?.message || err);
        return {
          ok: false,
          status: 500,
          error: "unban_failed",
          message: "Impossibile completare l'unban.",
        };
      }
    }
    if (unbannedOk) {
      const body =
        staffNote === "L'utente non risultava bannato."
          ? "Lo staff ha accettato la tua richiesta: puoi rientrare nel server con l'invito ufficiale o tramite il sito."
          : "Lo staff ha accettato la tua richiesta unban: puoi rientrare nel server con l'invito ufficiale o tramite il sito.";
      await notifyAppealSubject(guild.id, userId, {
        title: "Richiesta unban accettata",
        body,
        dedupeKey: `unban-acc:${userId}:${messageId}`,
        messageId,
      }).catch(() => null);
      const appeals = await getAppealsSettingsFresh(guild.id).catch(() => null);
      if (appeals?.dmOnApproveBan !== false) {
        const inviteUrl = resolveAppealInviteUrl(appeals, IDs?.links?.invite);
        await sendAppealDecisionDm(guild, userId, {
          title: "Richiesta unban accettata",
          body,
          inviteUrl,
        }).catch(() => null);
      }
    }
    await syncWorkflow(true);
    return { ok: true, status: 200, message: staffNote || "Unban completato." };
  }

  const rejectBody =
    "Lo staff ha rifiutato la tua richiesta unban. Puoi inviare una nuova richiesta dopo il periodo di attesa configurato sul sito.";
  await notifyAppealSubject(guild.id, userId, {
    title: "Richiesta unban rifiutata",
    body: rejectBody,
    dedupeKey: `unban-rej:${userId}:${messageId}`,
    messageId,
  }).catch(() => null);
  {
    const appeals = await getAppealsSettingsFresh(guild.id).catch(() => null);
    if (appeals?.dmOnReject !== false) {
      await sendAppealDecisionDm(guild, userId, {
        title: "Richiesta unban rifiutata",
        body: rejectBody,
      }).catch(() => null);
    }
  }
  await syncWorkflow(false);
  return { ok: true, status: 200, message: "Richiesta unban rifiutata." };
}

async function decideUnmuteAppeal(guild?, userId?, messageId?, accept?, actorMember = null) {
  const channel = await resolveSubmissionChannel(guild);
  const msg = channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  const extras = appealActorExtras(actorMember);

  const syncWorkflow = async (accepted?) => {
    if (msg) {
      await setAppealMessageStatus(msg, accepted, extras.decidedBy, extras.decidedByName);
      await deleteAppealStarterThread(msg);
      return;
    }
    try {
      const { updateStaffWorkflowFromMessage } = require("../workflow/siteStaffWorkflowStore") as typeof import("../workflow/siteStaffWorkflowStore");
      await updateStaffWorkflowFromMessage(
        guild.id,
        "appelli",
        String(messageId),
        accepted ? "accepted" : "rejected",
        extras,
      );
    } catch (_) {}
  };

  if (accept) {
    const out: any = await applyWebsiteUnmute(guild, userId, guild.client).catch(() => ({ ok: false, message: "Errore unmute." }));
    if (!out?.ok) {
      return { ok: false, status: 400, message: out?.message || "Impossibile completare l'unmute." };
    }
    const unmuteBody = "Lo staff ha accettato la tua richiesta unmute: il timeout/mute è stato rimosso.";
    await notifyAppealSubject(guild.id, userId, {
      title: "Richiesta unmute accettata",
      body: unmuteBody,
      dedupeKey: `unmute-acc:${userId}:${messageId}`,
      messageId,
    });
    {
      const appeals = await getAppealsSettingsFresh(guild.id).catch(() => null);
      if (appeals?.dmOnApproveMute !== false) {
        await sendAppealDecisionDm(guild, userId, {
          title: "Richiesta unmute accettata",
          body: unmuteBody,
        }).catch(() => null);
      }
    }
    await syncWorkflow(true);
    return { ok: true, status: 200, message: "Unmute completato." };
  }

  const unmuteRejectBody =
    "Lo staff ha rifiutato la tua richiesta unmute. Puoi inviare una nuova richiesta dopo il periodo di attesa sul sito.";
  await notifyAppealSubject(guild.id, userId, {
    title: "Richiesta unmute rifiutata",
    body: unmuteRejectBody,
    dedupeKey: `unmute-rej:${userId}:${messageId}`,
    messageId,
  });
  {
    const appeals = await getAppealsSettingsFresh(guild.id).catch(() => null);
    if (appeals?.dmOnReject !== false) {
      await sendAppealDecisionDm(guild, userId, {
        title: "Richiesta unmute rifiutata",
        body: unmuteRejectBody,
      }).catch(() => null);
    }
  }
  await syncWorkflow(false);
  return { ok: true, status: 200, message: "Richiesta unmute rifiutata." };
}

export = {
  getAppealDetail,
  parseAppealFromMessageOrEmbed,
  deriveAppealStatus,
  decideUnbanAppeal,
  decideUnmuteAppeal,
  appealSanctionStillActive,
  closeAppealAsObsolete,
  autoClosePendingAppealsForUser,
  autoCloseObsoletePendingAppeals,
};
