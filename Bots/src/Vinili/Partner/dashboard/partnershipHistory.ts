/** Dashboard / profilo staff: storico delle partnership di un server. */
const { fail, extractInviteCodeFromInvite, escapeRegExp } = require("./partnershipSerialize") as typeof import("./partnershipSerialize");
const { assertTenantPartnershipAccess } = require("./partnershipBlacklist") as typeof import("./partnershipBlacklist");

async function buildPartnershipHistoryPayload(client?, guildId?, query: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) {
    return fail(400, "invalid_guild", "Server non valido.");
  }

  const { listPartnerGuildHistory } = require("../../Partner/services/partnershipHistoryService") as typeof import("../../Partner/services/partnershipHistoryService");
  const {
    extractInviteCode,
    fetchInviteGuildMeta,
    getCachedInviteGuildMeta,
    isInviteFetchRateLimited,
  } = require("../../Partner/runtime/partnershipBlacklistDisplay") as typeof import("../../Partner/runtime/partnershipBlacklistDisplay");

  let raw;
  try {
    raw = await listPartnerGuildHistory(gid, {
      days: query?.days,
      page: query?.page,
      pageSize: query?.pageSize || query?.limit,
    });
  } catch (err) {
    global.logger?.error?.("[PARTNER HISTORY] list failed:", err);
    return fail(500, "fetch_failed", "Impossibile caricare la cronologia.");
  }

  const isUsableGuildName = (value?) => {
    const name = String(value || "").trim();
    if (!name) return false;
    if (/^(server\s+sconosciuto|partner)$/i.test(name)) return false;
    if (/^discord\.gg\//i.test(name)) return false;
    return true;
  };

  let guildIconUrlFn = null;
  try {
    guildIconUrlFn = require("../../../shared/discord/guildDiscordIdentity").guildIconUrl;
  } catch {
    guildIconUrlFn = null;
  }

  /* loghi dei server partner già trovati (per codice invito): così non si chiede ogni volta a Discord */
  const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
  const ICONS_KEY = "partnerInviteIcons.v1";
  const savedIcons: Record<string, string> = ((await getBotState(ICONS_KEY, {}).catch(() => ({}))) as Record<string, string>) || {};
  let iconsChanged = false;
  const iconKey = (invite?) => String(extractInviteCode(String(invite || "")) || "").toLowerCase();
  const knownIcon = (row?) => {
    const k = iconKey(row?.invite);
    return (k && savedIcons[k]) || getCachedInviteGuildMeta(String(row?.invite || ""))?.iconUrl || null;
  };
  const rememberIcon = (invite?, url?) => {
    const k = iconKey(invite);
    if (!k || !url || savedIcons[k] === url) return;
    savedIcons[k] = String(url);
    iconsChanged = true;
  };

  const needsDiscordEnrich = (row?) => {
    const invite = String(row?.invite || "").trim();
    if (!invite) return false;
    if (!isUsableGuildName(row?.guildName)) return true;
    /* nome già noto ma niente logo: lo chiediamo dall'invito (se Vinili non è nel server partner) */
    const partnerGid = String(row?.guildId || "").trim();
    if (partnerGid && client?.guilds?.cache?.get(partnerGid)) return false;
    return !knownIcon(row);
  };

  async function mapPool(items?, concurrency?, mapper?) {
    const list = Array.isArray(items) ? items : [];
    const out = new Array(list.length);
    let next = 0;
    const workers = Math.min(Math.max(1, concurrency), Math.max(1, list.length) || 1);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < list.length) {
          const idx = next;
          next += 1;
          out[idx] = await mapper(list[idx], idx);
        }
      }),
    );
    return out;
  }

  const pageRows = raw.entries || [];
  const enrichTargets = pageRows.filter(needsDiscordEnrich);
  if (enrichTargets.length && !isInviteFetchRateLimited()) {
    let stopEnrich = false;
    await mapPool(enrichTargets, 2, async (row?) => {
      if (stopEnrich || isInviteFetchRateLimited()) return;
      const invite = String(row.invite || "").trim();
      const cached = getCachedInviteGuildMeta(invite);
      if (cached?.guildName) {
        if (!isUsableGuildName(row.guildName)) row.guildName = cached.guildName;
        if (!row.guildId && cached.guildId) row.guildId = cached.guildId;
        row._iconUrl = cached.iconUrl || null;
        rememberIcon(invite, cached.iconUrl);
        return;
      }
      const out = { rateLimited: false };
      const meta = await fetchInviteGuildMeta(invite, {
        client,
        timeoutMs: 900,
        skipIfRateLimited: true,
        out,
      }).catch(() => null);
      if (out.rateLimited || isInviteFetchRateLimited()) {
        stopEnrich = true;
        return;
      }
      if (!meta) return;
      if (!isUsableGuildName(row.guildName) && isUsableGuildName(meta.guildName)) {
        row.guildName = String(meta.guildName).trim();
      }
      if (!row.guildId && meta.guildId) row.guildId = String(meta.guildId).trim();
      row._iconUrl = meta.iconUrl || null;
      rememberIcon(invite, meta.iconUrl);

      setImmediate(() => {
        softPersistPartnerHistoryMeta(gid, {
          invite,
          guildName: meta.guildName,
          partnerGuildId: meta.guildId,
        }).catch(() => {});
      });
    });
  }

  const entries = pageRows.map((row?) => {
    let guildName = isUsableGuildName(row.guildName) ? String(row.guildName).trim() : null;
    let invite = String(row.invite || "").trim() || null;
    let iconUrl = row._iconUrl || knownIcon(row) || null;
    let partnerGuildId = String(row.guildId || "").trim() || null;

    if (partnerGuildId) {
      const cachedGuild = client?.guilds?.cache?.get(partnerGuildId) || null;
      if (cachedGuild) {
        if (!guildName) guildName = String(cachedGuild.name || "").trim() || null;
        if (!iconUrl && typeof guildIconUrlFn === "function") {
          try {
            iconUrl = guildIconUrlFn(cachedGuild, { size: 64 });
          } catch {
            iconUrl = null;
          }
        }
      }
    }

    if (!guildName && invite) {
      const cached = getCachedInviteGuildMeta(invite);
      if (cached && isUsableGuildName(cached.guildName)) {
        guildName = String(cached.guildName).trim();
        if (!iconUrl) iconUrl = cached.iconUrl || null;
        if (!partnerGuildId && cached.guildId) partnerGuildId = String(cached.guildId).trim();
      } else {
        const code = extractInviteCode(invite);
        if (code) guildName = `discord.gg/${code}`;
      }
    }

    return {
      guildId: partnerGuildId,
      count: row.count,
      lastAt: row.lastAt,
      firstAt: row.firstAt,
      guildName,
      iconUrl: iconUrl || null,
      invite,
    };
  });

  if (iconsChanged) {
    setImmediate(() => {
      void Promise.resolve(setBotState(ICONS_KEY, savedIcons)).catch(() => {});
    });
  }

  return {
    ok: true,
    status: 200,
    guildId: gid,
    days: raw.days == null ? null : raw.days,
    uniqueServers: raw.uniqueServers,
    totalPartnerships: raw.totalPartnerships,
    page: raw.page || 1,
    pageSize: raw.pageSize || 10,
    totalPages: raw.totalPages || 1,
    entries,
  };
}

async function getDashboardPartnershipHistory(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  return buildPartnershipHistoryPayload(client, access.guildId, query);
}

/**
 * Cronologia partnership dal profilo staff (+history sul sito).
 * Chi può: Partner Manager del server, gestori dashboard, oppure (solo server principale) staff del sito.
 */
async function getProfilePartnershipHistory(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const token = String(accessToken || "").trim();
  const gid = String(guildId || "").trim();
  if (!token) return fail(401, "missing_token", "Accedi per vedere la cronologia.");
  if (!/^\d{16,22}$/.test(gid)) return fail(400, "invalid_guild", "Server non valido.");

  const { fetchDiscordOAuthMe } = require("../../site/http/discordOauthMe") as typeof import("../../site/http/discordOauthMe");
  const me: any = await fetchDiscordOAuthMe(token).catch(() => null);
  const userId = String(me?.me?.id || "").trim();
  if (!userId) return fail(401, "invalid_token", "Sessione non valida.");

  const GP = require("../../site/http/usersLbGuildProfile") as typeof import("../../site/http/usersLbGuildProfile");
  const isPm = await GP.isPartnerManagerIn(client, gid, userId).catch(() => false);
  if (!isPm) {
    const dash = await assertTenantPartnershipAccess(client, token, gid);
    if (!dash.ok) {
      let mainStaffOk = false;
      try {
        const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
        const mainId = String(IDs.guilds?.main || "").trim();
        if (gid === mainId) {
          const { assertWebsiteStaffAccess } = require("../../site/staff/siteStaffAccessApi") as typeof import("../../site/staff/siteStaffAccessApi");
          const staff: any = await assertWebsiteStaffAccess(client, token).catch(() => null);
          mainStaffOk = staff?.ok === true;
        }
      } catch {
        mainStaffOk = false;
      }
      if (!mainStaffOk) {
        return fail(403, "not_pm", "Solo Partner Manager o gestori del server possono vedere la cronologia.");
      }
    }
  }

  return buildPartnershipHistoryPayload(client, gid, query);
}

async function softPersistPartnerHistoryMeta(guildId?, meta: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const guildName = String(meta?.guildName || "").trim();
  const partnerGuildId = String(meta?.partnerGuildId || "").trim();
  const invite = String(meta?.invite || "").trim();
  const code = extractInviteCodeFromInvite(invite);
  if (!gid || !guildName || !code) return;
  if (/^(server\s+sconosciuto|partner)$/i.test(guildName) || /^discord\.gg\//i.test(guildName)) return;

  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const inviteRe = new RegExp(`discord(?:app)?\\.(?:gg|com)/(?:invite/)?${escapeRegExp(code)}`, "i");

  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "staff.partnerActions.invite": { $regex: inviteRe },
  })
    .limit(40)
    .catch(() => []);

  for (const doc of docs || []) {
    const actions = Array.isArray(doc?.staff?.partnerActions) ? doc.staff.partnerActions : [];
    let changed = false;
    for (const action of actions) {
      if (!/^create$/i.test(String(action?.action || ""))) continue;
      const actionInvite = String(action?.invite || "");
      if (!inviteRe.test(actionInvite) && !actionInvite.toLowerCase().includes(code.toLowerCase())) continue;
      const currentName = String(action?.partner || "").trim();
      const nameIsPlaceholder =
        !currentName ||
        /^(server\s+sconosciuto|partner)$/i.test(currentName) ||
        /^discord\.gg\//i.test(currentName);
      if (nameIsPlaceholder) {
        action.partner = guildName;
        changed = true;
      }
      if (partnerGuildId && !String(action?.partnerGuildId || "").trim()) {
        action.partnerGuildId = partnerGuildId;
        changed = true;
      }
    }
    if (changed) {
      doc.markModified("staff");
      await doc.save().catch(() => {});
    }
  }
}

export = { getDashboardPartnershipHistory, getProfilePartnershipHistory, buildPartnershipHistoryPayload };
