const { parseDuration } = require("../../Moderation/utils/moderation") as typeof import("../../Moderation/utils/moderation");
const {
  normalizeRuleDot,
  countPreviousRuleCases,
  resolveStaffRegolaSanction,
  buildDefaultReason,
  buildDynoArgs,
  KNOWN_RULE_DOTS,
} = require("../../Moderation/utils/staffRegolamentoSteps") as typeof import("../../Moderation/utils/staffRegolamentoSteps");
const { runDynoFromInteraction, replyEphemeral } = require("../../Moderation/utils/moderationInteractionBridge") as typeof import("../../Moderation/utils/moderationInteractionBridge");

const IN_RULE = "sanziona_regola";
const IN_REASON = "sanziona_motivo";
const IN_DURATION = "sanziona_tempo";
const MODAL_PREFIX = "sanziona_m:";

function parseSanzionaModalId(customId?) {
  const raw = String(customId || "");
  if (!raw.startsWith(MODAL_PREFIX)) return null;
  const parts = raw.split(":");
  const actorId = String(parts[1] || "").trim();
  const targetId = String(parts[2] || "").trim();
  if (!/^\d{16,20}$/.test(actorId) || !/^\d{16,20}$/.test(targetId)) return null;
  return { actorId, targetId };
}

function getModalField(fields?, id?) {
  if (!fields || typeof fields.getTextInputValue !== "function") return "";
  try {
    return String(fields.getTextInputValue(id) || "").trim();
  } catch {
    return "";
  }
}

async function handleSanzionaModal(interaction?, client?) {
  if (!interaction?.isModalSubmit?.()) return false;
  const parsed = parseSanzionaModalId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user.id) !== parsed.actorId) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il modulo può inviarlo.");
    return true;
  }
  const guild = interaction.guild;
  if (!guild) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Server non disponibile.");
    return true;
  }
  const ruleRaw = getModalField(interaction.fields, IN_RULE);
  const ruleDot = normalizeRuleDot(ruleRaw);
  if (!ruleDot || !KNOWN_RULE_DOTS.includes(ruleDot)) {
    await replyEphemeral(
      interaction,
      `<a:VC_Cross:1482532424570376253> Regola non valida. Usa un numero dalla guida moderazione (es. ${KNOWN_RULE_DOTS.slice(0, 5).join(", ")}).`,
    );
    return true;
  }
  const customMotivo = getModalField(interaction.fields, IN_REASON);
  const durationOverrideRaw = getModalField(interaction.fields, IN_DURATION);
  let durationOverride = "";
  if (durationOverrideRaw) {
    const ms = parseDuration(durationOverrideRaw);
    if (!ms) {
      await replyEphemeral(
        interaction,
        "<a:VC_Cross:1482532424570376253> Tempo non valido. Usa il formato `4h`, `12h`, `30m`, `2d`.",
      );
      return true;
    }
    durationOverride = durationOverrideRaw.toLowerCase();
  }
  const previousCount = await countPreviousRuleCases(guild.id, parsed.targetId, ruleDot);
  const resolved = resolveStaffRegolaSanction(ruleDot, previousCount);
  if (!resolved) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile risolvere la sanzione per questa regola.");
    return true;
  }
  const reason = buildDefaultReason(ruleDot, resolved.stepIndex, customMotivo);
  const dyno = buildDynoArgs(parsed.targetId, resolved, reason, durationOverride);
  if (!dyno?.cmd || !dyno.args?.length) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Sanzione non supportata.");
    return true;
  }
  await runDynoFromInteraction(interaction, client, dyno.cmd, dyno.args, guild, {
    useSanctionPermChannel: true,
    fromSanzionaAppCommand: true,
  });
  return true;
}

export = { handleSanzionaModal };