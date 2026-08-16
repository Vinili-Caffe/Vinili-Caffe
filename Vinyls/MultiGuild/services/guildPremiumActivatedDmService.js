const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const {
  TENANT_EMBED_COLOR,
  applyBrandingBannerImage,
  createStandardGifAttachment,
} = require("../utils/tenantEmbedBranding");
const { applyDefaultFooter } = require("../../Utils/Embeds/defaultFooter");
const { pickRandomWritableTextChannel } = require("./guildJoinWelcomeDmService");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");
const {
  tPremium,
  formatPremiumDuration,
  listPremiumPerkLines,
  resolvePremiumNotifyLanguage,
} = require("./premiumActivatedI18n");

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

function dashboardGuildUrl(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return `${resolveSiteOrigin()}/dashboard/premium/`;
  return `${resolveSiteOrigin()}/dashboard/guild/?id=${encodeURIComponent(gid)}`;
}

function formatCreditsLabel(n) {
  const value = Math.max(0, Math.floor(Number(n) || 0));
  try {
    return value.toLocaleString("it-IT");
  } catch {
    return String(value);
  }
}

function formatExpiryLine(lang, untilMs) {
  if (untilMs == null) return tPremium(lang, "lifetime");
  const ms = Number(untilMs);
  if (!Number.isFinite(ms) || ms <= 0) return tPremium(lang, "expiresUnavailable");
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:D> (<t:${unix}:R>)`;
}

function buildDashboardLinkRow(guildId, lang) {
  const url = dashboardGuildUrl(guildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setLabel(tPremium(lang, "buttonDashboard"))
      .setEmoji("🛠️"),
  );
}

function buildPremiumActivatedEmbed({ guild, plan, premium, creditsLeft, lang }) {
  const guildName = String(guild?.name || "server").trim() || "server";
  const planName = tPremium(lang, "planName");
  const monthsLabel = formatPremiumDuration(lang, plan?.months);
  const creditsSpent = formatCreditsLabel(plan?.credits);
  const remaining =
    creditsLeft != null && Number.isFinite(Number(creditsLeft))
      ? formatCreditsLabel(creditsLeft)
      : null;
  const until = premium?.until;
  const perksBlock = listPremiumPerkLines(lang)
    .map((line) => `· ${line}`)
    .join("\n");

  const creditsField =
    remaining != null
      ? tPremium(lang, "creditsValue", { spent: creditsSpent, left: remaining })
      : tPremium(lang, "creditsValueNoBalance", { spent: creditsSpent });

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(tPremium(lang, "title", { plan: planName }))
    .setDescription(
      [tPremium(lang, "thanks", { guild: guildName }), "", tPremium(lang, "intro")].join("\n"),
    )
    .addFields(
      {
        name: tPremium(lang, "fieldPlan"),
        value: `**${planName}** · ${monthsLabel}`,
        inline: true,
      },
      {
        name: tPremium(lang, "fieldCredits"),
        value: creditsField,
        inline: true,
      },
      {
        name: tPremium(lang, "fieldExpires"),
        value: formatExpiryLine(lang, until),
        inline: false,
      },
      {
        name: tPremium(lang, "fieldPerks"),
        value: perksBlock,
        inline: false,
      },
      {
        name: tPremium(lang, "fieldStart"),
        value: tPremium(lang, "fieldStartBody"),
        inline: false,
      },
    );

  try {
    const icon = guild ? guildIconUrl(guild, { size: 128 }) : null;
    if (icon) embed.setThumbnail(icon);
  } catch (_) {}

  return applyDefaultFooter(applyBrandingBannerImage(embed), guild || null);
}

function buildPremiumActivatedPayload(guild, user, embed, lang) {
  const file = createStandardGifAttachment();
  const payload = {
    embeds: [embed],
    components: [buildDashboardLinkRow(guild?.id, lang)],
    ...(file ? { files: [file] } : {}),
  };
  if (user?.id) {
    payload.content = `<@${user.id}> ${tPremium(lang, "channelFallback")}`;
    payload.allowedMentions = { users: [user.id], roles: [], parse: [] };
  }
  return payload;
}

async function ensureGuildChannelsCached(guild) {
  if (guild?.channels?.cache?.size) return;
  await guild.channels.fetch().catch(() => null);
}

async function sendPremiumActivatedInGuildChannel(guild, user, embed, lang) {
  let me = guild.members?.me || null;
  if (!me) me = await guild.members.fetchMe().catch(() => null);
  await ensureGuildChannelsCached(guild);
  const channel = pickRandomWritableTextChannel(guild, me);
  if (!channel) {
    global.logger?.warn?.(
      `[premiumActivatedDm] no writable text channel for fallback guild=${guild.id}`,
    );
    return null;
  }

  const payload = buildPremiumActivatedPayload(guild, user, embed, lang);
  if (!user?.id) delete payload.content;

  const sent = await channel.send(payload).catch((err) => {
    global.logger?.warn?.(
      `[premiumActivatedDm] channel fallback failed guild=${guild.id} channel=${channel.id}:`,
      err?.code || err?.message || err,
    );
    return null;
  });
  if (sent) {
    global.logger?.info?.(
      `[premiumActivatedDm] channel fallback to #${channel.name} (${channel.id}) guild=${guild.id}` +
        (user?.id ? ` user=${user.id}` : ""),
    );
  }
  return sent;
}

/**
 * DM all'utente che ha attivato Premium; se i DM sono chiusi, fallback
 * in un canale testuale scrivibile del server attivato.
 * Lingua: stessa risoluzione del bot tenant (preferenza profilo → locale guild → Discord).
 */
async function sendPremiumActivatedDm(client, { userId, guildId, plan, premium, creditsLeft } = {}) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  if (!client || !/^\d{16,20}$/.test(uid) || !/^\d{16,20}$/.test(gid)) return null;
  if (!plan || !premium) return null;

  let guild = client.guilds?.cache?.get?.(gid) || null;
  if (!guild && typeof client.guilds?.fetch === "function") {
    guild = await client.guilds.fetch(gid).catch(() => null);
  }
  if (!guild) {
    global.logger?.warn?.(`[premiumActivatedDm] guild not found ${gid}`);
    return null;
  }

  const user = await client.users.fetch(uid).catch(() => null);
  const lang = await resolvePremiumNotifyLanguage(client, guild, uid).catch(() => "it");
  const embed = buildPremiumActivatedEmbed({
    guild,
    plan,
    premium,
    creditsLeft,
    lang,
  });

  if (!user?.id) {
    return sendPremiumActivatedInGuildChannel(guild, null, embed, lang);
  }

  try {
    const file = createStandardGifAttachment();
    const dm = await user.send({
      embeds: [embed],
      components: [buildDashboardLinkRow(guild.id, lang)],
      ...(file ? { files: [file] } : {}),
    });
    global.logger?.info?.(
      `[premiumActivatedDm] sent to ${uid} for guild ${gid} (${guild.name}) plan=${plan.months}m lang=${lang}`,
    );
    return dm;
  } catch (err) {
    global.logger?.warn?.(
      `[premiumActivatedDm] DM failed user=${uid} guild=${gid}:`,
      err?.code || err?.message || err,
    );
    return sendPremiumActivatedInGuildChannel(guild, user, embed, lang);
  }
}

module.exports = {
  sendPremiumActivatedDm,
  buildPremiumActivatedEmbed,
  buildDashboardLinkRow,
};
