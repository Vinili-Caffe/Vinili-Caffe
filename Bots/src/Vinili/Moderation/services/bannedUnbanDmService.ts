const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");

const BOT_STATE_KEY = "dmBannedUnbanLinkStartupOnce.v1";
const DEFAULT_DELAY_MS = 1500;

function resolveUnbanUrl(overrideUrl?) {
  if (overrideUrl) return overrideUrl;
  const rawBase =
    String(process.env.WEBSITE_PUBLIC_URL || "").trim() ||
    String(process.env.VC_SITE_URL || "").trim() ||
    "https://www.viniliecaffe.it";
  const base = rawBase.replace(/\/+$/, "");
  return `${base}/unban`;
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function buildDmPayload(unbanUrl?) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Richiesta unban disponibile")
    .setDescription(
      [
        "Ciao, ti scriviamo da **Vinili & Caffe**.",
        "",
        "Se vuoi richiedere la revisione del tuo ban, puoi compilare il modulo unban sul nostro sito.",
        "Lo staff valutera la richiesta e riceverai aggiornamenti appena possibile.",
      ].join("\n"),
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Apri richiesta unban")
      .setURL(unbanUrl),
  );

  return { embeds: [embed], components: [row] };
}

async function fetchAllBans(guild?) {
  const out = [];
  let after = undefined;
  while (true) {
    const batch = await guild.bans.fetch({ limit: 1000, after });
    if (!batch.size) break;
    const values = [...batch.values()];
    out.push(...values);
    if (batch.size < 1000) break;
    after = values[values.length - 1]?.user?.id;
    if (!after) break;
  }
  return out;
}

function shouldRunBannedUnbanDmOnStartup(client?) {
  const envValue = String(process.env.DM_BANNED_UNBAN_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  if (["1", "true", "yes", "on"].includes(envValue)) return true;
  return client?.config?.dmBannedUnbanOnStartup === true;
}

async function sendBannedUnbanLinkDms(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  if (!client || !guildId) return { skipped: true, reason: "missing_client_or_guild" };

  const once = opts.once !== false;
  const force = Boolean(opts.force);
  const dryRun = opts.dryRun !== false ? true : false;
  const stateKey = String(opts.stateKey || BOT_STATE_KEY);
  if (once && !dryRun && mongoose.connection.readyState !== 1) {
    return { skipped: true, reason: "state_unavailable" };
  }

  const existingState = once && !dryRun ? await getBotState(stateKey, null) : null;
  if (once && !force && existingState?.completedAt) {
    return { skipped: true, reason: "already_completed", completedAt: existingState.completedAt };
  }
  if (once && !force && existingState?.startedAt) {
    return { skipped: true, reason: "already_started", startedAt: existingState.startedAt };
  }

  const delayMs = Math.max(0, Number(opts.delayMs ?? DEFAULT_DELAY_MS) || DEFAULT_DELAY_MS);
  const limit = Math.max(0, Number(opts.limit || 0) || 0);
  const unbanUrl = resolveUnbanUrl(opts.unbanUrl);

  if (once && !dryRun) {
    await setBotState(stateKey, {
      ...(existingState && typeof existingState === "object" ? existingState : {}),
      status: "running",
      startedAt: new Date().toISOString(),
      guildId,
      unbanUrl,
    });
  }

  const guild = await client.guilds.fetch(guildId);
  if (!guild) return { skipped: true, reason: "guild_not_found" };

  const bans = await fetchAllBans(guild);
  const rows = limit > 0 ? bans.slice(0, limit) : bans;
  const payload = buildDmPayload(unbanUrl);

  let sent = 0;
  let failed = 0;
  let skippedBots = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const user = rows[i]?.user;
    if (!user?.id || user.bot) {
      skippedBots += 1;
      continue;
    }
    if (!dryRun) {
      try {
        await user.send(payload);
        sent += 1;
      } catch (err) {
        failed += 1;
        global.logger?.warn?.(`[dm-banned-unban] failed ${user.id}: ${err?.message || err}`);
      }
    }
    if (!dryRun && delayMs > 0 && i < rows.length - 1) await wait(delayMs);
  }

  const result = {
    skipped: false,
    guildId,
    totalBans: bans.length,
    target: rows.length,
    sent,
    failed,
    skippedBots,
    dryRun,
    unbanUrl,
    completedAt: new Date().toISOString(),
  };

  if (once && !dryRun) {
    await setBotState(stateKey, {
      status: "completed",
      ...result,
    });
  }

  return result;
}

export = {
  BOT_STATE_KEY,
  DEFAULT_DELAY_MS,
  sendBannedUnbanLinkDms,
  shouldRunBannedUnbanDmOnStartup,
};