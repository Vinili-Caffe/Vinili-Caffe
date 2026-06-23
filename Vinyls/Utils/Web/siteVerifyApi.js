const IDs = require("../Config/ids");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const {
  resolveValidVerifyRoleIds,
  resolveRequiredVerifyRoleIds,
  isSponsorGuildVerify,
  isUserVerifiedInMainGuild,
  isAlreadyVerifiedInThisGuild,
} = require("../Interaction/verifyUtils");
const { addRolesAndGetMember } = require("../Interaction/interactionEntityCache");
const { upsertVerifiedMember, applyTenureForMember } = require("../../Services/Community/communityOpsService");
const { removePreMemberRoleIfPresent } = require("../Community/preMemberRoleService");

function discordInviteUrlForSite() {
  const raw = String(IDs?.links?.invite || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (t?.unref) t.unref();
  });
}

function resolveMainGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

async function resolveGuildForSiteVerify(client, guildIdRaw) {
  const fallback = resolveMainGuildId(client);
  const guildId = String(guildIdRaw || fallback || "").trim();
  if (!/^\d{17,22}$/.test(guildId)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 404, error: "guild_not_found", message: "Server non trovato o non disponibile." };
  }
  return { ok: true, guild };
}

async function completeSiteVerify(client, { accessToken, guildId }) {
  const auth = await resolveWebsiteGuildMember(client, accessToken);
  if (!auth?.ok) return auth;

  const guildResolved = await resolveGuildForSiteVerify(client, guildId);
  if (!guildResolved.ok) return guildResolved;
  const guild = guildResolved.guild;

  const userId = String(auth?.userId || auth?.member?.id || "").trim();
  if (!/^\d{17,22}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Utente non valido." };
  }
  if (String(guild.ownerId || "") === userId) {
    return { ok: false, status: 400, error: "owner_forbidden", message: "Il proprietario del server non deve verificarsi." };
  }

  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  if (!member) {
    return { ok: false, status: 403, error: "not_in_guild", message: "Non sei presente in questo server Discord." };
  }

  if (isSponsorGuildVerify(guild.id)) {
    const verifiedInMain = await isUserVerifiedInMainGuild(client, userId);
    if (!verifiedInMain) {
      return {
        ok: false,
        status: 403,
        error: "main_verify_required",
        message: "Per verificarti qui devi prima verificarti nel server principale.",
      };
    }
  }

  if (isAlreadyVerifiedInThisGuild(member, guild.id)) {
    await removePreMemberRoleIfPresent(member).catch(() => {});
    return {
      ok: true,
      status: 200,
      alreadyVerified: true,
      message: "Sei già verificato in questo server.",
      guildId: String(guild.id),
      discordInviteUrl: discordInviteUrlForSite(),
    };
  }

  const validVerifyRoleIds = await resolveValidVerifyRoleIds(guild);
  const requiredVerifyRoleIds = resolveRequiredVerifyRoleIds(guild);
  if (!validVerifyRoleIds.length) {
    return {
      ok: false,
      status: 503,
      error: "verify_roles_missing",
      message: "Ruoli verifica non configurati su questo server.",
    };
  }

  const rolesToAdd = validVerifyRoleIds.filter((roleId) => !member.roles.cache.has(roleId));
  let memberAfterAdd = await addRolesAndGetMember(guild, member.id, rolesToAdd);
  if (!memberAfterAdd) {
    return { ok: false, status: 500, error: "verify_failed", message: "Impossibile completare la verifica." };
  }

  if (rolesToAdd.length) {
    const missingRequired = (m) =>
      requiredVerifyRoleIds.filter((roleId) => !m?.roles?.cache?.has?.(roleId));
    let missingReq = missingRequired(memberAfterAdd);
    for (let retry = 0; retry < 3 && missingReq.length; retry += 1) {
      await sleep(400 + retry * 140);
      global.logger?.warn?.(
        "[siteVerifyApi] retry verify roles",
        guild.id,
        userId,
        "missing required:",
        missingReq.join(","),
      );
      memberAfterAdd = await addRolesAndGetMember(guild, member.id, missingReq);
      if (!memberAfterAdd) break;
      missingReq = missingRequired(memberAfterAdd);
      if (!missingReq.length) break;
    }
    missingReq = memberAfterAdd ? missingRequired(memberAfterAdd) : requiredVerifyRoleIds;
    if (missingReq.length) {
      global.logger?.warn?.("[siteVerifyApi] verify_roles_failed final", guild.id, userId, missingReq.join(","));
      return { ok: false, status: 500, error: "verify_roles_failed", message: "Non sono riuscito ad assegnare i ruoli verifica." };
    }
    const missingOptional = rolesToAdd.filter((roleId) => !memberAfterAdd.roles.cache.has(roleId));
    if (missingOptional.length) {
      global.logger?.warn?.(
        "[siteVerifyApi] verify optional layout roles not assigned",
        guild.id,
        userId,
        missingOptional.join(","),
      );
    }
  }

  try {
    const record = await upsertVerifiedMember(guild.id, memberAfterAdd.id, new Date());
    await applyTenureForMember(memberAfterAdd, record);
  } catch (err) {
    global.logger?.warn?.("[siteVerifyApi] upsert/applyTenure:", err?.message || err);
  }

  await removePreMemberRoleIfPresent(memberAfterAdd).catch((err) => {
    global.logger?.warn?.("[siteVerifyApi] preMember role remove:", userId, err?.message || err);
  });

  return {
    ok: true,
    status: 200,
    message: "Verifica completata con successo.",
    guildId: String(guild.id),
    alreadyVerified: false,
    discordInviteUrl: discordInviteUrlForSite(),
  };
}

module.exports = {
  completeSiteVerify,
};