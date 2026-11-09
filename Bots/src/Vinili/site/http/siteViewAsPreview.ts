/**
 * Founder-only "view as" preview for website staff UI/API.
 * Header: X-VC-View-As: real|logout|member|helper|mod|senior|director|highstaff|pm
 * Marker: viewAsRoleHard1
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { memberHasConfiguredRole } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");

const VIEW_AS_HEADER = "x-vc-view-as";
const PRESETS = Object.freeze([
  "real",
  "logout",
  "member",
  "helper",
  "mod",
  "senior",
  "director",
  "highstaff",
  "pm",
]);

function normalizeViewAs(raw?) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!v || v === "real" || v === "none" || v === "off") return "";
  if (v === "seniormoderator" || v === "seniormod") return "senior";
  if (v === "hs" || v === "high") return "highstaff";
  if (v === "partnermanager" || v === "partner") return "pm";
  if (PRESETS.includes(v)) return v === "real" ? "" : v;
  return "";
}

function parseViewAsFromReq(req?) {
  try {
    const h = req?.headers || {};
    const raw = h[VIEW_AS_HEADER] || h["X-VC-View-As"] || req?.query?.viewAs || "";
    return normalizeViewAs(raw);
  } catch (_) {
    return "";
  }
}

function founderRoleId() {
  return String(IDs?.roles?.Founder || "").trim();
}

function canUseViewAs(member?, opts: Record<string, any> = {}) {
  const allow = String(process.env.VC_VIEW_AS_USER_IDS || "")
    .split(",")
    .map((s?) => s.trim())
    .filter(Boolean);
  const uid = String(member?.id || opts.userId || "").trim();
  if (uid && allow.includes(uid)) return true;
  if (member && memberHasConfiguredRole(member, "Founder")) return true;
  const fid = founderRoleId();
  const roleIds = Array.isArray(opts.roleIds)
    ? opts.roleIds.map(String)
    : Array.isArray(member?.roles?.cache)
      ? [...member.roles.cache.keys()].map(String)
      : member?.roles?.cache?.has
        ? [...(member.roles.cache.keys?.() || [])].map(String)
        : [];
  if (fid && roleIds.includes(fid)) return true;
  return false;
}

function flagsForPreset(preset?) {
  const p = normalizeViewAs(preset);
  const base = {
    ok: true,
    canManage: false,
    isHighStaff: false,
    isPm: false,
    isPmGestore: false,
    canManagePm: false,
    canCompiti: false,
    canConfessionale: false,
    canViewResoconti: false,
    canViewPmPointsRemoved: false,
    canReviewPmPointsRemoved: false,
    candidatureReview: false,
    appelliReview: false,
    director: false,
    isFounder: false,
    staffMenu: true,
  };
  if (!p || p === "logout" || p === "member") {
    return {
      ...base,
      ok: p === "member" || p === "logout" ? false : true,
      staffMenu: false,
      guest: p === "logout",
      memberOnly: p === "member",
    };
  }
  if (p === "pm") {
    return {
      ...base,
      ok: true,
      isPm: true,
      canViewPmPointsRemoved: true,
      canViewResoconti: false,
      canCompiti: false,
      canConfessionale: false,
    };
  }
  if (p === "helper") {
    return { ...base, ok: true, canCompiti: true, canConfessionale: true, canViewResoconti: true };
  }
  if (p === "mod") {
    return {
      ...base,
      ok: true,
      canCompiti: true,
      canConfessionale: true,
      candidatureReview: true,
      canViewResoconti: true,
    };
  }
  if (p === "senior") {
    return {
      ...base,
      ok: true,
      canCompiti: true,
      canConfessionale: true,
      candidatureReview: true,
      appelliReview: true,
      canViewResoconti: true,
    };
  }
  if (p === "director") {
    return {
      ...base,
      ok: true,
      director: true,
      canCompiti: true,
      canConfessionale: true,
      candidatureReview: true,
      appelliReview: true,
      /* inboxNoDirector1 */
      canViewResoconti: false,
      canViewPmPointsRemoved: false,
      canReviewPmPointsRemoved: false,
    };
  }
  if (p === "highstaff") {
    return {
      ...base,
      ok: true,
      isHighStaff: true,
      canManage: true,
      canManagePm: true,
      canCompiti: true,
      canConfessionale: true,
      canViewPmPointsRemoved: true,
      canReviewPmPointsRemoved: true,
      candidatureReview: true,
      appelliReview: true,
      canViewResoconti: true,
    };
  }
  return base;
}

function applyViewAsToStaffAccessPayload(realPayload?, preset?, member?) {
  if (member?.__vcViewAsReal || (viewAsContextActive() && !normalizeViewAs(preset))) {
    return {
      ...realPayload,
      isFounder: false,
      viewAs: "roles",
      viewAsActive: true,
      viewAsAllowed: true,
      roleIds: Array.isArray(member?.__vcViewAsRoleIds) ? member.__vcViewAsRoleIds : realPayload?.roleIds,
    };
  }
  const p = normalizeViewAs(preset);
  const allowed = canUseViewAs(member, {
    userId: realPayload?.identity?.userId || member?.id,
    roleIds: undefined,
  });
  if (!p || !allowed) {
    return {
      ...realPayload,
      isFounder: Boolean(allowed || memberHasConfiguredRole(member, "Founder")),
      viewAs: null,
      viewAsActive: false,
      viewAsAllowed: allowed,
    };
  }
  const flags = flagsForPreset(p);
  const identity = realPayload?.identity || {
    userId: String(member?.id || ""),
    displayName: String(member?.displayName || "Staff"),
    username: "",
    avatarUrl: "",
  };
  if (p === "logout" || p === "member") {
    return {
      ok: false,
      error: p === "logout" ? "view_as_logout" : "view_as_member",
      message: p === "logout" ? "Preview: logout" : "Preview: membro",
      viewAs: p,
      viewAsActive: true,
      viewAsAllowed: true,
      /* Privilege is never Founder while previewing; bar uses viewAsAllowed. */
      isFounder: false,
      staffMenu: false,
      identity,
      permissions: { staff: false, highStaff: false },
      roleIds: roleIdsForViewAsPreset(p) || [],
    };
  }
  const payload = {
    ok: true,
    canManage: flags.canManage,
    isHighStaff: flags.isHighStaff,
    isPm: flags.isPm,
    isPmGestore: flags.isPmGestore,
    canManagePm: flags.canManagePm,
    canCompiti: flags.canCompiti,
    canConfessionale: Boolean(flags.canConfessionale ?? flags.canCompiti),
    canViewPmPointsRemoved: flags.canViewPmPointsRemoved,
    canReviewPmPointsRemoved: flags.canReviewPmPointsRemoved,
    canViewResoconti: Boolean(flags.canViewResoconti),
    candidatureReview: flags.candidatureReview,
    appelliReview: flags.appelliReview,
    director: flags.director,
    isFounder: false,
    staffMenu: Boolean(flags.staffMenu),
    viewAs: p,
    viewAsActive: true,
    viewAsAllowed: true,
    roleIds: roleIdsForViewAsPreset(p) || [],
    permissions: {
      staff: true,
      highStaff: flags.isHighStaff,
      canManage: flags.canManage,
      isPm: flags.isPm,
      isPmGestore: flags.isPmGestore,
      canManagePm: flags.canManagePm,
      canCompiti: flags.canCompiti,
      canConfessionale: Boolean(flags.canConfessionale ?? flags.canCompiti),
      canViewPmPointsRemoved: flags.canViewPmPointsRemoved,
      canReviewPmPointsRemoved: flags.canReviewPmPointsRemoved,
      canViewResoconti: Boolean(flags.canViewResoconti),
      candidatureReview: flags.candidatureReview,
      appelliReview: flags.appelliReview,
      director: flags.director,
    },
    identity: {
      ...identity,
      displayName: `${identity.displayName || "Staff"} · ${labelForPreset(p)}`,
    },
  };
  return payload;
}

function labelForPreset(preset?) {
  const map = {
    logout: "Logout",
    member: "Membro",
    helper: "Helper",
    mod: "Mod",
    senior: "Senior Mod",
    director: "Director",
    highstaff: "High Staff",
    pm: "Partner Manager",
  };
  return map[normalizeViewAs(preset)] || String(preset || "");
}

/** Compiti: map preset → { highStaff, workerSelf } overrides (Founder only). */
function compitiRoleOverride(preset?) {
  const p = normalizeViewAs(preset);
  if (!p) return null;
  if (p === "logout" || p === "member" || p === "pm") {
    return { highStaff: false, workerSelf: false, deny: true };
  }
  if (p === "highstaff") {
    return { highStaff: true, workerSelf: false, deny: false };
  }
  if (p === "helper" || p === "mod" || p === "senior" || p === "director") {
    return { highStaff: false, workerSelf: true, deny: false };
  }
  return null;
}

function roleIdKey(key?) {
  return String(IDs?.roles?.[key] || "").trim();
}

/**
 * Synthetic Discord role IDs for wiki/help (and similar) when Founder uses view-as.
 * Returns null = keep real roles. Empty array = guest/member-only baseline.
 */
function roleIdsForViewAsPreset(preset?) {
  const p = normalizeViewAs(preset);
  if (!p) return null;
  const pick = (...keys) => {
    const out = [];
    const seen = new Set();
    for (const k of keys) {
      const id = roleIdKey(k);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  if (p === "logout" || p === "member") return pick("Member");
  if (p === "helper") return pick("Member", "Staff", "Helper");
  if (p === "mod") return pick("Member", "Staff", "Helper", "Mod");
  if (p === "senior") return pick("Member", "Staff", "Helper", "Mod", "SeniorModerator");
  if (p === "director") {
    return pick("Member", "Staff", "Helper", "Mod", "SeniorModerator", "Director");
  }
  if (p === "highstaff") {
    return pick("Member", "Staff", "HighStaff", "Admin", "Manager");
  }
  if (p === "pm") return pick("Member", "PartnerManager");
  return null;
}

/**
 * viewAsRoleHard1: Discord member shim with only synthetic role IDs for the preset.
 * Downstream memberHas* / roles.cache.has use these instead of real Founder roles.
 */
function shimMemberRolesForViewAs(member?, preset?) {
  const p = normalizeViewAs(preset);
  if (!p || !member) return member;
  const fakeIds = roleIdsForViewAsPreset(p);
  if (!Array.isArray(fakeIds)) return member;
  return shimMemberWithRoleIds(member, fakeIds, p);
}

/** Membro con SOLO i ruoli indicati (anteprima "visualizza come ruolo"); il resto del membro resta vero. */
function shimMemberWithRoleIds(member?, roleIds?, tag = "roles") {
  if (!member || !Array.isArray(roleIds)) return member;
  const p = tag;
  const idSet = new Set(roleIds.map(String));
  const guild = member.guild || null;
  const roleObjs = [];
  for (const rid of idSet) {
    const fromGuild = guild?.roles?.cache?.get?.(rid) || null;
    roleObjs.push(
      fromGuild || {
        id: rid,
        name: rid,
        permissions: { has: () => false },
      },
    );
  }
  const cache = {
    has: (id?) => idSet.has(String(id)),
    get: (id?) => {
      const sid = String(id);
      if (!idSet.has(sid)) return undefined;
      return guild?.roles?.cache?.get?.(sid) || roleObjs.find((r?) => String(r.id) === sid) || { id: sid };
    },
    keys: function* keys() {
      for (const id of idSet) yield id;
    },
    values: function* values() {
      for (const r of roleObjs) yield r;
    },
    [Symbol.iterator]: function* iter() {
      for (const r of roleObjs) yield [String(r.id), r];
    },
    get size() {
      return idSet.size;
    },
    map: (fn?) => roleObjs.map(fn),
    filter: (fn?) => roleObjs.filter(fn),
    find: (fn?) => roleObjs.find(fn),
    some: (fn?) => roleObjs.some(fn),
    every: (fn?) => roleObjs.every(fn),
    forEach: (fn?) => roleObjs.forEach(fn),
  };
  return new Proxy(member, {
    get(target?, prop?, receiver?) {
      if (prop === "roles") {
        return { cache, highest: roleObjs[roleObjs.length - 1] || null };
      }
      if (prop === "__vcViewAsShim") return p;
      if (prop === "__vcViewAsRoleIds") return [...idSet];
      if (prop === "__vcViewAsReal") return true;
      /* niente permessi da amministratore del vero account durante l'anteprima */
      if (prop === "permissions") {
        return {
          has: (perm?) => roleObjs.some((r?) => {
            try {
              return Boolean(r?.permissions?.has?.(perm));
            } catch {
              return false;
            }
          }),
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Se la richiesta è in anteprima ruoli e il vero utente può usarla, restituisce il membro coi ruoli scelti. */
function applyViewAsContextToMember(member?) {
  if (!member || member.__vcViewAsReal) return member;
  let ids = null;
  try {
    const { getViewAsRoleIds } = require("../../../shared/runtime/viewAsContext") as typeof import("../../../shared/runtime/viewAsContext");
    ids = getViewAsRoleIds();
  } catch {
    ids = null;
  }
  if (!Array.isArray(ids)) return member;
  if (!canUseViewAs(member, { userId: member.id })) return member;
  return shimMemberWithRoleIds(member, ids, "roles");
}

function viewAsContextActive() {
  try {
    const { getViewAsRoleIds } = require("../../../shared/runtime/viewAsContext") as typeof import("../../../shared/runtime/viewAsContext");
    return Array.isArray(getViewAsRoleIds());
  } catch {
    return false;
  }
}

function applyViewAsToResolvedMember(member?, preset?, opts: Record<string, any> = {}) {
  const p = normalizeViewAs(preset);
  if (!p || !member) return { member, viewAs: null, denied: false };
  if (!canUseViewAs(member, { userId: opts.userId || member.id, roleIds: opts.roleIds })) {
    return { member, viewAs: null, denied: false };
  }
  const flags = flagsForPreset(p);
  const denied = !flags.ok || p === "logout" || p === "member";
  return {
    member: shimMemberRolesForViewAs(member, p),
    viewAs: p,
    flags,
    denied,
  };
}

export = {
  normalizeViewAs,
  parseViewAsFromReq,
  canUseViewAs,
  flagsForPreset,
  applyViewAsToStaffAccessPayload,
  compitiRoleOverride,
  roleIdsForViewAsPreset,
  applyViewAsToResolvedMember,
  applyViewAsContextToMember,
  shimMemberWithRoleIds,
  viewAsContextActive,
  handleViewAsRolesGet,
};

/**
 * GET /webhooks/site-view-as/roles — ruoli del server principale per il selettore dell'anteprima.
 * Solo per chi può usare l'anteprima; il controllo usa SEMPRE i ruoli veri (anche se l'anteprima è attiva).
 */
async function handleViewAsRolesGet(client?, req?, res?) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const raw = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!raw) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
    const { withoutViewAs } = require("../../../shared/runtime/viewAsContext") as typeof import("../../../shared/runtime/viewAsContext");
    const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
    const resolved: any = await withoutViewAs(() => resolveWebsiteGuildMember(client, raw));
    if (!resolved?.ok) return res.status(Number(resolved?.status) || 403).json({ ok: false, error: resolved?.error, message: resolved?.message });
    if (!canUseViewAs(resolved.member, { userId: resolved.userId })) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Anteprima riservata al Founder." });
    }
    const guildId = String(resolved.guild?.id || IDs?.guilds?.main || "").trim();
    let rows: any[] = [];
    try {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const rest = client?._rest || client?.rest;
      if (rest) rows = await rest.get(Routes.guildRoles(guildId));
    } catch {
      rows = [];
    }
    if (!Array.isArray(rows) || !rows.length) {
      rows = [...(resolved.guild?.roles?.cache?.values?.() || [])].map((r?) => ({ id: r.id, name: r.name, color: r.color, position: r.position, managed: r.managed }));
    }
    const roles = rows
      .filter((r?) => r && String(r.id) !== guildId && !r.managed)
      .map((r?) => ({
        id: String(r.id),
        name: String(r.name || r.id),
        color: Number(r.color) ? `#${Number(r.color).toString(16).padStart(6, "0")}` : null,
        position: Number(r.position) || 0,
      }))
      .sort((a, b) => b.position - a.position);
    const realRoleIds = [...(resolved.member?.roles?.cache?.keys?.() || [])].map(String);
    return res.status(200).json({ ok: true, guildId, roles, realRoleIds });
  } catch (err) {
    global.logger?.warn?.("[VIEW AS] roles:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

