/** Ticket dal sito: ruoli dello staff, chi vede quali categorie, chi può scrivere o gestire. */
const IDs: any = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { WEB_TICKET_CATEGORIES, WEB_TICKET_STATUS } = require("../data/siteWebTicketSchemas") as typeof import("../data/siteWebTicketSchemas");
const { memberHasStaffRole } = require("../../../Utils/Community/staffListUtils") as typeof import("../../../Utils/Community/staffListUtils");
const { avatarForMember, normalizeCategory } = require("./ticketNames") as typeof import("./ticketNames");
const { hasStaffTicketRole } = require("../discord/ticketStaffPanelBuild") as typeof import("../discord/ticketStaffPanelBuild");
const { memberIsResocontoPmReviewer } = require("../discord/ticketPartnershipStaffRoles") as typeof import("../discord/ticketPartnershipStaffRoles");
const { canClaimTicket } = require("../discord/ticketStaffRuntime") as typeof import("../discord/ticketStaffRuntime");
const { getPartnerManagerRoleId } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
const { memberIsHighStaffEligible } = require("../../../Utils/Staff/staffRoleHierarchy") as typeof import("../../../Utils/Staff/staffRoleHierarchy");

const WEB_TICKET_STAFF_ROLE_PRIORITY = [
  IDs.roles?.Founder,
  IDs.roles?.Manager,
  IDs.roles?.Admin,
  IDs.roles?.Director,
  IDs.roles?.HighStaff,
  IDs.roles?.SeniorModerator,
  IDs.roles?.Mod,
  IDs.roles?.Helper,
  IDs.roles?.PartnerManager,
  IDs.roles?.CommunityManager,
  IDs.roles?.Staff,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

const WEB_TICKET_COMMUNITY_ROLE_PRIORITY = [
  { id: IDs.roles?.VIPplus, name: "VIP+", key: "vip-plus" },
  { id: IDs.roles?.VIP, name: "VIP", key: "vip" },
  { id: IDs.roles?.DoubleBooster, name: "Double Booster", key: "double-booster" },
  { id: IDs.roles?.ServerBooster, name: "Booster", key: "booster" },
  { id: IDs.roles?.Donator, name: "Donator", key: "donator" },
  { id: IDs.roles?.Member, name: "Member", key: "member" },
]
  .map((row?) => ({
    id: String(row.id || "").trim(),
    name: row.name,
    key: row.key,
  }))
  .filter((row?) => row.id);

const WEB_TICKET_STAFF_ROLE_LABELS = {
  [String(IDs.roles?.Founder || "")]: { name: "Founder", key: "founder" },
  [String(IDs.roles?.Manager || "")]: { name: "Manager", key: "manager" },
  [String(IDs.roles?.Admin || "")]: { name: "Admin", key: "admin" },
  [String(IDs.roles?.Director || "")]: { name: "Director", key: "director" },
  [String(IDs.roles?.HighStaff || "")]: { name: "High Staff", key: "high-staff" },
  [String(IDs.roles?.SeniorModerator || "")]: { name: "Senior Mod", key: "senior-mod" },
  [String(IDs.roles?.Mod || "")]: { name: "Mod", key: "mod" },
  [String(IDs.roles?.Helper || "")]: { name: "Helper", key: "helper" },
  [String(IDs.roles?.PartnerManager || "")]: { name: "Partner Manager", key: "partner-manager" },
  [String(IDs.roles?.CommunityManager || "")]: { name: "Community Manager", key: "community-manager" },
  [String(IDs.roles?.Staff || "")]: { name: "Staff", key: "staff" },
};

function cleanStaffRoleDisplayName(raw?) {
  let name = String(raw || "")
    .replace(/<a?:[^:]+:\d+>/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return "Staff";
  return name.slice(0, 48);
}

function staffRolePriorityIds(guildId?) {
  const ids = [...WEB_TICKET_STAFF_ROLE_PRIORITY];
  const pmId = String(getPartnerManagerRoleId(guildId) || IDs.roles?.PartnerManager || "").trim();
  if (pmId && !ids.includes(pmId)) {
    const staffIdx = ids.indexOf(String(IDs.roles?.Staff || "").trim());
    if (staffIdx >= 0) ids.splice(staffIdx, 0, pmId);
    else ids.push(pmId);
  }
  return ids.filter(Boolean);
}

function labelForStaffRoleId(roleId?, roleName?, guildId?) {
  const id = String(roleId || "").trim();
  const pmId = String(getPartnerManagerRoleId(guildId) || IDs.roles?.PartnerManager || "").trim();
  if (id && pmId && id === pmId) {
    return { name: "Partner Manager", key: "partner-manager" };
  }
  const fixed = WEB_TICKET_STAFF_ROLE_LABELS[id];
  if (fixed?.name) return { name: fixed.name, key: fixed.key || "staff" };
  const cleaned = cleanStaffRoleDisplayName(roleName || "");
  return { name: cleaned || "Staff", key: "staff" };
}

function resolveStaffRoleForMember(member?, guildId = null) {
  if (!member?.roles?.cache) return null;
  const gid = String(guildId || member?.guild?.id || "").trim();
  for (const roleId of staffRolePriorityIds(gid)) {
    if (!member.roles.cache.has(roleId)) continue;
    const role = member.roles.cache.get(roleId);
    const labeled = labelForStaffRoleId(roleId, role?.name || "", gid);
    return { id: roleId, name: labeled.name, key: labeled.key };
  }
  return null;
}

function resolveCommunityRoleForMember(member?) {
  if (!member?.roles?.cache) return null;
  for (const row of WEB_TICKET_COMMUNITY_ROLE_PRIORITY) {
    if (!member.roles.cache.has(row.id)) continue;
    return { id: row.id, name: row.name, key: row.key };
  }
  return null;
}

function normalizeLookupName(value?) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function memberMatchesLookupName(member?, needle?) {
  const n = normalizeLookupName(needle);
  if (!n || !member) return false;
  const candidates = [
    member.user?.username,
    member.user?.globalName,
    member.displayName,
    member.nickname,
  ];
  for (const c of candidates) {
    const nc = normalizeLookupName(c);
    if (!nc) continue;
    if (nc === n) return true;
    if (n.length >= 3 && nc.length >= 3 && (nc.includes(n) || n.includes(nc))) return true;
  }
  return false;
}

function lookupNameVariants(rawName?) {
  const needle = String(rawName || "").trim();
  if (!needle) return [];
  const out = [];
  const push = (v?) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(needle);
  push(needle.replace(/\.+$/g, ""));
  push(needle.replace(/^_+|_+$/g, ""));
  push(normalizeLookupName(needle));
  push(normalizeLookupName(needle).replace(/[^a-z0-9]+/g, ""));
    const letters = needle.replace(/[^a-zA-Z]+/g, "");
  if (letters.length >= 3 && letters.toLowerCase() !== normalizeLookupName(needle)) push(letters);
  const alphaNum = needle.replace(/[^a-zA-Z0-9]+/g, "");
  if (alphaNum.length >= 3) push(alphaNum);
  return out;
}

async function findGuildMemberByName(guild?, rawName?) {
  const variants = lookupNameVariants(rawName);
  if (!guild || !variants.length) return null;

    for (const v of variants) {
    const q = String(v)
      .replace(/[^\p{L}\p{N}_.-]+/gu, "")
      .slice(0, 32);
    if (q.length < 2) continue;
    try {
      const fetched = await guild.members.search({ query: q, limit: 15 }).catch(() => null);
      if (!fetched) continue;
      const hit =
        typeof fetched.find === "function"
          ? fetched.find((m?) => variants.some((vv?) => memberMatchesLookupName(m, vv)))
          : null;
      if (hit) return hit;
      if (typeof fetched.find === "function") {
        const soft = fetched.find((m?) => {
          const hay = normalizeLookupName(
            `${m.user?.username || ""} ${m.displayName || ""} ${m.user?.globalName || ""}`,
          );
          return variants.some((vv?) => {
            const nv = normalizeLookupName(vv);
            return nv.length >= 3 && (hay === nv || hay.includes(nv) || nv.includes(hay));
          });
        });
        if (soft) return soft;
      }
      if (fetched.size === 1 && typeof fetched.first === "function") return fetched.first();
    } catch {
          }
  }

  for (const v of variants) {
    const cached = guild.members.cache.find((m?) => memberMatchesLookupName(m, v));
    if (cached) return cached;
  }

  if (guild.members.cache?.size) {
    for (const v of variants) {
      const nv = normalizeLookupName(v);
      if (nv.length < 3) continue;
      const soft = [...guild.members.cache.values()].find((m?) => {
        const candidates = [
          m.user?.username,
          m.user?.globalName,
          m.displayName,
          m.nickname,
        ].map(normalizeLookupName);
        return candidates.some((c?) => c && (c === nv || c.startsWith(nv) || nv.startsWith(c) || c.includes(nv)));
      });
      if (soft) return soft;
    }
  }

  return null;
}

async function enrichSlugAuthorsFromStaffRoster(client?, guild?, slugs?, nameHints?, out?) {
  if (!client || !guild || !slugs.length) return;
  try {
    const { getCachedStaffRoster, ensureGuildMembersLoaded } = require("../../staff/siteStaffRosterCache") as typeof import("../../staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
    const roster = await getCachedStaffRoster(client);
    if (!roster?.ok) return;
    const people = [];
    if (roster.membersById && typeof roster.membersById.values === "function") {
      people.push(...roster.membersById.values());
    } else if (Array.isArray(roster.sections)) {
      for (const sec of roster.sections) {
        if (Array.isArray(sec?.members)) people.push(...sec.members);
      }
    }
    const gid = String(guild.id || "");
    for (const uid of slugs) {
      if (out[uid]) continue;
      const hint = String(nameHints[uid] || uid.slice(8) || "").trim();
      const variants = lookupNameVariants(hint);
      const row = people.find((p?) => {
        if (!p) return false;
        return variants.some(
          (v?) =>
            normalizeLookupName(p.username) === normalizeLookupName(v) ||
            normalizeLookupName(p.displayName) === normalizeLookupName(v) ||
            memberMatchesLookupName({ user: { username: p.username, globalName: p.displayName }, displayName: p.displayName }, v),
        );
      });
      if (!row?.userId) continue;
      const member =
        guild.members.cache.get(String(row.userId)) ||
        (await guild.members.fetch(String(row.userId)).catch(() => null));
      if (!member) {
                const staffLabel = String(row.displayRoleLabel || "").trim();
        const staffKey = String(row.profileKind || row.displayRoleId || "staff")
          .toLowerCase()
          .replace(/\s+/g, "-");
        out[uid] = {
          staff: staffLabel
            ? {
                id: String(row.displayRoleId || ""),
                name: cleanStaffRoleDisplayName(staffLabel),
                key: staffKey.includes("partner") ? "partner-manager" : staffKey.slice(0, 40),
              }
            : { id: "", name: "Staff", key: "staff" },
          community: null,
          avatarUrl: String(row.avatarUrl || "").trim(),
          resolvedId: String(row.userId),
        };
                if (row.isPm && out[uid].staff) {
          out[uid].staff.key = "partner-manager";
          if (!/partner/i.test(out[uid].staff.name)) out[uid].staff.name = "Partner Manager";
        }
        continue;
      }
      const staff = resolveStaffRoleForMember(member, gid);
      const community = resolveCommunityRoleForMember(member);
      out[uid] = {
        staff: staff || null,
        community: community || null,
        avatarUrl: avatarForMember(member) || String(row.avatarUrl || "").trim(),
        resolvedId: String(member.id || row.userId),
      };
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] enrichSlugAuthorsFromStaffRoster:", err?.message || err);
  }
}

async function buildStaffRoleMapForUserIds(client?, guildId?, userIds?, { nameHints = {} } = {}) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  const out: Record<string, any> = {};
  if (!gid || !ids.length) return out;
  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  if (!guild) return out;
  const snowflakes = ids.filter((id?) => /^\d{5,32}$/.test(id));
  const slugs = ids.filter((id?) => id.startsWith("discord:"));
  try {
    const { ensureGuildMembersLoaded } = require("../../staff/siteStaffRosterCache") as typeof import("../../staff/siteStaffRosterCache");
    /* ticketDetailFast1: preferisci gli id del ticket (no full guild fetch se basta) */
    await ensureGuildMembersLoaded(guild, snowflakes.slice(0, 24));
  } catch {
      }
  const { getGuildMemberCached } = require("../../../Utils/Interaction/interactionEntityCache") as typeof import("../../../Utils/Interaction/interactionEntityCache");

  await Promise.all(
    snowflakes.slice(0, 24).map(async (uid?) => {
      try {
        const member =
          guild.members.cache.get(uid) ||
          (await getGuildMemberCached(guild, uid).catch(() => null)) ||
          null;
        if (!member) return;
        const staff = resolveStaffRoleForMember(member, gid);
        const community = resolveCommunityRoleForMember(member);
        out[uid] = {
          staff: staff || null,
          community: community || null,
          avatarUrl: avatarForMember(member) || "",
        };
      } catch {
              }
    }),
  );

  /* ticketDetailFast1: slug name-search max 6 (prima 40 → lento su telefono) */
  await Promise.all(
    slugs.slice(0, 6).map(async (uid?) => {
      try {
        const hint = String(nameHints[uid] || uid.slice(8) || "").trim();
                const member = await findGuildMemberByName(guild, hint);
        if (!member) return;
        const staff = resolveStaffRoleForMember(member, gid);
        const community = resolveCommunityRoleForMember(member);
        out[uid] = {
          staff: staff || null,
          community: community || null,
          avatarUrl: avatarForMember(member) || "",
          resolvedId: String(member.id || ""),
        };
                const rid = String(member.id || "").trim();
        if (rid && !out[rid]) {
          out[rid] = {
            staff: staff || null,
            community: community || null,
            avatarUrl: avatarForMember(member) || "",
          };
        }
      } catch {
              }
    }),
  );

  const unresolved = slugs.filter((id?) => !out[id]).slice(0, 6);
  if (unresolved.length) {
    await enrichSlugAuthorsFromStaffRoster(client, guild, unresolved, nameHints, out);
  }
  return out;
}

function memberIsHighStaff(member?) {
  const highStaffRoleId = String(IDs.roles?.HighStaff || "").trim();
  return Boolean(highStaffRoleId && member?.roles?.cache?.has?.(highStaffRoleId));
}

function memberHasWebsiteStaffAccess(member?) {
  if (!member || member.user?.bot) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  return Boolean(staffRoleId && member.roles?.cache?.has?.(staffRoleId));
}

function listAccessibleTicketCategories(member?) {
  if (!member || member.user?.bot) return [];
  const cats = WEB_TICKET_CATEGORIES.filter((cat?) => hasStaffTicketRole(member, cat));
  if (cats.length) return cats;
      if (memberHasWebsiteStaffAccess(member)) return ["supporto"];
  return [];
}

function memberIsWebTicketStaff(member?) {
  return listAccessibleTicketCategories(member).length > 0;
}

function memberCanAccessTicketCategory(member?, category?) {
  const cat = normalizeCategory(category);
  if (!cat) return false;
  return hasStaffTicketRole(member, cat);
}

function memberCanBypassClaimedTicketWrite(member?, ticket?) {
  if (memberIsHighStaffEligible(member) || memberIsHighStaff(member)) return true;
  const category = normalizeCategory(ticket?.category);
  if (category !== "partnership") return false;
  return memberIsResocontoPmReviewer(member);
}

function memberCanBypassClaimedTicketManage(member?, ticket?) {
  if (memberIsHighStaffEligible(member) || memberIsHighStaff(member)) return true;
  const category = normalizeCategory(ticket?.category);
  if (category !== "partnership") return false;
  return memberIsResocontoPmReviewer(member);
}

async function resolveClientGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  return (
    client.guilds.cache?.get?.(gid) ||
    (await client.guilds.fetch?.(gid).catch?.(() => null)) ||
    null
  );
}

function listAddedUsers(ticket?) {
  return (Array.isArray(ticket?.addedUsers) ? ticket.addedUsers : [])
    .map((u?) => ({
      id: String(u?.id || "").trim(),
      name: String(u?.name || "Utente").trim() || "Utente",
      avatarUrl: String(u?.avatarUrl || "").trim(),
    }))
    .filter((u?) => u.id);
}

function ticketHasAddedUser(ticket?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return listAddedUsers(ticket).some((u?) => u.id === id);
}

function buildTicketPermissions(member?, ticket?, viewerId?, { isOwner = false, isAdded = false } = {}) {
  const category = normalizeCategory(ticket?.category) || String(ticket?.category || "supporto");
  const isStaff = memberIsWebTicketStaff(member);
  const hasCategory = memberCanAccessTicketCategory(member, category);
  const closed = String(ticket?.status || "") === WEB_TICKET_STATUS.CLOSED;
  const claimer = String(ticket?.claimedBy || "").trim();
  const viewer = String(viewerId || "");
  const isHighStaff = memberIsHighStaff(member);
  const closeRequested = Boolean(ticket?.closeRequestedAt);
  const alreadyRated = Boolean(ticket?.ratingAt) || ticket?.ratingStafferScore != null;
      const actingAsStaff = Boolean(isStaff && hasCategory && !isOwner && !isAdded);
  const canClaim =
    !closed && actingAsStaff && canClaimTicket(member, category, String(ticket?.guildId || ""));
  const canUnclaim = !closed && actingAsStaff && claimer && claimer === viewer;
  const bypassWrite = memberCanBypassClaimedTicketWrite(member, ticket);
  const bypassManage = memberCanBypassClaimedTicketManage(member, ticket);
  const canStaffWrite = actingAsStaff && ((claimer && claimer === viewer) || bypassWrite);
  const canCloseStaff =
    !closed && actingAsStaff && (bypassManage || !claimer || claimer === viewer);
    const staffPanel = !closed && actingAsStaff;
  return {
    canClaim: Boolean(canClaim && !claimer),
    canUnclaim: Boolean(canUnclaim),
    canClose: Boolean(canCloseStaff),
    canReply: Boolean(!closed && (isOwner || isAdded || canStaffWrite)),
    canUseCommands: Boolean(canStaffWrite && category === "partnership"),
    canBypassClaimWrite: Boolean(actingAsStaff && bypassWrite),
    canAddUsers: Boolean(staffPanel),
    canRemoveUsers: Boolean(staffPanel),
    canSwitchCategory: Boolean(staffPanel && isHighStaff),
    canRename: Boolean(staffPanel && isHighStaff),
    canCloseRequest: Boolean(staffPanel && (bypassManage || (claimer && claimer === viewer))),
    canTransfer: Boolean(staffPanel && claimer && (bypassManage || claimer === viewer)),
    canRespondCloseRequest: Boolean(!closed && isOwner && closeRequested),
    canRate: Boolean(closed && isOwner && !alreadyRated),
    isStaffViewer: actingAsStaff,
    isAddedViewer: Boolean(isAdded),
    isHighStaff: Boolean(isHighStaff),
    staffCategories: listAccessibleTicketCategories(member),
  };
}

export = { cleanStaffRoleDisplayName, resolveStaffRoleForMember, resolveCommunityRoleForMember, buildStaffRoleMapForUserIds, memberIsHighStaff, listAccessibleTicketCategories, memberIsWebTicketStaff, memberCanAccessTicketCategory, memberCanBypassClaimedTicketManage, resolveClientGuild, listAddedUsers, ticketHasAddedUser, buildTicketPermissions };
