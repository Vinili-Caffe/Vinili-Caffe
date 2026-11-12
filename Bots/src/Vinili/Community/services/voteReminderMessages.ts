/** Voti: testi, embed e link dei promemoria. */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldBlockDm } = require("../utils/noDmList") as typeof import("../utils/noDmList");
const { isUserDmPrivacyBlockedError, notifyDmPrivacyBlockedInCommands } = require("../../../shared/discord/dmPrivacyNotice") as typeof import("../../../shared/discord/dmPrivacyNotice");
const { enqueueSiteInAppNotification } = require("../../site/notifications/siteInAppNotificationsService") as typeof import("../../site/notifications/siteInAppNotificationsService");
const { shouldSkipDiscordDmForActiveWebPush } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached, getUserCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { DISCADIA_VOTE_ROOT, voteListingKey, claimVoteReminderSlot, releaseVoteReminderSlot, voteReminderLockKey } = require("./voteReminderState") as typeof import("./voteReminderState");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const discadiaVoteTimers = new Map();
const STAFF_BYPASS_ROLE_IDS = new Set(
  [
    IDs.roles.Staff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.PartnerManager,
    IDs.roles.HighStaff,
    IDs.roles.Director,
    IDs.roles.Admin,
    IDs.roles.Manager,
    IDs.roles.Founder,
  ].filter(Boolean),
);

const voteReminderDispatchInflight = new Set();

function getVoteCooldownMs(client?, voteListing = "discadia") {
  const listing = voteListing === "topgg" ? "topgg" : "discadia";
  if (listing === "topgg") {
    const rawT = client?.config?.topgg?.voteReminderCooldownHours;
    const hoursT = Number(rawT);
    const safeT = Number.isFinite(hoursT) && hoursT > 0 ? hoursT : 12;
    return safeT * 60 * 60 * 1000;
  }
  const raw = client?.config?.discadiaVoteReminder?.cooldownHours;
  const hours = Number(raw);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return safeHours * 60 * 60 * 1000;
}

function getVoteCheckIntervalMs(client?) {
  const minutes = client?.config?.discadiaVoteReminder?.checkIntervalMinutes || 30;
  return minutes * 60 * 1000;
}

function getVoteReminderText(client?) {
  return (
    client?.config?.discadiaVoteReminder?.message ||
    [
      `${E.discadia} Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia.`,
      `${E.VC_ThankYou} **Grazie per il supporto!**`,
      `${E.link} Per votare su Discadia, clicca sul pulsante sottostante:\n`,
    ]
  );
}

function resolveTopggReminderVoteUrl(client?) {
  const fromCfg = String(client?.config?.topgg?.votePageUrl || "").trim();
  if (fromCfg) return fromCfg;
  const bid = String(client?.user?.id || "").trim();
  return bid ? `https://top.gg/bot/${bid}` : "";
}

function getTopggVoteReminderText(client?) {
  const raw = client?.config?.topgg?.reminderMessage;
  if (Array.isArray(raw) && raw.length) return raw;
  if (typeof raw === "string" && raw.trim()) return raw;
  return [
    `${E.VC_topgg} Hey! Sono passate 12 ore: puoi votare di nuovo su **Top.gg**.`,
    `${E.VC_ThankYou} **Grazie per il supporto!**`,
    `${E.link} Per votare su Top.gg, clicca sul pulsante sottostante:\n`,
  ];
}

function resolveVoteReminderOpenUrl(client?, voteListing?) {
  const listing = voteListingKey(voteListing);
  if (listing === "topgg") {
    const u = resolveTopggReminderVoteUrl(client);
    if (u) return u;
  }
  return String(client?.config?.discadiaVoteReminder?.voteUrl || IDs.links?.vote || "").trim();
}

function buildVoteSiteInAppNotificationOpts(client?, guildId?, userId?, voteListing?, lastVoteAtMs?, cooldownMs?) {
  const listing = voteListingKey(voteListing);
  const gid = String(guildId || IDs.guilds.main).trim() || String(IDs.guilds.main);
  const uid = String(userId || "").trim();
  const openUrl = resolveVoteReminderOpenUrl(client, listing);
  const isTop = listing === "topgg";
  const safeCooldown = Math.max(60_000, Math.floor(Number(cooldownMs) || 60_000));
  return {
    guildId: gid,
    userId: uid,
    title: isTop ? "Promemoria voto su Top.gg" : "Promemoria voto su Discadia",
    body: isTop
      ? "Puoi votare di nuovo su Top.gg: un voto aiuta il server a farsi conoscere. Grazie!"
      : "Puoi votare di nuovo su Discadia: un voto aiuta il server a farsi conoscere. Grazie!",
    kind: "vote_reminder",
    openUrl: openUrl || undefined,
    dedupeKey: `vote_reminder_${listing}_${lastVoteAtMs}`,
    dedupeWindowMs: safeCooldown,
  };
}

async function buildVoteReminderEmbed(client?, opts: Record<string, any> = {}) {
  let voteListing = opts.voteListing;
  if (voteListing !== "topgg" && voteListing !== "discadia") {
    const gid = String(opts.guildId || "").trim();
    const uid = String(opts.userId || "").trim();
    if (gid && uid) {
      const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
        .select(DISCADIA_VOTE_ROOT)
        .lean()
        .catch(() => null);
      const raw = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.lastVoteListing;
      voteListing = raw === "topgg" ? "topgg" : "discadia";
    } else {
      voteListing = "discadia";
    }
  }

  const isTopgg = voteListing === "topgg";
  const text = isTopgg ? getTopggVoteReminderText(client) : getVoteReminderText(client);
  const description = Array.isArray(text) ? text.join("\n") : (text ?? "");
  const embed = new EmbedBuilder()
    .setColor(client?.config?.embedInfo || "#6f4e37")
    .setDescription(description)
    .setFooter({
      text: "DM voti: [Personalizza](https://www.viniliecaffe.it/personalizza/) → Privacy (Discadia e Top.gg separati) o Notifiche DM.",
    });

  const components = [];
  const voteUrl = isTopgg
    ? resolveTopggReminderVoteUrl(client)
    : client?.config?.discadiaVoteReminder?.voteUrl || IDs.links?.vote;
  if (voteUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setEmoji(E.VC_HeartPink)
          .setLabel("Vota cliccando qui")
          .setURL(voteUrl),
      ),
    );
  }
  return { embed, components };
}

const lastVoteFallbackSentAt = new Map();
const VOTE_FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

async function isStaffNoDmBypassUser(client?, guildId?, userId?) {
  if (!client || !userId || !STAFF_BYPASS_ROLE_IDS.size) return false;

  const resolvedGuildId = guildId || IDs.guilds.main;
  const guild = await getClientGuildCached(client, resolvedGuildId);
  if (!guild) return false;

  const member = await getGuildMemberCached(guild, userId);
  if (!member?.roles?.cache) return false;

  for (const roleId of STAFF_BYPASS_ROLE_IDS) {
    if (member.roles.cache.has(roleId)) return true;
  }

  return false;
}

async function shouldSkipVoteDmByNoDm(client?, guildId?, userId?, voteListing = "discadia") {
  const listing = voteListingKey(voteListing);
  const category = listing === "topgg" ? "vote_topgg" : "bump";
  if (!(await shouldBlockDm(guildId, userId, category).catch(() => false))) return false;
  const isStaffBypass = await isStaffNoDmBypassUser(client, guildId, userId);
  return !isStaffBypass;
}

async function sendVoteFallbackChannelReminder(client?, guildId?, userId?, voteListing = "discadia") {
    const fallbackId = String(client?.config?.discadiaVoteReminder?.fallbackChannelId || "").trim();
  if (!fallbackId || !/^\d{5,30}$/.test(fallbackId)) return false;

  const guild = await getClientGuildCached(client, guildId || IDs.guilds.main);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, userId);
  if (!member) return false;

  const now = Date.now();
  const key = `${String(guildId || guild.id)}:${String(userId)}:${voteListingKey(voteListing)}`;
  if (
    lastVoteFallbackSentAt.get(key) &&
    now - lastVoteFallbackSentAt.get(key) < VOTE_FALLBACK_COOLDOWN_MS
  )
    return false;
  const channel = client.channels.cache.get(fallbackId) || (await getClientChannelCached(client, fallbackId));
  if (!channel) return false;
  const listing = voteListingKey(voteListing);
  try {
    const { trySendConfiguredVoteReminder } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    const result = await trySendConfiguredVoteReminder(client, null, {
      guildId: String(guildId || guild.id),
      userId: String(userId),
      voteListing: listing,
      asChannelFallback: true,
      channel,
    });
    if (result === "sent" || result === "skipped") {
      lastVoteFallbackSentAt.set(key, now);
      return result === "sent";
    }
    if (result === "failed") return false;
  } catch (_) {}
  const { embed, components } = await buildVoteReminderEmbed(client, {
    guildId,
    userId,
    voteListing: listing,
  });
  const sent = await channel
    .send({
      content: `<@${userId}>`,
      embeds: [embed],
      ...(components.length ? { components } : {}),
    })
    .catch(() => null);
  if (!sent) return false;
  lastVoteFallbackSentAt.set(key, now);
  return true;
}

async function dispatchVoteReminder(client, { guildId, userId, voteListing, lastVoteAtMs, cooldownMs }) {
  const gid = String(guildId || IDs.guilds.main || "").trim();
  const uid = String(userId || "").trim();
  const listing = voteListingKey(voteListing);
  if (!gid || !uid) return { ok: false, delivered: false, skippedOptOut: false };

  const lockKey = voteReminderLockKey(gid, uid, listing, lastVoteAtMs);
  if (voteReminderDispatchInflight.has(lockKey)) {
    return { ok: true, delivered: false, skippedOptOut: false, skippedDuplicate: true };
  }
  voteReminderDispatchInflight.add(lockKey);

  try {
        const claimedAt = await claimVoteReminderSlot(gid, uid, listing, lastVoteAtMs);
    if (!claimedAt) {
      return { ok: true, delivered: false, skippedOptOut: false, skippedDuplicate: true };
    }

    const timerKey = `vote:${listing}:${uid}`;
    const pendingTimer = discadiaVoteTimers.get(timerKey);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      discadiaVoteTimers.delete(timerKey);
    }

    const skipDm = await shouldSkipVoteDmByNoDm(client, gid, uid, listing);

    const siteOpts = buildVoteSiteInAppNotificationOpts(client, gid, uid, listing, lastVoteAtMs, cooldownMs);
    /* votePushNoDmFix1: push sito anche se Discord NoDM — NoDM vale solo per DM
       votePushTtl1: TTL lungo + rollback claim se enqueue fallisce
       votePushPhoneFix1: se TUTTI gli endpoint push falliscono (FCM 410 tipico phone),
       rilascia claim così lo sweep ritenta quando il telefono si ri-iscrive.
       votePushPhoneRetry1: se PC ok ma telefono miss → retry solo mobile (no doppio PC). */
    let siteOk = false;
    const pushOut = {
      sent: -1,
      failed: 0,
      skipped: false,
      ok: true,
      mobileSent: 0,
      mobileFailed: 0,
      mobileTargets: 0,
      mobileAppleSent: 0,
      desktopSent: 0,
      skippedGone: 0,
      notifId: "",
    };
    try {
      siteOk = await enqueueSiteInAppNotification({
        ...siteOpts,
        pushTtlSeconds: 60 * 60 * 12,
        __pushOut: pushOut,
      });
    } catch (err) {
      global.logger?.warn?.("[VOTE REMINDER] site notification failed:", uid, err?.message || err);
      await releaseVoteReminderSlot(gid, uid, listing).catch(() => false);
      siteOk = false;
    }
    if (!siteOk) {
      await releaseVoteReminderSlot(gid, uid, listing).catch(() => false);
      return { ok: false, delivered: false, skippedOptOut: false, siteEnqueueFailed: true };
    }
    if (
      pushOut.sent === 0 &&
      pushOut.failed > 0 &&
      pushOut.skipped !== true
    ) {
      global.logger?.warn?.("[VOTE REMINDER] all push endpoints failed — release claim for retry:", uid, listing, pushOut);
      await releaseVoteReminderSlot(gid, uid, listing).catch(() => false);
      return { ok: false, delivered: false, skippedOptOut: false, pushAllFailed: true };
    }
    /* pushPhoneAllSoftRetry1: soft-retry mobile ora in fireNotificationPush (tutte le kind).
       Evita doppio schedule vote-only qui. */

    if (skipDm) {
      return { ok: true, delivered: true, skippedOptOut: true, sitePushAttempted: true };
    }

    const skipDiscordForPush = await shouldSkipDiscordDmForActiveWebPush(gid, uid, siteOpts).catch(() => false);
    if (skipDiscordForPush) {
      return { ok: true, delivered: true, skippedOptOut: false, skippedDiscordForWebPush: true };
    }

    const guild = await getClientGuildCached(client, gid);
    const member = guild ? await getGuildMemberCached(guild, uid) : null;
    if (!member) {
            return { ok: true, delivered: false, skippedOptOut: false, skippedNotInGuild: true };
    }

    let user = member.user || (await getUserCached(client, uid));
    if (!user && client?.users?.fetch) user = await client.users.fetch(uid).catch(() => null);
    if (!user) return { ok: true, delivered: false, skippedOptOut: false };

    let delivered = false;
    try {
      let dashboardResult: "not_owned" | "skipped" | "sent" | "failed" = "not_owned";
      try {
        const { trySendConfiguredVoteReminder } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
        dashboardResult = await trySendConfiguredVoteReminder(client, user, { guildId: gid, userId: uid, voteListing: listing });
      } catch (_) {}
      if (dashboardResult === "sent" || dashboardResult === "skipped") {
        delivered = true;
      } else if (dashboardResult === "failed") {
        delivered = await sendVoteFallbackChannelReminder(client, gid, uid, listing);
      } else {
        const { embed, components } = await buildVoteReminderEmbed(client, { guildId: gid, userId: uid, voteListing: listing });
        await user.send({ embeds: [embed], ...(components.length ? { components } : {}) });
        delivered = true;
      }
    } catch (err) {
      if (isUserDmPrivacyBlockedError(err)) {
        const voteCategory = listing === "topgg" ? "vote_topgg" : "bump";
        const optedOut = await shouldBlockDm(gid, uid, voteCategory).catch(() => false);
        if (!optedOut) {
          await notifyDmPrivacyBlockedInCommands({
            guildId: gid,
            userId: uid,
            commandsChannelId: IDs.channels.commands,
            client,
          }).catch(() => false);
        }
      }
      delivered = await sendVoteFallbackChannelReminder(client, gid, uid, listing);
    }

        return { ok: true, delivered: Boolean(delivered), skippedOptOut: false };
  } finally {
    voteReminderDispatchInflight.delete(lockKey);
  }
}

async function enqueueVoteCompletedSiteNotification(_client?, _userId?, _voteListing?, _opts: Record<string, any> = {}) {
  // notifCats1: no in-app/push for "voto registrato" (Top.gg / Discadia).
  // Vote counting, rewards, and vote_reminder schedulers stay intact.
  return false;
}

export = { discadiaVoteTimers, getVoteCooldownMs, getVoteCheckIntervalMs, dispatchVoteReminder, enqueueVoteCompletedSiteNotification };
