const { GuildScheduledEventStatus } = require("discord.js");
const IDs = require("../Config/ids");

const CACHE_TTL_MS = 5000;
let cache = { at: 0, payload: null };

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function inviteFallbackUrl() {
  const u = String(IDs.links?.invite || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return "https://discord.gg/viniliecaffe";
}

function eventPageUrl(guildId, eventId) {
  return `https://discord.com/events/${guildId}/${eventId}`;
}

function channelUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function plainDescription(raw, max) {
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

function eventStartMs(ev) {
  if (ev?.scheduledStartAt instanceof Date && !Number.isNaN(ev.scheduledStartAt.getTime())) {
    return ev.scheduledStartAt.getTime();
  }
  const t = Number(ev?.scheduledStartTimestamp);
  return Number.isFinite(t) ? t : 0;
}

function eventEndMs(ev) {
  if (ev?.scheduledEndAt instanceof Date && !Number.isNaN(ev.scheduledEndAt.getTime())) {
    return ev.scheduledEndAt.getTime();
  }
  const t = Number(ev?.scheduledEndTimestamp);
  return Number.isFinite(t) ? t : 0;
}

/** Attivo Discord, oppure ancora “programmato” ma con orario di inizio già passato (spesso prima che passi ad Active). */
function isOngoingForSite(ev, nowMs) {
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

function resolvePrimaryCta(ev, guildIdStr) {
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

/**
 * GET JSON evento Discord programmato **in corso** (status Active) per popup sul sito.
 */
async function handleSiteLiveEventGet(client, req, res) {
  try {
    const now = Date.now();
    if (cache.payload && now - cache.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=8");
      return res.json(cache.payload);
    }

    const guildId = resolveGuildId(client);
    if (!guildId) {
      const empty = { ok: true, active: false, inviteUrl: inviteFallbackUrl() };
      cache = { at: now, payload: empty };
      res.setHeader("Cache-Control", "public, max-age=15");
      return res.json(empty);
    }

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      const empty = { ok: true, active: false, inviteUrl: inviteFallbackUrl() };
      cache = { at: now, payload: empty };
      res.setHeader("Cache-Control", "public, max-age=15");
      return res.json(empty);
    }

    const col = await guild.scheduledEvents.fetch({ force: true }).catch(() => guild.scheduledEvents.fetch().catch(() => null));
    const nowMs = Date.now();
    const ongoing = col ? [...col.values()].filter((e) => isOngoingForSite(e, nowMs)) : [];

    const inviteUrl = inviteFallbackUrl();

    if (!ongoing.length) {
      const payload = { ok: true, active: false, inviteUrl };
      cache = { at: now, payload };
      res.setHeader("Cache-Control", "public, max-age=8");
      return res.json(payload);
    }

    ongoing.sort((a, b) => {
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
    const payload = {
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
    cache = { at: now, payload };
    res.setHeader("Cache-Control", "public, max-age=8");
    return res.json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-live-event:", err);
    return res.status(500).json({ ok: false, active: false, error: "internal" });
  }
}

module.exports = { handleSiteLiveEventGet };