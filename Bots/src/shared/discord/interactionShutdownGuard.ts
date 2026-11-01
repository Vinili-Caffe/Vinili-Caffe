"use strict";

const { registerShutdownFlush } = require("../recovery/shutdownCheckpoint") as typeof import("../recovery/shutdownCheckpoint");

const EPHEMERAL_FLAG = 1 << 6;
const SHUTDOWN_MESSAGE =
  "<:vegax:1443934876440068179> Il bot si sta riavviando. Riprova il comando tra qualche secondo.";
const DRAIN_MS = Math.max(0, Number(process.env.INTERACTION_SHUTDOWN_DRAIN_MS || 800));

const inflight = new Map();
let shuttingDown = false;
let registered = false;

function interactionKey(interaction?) {
  return String(interaction?.id || "").trim();
}

function isPending(entry?) {
  if (!entry || entry.replied) return false;
  return Boolean(entry.deferred || entry.started);
}

function trackInteractionStart(interaction?, meta: Record<string, any> = {}) {
  if (shuttingDown) return { ok: false, reason: "shutting_down" };
  const key = interactionKey(interaction);
  if (!key) return { ok: true };
  inflight.set(key, {
    interaction,
    deferred: Boolean(interaction.deferred),
    replied: Boolean(interaction.replied),
    started: true,
    commandName: String(meta.commandName || interaction.commandName || "unknown"),
  });
  return { ok: true };
}

function markInteractionDeferred(interaction?) {
  const entry = inflight.get(interactionKey(interaction));
  if (entry) entry.deferred = true;
}

function markInteractionReplied(interaction?) {
  const entry = inflight.get(interactionKey(interaction));
  if (entry) entry.replied = true;
}

function releaseInteraction(interaction?) {
  inflight.delete(interactionKey(interaction));
}

function isShuttingDown() {
  return shuttingDown;
}

async function abortPendingInteraction(entry?) {
  const interaction = entry?.interaction;
  if (!interaction || entry.replied) return;

  try {
    if (interaction.deferred || entry.deferred) {
      await interaction
        .editReply({ content: SHUTDOWN_MESSAGE, embeds: [], components: [], files: [] })
        .catch(() => null);
    } else if (!interaction.replied) {
      await interaction
        .reply({ content: SHUTDOWN_MESSAGE, flags: EPHEMERAL_FLAG })
        .catch(() => null);
    }
  } catch (_) {
      }

  entry.replied = true;
}

async function flushInflightInteractions(reason = "shutdown") {
  shuttingDown = true;

  const pending = [...inflight.values()].filter(isPending);
  if (!pending.length) return;

  global.logger?.warn?.(
    `[interactionShutdown] Chiusura di ${pending.length} interazione/i in sospeso (${reason}).`,
  );

  await Promise.all(pending.map((entry?) => abortPendingInteraction(entry)));

  if (DRAIN_MS <= 0) return;

  const deadline = Date.now() + DRAIN_MS;
  while (Date.now() < deadline) {
    const stillPending = [...inflight.values()].filter(isPending);
    if (!stillPending.length) return;
    await new Promise((resolve?) => setTimeout(resolve, 100));
  }

  const leftover = [...inflight.values()].filter(isPending);
  if (leftover.length) {
    await Promise.all(leftover.map((entry?) => abortPendingInteraction(entry)));
  }
}

function registerInteractionShutdownGuard() {
  if (registered) return;
  registered = true;
  registerShutdownFlush("interactionShutdown", flushInflightInteractions);
}

export = {
  SHUTDOWN_MESSAGE,
  registerInteractionShutdownGuard,
  trackInteractionStart,
  markInteractionDeferred,
  markInteractionReplied,
  releaseInteraction,
  isShuttingDown,
};
