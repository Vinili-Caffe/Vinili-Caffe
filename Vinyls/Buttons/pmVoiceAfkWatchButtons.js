const { PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { createModCase, logModCase } = require("../Utils/Moderation/moderation");
const { findModLogsPage } = require("../Utils/Moderation/modCaseStore");
const {
  resetPmVoiceAfkCountdown,
  clearPmVoiceAfkCountdown,
  cancelPendingPmAfkAlert,
  deletePmAfkUserAlertMessage,
  isStaffInVoiceWithTarget,
  sendPmAfkSanctionNotice,
} = require("../Services/Staff/pmVoiceAfkWatchService");

const CUSTOM_ID_PREFIX_CONFIRM = "pm_afk_watch_confirm:";
const CUSTOM_ID_PREFIX_DENY = "pm_afk_watch_deny:";
const STAFF_ROLE_ID = String(IDs.roles?.Staff || "").trim();
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();

const RULE_DOT = "3.5";
const RULE_MATCH_RE = /\b3\s*[\._-]\s*6\b/i;
const REASON_MATCH_RE = /(afk.*voc|voc.*afk|farm.*voc|resta.*afk)/i;

const STEPS = [
  { index: 0, durationMs: 5 * 60 * 60_000, label: "1° Sanzione: Mute 5h" },
  { index: 1, durationMs: 11 * 60 * 60_000, label: "2° Sanzione: Mute 11h" },
  { index: 2, durationMs: 24 * 60 * 60_000, label: "3° Sanzione: Mute 24h" },
];

function parseCustomId(customId, prefix) {
  const raw = String(customId || "");
  if (!raw.startsWith(prefix)) return null;
  const parts = raw.split(":");
  const userId = String(parts[1] || "").trim();
  const channelId = String(parts[2] || "").trim();
  if (!/^\d{16,20}$/.test(userId)) return null;
  if (channelId && !/^\d{16,20}$/.test(channelId)) return null;
  return { userId, channelId: channelId || null };
}

function isStaff(member) {
  if (!member) return false;
  if (STAFF_ROLE_ID && member.roles?.cache?.has(STAFF_ROLE_ID)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.ManageGuild) === true;
}

function isTargetInAlertChannel(target, channelId) {
  return Boolean(target?.voice?.channelId && (!channelId || String(target.voice.channelId) === String(channelId)));
}

function isTargetAloneForStaffCheck(target) {
  const channel = target?.voice?.channel;
  if (!channel?.members || !target?.id) return false;
  const nonStaffHumans = channel.members.filter((m) => !m.user?.bot && !isStaff(m));
  return nonStaffHumans.size === 1 && nonStaffHumans.has(target.id);
}

function reasonText(stepIndex) {
  const n = Number(stepIndex) + 1;
  return `Regola ${RULE_DOT} (${n}°) — resta AFK per farmare in voc`;
}

function isMatchingRuleCase(row) {
  const reason = String(row?.reason || "");
  if (!reason) return false;
  return RULE_MATCH_RE.test(reason) || REASON_MATCH_RE.test(reason);
}

async function countPreviousRuleCases(guildId, userId) {
  const page = await findModLogsPage(guildId, userId, 0, 75).catch(() => []);
  return (Array.isArray(page) ? page : []).filter(isMatchingRuleCase).length;
}

function nextStepIndexFromCount(count) {
  const n = Number(count || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n % STEPS.length;
}

async function disableButtons(interaction, note) {
  const embeds = interaction.message?.embeds ? [...interaction.message.embeds] : undefined;
  await interaction
    .update({
      content: note ? `${String(note)}\n${String(interaction.message?.content || "")}`.slice(0, 2000) : interaction.message?.content,
      embeds,
      components: [],
    })
    .catch(async () => {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Non riesco a modificare il messaggio (permessi?).", flags: 1 << 6 }).catch(() => null);
      }
    });
}

module.exports = {
  name: "pmVoiceAfkWatchButtons",
  order: 40,
  match(interaction) {
    if (!interaction?.isButton?.()) return false;
    const id = String(interaction.customId || "");
    return id.startsWith(CUSTOM_ID_PREFIX_CONFIRM) || id.startsWith(CUSTOM_ID_PREFIX_DENY);
  },
  async execute(interaction, client) {
    const guild = interaction.guild;
    if (!guild || String(guild.id) !== MAIN_GUILD_ID) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo controllo è disponibile solo nel server principale.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Solo lo staff può usare questo controllo.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    const rawId = String(interaction.customId || "");
    const parsed =
      parseCustomId(rawId, CUSTOM_ID_PREFIX_CONFIRM) ||
      parseCustomId(rawId, CUSTOM_ID_PREFIX_DENY);
    if (!parsed) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Pulsante non valido.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    if (String(interaction.user.id) === String(parsed.userId)) {
      await interaction.reply({
        content: "<a:VC_Alert:1482706673176150077> Non puoi confermare o resettare il controllo AFK sul **tuo** account.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }

    const target = await getGuildMemberCached(guild, parsed.userId, { preferFresh: true }).catch(() => null);
    const voiceOk = isTargetInAlertChannel(target, parsed.channelId);
    const stillAloneForCheck = isTargetAloneForStaffCheck(target);
    const staffInVoiceWithTarget = isStaffInVoiceWithTarget(interaction.member, target);

    if (!target?.voice?.channelId) {
      await cancelPendingPmAfkAlert(client, guild.id, parsed.userId);
      await disableButtons(interaction, `ℹ️ L'utente non è più in vocale. Controllo annullato da <@${interaction.user.id}>.`);
      return true;
    }

    if (!staffInVoiceWithTarget) {
      await interaction.reply({
        content:
          "<a:VC_Alert:1482706673176150077> Devi essere nello **stesso canale vocale** dell'utente per confermare o negare il controllo AFK.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }

    if (rawId.startsWith(CUSTOM_ID_PREFIX_DENY)) {
      await deletePmAfkUserAlertMessage(client, guild.id, parsed.userId);
      if (voiceOk) {
        resetPmVoiceAfkCountdown(guild.id, parsed.userId, String(target.voice.channelId));
      } else {
        clearPmVoiceAfkCountdown(guild.id, parsed.userId);
      }
      await disableButtons(interaction, `✅ Segnalazione AFK **negata** da <@${interaction.user.id}>. Countdown resettato (se ancora in vocale).`);
      return true;
    }

    // CONFIRM
    if (!target?.id) {
      await cancelPendingPmAfkAlert(client, guild.id, parsed.userId);
      await disableButtons(interaction, `⚠️ Utente non trovato. Controllo chiuso da <@${interaction.user.id}>.`);
      return true;
    }
    if (!voiceOk) {
      await cancelPendingPmAfkAlert(client, guild.id, parsed.userId);
      await disableButtons(interaction, `ℹ️ L'utente non è più nel canale vocale indicato. Controllo chiuso da <@${interaction.user.id}>.`);
      return true;
    }
    if (!stillAloneForCheck) {
      await deletePmAfkUserAlertMessage(client, guild.id, parsed.userId);
      clearPmVoiceAfkCountdown(guild.id, parsed.userId);
      await disableButtons(interaction, `ℹ️ Nel canale c’è un altro utente oltre al target (non conta lo staff). Controllo chiuso da <@${interaction.user.id}>.`);
      return true;
    }

    const prevCount = await countPreviousRuleCases(guild.id, target.id);
    const stepIndex = nextStepIndexFromCount(prevCount);
    const step = STEPS[stepIndex] || STEPS[0];
    const durationMs = step.durationMs;
    const reason = reasonText(stepIndex);

    const ok = await target.timeout(durationMs, reason).then(() => true).catch(() => false);
    if (!ok) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Non sono riuscito ad applicare il timeout (permessi/gerarchia?).", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    try {
      const { applyActiveMuteMirror } = require("../Services/Moderation/mutedMirrorRoleService");
      await applyActiveMuteMirror(target, { reason });
    } catch (err) {
      global.logger?.warn?.("[pmVoiceAfk] active mute mirror after timeout:", err?.message || err);
    }

    await createModCase({
      guildId: guild.id,
      action: "MUTE",
      userId: target.id,
      modId: interaction.user.id,
      reason,
      durationMs,
      context: { channelId: interaction.channelId || null, messageId: interaction.message?.id || null },
      dedupe: { enabled: true, byMessageId: true, matchReason: false },
    })
      .then(async ({ doc }) => {
        if (doc) await logModCase({ guild, modCase: doc });
      })
      .catch(() => null);

    await sendPmAfkSanctionNotice(client, guild, {
      target,
      staffMember: interaction.member,
      stepLabel: step.label,
      reason,
      voiceChannelId: parsed.channelId || target.voice?.channelId || null,
      durationMs,
    }).catch(() => null);

    await deletePmAfkUserAlertMessage(client, guild.id, target.id);
    clearPmVoiceAfkCountdown(guild.id, target.id);
    await disableButtons(
      interaction,
      `✅ AFK **confermato** da <@${interaction.user.id}> — applicata sanzione **${step.label}** (ciclo su ${STEPS.length}).`,
    );
    return true;
  },
};