const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const {
  TENANT_EMBED_COLOR,
  applyBrandingBannerImage,
  createStandardGifAttachment,
} = require("../utils/tenantEmbedBranding") as typeof import("../utils/tenantEmbedBranding");
const { applyDefaultFooter } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const {
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
} = require("../core/tenantPremium") as typeof import("../core/tenantPremium");
const { pickRandomWritableTextChannel } = require("./guildJoinWelcomeDmService") as typeof import("./guildJoinWelcomeDmService");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const {
  tPremium,
  resolvePremiumNotifyLanguage,
} = require("./premiumActivatedI18n") as typeof import("./premiumActivatedI18n");

const REMINDER_STATE_KEY = "multiGuildTenantPremiumExpiryReminders.v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLDS_DAYS = Object.freeze([7, 3, 1]);
const DEFAULT_SWEEP_MS = 60 * 60 * 1000;
const loopState = new WeakSet();

function resolveSiteOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN ||
      process.env.SITE_URL ||
      process.env.VC_SITE_URL ||
      "https://www.viniliecaffe.it",
  )
    .trim()
    .replace(/\/+$/, "");
  return raw || "https://www.viniliecaffe.it";
}

function dashboardPremiumUrl(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return `${resolveSiteOrigin()}/dashboard/premium/`;
  return `${resolveSiteOrigin()}/dashboard/guild/?id=${encodeURIComponent(gid)}`;
}

function formatExpiryLine(lang?, untilMs?) {
  const ms = Number(untilMs);
  if (!Number.isFinite(ms) || ms <= 0) return tPremium(lang, "expiresUnavailable");
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:D> (<t:${unix}:R>)`;
}

function remindTitleKey(days?) {
  if (days === 1) return "remindTitle1";
  if (days === 3) return "remindTitle3";
  return "remindTitle7";
}

function remindIntroKey(days?) {
  if (days === 1) return "remindIntro1";
  if (days === 3) return "remindIntro3";
  return "remindIntro7";
}

function buildRenewLinkRow(guildId?, lang?) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardPremiumUrl(guildId))
      .setLabel(tPremium(lang, "buttonRenew"))
      .setEmoji("💎"),
  );
}

function buildPremiumExpiryReminderEmbed({ guild, untilMs, days, lang }) {
  const guildName = String(guild?.name || "server").trim() || "server";
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(tPremium(lang, remindTitleKey(days)))
    .setDescription(
      [
        tPremium(lang, "remindThanks", { guild: guildName }),
        "",
        tPremium(lang, remindIntroKey(days)),
        "",
        tPremium(lang, "remindKeep"),
      ].join("\n"),
    )
    .addFields(
      {
        name: tPremium(lang, "fieldExpires"),
        value: formatExpiryLine(lang, untilMs),
        inline: false,
      },
      {
        name: tPremium(lang, "fieldStart"),
        value: tPremium(lang, "remindCta"),
        inline: false,
      },
    );

  try {
    const icon = guild ? guildIconUrl(guild, { size: 128 }) : null;
    if (icon) embed.setThumbnail(icon);
  } catch (_) {}

  return applyDefaultFooter(applyBrandingBannerImage(embed), guild || null);
}

async function ensureGuildChannelsCached(guild?) {
  if (guild?.channels?.cache?.size) return;
  await guild.channels.fetch().catch(() => null);
}

async function sendReminderInGuildChannel(guild?, user?, embed?, lang?) {
  let me = guild.members?.me || null;
  if (!me) me = await guild.members.fetchMe().catch(() => null);
  await ensureGuildChannelsCached(guild);
  const channel = pickRandomWritableTextChannel(guild, me);
  if (!channel) {
    global.logger?.warn?.(
      `[premiumExpiryReminder] no writable channel guild=${guild.id}`,
    );
    return null;
  }
  const file = createStandardGifAttachment();
  const payload: Record<string, any> = {
    embeds: [embed],
    components: [buildRenewLinkRow(guild.id, lang)],
    ...(file ? { files: [file] } : {}),
  };
  if (user?.id) {
    payload.content = `<@${user.id}> ${tPremium(lang, "remindChannelFallback")}`;
    payload.allowedMentions = { users: [user.id], roles: [], parse: [] };
  }
  return channel.send(payload).catch((err?) => {
    global.logger?.warn?.(
      `[premiumExpiryReminder] channel fallback failed guild=${guild.id}:`,
      err?.code || err?.message || err,
    );
    return null;
  });
}

async function sendPremiumExpiryReminderDm(client?, { userId, guildId, untilMs, days }: any = {}) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  if (!client || !/^\d{16,20}$/.test(gid)) return null;
  if (![7, 3, 1].includes(Number(days))) return null;

  let guild = client.guilds?.cache?.get?.(gid) || null;
  if (!guild && typeof client.guilds?.fetch === "function") {
    guild = await client.guilds.fetch(gid).catch(() => null);
  }
  if (!guild) {
    global.logger?.warn?.(`[premiumExpiryReminder] guild not found ${gid}`);
    return null;
  }

  let user = null;
  if (/^\d{16,20}$/.test(uid)) {
    user = await client.users.fetch(uid).catch(() => null);
  }
  const lang = await resolvePremiumNotifyLanguage(client, guild, uid || guild.ownerId).catch(() => "it");
  const embed = buildPremiumExpiryReminderEmbed({
    guild,
    untilMs,
    days: Number(days),
    lang,
  });

  if (!user?.id) {
    return sendReminderInGuildChannel(guild, null, embed, lang);
  }

  try {
    const file = createStandardGifAttachment();
    const dm = await user.send({
      embeds: [embed],
      components: [buildRenewLinkRow(guild.id, lang)],
      ...(file ? { files: [file] } : {}),
    });
    global.logger?.info?.(
      `[premiumExpiryReminder] DM user=${uid} guild=${gid} days=${days} lang=${lang}`,
    );
    return dm;
  } catch (err) {
    global.logger?.warn?.(
      `[premiumExpiryReminder] DM failed user=${uid} guild=${gid}:`,
      err?.code || err?.message || err,
    );
    return sendReminderInGuildChannel(guild, user, embed, lang);
  }
}

async function loadReminderState() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(REMINDER_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function saveReminderState(map?) {
  if (!isMongoReady()) return false;
  return setBotState(REMINDER_STATE_KEY, map && typeof map === "object" ? map : {});
}

function normalizeGuildReminderRow(row?, untilMs?) {
  const until = Number(untilMs);
  if (!row || typeof row !== "object" || Number(row.until) !== until) {
    return { until, sent: {} };
  }
  const sent = row.sent && typeof row.sent === "object" ? { ...row.sent } : {};
  return { until, sent };
}

function pickThresholdToSend(msLeft?, sent?) {
  if (!(msLeft > 0)) return null;
  const applicable = THRESHOLDS_DAYS.filter(
    (days?) => msLeft <= days * DAY_MS && !sent[String(days)],
  );
  if (!applicable.length) return null;
  return Math.min(...applicable);
}

async function resolveNotifyUserId(client?, guild?, premium?) {
  const fromPremium = String(premium?.updatedBy || "").trim();
  if (/^\d{16,20}$/.test(fromPremium)) return fromPremium;
  const ownerId = String(guild?.ownerId || "").trim();
  if (/^\d{16,20}$/.test(ownerId)) return ownerId;
  try {
    const fetched = await guild.fetchOwner().catch(() => null);
    const id = String(fetched?.id || "").trim();
    if (/^\d{16,20}$/.test(id)) return id;
  } catch (_) {}
  return null;
}

async function runPremiumExpiryReminderSweep(client?) {
  if (!client || !isMongoReady()) return { checked: 0, sent: 0, identitySuspended: 0 };

    let identitySuspended = 0;
  try {
    const { runPremiumIdentityExpirySweep } = require("./premiumIdentityLifecycleService") as typeof import("./premiumIdentityLifecycleService");
    const idResult = await runPremiumIdentityExpirySweep(client);
    identitySuspended = Number(idResult?.suspended) || 0;
  } catch (err) {
    global.logger?.warn?.(
      "[premiumExpiryReminder] identity sweep failed:",
      err?.message || err,
    );
  }

  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);

  const guildIds = [...(client.guilds?.cache?.keys?.() || [])].map(String);
  if (!guildIds.length) return { checked: 0, sent: 0 };

  const state = await loadReminderState();
  let dirty = false;
  let checked = 0;
  let sent = 0;
  const now = Date.now();

  for (const gid of guildIds) {
    const premium = getTenantPremiumSync(gid);
    if (!premium?.active || premium.until == null) continue;
    const untilMs = Number(premium.until);
    if (!Number.isFinite(untilMs) || untilMs <= now) continue;

    checked += 1;
    const msLeft = untilMs - now;
    const row = normalizeGuildReminderRow(state[gid], untilMs);
    const days = pickThresholdToSend(msLeft, row.sent);
    if (!days) {
      if (Number(state[gid]?.until) !== untilMs) {
        state[gid] = row;
        dirty = true;
      }
      continue;
    }

    let guild = client.guilds.cache.get(gid) || null;
    if (!guild) continue;

    const userId = await resolveNotifyUserId(client, guild, premium);
    const delivered = await sendPremiumExpiryReminderDm(client, {
      userId,
      guildId: gid,
      untilMs,
      days,
    });
    if (!delivered) continue;

    row.sent[String(days)] = Date.now();
        for (const larger of THRESHOLDS_DAYS) {
      if (larger > days) row.sent[String(larger)] = row.sent[String(larger)] || Date.now();
    }
    state[gid] = row;
    dirty = true;
    sent += 1;
  }

  if (dirty) await saveReminderState(state).catch(() => false);
  return { checked, sent, identitySuspended };
}

function startPremiumExpiryReminderLoop(client?, opts: Record<string, any> = {}) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const sweepMs = Math.max(
    15 * 60 * 1000,
    Math.floor(Number(opts.sweepMs) || DEFAULT_SWEEP_MS),
  );

  const tick = () => {
    runPremiumExpiryReminderSweep(client)
      .then((result?) => {
        if (result?.sent || result?.identitySuspended) {
          global.logger?.info?.(
            `[premiumExpiryReminder] sweep checked=${result.checked} sent=${result.sent} identitySuspended=${result.identitySuspended || 0}`,
          );
        }
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[premiumExpiryReminder] sweep failed:",
          err?.message || err,
        );
      });
  };

    const firstDelay = Math.min(sweepMs, 3 * 60 * 1000);
  const bootTimer = setTimeout(tick, firstDelay);
  if (typeof bootTimer.unref === "function") bootTimer.unref();
  const timer = setInterval(tick, sweepMs);
  if (typeof timer.unref === "function") timer.unref();
  client._premiumExpiryReminderInterval = timer;
}

export = {
  startPremiumExpiryReminderLoop,
  sendPremiumExpiryReminderDm,
};
