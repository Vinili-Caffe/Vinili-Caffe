/** Resoconti settimanali: ore in vocale, canali esclusi e membri del server. */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { wait, getCurrentResocontoPexWeekWindowUtc, dayKeyToWeekdayLabel } = require("./resocontoTime") as typeof import("./resocontoTime");

const RESOCONTO_MEMBER_FETCH_PAGE_LIMIT = 1000;
const RESOCONTO_MEMBER_FETCH_PAGE_DELAY_MS = 400;

const RESOCONTO_PUBLIC_VOICE_NAME_RE = /\b(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)\b/i;

function isResocontoPublicVoiceName(name?) {
  return RESOCONTO_PUBLIC_VOICE_NAME_RE.test(String(name || ""));
}

function isResocontoStanzeChannel(channel?) {
  const stanzeCat = String(IDs.categories?.categoryStanze || "").trim();
  if (!stanzeCat || !channel) return false;
  if (String(channel.parentId || "") === stanzeCat) return true;
  const lobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  if (lobbyId && String(channel.id || "") === lobbyId) return true;
  return false;
}

function collectResocontoVoiceExcludeIds(guild?) {
  const out = new Set();
  const excludeParents = new Set(
    [
      IDs.categories?.categoryPrivate,
      IDs.categories?.categoryStaff,
      IDs.categories?.categoryBench,
      IDs.categories?.categoryLogs,
      IDs.categories?.categorySystem,
      IDs.categories?.categoryReport,
      IDs.categories?.categoryPartner,
      IDs.categories?.categorySponsor,
      IDs.categories?.categoryMidHigh,
    ]
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!guild?.channels?.cache) return out;
  for (const ch of guild.channels.cache.values()) {
    if (!ch?.isVoiceBased?.()) continue;
    const id = String(ch.id || "").trim();
    if (!id) continue;
    if (isResocontoStanzeChannel(ch) || isResocontoPublicVoiceName(ch.name)) continue;
    const parent = String(ch.parentId || "");
    if (parent && excludeParents.has(parent)) {
      out.add(id);
      continue;
    }
    const keyHit = Object.entries(IDs.channels || {}).some(([key, value]) => {
      if (!/^vocprivata/i.test(String(key || ""))) return false;
      return String(value || "").trim() === id;
    });
    if (keyHit) out.add(id);
  }
  return out;
}

function buildResocontoOverviewOptions(guild?, now = new Date()) {
  const scope = buildResocontoActivityScope(guild);
  const { windowStart, windowEndExclusive } = getCurrentResocontoPexWeekWindowUtc(now);
  const rangeEnd = new Date(Math.min(Date.now(), windowEndExclusive.getTime()));
  return {
    ...scope,
    rangeStart: windowStart,
    rangeEnd,
  };
}

function buildResocontoActivityScope(guild?) {
  const includeTextChannelIds = new Set();
      const includeVoiceChannelIds = null;
  const addText = (id?) => {
    const value = String(id || "").trim();
    if (value) includeTextChannelIds.add(value);
  };

  addText(IDs.channels?.chat);
  addText(IDs.channels?.media);
  addText(IDs.channels?.commands);
  addText(IDs.channels?.selfieVerificati);
  addText(IDs.channels?.noMic);

  const publicsCategoryId = String(IDs.categories?.categoryPublics || "").trim();
  const stanzeCategoryId = String(IDs.categories?.categoryStanze || "").trim();
  const countableParents = new Set(
    [publicsCategoryId, stanzeCategoryId].filter(Boolean),
  );

  for (const ch of guild?.channels?.cache?.values?.() || []) {
    const parentId = String(ch?.parentId || "");
    const channelId = String(ch?.id || "").trim();
    if (!channelId) continue;
    const underCountableParent = countableParents.has(parentId);
    const publicVoiceName = isResocontoPublicVoiceName(ch?.name);
    const isStanze = isResocontoStanzeChannel(ch);
    if (ch?.isVoiceBased?.() && (underCountableParent || publicVoiceName || isStanze)) {
            addText(channelId);
    }
  }

    for (const id of Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : []) {
    addText(id);
  }
  for (const [key, value] of Object.entries(IDs.channels || {})) {
    if (!/^(vocale(Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Lounge|Squad)|vocaleduo|trio\d)/i.test(String(key || ""))) continue;
    addText(value);
  }
  addText(IDs.channels?.stanzaLobbyVoice);

  return { includeTextChannelIds, includeVoiceChannelIds };
}

function maxMemberSnowflakeInChunk(chunk?) {
  if (!chunk?.size) return null;
  let max = null;
  for (const id of chunk.keys()) {
    const s = String(id);
    if (!max || BigInt(s) > BigInt(max)) max = s;
  }
  return max;
}

function isGuildMemberCacheLikelyComplete(guild?) {
  const memberCount = Number(guild?.memberCount ?? 0) || 0;
  const cacheSize = Number(guild?.members?.cache?.size ?? 0) || 0;
  return memberCount > 0 && cacheSize >= memberCount;
}

async function fetchGuildMembersByPagesForResoconto(guild?, segment?) {
  if (!guild?.members?.fetch) return 0;
  const guildId = String(guild.id || "");
  const memberCount = Number(guild.memberCount ?? 0) || 0;
  const maxPages = Math.min(50, Math.max(1, Math.ceil((memberCount || 25000) / RESOCONTO_MEMBER_FETCH_PAGE_LIMIT) + 2));
  let after = null;
  let totalFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await guild.members
      .fetch({ limit: RESOCONTO_MEMBER_FETCH_PAGE_LIMIT, after: after ?? undefined, force: true })
      .catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] paged member fetch failed:", {
          guildId,
          segment: segment || null,
          page,
          after: after ?? null,
          err: err?.message || String(err),
          code: err?.code,
        });
        return null;
      });
    if (!chunk?.size) break;

    totalFetched += chunk.size;
    if (chunk.size < RESOCONTO_MEMBER_FETCH_PAGE_LIMIT) break;

    const nextAfter = maxMemberSnowflakeInChunk(chunk);
    if (!nextAfter || String(nextAfter) === String(after ?? "")) {
      global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] paged member fetch cursor stopped:", {
        guildId,
        segment: segment || null,
        page,
        after: after ?? null,
        nextAfter,
      });
      break;
    }
    after = nextAfter;
    await wait(RESOCONTO_MEMBER_FETCH_PAGE_DELAY_MS);
  }

  return totalFetched;
}

const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

function buildCostanzaLines(overview?) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  if (!chart.length) return [];
  const points = chart.slice(-7);
  const maxText = Math.max(1, ...points.map((p?) => Math.max(0, Number(p?.text ?? 0))));
  const bars = points.map((p?) => {
    const text = Math.max(0, Number(p?.text ?? 0));
    const level = maxText > 0 ? Math.min(7, Math.floor((7 * text) / maxText)) : 0;
    return COSTANZA_BARS[level];
  });
  const activeDays = points.filter((p?) => (Number(p?.text ?? 0) > 0) || (Number(p?.voiceSeconds ?? 0) >= 600)).length;
    const dayLines = points.map((p?, idx?) => {
    const label = dayKeyToWeekdayLabel(p?.dayKey);
    const bar = bars[idx] || COSTANZA_BARS[0];
    return `${label} ${bar}`;
  });
  return [
    `<:VC_Clock:1473359204189474886> **Costanza:** __${activeDays}/${points.length}__ giorni attivi`,
    "```",
    ...dayLines,
    "```",
    "messaggi per giorno",
  ];
}

function overviewLooksLikeEmptyFallback(overview?) {
  if (!overview || overview.__error) return true;
  const d7 = overview?.windows?.d7;
  const text = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const voiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  return Boolean(
    overview.approximate === true &&
    text === 0 &&
    voiceSeconds === 0 &&
    (!Array.isArray(overview.topChannelsText) || overview.topChannelsText.length === 0) &&
    (!Array.isArray(overview.topChannelsVoice) || overview.topChannelsVoice.length === 0)
  );
}

function serializeCostanzaChart(overview?) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  return chart
    .slice(-7)
    .map((p?) => ({
      dayKey: String(p?.dayKey || "").trim(),
      text: Math.max(0, Math.floor(Number(p?.text) || 0)),
      voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
    }))
    .filter((p?) => p.dayKey)
    .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

export = { collectResocontoVoiceExcludeIds, buildResocontoOverviewOptions, buildResocontoActivityScope, isGuildMemberCacheLikelyComplete, fetchGuildMembersByPagesForResoconto, buildCostanzaLines, overviewLooksLikeEmptyFallback, serializeCostanzaChart };
