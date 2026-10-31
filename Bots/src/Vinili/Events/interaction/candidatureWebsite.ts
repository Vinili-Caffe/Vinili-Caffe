/** Candidature: invio dal sito. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { fetchDiscordMe, fetchOAuthGuildMemberResult, synthMemberFromOAuth } = require("./candidatureOAuth") as typeof import("./candidatureOAuth");
const { NOMODULI_ROLE_ID, normalizeApplicationType, hasAnyRoleMember, checkMemberCandidatureEligibility } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { APPLICATIONS, buildFinalThanksPlainMessage, postCandidatureToVisioneModuli } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");
const { readCachedWebsiteMember, writeCachedWebsiteMember, ensureWebsiteGuild, fetchWebsiteGuildMember, isUnknownMemberError } = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const { findQuestionLabel } = require("../../Utils/Community/candidatureApplicationsCatalog") as typeof import("../../Utils/Community/candidatureApplicationsCatalog");

 // rolesPrefetchNoise1: UA + slightly longer; was bare abort@2800
let lastDiscordMeWarnAt = 0;

async function resolveWebsiteCandidatureMember(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  // Prefer OAuth guild-member (roles) — Discord bot member fetch often times out under load.
  // mobileApisFast2: keep OAuth budget short (phones + CGNAT retries).
  const oauthPromise = fetchOAuthGuildMemberResult(token, guildId, 2800);
  let meJson;
  try {
    const meRes = await fetchDiscordMe(token);
    if (!meRes.ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    meJson = await meRes.json();
  } catch (err) {
    const oauth = err && err.oauth && typeof err.oauth === "object" ? err.oauth : null;
    const oauthErr = String(oauth?.error || "").trim().toLowerCase();
    const oauthStatus = Number(oauth?.status) || 0;
    /* invalid/expired session is not a Discord outage — return 401, don't warn as unreachable */
    if (oauthErr === "invalid_token" || oauthErr === "missing_token" || oauthStatus === 401) {
      return {
        ok: false,
        status: 401,
        error: oauthErr || "invalid_token",
        message:
          String(oauth?.message || "").trim() ||
          "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    const now = Date.now();
    if (now - lastDiscordMeWarnAt > 60_000) {
      lastDiscordMeWarnAt = now;
      global.logger?.warn?.(
        "[candidature-site] Discord /users/@me timeout/unreachable:",
        oauthErr || err?.message || err,
      );
    }
    /* 503 not 502: Cloudflare replaces origin 502 with plain text (no JSON). */
    return {
      ok: false,
      status: 503,
      error: oauthErr === "discord_timeout" ? "discord_timeout" : "discord_unreachable",
      message:
        String(oauth?.message || "").trim() || "Impossibile contattare Discord. Riprova tra poco.",
    };
  }

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const notInGuildPayload = {
    ok: false,
    status: 403,
    error: "not_in_guild",
    message: "Non sei nel server Discord: entra prima con lo stesso account con cui hai fatto login.",
    userId,
  };

  const guildPromise = ensureWebsiteGuild(client, guildId, 4000);
  let oauth = await oauthPromise;
  const guild = await guildPromise;

  let member = null;
  if (guild) {
    member = guild.members.cache.get(userId) || readCachedWebsiteMember(userId) || null;
  } else {
    member = readCachedWebsiteMember(userId) || null;
  }

  if (!member && oauth.json) {
    member = synthMemberFromOAuth(guild, meJson, oauth.json);
  }

  // mobileStaffFast1: one short bot fetch max — second 6s retry killed phones (appelli/staff/candidature).
  if (!member && guild && !oauth.notInGuild) {
    try {
      member = await fetchWebsiteGuildMember(guild, userId, { timeoutMs: 2200, retry: false, soft: true });
    } catch (err) {
      if (isUnknownMemberError(err)) {
        return notInGuildPayload;
      }
      const msg = String(err?.message || err || "");
      if (!/member_fetch_timeout/i.test(msg)) {
        global.logger?.warn?.("[candidature-site] member fetch failed:", msg || err);
      }
      member = null;
    }
  }

  if (!member && oauth.json) {
    member = synthMemberFromOAuth(guild, meJson, oauth.json);
  }

  if (!member && !oauth.notInGuild && !oauth.unreachable) {
    oauth = await fetchOAuthGuildMemberResult(token, guildId, 1800);
    if (oauth.json) {
      member = synthMemberFromOAuth(guild, meJson, oauth.json);
    }
  }

  if (!member && oauth.notInGuild) {
    return notInGuildPayload;
  }

  if (!member) {
    return {
      ok: false,
      status: 503,
      error: "member_fetch_failed",
      message: "Verifica temporaneamente non disponibile. Riprova tra poco.",
      userId,
    };
  }
  writeCachedWebsiteMember(userId, member);

  return { ok: true, userId, member, guild: guild || member.guild || null };
}

async function getCandidatureEligibilitySummary(client?, accessToken?) {
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" && resolved.userId) {
      const msg = resolved.message;
      return {
        ok: true,
        status: 200,
        userId: resolved.userId,
        inGuild: false,
        helper: { eligible: false, code: "not_in_guild", message: msg },
        partnermanager: { eligible: false, code: "not_in_guild", message: msg },
        blogger: { eligible: false, code: "not_in_guild", message: msg },
      };
    }
    return resolved;
  }

  const { member, userId }: any = resolved;
  const helperRes = await checkMemberCandidatureEligibility(member, "helper");
  const pmRes = await checkMemberCandidatureEligibility(member, "partnermanager");
  const bloggerRes = await checkMemberCandidatureEligibility(member, "blogger");
  const pack = (e?) =>
    e.ok
      ? { eligible: true }
      : {
          eligible: false,
          code: e.code,
          message: e.message,
          ...(e.roleId ? { roleId: e.roleId } : {}),
          ...(e.roleLabel ? { roleLabel: e.roleLabel } : {}),
          ...(e.until ? { cooldown_until_ms: e.until } : {}),
        };

  return {
    ok: true,
    status: 200,
    userId,
    inGuild: true,
    noModuliBlocked: Boolean(NOMODULI_ROLE_ID && hasAnyRoleMember(member, [NOMODULI_ROLE_ID])),
    helper: pack(helperRes),
    partnermanager: pack(pmRes),
    blogger: pack(bloggerRes),
  };
}

async function submitCandidatureWebsite(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const typeRaw = String(payload?.type || "").trim().toLowerCase();
  const type = normalizeApplicationType(typeRaw);
  const answersIn = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};

  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error, message: resolved.message };
  }

  const { member, userId, guild }: any = resolved;

  const eligibility = await checkMemberCandidatureEligibility(member, type);
  if (!eligibility.ok) {
    return {
      ok: false,
      status: 403,
      error: eligibility.code,
      message: eligibility.message,
      ...(eligibility.until ? { cooldown_until_ms: eligibility.until } : {}),
    };
  }

  const cfg = APPLICATIONS[type];
  const mergedAnswers = { ...answersIn, id_discord: userId };
  for (const q of cfg.questions) {
    const v = String(mergedAnswers[q.id] || "").trim();
    if (!v) {
      const label = findQuestionLabel(type, q.id);
      return {
        ok: false,
        status: 400,
        error: "incomplete",
        field: q.id,
        message: `Compila tutti i campi del modulo. Manca: ${label}`,
      };
    }
  }

  const discordUser = await client.users.fetch(userId).catch(() => null);
  if (!discordUser) {
    return { ok: false, status: 500, error: "user_fetch_failed", message: "Impossibile caricare il profilo Discord." };
  }

  const stateKey = `${guild.id}:${userId}:${type}`;
  const post = await postCandidatureToVisioneModuli(client, guild, discordUser, type, mergedAnswers, stateKey);
  if (!post.ok) {
    const message =
      post.code === "no_channel"
        ? "Canale visioneModuli non disponibile: contatta lo staff."
        : "Invio candidatura fallito: riprova più tardi.";
    return { ok: false, status: 500, error: post.code, message };
  }

  return {
    ok: true,
    status: 200,
    message: buildFinalThanksPlainMessage(post.nextAllowedAt, type),
    cooldown_until_ms: post.nextAllowedAt,
  };
}

export = { resolveWebsiteCandidatureMember, getCandidatureEligibilitySummary, submitCandidatureWebsite };
