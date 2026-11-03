const { Routes } = require("discord.js") as typeof import("discord.js");
const {
  getTenantPremiumIdentity,
  getTenantPremiumIdentitySync,
  patchTenantPremiumIdentity,
  identityHasCustom,
  ensureTenantPremiumIdentityCacheFresh,
} = require("../core/tenantPremiumIdentity") as typeof import("../core/tenantPremiumIdentity");
const {
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
} = require("../core/tenantPremium") as typeof import("../core/tenantPremium");

async function resolveGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!client || !gid) return null;
  return (
    client.guilds?.cache?.get?.(gid) ||
    (typeof client.guilds?.fetch === "function"
      ? await client.guilds.fetch(gid).catch(() => null)
      : null)
  );
}

async function patchBotGuildIdentity(client, guildId, { nick, avatar, banner }) {
  const body: Record<string, any> = {};
  if (nick !== undefined) body.nick = nick;
  if (avatar !== undefined) body.avatar = avatar;
  if (banner !== undefined) body.banner = banner;
  if (!Object.keys(body).length) return { ok: true };

  const rest = client?._rest || client?.rest;
  if (rest) {
    try {
      await rest.patch(Routes.guildMember(String(guildId), "@me"), { body });
      return { ok: true };
    } catch (err) {
      global.logger?.warn?.("[premiumIdentity] REST patch:", err?.message || err);
    }
  }

  try {
    const guild = await resolveGuild(client, guildId);
    if (guild?.members?.editMe) {
      await guild.members.editMe(body);
      return { ok: true };
    }
  } catch (err) {
    global.logger?.warn?.("[premiumIdentity] editMe:", err?.message || err);
  }
  return { ok: false, reason: "identity_patch_failed" };
}

async function fetchAsDataUri(url?) {
  const target = String(url || "").trim();
  if (!target.startsWith("http")) return null;
  try {
    const res = await fetch(target);
    if (!res.ok) return null;
    const mime = String(res.headers.get("content-type") || "image/png").split(";")[0].trim() || "image/png";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 8_000_000) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function ensureIdentitySnapshotFromDiscord(client?, guildId?) {
  await ensureTenantPremiumIdentityCacheFresh().catch(() => null);
  const existing = getTenantPremiumIdentitySync(guildId);
  if (identityHasCustom(existing)) return existing;

  const guild = await resolveGuild(client, guildId);
  if (!guild) return existing;
  const botId = String(client?.user?.id || "").trim();
  if (!botId) return existing;

  let nick = null;
  let avatarUrl = null;
  let bannerUrl = null;
  const rest = client?._rest || client?.rest;
  if (rest) {
    try {
      const raw = await rest.get(Routes.guildMember(String(guildId), botId));
      if (raw && typeof raw === "object") {
        nick = raw.nick != null ? String(raw.nick) : null;
        if (raw.avatar) {
          avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${botId}/avatars/${raw.avatar}.${String(raw.avatar).startsWith("a_") ? "gif" : "png"}?size=256`;
        }
        if (raw.banner) {
          bannerUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${botId}/banners/${raw.banner}.${String(raw.banner).startsWith("a_") ? "gif" : "png"}?size=512`;
        }
      }
    } catch (_) {}
  }

  if (!avatarUrl && !bannerUrl && !nick) {
    try {
      const me =
        guild.members?.me ||
        (await guild.members.fetch(botId).catch(() => null));
      if (me) {
        nick = me.nickname || null;
        if (me.avatar) {
          avatarUrl = me.displayAvatarURL({ size: 256, extension: "png" });
        }
      }
    } catch (_) {}
  }

  if (!nick && !avatarUrl && !bannerUrl) return existing;

  const avatar = avatarUrl ? await fetchAsDataUri(avatarUrl) : null;
  const banner = bannerUrl ? await fetchAsDataUri(bannerUrl) : null;
  if (!nick && !avatar && !banner) return existing;

  const saved = await patchTenantPremiumIdentity(guildId, {
    nick: nick || null,
    avatar: avatar || null,
    banner: banner || null,
    visuallyApplied: true,
  });
  return saved.ok ? saved.identity : existing;
}

async function suspendPremiumIdentityVisual(client?, guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!client || !gid) return { ok: false, reason: "bad_args" };

  if (opts.snapshotIfMissing !== false) {
    await ensureIdentitySnapshotFromDiscord(client, gid).catch(() => null);
  }

  const identity = await getTenantPremiumIdentity(gid);
  if (!identityHasCustom(identity) && identity.visuallyApplied !== true) {
    return { ok: true, skipped: true, reason: "nothing_to_suspend" };
  }

  const cleared = await patchBotGuildIdentity(client, gid, {
    nick: null,
    avatar: null,
    banner: null,
  });
  if (!cleared.ok) {
    return { ok: false, reason: cleared.reason || "clear_failed" };
  }

  await patchTenantPremiumIdentity(gid, { visuallyApplied: false });
  global.logger?.info?.(`[premiumIdentity] suspended visual guild=${gid}`);
  return { ok: true, suspended: true };
}

async function restorePremiumIdentityVisual(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!client || !gid) return { ok: false, reason: "bad_args" };

  const identity = await getTenantPremiumIdentity(gid);
  if (!identityHasCustom(identity)) {
    return { ok: true, skipped: true, reason: "nothing_to_restore" };
  }

  const body = {
    nick: identity.nick,
    avatar: identity.avatar,
    banner: identity.banner,
  };
    if (body.nick == null && body.avatar == null && body.banner == null) {
    return { ok: true, skipped: true };
  }

  const applied = await patchBotGuildIdentity(client, gid, body);
  if (!applied.ok) {
    return { ok: false, reason: applied.reason || "restore_failed" };
  }

  await patchTenantPremiumIdentity(gid, { visuallyApplied: true });
  global.logger?.info?.(`[premiumIdentity] restored visual guild=${gid}`);
  return { ok: true, restored: true };
}

async function runPremiumIdentityExpirySweep(client?) {
  if (!client) return { checked: 0, suspended: 0 };
  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);
  await ensureTenantPremiumIdentityCacheFresh({ force: true }).catch(() => null);

  const now = Date.now();
  let checked = 0;
  let suspended = 0;

  for (const guild of client.guilds?.cache?.values?.() || []) {
    const gid = String(guild?.id || "").trim();
    if (!gid) continue;
    const premium = getTenantPremiumSync(gid);
        if (premium.active) continue;
        const identity = getTenantPremiumIdentitySync(gid);
    const expiredTimed =
      premium.until != null && Number(premium.until) > 0 && Number(premium.until) <= now;
    const shouldSuspend =
      identity.visuallyApplied === true ||
      (expiredTimed && identityHasCustom(identity));
    if (!shouldSuspend) continue;

    checked += 1;
    const result = await suspendPremiumIdentityVisual(client, gid).catch((err?) => {
      global.logger?.warn?.(
        `[premiumIdentity] suspend failed guild=${gid}:`,
        err?.message || err,
      );
      return null;
    });
    if (result?.suspended) suspended += 1;
  }

  return { checked, suspended };
}

export = {
  patchBotGuildIdentity,
  suspendPremiumIdentityVisual,
  restorePremiumIdentityVisual,
  runPremiumIdentityExpirySweep,
};
