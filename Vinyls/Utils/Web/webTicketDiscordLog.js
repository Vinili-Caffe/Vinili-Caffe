"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Config/ids");
const { resolveTranscriptLogChannelId } = require("../Ticket/ticketGuildOptions");
const { toDiscordTimestamp } = require("../Logging/channelRolesLogUtils");
const { TICKET_UX_COLOR } = require("../Ticket/ticketUxMessages");

const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const MAX_DIFF = 1600;

/** Inbox sito (/tickets/) è la fonte di verità: niente mirror su #ticket logs / activity. */
const WEB_TICKET_DISCORD_LOGS_ENABLED = false;

function resolveSitePublicOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN || process.env.WEBSITE_PUBLIC_URL || DEFAULT_SITE_ORIGIN,
  )
    .trim()
    .replace(/\/+$/, "");
  return raw || DEFAULT_SITE_ORIGIN;
}

function webTicketUrl(ticketId) {
  const id = String(ticketId || "").trim();
  const origin = resolveSitePublicOrigin();
  if (!id) return `${origin}/tickets/`;
  return `${origin}/tickets/#${encodeURIComponent(id)}`;
}

function categoryLabel(ticket) {
  const c = String(ticket?.category || "supporto").trim().toLowerCase();
  const map = {
    supporto: "Supporto",
    partnership: "Partnership",
    high: "High Staff",
    perks: "Perks",
    segnalazione: "Segnalazione",
    tecnico: "Tecnico",
    altro: "Altro",
  };
  return map[c] || c || "Supporto";
}

function ts(dateLike) {
  const n = dateLike ? new Date(dateLike).getTime() : Date.now();
  if (!Number.isFinite(n)) return `<t:${Math.floor(Date.now() / 1000)}:F>`;
  return `<t:${Math.floor(n / 1000)}:F>`;
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function clip(text, max = MAX_DIFF) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildDeletedDiff(content) {
  return clip(
    String(content || "Nessun contenuto.")
      .split("\n")
      .map((line) => `- ${line}`)
      .join("\n"),
  );
}

function buildSimpleDiff(before, after) {
  const a = String(before || "");
  const b = String(after || "");
  if (!a && !b) return " (nessuna modifica)";
  if (a === b) return " (invariato)";
  return clip(`- ${a.replace(/\n/g, "\n- ")}\n+ ${b.replace(/\n/g, "\n+ ")}`);
}

function imageList(urls) {
  const list = Array.isArray(urls) ? urls.map((u) => String(u || "").trim()).filter(Boolean) : [];
  if (!list.length) return "[ nessuno ]";
  return `[ ${list.slice(0, 8).join(", ")}${list.length > 8 ? ", …" : ""} ]`;
}

async function resolveGuild(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return null;
  return (
    client.guilds?.cache?.get?.(gid) ||
    (await client.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null
  );
}

async function resolveWebTicketLogChannel(client, guildId, ticket) {
  const gid = String(guildId || ticket?.guildId || "").trim();
  if (!gid || !client?.channels?.fetch) return null;
  const channelId = resolveTranscriptLogChannelId(gid, ticket, {
    logChannelId: "",
    ticketLogs: IDs.channels?.ticketLogs,
  });
  if (!channelId) return null;
  const cached = client.channels.cache?.get?.(channelId) || null;
  if (cached?.isTextBased?.()) return cached;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  return ch && ch.isTextBased?.() ? ch : null;
}

async function resolveActivityLogChannel(client, guildId) {
  const channelId = String(IDs.channels?.activityLogs || "").trim();
  if (!channelId || !client) return null;
  const cached = client.channels.cache?.get?.(channelId) || null;
  if (cached?.isTextBased?.()) return cached;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  return ch && ch.isTextBased?.() ? ch : null;
}

function baseFields(ticket) {
  const num = Number(ticket?.ticketNumber) || "N/D";
  const opener = String(ticket?.userId || "").trim();
  return [
    { name: "ID Ticket", value: String(num), inline: true },
    { name: "Categoria", value: categoryLabel(ticket), inline: true },
    { name: "Origine", value: "Sito web", inline: true },
    { name: "Aperto da", value: opener ? `<@${opener}>` : "Sconosciuto", inline: true },
  ];
}

function mentionUser(userId, fallbackName) {
  const id = String(userId || "").trim();
  if (id) return `<@${id}>`;
  const name = String(fallbackName || "").trim();
  return name || "Sconosciuto";
}

function starsLabel(n) {
  const v = Math.max(1, Math.min(5, Number(n) || 0));
  return `${"★".repeat(v)}${"☆".repeat(5 - v)} (${v}/5)`;
}

function guildIconFrom(guild) {
  if (!guild || typeof guild.iconURL !== "function") return null;
  try {
    return guild.iconURL({ size: 128 }) || null;
  } catch {
    return null;
  }
}

function webTicketClosedEmbedData(ticket, meta = {}, guild = null) {
  const actorId = String(meta.actorId || ticket?.closedBy || "").trim();
  return {
    ticketNumber: ticket?.ticketNumber,
    userId: ticket?.userId,
    closedBy: actorId,
    claimedBy: ticket?.claimedBy,
    createdAt: ticket?.createdAt,
    closedAt: ticket?.closedAt || Date.now(),
    closeReason: ticket?.closeReason || meta.reason,
    ratingScore: ticket?.ratingTicketScore,
    ratingBy: ticket?.ratingBy,
    guildName: guild?.name || meta.guildName || "Ticket System",
    guildIconURL: guildIconFrom(guild) || meta.guildIconURL || null,
    embedColor: TICKET_UX_COLOR,
  };
}

function buildWebTicketClosedTranscriptRow(ticket) {
  const id = String(ticket?._id || ticket?.id || "").trim();
  if (!id) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(webTicketUrl(id))
      .setLabel("Visualizza Trascrizione")
      .setEmoji("<:VC_file:1478515880722698300>"),
  );
}

function buildWebTicketLogEmbed(action, ticket, meta = {}) {
  if (action === "closed") {
    const { buildTicketClosedEmbed } = require("../Ticket/ticketCloseRuntime");
    return buildTicketClosedEmbed(webTicketClosedEmbedData(ticket, meta, meta.guild || null));
  }

  const actorId = String(meta.actorId || "").trim();
  const actorMention = actorId ? `<@${actorId}>` : String(meta.actorName || "Sconosciuto");
  const url = webTicketUrl(ticket?._id || ticket?.id);
  const colorByAction = {
    opened: 0x57f287,
    claimed: 0x5865f2,
    unclaimed: 0xfaa61a,
    member_added: 0x3ba55d,
    member_removed: 0xe67e22,
    transferred: 0x9b59b6,
    category_changed: 0x3498db,
    renamed: 0x1abc9c,
    close_requested: 0xf1c40f,
    close_request_rejected: 0x95a5a6,
    rated: 0xf39c12,
  };
  const titleByAction = {
    opened: "Ticket web aperto",
    claimed: "Ticket web claimato",
    unclaimed: "Ticket web rilasciato",
    member_added: "Ticket web · utente aggiunto",
    member_removed: "Ticket web · utente rimosso",
    transferred: "Ticket web · claim trasferito",
    category_changed: "Ticket web · categoria cambiata",
    renamed: "Ticket web · rinominato",
    close_requested: "Ticket web · richiesta chiusura",
    close_request_rejected: "Ticket web · chiusura rifiutata",
    rated: "Ticket web · valutazione",
  };

  const fields = baseFields(ticket);
  if (action === "opened") {
    fields.push({ name: "Aperto il", value: ts(ticket?.createdAt || Date.now()), inline: true });
  }
  if (action === "claimed") {
    fields.push({ name: "Claimato da", value: actorMention, inline: true });
    fields.push({ name: "Ora", value: ts(ticket?.claimedAt || Date.now()), inline: true });
  }
  if (action === "unclaimed") {
    fields.push({ name: "Rilasciato da", value: actorMention, inline: true });
    fields.push({ name: "Ora", value: ts(Date.now()), inline: true });
  }
  if (action === "member_added" || action === "member_removed") {
    fields.push({ name: "Staff", value: actorMention, inline: true });
    fields.push({
      name: action === "member_added" ? "Utente aggiunto" : "Utente rimosso",
      value: mentionUser(meta.targetUserId, meta.targetName),
      inline: true,
    });
    fields.push({ name: "Ora", value: ts(Date.now()), inline: true });
  }
  if (action === "transferred") {
    fields.push({ name: "Trasferito da (staff)", value: actorMention, inline: true });
    fields.push({
      name: "Claim precedente",
      value: mentionUser(meta.fromUserId, meta.fromName),
      inline: true,
    });
    fields.push({
      name: "Nuovo claim",
      value: mentionUser(meta.toUserId || ticket?.claimedBy, meta.toName || ticket?.claimedByName),
      inline: true,
    });
    fields.push({ name: "Ora", value: ts(ticket?.claimedAt || Date.now()), inline: true });
  }
  if (action === "category_changed") {
    const before = categoryLabel({ category: meta.beforeCategory });
    const after = categoryLabel(ticket);
    fields.push({ name: "Modificato da", value: actorMention, inline: true });
    fields.push({ name: "Da", value: before, inline: true });
    fields.push({ name: "A", value: after, inline: true });
    if (meta.claimRemoved) {
      fields.push({
        name: "Claim",
        value: "Rimosso (ruolo non valido per la nuova categoria)",
        inline: false,
      });
    }
    fields.push({ name: "Ora", value: ts(Date.now()), inline: true });
  }
  if (action === "renamed") {
    fields.push({ name: "Rinominato da", value: actorMention, inline: true });
    fields.push({
      name: "Nome precedente",
      value: String(meta.beforeSubject || "—").slice(0, 200) || "—",
      inline: false,
    });
    fields.push({
      name: "Nome nuovo",
      value: String(meta.afterSubject || ticket?.subject || "—").slice(0, 200) || "—",
      inline: false,
    });
    fields.push({ name: "Ora", value: ts(Date.now()), inline: true });
  }
  if (action === "close_requested") {
    fields.push({ name: "Richiesto da", value: actorMention, inline: true });
    fields.push({ name: "Ora", value: ts(ticket?.closeRequestedAt || Date.now()), inline: true });
    const reason = String(meta.reason || ticket?.closeRequestReason || "").trim();
    fields.push({
      name: "Motivo",
      value: reason ? reason.slice(0, 900) : "Nessun motivo specificato",
      inline: false,
    });
  }
  if (action === "close_request_rejected") {
    fields.push({ name: "Rifiutato da", value: actorMention, inline: true });
    fields.push({ name: "Ora", value: ts(Date.now()), inline: true });
  }
  if (action === "rated") {
    fields.push({ name: "Valutato da", value: actorMention, inline: true });
    fields.push({
      name: "Staffer",
      value: mentionUser(meta.stafferId || ticket?.ratedStafferId, meta.stafferName || ticket?.ratedStafferName),
      inline: true,
    });
    fields.push({
      name: "Voto ticket",
      value: starsLabel(meta.ticketScore ?? ticket?.ratingTicketScore),
      inline: true,
    });
    fields.push({
      name: "Voto staffer",
      value: starsLabel(meta.stafferScore ?? ticket?.ratingStafferScore),
      inline: true,
    });
    fields.push({ name: "Ora", value: ts(ticket?.ratingAt || Date.now()), inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(titleByAction[action] || "Ticket web")
    .setColor(colorByAction[action] || 0x6f4e37)
    .setDescription(`[Apri sul sito](${url})`)
    .addFields(fields.slice(0, 25))
    .setFooter({
      text: `Web · #${Number(ticket?.ticketNumber) || "?"} · ${String(ticket?._id || ticket?.id || "").slice(-8)}`,
    })
    .setTimestamp();

  const subject = String(ticket?.subject || "").trim();
  if (subject) embed.setAuthor({ name: subject.slice(0, 80) });

  return embed;
}

async function sendWebTicketDiscordLog(client, action, ticket, meta = {}) {
  if (!WEB_TICKET_DISCORD_LOGS_ENABLED) return null;
  try {
    const guildId = String(ticket?.guildId || meta.guildId || "").trim();
    const channel = await resolveWebTicketLogChannel(client, guildId, ticket);
    if (!channel?.send) return null;
    const guild = action === "closed" ? await resolveGuild(client, guildId) : null;
    const embed = buildWebTicketLogEmbed(action, ticket, {
      ...meta,
      ...(guild
        ? { guild, guildName: guild.name, guildIconURL: guildIconFrom(guild) }
        : {}),
    });
    const payload = { embeds: [embed] };
    if (action === "closed") {
      const row = buildWebTicketClosedTranscriptRow(ticket);
      if (row) payload.components = [row];
    }
    const sent = await channel.send(payload).catch((err) => {
      global.logger?.warn?.("[webTicketLog] send failed:", err?.message || err);
      return null;
    });
    if (sent && action === "closed" && ticket && typeof ticket.save === "function") {
      try {
        ticket.closeLogChannelId = String(channel.id || "");
        ticket.closeLogMessageId = String(sent.id || "");
        await ticket.save().catch(() => null);
      } catch (_) {}
    }
    return sent;
  } catch (err) {
    global.logger?.warn?.("[webTicketLog]", err?.message || err);
    return null;
  }
}

async function sendWebTicketMessageActivityLog(client, kind, ticket, messageDoc, meta = {}) {
  if (!WEB_TICKET_DISCORD_LOGS_ENABLED) return null;
  try {
    const guildId = String(ticket?.guildId || meta.guildId || "").trim();
    const channel = await resolveActivityLogChannel(client, guildId);
    if (!channel?.send) return null;

    const actorId = String(meta.actorId || messageDoc?.authorId || "").trim();
    const authorId = String(messageDoc?.authorId || "").trim();
    const authorKind = String(messageDoc?.authorKind || "").trim() || "user";
    const authorName = String(messageDoc?.authorName || meta.authorName || "").trim() || "Sconosciuto";
    const authorLabel = authorId
      ? `<@${authorId}> (${authorName}) [${authorKind}]`
      : `${authorName} [${authorKind}]`;
    const actorLabel = actorId ? `<@${actorId}>` : authorLabel;
    const ticketNum = Number(ticket?.ticketNumber) || "?";
    const ticketId = String(ticket?._id || ticket?.id || "").trim();
    const msgId = String(messageDoc?._id || messageDoc?.id || meta.messageId || "").trim() || "sconosciuto";
    const url = webTicketUrl(ticketId);
    const images = Array.isArray(messageDoc?.imageUrls) ? messageDoc.imageUrls : [];

    if (kind === "deleted") {
      const content = String(messageDoc?.content || "");
      const hasContent = normalizeText(content).length > 0;
      const lines = [
        `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Impostazioni precedenti**",
        `<:VC_Modifica:1478859646587633717> **Origine:** Ticket web #${ticketNum}`,
        `<:VC_Modifica:1478859646587633717> **Ticket:** [Apri sul sito](${url})`,
        `<:VC_Modifica:1478859646587633717> **Id messaggio:** \`${msgId}\``,
        "<:VC_Modifica:1478859646587633717> **Contenuto:**",
        "```diff",
        buildDeletedDiff(hasContent ? content : "Nessun contenuto."),
        "```",
        `<:VC_Modifica:1478859646587633717> **Attachment:** ${imageList(images)}`,
        `<:VC_Modifica:1478859646587633717> **Autore:** ${authorLabel}`,
        `<:VC_Modifica:1478859646587633717> **Eliminato da:** ${actorLabel}`,
      ];
      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("<a:VC_Verified:1482532479637127188> Messaggio eliminato (sito)")
        .setDescription(lines.join("\n"));
      const preview = images.find((u) => /^https?:\/\//i.test(String(u || "")));
      if (preview) embed.setImage(String(preview));
      const payload = { embeds: [embed] };
      if (url) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Apri ticket").setURL(url),
          ),
        ];
      }
      return channel.send(payload).catch((err) => {
        global.logger?.warn?.("[webTicketLog] delete activity failed:", err?.message || err);
        return null;
      });
    }

    if (kind === "edited") {
      const beforeContent = String(meta.beforeContent ?? "");
      const afterContent = String(messageDoc?.content || meta.afterContent || "");
      const beforeImages = Array.isArray(meta.beforeImageUrls) ? meta.beforeImageUrls : images;
      const afterImages = images;
      const contentChanged = normalizeText(beforeContent) !== normalizeText(afterContent);
      const filesChanged =
        JSON.stringify(beforeImages.map(String)) !== JSON.stringify(afterImages.map(String));
      if (!contentChanged && !filesChanged) return null;

      const lines = [
        `<:VC_right_arrow:1482459908245815296> **Autore:** ${authorLabel}`,
        `<:VC_right_arrow:1482459908245815296> **Target:** Ticket web #${ticketNum} • \`${msgId}\``,
        `<:VC_right_arrow:1482459908245815296> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Modifiche**",
      ];
      if (contentChanged) {
        lines.push("<:VC_Modifica:1478859646587633717> **Contenuto:**");
        lines.push("```diff");
        lines.push(buildSimpleDiff(beforeContent, afterContent));
        lines.push("```");
      }
      if (filesChanged) {
        lines.push("<:VC_Modifica:1478859646587633717> **Attachment:**");
        lines.push(`Prima: ${imageList(beforeImages)}`);
        lines.push(`Dopo: ${imageList(afterImages)}`);
      }
      lines.push(`<:VC_Modifica:1478859646587633717> **Modificato da:** ${actorLabel}`);

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("<a:VC_Verified:1482532479637127188> Messaggio modificato (sito)")
        .setDescription(lines.join("\n"));
      const preview = afterImages.find((u) => /^https?:\/\//i.test(String(u || "")));
      if (preview) embed.setImage(String(preview));
      const payload = { embeds: [embed] };
      if (url) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Apri ticket").setURL(url),
          ),
        ];
      }
      return channel.send(payload).catch((err) => {
        global.logger?.warn?.("[webTicketLog] edit activity failed:", err?.message || err);
        return null;
      });
    }

    return null;
  } catch (err) {
    global.logger?.warn?.("[webTicketLog] activity:", err?.message || err);
    return null;
  }
}

module.exports = {
  sendWebTicketDiscordLog,
  sendWebTicketMessageActivityLog,
  buildWebTicketLogEmbed,
  webTicketUrl,
  resolveWebTicketLogChannel,
  resolveActivityLogChannel,
  resolveGuild,
};
