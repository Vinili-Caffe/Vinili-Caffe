
const mongoose = require("mongoose") as typeof import("mongoose");
const { ChannelType, Collection, ApplicationCommandType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteWebTicketMessage } = require("../../features/tickets/data/siteWebTicketSchemas") as typeof import("../../features/tickets/data/siteWebTicketSchemas");
const { knownBotDisplayName, buildWebTicketChannelName, sanitizeText, normalizeCategory, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { rememberBotUserId, serializeMessage, refreshTicketLastMessageFields, serializeTicket, previewFromContent, serializeTicketForActor } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { MAX_CONTENT, emitTicketEvent } = require("./ticketNotify") as typeof import("./ticketNotify");
const { handleOfficialPrefixMessage } = require("../../Utils/Prefix/officialPrefixDispatcher") as typeof import("../../Utils/Prefix/officialPrefixDispatcher");
const { resolveMemberOrStaff, loadTicketForActor, slashCommandJson, loadSlashCommandsFromDisk, handleSiteWebTicketsCommandsGet } = require("./ticketCommandList") as typeof import("./ticketCommandList");
const { extractCommandOutput, wrapCapturedMessage, buildWebTicketSlashOptions, executeWebTicketPartnershipSlash } = require("./ticketPartnershipCommand") as typeof import("./ticketPartnershipCommand");



function isWebTicketPrefixInput(raw?) {
  return /^[+!/]/.test(String(raw || "").trim());
}

function normalizeWebTicketPrefixInput(raw?, defaultPrefix?) {
  let input = sanitizeText(raw, 500);
  if (!input || !isWebTicketPrefixInput(input)) return null;
  const prefix = String(defaultPrefix || "+").trim() || "+";
  if (input.startsWith("!") || input.startsWith("/")) {
    input = prefix + input.slice(1);
  }
  return input;
}

function makeSnowflakeCollection(items = []) {
  const col = new Collection();
  for (const item of items) {
    if (item?.id) col.set(String(item.id), item);
  }
  return col;
}

function captureUserSend(user?, outputs?) {
  if (!user) return user;
  const originalSend = typeof user.send === "function" ? user.send.bind(user) : null;
  return new Proxy(user, {
    get(target?, prop?) {
      if (prop === "send") {
        return async (payload?) => {
          const text = extractCommandOutput(payload);
          outputs.push(text ? `Inviato in DM: ${text}` : "Messaggio inviato in DM.");
          if (originalSend) {
            try {
              return await originalSend(payload);
            } catch {
              return { id: `web-dm-${Date.now()}`, delete: async () => {} };
            }
          }
          return { id: `web-dm-${Date.now()}`, delete: async () => {} };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function resolvePrefixCommandFromInput(client?, input?, defaultPrefix?) {
  const rest = String(input || "")
    .slice(String(defaultPrefix || "+").length)
    .trim();
  const token = rest.split(/\s+/)[0];
  if (!token) return null;
  const name = token.toLowerCase();
  return (
    client?.pcommands?.get?.(name) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(name)) ||
    null
  );
}

async function buildWebTicketMentions(guild?, content?) {
  const users = makeSnowflakeCollection();
  const members = makeSnowflakeCollection();
  const roles = makeSnowflakeCollection();
  const channels = makeSnowflakeCollection();
  const text = String(content || "");
  const userIds = [...text.matchAll(/<@!?(\d{15,22})>/g)].map((m?) => m[1]);
  const roleIds = [...text.matchAll(/<@&(\d{15,22})>/g)].map((m?) => m[1]);
  const channelIds = [...text.matchAll(/<#(\d{15,22})>/g)].map((m?) => m[1]);
  for (const id of userIds) {
    const member =
      guild?.members?.cache?.get(id) ||
      (await guild?.members?.fetch?.(id).catch?.(() => null)) ||
      null;
    const user = member?.user || (await guild?.client?.users?.fetch?.(id).catch?.(() => null));
    if (user) users.set(id, user);
    if (member) members.set(id, member);
  }
  for (const id of roleIds) {
    const role = guild?.roles?.cache?.get(id);
    if (role) roles.set(id, role);
  }
  for (const id of channelIds) {
    const ch = guild?.channels?.cache?.get(id);
    if (ch) channels.set(id, ch);
  }
  return {
    users,
    members,
    roles,
    channels,
    everyone: false,
    has: (type?) => {
      if (type === "everyone") return false;
      return Boolean(users.size || members.size || roles.size || channels.size);
    },
  };
}

function findChatInputCommand(client?, name?) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const collection = client?.commands;
  if (collection) {
    const typed = collection.get?.(`${key}:${ApplicationCommandType.ChatInput}`) || collection.get?.(`${key}:1`);
    if (typed) return typed;
    if (typeof collection.values === "function") {
      for (const cmd of collection.values()) {
        const json = slashCommandJson(cmd);
        const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
        const cmdName = String(json?.name || cmd?.data?.name || "").trim().toLowerCase();
        if (type === ApplicationCommandType.ChatInput && cmdName === key) return cmd;
      }
    }
  }
  for (const cmd of loadSlashCommandsFromDisk()) {
    const json = slashCommandJson(cmd);
    const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
    const cmdName = String(json?.name || cmd?.data?.name || "").trim().toLowerCase();
    if (type === ApplicationCommandType.ChatInput && cmdName === key) return cmd;
  }
  return null;
}

async function executeListedSlashCommand(client, actor, ticket, rawInput, { guild, fakeChannel, outputs }) {
  const trimmed = String(rawInput || "").trim();
  const rest = trimmed.replace(/^\//, "").trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const name = String(tokens[0] || "").toLowerCase();
  if (!name) {
    return "Inserisci un comando slash. Digita `/` per vedere quelli disponibili.";
  }
  const cmd = findChatInputCommand(client, name);
  const ticketCategory = normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase();
  const { isSlashCommandAllowedInWebTicket } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
  if (
    !cmd ||
    !isSlashCommandAllowedInWebTicket({
      member: actor.member,
      userId: actor.userId,
      commandName: name,
      ticketCategory,
      client,
      guildId: guild.id,
    })
  ) {
    return `Comando slash sconosciuto: \`/${name}\`. Digita \`/\` per vedere gli slash command disponibili.`;
  }

  if (name === "partnership") {
    return executeWebTicketPartnershipSlash(client, actor, ticket, trimmed, {
      guild,
      fakeChannel,
      outputs,
    });
  }

  if (cmd.expectsModal) {
    return `\`/${name}\` apre un modulo su Discord e non è eseguibile da qui. Usalo nel server.`;
  }

  const optionTokens = tokens.slice(1);
  let replied = false;
  const capture = async (payload?) => {
    const text = extractCommandOutput(payload);
    if (text) outputs.push(text);
    replied = true;
    return wrapCapturedMessage("web-slash", outputs);
  };
  const fakeInteraction = {
    commandName: name,
    commandType: ApplicationCommandType.ChatInput,
    user: actor.member?.user,
    member: actor.member,
    guild,
    guildId: guild.id,
    channel: fakeChannel,
    channelId: fakeChannel.id,
    client,
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    deferred: false,
    replied: false,
    ephemeral: false,
    options: buildWebTicketSlashOptions(optionTokens, guild),
    inGuild: () => true,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    reply: async (payload?) => {
      fakeInteraction.replied = true;
      return capture(payload);
    },
    deferReply: async () => {
      fakeInteraction.deferred = true;
    },
    editReply: capture,
    followUp: capture,
    deleteReply: async () => {},
    showModal: async () => {
      outputs.push(`\`/${name}\` apre un modulo su Discord e non è eseguibile da qui.`);
    },
  };

  try {
    await cmd.execute(fakeInteraction);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] slash:", err?.message || err);
    if (!outputs.length) {
      return `\`/${rest}\` non è eseguibile da questo ticket web. Usalo su Discord.`;
    }
  }
  if (!outputs.length && !replied) {
    return `\`/${rest}\` non ha prodotto una risposta qui. Se serve un modulo o opzioni, usalo su Discord.`;
  }
  return outputs.filter(Boolean).join("\n\n").trim();
}

async function executeWebTicketPrefixCommand(client?, actor?, ticket?, rawInput?) {
  const outputs = [];
  const deletedMessageIds = [];
  const guildId = resolveGuildId(client);
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  if (!guild) {
    throw new Error("guild_unavailable");
  }

  const captureSend = async (payload?) => {
    outputs.push(extractCommandOutput(payload));
    return wrapCapturedMessage("web-cmd", outputs);
  };

  const fakeMessages = {
    fetch: async (options: Record<string, any> = {}) => {
      const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
      const query: Record<string, any> = { ticketId: ticket._id };
      const before = String(options.before || "").trim();
      if (before && mongoose.isValidObjectId(before)) {
        query._id = { $lt: before };
      }
      const docs = await SiteWebTicketMessage.find(query).sort({ _id: -1 }).limit(limit).lean();
      const items = docs.map((doc?) => {
        const id = String(doc._id);
        return {
          id,
          createdTimestamp: new Date(doc.createdAt || Date.now()).getTime(),
          deletable: true,
          bulkDeletable: true,
          pinned: false,
          author: { id: String(doc.authorId || "") },
          delete: async () => {
            const gone = await SiteWebTicketMessage.findOneAndDelete({ _id: doc._id, ticketId: ticket._id });
            if (gone) deletedMessageIds.push(id);
          },
        };
      });
      return makeSnowflakeCollection(items);
    },
  };

  const fakeChannel = {
    id: `web-ticket-${String(ticket._id)}`,
    name: String(buildWebTicketChannelName(ticket) || "ticket-web").slice(0, 80) || "ticket-web",
    type: ChannelType.GuildText,
    guild,
    guildId: guild.id,
    client,
    nsfw: false,
    parentId: null,
    parent: null,
    topic: null,
    messages: fakeMessages,
    send: captureSend,
    sendTyping: async () => {},
    bulkDelete: async (messages?) => {
      const list = Array.isArray(messages)
        ? messages
        : messages && typeof messages.values === "function"
          ? [...messages.values()]
          : [];
      const deleted = [];
      for (const msg of list) {
        if (typeof msg?.delete === "function") await msg.delete();
        if (msg?.id) deleted.push(msg);
      }
      return makeSnowflakeCollection(deleted);
    },
    isTextBased: () => true,
    isDMBased: () => false,
    isThread: () => false,
    isVoiceBased: () => false,
    isText: () => true,
    toString: () => `#${String(buildWebTicketChannelName(ticket) || "ticket-web").slice(0, 40)}`,
    permissionsFor: (memberOrRole?) => memberOrRole?.permissions || { has: () => true },
    awaitMessages: async () => makeSnowflakeCollection(),
    createMessageCollector() {
      return { on() {}, once() {}, stop() {} };
    },
    createMessageComponentCollector() {
      return { on() {}, once() {}, stop() {} };
    },
  };

  const defaultPrefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
  if (String(rawInput || "").trim().startsWith("/")) {
    const text = await executeListedSlashCommand(client, actor, ticket, rawInput, {
      guild,
      fakeChannel,
      outputs,
    });
    return { text, input: String(rawInput || "").trim(), deletedMessageIds };
  }
  const input = normalizeWebTicketPrefixInput(rawInput, defaultPrefix);
  if (!input) {
    return { text: "Inserisci un comando che inizia con +.", input: String(rawInput || "").trim(), deletedMessageIds };
  }

  const mentions = await buildWebTicketMentions(guild, input);
  const fakeAuthor = captureUserSend(actor.member?.user, outputs);
  const fakeMessage = {
    id: `web-cmd-msg-${Date.now()}`,
    channel: fakeChannel,
    channelId: fakeChannel.id,
    guild,
    guildId: guild.id,
    member: actor.member,
    author: fakeAuthor,
    client,
    content: input,
    cleanContent: input,
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    mentions,
    attachments: makeSnowflakeCollection(),
    stickers: makeSnowflakeCollection(),
    embeds: [],
    components: [],
    reactions: { cache: makeSnowflakeCollection(), resolve: () => null },
    reference: null,
    mentionsEveryone: false,
    inGuild: () => true,
    deletable: false,
    editable: false,
    pinned: false,
    tts: false,
    system: false,
    webhookId: null,
    type: 0,
    url: "",
    __webTicketSync: true,
    __webTicketCategory: normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase(),
    delete: async () => {},
    react: async () => {},
    fetch: async () => fakeMessage,
    startThread: async () => fakeChannel,
    reply: captureSend,
  };

  const resolved = resolvePrefixCommandFromInput(client, input, defaultPrefix);
  if (!resolved) {
    const token = input.slice(defaultPrefix.length).trim().split(/\s+/)[0] || "";
    return {
      text: `Comando sconosciuto: \`${defaultPrefix}${token}\`. Digita \`+\` per vedere i comandi disponibili.`,
      input,
      deletedMessageIds,
    };
  }

  const cmdName = String(resolved.name || "").toLowerCase();
  const ticketCategory = normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase();
  const { isPrefixCommandAllowedInWebTicket } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
  if (
    !isPrefixCommandAllowedInWebTicket({
      member: actor.member,
      userId: actor.userId,
      commandName: cmdName,
      ticketCategory,
      client,
      guildId: guild.id,
    })
  ) {
    if (cmdName === "ticket") {
      return {
        text: "Su questo ticket web usa i pulsanti in alto (prendi in carico / chiudi). Il pannello Discord `+ticket` non è disponibile qui.",
        input,
        deletedMessageIds,
      };
    }
    if (cmdName === "description" && ticketCategory !== "partnership") {
      return {
        text: "Il comando `+description` (`+desc`) si usa **solo nei ticket partnership**.",
        input,
        deletedMessageIds,
      };
    }
    return {
      text: `Il comando \`${defaultPrefix}${cmdName}\` non è disponibile in questo ticket (permessi, canale o categoria).`,
      input,
      deletedMessageIds,
    };
  }

  try {
            const subs = Array.isArray(resolved.subcommands)
      ? [
          ...new Set(
            resolved.subcommands
              .map((s?) =>
                String(s || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean),
          ),
        ]
      : [];
    if (subs.length === 1 && !Boolean(resolved.allowEmptyArgs)) {
      const rest = String(input || "")
        .slice(String(defaultPrefix || "+").length)
        .trim();
      const parts = rest.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        const filled = `${defaultPrefix}${parts[0]} ${subs[0]}`;
        fakeMessage.content = filled;
        fakeMessage.cleanContent = filled;
      }
    }

    await handleOfficialPrefixMessage({
      message: fakeMessage,
      resolvedClient: client,
      defaultPrefix,
    });
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] command execute:", err?.message || err);
    const fallback = outputs.filter(Boolean).join("\n\n").trim();
    return {
      text:
        fallback ||
        `Errore durante \`${input}\`: ${String(err?.message || "esecuzione fallita").slice(0, 180)}`,
      input,
      deletedMessageIds,
    };
  }

  if (deletedMessageIds.length) {
    await refreshTicketLastMessageFields(ticket);
    const serializedTicket = serializeTicket(ticket, { includeStaffFields: true });
    const uniqueIds = [...new Set(deletedMessageIds)];
    for (const messageId of uniqueIds.slice(0, 80)) {
      emitTicketEvent({
        type: "web_ticket_message_deleted",
        ticketId: String(ticket._id),
        messageId,
        ticket: serializedTicket,
      });
    }
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }

  let text = outputs.filter(Boolean).join("\n\n").trim().slice(0, MAX_CONTENT);
  if (!text) {
    text = deletedMessageIds.length
      ? `Eliminati ${[...new Set(deletedMessageIds)].length} messaggi da questo ticket.`
      : `Nessuna risposta da \`${input}\`. Questo comando potrebbe non essere disponibile nei ticket web, oppure non ha prodotto un messaggio.`;
  }
  return { text, input, deletedMessageIds: [...new Set(deletedMessageIds)] };
}

async function createBotCommandMessage(ticket?, content?, client?) {
  rememberBotUserId(client);
  const bot = client?.user;
  const safeContent = sanitizeText(content, MAX_CONTENT);
  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: String(bot?.id || "bot"),
    authorName: String(
      knownBotDisplayName(bot?.id) || bot?.displayName || bot?.username || "Bot",
    ).slice(0, 80),
    authorAvatarUrl: typeof bot?.displayAvatarURL === "function" ? bot.displayAvatarURL({ size: 128 }) : "",
    authorKind: "bot",
    content: safeContent,
    imageUrls: [],
  });
  ticket.lastMessageAt = msg.createdAt || new Date();
  ticket.lastMessagePreview = previewFromContent(safeContent, 0);
  ticket.lastAuthorKind = "bot";
  ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  await ticket.save();
  return msg;
}

async function runWebTicketPrefixCommandFlow(client?, actor?, ticket?, rawInput?, { isOwner = false, isAdded = false } = {}) {
  const { text, input, deletedMessageIds = [] } = await executeWebTicketPrefixCommand(client, actor, ticket, rawInput);
  if (String(text || "") === "WEB_PARTNERSHIP_NEED_FORM") {
    return {
      ok: false,
      error: "partnership_need_form",
      needPartnershipForm: true,
      message: "Scegli il manager e inserisci la descrizione del server (con invite Discord).",
      command: input || rawInput,
      deletedMessageIds,
    };
  }
  const serialized = serializeTicketForActor(actor, ticket, { isOwner, isAdded, includeStaffFields: true });
  const replyText =
    String(text || "").trim() ||
    `Nessuna risposta da \`${input || rawInput}\`. Questo comando potrebbe non essere disponibile nei ticket web.`;
  const reply = await createBotCommandMessage(ticket, replyText, client);
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serialized.id,
    message: serializeMessage(reply),
    ticket: serialized,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  return {
    ok: true,
    output: replyText,
    command: input,
    ticket: serialized,
    message: serializeMessage(reply),
    deletedMessageIds,
  };
}

async function handleSiteWebTicketsCommandPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canUseCommands) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Comandi non disponibili su questo ticket." });
  }

  const rawInput = sanitizeText(req.body?.input || req.body?.command, MAX_CONTENT);
  if (!rawInput || !isWebTicketPrefixInput(rawInput)) {
    return res.status(400).json({ ok: false, error: "invalid_command", message: "Inserisci un comando che inizia con +, ! o /." });
  }

  try {
    const result = await runWebTicketPrefixCommandFlow(client, actor, loaded.ticket, rawInput, {
      isOwner: loaded.isOwner,
      isAdded: loaded.isAdded,
    });
    if (result && result.ok === false && result.needPartnershipForm) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] command:", err?.message || err);
    try {
      const failText = "Esecuzione comando fallita. Riprova tra poco.";
      const reply = await createBotCommandMessage(loaded.ticket, failText, client);
      const serialized = serializeTicketForActor(actor, loaded.ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(reply),
        ticket: serialized,
      });
      return res.status(200).json({
        ok: true,
        output: failText,
        command: rawInput,
        ticket: serialized,
        message: serializeMessage(reply),
        deletedMessageIds: [],
      });
    } catch {
      return res.status(500).json({ ok: false, error: "command_failed", message: "Esecuzione comando fallita." });
    }
  }
}

export = { isWebTicketPrefixInput, runWebTicketPrefixCommandFlow, resolveMemberOrStaff, loadTicketForActor, handleSiteWebTicketsCommandsGet, handleSiteWebTicketsCommandPost };
