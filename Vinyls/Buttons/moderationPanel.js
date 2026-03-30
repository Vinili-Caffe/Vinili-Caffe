const { Collection } = require("discord.js");
const { executeDynoModerationCommand } = require("../Utils/Moderation/dynoModerationCommands");
const { checkPrefixPermission } = require("../Utils/Moderation/commandPermissions");
const {
  PANEL_PREFIX,
  parseNavCustomId,
  parseGoCustomId,
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

function createProxyMessage(interaction) {
  return {
    id: interaction.id,
    channel: interaction.channel,
    channelId: interaction.channelId,
    guild: interaction.guild,
    author: interaction.user,
    member: interaction.member,
    client: interaction.client,
    mentions: {
      users: new Collection(),
      channels: new Collection(),
      roles: new Collection(),
    },
  };
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

function buildArgsFromModal(action, targetId, fields) {
  const a = String(action || "").toLowerCase();
  const get = (id) => String(fields.get(id) || "").trim();
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
    case "lock":
    case "unlock": {
      const r = get(R);
      return r ? [r] : [""];
    }
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

async function runDynoFromInteraction(interaction, client, cmd, args) {
  const proxy = createProxyMessage(interaction);
  const allowed = await checkPrefixPermission(proxy, cmd);
  if (!allowed) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non hai permesso per questa azione in questo canale.");
    return;
  }
  if (!Array.isArray(args) || !args.length) {
    await replyEphemeral(interaction, "<:vegax:1443934876440068179> Argomenti non validi.");
    return;
  }
  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});
  try {
    await executeDynoModerationCommand(cmd, proxy, args, client);
    await interaction
      .editReply({
        content: "<:vegacheckmark:1443666279058772028> Eseguito. Controlla il canale per output e conferme.",
      })
      .catch(() => {});
  } catch (err) {
    global.logger?.error?.("[moderationPanel]", err);
    await interaction
      .editReply({ content: `<:vegax:1443934876440068179> ${String(err?.message || err).slice(0, 500)}` })
      .catch(() => {});
  }
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!id.startsWith(`${PANEL_PREFIX}:`)) return false;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:nav:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:go:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${PANEL_PREFIX}:md:`)) return true;
  return false;
}

async function execute(interaction, client) {
  if (!interaction?.guild) return false;
  const id = String(interaction.customId || "");

  if (interaction.isStringSelectMenu()) {
    const parsed = parseNavCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare il menu.");
      return true;
    }
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildModerationPanelPayload(
      interaction.guild,
      parsed.viewerId,
      parsed.targetId,
      interaction.client,
      section,
    );
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

  if (interaction.isButton()) {
    const parsed = parseGoCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare i pulsanti.");
      return true;
    }
    const action = String(parsed.action || "").toLowerCase();

    if (GO_IMMEDIATE.has(action)) {
      const args = buildImmediateArgs(action, parsed.targetId);
      if (!args) return false;
      await runDynoFromInteraction(interaction, client, action, args);
      return true;
    }

    const modal = buildModalForAction(parsed.viewerId, parsed.targetId, action);
    if (!modal) return false;
    const proxy = createProxyMessage(interaction);
    const allowed = await checkPrefixPermission(proxy, action);
    if (!allowed) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Non hai permesso per questa azione in questo canale.");
      return true;
    }
    await interaction.showModal(modal).catch(() => null);
    return true;
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseModalCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può inviare questo modulo.");
      return true;
    }
    const action = String(parsed.action || "").toLowerCase();
    const args = buildArgsFromModal(action, parsed.targetId, interaction.fields);
    if (!args) {
      await replyEphemeral(interaction, "<:vegax:1443934876440068179> Modulo non valido.");
      return true;
    }
    await runDynoFromInteraction(interaction, client, action, args);
    return true;
  }

  return false;
}

module.exports = { name: "moderationPanel", order: 13, match, execute };