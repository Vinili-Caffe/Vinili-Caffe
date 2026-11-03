/** Ticket dal sito: elenco dei comandi del bot (prefisso e slash) che lo staff può lanciare dalla chat. */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { viniliPath } = require("../../paths") as typeof import("../../paths");
const mongoose = require("mongoose") as typeof import("mongoose");
const { ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteWebTicket } = require("../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { resolveWebsiteGuildMember } = require("../http/siteRoleRequestApi") as typeof import("../http/siteRoleRequestApi");
const { fetchWebsiteGuildMember } = require("../http/websiteGuildMemberFetch") as typeof import("../http/websiteGuildMemberFetch");
const { normalizeHeaderSecret } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { normalizeCategory, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { memberIsWebTicketStaff, memberCanAccessTicketCategory, ticketHasAddedUser, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");

async function resolveMemberOrStaff(client?, req?, opts: Record<string, any> = {}) {
  const needStaff = opts.needStaff === true;
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const user = await resolveWebsiteGuildMember(client, accessToken);
  if (!user.ok) {
    return { ok: false, status: user.status, error: user.error, message: user.message };
  }
  let member = user.member;
  // ticketsListHang1 + mobileApisFast2: skip soft refresh when roles.cache already usable.
  // Extra Discord fetch stacked on resolveWebsiteGuildMember and hung phones.
  // ticketNotifStaffOpen1: scope=staff su telefono → se ruoli assenti/non-staff, hard refresh
  // (altrimenti lista “staff” diventava personali e open ticket → 403 toast).
  // ticketPhoneFirst1: anche scope personali — se roles.cache vuota, hard refresh (soft 1.8s
  // su telefono falliva → staffAccess false + UI senza tab Staff al primo paint).
  try {
    const hasRoles =
      member &&
      member.roles &&
      member.roles.cache &&
      typeof member.roles.cache.has === "function" &&
      Number(member.roles.cache.size || 0) > 0;
    const looksStaff = hasRoles && memberIsWebTicketStaff(member);
    const needHardRoles = !hasRoles || (needStaff && !looksStaff);
    // ticketCloseTimeout1: mai retry 18s su hard roles — claim/close andavano oltre
    // AbortController desktop (18s) mentre Discord bot API timeouttava (6.5+18s).
    if (needHardRoles) {
      const guild = member?.guild || user.guild;
      const uid = String(member?.id || user.userId || "").trim();
      if (guild && uid) {
        const fresh = await fetchWebsiteGuildMember(guild, uid, {
          force: needHardRoles,
          timeoutMs: needStaff ? 3200 : 1600,
          retry: false,
          soft: true,
        }).catch(() => null);
        if (fresh && fresh.roles && fresh.roles.cache && typeof fresh.roles.cache.has === "function") {
          member = fresh;
        }
      }
    }
  } catch {
    /* keep cached member */
  }
  if (!member || !member.id) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Sessione Discord non valida. Ricarica o accedi di nuovo.",
    };
  }
  return {
    ok: true,
    isStaff: memberIsWebTicketStaff(member),
    member,
    userId: String(member.id),
    accessToken,
  };
}

async function loadTicketForActor(ticketId?, actor?) {
  if (!mongoose.isValidObjectId(ticketId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "Ticket non valido." };
  }
  const ticket = await SiteWebTicket.findById(ticketId);
  if (!ticket) {
    return { ok: false, status: 404, error: "not_found", message: "Ticket non trovato." };
  }
  const isOwner = String(ticket.userId) === String(actor.userId);
  const isAdded = ticketHasAddedUser(ticket, actor.userId);
  const category = normalizeCategory(ticket.category) || String(ticket.category || "supporto");
  if (!isOwner && !isAdded) {
    if (!actor.isStaff) {
      return { ok: false, status: 403, error: "forbidden", message: "Non puoi accedere a questo ticket." };
    }
    if (!memberCanAccessTicketCategory(actor.member, category)) {
      return { ok: false, status: 403, error: "forbidden", message: "Non hai accesso a questa categoria di ticket." };
    }
  }
  return { ok: true, ticket, isOwner, isAdded, category };
}

const WEB_TICKET_COMMAND_PRIORITY = [
  "description",
];

function listPrefixCommandsForStaff(client?, member?, userId?, ticketCategory?) {
  const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
  const { isPrefixCommandAllowedInWebTicket } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
  const guildId = resolveGuildId(client);
  const seen = new Set();
  const commands = [];
  const collection = client?.pcommands;
  if (!collection || typeof collection.values !== "function") {
    return { prefix, commands };
  }
  for (const cmd of collection.values()) {
    const name = String(cmd?.name || "")
      .trim()
      .toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (
      !isPrefixCommandAllowedInWebTicket({
        member,
        userId,
        commandName: name,
        ticketCategory,
        client,
        guildId,
      })
    ) {
      continue;
    }
    const aliases = Array.isArray(cmd.aliases)
      ? cmd.aliases
          .map((a?) =>
            String(a || "")
              .trim()
              .toLowerCase(),
          )
          .filter((a?) => a && a !== name)
      : [];
    const subs = Array.isArray(cmd.subcommands)
      ? [
          ...new Set(
            cmd.subcommands
              .map((s?) =>
                String(s || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean),
          ),
        ]
      : [];
    const requireSubs = subs.length > 0 && !Boolean(cmd.allowEmptyArgs);
    const description = String(cmd.description || cmd.helpDescription || "").trim().slice(0, 160);
    const category = String(cmd.folder || cmd.category || "").trim();
    if (requireSubs) {
      for (const sub of subs) {
        const invoke = `${name} ${sub}`;
        if (seen.has(invoke)) continue;
        seen.add(invoke);
        let subDesc = description;
        if (typeof cmd.getSubcommandDescription === "function") {
          subDesc = String(cmd.getSubcommandDescription(sub) || "").trim().slice(0, 160) || description;
        } else if (cmd.subcommandDescriptions && typeof cmd.subcommandDescriptions === "object") {
          subDesc = String(cmd.subcommandDescriptions[(sub as any)] || "").trim().slice(0, 160) || description;
        }
        commands.push({
          name,
          invoke,
          aliases: [],
          description: subDesc,
          usage: String(cmd.usage || `${prefix}${invoke}`).trim().slice(0, 80),
          category,
        });
      }
      continue;
    }
    commands.push({
      name,
      invoke: name,
      aliases,
      description,
      usage: String(cmd.usage || `${prefix}${name}`).trim().slice(0, 80),
      category,
    });
  }
  commands.sort((a?, b?) => {
    const pa = WEB_TICKET_COMMAND_PRIORITY.indexOf(a.name);
    const pb = WEB_TICKET_COMMAND_PRIORITY.indexOf(b.name);
    const ia = pa === -1 ? 999 : pa;
    const ib = pb === -1 ? 999 : pb;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  });
  return { prefix, commands };
}

function slashCommandJson(cmd?) {
  if (cmd?._helpDataJson && typeof cmd._helpDataJson === "object") return cmd._helpDataJson;
  if (typeof cmd?.data?.toJSON === "function") {
    try {
      return cmd.data.toJSON();
    } catch {
      return null;
    }
  }
  return null;
}

function loadSlashCommandsFromDisk() {
  if ((loadSlashCommandsFromDisk as any).cache) return (loadSlashCommandsFromDisk as any).cache;
  const items = [];
  const root = viniliPath("Commands");
  if (!fs.existsSync(root)) return items;
  let folders = [];
  try {
    folders = fs.readdirSync(root, { withFileTypes: true }).filter((d?) => d.isDirectory());
  } catch {
    return items;
  }
  for (const folder of folders) {
    const dir = path.join(root, folder.name);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f?) => f.endsWith(".js"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const command = require(path.join(dir, file));
        const json = slashCommandJson(command);
        if (!json) continue;
        command._helpDataJson = json;
        command.category = command.category || folder.name;
        items.push(command);
      } catch {
        continue;
      }
    }
  }
  (loadSlashCommandsFromDisk as any).cache = items;
  return items;
}

function listSlashCommandsForStaff(client?, member?, userId?, ticketCategory?) {
  const { isSlashCommandAllowedInWebTicket } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
  const guildId = resolveGuildId(client);
  const seen = new Set();
  const commands = [];
  let source = [];
  const collection = client?.commands;
  if (collection && typeof collection.values === "function" && collection.size) {
    source = Array.from(collection.values());
  } else {
    source = loadSlashCommandsFromDisk();
  }
  for (const cmd of source) {
    const json = slashCommandJson(cmd);
    const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
    if (type !== ApplicationCommandType.ChatInput) continue;
    const name = String(json?.name || cmd?.data?.name || "")
      .trim()
      .toLowerCase();
            if (cmd?.expectsModal === true && name !== "partnership") continue;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (
      !isSlashCommandAllowedInWebTicket({
        member,
        userId,
        commandName: name,
        ticketCategory,
        client,
        guildId,
      })
    ) {
      continue;
    }
    const description = String(json?.description || cmd.helpDescription || cmd.description || "").trim().slice(0, 160);
    const options = Array.isArray(json?.options) ? json.options : [];
    const subs = options.filter((o?) => Number(o?.type) === ApplicationCommandOptionType.Subcommand);
    const groups = options.filter((o?) => Number(o?.type) === ApplicationCommandOptionType.SubcommandGroup);
    if (!subs.length && !groups.length) {
      commands.push({
        name,
        invoke: name,
        description,
        usage: `/${name}`,
        category: String(cmd.category || cmd.folder || "").trim(),
        kind: "slash",
      });
      continue;
    }
    for (const sub of subs) {
      const subName = String(sub?.name || "").trim().toLowerCase();
      if (!subName) continue;
      commands.push({
        name,
        invoke: `${name} ${subName}`,
        description: String(sub?.description || description).trim().slice(0, 160),
        usage: `/${name} ${subName}`,
        category: String(cmd.category || cmd.folder || "").trim(),
        kind: "slash",
      });
    }
    for (const group of groups) {
      const groupName = String(group?.name || "").trim().toLowerCase();
      const nested = Array.isArray(group?.options) ? group.options : [];
      for (const sub of nested) {
        if (Number(sub?.type) !== ApplicationCommandOptionType.Subcommand) continue;
        const subName = String(sub?.name || "").trim().toLowerCase();
        if (!groupName || !subName) continue;
        commands.push({
          name,
          invoke: `${name} ${groupName} ${subName}`,
          description: String(sub?.description || description).trim().slice(0, 160),
          usage: `/${name} ${groupName} ${subName}`,
          category: String(cmd.category || cmd.folder || "").trim(),
          kind: "slash",
        });
      }
    }
  }
  commands.sort((a?, b?) => a.invoke.localeCompare(b.invoke));
  return commands;
}

async function handleSiteWebTicketsCommandsGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  if (!memberIsWebTicketStaff(actor.member)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo lo staff può usare i comandi." });
  }
  const ticketId = String(req.query?.ticketId || "").trim();
  if (!ticketId) {
    const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, prefix, commands: [], slashCommands: [] });
  }
  const loaded = await loadTicketForActor(ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canUseCommands) {
    /* ticketCommandsSoft1: niente 403 in console su ticket non-partnership / chiusi */
    const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      prefix,
      category: loaded.category || String(loaded.ticket.category || ""),
      commands: [],
      slashCommands: [],
      canUseCommands: false,
    });
  }
  const listed = listPrefixCommandsForStaff(
    client,
    actor.member,
    actor.userId,
    loaded.category || loaded.ticket.category,
  );
  const slashCommands = listSlashCommandsForStaff(
    client,
    actor.member,
    actor.userId,
    loaded.category || loaded.ticket.category,
  );
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    ok: true,
    prefix: listed.prefix,
    category: loaded.category || String(loaded.ticket.category || ""),
    commands: listed.commands,
    slashCommands,
  });
}

export = { resolveMemberOrStaff, loadTicketForActor, slashCommandJson, loadSlashCommandsFromDisk, handleSiteWebTicketsCommandsGet };
