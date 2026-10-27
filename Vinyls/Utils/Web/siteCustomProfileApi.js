"use strict";

const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { buildCustomProfileData } = require("./siteUsersLeaderboardApi");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const {
  createCustomRole,
  deleteCustomRole,
  renameCustomRole,
  setCustomRoleColor,
  setCustomRoleIcon,
  removeCustomRoleMember,
  addCustomRoleMember,
  createCustomVoc,
  deleteCustomVoc,
  renameCustomVoc,
  setCustomVocEmoji,
  addCustomVocMember,
  removeCustomVocMember,
  memberHasGradientHoloAccess,
} = require("../../Services/Community/customProfileMutations");
const { resolveCustomRoleState } = require("../Community/customRoleState");
const { getCustomRoleSlotCapWithContest, getCustomRoleSlotCapFromRoles, memberHasCustomRolePanelAccess } = require("../Community/customRoleSlots");
const { hasExtraCustomPerksUnlock } = require("../Community/customPerksUnlock");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService");
const { fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../Staff/partnerManagerTimedPerks");

const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const {
  buildCustomVocWeeklyActivityPanelState,
  CUSTOM_VOC_WEEKLY_MIN_SECONDS,
  CUSTOM_VOC_MAX_FAILED_WEEKS,
} = require("../Community/customVocWeeklyActivityUtils");

const CUSTOM_VOC_CREATE_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"], IDs?.roles?.Level50].filter(Boolean);

function memberCanCreateCustomVoc(member) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_VOC_CREATE_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function buildRequirementsMeta() {
  return {
    rolePrimary: {
      anyOf: ["VIP", "Booster", "Livello 50"],
      note: "Sblocca 1 ruolo custom (principale).",
    },
    roleSecondary: {
      anyOf: ["VIP+", "Double Booster", "Livello 120"],
      note: "Sblocca anche il ruolo secondario (2 slot totali).",
    },
    voice: {
      anyOf: ["VIP", "VIP+", "Double Booster", "Livello 50"],
      weeklyMinHours: Math.round(CUSTOM_VOC_WEEKLY_MIN_SECONDS / 3600),
      maxFailedWeeks: CUSTOM_VOC_MAX_FAILED_WEEKS,
      deleteAtLabel: "domenica alle 21:00",
      note: "Minimo 5 ore/settimana nella tua vocale. 3 settimane consecutive sotto soglia → eliminazione e 2 settimane di attesa per ricrearla.",
    },
  };
}

async function loadVoiceWeeklyActivity(guildId, userId) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  if (!gid || !uid) return null;
  try {
    const [customLean, profileLean] = await Promise.all([
      CustomRole.findOne({ guildId: gid, userId: uid }).lean().catch(() => null),
      ActivityUserProfile.findOne({ guildId: gid, userId: uid })
        .select(
          "guildId userId profile.totals.hourly profile.totals.daily profile.totals.sessionChannelId profile.totals.sessionStartedAt sessionChannelId sessionStartedAt profile.customRole",
        )
        .lean()
        .catch(() => null),
    ]);
    let merged = customLean;
    if (!merged && profileLean?.profile?.customRole) {
      const cr = profileLean.profile.customRole;
      if (cr?.customVocChannelId || cr?.customVocFailedWeekStreak || cr?.customVocRecreationBlockedUntil) {
        merged = { guildId: gid, userId: uid, ...cr };
      }
    }
    let hydrated = profileLean;
    try {
      const { hydrateProfileActivityBucketsFromGuild } = require("../../Services/Community/activityService");
      hydrated = await hydrateProfileActivityBucketsFromGuild(gid, uid, profileLean);
    } catch (_) {}
    return buildCustomVocWeeklyActivityPanelState(merged, hydrated);
  } catch (err) {
    global.logger?.warn?.("[siteCustomProfileApi] voiceActivity:", err?.message || err);
    return null;
  }
}

async function getCustomProfileCustomization(client, { accessToken }) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const { guild, member, userId } = resolved;

  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean, voiceActivity] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, userId),
    hasEventWeekWinnerGrant(guild.id, userId, 2).catch(() => false),
    hasEventWeekWinnerGrant(guild.id, userId, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(guild.id, userId),
    loadVoiceWeeklyActivity(guild.id, userId),
  ]);
  const pmBundle = partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  const primarySlotUnlock = hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || pmBundle;

  const featureAccess = {
    customRolePrimary: getCustomRoleSlotCapWithContest(member, primarySlotUnlock) >= 1,
    customRoleSecondary: getCustomRoleSlotCapFromRoles(member) >= 2,
    customVoc: memberCanCreateCustomVoc(member) || hasExtraUnlock || pmBundle,
  };
  const permissions = {
    gradientHolo: memberHasGradientHoloAccess(member),
  };

  const customProfile = await buildCustomProfileData(guild, userId);

  return {
    ok: true,
    status: 200,
    userId,
    featureAccess,
    permissions,
    requirements: buildRequirementsMeta(),
    voiceActivity: voiceActivity || null,
    primary: customProfile?.role || null,
    secondary: customProfile?.secondaryRole || null,
    voice: customProfile?.voice || null,
    expiresAt: customProfile?.expiresAt || "",
  };
}

async function getCustomProfileGuildEmojis(client, { accessToken, force = false } = {}) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const guildId = String(resolved.guild?.id || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  try {
    const { listGuildPickerData } = require("./siteDashboardPartnershipApi");
    const pickers = await listGuildPickerData(client, guildId, { force: force === true });
    const emojis = Array.isArray(pickers?.emojis) ? pickers.emojis : [];
    return {
      ok: true,
      status: 200,
      guildId,
      count: emojis.length,
      emojis,
    };
  } catch (err) {
    global.logger?.warn?.("[siteCustomProfileApi] emojis:", err?.message || err);
    return { ok: true, status: 200, guildId, count: 0, emojis: [] };
  }
}

async function mutateCustomProfile(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const { guild, member, userId } = resolved;
  const target = String(payload?.target || "").trim().toLowerCase();
  const action = String(payload?.action || "").trim().toLowerCase();

  if (!target || !action) {
    return { ok: false, status: 400, error: "missing_params", message: "Parametri target e action richiesti." };
  }

  const validTargets = ["primary", "secondary", "voice"];
  if (!validTargets.includes(target)) {
    return { ok: false, status: 400, error: "invalid_target", message: "Target non valido. Usa: primary, secondary, voice." };
  }

  let result;

  try {
    if (target === "primary" || target === "secondary") {
      const slot = target;
      result = await handleRoleMutation({ client, guild, member, ownerId: userId, slot, action, payload });
    } else {
      result = await handleVocMutation({ client, guild, member, ownerId: userId, action, payload });
    }
  } catch (err) {
    global.logger?.error?.("[siteCustomProfileApi] mutate error:", err);
    return { ok: false, status: 500, error: "internal", message: "Errore interno durante la mutazione." };
  }

  if (!result.ok) {
    const statusMap = {
      missing_customrole_access: 403,
      missing_secondary_access: 403,
      missing_customvoc_access: 403,
      gradient_holo_denied: 403,
      primary_required: 409,
      no_manage_roles: 503,
      no_manage_channels: 503,
      no_custom_role: 404,
      no_custom_voc: 404,
      role_not_found: 404,
      channel_not_found: 404,
      member_not_found: 404,
      cannot_remove_owner: 403,
      cannot_add_owner: 400,
      dm_closed: 409,
      request_failed: 500,
      customvoc_recreation_cooldown: 429,
      discord_rate_limit: 429,
      edit_failed: 500,
      invalid_params: 400,
      invalid_hex: 400,
      invalid_icon_value: 400,
      invalid_emoji: 400,
      unsafe_url: 400,
      invalid_action: 400,
    };
    const messageMap = {
      missing_customrole_access: "Non hai accesso al custom role. Serve VIP, Booster, Double Booster, VIP+ o livello 50.",
      missing_secondary_access: "Non hai accesso al secondo slot. Serve Double Booster o VIP+.",
      missing_customvoc_access: "Non hai accesso alla vocale privata. Serve VIP, Booster, Double Booster, VIP+ o livello 50.",
      gradient_holo_denied: "Gradiente e olografico sono riservati a VIP, Server Booster, Double Booster o VIP+.",
      primary_required: "Devi avere un ruolo primario prima di creare il secondario.",
      no_manage_roles: "Il bot non ha il permesso Gestisci Ruoli in questo momento.",
      no_manage_channels: "Il bot non ha il permesso Gestisci Canali in questo momento.",
      no_custom_role: "Non hai un ruolo personalizzato attivo.",
      no_custom_voc: "Non hai una vocale privata attiva.",
      role_not_found: "Ruolo non trovato nel server.",
      channel_not_found: "Canale vocale non trovato nel server.",
      member_not_found: "Utente non trovato nel server.",
      cannot_remove_owner: "Non puoi rimuovere te stesso: sei il proprietario.",
      cannot_add_owner: "Sei già il proprietario.",
      dm_closed: "Non posso inviare la DM: l'utente ha i messaggi privati chiusi.",
      request_failed: "Non sono riuscito a inviare la richiesta in DM. Riprova tra poco.",
      customvoc_recreation_cooldown: "Devi aspettare prima di poter ricreare la vocale privata.",
      discord_rate_limit:
        "Discord limita i rename del canale vocale (circa 2 ogni 10 minuti). Aspetta un po' e riprova — non è un bug del sito.",
      edit_failed: "Non sono riuscito ad aggiornare su Discord. Riprova tra poco.",
      invalid_params: "Parametri non validi.",
      invalid_hex: "Colore HEX non valido. Esempio: #ff66cc.",
      invalid_icon_value: "Valore icona non valido. Usa un'emoji unicode, <:nome:id>, o un URL https.",
      invalid_emoji: "Emoji non valida. Usa un'emoji standard unicode (es. 🎧).",
      unsafe_url: "URL non sicuro o non supportato. Usa un link https pubblico.",
      invalid_action: "Azione non valida per questo target.",
    };
    const reason = result.reason || "unknown";
    return {
      ok: false,
      status: statusMap[reason] || 500,
      error: reason,
      message: result.message || messageMap[reason] || "Errore sconosciuto.",
      detail: result.detail || undefined,
    };
  }

    try {
    const doc = await CustomRole.findOne(
      { guildId: guild.id, userId: String(userId) },
      { roleId: 1, secondaryRoleId: 1, customVocChannelId: 1 },
    )
      .lean()
      .catch(() => null);
    const roleIds = [doc?.roleId, doc?.secondaryRoleId].map((x) => String(x || "").trim()).filter(Boolean);
    const channelId = String(doc?.customVocChannelId || "").trim();
    await Promise.all([
      ...roleIds.map((id) => guild.roles.fetch(id).catch(() => null)),
      channelId ? guild.channels.fetch(channelId).catch(() => null) : Promise.resolve(null),
      guild.members.fetch({ user: userId, force: true }).catch(() => null),
    ]);
  } catch (_) {
      }

  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean, customProfile, voiceActivity] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, userId),
    hasEventWeekWinnerGrant(guild.id, userId, 2).catch(() => false),
    hasEventWeekWinnerGrant(guild.id, userId, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(guild.id, userId),
    buildCustomProfileData(guild, userId),
    loadVoiceWeeklyActivity(guild.id, userId),
  ]);
  const pmBundle = partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  const primarySlotUnlock = hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || pmBundle;

  return {
    ok: true,
    status: 200,
    message: result.message || "Operazione completata.",
    userId,
    featureAccess: {
      customRolePrimary: getCustomRoleSlotCapWithContest(member, primarySlotUnlock) >= 1,
      customRoleSecondary: getCustomRoleSlotCapFromRoles(member) >= 2,
      customVoc: memberCanCreateCustomVoc(member) || hasExtraUnlock || pmBundle,
    },
    permissions: {
      gradientHolo: memberHasGradientHoloAccess(member),
    },
    requirements: buildRequirementsMeta(),
    voiceActivity: voiceActivity || null,
    primary: customProfile?.role || null,
    secondary: customProfile?.secondaryRole || null,
    voice: customProfile?.voice || null,
    expiresAt: customProfile?.expiresAt || "",
    state: {
      primary: customProfile?.role || null,
      secondary: customProfile?.secondaryRole || null,
      voice: customProfile?.voice || null,
      expiresAt: customProfile?.expiresAt || "",
    },
  };
}

async function handleRoleMutation({ client, guild, member, ownerId, slot, action, payload }) {
  if (action === "create") {
    return createCustomRole({ client, guild, member, ownerId, slot });
  }

  if (action === "delete") {
    return deleteCustomRole({ client, guild, member, ownerId, slot });
  }

  const state = await resolveCustomRoleState({ guild, userId: ownerId, client, cleanupExpired: true }).catch(() => null);
  if (!state || state.status !== "active") return { ok: false, reason: "no_custom_role" };

  const role = slot === "secondary" ? state.secondaryRole : state.role;
  if (!role) return { ok: false, reason: "no_custom_role" };
  const roleId = role.id;

  if (action === "rename" || action === "name") {
    const name = String(payload?.name || "").trim();
    return renameCustomRole({ guild, member, ownerId, roleId, name });
  }

  if (action === "color") {
    const mode = String(payload?.mode || "solid").trim();
    const hex = String(payload?.hex || payload?.color || payload?.primary || "").trim();
    const hex2 = String(payload?.hex2 || payload?.secondary || "").trim();
    return setCustomRoleColor({ guild, member, ownerId, roleId, mode, hex, hex2 });
  }

  if (action === "icon") {
    const value = String(payload?.value || "").trim();
    return setCustomRoleIcon({ guild, member, ownerId, roleId, value });
  }

  if (action === "members_add") {
    const memberId = String(payload?.memberId || "").trim();
    if (!/^\d{17,20}$/.test(memberId)) return { ok: false, reason: "invalid_params" };
    return addCustomRoleMember({ client, guild, ownerId, roleId, memberId });
  }

  if (action === "members_remove") {
    const memberId = String(payload?.memberId || "").trim();
    if (!/^\d{17,20}$/.test(memberId)) return { ok: false, reason: "invalid_params" };
    return removeCustomRoleMember({ guild, ownerId, roleId, memberId });
  }

  return { ok: false, reason: "invalid_action" };
}

async function handleVocMutation({ client, guild, member, ownerId, action, payload }) {
  if (action === "create") {
    return createCustomVoc({ client, guild, member, ownerId });
  }

  if (action === "delete") {
    return deleteCustomVoc({ client, guild, ownerId });
  }

  if (action === "rename" || action === "name") {
    const baseName = String(payload?.name || payload?.baseName || "").trim();
    if (!baseName) return { ok: false, reason: "invalid_params" };
    return renameCustomVoc({ guild, ownerId, baseName });
  }

  if (action === "emoji") {
    const emoji = String(payload?.emoji || "").trim();
    if (!emoji) return { ok: false, reason: "invalid_params" };
    return setCustomVocEmoji({ guild, ownerId, emoji });
  }

  if (action === "members_add") {
    const memberId = String(payload?.memberId || "").trim();
    if (!/^\d{17,20}$/.test(memberId)) return { ok: false, reason: "invalid_params" };
    return addCustomVocMember({ guild, ownerId, memberId });
  }

  if (action === "members_remove") {
    const memberId = String(payload?.memberId || "").trim();
    if (!/^\d{17,20}$/.test(memberId)) return { ok: false, reason: "invalid_params" };
    return removeCustomVocMember({ guild, ownerId, memberId });
  }

  return { ok: false, reason: "invalid_action" };
}

module.exports = {
  getCustomProfileCustomization,
  getCustomProfileGuildEmojis,
  mutateCustomProfile,
};
