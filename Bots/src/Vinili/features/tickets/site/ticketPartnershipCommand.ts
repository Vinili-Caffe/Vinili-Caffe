/** Ticket dal sito: il comando /partnership lanciato dalla chat, con gli stessi controlli di Discord. */
const { ApplicationCommandType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");

function embedPayloadToPlain(emb?) {
  if (!emb) return "";
  let data = emb;
  if (typeof emb.toJSON === "function") {
    try {
      data = emb.toJSON();
    } catch {
      data = emb.data || emb;
    }
  } else if (emb.data && typeof emb.data === "object") {
    data = emb.data;
  }
  const parts = [];
  if (data.author?.name) parts.push(String(data.author.name).trim());
  if (data.title) parts.push(String(data.title).trim());
  if (data.description) parts.push(String(data.description).trim());
  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      if (!field) continue;
      const line = `${field.name || ""}: ${field.value || ""}`.trim();
      if (line && line !== ":") parts.push(line);
    }
  }
  if (data.footer?.text) parts.push(String(data.footer.text).trim());
  return parts.filter(Boolean).join("\n").trim();
}

function extractComponentsHint(components?) {
  if (!Array.isArray(components) || !components.length) return "";
  const links = [];
  const labels = [];
  const walk = (node?) => {
    if (!node) return;
    let data = node;
    if (typeof node.toJSON === "function") {
      try {
        data = node.toJSON();
      } catch {
        data = node.data || node;
      }
    } else if (node.data && typeof node.data === "object") {
      data = node.data;
    }
    const label = data.label ? String(data.label).trim() : "";
    const url = data.url ? String(data.url).trim() : "";
        if (url && /^https?:\/\//i.test(url)) {
      links.push(label ? `[${label}](${url})` : url);
    } else if (label) {
      labels.push(label);
    }
    const kids = data.components || node.components;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  components.forEach(walk);
  const parts = [];
  if (links.length) parts.push(links.slice(0, 8).join(" · "));
  if (labels.length) {
    parts.push(`Pulsanti (solo su Discord): ${labels.slice(0, 8).join(", ")}`);
  } else if (!links.length) {
    return "Questo comando ha inviato pulsanti Discord che non sono disponibili sul sito.";
  }
  return parts.join("\n");
}

function extractCommandOutput(payload?) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  if (typeof payload !== "object") return String(payload);
  if (typeof payload.toJSON === "function" && (payload.data || payload.title || payload.description)) {
    const asEmbed = embedPayloadToPlain(payload);
    if (asEmbed) return asEmbed;
  }
  const parts = [];
  if (payload.content) parts.push(String(payload.content).trim());
  const embeds = Array.isArray(payload.embeds)
    ? payload.embeds
    : payload.embed
      ? [payload.embed]
      : [];
  for (const emb of embeds) {
    const text = embedPayloadToPlain(emb);
    if (text) parts.push(text);
  }
  const hint = extractComponentsHint(payload.components);
  if (hint) parts.push(hint);
  if (Array.isArray(payload.files) && payload.files.length && !parts.length) {
    parts.push("Il comando ha inviato un file che non può essere mostrato qui.");
  }
  return parts.filter(Boolean).join("\n").trim();
}

function wrapCapturedMessage(idPrefix?, outputs?) {
  return {
    id: `${idPrefix}-${Date.now()}`,
    deletable: false,
    editable: false,
    delete: async () => {},
    edit: async (payload?) => {
      const text = extractCommandOutput(payload);
      if (text) outputs.push(text);
      return wrapCapturedMessage(idPrefix, outputs);
    },
    react: async () => {},
    createMessageComponentCollector() {
      return { on() {}, once() {}, stop() {} };
    },
  };
}

function buildWebTicketSlashOptions(tokens?, guild = null) {
  const sub = tokens[0] || null;
  const group = null;
  const restJoined = tokens.slice(1).join(" ").trim();
  const resolveUserId = () => {
    for (const tok of tokens) {
      const m = String(tok || "").match(/^<@!?(\d{15,22})>$/);
      if (m) return m[1];
      if (/^\d{15,22}$/.test(String(tok || ""))) return String(tok);
    }
    return null;
  };
  return {
    getSubcommand: (required?) => {
      if (sub) return sub;
      if (required) throw new Error("missing_subcommand");
      return null;
    },
    getSubcommandGroup: (required?) => {
      if (required) throw new Error("missing_group");
      return group;
    },
    getUser: () => {
      const id = resolveUserId();
      if (!id) return null;
      const member = guild?.members?.cache?.get?.(id);
      return member?.user || { id, username: id, bot: false, system: false };
    },
    getMember: () => {
      const id = resolveUserId();
      if (!id || !guild) return null;
      return guild.members?.cache?.get?.(id) || null;
    },
    getString: () => restJoined || null,
    getInteger: () => {
      const n = Number(tokens[1]);
      return Number.isFinite(n) ? n : null;
    },
    getBoolean: () => null,
    getChannel: () => null,
    getRole: () => null,
    getAttachment: () => null,
    getMentionable: () => null,
    getNumber: () => null,
    data: [],
  };
}

function parseWebPartnershipCommandInput(rawInput?) {
  const trimmed = String(rawInput || "").trim();
  const body = trimmed.replace(/^\/+/, "").replace(/^partnership\b/i, "").trim();
  let managerId = null;
  let description = body;
  const mention = body.match(/^<@!?(\d{15,22})>([\s\S]*)$/);
  if (mention) {
    managerId = mention[1];
    description = String(mention[2] || "").trim();
    return { managerId, description };
  }
  const bare = body.match(/^(\d{15,22})(?:\s+([\s\S]*))?$/);
  if (bare) {
    managerId = bare[1];
    description = String(bare[2] || "").trim();
  }
  return { managerId, description };
}

async function resolveFreshActorMemberForPartnership(actor?, guild?) {
  let member = actor?.member || null;
  const uid = String(actor?.userId || member?.id || "").trim();
  if (!guild || !uid) return member;
  try {
    if (typeof guild.roles?.fetch === "function" && (guild.roles.cache?.size || 0) < 2) {
      await guild.roles.fetch().catch(() => null);
    }
  } catch {
  }
  try {
    if (typeof guild.members?.fetch === "function") {
      const fresh = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
      if (fresh) member = fresh;
    }
  } catch {
  }
  return member;
}

function memberCanRunPartnershipLikeDiscord(member?, guild?) {
  const { memberHasPartnerManagerRole } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
  if (!member || !guild) return false;
  if (memberHasPartnerManagerRole(member, guild.id)) return true;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  } catch {
  }
  return false;
}

async function executeWebTicketPartnershipSlash(client, actor, ticket, rawInput, { guild, fakeChannel, outputs }) {
  const {
    isPartnershipOperational,
    resolvePartnershipConfigSync,
    isPartnershipSkipManagerAllowed,
    buildSkipDeniedEmbed,
  } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
  const { partnersChatPartnerCommandDeniedReplyContent } = require("../../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../../Utils/Partner/partnersChatChannelUtils");
  const { executeTenantPartnership } = require("../../../MultiGuild/services/Partner/tenantPartnershipExecuteService") as typeof import("../../../MultiGuild/services/Partner/tenantPartnershipExecuteService");
  const { SETUP_REQUIRED_REPLY } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");

  if (!isPartnershipOperational(guild?.id)) {
    return String(SETUP_REQUIRED_REPLY || "Partnership non configurata su questo server.");
  }

  const { managerId: parsedManagerId, description } = parseWebPartnershipCommandInput(rawInput);
  if (!String(description || "").trim()) {
    return "WEB_PARTNERSHIP_NEED_FORM";
  }

  const partnershipCfg = resolvePartnershipConfigSync(guild.id);
  const isMainServer = Boolean(partnershipCfg?.legacy);
  const skipAllowed = isPartnershipSkipManagerAllowed(guild.id);
  let managerId = parsedManagerId || null;
  const skipped = Boolean(!isMainServer && skipAllowed && !managerId);

  if (!skipped && !managerId) {
    return "WEB_PARTNERSHIP_NEED_FORM";
  }

  const actorMember = await resolveFreshActorMemberForPartnership(actor, guild);
  if (actorMember) actor.member = actorMember;
  if (!memberCanRunPartnershipLikeDiscord(actorMember, guild)) {
    return "Non hai i permessi per fare partnership (serve il ruolo Partner Manager).";
  }

  let replied = false;
  const capture = async (payload?) => {
    const text = extractCommandOutput(payload);
    if (text) outputs.push(text);
    replied = true;
    return wrapCapturedMessage("web-partnership", outputs);
  };

  const fakeInteraction = {
    commandName: "partnership",
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
    options: buildWebTicketSlashOptions(
      managerId ? [`<@${managerId}>`] : [],
      guild,
    ),
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
    showModal: async () => {},
  };

    fakeChannel.__webTicketPartnership = true;
  const denied = await partnersChatPartnerCommandDeniedReplyContent(fakeChannel, {
    allowPartnership: true,
  });
  if (denied) {
    return String(denied).replace(/<[^>]+>/g, "").trim() || denied;
  }

  if (!skipped && !managerId) {
    if (isMainServer) {
      return "Devi indicare un **manager** valido.";
    }
    const embedText = extractCommandOutput({ embeds: [buildSkipDeniedEmbed()] });
    return embedText || "Manager obbligatorio per questa partnership.";
  }

  fakeInteraction.deferred = true;
  try {
    await executeTenantPartnership(fakeInteraction, {
      description,
      managerId,
      skipped,
    });
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] partnership:", err?.message || err);
    if (!outputs.length) {
      return `Errore partnership: ${String(err?.message || "esecuzione fallita").slice(0, 180)}`;
    }
  }

  if (!outputs.length && !replied) {
    return "Partnership inviata, ma non c’è stato un messaggio di conferma qui. Controlla il canale partnership su Discord.";
  }
  return outputs.filter(Boolean).join("\n\n").trim();
}

export = { extractCommandOutput, wrapCapturedMessage, buildWebTicketSlashOptions, executeWebTicketPartnershipSlash };
