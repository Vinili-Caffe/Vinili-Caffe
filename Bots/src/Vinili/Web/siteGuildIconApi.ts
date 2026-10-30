/**
 * Icona del server main (live) per OG / link preview / thumb.
 * Proxy dei byte CDN Discord → URL stabile sul sito, senza asset fissi in repo.
 */

const FALLBACK_SITE_LOGO = "https://www.viniliecaffe.it/images/logo-disco.png";
const INVITE_CODE = "viniliecaffe";
const CACHE_TTL_MS = 60_000;

type IconCache = { at: number; size: number; forceStatic: boolean; contentType: string; buf: Buffer };
let cached: IconCache | null = null;

function parseSize(raw?: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 512;
  const allowed = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
  let best = 512;
  for (const a of allowed) {
    if (a <= n) best = a;
  }
  return best;
}

function iconUrlFromGuildParts(guildId: string, icon: string, size: number, forceStatic: boolean) {
  const id = String(guildId || "").trim();
  const hash = String(icon || "").trim();
  if (!id || !hash || !/^\d{16,22}$/.test(id)) return null;
  const animated = hash.startsWith("a_");
  const ext = animated && !forceStatic ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${hash}.${ext}?size=${size}`;
}

async function resolveIconTarget(client?, { size = 512, forceStatic = false } = {}) {
  const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
  const { guildIconUrl } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
  const guildId = String(client?.config?.mainGuildId || IDs?.guilds?.main || "").trim();
  const guild = guildId && client?.guilds?.cache?.get?.(guildId) ? client.guilds.cache.get(guildId) : null;
  if (guild?.icon) {
    let url = guildIconUrl(guild, { size });
    if (url && forceStatic) url = String(url).replace(/\.gif(\?|$)/i, ".png$1");
    if (url) return url;
  }

  try {
    const r = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(INVITE_CODE)}?with_counts=true`,
      { headers: { Accept: "application/json" } },
    );
    if (r.ok) {
      const j = (await r.json()) as { guild?: { id?: string; icon?: string } };
      const fromInvite = iconUrlFromGuildParts(
        String(j?.guild?.id || guildId || ""),
        String(j?.guild?.icon || ""),
        size,
        forceStatic,
      );
      if (fromInvite) return fromInvite;
    }
  } catch (_) {}

  return FALLBACK_SITE_LOGO;
}

async function fetchIconBytes(targetUrl: string) {
  const upstream = await fetch(targetUrl, {
    headers: { Accept: "image/*,*/*;q=0.8" },
    redirect: "follow",
  });
  if (!upstream.ok) return null;
  const contentType =
    String(upstream.headers.get("content-type") || "").split(";")[0].trim() || "image/png";
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (!buf.length) return null;
  return { buf, contentType };
}

async function handleSiteGuildIconGet(client?, req?, res?) {
  try {
    const size = parseSize(req?.query?.size);
    const forceStatic = ["1", "true", "png", "still"].includes(
      String(req?.query?.static || req?.query?.format || "")
        .trim()
        .toLowerCase(),
    );
    const redirectOnly = ["1", "true", "yes"].includes(
      String(req?.query?.redirect || "").trim().toLowerCase(),
    );

    const target = (await resolveIconTarget(client, { size, forceStatic })) || FALLBACK_SITE_LOGO;

    if (redirectOnly) {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.redirect(302, target);
    }

    const now = Date.now();
    const sendImage = (contentType: string, buf: Buffer) => {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(buf.length));
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (String(req?.method || "").toUpperCase() === "HEAD") {
        return res.status(200).end();
      }
      return res.status(200).send(buf);
    };

    if (
      cached &&
      now - cached.at < CACHE_TTL_MS &&
      cached.size === size &&
      cached.forceStatic === forceStatic
    ) {
      return sendImage(cached.contentType, cached.buf);
    }

    let packed = await fetchIconBytes(target);
    if (!packed && target !== FALLBACK_SITE_LOGO) {
      packed = await fetchIconBytes(FALLBACK_SITE_LOGO);
    }
    if (!packed?.buf) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.redirect(302, FALLBACK_SITE_LOGO);
    }

    cached = {
      at: now,
      size,
      forceStatic,
      contentType: packed.contentType,
      buf: packed.buf,
    };

    return sendImage(packed.contentType, packed.buf);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-guild-icon:", err);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.redirect(302, FALLBACK_SITE_LOGO);
  }
}

export = { handleSiteGuildIconGet, resolveIconTarget, FALLBACK_SITE_LOGO };
