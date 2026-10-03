const crypto = require("node:crypto");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const IDs = require("../../Utils/Config/ids");
const {
  getClientGuildCached,
  getGuildMemberCached,
  addRolesAndGetMember,
} = require("../../Utils/Interaction/interactionEntityCache");
const { normalizeSlug, resolveConfig: resolveKickLiveConfig } = require("./kickLiveAlertService");

const STATE_KEY = "kickSubSync.v1";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
const KICK_API = "https://api.kick.com/public/v1";
const KICK_PUBLIC_KEY_URL = `${KICK_API}/public-key`;
const OAUTH_SCOPES = "user:read";
const EVENT_NAMES = [
  { name: "channel.subscription.new", version: 1 },
  { name: "channel.subscription.renewal", version: 1 },
  { name: "channel.subscription.gifts", version: 1 },
    { name: "chat.message.sent", version: 1 },
];

const loopStarted = new WeakSet();
let appTokenCache = { accessToken: "", expiresAt: 0 };
let publicKeyCache = { pem: "", at: 0 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientKickHttp(status, bodyText) {
  const st = Number(status) || 0;
  if (st >= 500 || st === 429 || st === 408) return true;
  const t = String(bodyText || "").toLowerCase();
  return (
    t.includes("deadline_exceeded") ||
    t.includes("context deadline exceeded") ||
    t.includes("timeout") ||
    t.includes("temporarily unavailable") ||
    t.includes("service unavailable")
  );
}

async function fetchKickHttp(url, options, timeoutMs = 20_000) {
  if (typeof AbortController === "undefined") {
    return fetch(url, options);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try {
      ctrl.abort();
    } catch (_) {}
  }, timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function emptyState() {
  return {
    linksByDiscord: {},
    linksByKick: {},
    subsByKick: {},
    modsByKick: {},
    oauthPending: {},
    pendingClaims: {},
    processedEvents: {},
    eventSubscriptionIds: [],
    broadcasterUserId: null,
    updatedAt: Date.now(),
  };
}

async function loadState() {
  const raw = await getBotState(STATE_KEY, null);
  if (!raw || typeof raw !== "object") return emptyState();
  return {
    ...emptyState(),
    ...raw,
    linksByDiscord: raw.linksByDiscord && typeof raw.linksByDiscord === "object" ? raw.linksByDiscord : {},
    linksByKick: raw.linksByKick && typeof raw.linksByKick === "object" ? raw.linksByKick : {},
    subsByKick: raw.subsByKick && typeof raw.subsByKick === "object" ? raw.subsByKick : {},
    modsByKick: raw.modsByKick && typeof raw.modsByKick === "object" ? raw.modsByKick : {},
    oauthPending: raw.oauthPending && typeof raw.oauthPending === "object" ? raw.oauthPending : {},
    pendingClaims: raw.pendingClaims && typeof raw.pendingClaims === "object" ? raw.pendingClaims : {},
    processedEvents: raw.processedEvents && typeof raw.processedEvents === "object" ? raw.processedEvents : {},
    eventSubscriptionIds: Array.isArray(raw.eventSubscriptionIds) ? raw.eventSubscriptionIds : [],
  };
}

async function saveState(state) {
  const next = { ...state, updatedAt: Date.now() };
  await setBotState(STATE_KEY, next);
  return next;
}

function resolveSubSyncConfig(client) {
  const raw =
    client?.config?.kickSubscriberSync && typeof client.config.kickSubscriberSync === "object"
      ? client.config.kickSubscriberSync
      : {};
  const live = resolveKickLiveConfig(client);
  const streamerSlug = normalizeSlug(raw.streamerSlug || live.streamers?.[0]?.slug || "diunk17");
  const roleId = String(raw.roleId || IDs.roles?.KickSub || process.env.KICK_SUB_ROLE_ID || "").trim();
  const moderatorRoleId = String(
    raw.moderatorRoleId || IDs.roles?.KickModerator || process.env.KICK_MOD_ROLE_ID || "",
  ).trim();
  const clientId = String(process.env.KICK_CLIENT_ID || live.clientId || "").trim();
  const clientSecret = String(process.env.KICK_CLIENT_SECRET || live.clientSecret || "").trim();
  const redirectUri = String(
    process.env.KICK_OAUTH_REDIRECT_URI ||
      raw.redirectUri ||
      "https://www.viniliecaffe.it/webhooks/site-kick-sub/oauth-callback",
  ).trim();
  const graceHours = Math.max(0, Math.min(168, Number(raw.graceHours ?? 48) || 48));
    const moderatorGraceHours = Math.max(
    24,
    Math.min(720, Number(raw.moderatorGraceHours ?? 336) || 336),
  );
  const reconcileIntervalMs = Math.max(
    60_000,
    Math.min(60 * 60_000, Number(raw.reconcileIntervalMs) || 15 * 60_000),
  );
  return {
    enabled: raw.enabled !== false,
    roleId,
    moderatorRoleId,
    streamerSlug,
    clientId,
    clientSecret,
    redirectUri,
    graceMs: graceHours * 60 * 60 * 1000,
    moderatorGraceMs: moderatorGraceHours * 60 * 60 * 1000,
    reconcileIntervalMs,
    broadcasterUserId: raw.broadcasterUserId != null ? Number(raw.broadcasterUserId) : null,
  };
}

function base64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function getAppAccessToken(cfg, opts = {}) {
  const now = Date.now();
  if (appTokenCache.accessToken && now < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.accessToken;
  }
  const attempts = Math.max(1, Math.min(5, Number(opts.attempts) || 4));
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchKickHttp(
        KICK_TOKEN_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
        },
        22_000,
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        if (isTransientKickHttp(res.status, t) && i < attempts - 1) {
          await sleep(1500 + i * 2000);
          continue;
        }
        throw new Error(`Kick app token HTTP ${res.status} ${t.slice(0, 180)}`);
      }
      const data = await res.json().catch(() => ({}));
      const accessToken = String(data.access_token || "").trim();
      const expiresIn = Math.max(300, Math.floor(Number(data.expires_in) || 3600));
      if (!accessToken) throw new Error("Kick app token missing");
      appTokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
      return accessToken;
    } catch (err) {
      lastErr = err;
      const transient =
        err?.name === "AbortError" ||
        /abort|timeout|network|fetch failed|econnreset|enotfound|etimedout/i.test(
          String(err?.message || err?.cause?.message || ""),
        );
      if (transient && i < attempts - 1) {
        await sleep(1500 + i * 2000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("Kick app token unavailable");
}

async function exchangeAuthorizationCode(cfg, code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code_verifier: codeVerifier,
    code: String(code || "").trim(),
  });
  const res = await fetch(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kick code exchange HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchKickUserMe(accessToken) {
  const res = await fetch(`${KICK_API}/users`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Kick users HTTP ${res.status} ${t.slice(0, 180)}`);
  }
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows[0] || null;
}

async function resolveBroadcasterUserId(cfg, state) {
  if (Number.isFinite(Number(cfg.broadcasterUserId)) && Number(cfg.broadcasterUserId) > 0) {
    return Number(cfg.broadcasterUserId);
  }
  if (Number.isFinite(Number(state.broadcasterUserId)) && Number(state.broadcasterUserId) > 0) {
    return Number(state.broadcasterUserId);
  }
  try {
    const { execFile } = require("node:child_process");
    const { promisify } = require("node:util");
    const path = require("node:path");
    const execFileAsync = promisify(execFile);
    const script = path.join(__dirname, "../../Scripts/kickChannelLookup.py");
    const result = await execFileAsync("python3", [script, cfg.streamerSlug], {
      timeout: 25_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const parsed = JSON.parse(String(result.stdout || "").trim() || "{}");
    const uid = Number(parsed?.data?.user_id || parsed?.data?.user?.id || 0);
    if (uid > 0) return uid;
  } catch (err) {
    global.logger?.warn?.("[KICK SUB] broadcaster resolve failed:", err?.message || err);
  }
  return null;
}

async function ensureEventSubscriptions(cfg, state) {
  if (!cfg.clientId || !cfg.clientSecret) return state;
  const broadcasterUserId = await resolveBroadcasterUserId(cfg, state);
  if (!broadcasterUserId) {
    global.logger?.warn?.("[KICK SUB] missing broadcasterUserId — skip event subscribe");
    return state;
  }
  state.broadcasterUserId = broadcasterUserId;
  const token = await getAppAccessToken(cfg);

    try {
    const listRes = await fetch(`${KICK_API}/events/subscriptions`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const listJson = await listRes.json().catch(() => ({}));
    const existing = Array.isArray(listJson?.data) ? listJson.data : [];
    const ids = existing.map((r) => String(r.id || r.subscription_id || "").trim()).filter(Boolean);
    if (ids.length) {
      const qs = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      await fetch(`${KICK_API}/events/subscriptions?${qs}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }
  } catch (err) {
    global.logger?.warn?.("[KICK SUB] event unsubscribe:", err?.message || err);
  }

  const res = await fetch(`${KICK_API}/events/subscriptions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      method: "webhook",
      events: EVENT_NAMES,
    }),
  });
  const text = await res.text().catch(() => "");
  let data = {};
  try {
    data = JSON.parse(text || "{}");
  } catch (_) {}
  if (!res.ok) {
    global.logger?.warn?.("[KICK SUB] event subscribe HTTP", res.status, text.slice(0, 240));
    return state;
  }
  const rows = Array.isArray(data?.data) ? data.data : [];
  const ids = rows.map((r) => String(r.subscription_id || r.id || "").trim()).filter(Boolean);
  if (ids.length) state.eventSubscriptionIds = ids;
  return state;
}

const KICK_PUBLIC_KEY_FALLBACK = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

function normalizePem(pem) {
  let s = String(pem || "").trim();
  if (!s) return "";
  if (s.includes("\\n")) s = s.replace(/\\n/g, "\n");
  return s;
}

async function getKickPublicKeyPem() {
  const now = Date.now();
  if (publicKeyCache.pem && now - publicKeyCache.at < 6 * 60 * 60 * 1000) {
    return publicKeyCache.pem;
  }
  try {
    const res = await fetch(KICK_PUBLIC_KEY_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Kick public-key HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const pem = normalizePem(data?.data?.public_key || data?.public_key || "");
    if (!pem.includes("BEGIN PUBLIC KEY")) throw new Error("Kick public key missing");
    publicKeyCache = { pem, at: now };
    return pem;
  } catch (err) {
    global.logger?.warn?.("[KICK SUB] public key fetch failed, using fallback:", err?.message || err);
    const pem = normalizePem(KICK_PUBLIC_KEY_FALLBACK);
    publicKeyCache = { pem, at: now };
    return pem;
  }
}

function verifyKickWebhookSignature({ messageId, timestamp, signature, rawBody, publicKeyPem }) {
  const mid = String(messageId || "").trim();
  const ts = String(timestamp || "").trim();
  const sig = String(signature || "").trim().replace(/\s+/g, "");
  const pem = normalizePem(publicKeyPem);
  if (!mid || !ts || !sig || rawBody == null || !pem) return false;

  const bodies = [];
  if (Buffer.isBuffer(rawBody)) {
    bodies.push(rawBody.toString("utf8"));
    bodies.push(rawBody);
  } else {
    bodies.push(String(rawBody));
  }

  let sigBuf;
  try {
    sigBuf = Buffer.from(sig, "base64");
  } catch (_) {
    return false;
  }
  if (!sigBuf.length) return false;

  for (const body of bodies) {
    try {
      const payload = Buffer.isBuffer(body)
        ? Buffer.concat([Buffer.from(`${mid}.${ts}.`, "utf8"), body])
        : `${mid}.${ts}.${body}`;
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(payload);
      verifier.end();
      if (verifier.verify(pem, sigBuf)) return true;
    } catch (_) {}
  }
  return false;
}

function parseExpiryMs(value) {
  const t = Date.parse(String(value || ""));
  return Number.isFinite(t) ? t : 0;
}

function isSubActive(sub, graceMs) {
  if (!sub) return false;
  const exp = Number(sub.expiresAt) || 0;
  if (!exp) return true;
  return Date.now() <= exp + Math.max(0, graceMs || 0);
}

async function grantKickSubRole(client, discordUserId, reason) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.roleId || !/^\d{16,22}$/.test(cfg.roleId)) return { ok: false, error: "role_missing" };
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) return { ok: false, error: "guild_missing" };
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, error: "guild_unavailable" };
  const before = await getGuildMemberCached(guild, discordUserId, { preferFresh: true }).catch(() => null);
  if (!before) return { ok: false, error: "member_missing" };
  const alreadyHad = before.roles.cache.has(cfg.roleId);
  const member = await addRolesAndGetMember(guild, discordUserId, [cfg.roleId]);
  if (!member) return { ok: false, error: "member_missing" };
    if (!alreadyHad) {
    global.logger?.info?.("[KICK SUB] role granted", discordUserId, reason || "");
  }
  return { ok: true, skipped: alreadyHad };
}

async function revokeKickSubRole(client, discordUserId, reason) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.roleId) return { ok: false, error: "role_missing" };
  const guildId = String(IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, error: "guild_unavailable" };
  const member = await getGuildMemberCached(guild, discordUserId, { preferFresh: true }).catch(() => null);
  if (!member) return { ok: false, error: "member_missing" };
  if (!member.roles.cache.has(cfg.roleId)) return { ok: true, skipped: true };
  await member.roles.remove(cfg.roleId, reason || "Kick sub scaduto").catch(() => {});
  global.logger?.info?.("[KICK SUB] role revoked", discordUserId, reason || "");
  return { ok: true };
}

async function grantKickModRole(client, discordUserId, reason) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.moderatorRoleId || !/^\d{16,22}$/.test(cfg.moderatorRoleId)) {
    return { ok: false, error: "mod_role_missing" };
  }
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) return { ok: false, error: "guild_missing" };
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, error: "guild_unavailable" };
  const before = await getGuildMemberCached(guild, discordUserId, { preferFresh: true }).catch(() => null);
  if (!before) return { ok: false, error: "member_missing" };
  const alreadyHad = before.roles.cache.has(cfg.moderatorRoleId);
  const member = await addRolesAndGetMember(guild, discordUserId, [cfg.moderatorRoleId]);
  if (!member) return { ok: false, error: "member_missing" };
  if (!alreadyHad) {
    global.logger?.info?.("[KICK MOD] role granted", discordUserId, reason || "");
  }
  return { ok: true, skipped: alreadyHad };
}

async function revokeKickModRole(client, discordUserId, reason) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.moderatorRoleId) return { ok: false, error: "mod_role_missing" };
  const guildId = String(IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, error: "guild_unavailable" };
  const member = await getGuildMemberCached(guild, discordUserId, { preferFresh: true }).catch(() => null);
  if (!member) return { ok: false, error: "member_missing" };
  if (!member.roles.cache.has(cfg.moderatorRoleId)) return { ok: true, skipped: true };
  await member.roles.remove(cfg.moderatorRoleId, reason || "Kick mod scaduto").catch(() => {});
  global.logger?.info?.("[KICK MOD] role revoked", discordUserId, reason || "");
  return { ok: true };
}

function isModActive(mod, graceMs) {
  if (!mod) return false;
  const exp = Number(mod.expiresAt) || 0;
  if (!exp) return true;
  return Date.now() <= exp + Math.max(0, graceMs || 0);
}

function upsertModRecord(state, kickUserId, meta, graceMs) {
  const kid = String(kickUserId || "").trim();
  if (!kid) return state;
  const prev = state.modsByKick[kid] || {};
  const ttl = Math.max(24 * 60 * 60 * 1000, Number(graceMs) || 14 * 24 * 60 * 60 * 1000);
  state.modsByKick[kid] = {
    kickUsername: String(meta.kickUsername || prev.kickUsername || "").trim() || null,
    source: String(meta.source || prev.source || "chat.badge.moderator").trim(),
    lastSeenAt: Date.now(),
    expiresAt: Date.now() + ttl,
    updatedAt: Date.now(),
  };
  return state;
}

async function syncDiscordRoleForKickUser(client, state, kickUserId) {
  const cfg = resolveSubSyncConfig(client);
  const kid = String(kickUserId || "").trim();
  if (!kid) return state;
  const discordUserId = String(state.linksByKick[kid] || "").trim();
  if (!discordUserId) return state;
  const sub = state.subsByKick[kid] || null;
  if (isSubActive(sub, cfg.graceMs)) {
    await grantKickSubRole(client, discordUserId, `kick sub active ${kid}`);
  } else if (sub) {
    await revokeKickSubRole(client, discordUserId, `kick sub expired ${kid}`);
  }
  const mod = state.modsByKick[kid] || null;
  if (cfg.moderatorRoleId) {
    if (isModActive(mod, 0)) {
      await grantKickModRole(client, discordUserId, `kick mod active ${kid}`);
    } else if (mod) {
      await revokeKickModRole(client, discordUserId, `kick mod expired ${kid}`);
    }
  }
  return state;
}

function upsertSubRecord(state, kickUserId, meta) {
  const kid = String(kickUserId || "").trim();
  if (!kid) return state;
  const prev = state.subsByKick[kid] || {};
  const expiresAt = parseExpiryMs(meta.expiresAt) || Number(prev.expiresAt) || 0;
  state.subsByKick[kid] = {
    kickUsername: String(meta.kickUsername || prev.kickUsername || "").trim() || null,
    duration: Number(meta.duration) || Number(prev.duration) || 0,
    expiresAt,
    source: String(meta.source || prev.source || "webhook").trim(),
    updatedAt: Date.now(),
  };
  return state;
}

function rememberProcessedEvent(state, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  if (state.processedEvents[id]) return true;
  state.processedEvents[id] = Date.now();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [k, at] of Object.entries(state.processedEvents)) {
    if (Number(at) < cutoff) delete state.processedEvents[k];
  }
  return false;
}

async function handleSubscriptionEvent(client, eventType, payload, messageId) {
  let state = await loadState();
  if (rememberProcessedEvent(state, messageId)) {
    await saveState(state);
    return { ok: true, deduped: true };
  }

  if (eventType === "channel.subscription.new" || eventType === "channel.subscription.renewal") {
    const sub = payload?.subscriber || {};
    const kickUserId = String(sub.user_id || "").trim();
    upsertSubRecord(state, kickUserId, {
      kickUsername: sub.username,
      duration: payload?.duration,
      expiresAt: payload?.expires_at,
      source: eventType,
    });
    state = await syncDiscordRoleForKickUser(client, state, kickUserId);
  } else if (eventType === "channel.subscription.gifts") {
    const giftees = Array.isArray(payload?.giftees) ? payload.giftees : [];
    for (const g of giftees) {
      const kickUserId = String(g?.user_id || "").trim();
      upsertSubRecord(state, kickUserId, {
        kickUsername: g?.username,
        duration: 1,
        expiresAt: payload?.expires_at,
        source: eventType,
      });
      state = await syncDiscordRoleForKickUser(client, state, kickUserId);
    }
  } else if (eventType === "chat.message.sent") {
    const cfg = resolveSubSyncConfig(client);
    const sender = payload?.sender && typeof payload.sender === "object" ? payload.sender : {};
    const kickUserId = String(sender.user_id ?? sender.id ?? "").trim();
    const badges = Array.isArray(sender?.identity?.badges) ? sender.identity.badges : [];
    const subBadge = badges.find((b) => {
      const t = String(b?.type || "").toLowerCase();
            return t === "subscriber" || t === "founder";
    });
    const modBadge = badges.find((b) => {
      const t = String(b?.type || "").toLowerCase();
      return t === "moderator" || t === "broadcaster";
    });
    const linked = Boolean(kickUserId && state.linksByKick[kickUserId]);
    let subBadgeHit = false;
    let modBadgeHit = false;
    if (kickUserId && subBadge) {
      subBadgeHit = true;
      const months = Math.max(1, Math.min(36, Number(subBadge.count) || 1));
      const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
      upsertSubRecord(state, kickUserId, {
        kickUsername: sender.username,
        duration: months,
        expiresAt,
        source: `chat.badge.${String(subBadge.type || "subscriber").toLowerCase()}`,
      });
      if (linked) {
        state = await syncDiscordRoleForKickUser(client, state, kickUserId);
        const discordUserId = String(state.linksByKick[kickUserId] || "").trim();
        if (discordUserId && state.pendingClaims?.[discordUserId]) {
          delete state.pendingClaims[discordUserId];
        }
      }
    }
    if (kickUserId && modBadge && cfg.moderatorRoleId) {
      modBadgeHit = true;
      upsertModRecord(
        state,
        kickUserId,
        {
          kickUsername: sender.username,
          source: `chat.badge.${String(modBadge.type || "moderator").toLowerCase()}`,
        },
        cfg.moderatorGraceMs,
      );
      if (linked) {
        state = await syncDiscordRoleForKickUser(client, state, kickUserId);
      }
    }
    await saveState(state);
    return {
      ok: true,
      linked,
      subBadge: subBadgeHit,
      modBadge: modBadgeHit,
      roleGranted:
        linked &&
        ((subBadgeHit && isSubActive(state.subsByKick[kickUserId], cfg.graceMs)) ||
          (modBadgeHit && isModActive(state.modsByKick[kickUserId], 0))),
    };
  }

  await saveState(state);
  return { ok: true };
}

async function createLinkAuthorizeUrl(client, discordUserId) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.enabled) throw new Error("disabled");
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("kick_credentials_missing");
  if (!cfg.redirectUri) throw new Error("redirect_missing");

  const state = await loadState();
  const cutoff = Date.now() - 20 * 60 * 1000;
  for (const [k, v] of Object.entries(state.oauthPending)) {
    if (Number(v?.createdAt) < cutoff) delete state.oauthPending[k];
  }

  const nonce = base64Url(crypto.randomBytes(24));
  const pkce = createPkcePair();
  state.oauthPending[nonce] = {
    discordUserId: String(discordUserId),
    codeVerifier: pkce.verifier,
    createdAt: Date.now(),
  };
  await saveState(state);

  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: OAUTH_SCOPES,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: nonce,
  });
  return `${KICK_AUTHORIZE_URL}?${q.toString()}`;
}

async function completeOAuthLink(client, { code, stateNonce }) {
  const cfg = resolveSubSyncConfig(client);
  let state = await loadState();
  const pending = state.oauthPending[String(stateNonce || "")];
  if (!pending?.discordUserId || !pending?.codeVerifier) {
    return { ok: false, error: "invalid_state", status: 400 };
  }
  if (Date.now() - Number(pending.createdAt || 0) > 20 * 60 * 1000) {
    delete state.oauthPending[String(stateNonce)];
    await saveState(state);
    return { ok: false, error: "state_expired", status: 400 };
  }

  const tokenPack = await exchangeAuthorizationCode(cfg, code, pending.codeVerifier);
  const accessToken = String(tokenPack?.access_token || "").trim();
  if (!accessToken) return { ok: false, error: "token_missing", status: 502 };

  const kickUser = await fetchKickUserMe(accessToken);
  const kickUserId = String(kickUser?.user_id || kickUser?.id || "").trim();
  const kickUsername = String(kickUser?.name || kickUser?.username || "").trim();
  if (!kickUserId) return { ok: false, error: "kick_user_missing", status: 502 };

  const discordUserId = String(pending.discordUserId);
  delete state.oauthPending[String(stateNonce)];

  const prevDiscord = String(state.linksByKick[kickUserId] || "").trim();
  if (prevDiscord && prevDiscord !== discordUserId) {
    delete state.linksByDiscord[prevDiscord];
    await revokeKickSubRole(client, prevDiscord, "Kick account ricollegato altrove");
    await revokeKickModRole(client, prevDiscord, "Kick account ricollegato altrove");
  }
  const prevKick = String(state.linksByDiscord[discordUserId]?.kickUserId || "").trim();
  if (prevKick && prevKick !== kickUserId) {
    delete state.linksByKick[prevKick];
  }

  state.linksByDiscord[discordUserId] = {
    kickUserId,
    kickUsername: kickUsername || null,
    linkedAt: Date.now(),
  };
  state.linksByKick[kickUserId] = discordUserId;
  state = await syncDiscordRoleForKickUser(client, state, kickUserId);
  await saveState(state);

  const active = isSubActive(state.subsByKick[kickUserId], cfg.graceMs);
  const modActive = isModActive(state.modsByKick[kickUserId], 0);
  return {
    ok: true,
    status: 200,
    kickUserId,
    kickUsername,
    discordUserId,
    subActive: active,
    modActive,
    roleGranted: active,
    modRoleGranted: modActive,
  };
}

async function getLinkStatus(client, discordUserId) {
  const cfg = resolveSubSyncConfig(client);
  const state = await loadState();
  const link = state.linksByDiscord[String(discordUserId)] || null;
  if (!link?.kickUserId) {
    return { ok: true, linked: false, roleId: cfg.roleId, moderatorRoleId: cfg.moderatorRoleId };
  }
  const sub = state.subsByKick[String(link.kickUserId)] || null;
  const mod = state.modsByKick[String(link.kickUserId)] || null;
  return {
    ok: true,
    linked: true,
    kickUserId: link.kickUserId,
    kickUsername: link.kickUsername || null,
    linkedAt: link.linkedAt || null,
    subActive: isSubActive(sub, cfg.graceMs),
    modActive: isModActive(mod, 0),
    expiresAt: sub?.expiresAt || null,
    roleId: cfg.roleId,
    moderatorRoleId: cfg.moderatorRoleId,
  };
}

async function unlinkKickAccount(client, discordUserId) {
  const state = await loadState();
  const uid = String(discordUserId);
  const link = state.linksByDiscord[uid];
  if (!link?.kickUserId) return { ok: true, unlinked: false };
  const kid = String(link.kickUserId);
  delete state.linksByDiscord[uid];
  if (state.linksByKick[kid] === uid) delete state.linksByKick[kid];
  await saveState(state);
  await revokeKickSubRole(client, uid, "Kick scollegato");
  await revokeKickModRole(client, uid, "Kick scollegato");
  return { ok: true, unlinked: true };
}

async function reconcileKickSubRoles(client) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.enabled || !cfg.roleId) return;
  let state = await loadState();
  for (const kickUserId of Object.keys(state.linksByKick || {})) {
    state = await syncDiscordRoleForKickUser(client, state, kickUserId);
  }
  await saveState(state);
}

async function bootstrapKickEventSubscriptions(client) {
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.enabled || !cfg.roleId || !cfg.clientId || !cfg.clientSecret) return false;
  try {
    let state = await loadState();
    state = await ensureEventSubscriptions(cfg, state);
    await saveState(state);
    client._kickSubBootstrapOk = true;
    client._kickSubBootstrapRetryCount = 0;
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    const transient = isTransientKickHttp(500, msg) || /deadline_exceeded|timeout|abort|network/i.test(msg);
    global.logger?.warn?.(
      transient
        ? "[KICK SUB] bootstrap subscribe: Kick OAuth temporaneamente lento — riprovo in background."
        : "[KICK SUB] bootstrap subscribe:",
      msg,
    );
    return false;
  }
}

function scheduleKickSubBootstrapRetry(client) {
  if (!client || client._kickSubBootstrapOk || client._kickSubBootstrapRetryTimer) return;
  const n = Math.max(0, Number(client._kickSubBootstrapRetryCount) || 0);
  const delayMs = Math.min(3_600_000, Math.max(90_000, 90_000 * 2 ** Math.min(n, 4)));
  client._kickSubBootstrapRetryTimer = setTimeout(async () => {
    client._kickSubBootstrapRetryTimer = null;
    client._kickSubBootstrapRetryCount = n + 1;
    const ok = await bootstrapKickEventSubscriptions(client);
    if (!ok) scheduleKickSubBootstrapRetry(client);
  }, delayMs);
  client._kickSubBootstrapRetryTimer.unref?.();
}

async function startKickSubscriberSyncLoop(client) {
  if (!client || loopStarted.has(client)) return;
  const cfg = resolveSubSyncConfig(client);
  if (!cfg.enabled) {
    return;
  }
  if (!cfg.roleId) {
    global.logger?.warn?.("[KICK SUB] missing roleId");
    return;
  }
  if (!cfg.clientId || !cfg.clientSecret) {
    global.logger?.warn?.("[KICK SUB] missing KICK_CLIENT_ID / KICK_CLIENT_SECRET");
    return;
  }
  loopStarted.add(client);

  const bootOk = await bootstrapKickEventSubscriptions(client);
  if (!bootOk) scheduleKickSubBootstrapRetry(client);

  const tick = () =>
    reconcileKickSubRoles(client).catch((err) => {
      global.logger?.warn?.("[KICK SUB] reconcile:", err?.message || err);
    });
  tick();
  const timer = setInterval(tick, cfg.reconcileIntervalMs);
  timer.unref?.();
  client._kickSubscriberSyncInterval = timer;
}

module.exports = {
  resolveSubSyncConfig,
  startKickSubscriberSyncLoop,
  createLinkAuthorizeUrl,
  completeOAuthLink,
  getLinkStatus,
  unlinkKickAccount,
  handleSubscriptionEvent,
  verifyKickWebhookSignature,
  getKickPublicKeyPem,
  ensureEventSubscriptions,
  loadState,
  saveState,
  reconcileKickSubRoles,
  grantKickSubRole,
  revokeKickSubRole,
  grantKickModRole,
  revokeKickModRole,
};
