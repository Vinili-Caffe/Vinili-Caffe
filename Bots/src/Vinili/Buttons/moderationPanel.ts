const { createProxyMessage, resolvePermChannel, resolveSanctionOutputChannel, replyEphemeral, runDynoFromInteraction } = require("../Utils/Moderation/moderationInteractionBridge") as typeof import("../Utils/Moderation/moderationInteractionBridge");
const { checkPrefixPermission } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
const { PANEL_PREFIX, parseNavCustomId, parseHomeCustomId, parseGoCustomId, parseCloseCustomId, parseModalCustomId, buildModerationPanelPayload, buildModalForAction, SECTION_HOME, FIELD_REASON, FIELD_DURATION, FIELD_CASE, FIELD_EXTRA } = require("../Utils/Moderation/moderationPanelRuntime") as typeof import("../Utils/Moderation/moderationPanelRuntime");
const { beginPanelSelectDefer, panelSelectFollowUp } = require("../../shared/discord/panelSelectMenuRuntime") as typeof import("../../shared/discord/panelSelectMenuRuntime");
const PRIVATE_FLAG = 1 << 6;
const GO_IMMEDIATE = new Set(["warnings", "moderations", "clearwarn"]);

function resolveGuildFromInteraction(interaction?, parsed?) {
  if (interaction.guild) return interaction.guild;
  const gid = parsed?.guildId;
  if (!gid) return null;
  return interaction.client.guilds.cache.get(gid) || null;
}

async function safeUpdatePanelInteraction(interaction?, payload?) {
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

async function deleteMessageInSameChannel(channel?, messageId?) {
  const mid = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(mid)) return false;
  if (!channel?.messages?.fetch) return false;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (!msg) return false;
  return msg.delete().then(() => true).catch(() => false);
}

function getModalText(fields?, id?) {
  if (!fields || typeof fields.getTextInputValue !== "function") return "";
  try {
    return String(fields.getTextInputValue(id) || "").trim();
  } catch {
    return "";
  }
}

function buildArgsFromModal(action?, targetId?, fields?) {
  const a = String(action || "").toLowerCase();
  const get = (id?) => getModalText(fields, id);
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

function buildImmediateArgs(action?, targetId?) {
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

async function dispatchGoStyleAction(interaction?, client?, guild?, ctx?, action?, options: Record<string, any> = {}) {
  const a = String(action || "").toLowerCase();
  const viewerId = ctx.viewerId;
  const targetId = ctx.targetId;
  const gid = String(ctx.guildId || guild.id);
  const rebuildHomeComponents =
    typeof options.rebuildHomeComponents === "function" ? options.rebuildHomeComponents : null;
  const ephemeralFollowUp = async (content?) => {
    if (rebuildHomeComponents) {
      await panelSelectFollowUp(interaction, rebuildHomeComponents, { content });
      return;
    }
    await replyEphemeral(interaction, content);
  };
  if (GO_IMMEDIATE.has(a)) {
    const args = buildImmediateArgs(a, targetId);
    if (!args) return false;
    if (rebuildHomeComponents) {
      await beginPanelSelectDefer(interaction, rebuildHomeComponents, { flags: PRIVATE_FLAG });
    }
    await runDynoFromInteraction(interaction, client, a, args, guild);
    return true;
  }
  const modal = buildModalForAction(gid, viewerId, targetId, a, ctx?.sourceMessageId);
  if (!modal) return false;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await ephemeralFollowUp("<a:VC_Cross:1482532424570376253> Non trovo il tuo membro nel server.");
    return true;
  }
  const permCh = resolvePermChannel(interaction, guild);
  const proxy = createProxyMessage(interaction, permCh, guild, member);
  const allowed = await checkPrefixPermission(proxy, a);
  if (!allowed) {
    await ephemeralFollowUp("<a:VC_Cross:1482532424570376253> Non hai permesso per questa azione in questo canale.");
    return true;
  }
  await interaction.showModal(modal).catch(() => null);
  return true;
}

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (!id.startsWith(`${PANEL_PREFIX}:`)) return false;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:nav:`)) return true;
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:home:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:go:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:close:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${PANEL_PREFIX}:md:`)) return true;
  return false;
}

async function execute(interaction?, client?) {
  const id = String(interaction.customId || "");

  if (interaction.isStringSelectMenu()) {
    if (id.startsWith(`${PANEL_PREFIX}:home:`)) {
      const parsed = parseHomeCustomId(id);
      if (!parsed) return false;
      if (String(interaction.user.id) !== String(parsed.viewerId)) {
        await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare il menu.");
        return true;
      }
      const guild = resolveGuildFromInteraction(interaction, parsed);
      if (!guild) {
        await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Server non disponibile. Riapri il pannello dal messaggio staff nel canale sanzioni.");
        return true;
      }
      const action = String(interaction.values?.[0] || "").toLowerCase();
      const ctx = { ...parsed, guildId: parsed.guildId || guild.id };
      const rebuildHomeComponents = async () => {
        const payload = await buildModerationPanelPayload(
          guild,
          parsed.viewerId,
          parsed.targetId,
          interaction.client,
          SECTION_HOME,
          { sourceMessageId: parsed.sourceMessageId },
        );
        return payload.components || [];
      };
      const ok = await dispatchGoStyleAction(interaction, client, guild, ctx, action, { rebuildHomeComponents });
      if (!ok) {
        await panelSelectFollowUp(interaction, rebuildHomeComponents, {
          content: "<a:VC_Cross:1482532424570376253> Azione non valida.",
        });
      }
      return true;
    }
    const parsed = parseNavCustomId(id);
    if (!parsed) return false;
    if (String(interaction.user.id) !== String(parsed.viewerId)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare il menu.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Server non disponibile. Riapri il pannello dal messaggio staff nel canale sanzioni.");
      return true;
    }
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildModerationPanelPayload(guild, parsed.viewerId, parsed.targetId, interaction.client, section, { sourceMessageId: parsed.sourceMessageId });
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

  if (interaction.isButton()) {
    if (id.startsWith(`${PANEL_PREFIX}:close:`)) {
      const parsedClose = parseCloseCustomId(id);
      if (!parsedClose) return false;
      if (String(interaction.user.id) !== String(parsedClose.viewerId)) {
        await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può chiuderlo.");
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
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare i pulsanti.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Server non disponibile. Riapri il pannello dal messaggio staff nel canale sanzioni.");
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
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può inviare questo modulo.");
      return true;
    }
    const guild = resolveGuildFromInteraction(interaction, parsed);
    if (!guild) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Server non disponibile. Riapri il pannello dal messaggio staff nel canale sanzioni.");
      return true;
    }
    const action = String(parsed.action || "").toLowerCase();
    const args = buildArgsFromModal(action, parsed.targetId, interaction.fields);
    if (!args) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Modulo non valido.");
      return true;
    }
    await runDynoFromInteraction(interaction, client, action, args, guild);
    return true;
  }

  return false;
}

export = { name: "moderationPanel", order: 13, match, execute };