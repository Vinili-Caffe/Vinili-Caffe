const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { accountUsername, userAvatarUrlStatic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { assertDashboardHighStaffAccess, isDashboardBotDevUser } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { getTenantProfileSnapshot } = require("../../Services/Partner/tenantProfileProgressService") as typeof import("../../Services/Partner/tenantProfileProgressService");
const {
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
} = require("../../Services/Partner/tenantProfilePreferencesService") as typeof import("../../Services/Partner/tenantProfilePreferencesService");
const { setTenantObjectiveFlag } = require("../../Services/Partner/tenantObjectiveService") as typeof import("../../Services/Partner/tenantObjectiveService");
const {
  listTenantStaffNotifications,
  countUnreadNotifications,
} = require("../../Services/Partner/tenantStaffNotificationService") as typeof import("../../Services/Partner/tenantStaffNotificationService");
const {
  BADGE_DEFS,
  MAX_SELECTED_BADGES,
  NOTIFICATIONS_LIMIT,
  TENANT_LANGUAGE_OPTIONS,
  normalizeTenantLanguage,
  getLanguageLabel,
} = require("../Partner/tenantProfileConstants") as typeof import("../Partner/tenantProfileConstants");

function mainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseDiscordEmoji(raw?) {
  const s = String(raw || "").trim();
  const m = s.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (m) {
    const animated = m[1] === "a";
    const id = m[3];
    return {
      kind: "custom",
      name: m[2],
      id,
      animated,
      url: `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=64&quality=lossless`,
      text: s,
    };
  }
  return { kind: "unicode", text: s || "🎯", url: null };
}

function serializeObjective(row?) {
  const progress = row?.progress && typeof row.progress === "object" ? row.progress : {};
  return {
    id: String(row?.id || "").trim(),
    title: String(row?.title || row?.id || "").trim(),
    desc: String(row?.desc || "").trim(),
    emoji: parseDiscordEmoji(row?.emoji),
    done: progress.done === true,
    current: Number(progress.current) || 0,
    target: Math.max(1, Number(progress.target) || 1),
  };
}

function serializeBadgeCatalog(unlockedBadges?, selectedBadges?) {
  const unlockedMap = new Map(
    (Array.isArray(unlockedBadges) ? unlockedBadges : []).map((b?) => [String(b.id), b]),
  );
  const selected = new Set(
    (Array.isArray(selectedBadges) ? selectedBadges : []).map((id?) => String(id || "").trim()).filter(Boolean),
  );
  return BADGE_DEFS.map((def?) => {
    const unlocked = unlockedMap.get(def.id) || null;
    return {
      id: def.id,
      title: unlocked ? String(unlocked.title || def.id) : def.id,
      desc: unlocked ? String(unlocked.desc || "") : "",
      emoji: parseDiscordEmoji(unlocked?.emoji || def.emoji),
      unlocked: Boolean(unlocked),
      selected: selected.has(def.id),
    };
  });
}

async function resolveProfileUser(client?, userId?) {
  const uid = String(userId || "").trim();
  let user =
    client?.users?.cache?.get(uid) ||
    (await client?.users?.fetch?.(uid).catch(() => null));
  const member =
    client?.guilds?.cache?.get(mainGuildId(client))?.members?.cache?.get(uid) ||
    (await client?.guilds?.cache?.get(mainGuildId(client))?.members?.fetch?.(uid).catch(() => null));
  if (!user && member?.user) user = member.user;
  const username = user
    ? accountUsername(user) || user.username || `User ${uid}`
    : `User ${uid}`;
  const avatarUrl =
    userAvatarUrlStatic(user, { size: 256 }) ||
    (member ? userAvatarUrlStatic(member.user, { size: 256 }) : null);
  return { id: uid, username, avatarUrl: avatarUrl || null };
}

function serializePrefs(prefs?) {
  const src = prefs && typeof prefs === "object" ? prefs : {};
  return {
    suppressManagerPing: src.suppressManagerPing === true,
    ephemeralCommands: src.ephemeralCommands === true,
    language: normalizeTenantLanguage(src.language),
    languageManual: src.languageManual === true,
    selectedBadges: Array.isArray(src.selectedBadges)
      ? src.selectedBadges.map((id?) => String(id || "").trim()).filter(Boolean).slice(0, MAX_SELECTED_BADGES)
      : [],
    notificationsReadAt: src.notificationsReadAt
      ? new Date(src.notificationsReadAt).toISOString()
      : null,
  };
}

function serializeNotification(row?, readAt?) {
  const createdAt = String(row?.createdAt || "").trim();
  const atMs = createdAt ? new Date(createdAt).getTime() : 0;
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  const content = String(row?.content || "").trim();
  return {
    id: String(row?.id || "").trim(),
    content,
    createdAt: createdAt || null,
    at: Number.isFinite(atMs) && atMs > 0 ? atMs : Date.now(),
    read: Boolean(readMs && Number.isFinite(atMs) && atMs <= readMs),
  };
}

async function buildTenantProfilePayload(client?, userId?) {
  const guildId = mainGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  const snapshot = await getTenantProfileSnapshot(guildId, userId, {
    client,
    langUserId: userId,
    evaluateObjectives: false,
  });
  const [user, notifications] = await Promise.all([
    resolveProfileUser(client, userId),
    listTenantStaffNotifications(guildId, NOTIFICATIONS_LIMIT),
  ]);
  const alerts = countUnreadNotifications(notifications, snapshot.prefs.notificationsReadAt);
  const prefs = serializePrefs(snapshot.prefs);

  return {
    ok: true,
    status: 200,
    user,
    isBotDev: isDashboardBotDevUser(client, userId),
    scores: {
      total: Number(snapshot.scores?.total) || 0,
      daily: Number(snapshot.scores?.daily) || 0,
      weekly: Number(snapshot.scores?.weekly) || 0,
      points: Number(snapshot.scores?.points) || 0,
    },
    prefs,
    awardsPercent: Number(snapshot.awardsPercent) || 0,
    alerts,
    qualifiesForMissions: snapshot.qualifiesForMissions === true,
    languageLabel: getLanguageLabel(prefs.language),
    languages: TENANT_LANGUAGE_OPTIONS.map((row?) => ({
      code: row.code,
      label: row.label,
      flag: row.flag,
    })),
    objectives: (snapshot.objectives || []).map(serializeObjective),
    badges: serializeBadgeCatalog(snapshot.unlockedBadges, prefs.selectedBadges),
    notifications: notifications.map((row?) => serializeNotification(row, snapshot.prefs.notificationsReadAt)),
    limits: { maxSelectedBadges: MAX_SELECTED_BADGES },
  };
}

async function getDashboardTenantProfile(client?, accessToken?) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;
  return buildTenantProfilePayload(client, gate.userId);
}

async function patchDashboardTenantProfile(client?, accessToken?, body?) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const guildId = mainGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  const patch = body && typeof body === "object" ? body : {};
  const current = await getTenantProfilePrefs(guildId, gate.userId);
  const next: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(patch, "suppressManagerPing")) {
    next.suppressManagerPing = patch.suppressManagerPing === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ephemeralCommands")) {
    next.ephemeralCommands = patch.ephemeralCommands === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "language")) {
    next.language = normalizeTenantLanguage(patch.language);
    next.languageManual = true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "selectedBadges")) {
    const ids = Array.isArray(patch.selectedBadges)
      ? patch.selectedBadges.map((id?) => String(id || "").trim()).filter(Boolean)
      : [];
    const unlocked = await getTenantProfileSnapshot(guildId, gate.userId, {
      client,
      langUserId: gate.userId,
      evaluateObjectives: false,
    });
    const unlockedIds = new Set((unlocked.unlockedBadges || []).map((b?) => String(b.id)));
    const cleaned = [];
    for (const id of ids) {
      if (!unlockedIds.has(id)) continue;
      if (cleaned.includes(id)) continue;
      cleaned.push(id);
      if (cleaned.length >= MAX_SELECTED_BADGES) break;
    }
    if (ids.length > MAX_SELECTED_BADGES) {
      return {
        ok: false,
        status: 400,
        error: "badge_limit",
        message: `Puoi selezionare al massimo ${MAX_SELECTED_BADGES} badge.`,
      };
    }
    next.selectedBadges = cleaned;
  }
  if (patch.markNotificationsRead === true) {
    next.notificationsReadAt = new Date();
  }
  if (patch.toggleSuppressManagerPing === true) {
    next.suppressManagerPing = !current.suppressManagerPing;
  }
  if (patch.toggleEphemeralCommands === true) {
    next.ephemeralCommands = !current.ephemeralCommands;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "toggleBadgeId")) {
    const badgeId = String(patch.toggleBadgeId || "").trim();
    const unlocked = await getTenantProfileSnapshot(guildId, gate.userId, {
      client,
      langUserId: gate.userId,
      evaluateObjectives: false,
    });
    const unlockedIds = new Set((unlocked.unlockedBadges || []).map((b?) => String(b.id)));
    if (!unlockedIds.has(badgeId)) {
      return { ok: false, status: 400, error: "badge_locked", message: "Badge non ancora sbloccato." };
    }
    const selected = [...(current.selectedBadges || [])];
    const idx = selected.indexOf(badgeId);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else if (selected.length >= MAX_SELECTED_BADGES) {
      return {
        ok: false,
        status: 400,
        error: "badge_limit",
        message: `Puoi selezionare al massimo ${MAX_SELECTED_BADGES} badge.`,
      };
    } else {
      selected.push(badgeId);
    }
    next.selectedBadges = selected;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "removeBadgeSlot")) {
    const slot = Math.max(0, Math.min(1, Number(patch.removeBadgeSlot) || 0));
    const selected = [...(current.selectedBadges || [])];
    if (selected[slot]) {
      selected.splice(slot, 1);
      next.selectedBadges = selected;
    }
  }

  if (Object.keys(next).length) {
    await updateTenantProfilePrefs(guildId, gate.userId, next);
  }

    if (
    patch.toggleEphemeralCommands === true ||
    Object.prototype.hasOwnProperty.call(patch, "ephemeralCommands")
  ) {
    void setTenantObjectiveFlag(client, guildId, gate.userId, "privacySet", {
      userId: gate.userId,
    }).catch(() => null);
  }

  return buildTenantProfilePayload(client, gate.userId);
}

export = {
  getDashboardTenantProfile,
  patchDashboardTenantProfile,
};
