const { OverwriteType } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const Ticket = require("../../../Schemas/Ticket/ticketSchema");
const { GuildFeatureBucket } = require("../../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../../Schemas/Guild/guildFeatureBucketSchema");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { memberCanAccessPerksTicket } = require("./ticketPerksStaffRoles") as typeof import("./ticketPerksStaffRoles");
const { memberCanAccessPartnershipTicket } = require("./ticketPartnershipStaffRoles") as typeof import("./ticketPartnershipStaffRoles");
const { userAvatarUrlDynamic } = require("../../../Utils/Discord/guildDiscordIdentity") as typeof import("../../../Utils/Discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../../../Utils/Interaction/interactionEntityCache") as typeof import("../../../Utils/Interaction/interactionEntityCache");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const SUPPORT_TICKET_STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

function hasStaffTicketRole(member?, ticketType?) {
  if (!member?.roles?.cache) return false;
  const type = String(ticketType || "")
    .trim()
    .toLowerCase();
    if (type === "perks") {
    return memberCanAccessPerksTicket(member);
  }
  if (type === "partnership") {
    return memberCanAccessPartnershipTicket(member);
  }
  if (type === "high" || type === "highstaff") {
    try {
      const { memberHasConfiguredRole, memberHasRoleId } = require("../../../Utils/Staff/staffRoleHierarchy") as typeof import("../../../Utils/Staff/staffRoleHierarchy");
      if (memberHasConfiguredRole(member, "HighStaff")) return true;
      return Boolean(HIGHSTAFF_ROLE_ID && memberHasRoleId(member, HIGHSTAFF_ROLE_ID));
    } catch {
      return Boolean(HIGHSTAFF_ROLE_ID && member.roles.cache.has(HIGHSTAFF_ROLE_ID));
    }
  }
  try {
    const { memberHasRoleId } = require("../../../Utils/Staff/staffRoleHierarchy") as typeof import("../../../Utils/Staff/staffRoleHierarchy");
    return SUPPORT_TICKET_STAFF_ROLE_IDS.some((id?) => memberHasRoleId(member, id));
  } catch {
    return SUPPORT_TICKET_STAFF_ROLE_IDS.some((id?) => member.roles.cache.has(id));
  }
}

function isTicketOpenedByMember(ticketDoc?, memberOrUserId?) {
  const openerId = String(ticketDoc?.userId || "").trim();
  const actorId = String(memberOrUserId?.id || memberOrUserId || "").trim();
  return Boolean(openerId && actorId && openerId === actorId);
}

function memberCanActAsTicketStaff(member?, ticketDoc?) {
  if (isTicketOpenedByMember(ticketDoc, member)) return false;
  return hasStaffTicketRole(member, ticketDoc?.ticketType);
}

function canSeeCloseRequestPanel(member?, ticketDoc?) {
  if (!ticketDoc || isTicketOpenedByMember(ticketDoc, member)) return false;
  const claimer = String(ticketDoc.claimedBy || "").trim();
  if (claimer && String(member?.id || "") === claimer) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

async function fetchClosedTicketsOrdered(guildId?) {
  const gid = String(guildId || "");
  if (!gid) return [];
  const bucketRowsViaModel = await Ticket.find(
    { guildId: gid, open: false },
    { _id: 1, ticketNumber: 1, userId: 1, closedAt: 1, updatedAt: 1, ticketType: 1 },
  )
    .lean()
    .catch(() => []);
  const bucketDocs = await GuildFeatureBucket.find(
    { guildId: gid },
    { tickets: 1 },
  )
    .lean()
    .catch(() => []);
  const bucketRowsDirect = [];
  for (const b of Array.isArray(bucketDocs) ? bucketDocs : []) {
    for (const t of Array.isArray(b?.tickets) ? b.tickets : []) {
      if (Boolean(t?.open) !== false) continue;
      if (String(t?.guildId || gid) !== gid) continue;
      bucketRowsDirect.push({
        _id: t?._id,
        ticketNumber: t?.ticketNumber,
        userId: t?.userId,
        closedAt: t?.closedAt || null,
        updatedAt: t?.updatedAt || null,
        ticketType: t?.ticketType,
      });
    }
  }
  const db = mongoose?.connection?.db || null;
  let legacyRowsFlat = [];
  let legacyRowsNested = [];
  if (db?.collection) {
    legacyRowsFlat = await db
      .collection("tickets")
      .find(
        { guildId: gid, open: false },
        { projection: { _id: 1, ticketNumber: 1, userId: 1, closedAt: 1, updatedAt: 1, ticketType: 1 } },
      )
      .toArray()
      .catch(() => []);
    legacyRowsNested = await db
      .collection("tickets")
      .aggregate([
        { $match: { guildId: gid, tickets: { $type: "array" } } },
        { $unwind: "$tickets" },
        { $match: { "tickets.open": false } },
        {
          $project: {
            _id: "$tickets._id",
            ticketNumber: "$tickets.ticketNumber",
            userId: "$tickets.userId",
            closedAt: "$tickets.closedAt",
            updatedAt: "$tickets.updatedAt",
            ticketType: "$tickets.ticketType",
          },
        },
      ])
      .toArray()
      .catch(() => []);
  }
  const merged = [
    ...(Array.isArray(bucketRowsViaModel) ? bucketRowsViaModel : []),
    ...(Array.isArray(bucketRowsDirect) ? bucketRowsDirect : []),
    ...(Array.isArray(legacyRowsFlat) ? legacyRowsFlat : []),
    ...(Array.isArray(legacyRowsNested) ? legacyRowsNested : []),
  ];
  if (!merged.length) return [];
  const keyOf = (row?, idx?) => {
    const n = Number(row?.ticketNumber);
    if (Number.isInteger(n) && n > 0) return `n:${n}`;
    const oid = row?._id != null ? String(row._id) : "";
    if (oid) return `id:${oid}`;
    const uid = String(row?.userId || "");
    const c = row?.closedAt ? new Date(row.closedAt).getTime() : 0;
    const u = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    const tt = String(row?.ticketType || "");
    return `f:${uid}:${tt}:${c}:${u}:${idx}`;
  };
  const ts = (row?) => {
    const c = row?.closedAt ? new Date(row.closedAt).getTime() : 0;
    const u = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    return Math.max(c, u, 0);
  };
  const bestByKey = new Map();
  for (let i = 0; i < merged.length; i += 1) {
    const row = merged[i];
    const k = keyOf(row, i);
    const prev = bestByKey.get(k);
    if (!prev || ts(row) > ts(prev)) bestByKey.set(k, row);
  }
  return Array.from(bestByKey.values()).sort((a?, b?) => {
    const numDiff = Number(b?.ticketNumber || 0) - Number(a?.ticketNumber || 0);
    if (numDiff !== 0) return numDiff;
    return ts(b) - ts(a);
  });
}

async function resolveClosedTicketByNumber(guildId?, ticketNumber?) {
  const gid = String(guildId || "").trim();
  const num = Number(ticketNumber);
  if (!gid || !Number.isInteger(num) || num <= 0) return null;
  const docs = await fetchClosedTicketsOrdered(gid);
  return docs.find((row?) => Number(row?.ticketNumber) === num) || null;
}

export = {
  resolveClosedTicketByNumber,
  hasStaffTicketRole,
  isTicketOpenedByMember,
  memberCanActAsTicketStaff,
  canSeeCloseRequestPanel,
};