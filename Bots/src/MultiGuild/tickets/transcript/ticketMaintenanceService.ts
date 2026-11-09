const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { VINILI_ROOT } = require("../../../Vinili/paths") as typeof import("../../../Vinili/paths");
const Ticket = require("../data/guildFeatureBucketTicketModel");
const { getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getTicketSettingsSync } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const BOT_ROOT = VINILI_ROOT;
const TRANSCRIPTS_ROOT = path.join(BOT_ROOT, "local_transcripts");
/* I transcript HTML completi NON si cancellano più (prima sparivano dopo 90 giorni e nel database restavano
   solo i primi 2000 caratteri). Solo se serve spazio: TRANSCRIPT_MAX_AGE_DAYS=<giorni> nel .env. */
const MAX_AGE_DAYS = Number(process.env.TRANSCRIPT_MAX_AGE_DAYS || 0);
const MAX_AGE_MS = Number.isFinite(MAX_AGE_DAYS) && MAX_AGE_DAYS > 0 ? MAX_AGE_DAYS * 24 * 60 * 60 * 1000 : 0;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let promptLoopHandle = null;
let promptLoopRunning = false;
let cleanupHandle = null;

function buildCloseRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_autoclose_accept")
      .setEmoji(E.success)
      .setLabel("Accetta e chiudi")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_autoclose_reject")
      .setEmoji(E.cancel)
      .setLabel("Rifiuta e mantieni aperto")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function getLatestHumanMessageTimestamp(channel?, fallbackDate?) {
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!recent || recent.size === 0) return fallbackDate?.getTime() || 0;
  const latestHuman = recent.find((message?) => !message.author?.bot);
  return latestHuman?.createdTimestamp || fallbackDate?.getTime() || 0;
}

async function processTickets(client?) {
  const now = Date.now();
  const tickets = await Ticket.find(
    {
      open: true,
    },
    {
      _id: 1,
      guildId: 1,
      userId: 1,
      claimedBy: 1,
      channelId: 1,
      createdAt: 1,
      autoClosePromptSentAt: 1,
    },
  )
    .limit(150)
    .lean()
    .catch(() => []);

  for (const ticket of tickets) {
    try {
      const settings = getTicketSettingsSync(ticket.guildId);
      if (settings.autoCloseEnabled === false) continue;
            const openForMs = Number(settings.autoCloseSinceOpenMs);
      const inactiveForMs = Number(settings.autoCloseSinceLastMessageMs);
      if (!(openForMs > 0) || !(inactiveForMs > 0)) continue;
      const createdMs = ticket.createdAt ? new Date(ticket.createdAt).getTime() : 0;
      if (!createdMs || now - createdMs < openForMs) continue;

      const channel = client.channels?.cache?.get(ticket.channelId) || (await getClientChannelCached(client, ticket.channelId));
      if (!channel || !channel.isTextBased?.()) continue;

      const lastActiveAt = await getLatestHumanMessageTimestamp(channel, ticket.createdAt,);
      if (!lastActiveAt || now - lastActiveAt < inactiveForMs) continue;

      if (ticket.autoClosePromptSentAt) continue;

                  const promptSentAt = new Date();
      const claimed = await Ticket.findOneAndUpdate(
        { _id: ticket._id, open: true },
        { $set: { autoClosePromptSentAt: promptSentAt } },
        { new: true },
      ).catch((err?) => {
        global.logger?.warn?.(
          "[TICKET AUTO CLOSE PROMPT] Persist failed",
          ticket?.channelId,
          err?.message || err,
        );
        return null;
      });
      const claimedAt = claimed?.autoClosePromptSentAt
        ? new Date(claimed.autoClosePromptSentAt).getTime()
        : 0;
      if (!claimed || !claimedAt || Math.abs(claimedAt - promptSentAt.getTime()) > 5000) {
        global.logger?.warn?.(
          "[TICKET AUTO CLOSE PROMPT] Skip send: autoClosePromptSentAt non persistito",
          ticket?.channelId,
        );
        continue;
      }

      const mentions = new Set([ticket.userId, ticket.claimedBy].filter(Boolean),);
      const mentionText = Array.from(mentions).map((id?) => `<@${id}>`)
        .join(" ");

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`${E.VC_PinkQuestionMark} Richiesta di chiusura`)
        .setDescription(`${E.VC_Alert} Il ticket è aperto da troppo tempo e non ci sono messaggi recenti. È stato risolto?`);

      await channel
        .send({
          content: mentionText || null,
          embeds: [embed],
          components: [buildCloseRequestRow()],
        })
        .catch((err?) => {
          global.logger?.warn?.(
            "[TICKET AUTO CLOSE PROMPT] Send failed after claim",
            ticket?.channelId,
            err?.message || err,
          );
          return null;
        });
    } catch (err) {
      global.logger.error(
        "[TICKET AUTO CLOSE PROMPT] Failed on ticket",
        ticket?.channelId,
        err,
      );
    }
  }
}

/**
 * Avvisi "ticket fermo": se l'ultimo messaggio di un ticket aperto è dell'utente che l'ha aperto e nessuno
 * gli risponde da staleAlertMinutes, avvisa lo staff (nel canale scelto o nel ticket stesso, menzionando chi
 * l'ha preso in carico). Un solo avviso per messaggio dell'utente.
 */
async function processStaleAlerts(client?) {
  const now = Date.now();
  const tickets = await Ticket.find(
    { open: true },
    { _id: 1, guildId: 1, userId: 1, claimedBy: 1, channelId: 1, ticketNumber: 1, staleAlertMessageId: 1 },
  )
    .limit(200)
    .lean()
    .catch(() => []);
  for (const ticket of tickets) {
    try {
      const settings: any = getTicketSettingsSync(ticket.guildId);
      if (settings?.staleAlertEnabled !== true) continue;
      const waitMs = Math.max(15, Number(settings.staleAlertMinutes) || 120) * 60 * 1000;
      const channel = client.channels?.cache?.get(ticket.channelId) || (await getClientChannelCached(client, ticket.channelId));
      if (!channel || !channel.isTextBased?.()) continue;
      const recent = await channel.messages.fetch({ limit: 15 }).catch(() => null);
      if (!recent || recent.size === 0) continue;
      const latestHuman = recent.find((m?) => !m.author?.bot);
      if (!latestHuman) continue;
      /* ha risposto qualcuno dello staff: niente avviso */
      if (String(latestHuman.author?.id || "") !== String(ticket.userId || "")) continue;
      if (now - latestHuman.createdTimestamp < waitMs) continue;
      if (String(ticket.staleAlertMessageId || "") === String(latestHuman.id)) continue;

      const saved = await Ticket.findOneAndUpdate(
        { _id: ticket._id, open: true },
        { $set: { staleAlertMessageId: String(latestHuman.id) } },
        { new: true },
      ).catch(() => null);
      if (!saved) continue;

      const waited = Math.round((now - latestHuman.createdTimestamp) / 60000);
      const waitedText = waited >= 120 ? `${Math.round(waited / 60)} ore` : `${waited} minuti`;
      const label = ticket.ticketNumber ? `#${ticket.ticketNumber}` : "";
      const embed = new EmbedBuilder()
        .setColor("#d99a5b")
        .setTitle(`${E.VC_Alert} Ticket ${label} in attesa di risposta`.replace("  ", " "))
        .setDescription(`<#${ticket.channelId}>: <@${ticket.userId}> aspetta una risposta da **${waitedText}**.`);
      const mention = ticket.claimedBy ? `<@${ticket.claimedBy}>` : null;
      const alertChannelId = String(settings.staleAlertChannelId || "").trim();
      const target = alertChannelId
        ? client.channels?.cache?.get(alertChannelId) || (await getClientChannelCached(client, alertChannelId))
        : channel;
      if (!target || !target.isTextBased?.()) continue;
      await target
        .send({ content: mention, embeds: [embed], allowedMentions: { users: ticket.claimedBy ? [String(ticket.claimedBy)] : [] } })
        .catch((err?) => global.logger?.warn?.("[TICKET STALE ALERT] send failed", ticket?.channelId, err?.message || err));
    } catch (err) {
      global.logger?.warn?.("[TICKET STALE ALERT] ticket", ticket?.channelId, err?.message || err);
    }
  }
}

function startTicketAutoClosePromptLoop(client?) {
  if (!shouldStartExternalWorkerLoop("BOT_SCHEDULER")) return null;
  if (promptLoopHandle) return promptLoopHandle;
  const tick = async () => { if (promptLoopRunning) return; promptLoopRunning = true; try { await processTickets(client); } catch (err) { global.logger.error("[TICKET AUTO CLOSE PROMPT] Loop error", err); } try { await processStaleAlerts(client); } catch (err) { global.logger.error("[TICKET STALE ALERT] Loop error", err); } finally { promptLoopRunning = false; } };
  tick();
  promptLoopHandle = setInterval(tick, 10 * 60 * 1000);
  promptLoopHandle.unref?.();
  return promptLoopHandle;
}

function walkTranscriptFiles(dir?, out = []) {
  if (!dir || !fs.existsSync(dir)) return out;
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      walkTranscriptFiles(full, out);
    } else if (item.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function cleanupOldTranscripts() {
  if (!MAX_AGE_MS) return;
  if (!fs.existsSync(TRANSCRIPTS_ROOT)) return;
  const now = Date.now();
  const files = walkTranscriptFiles(TRANSCRIPTS_ROOT, []);
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      global.logger?.warn?.("[ticketMaintenance] ", err?.message || err);
    }
  }
}

function startTranscriptCleanupLoop() {
  if (!MAX_AGE_MS) return null;
  if (!shouldStartExternalWorkerLoop("BOT_SCHEDULER")) return null;
  if (cleanupHandle) return cleanupHandle;
  cleanupOldTranscripts();
  cleanupHandle = setInterval(cleanupOldTranscripts, CLEANUP_INTERVAL_MS);
  cleanupHandle.unref?.();
  return cleanupHandle;
}

export = { startTicketAutoClosePromptLoop, startTranscriptCleanupLoop };