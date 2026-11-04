const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  assertWebsiteStaffAccess,
  normalizeHeaderSecret,
} = require("../../site/staff/siteStaffAccessApi") as typeof import("../../site/staff/siteStaffAccessApi");
const { memberIsHighStaffForPointReview } = require("../../Partner/runtime/partnerPointContextUtils") as typeof import("../../Partner/runtime/partnerPointContextUtils");
const { reviewPartnerPointReport } = require("../../Partner/runtime/partnerPointReportReviewRuntime") as typeof import("../../Partner/runtime/partnerPointReportReviewRuntime");
const {
  listPmPointsRemovedEntries,
  findPmPointsRemovedEntry,
} = require("../../Partner/runtime/pmPointsRemovedStore") as typeof import("../../Partner/runtime/pmPointsRemovedStore");
const { resolveWebUserIdentitiesBatch, identityFallback } = require("../../site/http/siteWebUserIdentity") as typeof import("../../site/http/siteWebUserIdentity");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

async function enrichEntries(client?, guild?, entries?) {
  const ids = new Set();
  for (const entry of entries) {
    if (entry.pmUserId) ids.add(entry.pmUserId);
    if (entry.reporterUserId) ids.add(entry.reporterUserId);
    if (entry.actorUserId) ids.add(entry.actorUserId);
  }
  const profiles = await resolveWebUserIdentitiesBatch(client, guild, [...ids], {
    cap: 60,
    budgetMs: 4000,
  });
  const profileOrFallback = (userId?) => {
    const uid = String(userId || "").trim();
    if (!uid) return null;
    return profiles.get(uid) || identityFallback(uid);
  };
  return entries.map((entry?) => ({
    ...entry,
    pm: profileOrFallback(entry.pmUserId),
    reporter: entry.reporterUserId ? profileOrFallback(entry.reporterUserId) : null,
    actor: entry.actorUserId ? profileOrFallback(entry.actorUserId) : null,
  }));
}

async function handleSiteStaffPmPointsRemovedGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const before = String(req.query?.before || "").trim();
    const pmUserId = String(req.query?.pmUserId || req.query?.pm || "").trim();
    const q = String(req.query?.q || req.query?.search || "").trim().toLowerCase();
    const pendingOnly = ["1", "true", "yes"].includes(String(req.query?.pending || "").toLowerCase());
    let limit = Number(req.query?.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

    const viewerId = String(access.member?.id || access.user?.id || "").trim();
    const canReview = memberIsHighStaffForPointReview(access.member);
    /* partnerPtChrono1: self vede la propria cronologia; HS vede (e review) chiunque */
    const isSelfScoped = Boolean(pmUserId && viewerId && pmUserId === viewerId);
    if (!isSelfScoped && !canReview) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Puoi vedere solo i tuoi punti tolti, oppure essere High Staff.",
      });
    }

    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const scopedPmUserId = isSelfScoped ? viewerId : pmUserId || null;
    const listed = await listPmPointsRemovedEntries({
      guildId,
      limit,
      before: before || null,
      pendingOnly: canReview ? pendingOnly : false,
      pmUserId: scopedPmUserId,
      q: canReview ? q || null : null,
    });
    const enriched = await enrichEntries(client, guild, listed.items);

    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json({
      ok: true,
      channelId: "",
      guildId,
      canReview,
      items: enriched,
      pagination: {
        limit,
        before: before || null,
        nextBefore: listed.nextBefore,
        hasMore: listed.hasMore,
      },
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-points-removed GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffPmPointsRemovedPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const canReview = memberIsHighStaffForPointReview(access.member);

    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    if (action === "report") {
      if (!canReview) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Solo High Staff o gestore PM può inviare segnalazioni.",
        });
      }
      const pmUserId = String(body.pmUserId || body.userId || "").trim();
      const rule = String(body.rule || body.reason || body.motivo || "").trim().slice(0, 500);
      const rawMessageLink = String(body.messageLink || body.messageUrl || "").trim();
      if (!/^\d{16,20}$/.test(pmUserId)) {
        return res.status(400).json({ ok: false, error: "invalid_user", message: "Partner Manager non valido." });
      }
      if (rule.length < 3) {
        return res.status(400).json({ ok: false, error: "invalid_rule", message: "Indica la regola violata (min. 3 caratteri)." });
      }
      const {
        parseDiscordMessageLink,
        buildPartnershipMessageLink,
        buildPartnerPointLogContent,
        getPartnerPointHighStaffPingRoleIds,
        isPartnershipDescriptionMessage,
        resolvePartnerManagerUserIdFromMessage,
      } = require("../../Partner/runtime/partnerPointContextUtils") as typeof import("../../Partner/runtime/partnerPointContextUtils");
      const parsedLink = parseDiscordMessageLink(rawMessageLink);
      if (!parsedLink || parsedLink.guildId !== guildId) {
        return res.status(400).json({
          ok: false,
          error: "invalid_message_link",
          message: "Incolla un link messaggio Discord valido del server principale.",
        });
      }
      const channel =
        guild.channels.cache.get(parsedLink.channelId) ||
        (await guild.channels.fetch(parsedLink.channelId).catch(() => null));
      const targetMessage = channel?.messages
        ? await channel.messages.fetch(parsedLink.messageId).catch(() => null)
        : null;
      if (!targetMessage?.id) {
        return res.status(400).json({
          ok: false,
          error: "message_not_found",
          message: "Messaggio non trovato.",
        });
      }
      if (!isPartnershipDescriptionMessage(targetMessage)) {
        return res.status(400).json({
          ok: false,
          error: "not_partnership_description",
          message:
            "Usa il link del messaggio di descrizione partner (canale partnership), non il ringraziamento.",
        });
      }
      const linkedPm =
        (await resolvePartnerManagerUserIdFromMessage(guildId, targetMessage.id)) || "";
      if (!linkedPm) {
        return res.status(400).json({
          ok: false,
          error: "pm_not_found",
          message: "Non trovo il Partner Manager collegato a questa partner.",
        });
      }
      if (linkedPm !== pmUserId) {
        return res.status(400).json({
          ok: false,
          error: "pm_mismatch",
          message: "Quel messaggio non risulta collegato a questo Partner Manager.",
        });
      }
      const { memberHasPartnerManagerRole } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
      const pmMember = await guild.members.fetch(pmUserId).catch(() => null);
      if (!memberHasPartnerManagerRole(pmMember, guildId)) {
        return res.status(400).json({
          ok: false,
          error: "not_pm",
          message: "L'utente non è più Partner Manager.",
        });
      }

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
      const {
        logPmPointsRemoved,
        entryMessageId,
      } = require("../../Partner/runtime/pmPointsRemovedStore") as typeof import("../../Partner/runtime/pmPointsRemovedStore");
      const { getPartnershipLogChannelIds } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
      const { isDiscordStaffChannelPostsEnabled } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");

      const messageLink = buildPartnershipMessageLink(
        guildId,
        parsedLink.channelId,
        parsedLink.messageId,
      );
      const reporterUserId = String(access.member?.id || "");
      const content = buildPartnerPointLogContent({
        pmUserId,
        rule,
        messageLink,
        reporterUserId,
        pingHighStaff: true,
        statusLine: `${E.VC_Attention} In attesa di conferma High Staff.`,
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`partner_pt_ok:${pmUserId}:${reporterUserId}`)
          .setLabel("Conferma rimozione")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`partner_pt_no:${pmUserId}:${reporterUserId}`)
          .setLabel("Nega segnalazione")
          .setStyle(ButtonStyle.Secondary),
      );

      let mirrorChannel = null;
      if (isDiscordStaffChannelPostsEnabled()) {
        const channelIds = getPartnershipLogChannelIds(guild.id);
        const hardFallback = String(IDs.channels?.puntiTolti || "").trim();
        for (const cid of [channelIds.primary, channelIds.fallback, hardFallback]) {
          if (!cid) continue;
          mirrorChannel = guild.channels.cache.get(cid) || null;
          if (mirrorChannel?.isTextBased?.()) break;
          mirrorChannel = null;
        }
      }

      const entry = await logPmPointsRemoved({
        guild,
        pmUserId,
        rule,
        messageLink,
        reporterUserId,
        status: "pending",
        source: "report",
        mirrorChannel,
        mirrorContent: content,
        mirrorComponents: [row],
        mirrorAllowedMentions: { roles: getPartnerPointHighStaffPingRoleIds() },
      });
      if (!entry) {
        return res.status(500).json({
          ok: false,
          error: "log_failed",
          message: "Impossibile registrare la segnalazione.",
        });
      }

      if (entryMessageId(entry)) {
        try {
          const { notifyPuntiToltiPending, memberDisplayName } = require("../../site/staff/siteStaffEventNotifications") as typeof import("../../site/staff/siteStaffEventNotifications");
          const reporterMember = access.member;
          void notifyPuntiToltiPending({
            guild,
            pmUserId,
            pmName: memberDisplayName(pmMember, null, pmUserId),
            reporterName: memberDisplayName(reporterMember, null, reporterUserId),
            rule,
            messageId: entryMessageId(entry),
          }).catch(() => 0);
        } catch (_) {}
      }

      try {
        const { clearStaffProfileCacheForUser } = require("../../site/staff/siteStaffProfileApi") as typeof import("../../site/staff/siteStaffProfileApi");
        clearStaffProfileCacheForUser(pmUserId);
      } catch (_) {}

      return res.status(200).json({
        ok: true,
        message: "Segnalazione inviata. In attesa di conferma High Staff.",
        messageId: entryMessageId(entry),
        status: "pending",
      });
    }

    if (!canReview) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo l'High Staff può gestire le segnalazioni.",
      });
    }

    const messageId = String(body.messageId || "").trim();
    if (!messageId) {
      return res.status(400).json({ ok: false, error: "invalid_message", message: "messageId non valido." });
    }
    if (action !== "confirm" && action !== "deny") {
      return res.status(400).json({ ok: false, error: "invalid_action", message: "Azione non valida." });
    }

    const entry = await findPmPointsRemovedEntry(guildId, messageId);
    if (!entry || String(entry.status || "") !== "pending") {
      return res.status(409).json({
        ok: false,
        error: "not_pending",
        message: "Questa segnalazione non è più in attesa.",
      });
    }

    const result = await reviewPartnerPointReport({
      guild,
      entryId: messageId,
      isConfirm: action === "confirm",
      reviewerUserId: String(access.member.id),
      pmUserId: entry.pmUserId,
      reporterUserId: entry.reporterUserId,
    });
    if (!result.ok) {
      const status = result.error === "not_pm" || result.error === "points_failed" ? 400 : 500;
      return res.status(status).json({ ok: false, error: result.error, message: result.message });
    }

    return res.status(200).json({
      ok: true,
      action: result.action,
      message: result.message,
      pmUserId: result.pmUserId,
      total: result.total ?? null,
      spendable: result.spendable ?? null,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-points-removed POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffPmPointsRemovedGet,
  handleSiteStaffPmPointsRemovedPost,
};
