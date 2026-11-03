/** Workflow staff: elenco delle richieste per lo staff (filtri e pagine). */
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { RESOCONTO_LIST_ROLE_RANK, RESOCONTO_LIST_RANK_FALLBACK, cleanPauseSubjectDisplayName } = require("./workflowLabels") as typeof import("./workflowLabels");
const { isGenericWorkflowSubjectLabel, pickSubjectDisplayName, hasRealDiscordAvatarUrl, preferAnimatedStoredAvatarUrl, isWorkflowRoleSlug } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { docToListItem } = require("./workflowSerialize") as typeof import("./workflowSerialize");
const { WORKFLOW_DOC } = require("./workflowWrites") as typeof import("./workflowWrites");
const { listResocontiWeeks } = require("./workflowQueries") as typeof import("./workflowQueries");

async function listStaffWorkflowFromDb(client?, guildId?, queue?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(opts.pageSize) || 20));
  const gid = String(guildId || "").trim();
  const q = String(queue || "").trim().toLowerCase();
  const filter: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: q };
  const scopedUserId = String(opts.userId || "").trim();
  /* resoProfile1: cronologia profilo — un solo staffer */
  if (/^\d{16,22}$/.test(scopedUserId)) {
    filter.userId = scopedUserId;
  }
  if (scope === "pending") {
    filter.status = "pending";
  } else if (q === "pause" && !filter.userId) {
        try {
      const { loadRosterSnapshot } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
      const snap = await loadRosterSnapshot(gid).catch(() => null);
      const ids = (Array.isArray(snap?.userIds) ? snap.userIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id));
      if (ids.length) filter.userId = { $in: ids };
    } catch (_) {}
  }

  const roleFilter = String(opts.filter || "").trim().toLowerCase();
  if (roleFilter && roleFilter !== "all") {
    if (q === "candidature") {
      if (roleFilter === "helper" || roleFilter === "partnermanager" || roleFilter === "pm" || roleFilter === "blogger") {
        filter.workflowType = roleFilter === "pm" ? "partnermanager" : roleFilter;
      }
    } else if (q === "appelli") {
      if (roleFilter === "unban" || roleFilter === "unmute") filter.workflowKind = roleFilter;
    } else if (q === "revisione") {
      if (roleFilter === "server" || roleFilter === "bot") filter.workflowKind = roleFilter;
    } else if (q === "pause") {
      if (roleFilter === "staff") {
                filter.$and = [
          ...(Array.isArray(filter.$and) ? filter.$and : []),
          {
            $or: [
              { "workflowFields.ruoloTrack": "Staff" },
              {
                "workflowFields.ruoloTrack": { $nin: ["Staff", "PartnerManager", "Entrambi"] },
                "workflowFields.ruoloRichiesto": {
                  $nin: ["PartnerManager", "Entrambi", "Partner Manager"],
                },
              },
            ],
          },
        ];
      } else if (roleFilter === "pm" || roleFilter === "partnermanager") {
        filter.$or = [
          { "workflowFields.ruoloTrack": "PartnerManager" },
          { "workflowFields.ruoloRichiesto": "PartnerManager" },
          { "workflowFields.ruoloRichiesto": "Partner Manager" },
        ];
      } else if (roleFilter === "both" || roleFilter === "entrambi") {
        filter.$or = [
          { "workflowFields.ruoloTrack": "Entrambi" },
          { "workflowFields.ruoloRichiesto": "Entrambi" },
        ];
      }
    } else if (q === "resoconti") {
      if (roleFilter === "staff" || roleFilter === "s") filter.workflowKind = "s";
      else if (roleFilter === "pm" || roleFilter === "p" || roleFilter === "partnermanager") {
        filter.workflowKind = "p";
      }
    }
  }

  let weeks = [];
  let week = String(opts.week || opts.weekKey || "").trim();
  if (q === "resoconti") {
    if (!week) {
      try {
        const { getResocontoCycleWeekKey } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");
        week = String(getResocontoCycleWeekKey() || "").trim();
      } catch {
        week = "";
      }
    }
    weeks = await listResocontiWeeks(gid, {
      scope,
      filter: roleFilter,
      userId: scopedUserId || undefined,
    });
    if (!week && weeks.length) week = String(weeks[0].weekKey || "");
    if (week) filter.workflowWeekKey = week;
  }

  const skip = (page - 1) * pageSize;

  /* inboxLoadFast1: lista slim — niente content/body pesanti in list */
  const listProject = {
    content: 0,
    "workflowFields.description": 0,
    "workflowFields.body": 0,
    "workflowFields.markdown": 0,
    "workflowFields.answers": 0,
    "workflowMeta.raw": 0,
  };

  const resocontoRoleBranches = [...RESOCONTO_LIST_ROLE_RANK.entries()].map(([roleId, rank]) => ({
    case: { $eq: ["$workflowRoleId", roleId] },
    then: rank,
  }));
  const sortTsExpr = {
    $cond: {
      if: {
        $regexMatch: {
          input: { $toString: { $ifNull: ["$workflowMessageId", ""] } },
          regex: "^\\d{16,20}$",
        },
      },
      then: {
        $add: [
          {
            $toLong: {
              $floor: {
                $divide: [
                  { $convert: { input: "$workflowMessageId", to: "long", onError: 0, onNull: 0 } },
                  4194304,
                ],
              },
            },
          },
          1420070400000,
        ],
      },
      else: { $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 } },
    },
  };
  const sortStages: any[] =
    q === "resoconti"
      ? [
          {
            $addFields: {
              _sortRole: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$workflowKind", "p"] }, then: 0 },
                    ...resocontoRoleBranches,
                  ],
                  default: RESOCONTO_LIST_RANK_FALLBACK,
                },
              },
              _sortTs: sortTsExpr,
              _sortCreated: {
                $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 },
              },
            },
          },
          { $sort: { _sortRole: 1, _sortTs: 1, _sortCreated: 1, _id: 1 } },
          { $skip: skip },
          { $limit: pageSize },
          { $project: { _sortRole: 0, _sortTs: 0, _sortCreated: 0, ...listProject } },
        ]
      : [
          {
            $addFields: {
              _sortTs: sortTsExpr,
              _sortCreated: {
                $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 },
              },
            },
          },
          { $sort: { _sortTs: -1, _sortCreated: -1, _id: -1 } },
          { $skip: skip },
          { $limit: pageSize },
          { $project: { _sortTs: 0, _sortCreated: 0, ...listProject } },
        ];

  /* inboxLoadFast1 + inboxApiBoot1: page 1 → skip countDocuments (approx total);
     page≥2 o exact → count ∥ aggregate. */
  const skipExactCount = opts.skipExactCount === true && page === 1 && !opts.exactTotal;
  let total = 0;
  let aggDocs = null;
  if (skipExactCount) {
    aggDocs = await (SiteDocument.aggregate([{ $match: filter }, ...sortStages]) as any)
      .option({ maxTimeMS: 4000 })
      .catch(() => null);
  } else {
    const pair = await Promise.all([
      SiteDocument.countDocuments(filter).maxTimeMS(4000).catch(() => 0),
      (SiteDocument.aggregate([{ $match: filter }, ...sortStages]) as any)
        .option({ maxTimeMS: 4000 })
        .catch(() => null),
    ]);
    total = pair[0];
    aggDocs = pair[1];
  }
  let docs = aggDocs;
  if (!Array.isArray(docs)) {
    const pageDocs = await SiteDocument.find(filter)
      .select("-content -workflowFields.description -workflowFields.body -workflowFields.markdown -workflowFields.answers -workflowMeta.raw")
      .sort({ createdAt: q === "resoconti" ? 1 : -1 })
      .skip(skip)
      .limit(pageSize)
      .maxTimeMS(4000)
      .lean()
      .catch(() => []);
    docs = Array.isArray(pageDocs) ? pageDocs : [];
  }

      let items = (docs || []).map((doc?) => docToListItem(doc, null));
  if (skipExactCount) {
    /* hasMore se pagina piena — total minimo per FE badge/empty */
    total = items.length < pageSize ? items.length : page * pageSize + 1;
  }

    if (q === "pause" && client && items.length) {
    try {
      const { resolveWebUserIdentitiesBatch, safeDisplayLabel } = require("../../site/http/siteWebUserIdentity") as typeof import("../../site/http/siteWebUserIdentity");
    const guild =
        client.guilds?.cache?.get(gid) || (await client.guilds?.fetch?.(gid).catch(() => null));
      const needIds = items.map((it?) => String(it.userId || "").trim()).filter(Boolean);
      /* inboxLoadFast1: pause list = cache-only (max ~120ms), niente storm Discord */
      const identityMap = await resolveWebUserIdentitiesBatch(client, guild, needIds, {
        cacheOnly: true,
        fillFallback: false,
        cap: 40,
        budgetMs: 120,
      });
      items = items.map((item?) => {
        const hit = identityMap?.get?.(String(item.userId || ""));
        if (!hit) return item;
        const cleaned =
          cleanPauseSubjectDisplayName(hit.displayName, item.userId) ||
          cleanPauseSubjectDisplayName(hit.username, item.userId) ||
          cleanPauseSubjectDisplayName(safeDisplayLabel(hit.displayName, item.userId, ""), item.userId);
        return {
          ...item,
          displayName: cleaned || item.displayName,
          avatarUrl: hit.avatarUrl || item.avatarUrl,
        };
      });
    } catch (_) {}
  }

  // Candidature/appelli: hydrate names/avatars (user fetch only — no guild member storms).
  // Cache first, then a real user-only budget so list titles stop falling back to "Candidatura Helper #N".
  if ((q === "candidature" || q === "appelli") && client && items.length) {
    try {
      const { resolveWebUserIdentitiesBatch, safeDisplayLabel, FALLBACK_LABEL } = require("../../site/http/siteWebUserIdentity") as typeof import("../../site/http/siteWebUserIdentity");
      const guild = client.guilds?.cache?.get(gid) || null;
      const needIds = items
        .map((it?) => String(it.userId || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id));
      const identityMap = await resolveWebUserIdentitiesBatch(client, guild, needIds, {
        cacheOnly: true,
        fillFallback: false,
        cap: 40,
        budgetMs: 50,
      });
      const stillNeed = needIds.filter((uid?) => {
        const hit = identityMap.get(uid);
        const item = items.find((it?) => String(it.userId || "").trim() === uid);
        const avatarOk =
          hasRealDiscordAvatarUrl(hit?.avatarUrl) || hasRealDiscordAvatarUrl(item?.avatarUrl);
        const name = String(hit?.displayName || "").trim();
        const nameBad = !name || name === FALLBACK_LABEL || name === uid;
        /* inboxAvatarFetch1: fetch anche se manca solo l'avatar (prima solo il nome) */
        return nameBad || !avatarOk;
      });
      if (stillNeed.length && !(opts.hydrateCacheOnly === true || opts.fast === true)) {
        /* inboxLoadFast1: budget corto — lista prima, hydrate pesante sul detail */
        /* inboxApiBoot1: boot/fast = solo cache (niente +280ms Discord sul primo paint) */
        const fetched = await resolveWebUserIdentitiesBatch(client, guild, stillNeed, {
          cap: 16,
          batchSize: 8,
          budgetMs: 280,
          skipGuildMember: true,
          fillFallback: false,
        });
        if (fetched && typeof fetched.forEach === "function") {
          fetched.forEach((val?, key?) => {
            if (val) identityMap.set(key, val);
          });
        }
      }
      const persistOps = [];
      items = items.map((item?, idx?) => {
        const uid = String(item.userId || "").trim();
        const hit = identityMap.get(uid);
        if (!hit) return item;
        const current = String(item.displayName || "").trim();
        const currentMissing =
          !current ||
          current === uid ||
          /^\d{16,22}$/.test(current) ||
          isGenericWorkflowSubjectLabel(current) ||
          isWorkflowRoleSlug(current, { workflowType: item.type || item.kind || "" });
        const resolvedName = pickSubjectDisplayName(
          uid,
          hit.displayName && hit.displayName !== FALLBACK_LABEL ? hit.displayName : "",
          hit.username,
          safeDisplayLabel(
            hit.displayName && hit.displayName !== FALLBACK_LABEL ? hit.displayName : hit.username,
            uid,
            "",
          ),
        );
        const nextName = currentMissing ? resolvedName || item.displayName || "" : item.displayName;
        const nextAvatar =
          preferAnimatedStoredAvatarUrl(hit.avatarUrl, 128) ||
          preferAnimatedStoredAvatarUrl(item.avatarUrl, 128) ||
          (hasRealDiscordAvatarUrl(hit.avatarUrl) ? String(hit.avatarUrl).trim() : "") ||
          (hasRealDiscordAvatarUrl(item.avatarUrl) ? String(item.avatarUrl).trim() : "") ||
          "";
        const doc = docs[idx];
        if (
          doc?._id &&
          ((nextName && nextName !== String(doc.workflowSubjectName || "").trim()) ||
            (hasRealDiscordAvatarUrl(nextAvatar) &&
              nextAvatar !== String(doc.workflowSubjectAvatarUrl || "").trim()))
        ) {
          persistOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  ...(nextName ? { workflowSubjectName: String(nextName).slice(0, 120) } : {}),
                  ...(hasRealDiscordAvatarUrl(nextAvatar)
                    ? { workflowSubjectAvatarUrl: String(nextAvatar).slice(0, 512) }
                    : {}),
                },
              },
            },
          });
        }
        return {
          ...item,
          displayName: nextName,
          avatarUrl: nextAvatar,
        };
      });
      if (persistOps.length) {
        void SiteDocument.bulkWrite(persistOps, { ordered: false }).catch(() => null);
      }
    } catch (_) {}
  }

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    },
    week: q === "resoconti" ? week || null : null,
    weeks: q === "resoconti" ? weeks : undefined,
  };
}

export = { listStaffWorkflowFromDb };
