const { Collection } = require("discord.js");
const IDs = require("../Config/ids");
const { executeDynoModerationCommand } = require("./dynoModerationCommands");
const { checkPrefixPermission } = require("./commandPermissions");

const PRIVATE_FLAG = 1 << 6;
const SANCTIONS_OUTPUT_TO_SANZIONI = new Set(["warn", "kick", "mute", "ban", "unmute", "unban", "delwarn", "clearwarn"]);

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
    mentions: { users: new Collection(), channels: new Collection(), roles: new Collection() },
  };
}

function resolvePermChannel(interaction, guild, options = {}) {
  if (options.useSanctionPermChannel && guild) {
    const sid = String(IDs?.channels?.sanzioniUtenti || "").trim();
    const stid = String(IDs?.channels?.staffCmds || "").trim();
    const sanz = guild.channels.cache.get(sid);
    if (sanz?.isTextBased?.()) return sanz;
    const staff = guild.channels.cache.get(stid);
    if (staff?.isTextBased?.()) return staff;
  }
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

async function runDynoFromInteraction(interaction, client, cmd, args, guild, options = {}) {
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Non trovo il tuo membro nel server.");
    return { ok: false };
  }
  const permCh = resolvePermChannel(interaction, guild, options);
  const permProxy = createProxyMessage(interaction, permCh, guild, member);
  const allowed = await checkPrefixPermission(permProxy, cmd);
  if (!allowed) {
    const msg = options.useSanctionPermChannel
      ? "<a:VC_Cross:1482532424570376253> Non hai permesso per applicare questa sanzione."
      : "<a:VC_Cross:1482532424570376253> Non hai permesso per questa azione in questo canale.";
    await replyEphemeral(interaction, msg);
    return { ok: false };
  }
  if (!Array.isArray(args) || !args.length) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Argomenti non validi.");
    return { ok: false };
  }
  const outCh = await resolveSanctionOutputChannel(guild, interaction, cmd);
  const execProxy = createProxyMessage(interaction, outCh, guild, member);
  const sid = String(IDs?.channels?.sanzioniUtenti || "").trim();
  const usedSanzioni =
    SANCTIONS_OUTPUT_TO_SANZIONI.has(String(cmd || "").toLowerCase()) && sid && String(outCh?.id) === sid;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});
  }
  try {
    await executeDynoModerationCommand(cmd, execProxy, args, client);
    const doneMsg = usedSanzioni
      ? "<a:VC_Verified:1482532479637127188> Eseguito. L'esito è stato inviato nel canale sanzioni."
      : "<a:VC_Verified:1482532479637127188> Eseguito. Controlla il canale per output e conferme.";
    await interaction.editReply({ content: doneMsg }).catch(() => {});
    return { ok: true, usedSanzioni };
  } catch (err) {
    global.logger?.error?.("[moderationInteractionBridge]", err);
    await interaction.editReply({ content: `<a:VC_Cross:1482532424570376253> ${String(err?.message || err).slice(0, 500)}` }).catch(() => {});
    return { ok: false };
  }
}

module.exports = {
  createProxyMessage,
  resolvePermChannel,
  resolveSanctionOutputChannel,
  replyEphemeral,
  runDynoFromInteraction,
};