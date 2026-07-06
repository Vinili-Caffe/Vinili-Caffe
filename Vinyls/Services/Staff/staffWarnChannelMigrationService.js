const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { getGuildChannelCached, getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");

const BOT_STATE_KEY = "staffWarnChannelMigrationV1";
const DEFAULT_DELAY_MS = 650;
const FETCH_BATCH = 100;

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function isStaffWarnChannelMessage(message) {
  if (!message?.id) return false;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const title = String(embed?.title || embed?.data?.title || "");
    const description = String(embed?.description || embed?.data?.description || "");
    const blob = `${title}\n${description}`;
    if (/WARN\s*STAFF/i.test(blob)) return true;
    if (/warn staff/i.test(blob)) return true;
    if (/2 warn staff/i.test(blob)) return true;
  }
  const rows = Array.isArray(message.components) ? message.components : [];
  for (const row of rows) {
    const comps = row?.components || [];
    for (const comp of comps) {
      if (String(comp?.customId || "").startsWith("staff_warn_depex:")) return true;
    }
  }
  return false;
}

function messageHasPayload(message) {
  const content = String(message?.content || "").trim();
  if (content) return true;
  if (Array.isArray(message?.embeds) && message.embeds.length) return true;
  if (Array.isArray(message?.components) && message.components.length) return true;
  return false;
}

function shouldMigrateStaffWarnMessage(message) {
  if (!message?.id) return false;
  if (!messageHasPayload(message)) return false;
  return isStaffWarnChannelMessage(message);
}

function cloneEmbedsForMigration(embeds) {
  return (Array.isArray(embeds) ? embeds : []).map((embed) => {
    const data = typeof embed?.toJSON === "function" ? embed.toJSON() : embed?.data || embed;
    if (!data) return null;
    const builder = EmbedBuilder.from(data);
    const footerText = String(data.footer?.text || "").trim();
    if (!footerText.includes("Archivio warn staff")) {
      builder.setFooter({
        text: footerText ? `${footerText} · Archivio warn staff` : "Archivio warn staff",
        iconURL: data.footer?.icon_url || data.footer?.iconURL || undefined,
      });
    }
    return builder;
  }).filter(Boolean);
}

async function resolveWarnStaffChannel(guild, client) {
  const warnId = String(IDs.channels?.warnStaff || "").trim();
  if (!warnId) return null;
  return (
    guild?.channels?.cache?.get(warnId) ||
    (guild ? await getGuildChannelCached(guild, warnId) : null) ||
    (client ? await getClientChannelCached(client, warnId) : null)
  );
}

async function resolveValutazioniStaffChannel(guild, client) {
  const destId = String(IDs.channels?.valutazioniStaff || "").trim();
  if (!destId) return null;
  return (
    guild?.channels?.cache?.get(destId) ||
    (guild ? await getGuildChannelCached(guild, destId) : null) ||
    (client ? await getClientChannelCached(client, destId) : null)
  );
}

async function fetchAllChannelMessages(channel) {
  const out = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: FETCH_BATCH, before }).catch(() => null);
    if (!batch?.size) break;
    const values = [...batch.values()];
    out.push(...values);
    if (batch.size < FETCH_BATCH) break;
    before = values[values.length - 1]?.id;
    if (!before) break;
  }
  return out.sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
}

async function migrateStaffWarnChannelMessages(client, opts = {}) {
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  if (!client || !guildId) return { skipped: true, reason: "missing_client_or_guild" };

  const force = Boolean(opts.force);
  const dryRun = opts.dryRun === true;
  const stateKey = String(opts.stateKey || BOT_STATE_KEY);

  if (!force && !dryRun && isMongoReady()) {
    const existing = await getBotState(stateKey, null);
    if (existing?.completedAt && Number(existing.migrated || 0) > 0) {
      return { skipped: true, reason: "already_completed", migrated: Number(existing.migrated || 0) };
    }
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { skipped: true, reason: "guild_not_found" };

  const sourceChannel = await resolveWarnStaffChannel(guild, client);
  if (!sourceChannel?.isTextBased?.()) {
    if (!dryRun && isMongoReady()) {
      await setBotState(stateKey, {
        completedAt: new Date().toISOString(),
        migrated: 0,
        skipped: true,
        reason: "source_channel_missing",
      });
    }
    return { skipped: true, reason: "source_channel_missing" };
  }

  const destChannel = await resolveValutazioniStaffChannel(guild, client);
  if (!destChannel?.isTextBased?.()) {
    return { skipped: true, reason: "dest_channel_missing" };
  }

  const prevState = !dryRun && isMongoReady() ? await getBotState(stateKey, null) : null;
  const migratedIds = new Set(
    force ? [] : (Array.isArray(prevState?.migratedSourceIds) ? prevState.migratedSourceIds : []),
  );
  const messages = await fetchAllChannelMessages(sourceChannel);
  let candidates = messages.filter((message) => shouldMigrateStaffWarnMessage(message));
  if (!candidates.length && messages.length) {
    candidates = messages.filter((message) => message?.id && messageHasPayload(message) && Array.isArray(message.embeds) && message.embeds.length);
    if (candidates.length) {
      global.logger?.warn?.(
        `[STAFF WARN MIGRATION] fallback embed: ${candidates.length}/${messages.length} messaggi (formato warn non riconosciuto)`,
      );
    }
  }
  if (!candidates.length && messages.length) {
    global.logger?.warn?.(
      `[STAFF WARN MIGRATION] ${messages.length} messaggi nel canale ma nessun candidato — migrazione non completata`,
    );
    return { ok: false, reason: "no_candidates", total: messages.length, migrated: 0, failed: 0 };
  }
  let migrated = force ? 0 : Number(prevState?.migrated || 0);
  let failed = 0;

  for (const message of candidates) {
    const mid = String(message.id || "");
    if (!mid || migratedIds.has(mid)) continue;
    if (dryRun) {
      migrated += 1;
      continue;
    }
    const embeds = cloneEmbedsForMigration(message.embeds);
    const sent = await destChannel.send({
      content: String(message.content || "").trim() || undefined,
      embeds: embeds.length ? embeds : undefined,
      components: message.components?.length ? message.components.map((row) => row) : undefined,
      allowedMentions: { parse: ["users"] },
    }).catch(() => null);
    if (!sent) {
      failed += 1;
      continue;
    }
    migrated += 1;
    migratedIds.add(mid);
    if (isMongoReady()) {
      await setBotState(stateKey, {
        completedAt: null,
        migrated,
        failed,
        sourceChannelId: sourceChannel.id,
        destChannelId: destChannel.id,
        lastSourceMessageId: mid,
        migratedSourceIds: [...migratedIds].slice(-500),
      });
    }
    await wait(Number(opts.delayMs || DEFAULT_DELAY_MS));
  }

  if (!dryRun && isMongoReady() && (migrated > 0 || messages.length === 0)) {
    await setBotState(stateKey, {
      completedAt: new Date().toISOString(),
      migrated,
      failed,
      sourceChannelId: sourceChannel.id,
      destChannelId: destChannel.id,
      migratedSourceIds: [...migratedIds].slice(-500),
    });
  }

  global.logger?.info?.(
    `[STAFF WARN MIGRATION] fetched=${messages.length} candidates=${candidates.length} migrated=${migrated} failed=${failed} source=${sourceChannel.id} dest=${destChannel.id}`,
  );
  return { ok: true, migrated, failed, candidates: candidates.length };
}

function shouldRunStaffWarnChannelMigrationOnStartup(client) {
  const envValue = String(process.env.MIGRATE_STAFF_WARN_CHANNEL_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  if (["1", "true", "yes", "on"].includes(envValue)) return true;
  return client?.config?.migrateStaffWarnChannelOnStartup !== false;
}

async function runStaffWarnChannelMigrationOnStartup(client) {
  if (!shouldRunStaffWarnChannelMigrationOnStartup(client)) {
    return { skipped: true, reason: "disabled" };
  }
  return migrateStaffWarnChannelMessages(client, { dryRun: false });
}

module.exports = {
  BOT_STATE_KEY,
  isStaffWarnChannelMessage,
  shouldMigrateStaffWarnMessage,
  migrateStaffWarnChannelMessages,
  shouldRunStaffWarnChannelMigrationOnStartup,
  runStaffWarnChannelMigrationOnStartup,
};