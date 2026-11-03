const { GuildScheduledEventStatus } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { sendJsonWithEtag, weakEtagFromParts } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const CACHE_TTL_MS = 20_000;
const CACHE_SOFT_MS = 12_000;
let cache = { at: 0, payload: null };
let liveEventInflight = null;
let liveEventSoftRefresh = null;

/* siteApiW6: ETag/304 on live-event poll */
function sendLiveEvent(req?, res?, payload?, cacheControl?) {
  const etag = weakEtagFromParts(["live", cache.at || 0, payload?.active ? "1" : "0", payload?.event?.id || ""]);
  return sendJsonWithEtag(req, res, payload, { cacheControl, etag });
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function inviteFallbackUrl() {
  const u = String(IDs.links?.invite || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return "https://discord.gg/viniliecaffe";
}

function eventPageUrl(guildId?, eventId?) {
  return `https://discord.com/events/${guildId}/${eventId}`;
}

function channelUrl(guildId?, channelId?) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function plainDescription(raw?, max?) {
  const cap = Number.isFinite(Number(max)) ? Math.max(40, Math.floor(Number(max))) : 360;
  if (raw == null || raw === "") return "";
  let s = String(raw).replace(/\r\n/g, "\n").trim();
  s = s
    .replace(/\*\*|__/g, "")
    .replace(/~~/g, "")
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/<#[0-9]+>/g, "")
    .replace(/<a?:[^:]+:[0-9]+>/g, "")
    .trim();
  if (s.length > cap) return `${s.slice(0, cap - 1)}…`;
  return s;
}

function eventStartMs(ev?) {
  if (ev?.scheduledStartAt instanceof Date && !Number.isNaN(ev.scheduledStartAt.getTime())) {
    return ev.scheduledStartAt.getTime();
  }
  const t = Number(ev?.scheduledStartTimestamp);
  return Number.isFinite(t) ? t : 0;
}

function eventEndMs(ev?) {
  if (ev?.scheduledEndAt instanceof Date && !Number.isNaN(ev.scheduledEndAt.getTime())) {
    return ev.scheduledEndAt.getTime();
  }
  const t = Number(ev?.scheduledEndTimestamp);
  return Number.isFinite(t) ? t : 0;
}

function isOngoingForSite(ev?, nowMs?) {
  const st = Number(ev?.status);
  if (st === GuildScheduledEventStatus.Active) return true;
  if (st === GuildScheduledEventStatus.Scheduled) {
    const start = eventStartMs(ev);
    if (!start || start > nowMs + 180_000) return false;
    const end = eventEndMs(ev);
    if (end > 0 && end < nowMs - 120_000) return false;
    return true;
  }
  return false;
}

function resolvePrimaryCta(ev?, guildIdStr?) {
  const gid = String(guildIdStr || "");
  const eid = String(ev?.id || "");
  const eventUrl = gid && eid ? eventPageUrl(gid, eid) : inviteFallbackUrl();
  const ch = ev?.channelId ? String(ev.channelId) : "";
  if (ch && gid) {
    return { url: channelUrl(gid, ch), label: "Vai al canale" };
  }
  const loc = ev?.entityMetadata?.location;
  if (loc && /^https?:\/\//i.test(String(loc).trim())) {
    return { url: String(loc).trim(), label: "Apri link evento" };
  }
  return { url: eventUrl, label: "Apri evento su Discord" };
}

async function handleSiteLiveEventGet(client?, req?, res?) {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      /* siteApiW3: soft refresh in background after soft window */
      if (now - cache.at > CACHE_SOFT_MS && !liveEventSoftRefresh) {
        liveEventSoftRefresh = buildLiveEventPayload(client, { force: true })
          .then((payload?) => {
            if (payload) cache = { at: Date.now(), payload };
          })
          .catch(() => null)
          .finally(() => {
            liveEventSoftRefresh = null;
          });
      }
      return sendLiveEvent(req, res, cache.payload, "public, max-age=15");
    }

    if (liveEventInflight) {
      const payload = await liveEventInflight;
      return sendLiveEvent(req, res, payload, "public, max-age=15");
    }

    liveEventInflight = buildLiveEventPayload(client, { force: false })
      .then((payload?) => {
        cache = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        liveEventInflight = null;
      });
    const payload = await liveEventInflight;
    return sendLiveEvent(req, res, payload, "public, max-age=15");
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-live-event:", err);
    if (cache.payload) {
      return sendLiveEvent(req, res, cache.payload, "public, max-age=8");
    }
    return res.status(500).json({ ok: false, active: false, error: "internal" });
  }
}

async function buildLiveEventPayload(client?, { force }: any = {}) {
  const now = Date.now();
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return { ok: true, active: false, inviteUrl: inviteFallbackUrl() };
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: true, active: false, inviteUrl: inviteFallbackUrl() };
  }

  let col = null;
  if (force) {
    col = await guild.scheduledEvents.fetch({ force: true }).catch(() => guild.scheduledEvents.fetch().catch(() => null));
  } else if (guild.scheduledEvents?.cache?.size) {
    col = guild.scheduledEvents.cache;
    setImmediate(() => {
      guild.scheduledEvents.fetch({ force: false }).catch(() => null);
    });
  } else {
    col = await guild.scheduledEvents.fetch({ force: false }).catch(() => null);
  }
  const nowMs = Date.now();
  const ongoing = col ? [...col.values()].filter((e?) => isOngoingForSite(e, nowMs)) : [];

  const inviteUrl = inviteFallbackUrl();

  if (!ongoing.length) {
    return { ok: true, active: false, inviteUrl };
  }

  ongoing.sort((a?, b?) => {
    const pa = Number(a.status) === GuildScheduledEventStatus.Active ? 0 : 1;
    const pb = Number(b.status) === GuildScheduledEventStatus.Active ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return eventStartMs(a) - eventStartMs(b);
  });
  const ev = ongoing[0];
  const gid = String(guild.id);
  const eid = String(ev.id || "");
  const cta = resolvePrimaryCta(ev, gid);
  const desc = plainDescription(ev.description, 400);
  return {
    ok: true,
    active: true,
    inviteUrl,
    event: {
      id: eid,
      name: String(ev.name || "Evento in corso").slice(0, 120),
      description: desc,
      buttonUrl: cta.url,
      buttonLabel: cta.label,
      eventUrl: eid ? eventPageUrl(gid, eid) : inviteUrl,
    },
  };
}

/* siteApiW4: warm cache on site-api boot */
function warmSiteLiveEventCache(client?) {
  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.payload);
  }
  if (liveEventInflight) return liveEventInflight;
  liveEventInflight = buildLiveEventPayload(client, { force: false })
    .then((payload?) => {
      cache = { at: Date.now(), payload };
      return payload;
    })
    .catch((err?) => {
      global.logger?.warn?.("[WEBHOOK] site-live-event warm:", err?.message || err);
      return null;
    })
    .finally(() => {
      liveEventInflight = null;
    });
  return liveEventInflight;
}

export = { handleSiteLiveEventGet, warmSiteLiveEventCache };