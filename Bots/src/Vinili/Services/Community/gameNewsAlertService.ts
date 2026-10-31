
const { defaultGamesCatalog, currentEaFcEdition, inferGameKeyFromContent, reconcileGameIdentity } = require("./gameNewsCatalog") as typeof import("./gameNewsCatalog");
const { isStaleOrJunkItem, hasDisallowedScript, storyCoreTokens, storyFingerprint, rememberStory, matchesRecentStory, sourceOfficialRank, isSameNewsStory, dedupePreferOfficial, isNearTitleDuplicate } = require("./gameNewsDedupe") as typeof import("./gameNewsDedupe");
const { expandSteamPlaceholders, stripSteamMarkup, stripHtml, cleanArticleBrief, classifyImportance } = require("./gameNewsText") as typeof import("./gameNewsText");
const { fetchArticleExcerpt, resolveArticleBrief, resolveArticleUrl } = require("./gameNewsArticles") as typeof import("./gameNewsArticles");
const { collectGameItems } = require("./gameNewsSources") as typeof import("./gameNewsSources");
const { resolveConfig, loadState, saveState, buildArticleContent, postItem } = require("./gameNewsPost") as typeof import("./gameNewsPost");

const loopStarted = new WeakSet();
let pollInFlight = false;

let recentHydratedOnce = false;

async function hydrateRecentStoriesFromChannel(client?, cfg?, state?) {
  /* gameNewsStoryDedupe2: una volta, importa titoli già in canale → anti-doppio articoli alternativi */
  if (recentHydratedOnce) return 0;
  if ((state.recentStories || []).length >= 10) {
    recentHydratedOnce = true;
    return 0;
  }
  recentHydratedOnce = true;
  try {
    const ch = await client.channels.fetch(cfg.channelId).catch(() => null);
    if (!ch || typeof ch.messages?.fetch !== "function") return 0;
    const msgs = await ch.messages.fetch({ limit: 35 });
    let n = 0;
    const sorted = [...msgs.values()].sort((a?, b?) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
    for (const msg of sorted) {
      if (!msg?.author?.bot) continue;
      const content = String(msg.content || "");
      const m = content.match(/\*\*(.+?)\*\*/);
      const title = m ? String(m[1] || "").trim() : "";
      if (!title || title.length < 8) continue;
      const seedItem = {
        gameKey: "fortnite",
        title,
        summary: content.replace(/\*\*[^*]+\*\*/g, "").slice(0, 200),
        sourceType: "seed_channel",
        url: msg.url || "",
      };
      try {
        const inferred = inferGameKeyFromContent(seedItem);
        if (inferred) seedItem.gameKey = inferred;
        else {
          for (const g of cfg.games || []) {
            const lab = String(g.label || g.key || "").toLowerCase();
            if (lab && title.toLowerCase().includes(lab)) {
              seedItem.gameKey = g.key;
              break;
            }
          }
        }
      } catch (_) {}
      rememberStory(state, seedItem, msg.createdTimestamp || Date.now());
      n += 1;
    }
    return n;
  } catch (err) {
    global.logger?.error?.("[GAME NEWS] hydrate recentStories failed:", err?.message || err);
    return 0;
  }
}

async function runGameNewsPoll(client?) {
  if (pollInFlight) return { skipped: true, reason: "inflight" };
  const cfg = resolveConfig(client);
  if (!cfg.enabled || !cfg.channelId || !cfg.games.length) return { skipped: true, reason: "disabled" };

  pollInFlight = true;
  try {
    const state = await loadState();
    try {
      await hydrateRecentStoriesFromChannel(client, cfg, state);
    } catch (_) {}
    const discovered = [];
    for (const game of cfg.games) {
      const items = await collectGameItems(game);
      for (const item of items) discovered.push(item);
    }

    if (!state.initialized) {
      const now = Date.now();
      for (const item of discovered) {
        state.seen[item.id] = now;
        rememberStory(state, item, now);
      }
      state.initialized = true;
      state.lastPollAt = new Date().toISOString();
      await saveState(state);
      return { ok: true, seeded: true, seen: Object.keys(state.seen).length };
    }

    const nowMs = Date.now();
    let skippedStale = 0;
    let skippedDupStory = 0;
    let skippedWrongGame = 0;
    let reassignedGame = 0;
    const gamesByKey = new Map((cfg.games || []).map((g?) => [g.key, g]));
    /* backfill story: da id già visti ancora in feed (evita re-post terziari dopo Steam) */
    const alreadySeenLive = [];
    for (const item of discovered) {
      if (!state.seen[item.id]) continue;
      rememberStory(state, item, state.seen[item.id]);
      alreadySeenLive.push(item);
    }
    const allNew = [];
    for (const rawItem of discovered) {
      if (state.seen[rawItem.id]) continue;
      const identity = reconcileGameIdentity(rawItem, gamesByKey);
      if (identity.reject) {
        state.seen[rawItem.id] = nowMs;
        skippedWrongGame += 1;
        continue;
      }
      const item = identity.item;
      if (identity.reassigned) {
        reassignedGame += 1;
      }
      const fp = storyFingerprint(item);
      const storyKey = `story:${fp}`;
      if (state.seen[storyKey]) {
        /* stessa storia già postata da altra fonte */
        state.seen[item.id] = nowMs;
        rememberStory(state, item, nowMs);
        skippedDupStory += 1;
        continue;
      }
      /* gameNewsStoryDedupe2: fuzzy vs feed live + ultime storie postate */
      if (
        alreadySeenLive.some((s?) => isSameNewsStory(s, item)) ||
        matchesRecentStory(state, item)
      ) {
        state.seen[item.id] = nowMs;
        rememberStory(state, item, nowMs);
        skippedDupStory += 1;
        continue;
      }
      const stale = isStaleOrJunkItem(item, cfg.maxAgeMs, nowMs);
      if (stale.reject) {
        /* marca come visto così non ripesca eternamente lo stesso scrap vecchio */
        state.seen[item.id] = nowMs;
        skippedStale += 1;
        continue;
      }
      allNew.push(item);
    }

    const { kept: deduped, discarded: dupDiscarded } = dedupePreferOfficial(allNew);
    for (const d of dupDiscarded) {
      state.seen[d.id] = nowMs;
      rememberStory(state, d, nowMs);
      skippedDupStory += 1;
    }

    const toPost = deduped.slice(0, cfg.maxPostsPerPoll);
    const posted = [];
    for (const item of toPost) {
      const fp = storyFingerprint(item);
      try {
        const res = await postItem(client, cfg, item);
        state.seen[item.id] = Date.now();
        rememberStory(state, item, Date.now());
        posted.push({
          id: item.id,
          story: fp,
          gameKey: item.gameKey,
          sourceType: item.sourceType,
          importance: item.importance,
          ok: res.ok,
          reason: res.reason || null,
        });
        await new Promise((r?) => setTimeout(r, 1500));
      } catch (err) {
        global.logger?.error?.("[GAME NEWS] post failed:", item.id, err?.message || err);
        state.seen[item.id] = Date.now();
        rememberStory(state, item, Date.now());
        posted.push({ id: item.id, ok: false, err: err?.message || String(err) });
      }
    }

    state.lastPollAt = new Date().toISOString();
    await saveState(state);
    return {
      ok: true,
      posted: posted.length,
      skippedStale,
      skippedDupStory,
      skippedWrongGame,
      reassignedGame,
      details: posted,
    };
  } finally {
    pollInFlight = false;
  }
}

function startGameNewsAlertLoop(client?) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return;
  if (!client || loopStarted.has(client)) return;
  loopStarted.add(client);
  const cfg = resolveConfig(client);
  if (!cfg.enabled) {
    return;
  }

  const tick = () => {
    runGameNewsPoll(client).catch((err?) => {
      global.logger?.error?.("[GAME NEWS] poll error:", err?.message || err);
    });
  };

  setTimeout(tick, 45_000);
  const timer = setInterval(tick, cfg.pollIntervalMs);
  if (typeof timer.unref === "function") timer.unref();
  client._gameNewsAlertInterval = timer;
}

export = {
  startGameNewsAlertLoop,
  runGameNewsPoll,
  resolveConfig,
  classifyImportance,
  defaultGamesCatalog,
  collectGameItems,
  isStaleOrJunkItem,
  currentEaFcEdition,
  buildArticleContent,
  cleanArticleBrief,
  stripHtml,
  stripSteamMarkup,
  expandSteamPlaceholders,
  hasDisallowedScript,
  resolveArticleUrl,
  storyFingerprint,
  storyCoreTokens,
  sourceOfficialRank,
  dedupePreferOfficial,
  isSameNewsStory,
  matchesRecentStory,
  rememberStory,
  reconcileGameIdentity,
  inferGameKeyFromContent,
  fetchArticleExcerpt,
  resolveArticleBrief,
  isNearTitleDuplicate,
};
