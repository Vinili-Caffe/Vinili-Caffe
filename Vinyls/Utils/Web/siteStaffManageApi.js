const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { memberHasStaffRole, getStaffListPausedUserIds } = require("../Community/staffListUtils");
const {
  resolveStaffProfileDisplayRoleId,
  buildFullProfileRoleLabelForEmbed,
  resolveStaffProfileKind,
  resolveStaffPartnerPointsDisplay,
} = require("../Staff/staffProfilePanelRuntime");
const {
  resolvePartnerPointsShown,
  resolvePartnerTotalEarned,
} = require("../Staff/partnerPointsDisplayUtils");
const {
  runProfileStaffPex,
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
  getHighestLadderRole,
} = require("../Staff/staffPanelActions");
const {
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
} = require("../Staff/valutazionePanelActions");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi");
const {
  getCachedStaffRoster,
  identityFromMember,
  memberIsPm,
  stripDiscordDecorations,
  invalidateStaffRosterCache,
} = require("./siteStaffRosterCache");

const MANAGE_ACTIONS = new Set([
  "pex",
  "depex",
  "depex_pm",
  "depex_full",
  "val_pos",
  "val_neg",
  "val_pos_rm",
  "val_neg_rm",
  "warn_add",
  "warn_rm",
]);

function cleanActionMessage(msg) {
  return stripDiscordDecorations(msg) || "Operazione non riuscita.";
}

function indexedReasonLines(list, limit = 40) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  const start = Math.max(0, list.length - limit);
  for (let i = start; i < list.length; i += 1) {
    const raw = list[i];
    const text =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    out.push({
      id: i + 1,
      text: text || `(voce #${i + 1})`,
    });
  }
  return out.reverse();
}

function serializeRolesHistory(guild, hist, limit = 12) {
  if (!Array.isArray(hist) || !hist.length) return [];
  const out = [];
  for (let i = hist.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const row = hist[i];
    if (!row) continue;
    const oldId = String(row.oldRole || "");
    const newId = String(row.newRole || "");
    const oldName = guild?.roles?.cache?.get(oldId)?.name || oldId || "—";
    const newName = guild?.roles?.cache?.get(newId)?.name || newId || "—";
    out.push({
      from: stripDiscordDecorations(oldName) || oldName,
      to: stripDiscordDecorations(newName) || newName,
      reason: stripDiscordDecorations(row.reason || "") || null,
      date: row.date ? new Date(row.date).toISOString() : null,
    });
  }
  return out;
}

async function buildRoster(client) {
  const roster = await getCachedStaffRoster(client);
  if (!roster?.ok) {
    return { sections: [], paused: new Set(), counts: { total: 0, onPause: 0 } };
  }
  const sections = (roster.sections || []).map((sec) => ({
    roleId: sec.roleId,
    roleLabel: sec.roleLabel,
    color: sec.color,
    members: (sec.members || []).map((m) => ({ ...m })),
  }));
  const userIds = [];
  for (const sec of sections) {
    for (const m of sec.members) userIds.push(m.userId);
  }
  const guildId = String(roster.guildId || IDs.guilds.main || "");
  const docs = await ActivityUserProfile.find(
    { guildId, userId: { $in: userIds } },
    {
      userId: 1,
      "staff.positiveCount": 1,
      "staff.negativeCount": 1,
      "staff.warnCount": 1,
    },
  )
    .lean()
    .catch(() => []);
  const statsByUser = new Map();
  for (const doc of docs || []) {
    statsByUser.set(String(doc.userId), {
      positive: Math.max(0, Math.floor(Number(doc.staff?.positiveCount || 0))),
      negative: Math.max(0, Math.floor(Number(doc.staff?.negativeCount || 0))),
      warn: Math.max(0, Math.floor(Number(doc.staff?.warnCount || 0))),
    });
  }
  for (const sec of sections) {
    for (const m of sec.members) {
      const s = statsByUser.get(m.userId) || { positive: 0, negative: 0, warn: 0 };
      m.positive = s.positive;
      m.negative = s.negative;
      m.warn = s.warn;
    }
  }
  return {
    sections,
    paused: roster.paused || new Set(),
    counts: {
      total: roster.counts?.total || 0,
      onPause: roster.counts?.onPause || 0,
    },
    guild: roster.guild,
  };
}

async function buildMemberDetail(guild, targetMember, pausedSet) {
  const guildId = String(guild.id);
  const uid = String(targetMember.id);
  const doc = await ActivityUserProfile.findOne({ guildId, userId: uid })
    .select("staff")
    .lean()
    .catch(() => null);
  const staff = doc?.staff || {};
  const displayRoleId = resolveStaffProfileDisplayRoleId(targetMember);
  let label = buildFullProfileRoleLabelForEmbed(guild, targetMember);
  label = stripDiscordDecorations(label) || "Staff";
  const ladderRoleId = getHighestLadderRole(targetMember) || null;
  const ladderRole = ladderRoleId ? guild.roles.cache.get(ladderRoleId) : null;

  return {
    ...identityFromMember(targetMember),
    displayRoleId: displayRoleId || null,
    displayRoleLabel: label,
    profileKind: resolveStaffProfileKind(targetMember),
    isPm: memberIsPm(targetMember),
    onPause: Boolean(pausedSet?.has?.(uid)),
    ladderRoleId,
    ladderRoleLabel: ladderRole ? stripDiscordDecorations(ladderRole.name) || ladderRole.name : null,
    canPex: Boolean(ladderRoleId),
    canDepexLadder: Boolean(ladderRoleId),
    canDepexPm: memberIsPm(targetMember),
    valutazioni: {
      positive: Math.max(0, Math.floor(Number(staff.positiveCount || 0))),
      negative: Math.max(0, Math.floor(Number(staff.negativeCount || 0))),
      positiveEntries: indexedReasonLines(staff.positiveReasons, 40),
      negativeEntries: indexedReasonLines(staff.negativeReasons, 40),
    },
    warn: {
      count: Math.max(0, Math.floor(Number(staff.warnCount || 0))),
      entries: indexedReasonLines(staff.warnReasons, 40),
    },
    partner: {
      pointsEarned: Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || resolveStaffPartnerPointsDisplay(staff) || 0))),
      pointsSpendable: Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0))),
      partnerCount: Math.max(0, Math.floor(Number(staff.partnerCount || 0))),
    },
    rolesHistory: serializeRolesHistory(guild, staff.rolesHistory, 16),
  };
}

async function assertManageAccess(client, req) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const access = await assertWebsiteStaffAccess(client, accessToken);
  if (!access.ok) return access;
  if (!memberIsHighStaffEligible(access.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo High Staff può usare la gestione staff dal sito.",
    };
  }
  return access;
}

async function handleSiteStaffManageGet(client, req, res) {
  try {
    const access = await assertManageAccess(client, req);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const roster = await buildRoster(client);
    const guildId = String(IDs.guilds.main || "");
    const guild = roster.guild || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const targetId = String(req.query?.userId || req.query?.target || "").trim();
    let member = null;
    if (targetId) {
      if (!/^\d{16,22}$/.test(targetId)) {
        return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
      }
      const targetMember =
        guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null));
      if (!targetMember) {
        return res.status(404).json({ ok: false, error: "not_found", message: "Membro non trovato nel server." });
      }
      if (!memberHasStaffRole(targetMember) && !memberIsPm(targetMember)) {
        return res.status(400).json({
          ok: false,
          error: "not_staff",
          message: "L'utente selezionato non è nello staff.",
        });
      }
      member = await buildMemberDetail(guild, targetMember, roster.paused);
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      canManage: true,
      viewer: identityFromMember(access.member),
      counts: roster.counts,
      sections: roster.sections,
      member,
      actions: [...MANAGE_ACTIONS],
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-manage GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffManagePost(client, req, res) {
  try {
    const access = await assertManageAccess(client, req);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const targetId = String(body.userId || body.target || "").trim();
    const reason = String(body.reason || "").trim().slice(0, 500);
    const removeId = Math.floor(Number(body.removeId || body.index || 0));

    if (!MANAGE_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
    }
    if (!/^\d{16,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
    }
    if (String(targetId) === String(access.member.id)) {
      return res.status(400).json({
        ok: false,
        error: "self",
        message: "Non puoi usare queste azioni su te stesso.",
      });
    }

    const needsReason = !action.endsWith("_rm");
    if (needsReason && reason.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "bad_reason",
        message: "Inserisci un motivo (almeno 3 caratteri).",
      });
    }
    if (action.endsWith("_rm") && (!Number.isInteger(removeId) || removeId < 1)) {
      return res.status(400).json({
        ok: false,
        error: "bad_index",
        message: "Indica l'ID della voce da rimuovere.",
      });
    }

    const guildId = String(IDs.guilds.main || "");
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const targetMember =
      guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null));
    if (!targetMember) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Membro non trovato nel server." });
    }
    if (!memberHasStaffRole(targetMember) && !memberIsPm(targetMember) && action !== "pex") {
      return res.status(400).json({
        ok: false,
        error: "not_staff",
        message: "L'utente selezionato non è nello staff.",
      });
    }

    const actorUser = access.member.user || access.user;
    const targetUser = targetMember.user || { id: targetId };
    let result = { ok: false, message: "Azione non eseguita." };

    if (action === "pex") {
      result = await runProfileStaffPex(guild, client, targetUser, actorUser, reason);
    } else if (action === "depex") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "ladder");
    } else if (action === "depex_pm") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "partner_manager");
    } else if (action === "depex_full") {
      result = await runProfileStaffCompleteDepex(guild, client, targetUser, access.member, reason);
    } else if (action === "val_pos") {
      result = await runValutazionePositiveAddForPanel(guild, access.member, targetUser, reason);
    } else if (action === "val_neg") {
      result = await runValutazioneNegativeAddForPanel(guild, access.member, targetUser, reason);
    } else if (action === "val_pos_rm") {
      result = await runValutazionePositiveRemoveForPanel(
        guild,
        access.member,
        targetUser,
        removeId,
        reason || `Rimozione val + #${removeId} dal sito`,
      );
    } else if (action === "val_neg_rm") {
      result = await runValutazioneNegativeRemoveForPanel(
        guild,
        access.member,
        targetUser,
        removeId,
        reason || `Rimozione val − #${removeId} dal sito`,
      );
    } else if (action === "warn_add") {
      result = await runProfileStaffWarnAdd(guild, client, targetUser, actorUser, reason);
    } else if (action === "warn_rm") {
      result = await runProfileStaffWarnRemove(
        guild,
        client,
        targetUser,
        actorUser,
        removeId,
        reason || `Rimozione warn #${removeId} dal sito`,
      );
    }

    if (!result?.ok) {
      return res.status(400).json({
        ok: false,
        error: "action_failed",
        message: cleanActionMessage(result?.message),
      });
    }

    if (action === "pex" || action.startsWith("depex")) {
      invalidateStaffRosterCache();
    }

    const paused = await getStaffListPausedUserIds(guildId);
    const refreshed =
      guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null)) || targetMember;
    const member = await buildMemberDetail(guild, refreshed, paused);

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      action,
      message: cleanActionMessage(result.message) || "Operazione completata.",
      member,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-manage POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffManageGet,
  handleSiteStaffManagePost,
};
