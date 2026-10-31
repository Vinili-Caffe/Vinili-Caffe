const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { VINILI_ROOT } = require("../../../core/paths") as typeof import("../../../core/paths");
const Ticket = require("../../../Schemas/Ticket/ticketSchema");
const { getClientChannelCached } = require("../../../Utils/Interaction/interactionEntityCache") as typeof import("../../../Utils/Interaction/interactionEntityCache");
const { getTicketSettingsSync } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
const { TRANSCRIPT_VIEW_TTL_MS } = require("./ticketTranscriptSecure") as typeof import("./ticketTranscriptSecure");
const BOT_ROOT = VINILI_ROOT;
const TRANSCRIPTS_ROOT = path.join(BOT_ROOT, "local_transcripts");
const MAX_AGE_MS = Number(TRANSCRIPT_VIEW_TTL_MS) > 0 ? Number(TRANSCRIPT_VIEW_TTL_MS) : 90 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let promptLoopHandle = null;
let promptLoopRunning = false;
let cleanupHandle = null;

function buildCloseRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_autoclose_accept")
      .setEmoji("<:success:1461731530333229226>")
      .setLabel("Accetta e chiudi")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_autoclose_reject")
      .setEmoji("<:cancel:1461730653677551691>")
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
        .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta di chiusura")
        .setDescription("<a:VC_Alert:1482706673176150077> Il ticket è aperto da troppo tempo e non ci sono messaggi recenti. È stato risolto?");

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

function startTicketAutoClosePromptLoop(client?) {
  if (promptLoopHandle) return promptLoopHandle;
  const tick = async () => { if (promptLoopRunning) return; promptLoopRunning = true; try { await processTickets(client); } catch (err) { global.logger.error("[TICKET AUTO CLOSE PROMPT] Loop error", err); } finally { promptLoopRunning = false; } };
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
  if (cleanupHandle) return cleanupHandle;
  cleanupOldTranscripts();
  cleanupHandle = setInterval(cleanupOldTranscripts, CLEANUP_INTERVAL_MS);
  cleanupHandle.unref?.();
  return cleanupHandle;
}

export = { startTicketAutoClosePromptLoop, startTranscriptCleanupLoop };