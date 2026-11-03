/** Notizie giochi: configurazione, stato salvato e pubblicazione nel canale. */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { defaultGamesCatalog, reconcileGameIdentity } = require("./gameNewsCatalog") as typeof import("./gameNewsCatalog");
const { BLOCKED_NEWS_HOST_RE, hasDisallowedScript, stripSourceSuffix, isNearTitleDuplicate } = require("./gameNewsDedupe") as typeof import("./gameNewsDedupe");
const { trimBriefAtSentence, cleanArticleBrief, translateToItalian } = require("./gameNewsText") as typeof import("./gameNewsText");
const { ARTICLE_BRIEF_MIN, resolveArticleBrief, resolveArticleUrl } = require("./gameNewsArticles") as typeof import("./gameNewsArticles");

const STATE_KEY = "gameNewsAlert.v1";
const DEFAULT_POLL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function resolveConfig(client?) {
  const raw = client?.config?.gameNewsAlerts && typeof client.config.gameNewsAlerts === "object"
    ? client.config.gameNewsAlerts
    : {};
  const channelId = String(raw.channelId || IDs.channels?.gameNews || "1553533004591276122").trim();
  const pollIntervalMs = Math.max(
    10 * 60 * 1000,
    Math.min(6 * 60 * 60 * 1000, Number(raw.pollIntervalMs) || DEFAULT_POLL_MS),
  );
  const catalog = defaultGamesCatalog();
  const enabledKeys = Array.isArray(raw.enabledGames) && raw.enabledGames.length
    ? new Set(raw.enabledGames.map((k?) => String(k || "").trim().toLowerCase()).filter(Boolean))
    : null;
  const games = catalog
    .filter((g?) => !enabledKeys || enabledKeys.has(g.key))
    .map((g?) => {
      const override = Array.isArray(raw.games) ? raw.games.find((x?) => String(x?.key || "") === g.key) : null;
      return {
        ...g,
        roleId: String(override?.roleId || g.roleId || "").trim(),
        enabled: override?.enabled === false ? false : true,
      };
    })
    .filter((g?) => g.enabled && g.roleId);
  const maxAgeMs = Math.max(
    24 * 60 * 60 * 1000,
    Math.min(30 * 24 * 60 * 60 * 1000, Number(raw.maxAgeMs) || DEFAULT_MAX_AGE_MS),
  );
  return {
    enabled: raw.enabled !== false,
    channelId,
    pollIntervalMs,
    maxAgeMs,
    translateToItalian: raw.translateToItalian !== false,
    crosspost: raw.crosspost === true,
    maxPostsPerPoll: Math.max(1, Math.min(8, Number(raw.maxPostsPerPoll) || 3)),
    games,
  };
}

async function loadState() {
  const raw = await getBotState(STATE_KEY, null);
  if (!raw || typeof raw !== "object") {
    return { initialized: false, seen: {}, recentStories: [], lastPollAt: null };
  }
  const recentStories = Array.isArray(raw.recentStories)
    ? raw.recentStories.filter((s?) => s && s.title && s.gameKey).slice(0, 120)
    : [];
  return {
    initialized: Boolean(raw.initialized),
    seen: raw.seen && typeof raw.seen === "object" ? raw.seen : {},
    recentStories,
    lastPollAt: raw.lastPollAt || null,
  };
}

async function saveState(state?) {
  const seenEntries = Object.entries(state.seen || {});
  if (seenEntries.length > 800) {
    seenEntries.sort((a?, b?) => Number(b[1] || 0) - Number(a[1] || 0));
    state.seen = Object.fromEntries(seenEntries.slice(0, 600));
  }
  const recentStories = Array.isArray(state.recentStories)
    ? state.recentStories.filter((s?) => s && s.title && s.gameKey).slice(0, 120)
    : [];
  await setBotState(STATE_KEY, {
    initialized: Boolean(state.initialized),
    seen: state.seen || {},
    recentStories,
    lastPollAt: state.lastPollAt || new Date().toISOString(),
  });
}

function buildArticleContent(item?, titleIt?, summaryIt?, articleUrl?) {
  const emoji = item.emoji || "🎮";
  const title = stripSourceSuffix(String(titleIt || item.title || "Novità").trim()).slice(0, 220);
  const body = cleanArticleBrief(title, summaryIt);
  const ping = item.roleId ? `<@&${item.roleId}>` : "";
  const link = String(articleUrl || item.url || "").trim();

  /* emoji + titolo, poi corpo articolo (se c'è), poi ping + link */
  const parts = [`${emoji} **${title}**`];
  if (body) parts.push("", body);
  parts.push("");
  if (ping) parts.push(ping);
  if (link) parts.push(link);

  let content = parts.join("\n").trim();
  if (content.length > 1950) {
    const head = `${emoji} **${title}**`;
    const foot = [ping, link].filter(Boolean).join("\n");
    const budget = 1950 - head.length - foot.length - 4;
    const brief = body && budget > 80 ? `\n\n${trimBriefAtSentence(body, budget)}` : "";
    content = `${head}${brief}\n\n${foot}`.trim().slice(0, 2000);
  }
  return content;
}

async function postItem(client?, cfg?, item?) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild" };
  const channel =
    guild.channels.cache.get(cfg.channelId) ||
    (await getGuildChannelCached(guild, cfg.channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel" };

  if (hasDisallowedScript(`${item.title || ""} ${item.summary || ""}`)) {
    return { ok: false, reason: "foreign-script" };
  }

  const articleUrl = await resolveArticleUrl(item.url);
  if (BLOCKED_NEWS_HOST_RE.test(articleUrl)) {
    return { ok: false, reason: "blocked-host" };
  }

  /* dopo resolve URL: ri-check identità (google → host ufficiale) */
  const gamesByKey = new Map((cfg.games || []).map((g?) => [g.key, g]));
  const identity = reconcileGameIdentity({ ...item, url: articleUrl || item.url }, gamesByKey);
  if (identity.reject) {
    return { ok: false, reason: identity.reason || "wrong-game" };
  }
  const postReady = identity.item;

  let titleIt = String(item.title || "").trim();
  /* corpo: se RSS ripete il titolo / è corto → scrape pagina */
  let summaryRaw = await resolveArticleBrief(
    titleIt,
    String(item.summary || "").trim(),
    articleUrl || postReady.url,
  );

  if (cfg.translateToItalian) {
    titleIt = await translateToItalian(titleIt);
    if (summaryRaw && !hasDisallowedScript(summaryRaw)) {
      summaryRaw = await translateToItalian(summaryRaw);
      /* dopo translate può ri-assomigliare al titolo */
      summaryRaw = cleanArticleBrief(titleIt, summaryRaw) || summaryRaw;
      if (isNearTitleDuplicate(titleIt, summaryRaw)) summaryRaw = "";
    }
  }
  if (hasDisallowedScript(`${titleIt} ${summaryRaw}`)) {
    return { ok: false, reason: "foreign-script-after-translate" };
  }

  /* se ancora vuoto dopo translate, ritenta scrape con titolo IT */
  if (!summaryRaw || summaryRaw.length < ARTICLE_BRIEF_MIN) {
    const again = await resolveArticleBrief(titleIt, String(item.summary || ""), articleUrl || postReady.url);
    if (again && again.length > (summaryRaw || "").length) {
      summaryRaw = cfg.translateToItalian ? await translateToItalian(again) : again;
      summaryRaw = cleanArticleBrief(titleIt, summaryRaw) || summaryRaw;
      if (isNearTitleDuplicate(titleIt, summaryRaw)) summaryRaw = again;
    }
  }

  const content = buildArticleContent(postReady, titleIt, summaryRaw, articleUrl || postReady.url);
  const msg = await channel.send({
    content,
    allowedMentions: postReady.roleId ? { roles: [postReady.roleId] } : { parse: [] },
  });

  if (cfg.crosspost && Number(channel.type) === ChannelType.GuildAnnouncement && typeof msg?.crosspost === "function") {
    await msg.crosspost().catch(() => null);
  }
  return {
    ok: true,
    messageId: msg?.id || null,
    gameKey: postReady.gameKey,
    reassigned: Boolean(identity.reassigned),
    briefLen: summaryRaw.length,
  };
}

export = { resolveConfig, loadState, saveState, postItem };
