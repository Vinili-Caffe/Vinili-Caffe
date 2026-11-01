
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  fetchWebsiteGuildMember,
  readCachedWebsiteMember,
  clearWebsiteMemberCaches,
} = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi") as typeof import("./siteStaffDashboardApi");
const { readProfileCache, readStaleProfileCache, readAnyStaleProfileCacheForTarget, warmStaffRosterMembers, writeProfileCache, clearStaffProfileCacheForUser } = require("./staffProfileCache") as typeof import("./staffProfileCache");
const { isOnStaffCareerLadder, isPartnerManagerRole } = require("./staffProfileCareer") as typeof import("./staffProfileCareer");
const { buildStaffProfilePayloadForWeb } = require("./staffProfilePayload") as typeof import("./staffProfilePayload");




const STAFF_MEMBER_SOFT_TIMEOUT_MS = 8000;
const STAFF_MEMBER_HARD_TIMEOUT_MS = 14000;

async function handleSiteStaffProfileGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const viewerUserId = String(access.member?.id || access.user?.id || "").trim();
    const requestedUserId = String(req.query?.userId || req.query?.id || "").trim();
    const targetUserId =
      requestedUserId && /^\d{17,20}$/.test(requestedUserId) ? requestedUserId : viewerUserId;
    const isSelf = targetUserId === viewerUserId;
    const wantFresh =
      String(req.query?.fresh || req.query?.nocache || "").trim() === "1" ||
      String(req.query?.fresh || req.query?.nocache || "").trim().toLowerCase() === "true";
    if (wantFresh) {
      clearStaffProfileCacheForUser(targetUserId, { silent: true });
      clearWebsiteMemberCaches(targetUserId);
    }

    const cached = wantFresh ? null : readProfileCache(viewerUserId, targetUserId);
    if (cached) {
      const cachedId = String(cached.identity?.userId || cached.identity?.id || cached.targetUserId || "").trim();
      if (cachedId && cachedId === targetUserId) {
        res.setHeader("Cache-Control", "private, max-age=15");
        return res.status(200).json({
          ...cached,
          cached: true,
          isSelf,
          viewerUserId,
          targetUserId,
          identity: {
            ...(cached.identity && typeof cached.identity === "object" ? cached.identity : {}),
            userId: targetUserId,
          },
        });
      }
      clearStaffProfileCacheForUser(targetUserId, { silent: true });
    }

    /* staffFreshPeerFix1: su peer NON partire da access.member (viewer).
       Con fresh=1 saltavamo il soft-fetch ma targetMember restava il viewer
       → identity_mismatch “Profilo staff incoerente” dopo ogni azione/reload. */
    let targetMember = isSelf ? access.member : null;
    let targetUser = isSelf ? access.member?.user || access.user || null : null;
    if (!isSelf) {
      const guildId = String(IDs.guilds.main || access.member?.guild?.id || "").trim();
      const guild =
        access.member?.guild ||
        client.guilds.cache.get(guildId) ||
        (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) {
        return res.status(503).json({
          ok: false,
          error: "guild_unavailable",
          message: "Server Discord temporaneamente non disponibile.",
        });
      }
      /* peerProfileTimeout1: warm roster (riempie guild.members.cache) prima del fetch peer */
      const warmed = wantFresh ? null : await warmStaffRosterMembers(client, targetUserId);
      const cachedMember = wantFresh
        ? null
        : guild.members.cache.get(targetUserId) ||
          readCachedWebsiteMember(targetUserId) ||
          warmed ||
          null;
      if (cachedMember && String(cachedMember.id || "") === String(targetUserId || "")) {
        targetMember = cachedMember;
      } else {
        // Soft probe first (no negative-cache poison). Fresh/Riprova → hard+force.
        if (!wantFresh) {
          targetMember = await fetchWebsiteGuildMember(guild, targetUserId, {
            timeoutMs: STAFF_MEMBER_SOFT_TIMEOUT_MS,
            retry: true,
            soft: true,
          }).catch(() => null);
        }
        if (!targetMember || String(targetMember.id || "") !== String(targetUserId || "")) {
          // Await a longer resolve before 503 — fire-and-forget left peer switches empty.
          targetMember = await fetchWebsiteGuildMember(guild, targetUserId, {
            timeoutMs: STAFF_MEMBER_HARD_TIMEOUT_MS,
            retry: true,
            soft: true,
            force: Boolean(wantFresh),
          }).catch(() => null);
        }
      }
      if (!targetMember) {
        const { isOnNegativeCache, isUnknownMemberError } = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
        /* leaveProfileLive1: known leave / unknown member → not staff (no stale paint) */
        if (isOnNegativeCache(targetUserId)) {
          return res.status(404).json({
            ok: false,
            error: "not_in_guild",
            message: "Questo utente non è più nel server.",
          });
        }
        /* One hard force resolve before declaring left vs Discord timeout. */
        const forced = await fetchWebsiteGuildMember(guild, targetUserId, {
          timeoutMs: STAFF_MEMBER_HARD_TIMEOUT_MS,
          retry: true,
          soft: false,
          force: true,
        }).catch((err?) => {
          if (isUnknownMemberError(err)) return null;
          return undefined;
        });
        if (forced) {
          targetMember = forced;
        } else if (forced === null || isOnNegativeCache(targetUserId)) {
          return res.status(404).json({
            ok: false,
            error: "not_in_guild",
            message: "Questo utente non è più nel server.",
          });
        } else {
          const stale =
            readStaleProfileCache(viewerUserId, targetUserId) ||
            readAnyStaleProfileCacheForTarget(targetUserId);
          if (stale) {
            const staleId = String(
              stale.identity?.userId || stale.identity?.id || stale.targetUserId || "",
            ).trim();
            if (staleId && staleId === targetUserId) {
              res.setHeader("Cache-Control", "private, max-age=5");
              return res.status(200).json({
                ...stale,
                isSelf: false,
                viewerUserId,
                targetUserId,
                identity: {
                  ...(stale.identity && typeof stale.identity === "object" ? stale.identity : {}),
                  userId: targetUserId,
                },
              });
            }
          }
          return res.status(503).json({
            ok: false,
            error: "member_unavailable",
            message: "Discord non risponde: riprova tra pochi secondi.",
          });
        }
      }
      targetUser = targetMember.user || null;
    }

    const payload: any = await buildStaffProfilePayloadForWeb(client, targetMember, targetUser, {
      allowProspectPex: !isSelf && memberIsHighStaffEligible(access.member),
      viewerMember: access.member,
    });
    if (!payload.ok) {
      return res.status(Number(payload.status) || 403).json(payload);
    }

    if (!isSelf) {
      payload.isSelf = false;
      payload.viewerUserId = viewerUserId;
      payload.targetUserId = targetUserId;
      if (payload.serataFilm) payload.serataFilm.editable = false;
    } else {
      payload.isSelf = true;
      payload.viewerUserId = viewerUserId;
      payload.targetUserId = targetUserId;
    }

    /* staffFreshPeerFix1 / staffIdLock3: se member ≠ target, non inventare stamp — rifetch fallito */
    const identityUid = String(payload.identity?.userId || payload.identity?.id || "").trim();
    const memberUid = String(targetMember?.id || targetUser?.id || "").trim();
    if (targetUserId && memberUid && memberUid !== targetUserId) {
      global.logger?.error?.("[WEBHOOK] site-staff-profile member≠target:", {
        targetUserId,
        identityUid,
        memberUid,
        viewerUserId,
        wantFresh,
      });
      return res.status(503).json({
        ok: false,
        error: "member_unavailable",
        message: "Discord non risponde: riprova tra pochi secondi.",
      });
    }
    if (targetUserId && identityUid && identityUid !== targetUserId) {
      global.logger?.error?.("[WEBHOOK] site-staff-profile identity≠target:", {
        targetUserId,
        identityUid,
        memberUid,
        viewerUserId,
      });
      return res.status(503).json({
        ok: false,
        error: "member_unavailable",
        message: "Discord non risponde: riprova tra pochi secondi.",
      });
    }
    if (payload.identity && typeof payload.identity === "object" && targetUserId) {
      payload.identity.userId = targetUserId;
    }
    payload.targetUserId = targetUserId;

    /* profilePendingBadges1: count pending legati alle card (pause / resoconti / punti tolti). */
    try {
      const guildId = String(IDs.guilds?.main || targetMember?.guild?.id || "").trim();
      const uid = String(targetUserId || "").trim();
      if (guildId && uid) {
        const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
        const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
        let weekKey = "";
        try {
          const { getResocontoCycleWeekKey } = require("../../Services/Staff/weeklyStaffResocontoService") as typeof import("../../Services/Staff/weeklyStaffResocontoService");
          weekKey = String(getResocontoCycleWeekKey() || "").trim();
        } catch (_) {
          weekKey = "";
        }
        /* resoPendBadge1: non contare doc status=pending già deciduti nel content Discord */
        const resoFilter: Record<string, any> = {
          docType: WORKFLOW_DOC,
          guildId,
          workflowQueue: "resoconti",
          status: "pending",
          userId: uid,
        };
        if (weekKey) resoFilter.workflowWeekKey = weekKey;

        const countResoPending = async () => {
          const docs = await SiteDocument.find(resoFilter)
            .select("_id status content body")
            .lean()
            .maxTimeMS(6000)
            .catch(() => []);
          if (!Array.isArray(docs) || !docs.length) return 0;
          let resolveStatus = null;
          try {
            ({ resolveResocontoDocStatus: resolveStatus } = require("../workflow/siteStaffWorkflowStore"));
          } catch (_) {
            resolveStatus = null;
          }
          let pending = 0;
          const healIds = [];
          for (const doc of docs) {
            const st = resolveStatus
              ? String(resolveStatus(doc) || "pending").toLowerCase()
              : "pending";
            if (st === "pending") {
              pending += 1;
            } else if (doc?._id) {
              healIds.push({ id: doc._id, status: st });
            }
          }
          if (healIds.length) {
            void Promise.all(
              healIds.map((row?) =>
                SiteDocument.updateOne(
                  { _id: row.id, status: "pending" },
                  { $set: { status: row.status, decidedAt: new Date() } },
                ).catch(() => null),
              ),
            ).then(() => {
              try {
                clearStaffProfileCacheForUser(uid, { action: "reso_heal", silent: false });
              } catch (_) {}
            });
          }
          return pending;
        };

        const tasks = [countResoPending()];
        if (payload.partner) {
          const { SitePmPointsRemovedEntry } = require("../../Schemas/Web/sitePmPointsRemovedSchemas") as typeof import("../../Schemas/Web/sitePmPointsRemovedSchemas");
          tasks.push(
            SitePmPointsRemovedEntry.countDocuments({
              guildId,
              pmUserId: uid,
              status: "pending",
            }).catch(() => 0),
          );
        } else {
          tasks.push(Promise.resolve(0));
        }
        const [resoPending, ptPending] = await Promise.all(tasks);
        payload.resoconto = {
          ...(payload.resoconto && typeof payload.resoconto === "object" ? payload.resoconto : {}),
          pendingCount: Math.max(0, Math.floor(Number(resoPending) || 0)),
          weekKey: weekKey || null,
        };
        if (payload.partner) {
          payload.partner.pendingPuntiTolti = Math.max(0, Math.floor(Number(ptPending) || 0));
        }
      }
    } catch (errPend) {
      global.logger?.warn?.("[WEBHOOK] site-staff-profile pending badges:", errPend?.message || errPend);
    }

    writeProfileCache(viewerUserId, targetUserId, payload);
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-profile:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffProfileGet,
  buildStaffProfilePayloadForWeb,
  clearStaffProfileCacheForUser,
};
