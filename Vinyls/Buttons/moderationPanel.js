const { Collection } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { executeDynoModerationCommand } = require("../Utils/Moderation/dynoModerationCommands");
const { checkPrefixPermission } = require("../Utils/Moderation/commandPermissions");
const {
  PANEL_PREFIX,
  parseNavCustomId,
  parseHomeCustomId,
  parseGoCustomId,
  parseCloseCustomId,
  parseModalCustomId,
  buildModerationPanelPayload,
  buildModalForAction,
  SECTION_HOME,
  FIELD_REASON,
  FIELD_DURATION,
  FIELD_CASE,
  FIELD_EXTRA,
} = require("../Utils/Moderation/moderationPanelRuntime");

const PRIVATE_FLAG = 1 << 6;

const GO_IMMEDIATE = new Set(["warnings", "moderations", "clearwarn"]);

const SANCTIONS_OUTPUT_TO_SANZIONI = new Set([
  "warn",
  "kick",
  "mute",
  "ban",
  "unmute",
  "unban",
  "delwarn",
  "clearwarn",
]);

function createProxyMessage(interaction, outputChannel = null, guild = null, member = null) {
  const ch = outputChannel || interaction.channel;
  const g = guild || interaction.guild;
  return {
    id: interaction.id,
    channel: ch,
    channelId: ch?.id,
    invokeChannel: interaction.channel,
    invokeChannelId: interaction.channelId,
    guild: g,
    author: interaction.user,
    member: member ?? interaction.member,
    client: interaction.client,
    mentions: {
      users: new Collection(),
      channels: new Collection(),
      roles: new Collection(),
    },
  };
}

function resolveGuildFromInteraction(interaction, parsed) {
  if (interaction.guild) return interaction.guild;
  const gid = parsed?.guildId;
  if (!gid) return null;
  return interaction.client.guilds.cache.get(gid) || null;
}

function resolvePermChannel(interaction, guild) {
  if (interaction.guild && interaction.channel && String(interaction.guild.id) === String(guild.id)) {
    return interaction.channel;
  }
  const sid = String(IDs?.channels?.sanzioniUtenti || "").trim();
  const stid = String(IDs?.channels?.staffCmds || "").trim();
  const sanz = guild.channels.cache.get(sid);
  if (sanz?.isTextBased?.()) return sanz;
  const staff = guild.channels.cache.get(stid);
  if (staff?.isTextBased?.()) return staff;
  return interaction.channel;
}

async function resolveSanctionOutputChannel(guild, interaction, cmd) {
  const key = String(cmd || "").toLowerCase();
  if (!SANCTIONS_OUTPUT_TO_SANZIONI.has(key)) return interaction.channel;
  const sid = String(IDs?.channels?.sanzioniUtenti || "").trim();
  if (!sid || !guild) return interaction.channel;
  const cached = guild.channels.cache.get(sid);
  if (cached?.isTextBased?.()) return cached;
  const fetched = await guild.channels.fetch(sid).catch(() => null);
  if (fetched?.isTextBased?.()) return fetched;
  return interaction.channel;
}

async function safeUpdatePanelInteraction(interaction, payload) {
  const updated = await interaction.update(payload).then(() => true).catch(() => false);
  if (updated) return true;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  if (interaction.message?.edit) {
    await interaction.message.edit(payload).catch(() => {});
  }
  return true;
}

async function replyEphemeral(interaction, content) {
  const payload = { content: String(content || "").slice(0, 2000), flags: PRIVATE_FLAG };
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
      return;
    }
    await interaction.followUp(payload);
  } catch (_) {}
}

async function deleteMessageInSameChannel(channel, messageId) {
  const mid = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(mid)) return false;
  if (!channel?.messages?.fetch) return false;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (!msg) return false;
  return msg.delete().then(() => true).catch(() => false);
}

function getModalText(fields, id) {
  if (!fields || typeof fields.getTextInputValue !== "function") return "";
  try {
    return String(fields.getTextInputValue(id) || "").trim();
  } catch {
    return "";
  }
}

function buildArgsFromModal(action, targetId, fields) {
  const a = String(action || "").toLowerCase();
  const get = (id) => getModalText(fields, id);
  const R = FIELD_REASON;
  const D = FIELD_DURATION;
  const C = FIELD_CASE;
  const X = FIELD_EXTRA;
  const tid = String(targetId || "");

  switch (a) {
    case "warn":
    case "kick":
      return [tid, get(R)];
    case "mute":
      return [tid, get(D), get(R)];
    case "ban": {
      const dur = get(D);
      const reason = get(R);
      if (dur) return [tid, dur, reason];
      return [tid, reason];
    }
    case "unmute":
      return [tid, get(R)];
    case "unban": {
      const r = get(R);
      return r ? [tid, r] : [tid];
    }
    case "delwarn":
      return [tid, get(R)];
    case "modlogs": {
      const page = get(X);
      if (page && /^\d+$/.test(page)) return [tid, page];
      return [tid];
    }
    case "case":
      return [get(C)];
    case "reason":
      return [get(C), get(R)];
    case "duration":
      return [get(C), get(D)];
    default:
      return null;
  }
}

function buildImmediateArgs(action, targetId) {
  const t = String(targetId || "");
  switch (String(action || "").toLowerCase()) {
    case "warnings":
    case "moderations":
    case "clearwarn":
      return [t];
    default:
      return null;
  }
}

async function runDynoFromInteraction(interaction, client, cmd, args, guild) {
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non trovo il tuo membro nel server.");
    return;
  }
  const permCh = resolvePermChannel(interaction, guild);
  const permProxy = createProxyMessage(interaction, permCh, guild, member);
  const allowed = await checkPrefixPermission(permProxy, cmd);
  if (!allowed) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non hai permesso per questa azione in questo canale.");
    return;
  }
  if (!Array.isArray(args) || !args.length) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Argomenti non validi.");
    return;
  }
  const outCh = await resolveSanctionOutputChannel(guild, interaction, cmd);
  const execProxy = createProxyMessage(interaction, outCh, guild, member);
  const sid = String(IDs?.channels?.sanzioniUtenti || "").trim();
  const usedSanzioni =
    SANCTIONS_OUTPUT_TO_SANZIONI.has(String(cmd || "").toLowerCase()) && sid && String(outCh?.id) === sid;
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});
  try {
    await executeDynoModerationCommand(cmd, execProxy, args, client);
    const doneMsg = usedSanzioni
      ? "<:vegacheckmark:1443666279058772028> Eseguito. L’esito è stato inviato nel canale sanzioni."
      : "<:vegacheckmark:1443666279058772028> Eseguito. Controlla il canale per output e conferme.";
    await interaction.editReply({ content: doneMsg }).catch(() => {});
  } catch (err) {
    global.logger?.error?.("[moderationPanel]", err);
    await interaction
      .editReply({ content: `<:vegax:1443934876440068179> ${String(err?.message || err).slice(0, 500)}` })
      .catch(() => {});
  }
}

async function dispatchGoStyleAction(interaction, client, guild, ctx, action) {
  const a = String(action || "").toLowerCase();
  const viewerId = ctx.viewerId;
  const targetId = ctx.targetId;
  const gid = String(ctx.guildId || guild.id);
  if (GO_IMMEDIATE.has(a)) {
    const args = buildImmediateArgs(a, targetId);
    if (!args) return false;
    await runDynoFromInteraction(interaction, client, a, args, guild);
    return true;
  }
  const modal = buildModalForAction(gid, viewerId, targetId, a, ctx?.sourceMessageId);
  if (!modal) return false;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non trovo il tuo membro nel server.");
    return true;
  }
  const permCh = resolvePermChannel(interaction, guild);
  const proxy = createProxyMessage(interaction, permCh, guild, member);
  const allowed = await checkPrefixPermission(proxy, a);
  if (!allowed) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non hai permesso per questa azione in questo canale.");
    return true;
  }
  await interaction.showModal(modal).catch(() => null);
  return true;
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!id.startsWith(`${PANEL_PREFIX}:`)) return false;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:nav:`)) return true;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:home:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:go:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:close:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${PANEL_PREFIX}:md:`)) return true;
  return false;
}

async function execute(interaction, client) {
  const id = String(interaction.customId || "");

  if (interaction.isStringSelectMenu()) {
    if (id.startsWith(`${PANEL_PREFIX}:home:`)) {
      const parsed = parseHomeCustomId(id);
      if (!parsed) return false;
      if (String(interaction.user.id) !== String(parsed.viewerId)) {
        await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare il menu.");
        return true;
      }
      const guild = resolveGuildFromInteraction(interaction, parsed);
      if (!guild) {
        await replyEphemeral(interaction, "<:vegax:1443934876440068179> Server non disponibile. Riapri il pannello con `+moderazione`.");
        return true;
      }
      const action = String(interaction.values?.[0] || "").toLowerCase();
      const ctx = { ...parsed, guildId: parsed.guildId || guild.id };
      const ok = await dispatchGoStyleAction(interaction, client, guild, ctx, action);
      if (!ok) await replyEphemeral(interaction, "<:vegax:1443934876440068179> Azione non valida.");
      return true;
    }
    const parsed = parseNavCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare il menu.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Server non disponibile. Riapri il pannello con `+moderazione`.");
      return true;
    }
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildModerationPanelPayload(
      guild,
      parsed.viewerId,
      parsed.targetId,
      interaction.client,
      section,
      { sourceMessageId: parsed.sourceMessageId },
    );
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

  if (interaction.isButton()) {
    if (id.startsWith(`${PANEL_PREFIX}:close:`)) {
      const parsedClose = parseCloseCustomId(id);
      if (!parsedClose) return false;
      if (String(interaction.user.id) !== String(parsedClose.viewerId)) {
        await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può chiuderlo.");
        return true;
      }
      await interaction.deferUpdate().catch(() => {});
      await interaction.message?.delete?.().catch(() => {});
      if (parsedClose.sourceMessageId) {
        await deleteMessageInSameChannel(interaction.channel, parsedClose.sourceMessageId);
      }
      return true;
    }
    const parsed = parseGoCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare i pulsanti.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Server non disponibile. Riapri il pannello con `+moderazione`.");
      return true;
    }
    const action = String(parsed.action || "").toLowerCase();
    const ok = await dispatchGoStyleAction(interaction, client, guild, parsed, action);
    return ok;
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseModalCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può inviare questo modulo.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Server non disponibile. Riapri il pannello con `+moderazione`.");
      return true;
    }
    const action = String(parsed.action || "").toLowerCase();
    const args = buildArgsFromModal(action, parsed.targetId, interaction.fields);
    if (!args) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Modulo non valido.");
      return true;
    }
    await runDynoFromInteraction(interaction, client, action, args, guild);
    return true;
  }

  return false;
}

module.exports = { name: "moderationPanel", order: 13, match, execute };