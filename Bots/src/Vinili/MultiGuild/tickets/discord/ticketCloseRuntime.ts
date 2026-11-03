const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const Ticket = require("../data/guildFeatureBucketTicketModel");
const { createTranscript, createTranscriptHtml, } = require("../transcript/transcriptUtils") as typeof import("../transcript/transcriptUtils");
const { buildTicketTranscriptViewUrl, prepareTicketTranscriptSecureFields, buildTicketTranscriptActionRow } = require("../transcript/ticketTranscriptSecure") as typeof import("../transcript/ticketTranscriptSecure");
const { getNextTicketId } = require("./ticketIdUtils") as typeof import("./ticketIdUtils");
const { sendDm } = require("../../../Community/utils/noDmList") as typeof import("../../../Community/utils/noDmList");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("./ticketInteractionRuntime") as typeof import("./ticketInteractionRuntime");
const { getClientChannelCached, getUserCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { findOpenTicketsForGuildUser } = require("./ticketGuildUserQueries") as typeof import("./ticketGuildUserQueries");
const {
  closeDmFailedNote,
  TICKET_UX_COLOR,
} = require("./ticketUxMessages") as typeof import("./ticketUxMessages");

const TRANSCRIPT_TXT_DB_MAX_CHARS = 2_000;

function compactTranscriptTextForDb(raw?) {
  const s = typeof raw === "string" ? raw : "";
  if (!s) return "";
  if (s.length <= TRANSCRIPT_TXT_DB_MAX_CHARS) return s;
  return `${s.slice(0, TRANSCRIPT_TXT_DB_MAX_CHARS)}\n…[troncato]`;
}

function mergeClosedTicketDmRows(transcriptRows?, ratingRows?) {
  return [...transcriptRows, ...ratingRows].slice(0, 5);
}

function buildTicketRatingRows(ticketId?) {
  const stylesByScore = { 1: ButtonStyle.Danger, 2: ButtonStyle.Danger, 3: ButtonStyle.Primary, 4: ButtonStyle.Success, 5: ButtonStyle.Success, };
  const row = new ActionRowBuilder().addComponents(...[1, 2, 3, 4, 5].map((score?) => new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:${score}`).setStyle(stylesByScore[score] || ButtonStyle.Secondary).setLabel(String(score)).setEmoji("<:VC_EXP:1482534670896730143>"),),);
  return [row];
}

function formatRatingStars(score?) {
  const s = Math.max(0, Math.min(5, Math.floor(Number(score) || 0)));
  return "<:VC_EXP:1482534670896730143>".repeat(s) + "<:VC_EXP:1482534670896730143>".repeat(5 - s);
}

function buildTicketClosedEmbed(data?) {
  const openedAt = data?.createdAt ? `<t:${Math.floor(new Date(data.createdAt).getTime() / 1000)}:F>` : "Sconosciuto";
  const closedAt = data?.closedAt ? `<t:${Math.floor(new Date(data.closedAt).getTime() / 1000)}:F>` : `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const reasonText = data?.closeReason && String(data.closeReason).trim() ? String(data.closeReason).trim() : "Nessuna motivazione specificata";

  const fields = [
    { name: "<:VC_id:1478517313618575419> ID Ticket", value: String(data?.ticketNumber || "N/D"), inline: true },
    { name: "<:VC_open:1478517277279129712> Aperto da", value: data?.userId ? `<@${data.userId}>` : "Sconosciuto", inline: true },
    { name: "<:VC_close:1478517239136256020> Chiuso da", value: data?.closedBy ? `<@${data.closedBy}>` : "Sconosciuto", inline: true },
    { name: "<:VC_opentime:1478517163022221323> Ora Apertura", value: openedAt, inline: true },
    { name: "<:VC_claim:1478517202016669887> Claimato da", value: data?.claimedBy ? `<@${data.claimedBy}>` : "Non claimato", inline: true },
    { name: "<:VC_close:1478517239136256020> Ora Chiusura", value: closedAt, inline: true },
  ];
  fields.push({ name: "<:VC_reason:1478517122929004544> Motivazione", value: reasonText, inline: true });
  if (Number.isFinite(data?.ratingScore) && data.ratingScore >= 1) {
    const stars = formatRatingStars(data.ratingScore);
    const byPart = data?.ratingBy ? ` – da <@${data.ratingBy}>` : "";
    fields.push({ name: "<:VC_EXP:1482534670896730143> Valutazione", value: `${stars}${byPart}`, inline: true });
  }

  const embedColor = data?.embedColor || "#6f4e37";
  const embed = new EmbedBuilder()
    .setAuthor({ name: data?.guildName || "Ticket System", iconURL: data?.guildIconURL || undefined, })
    .setTitle("<:VC_Ticket:1482535175283019888> Ticket Chiuso")
    .setColor(embedColor)
    .addFields(fields.slice(0, 25))
    .setTimestamp();

  const reordered = [embed.data.fields?.[0], embed.data.fields?.[1], embed.data.fields?.[2], embed.data.fields?.[3], embed.data.fields?.[5], embed.data.fields?.[4], embed.data.fields?.[6], embed.data.fields?.[7],].filter(Boolean);
  embed.setFields(reordered);

  return embed;
}

async function sendTranscriptWithBrowserLink(target?, payload?, hasHtml?, extraRows = [], options: Record<string, any> = {}) {
  if (!target?.send) return null;
  const { guildId, bypassNoDm } = options;
  const isUserDm = Boolean(bypassNoDm && guildId && (target.user || target.id));
  const sent = isUserDm ? await sendDm(target.user || target, payload, { guildId, bypassNoDm: true }) : await target.send(payload).catch(() => null);
  if (!sent) return sent;

  const safeExtraRows = Array.isArray(extraRows) ? extraRows.filter(Boolean) : [];
  if (!hasHtml) {
    if (safeExtraRows.length > 0) {
      const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
      await sent
        .edit({
          content: baseContent || undefined,
          components: safeExtraRows.slice(0, 5),
        })
        .catch(() => { });
    }
    return sent;
  }

  const attachment = sent.attachments?.find((att?) => { const name = String(att?.name || "").toLowerCase(); const url = String(att?.url || "").toLowerCase(); return name.endsWith(".html") || url.includes(".html"); });

  if (attachment?.url) {
    const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
    const transcriptButton = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(attachment.url).setLabel("Visualizza Trascrizione").setEmoji("<:VC_file:1478515880722698300>");
    const row = new ActionRowBuilder().addComponents(transcriptButton);
    await sent
      .edit({
        content: baseContent || undefined,
        components: [row, ...safeExtraRows].slice(0, 5),
      })
      .catch(() => { });
  } else if (safeExtraRows.length > 0) {
    const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
    await sent
      .edit({
        content: baseContent || undefined,
        components: safeExtraRows.slice(0, 5),
      })
      .catch(() => { });
  }

  return sent;
}

async function closeTicket(targetInteraction?, motivo?, helpers?) {
  const { safeReply, safeEditReply, LOG_CHANNEL, closedById = null, } = helpers;
  const makeErrorEmbed =
    typeof helpers.makeErrorEmbed === "function"
      ? helpers.makeErrorEmbed
      : require("./ticketUxMessages").makeTicketErrorEmbed;
  const closedByUserId = String(closedById || "").trim() || targetInteraction.user?.id || null;
  const closeLockKey = `${targetInteraction?.guildId || "noguild"}:${targetInteraction?.channelId || targetInteraction?.channel?.id || "nochannel"}`;
  const LOCK_TTL_MS = 90_000;
  if (!targetInteraction?.client?.ticketCloseLocks || !(targetInteraction.client.ticketCloseLocks instanceof Map)) {
    targetInteraction.client.ticketCloseLocks = new Map();
  }

  const locks = targetInteraction.client.ticketCloseLocks;
  const now = Date.now();
  const existingLockAt = Number(locks.get(closeLockKey) || 0);
  if (existingLockAt && now - existingLockAt < LOCK_TTL_MS) {
    await safeReply(targetInteraction, {
      embeds: [
        makeErrorEmbed(
          "Attendi",
          "<:VC_Attention:1482534443632558151> Chiusura ticket già in corso, attendi un attimo.",
        ),
      ],
    }).catch(() => { });
    return;
  }

  locks.set(closeLockKey, now);
  try {
    if (!targetInteraction || !targetInteraction.channel) {
      await safeReply(targetInteraction, {
        embeds: [
          makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Interazione non valida"),
        ],
      });
      return;
    }

    const channelId = String(targetInteraction.channel.id);
    const existingOpen = await Ticket.findOne({ channelId, open: true }).catch(() => null);
    const closeGuildId =
      existingOpen?.guildId ||
      targetInteraction.guildId ||
      targetInteraction.guild?.id ||
      targetInteraction.channel?.guildId ||
      targetInteraction.channel?.guild?.id;
    let ticketNumber =
      Number.isFinite(Number(existingOpen?.ticketNumber)) && Number(existingOpen.ticketNumber) > 0
        ? Number(existingOpen.ticketNumber)
        : await getNextTicketId(closeGuildId);
    const closedAt = new Date();

        let ticket = await Ticket.findOneAndUpdate(
      { channelId, open: true },
      {
        $set: {
          open: false,
          closedAt,
          closedBy: closedByUserId,
          ticketNumber,
          closeReason: motivo || null,
          claimedBy: existingOpen?.claimedBy || null,
          closeRequestedBy: null,
          closeRequestedAt: null,
        },
      },
      { new: true },
    );

    if (!ticket) {
            const stuck = await Ticket.findOne({ channelId }).catch(() => null);
      if (stuck && targetInteraction.channel) {
        await safeEditReply(targetInteraction, {
          embeds: [
            new EmbedBuilder()
              .setDescription("<:VC_close:1478517239136256020> Il ticket verrà chiuso...")
              .setColor("#6f4e37"),
          ],
        }).catch(() => { });
        const deleteChannelTimer = setTimeout(() => {
          targetInteraction.channel?.delete?.().catch(() => { });
        }, 2000);
        deleteChannelTimer.unref?.();
        return;
      }
      await safeReply(targetInteraction, {
        embeds: [
          makeErrorEmbed(
            "Info",
            "<:VC_Attention:1482534443632558151> Ticket già chiuso o chiusura già in corso.",
          ),
        ],
      }).catch(() => { });
      return;
    }

    let ticketSettings: Record<string, any> = {};
    try {
      const { getTicketSettingsSync } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
      ticketSettings = getTicketSettingsSync(targetInteraction.guild?.id) || {};
    } catch (_) {
      ticketSettings = {};
    }
    const storeTranscripts = ticketSettings.storeTranscripts !== false;
    const ratingEnabled = ticketSettings.ratingEnabled !== false;
    const embedColor = "#6f4e37";

    let transcriptTXT = "";
    let transcriptHtmlPath = null;
    let transcriptViewToken = null;
    const transcriptHtmlInline = null;
    let transcriptViewExpiresAt = null;
    if (storeTranscripts) {
      transcriptTXT = compactTranscriptTextForDb(
        await createTranscript(targetInteraction.channel).catch(() => ""),
      );
      const transcriptHTML = await createTranscriptHtml(targetInteraction.channel).catch(() => "");
      const secureT: any = await prepareTicketTranscriptSecureFields(targetInteraction.channel, transcriptHTML).catch(() => ({}));
      transcriptHtmlPath = secureT.transcriptHtmlPath || null;
      transcriptViewToken = secureT.transcriptViewToken || null;
      transcriptViewExpiresAt = secureT.transcriptViewExpiresAt || null;
    }
        const transcriptForDb = compactTranscriptTextForDb(transcriptTXT);
    let userTag = null;
    try {
      const opener =
        (await getGuildMemberCached(targetInteraction.guild, ticket.userId).catch(() => null)) ||
        (await getUserCached(targetInteraction.client, ticket.userId).catch(() => null));
      const u = opener?.user || opener;
      userTag = String(u?.globalName || u?.username || opener?.displayName || "").trim() || null;
    } catch (_) {
      userTag = null;
    }

    ticket =
      (await Ticket.findOneAndUpdate(
        { _id: ticket._id },
        {
          $set: {
            transcript: transcriptForDb,
            transcriptHtmlPath: transcriptHtmlPath || null,
            transcriptViewToken: transcriptViewToken || null,
            transcriptHtmlInline: null,
            transcriptViewExpiresAt: transcriptViewExpiresAt || null,
            hasTranscript: Boolean(
              transcriptHtmlPath || transcriptViewToken || String(transcriptForDb || "").trim(),
            ),
            ...(userTag ? { userTag } : {}),
          },
        },
        { new: true },
      ).catch(() => null)) || ticket;

    try {
      const { invalidateSlimClosedTicketsCache } = require("../dashboard/siteDashboardTicketsApi") as typeof import("../dashboard/siteDashboardTicketsApi");
      invalidateSlimClosedTicketsCache(targetInteraction.guild?.id);
    } catch (_) {}

    ticketNumber = Number(ticket.ticketNumber) > 0 ? Number(ticket.ticketNumber) : ticketNumber;

    const mainGuildId = IDs?.guilds?.main || null;
    const { resolveTranscriptLogChannelId } = require("./ticketGuildOptions") as typeof import("./ticketGuildOptions");
    const centralTicketLogChannelId =
      resolveTranscriptLogChannelId(targetInteraction.guild?.id, ticket, {
        logChannelId: ticketSettings.logChannelId,
        ticketLogs: IDs?.channels?.ticketLogs,
      }) ||
      LOG_CHANNEL ||
      "1442569290682208296";
    let logChannel = targetInteraction.guild
      ? await getGuildChannelCached(targetInteraction.guild, centralTicketLogChannelId)
      : null;
    if (!logChannel?.isTextBased?.() && mainGuildId) {
      const mainGuild = await getClientGuildCached(targetInteraction.client, mainGuildId);
      logChannel = mainGuild ? await getGuildChannelCached(mainGuild, centralTicketLogChannelId) : null;
    }
    if (!logChannel?.isTextBased?.()) logChannel = null;

    const ticketObj = ticket.toObject?.() || ticket;
    const closeEmbedData = {
      ...ticketObj,
      ticketNumber,
      closeReason: motivo || null,
      closedBy: closedByUserId,
      closedAt: ticket.closedAt || closedAt,
      guildName: targetInteraction.guild?.name || "Ticket System",
      guildIconURL: targetInteraction.guild?.iconURL?.({ size: 128 }) || null,
      embedColor,
    };
    const closeEmbed = buildTicketClosedEmbed(closeEmbedData);
    const ratingRows = ratingEnabled ? buildTicketRatingRows(String(ticket._id)) : [];
    const transcriptViewUrl = buildTicketTranscriptViewUrl(transcriptViewToken);
    const transcriptRow = buildTicketTranscriptActionRow(ticket._id, transcriptViewUrl);
    const transcriptRows = transcriptHtmlPath || transcriptHtmlInline ? (transcriptRow ? [transcriptRow] : []) : [];

    let logSentMessage = null;
    if (logChannel?.isTextBased?.()) {
      logSentMessage = await sendTranscriptWithBrowserLink(
        logChannel,
        { embeds: [closeEmbed] },
        false,
        transcriptRows,
      );
    }

    const dmActionRows = mergeClosedTicketDmRows(transcriptRows, ratingRows);
    const member = await getGuildMemberCached(targetInteraction.guild, ticket.userId);
    let dmOk = false;
    if (member) {
      try {
        const dmSent = await sendTranscriptWithBrowserLink(
          member,
          { embeds: [closeEmbed] },
          false,
          dmActionRows,
          { guildId: targetInteraction.guild.id, bypassNoDm: true },
        );
        dmOk = Boolean(dmSent);
      } catch (err) {
        dmOk = false;
        if (![50007, 50278].includes(err?.code)) {
          global.logger.error(err);
        }
      }
    }

    if (logSentMessage?.id && logChannel?.id) {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $set: {
            closeLogChannelId: logChannel.id,
            closeLogMessageId: logSentMessage.id,
          },
        },
      ).catch((err?) => {
        global.logger?.warn?.("[TICKET CLOSE] closeLog ids update failed:", err?.message || err);
      });
    }

    await safeEditReply(targetInteraction, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "<:VC_close:1478517239136256020> Il ticket verrà chiuso..." +
              (dmOk ? "" : closeDmFailedNote()),
          )
          .setColor(embedColor || TICKET_UX_COLOR),
      ],
    });

    const parentCategoryId = targetInteraction.channel?.parentId || null;
    const guildForCleanup = targetInteraction.guild;
    const deleteChannelTimer = setTimeout(() => {
      const ch = targetInteraction.channel;
      if (!ch) return;
      Promise.resolve(ch.delete())
        .catch(() => null)
        .then(() => {
          if (!parentCategoryId || !guildForCleanup) return null;
          const { maybeDeleteEmptyCustomTicketCategory } = require("./ticketOpenRuntime") as typeof import("./ticketOpenRuntime");
          return maybeDeleteEmptyCustomTicketCategory(guildForCleanup, parentCategoryId);
        })
        .catch(() => null);
    }, 2000);
    deleteChannelTimer.unref?.();
  } catch (err) {
    global.logger.error(err);
    await safeReply(targetInteraction, {
      embeds: [
        makeErrorEmbed(
          "Errore",
          "<:vegax:1443934876440068179> Errore durante la chiusura del ticket",
        ),
      ],
    }).catch(() => { });
  } finally {
    targetInteraction.client.ticketCloseLocks.delete(closeLockKey);
  }
}

async function resolveTicketChannel(client?, ticketGuild?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!cid) return null;
  if (ticketGuild) {
    const guildChannel = ticketGuild.channels?.cache?.get(cid) ||
      (await ticketGuild.channels?.fetch?.(cid).catch(() => null));
    if (guildChannel) return guildChannel;
  }
  return client?.channels?.cache?.get(cid) ||
    (await getClientChannelCached(client, cid).catch(() => null)) ||
    (await client?.channels?.fetch?.(cid).catch(() => null)) ||
    null;
}

async function closeOpenTicketsForGuildUser(guild?, userId?, options: Record<string, any> = {}) {
  if (!guild || !userId) return { closed: 0 };
  const client = guild.client || options.client;
  const openTickets = await findOpenTicketsForGuildUser(guild.id, userId).catch(() => []);
  if (!openTickets.length) return { closed: 0 };

  let ticketSettings: Record<string, any> = {};
  try {
    const { getTicketSettingsSync } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
    ticketSettings = getTicketSettingsSync(guild.id) || {};
  } catch (_) {
    ticketSettings = {};
  }
  const storeTranscripts = ticketSettings.storeTranscripts !== false;
  const embedColor = "#6f4e37";

  const closeReason = options.closeReason || "Ticket chiuso automaticamente.";
  const closedBy = options.closedBy || client?.user?.id || null;
  const deleteReason = options.deleteReason || `Ticket auto-chiuso (${userId})`;
  const deleteDelayMs = Number.isFinite(options.deleteDelayMs) ? options.deleteDelayMs : 1500;
  const { resolveTranscriptLogChannelId } = require("./ticketGuildOptions") as typeof import("./ticketGuildOptions");
  let closed = 0;
  for (const ticket of openTickets.slice(0, 30)) {
    try {
      const centralTicketLogChannelId =
        options.logChannelId ||
        resolveTranscriptLogChannelId(guild.id, ticket, {
          logChannelId: ticketSettings.logChannelId,
          ticketLogs: IDs.channels.ticketLogs,
        }) ||
        "1442569290682208296";
      let logChannel =
        options.logChannel ||
        (await getGuildChannelCached(guild, centralTicketLogChannelId).catch(() => null)) ||
        client?.channels?.cache?.get(centralTicketLogChannelId) ||
        (await getClientChannelCached(client, centralTicketLogChannelId).catch(() => null)) ||
        (await client?.channels?.fetch?.(centralTicketLogChannelId).catch(() => null));
      if (!logChannel?.isTextBased?.()) logChannel = null;

      const ticketGid = String(ticket.guildId || "").trim();
      const ticketGuild =
        !ticketGid || ticketGid === String(guild.id)
          ? guild
          : await client?.guilds?.fetch?.(ticketGid).catch(() => null);
      const channel = await resolveTicketChannel(client, ticketGuild, ticket.channelId);

      let transcriptTXT = "";
      let transcriptHtmlPath = null;
      let transcriptViewToken = null;
      let transcriptHtmlInline = null;
      let transcriptViewExpiresAt = null;
      if (channel && storeTranscripts) {
        transcriptTXT = compactTranscriptTextForDb(await createTranscript(channel).catch(() => ""));
        const transcriptHTML = await createTranscriptHtml(channel).catch(() => "");
        const secureT: any = await prepareTicketTranscriptSecureFields(channel, transcriptHTML).catch(() => ({}));
        transcriptHtmlPath = secureT.transcriptHtmlPath || null;
        transcriptViewToken = secureT.transcriptViewToken || null;
        transcriptHtmlInline = null;
        transcriptViewExpiresAt = secureT.transcriptViewExpiresAt || null;
      }

      let ticketNumber = Number(ticket.ticketNumber || 0);
      if (!ticketNumber) {
        ticketNumber = await getNextTicketId(ticket.guildId || guild?.id || ticketGuild?.id);
      }
      const closedAt = new Date();
            const transcriptForDb = compactTranscriptTextForDb(transcriptTXT);
      let userTag = String(ticket.userTag || "").trim() || null;
      if (!userTag) {
        const user = await getUserCached(client, ticket.userId).catch(() => null);
        userTag = String(user?.globalName || user?.username || "").trim() || null;
      }
      const updateResult = await Ticket.updateOne(
        { _id: ticket._id, open: true },
        {
          $set: {
            open: false,
            ticketNumber,
            transcript: transcriptForDb,
            transcriptHtmlPath: transcriptHtmlPath || null,
            transcriptViewToken: transcriptViewToken || null,
            transcriptHtmlInline: null,
            transcriptViewExpiresAt: transcriptViewExpiresAt || null,
            hasTranscript: Boolean(
              transcriptHtmlPath || transcriptViewToken || String(transcriptForDb || "").trim(),
            ),
            ...(userTag ? { userTag } : {}),
            closeReason,
            closedAt,
            closedBy,
            guildId: String(ticketGuild?.id || guild.id),
            claimedBy: ticket.claimedBy || null,
            closeRequestedBy: null,
            closeRequestedAt: null,
          },
        },
      ).catch(() => ({ modifiedCount: 0 }));
      if (Number(updateResult?.modifiedCount || updateResult?.matchedCount || 0) < 1) continue;

      const ticketAfterRaw = await Ticket.findById(ticket._id).catch(() => null);
      const ticketAfter = ticketAfterRaw?.toObject?.() || ticketAfterRaw || null;
      const closeEmbedData = {
        ...(ticketAfter || ticket.toObject?.() || ticket),
        ticketNumber,
        closeReason,
        closedBy,
        closedAt,
        guildName: ticketGuild?.name || guild?.name || "Ticket System",
        guildIconURL: ticketGuild?.iconURL?.({ size: 128 }) || guild?.iconURL?.({ size: 128 }) || null,
        embedColor,
      };
      const closeEmbed = buildTicketClosedEmbed(closeEmbedData);
      const transcriptViewUrl = buildTicketTranscriptViewUrl(transcriptViewToken);
      const transcriptRow = buildTicketTranscriptActionRow(ticket._id, transcriptViewUrl);
      const transcriptRows = transcriptHtmlPath || transcriptHtmlInline ? (transcriptRow ? [transcriptRow] : []) : [];
      const dmRowsForAutoClose = mergeClosedTicketDmRows(transcriptRows, []);

      if (logChannel?.isTextBased?.()) {
        const logSentMessage = await sendTranscriptWithBrowserLink(
          logChannel,
          { embeds: [closeEmbed] },
          false,
          transcriptRows,
        ).catch(() => null);
        if (logSentMessage?.id && logChannel?.id) {
          await Ticket.updateOne(
            { _id: ticket._id },
            { $set: { closeLogChannelId: logChannel.id, closeLogMessageId: logSentMessage.id } },
          ).catch(() => { });
        }
      }

      if (options.dmUser !== false) {
        const user = await getUserCached(client, ticket.userId).catch(() => null);
        if (user) {
          await sendTranscriptWithBrowserLink(
            user,
            { embeds: [closeEmbed] },
            false,
            dmRowsForAutoClose,
            { guildId: guild.id, bypassNoDm: true },
          ).catch((err?) => {
            if (![50007, 50278].includes(err?.code)) {
              global.logger?.warn?.("[TICKET AUTO CLOSE] dm failed:", err?.message || err);
            }
          });
        }
      }

      if (channel?.deletable) {
        const parentCategoryId = channel.parentId || null;
        const guildForCleanup = ticketGuild || guild;
        const channelDeleteTimer = setTimeout(() => {
          Promise.resolve(channel.delete(deleteReason))
            .catch(() => null)
            .then(() => {
              if (!parentCategoryId || !guildForCleanup) return null;
              const { maybeDeleteEmptyCustomTicketCategory } = require("./ticketOpenRuntime") as typeof import("./ticketOpenRuntime");
              return maybeDeleteEmptyCustomTicketCategory(guildForCleanup, parentCategoryId);
            })
            .catch(() => null);
        }, deleteDelayMs);
        channelDeleteTimer.unref?.();
      }
      closed += 1;
    } catch (err) {
      global.logger?.warn?.("[TICKET AUTO CLOSE] failed:", err?.message || err);
    }
  }
  try {
    const { invalidateSlimClosedTicketsCache } = require("../dashboard/siteDashboardTicketsApi") as typeof import("../dashboard/siteDashboardTicketsApi");
    invalidateSlimClosedTicketsCache(guild.id);
  } catch (_) {}
  return { closed };
}

export = { closeOpenTicketsForGuildUser, closeTicket };
