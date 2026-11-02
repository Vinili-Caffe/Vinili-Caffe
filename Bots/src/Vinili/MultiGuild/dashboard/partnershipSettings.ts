/** Dashboard partnership: impostazioni (lettura e modifica). */
const { getPartnershipConfigSync, refreshPartnershipConfigCache, isPartnershipSetupComplete, savePartnershipConfig, completePartnershipSetup, normalizePings, normalizeThankYouEmbed, normalizeLeaveAction, normalizeContentFilters } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { resolvePartnershipConfigSync } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { parsePingMemberThresholdInput, parsePingDelayInput } = require("../../Utils/Partner/partnershipPingUtils") as typeof import("../../Utils/Partner/partnershipPingUtils");
const { setTenantObjectiveFlag } = require("../../MultiGuild/services/Partner/tenantObjectiveService") as typeof import("../../MultiGuild/services/Partner/tenantObjectiveService");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { ensureTenantPremiumCacheFresh, getTenantPremiumSync, serializePremiumPublic, isTenantPremiumActiveSync } = require("../../MultiGuild/core/tenantPremium") as typeof import("../../MultiGuild/core/tenantPremium");
const { reasonToMessage, fail, serializePartnership } = require("./partnershipSerialize") as typeof import("./partnershipSerialize");
const { listGuildPickerData, maybeEnsureInvite, parseOptionalId } = require("./partnershipGuildPicker") as typeof import("./partnershipGuildPicker");

async function getDashboardPartnership(client?, accessToken?, guildId?, opts: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  await refreshPartnershipConfigCache().catch(() => null);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  const config = resolvePartnershipConfigSync(access.guildId) || getPartnershipConfigSync(access.guildId);
  const premium = isViniliFullFeatureGuild(access.guildId)
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(access.guildId));
  let pickers = { textChannels: [], categories: [], roles: [] };
  try {
    pickers = await listGuildPickerData(client, access.guildId, {
      force: opts.forcePickers === true,
    });
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] listGuildPickerData:", err?.message || err);
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    premium,
    partnership: serializePartnership(config, access.guildId),
    pickers,
  };
}

async function patchDashboardPartnership(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const gid = access.guildId;
  const patch = body && typeof body === "object" ? body : {};
  await refreshPartnershipConfigCache().catch(() => null);
  const { buildMainPartnershipMongoSeed, isMainPartnershipSettingsGuild } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
  const prev: any = getPartnershipConfigSync(gid) || (isMainPartnershipSettingsGuild(gid) ? buildMainPartnershipMongoSeed(gid) : null) || {};
  const configPatch: Record<string, any> = {};
  let channelForInvite = null;
  let clearDescCache = false;

  if (Object.prototype.hasOwnProperty.call(patch, "partnershipsChannelId")) {
    const parsed = parseOptionalId(patch.partnershipsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.partnershipsChannelId = parsed.id;
    if (!parsed.id) {
      configPatch.invite = { code: null, url: null, channelId: null };
    } else {
      channelForInvite = parsed.id;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "logsChannelId")) {
    const parsed = parseOptionalId(patch.logsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.logsChannelId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pmCommandsChannelId")) {
    const parsed = parseOptionalId(patch.pmCommandsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.pmCommandsChannelId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pmCommandsCategoryIds")) {
    const raw = patch.pmCommandsCategoryIds;
    const list = Array.isArray(raw) ? raw : raw === null || raw === "" ? [] : [raw];
    const ids = [
      ...new Set(
        list
          .map((x?) => String(x || "").trim())
          .filter((id?) => /^\d{16,22}$/.test(id)),
      ),
    ];
    if (list.length && !ids.length) {
      return fail(400, "invalid_category", reasonToMessage("invalid_category"));
    }
    configPatch.pmCommandsCategoryIds = ids;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "partnerManagerRoleId")) {
    const parsed = parseOptionalId(patch.partnerManagerRoleId);
    if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
    const badgeId =
      Object.prototype.hasOwnProperty.call(configPatch, "managerBadgeRoleId")
        ? configPatch.managerBadgeRoleId
        : prev.managerBadgeRoleId;
    if (parsed.id && badgeId && String(badgeId) === String(parsed.id)) {
      return fail(400, "same_as_badge_role", reasonToMessage("same_as_badge_role"));
    }
    configPatch.partnerManagerRoleId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "managerBadgeRoleId")) {
    const parsed = parseOptionalId(patch.managerBadgeRoleId);
    if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
    const managerId =
      Object.prototype.hasOwnProperty.call(configPatch, "partnerManagerRoleId")
        ? configPatch.partnerManagerRoleId
        : prev.partnerManagerRoleId;
    if (parsed.id && managerId && String(managerId) === String(parsed.id)) {
      return fail(400, "same_as_manager_role", reasonToMessage("same_as_manager_role"));
    }
    configPatch.managerBadgeRoleId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pings") && patch.pings && typeof patch.pings === "object") {
    const p = patch.pings;
    const next: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(p, "hereMembers")) {
      const parsed = parsePingMemberThresholdInput(p.hereMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.hereMembers = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(p, "everyoneMembers")) {
      const parsed = parsePingMemberThresholdInput(p.everyoneMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.everyoneMembers = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(p, "customRoleId")) {
      const parsed = parseOptionalId(p.customRoleId);
      if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
      next.customRoleId = parsed.id;
    }
    if (Object.prototype.hasOwnProperty.call(p, "customRoleMembers")) {
      const parsed = parsePingMemberThresholdInput(p.customRoleMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.customRoleMembers = parsed;
    }

    const parseDelayPatch = (inputKey?, msKey?) => {
      if (
        !Object.prototype.hasOwnProperty.call(p, inputKey) &&
        !Object.prototype.hasOwnProperty.call(p, msKey)
      ) {
        return null;
      }
      const delayRaw =
        p[inputKey] != null && p[inputKey] !== ""
          ? p[inputKey]
          : p[msKey];
      if (delayRaw === null || delayRaw === undefined || delayRaw === "") {
        return { key: msKey, value: null };
      }
      if (typeof delayRaw === "number" && Number.isFinite(delayRaw)) {
        return { key: msKey, value: Math.max(0, Math.floor(delayRaw)) };
      }
      const parsed = parsePingDelayInput(delayRaw);
      if (Number.isNaN(parsed)) return { error: true };
      return { key: msKey, value: parsed };
    };

    for (const pair of [
      ["hereDelayInput", "hereDelayMs"],
      ["everyoneDelayInput", "everyoneDelayMs"],
      ["customRoleDelayInput", "customRoleDelayMs"],
    ]) {
      const parsedDelay = parseDelayPatch(pair[0], pair[1]);
      if (!parsedDelay) continue;
      if (parsedDelay.error) return fail(400, "invalid_ping_delay", reasonToMessage("invalid_ping_delay"));
      next[parsedDelay.key] = parsedDelay.value;
    }

    const preview = {
      ...(prev.pings || {}),
      ...next,
    };
    const hasCustomRole = Boolean(preview.customRoleId);
    const hasCustomMembers = preview.customRoleMembers !== null && preview.customRoleMembers !== undefined;
    if (hasCustomRole !== hasCustomMembers) {
      return fail(400, "custom_role_pair", reasonToMessage("custom_role_pair"));
    }

    configPatch.pings = normalizePings({ ...(prev.pings || {}), ...next });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "partnerDesc") && patch.partnerDesc && typeof patch.partnerDesc === "object") {
    const d = patch.partnerDesc;
    const mode = String(d.mode || "").trim().toLowerCase();
    clearDescCache = true;
    if (mode === "clear" || mode === "none" || mode === "off") {
      configPatch.partnerDesc = {
        mode: null,
        channelId: null,
        staticText: null,
        sourceMessageId: null,
      };
    } else if (mode === "channel") {
      const parsed = parseOptionalId(d.channelId);
      if (parsed.invalid || !parsed.id) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
      configPatch.partnerDesc = {
        mode: "channel",
        channelId: parsed.id,
        staticText: null,
        sourceMessageId: null,
      };
    } else if (mode === "static") {
      const text = String(d.staticText || "").replace(/\r\n/g, "\n").trim();
      if (!text) return fail(400, "empty_text", reasonToMessage("empty_text"));
      if (text.length > 4000) return fail(400, "too_long", reasonToMessage("too_long"));
      configPatch.partnerDesc = {
        mode: "static",
        channelId: null,
        staticText: text,
        sourceMessageId: null,
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "thankYouEmbed") && patch.thankYouEmbed && typeof patch.thankYouEmbed === "object") {
    const ty = patch.thankYouEmbed;
    const enabled =
      Object.prototype.hasOwnProperty.call(ty, "enabled") || Object.prototype.hasOwnProperty.call(ty, "e")
        ? ty.enabled === true || ty.e === true
        : true;
    const turningOff = enabled === false;
    if (!turningOff) {
      await ensureTenantPremiumCacheFresh().catch(() => null);
      if (!isTenantPremiumActiveSync(gid) && !isViniliFullFeatureGuild(gid)) {
        return fail(402, "premium_required", reasonToMessage("premium_required"));
      }
    }
    configPatch.thankYouEmbed = normalizeThankYouEmbed({
      ...(prev.thankYouEmbed || {}),
      ...ty,
      enabled,
    });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "skipManager")) {
    configPatch.skipManager = Boolean(patch.skipManager);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "manualPartnershipEnabled")) {
    configPatch.manualPartnershipEnabled = Boolean(patch.manualPartnershipEnabled);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "contentFilters") &&
    patch.contentFilters &&
    typeof patch.contentFilters === "object"
  ) {
    configPatch.contentFilters = normalizeContentFilters({
      ...(prev.contentFilters || {}),
      ...patch.contentFilters,
    });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "managerLeaveAction")) {
    configPatch.managerLeaveAction = normalizeLeaveAction(patch.managerLeaveAction);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "sameServerCooldownInput") ||
    Object.prototype.hasOwnProperty.call(patch, "sameServerCooldownMs")
  ) {
    const delayRaw =
      patch.sameServerCooldownInput != null && patch.sameServerCooldownInput !== ""
        ? patch.sameServerCooldownInput
        : patch.sameServerCooldownMs;
    if (delayRaw === null || delayRaw === undefined || delayRaw === "") {
      configPatch.sameServerCooldownMs = null;
    } else if (typeof delayRaw === "number" && Number.isFinite(delayRaw)) {
      const n = Math.max(0, Math.floor(delayRaw));
      configPatch.sameServerCooldownMs = n === 0 ? null : Math.max(1000, n);
    } else {
      const parsed = parsePingDelayInput(delayRaw);
      if (Number.isNaN(parsed)) {
        return fail(400, "invalid_same_server_cooldown", reasonToMessage("invalid_same_server_cooldown"));
      }
      configPatch.sameServerCooldownMs = parsed === 0 ? null : Math.max(1000, parsed);
    }
  }

  if (Object.keys(configPatch).length) {
    const saved = await savePartnershipConfig(gid, configPatch);
    if (!saved?.ok) {
      return fail(400, saved?.reason || "save_failed", reasonToMessage(saved?.reason));
    }
  }

  if (clearDescCache) {
    try {
      const { clearTenantDescriptionCache } = require("../../MultiGuild/services/Partner/tenantPartnerDescriptionService") as typeof import("../../MultiGuild/services/Partner/tenantPartnerDescriptionService");
      clearTenantDescriptionCache(gid);
    } catch (_) {}
  }

  if (channelForInvite) {
        void maybeEnsureInvite(client, gid, channelForInvite);
  }

  if (patch.completeSetup === true) {
    const current = getPartnershipConfigSync(gid);
    if (!current?.partnershipsChannelId || !current?.partnerManagerRoleId) {
      return fail(400, "missing_required", reasonToMessage("missing_required"));
    }
    const setupResult = await completePartnershipSetup(gid, access.userId);
    if (!setupResult?.ok) {
      return fail(400, setupResult?.reason || "save_failed", reasonToMessage(setupResult?.reason));
    }
    void maybeEnsureInvite(client, gid, current.partnershipsChannelId);
  }

  const config = resolvePartnershipConfigSync(gid) || getPartnershipConfigSync(gid);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  const premium = isViniliFullFeatureGuild(gid)
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(gid));
    const objectiveFlags = [];
  if (config?.legacy === true || isPartnershipSetupComplete(config)) {
    objectiveFlags.push("setupDone");
  }
  if (config?.partnerDesc?.configured) {
    objectiveFlags.push("descSet");
  }
    if (config?.thankYouEmbed?.enabled === true && premium.active) {
    objectiveFlags.push("thankYouSet");
  }
  for (const flag of objectiveFlags) {
    void setTenantObjectiveFlag(client, gid, access.userId, flag).catch(() => null);
  }

  const out: Record<string, any> = {
    ok: true,
    status: 200,
    guildId: gid,
    premium,
    partnership: serializePartnership(config, gid),
    message: "Configurazione partnership salvata.",
  };
    if (patch.includePickers === true) {
    out.pickers = await listGuildPickerData(client, gid);
  }
  try {
    const { broadcastSitePartnershipChanged } = require("../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../site/suggestions/siteSuggestionsBroadcast");
    broadcastSitePartnershipChanged({ guildId: gid, action: "save" });
  } catch (_) {}
  return out;
}

export = { getDashboardPartnership, patchDashboardPartnership };
