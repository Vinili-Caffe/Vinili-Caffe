const { OverwriteType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");

const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const SNOWFLAKE_RE = /^\d{16,22}$/;

function normalizeOverwriteTargetId(id?) {
  const out = String(id || "").trim();
  return SNOWFLAKE_RE.test(out) ? out : "";
}

async function editTicketMemberOverwrite(channel?, userId?, options?, extras: Record<string, any> = {}) {
  const id = normalizeOverwriteTargetId(userId);
  if (!channel?.permissionOverwrites?.edit || !id) return null;
  return channel.permissionOverwrites
    .edit(id, options, { type: OverwriteType.Member, ...extras })
    .catch(() => null);
}

async function editTicketRoleOverwrite(channel?, roleId?, options?, extras: Record<string, any> = {}) {
  const id = normalizeOverwriteTargetId(roleId);
  if (!channel?.permissionOverwrites?.edit || !id) return null;
  return channel.permissionOverwrites
    .edit(id, options, { type: OverwriteType.Role, ...extras })
    .catch(() => null);
}

/* ticketSlashPerm1: senza UseApplicationCommands Discord nasconde i / dopo cancel nel ticket */
const TICKET_STAFF_SPECTATE_OVERWRITES = Object.freeze({
  ViewChannel: true,
  SendMessages: false,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
  UseApplicationCommands: true,
});

const HIGHSTAFF_TICKET_WRITE_OVERWRITES = Object.freeze({
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
  UseApplicationCommands: true,
});

const TICKET_STAFF_SPECTATE_CREATE_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands,
];

const HIGHSTAFF_TICKET_WRITE_CREATE_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands,
];

function isHighStaffTicketRoleId(roleId?, highStaffRoleId = HIGHSTAFF_ROLE_ID) {
  const id = String(roleId || "").trim();
  const hs = String(highStaffRoleId || "").trim();
  return Boolean(id && hs && id === hs);
}

function resolveTicketStaffRoleOverwrite(roleId?, highStaffRoleId = HIGHSTAFF_ROLE_ID) {
  return isHighStaffTicketRoleId(roleId, highStaffRoleId)
    ? HIGHSTAFF_TICKET_WRITE_OVERWRITES
    : TICKET_STAFF_SPECTATE_OVERWRITES;
}

function permissionMapToAllowDeny(options?) {
  const allow = [];
  const deny = [];
  for (const [key, value] of Object.entries(options || {})) {
    const bit = PermissionFlagsBits[key];
    if (bit == null) continue;
    if (value === true) allow.push(bit);
    else if (value === false) deny.push(bit);
  }
  return { allow, deny };
}

function buildTypedCreateOverwrite(id?, type?, { allow = [], deny = [] } = {}) {
  const targetId = normalizeOverwriteTargetId(id);
  if (!targetId) return null;
  const payload: Record<string, any> = { id: targetId, type };
  if (allow?.length) payload.allow = allow;
  if (deny?.length) payload.deny = deny;
  return payload;
}

function buildTicketRoleCreateOverwrite(roleId?, { allow = [], deny = [] } = {}) {
  return buildTypedCreateOverwrite(roleId, OverwriteType.Role, { allow, deny });
}

function buildTicketMemberCreateOverwrite(userId?, { allow = [], deny = [] } = {}) {
  return buildTypedCreateOverwrite(userId, OverwriteType.Member, { allow, deny });
}

function toTicketRoleCreateOverwrite(roleId?, permissionMap?) {
  return buildTicketRoleCreateOverwrite(roleId, permissionMapToAllowDeny(permissionMap));
}

function toTicketMemberCreateOverwrite(userId?, permissionMap?) {
  return buildTicketMemberCreateOverwrite(userId, permissionMapToAllowDeny(permissionMap));
}

function buildTicketEveryoneDenyViewCreateOverwrite(everyoneId?) {
  return buildTicketRoleCreateOverwrite(everyoneId, {
    deny: [PermissionFlagsBits.ViewChannel],
  });
}

function buildTicketRoleDenyViewCreateOverwrite(roleId?) {
  return buildTicketRoleCreateOverwrite(roleId, {
    deny: [PermissionFlagsBits.ViewChannel],
  });
}

function buildTicketOpenerCreateOverwrite(userId?, allowBits?) {
  return buildTicketMemberCreateOverwrite(userId, { allow: allowBits });
}

function buildTicketStaffSpectateCreateOverwrite(roleId?) {
  const id = normalizeOverwriteTargetId(roleId);
  if (!id) return null;
  return buildTicketRoleCreateOverwrite(id, {
    allow: TICKET_STAFF_SPECTATE_CREATE_ALLOW,
    deny: [PermissionFlagsBits.SendMessages],
  });
}

function buildHighStaffTicketWriteCreateOverwrite(roleId = HIGHSTAFF_ROLE_ID) {
  const id = normalizeOverwriteTargetId(roleId);
  if (!id) return null;
  return buildTicketRoleCreateOverwrite(id, {
    allow: HIGHSTAFF_TICKET_WRITE_CREATE_ALLOW,
  });
}

function buildTicketStaffRoleCreateOverwrite(roleId?, highStaffRoleId = HIGHSTAFF_ROLE_ID) {
  if (isHighStaffTicketRoleId(roleId, highStaffRoleId)) {
    return buildHighStaffTicketWriteCreateOverwrite(roleId);
  }
  return buildTicketStaffSpectateCreateOverwrite(roleId);
}

async function applyHighStaffTicketWriteOverwrite(channel?, roleId = HIGHSTAFF_ROLE_ID) {
  await editTicketRoleOverwrite(channel, roleId, HIGHSTAFF_TICKET_WRITE_OVERWRITES);
}

async function applyTicketStaffRoleOverwrites(channel?, roleIds = [], options: Record<string, any> = {}) {
  const highStaffRoleId = String(options.highStaffRoleId || HIGHSTAFF_ROLE_ID || "").trim();
  if (!channel?.permissionOverwrites?.edit) return;
  for (const roleId of roleIds) {
    const id = normalizeOverwriteTargetId(roleId);
    if (!id) continue;
    await editTicketRoleOverwrite(channel, id, resolveTicketStaffRoleOverwrite(id, highStaffRoleId));
  }
}

export = {
  HIGHSTAFF_ROLE_ID,
  OverwriteType,
  TICKET_STAFF_SPECTATE_OVERWRITES,
  editTicketMemberOverwrite,
  editTicketRoleOverwrite,
  buildTicketRoleCreateOverwrite,
  buildTicketMemberCreateOverwrite,
  toTicketRoleCreateOverwrite,
  toTicketMemberCreateOverwrite,
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketRoleDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  buildTicketStaffRoleCreateOverwrite,
  applyHighStaffTicketWriteOverwrite,
  applyTicketStaffRoleOverwrites,
};
