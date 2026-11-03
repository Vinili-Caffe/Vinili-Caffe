/** Workflow staff: grafico e storico dei ruoli nel dettaglio di un resoconto. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

async function enrichResocontoDetailChart(detail?, doc?, guild?) {
  if (!detail || String(detail.kind || "").toLowerCase() !== "s") return detail;
  if (Array.isArray(detail.costanzaChart) && detail.costanzaChart.length >= 5) {
    detail.costanzaChart = detail.costanzaChart
      .slice()
      .sort((a?, b?) => String(a.dayKey || "").localeCompare(String(b.dayKey || "")));
  } else {
    const userId = String(detail.userId || doc?.userId || "").trim();
    const guildId = String(guild?.id || doc?.guildId || "").trim();
    if (userId && guildId) {
      try {
        const { getUserOverviewStats } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
        const {
          buildResocontoOverviewOptions,
          collectResocontoVoiceExcludeIds,
          getResocontoWeekRangeFromWeekKey,
          serializeCostanzaChart,
        } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");
        const weekKey = String(detail.weekKey || doc?.workflowWeekKey || "").trim();
        const range = getResocontoWeekRangeFromWeekKey(weekKey);
        const scope = guild ? buildResocontoOverviewOptions(guild, range?.weekEnd || new Date()) : {};
        const exclude = guild ? collectResocontoVoiceExcludeIds(guild) : null;
        const overview = await getUserOverviewStats(
          guildId,
          userId,
          7,
          exclude?.size ? exclude : null,
          {
            ...scope,
            ...(range ? { rangeStart: range.weekStart, rangeEnd: range.weekEnd } : {}),
          },
        );
        const chart = serializeCostanzaChart(overview);
        if (chart.length) {
          detail.costanzaChart = chart;
          if (detail.weeklyMessages == null) {
            detail.weeklyMessages = Math.max(0, Math.floor(Number(overview?.windows?.d7?.text) || 0));
          }
          if (detail.weeklyVoiceSeconds == null) {
            detail.weeklyVoiceSeconds = Math.max(
              0,
              Math.floor(Number(overview?.windows?.d7?.voiceSeconds) || 0),
            );
          }
          if (doc?._id) {
            const prev =
              doc.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
                ? { ...doc.workflowFields }
                : {};
            void SiteDocument.updateOne(
              { _id: doc._id },
              {
                $set: {
                  workflowFields: {
                    ...prev,
                    costanzaChart: chart,
                    ...(detail.weeklyMessages != null ? { weeklyMessages: detail.weeklyMessages } : {}),
                    ...(detail.weeklyVoiceSeconds != null
                      ? { weeklyVoiceSeconds: detail.weeklyVoiceSeconds }
                      : {}),
                  },
                },
              },
            ).catch(() => null);
          }
        }
      } catch (_) {}
    }
  }
  try {
    detail = await enrichResocontoRolesHistory(detail, doc, guild);
  } catch (_) {}
  return detail;
}

async function enrichResocontoRolesHistory(detail?, doc?, guild?) {
  if (!detail) return detail;
  const userId = String(detail.userId || doc?.userId || "").trim();
  const guildId = String(guild?.id || doc?.guildId || "").trim();
  if (!userId || !guildId) return detail;
  if (guild?.roles?.fetch) {
    await guild.roles.fetch().catch(() => null);
  }

  function normalizeRoleToken(value?) {
    const raw = String(value == null ? "" : value).trim();
    if (/^\d{17,20}$/.test(raw)) {
      const role = guild?.roles?.cache?.get?.(raw);
      if (role?.name) return normalizeRoleToken(role.name);
    }
    const s = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!s) return "";
    const aliases = {
      mod: "moderator",
      mods: "moderator",
      moderator: "moderator",
      "senior moderator": "senior moderator",
      "sr moderator": "senior moderator",
      srmod: "senior moderator",
      "senior mod": "senior moderator",
      helper: "helper",
      "trial helper": "helper",
      "partner manager": "partner manager",
      pm: "partner manager",
      director: "director",
      admin: "admin",
      manager: "manager",
      founder: "founder",
      member: "member",
    };
    if (aliases[s]) return aliases[s];
    if (s.charAt(s.length - 1) === "s" && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
    return s;
  }

  function dayKey(iso?) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function preferRow(a?, b?) {
    const labelLen = (r?) =>
      String(r?.to || r?.newRole || "").length + String(r?.from || r?.oldRole || "").length;
    return labelLen(b) > labelLen(a) ? b : a;
  }

  function dedupeRoleRows(rows?) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const out = [];
    const seen = Object.create(null);
    for (const row of rows) {
      if (!row) continue;
      const fromRaw = String(row.from || row.oldRole || "").trim();
      const toRaw = String(row.to || row.newRole || "").trim();
      const from = normalizeRoleToken(fromRaw);
      const to = normalizeRoleToken(toRaw);
      const day = dayKey(row.dateIso || row.date || "");
      const reason = String(row.reason || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const tripKey = from && to ? `${day}|${from}|${to}` : "";
      const key = `${day}|${from}|${to}|${reason}`;
      const softKey = to ? `${day}|*|${to}|${reason}` : "";
      if (from || to) {
                if (tripKey && Object.prototype.hasOwnProperty.call(seen, tripKey)) {
          out[seen[tripKey]] = preferRow(out[seen[tripKey]], row);
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(seen, key)) {
          out[seen[key]] = preferRow(out[seen[key]], row);
          continue;
        }
        if (softKey && Object.prototype.hasOwnProperty.call(seen, softKey)) {
          out[seen[softKey]] = preferRow(out[seen[softKey]], row);
          continue;
        }
        const idx = out.length;
        if (tripKey) seen[tripKey] = idx;
        seen[key] = idx;
        if (softKey) seen[softKey] = idx;
      }
      out.push(row);
    }
    return out;
  }

  function humanizeRoleKey(key?) {
    return String(key || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .trim();
  }

  function roleKeyFromConfiguredId(roleId?) {
    const raw = String(roleId || "").trim();
    if (!raw) return null;
    const roles = IDs.roles || {};
    for (const [key, val] of Object.entries(roles)) {
      if (String(val) === raw) return key;
    }
    return null;
  }

  function displayRoleLabel(value?) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    if (/^\d{16,22}$/.test(raw)) {
      let id = raw;
      try {
        const { remapKnownRoleSnowflake } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
        const mapped = remapKnownRoleSnowflake(raw);
        if (mapped) id = mapped;
      } catch (_) {}
      const role =
        guild?.roles?.cache?.get?.(id) ||
        guild?.roles?.cache?.get?.(raw) ||
        null;
      const live = String(role?.name || "").trim();
      if (live) return live;
      // careerMemberHelper1: same fallback as profilo — map known staff IDs (Member/Helper/…)
      // so Member→Helper does not disappear when Discord cache misses the role.
      const key = roleKeyFromConfiguredId(id) || roleKeyFromConfiguredId(raw);
      if (key) return humanizeRoleKey(key) || key;
      return "";
    }
    return raw;
  }

  function hydrateRoleRowLabels(rows?) {
    return (Array.isArray(rows) ? rows : [])
      .map((row?) => {
        if (!row) return null;
        const from = displayRoleLabel(row.from || row.oldRole);
        const to = displayRoleLabel(row.to || row.newRole);
        if (!from && !to) return null;
        return {
          ...row,
          from: from || null,
          to: to || null,
          oldRole: from || null,
          newRole: to || null,
        };
      })
      .filter(Boolean);
  }

  // Snapshot on the workflow doc can be incomplete (e.g. only last pex).
  // Always prefer staff.rolesHistory from the profile — same source as profilo carriera.
  const snapshot = Array.isArray(detail.rolesHistory) && detail.rolesHistory.length
    ? hydrateRoleRowLabels(dedupeRoleRows(detail.rolesHistory))
    : [];

  try {
    const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
    const profile = await ActivityUserProfile.findOne({ guildId, userId })
      .select("staff.rolesHistory")
      .lean()
      .catch(() => null);
    const histRaw = Array.isArray(profile?.staff?.rolesHistory) ? profile.staff.rolesHistory : [];
    let hist = histRaw;
    try {
      const { isHiddenManualStaffCareerReason } = require("../../Staff/utils/staffTrackHistory") as typeof import("../../Staff/utils/staffTrackHistory");
      hist = histRaw.filter((row?) => !isHiddenManualStaffCareerReason(row?.reason));
    } catch (_) {}
    if (!hist.length) {
      detail.rolesHistory = snapshot;
      return detail;
    }
    const rows = hydrateRoleRowLabels(
      dedupeRoleRows(
        hist
          .map((row?) => {
            const d = row?.date ? new Date(row.date) : null;
            const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
            const from = displayRoleLabel(row?.oldRole);
            const to = displayRoleLabel(row?.newRole);
            if (!to && !from) return null;
            let dateLabel = "";
            try {
              if (iso) {
                dateLabel = new Date(iso).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                });
              }
            } catch (_) {}
            return {
              from: from || null,
              to: to || null,
              oldRole: from || null,
              newRole: to || null,
              reason: String(row?.reason || "").trim() || null,
              dateIso: iso,
              dateLabel: dateLabel || null,
              _sort: iso ? new Date(iso).getTime() : 0,
            };
          })
          .filter(Boolean)
          .sort((a?, b?) => b._sort - a._sort)
          .map(({ _sort, ...rest }) => rest),
      ),
    );
    // Merge snapshot under profile so any extra labels still help, then prefer profile length.
    detail.rolesHistory = rows.length
      ? hydrateRoleRowLabels(dedupeRoleRows([...rows, ...snapshot]))
      : snapshot;
    if (doc?._id && detail.rolesHistory.length) {
      const prev =
        doc.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
          ? { ...doc.workflowFields }
          : {};
      void SiteDocument.updateOne(
        { _id: doc._id },
        { $set: { workflowFields: { ...prev, rolesHistory: detail.rolesHistory } } },
      ).catch(() => null);
    }
  } catch (_) {
    detail.rolesHistory = snapshot.length
      ? snapshot
      : Array.isArray(detail.rolesHistory)
        ? hydrateRoleRowLabels(detail.rolesHistory)
        : [];
  }
  return detail;
}

export = { enrichResocontoDetailChart, enrichResocontoRolesHistory };
