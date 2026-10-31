const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { memberHasStaffRole, getStaffListPausedUserIds } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { ensureWebsiteGuild } = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const {
  getCachedStaffRoster,
  identityFromMember,
  memberIsPm,
} = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { buildRoster, buildMemberDetail } = require("./staffManageDetail") as typeof import("./staffManageDetail");
const { MANAGE_ACTIONS, PM_GESTORE_MANAGE_ACTIONS, assertManageAccess, resolveManageTargetMember, handleSiteStaffManagePost } = require("./staffManagePost") as typeof import("./staffManagePost");


function filterRosterForPmGestore(roster?) {
  const pmRoleId = String(IDs.roles?.PartnerManager || "").trim();
  const sections = Array.isArray(roster?.sections)
    ? roster.sections.filter((sec?) => {
        if (pmRoleId && String(sec?.roleId || "") === pmRoleId) return true;
        const label = String(sec?.roleLabel || "").toLowerCase();
        return label.includes("partner");
      })
    : [];
  const members = sections.flatMap((sec?) => (Array.isArray(sec.members) ? sec.members : []));
  return {
    ...roster,
    sections,
    counts: {
      ...(roster?.counts && typeof roster.counts === "object" ? roster.counts : {}),
      total: members.length,
      pm: members.length,
    },
  };
}

async function handleSiteStaffManageGet(client?, req?, res?) {
  try {
    const access = await assertManageAccess(client, req);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const targetId = String(req.query?.userId || req.query?.target || "").trim();
    const skipHeavyRoster = Boolean(targetId) && String(req.query?.roster || "1") === "0";
    const forceMember = String(req.query?.fresh || "") === "1";

    let roster: any = { sections: [], paused: new Set(), counts: { total: 0, onPause: 0 }, guild: null };
    if (!skipHeavyRoster) {
      roster = await buildRoster(client);
      if (access.pmManageOnly) {
        roster = filterRosterForPmGestore(roster);
      }
    } else {
      // manageSheetFast1: modal Gestisci needs member detail, not full roster stats.
      try {
        const light = await getCachedStaffRoster(client);
        if (light?.ok) {
          roster = {
            sections: [],
            paused: light.paused || new Set(),
            counts: light.counts || { total: 0, onPause: 0 },
            guild: light.guild || null,
          };
        }
      } catch (eLight) {}
      try {
        if (!roster.paused || !(roster.paused instanceof Set) || roster.paused.size === 0) {
          const guildId = String(IDs.guilds.main || "");
          const paused = await getStaffListPausedUserIds(guildId).catch(() => null);
          if (paused) roster.paused = paused;
        }
      } catch (ePause) {}
    }

    const guildId = String(IDs.guilds.main || "");
    let guild =
      roster.guild ||
      (await ensureWebsiteGuild(client, guildId).catch(() => null)) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    let member = null;
    if (targetId) {
      if (!/^\d{16,22}$/.test(targetId)) {
        return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
      }
      const resolved = await resolveManageTargetMember(client, guild, targetId, { force: forceMember });
      guild = resolved.guild || guild;
      const targetMember = resolved.member;
      if (!targetMember) {
        return res.status(resolved.unavailable ? 503 : 404).json({
          ok: false,
          error: resolved.unavailable ? "member_unavailable" : "not_found",
          message: resolved.unavailable
            ? "Membro non raggiungibile (Discord lento). Riprova tra poco."
            : "Membro non trovato nel server.",
        });
      }
      if (access.pmManageOnly) {
        if (!memberIsPm(targetMember)) {
          return res.status(403).json({
            ok: false,
            error: "forbidden",
            message: "Come gestore PM puoi gestire solo i Partner Manager.",
          });
        }
      } else if (!memberHasStaffRole(targetMember) && !memberIsPm(targetMember)) {
        /* prospectPexSwitch1: high staff writers possono aprire la scheda Carriera su Member */
        if (!access.canWrite) {
          return res.status(400).json({
            ok: false,
            error: "not_staff",
            message: "L'utente selezionato non è nello staff.",
          });
        }
      }
      member = await buildMemberDetail(guild, targetMember, roster.paused, access.member);
    }

    const allowedActions = access.readOnly
      ? ["pause_cancel"]
      : access.pmManageOnly
        ? [...PM_GESTORE_MANAGE_ACTIONS]
        : [...MANAGE_ACTIONS];

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      canManage: Boolean(access.canWrite),
      readOnly: Boolean(access.readOnly),
      selfService: Boolean(access.readOnly),
      selfActions: access.readOnly ? ["pause_cancel", "neg_trade"] : [],
      pmManageOnly: Boolean(access.pmManageOnly),
      viewer: identityFromMember(access.member),
      counts: roster.counts,
      sections: roster.sections,
      member,
      actions: allowedActions,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-manage GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffManageGet,
  handleSiteStaffManagePost,
  buildRoster,
  buildMemberDetail,
  MANAGE_ACTIONS,
};
