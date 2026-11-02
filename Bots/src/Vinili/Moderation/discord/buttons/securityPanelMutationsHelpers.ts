const sec = require("../../../Prefix/Admin/security") as typeof import("../../../Prefix/Admin/security");
const { replyEphemeral, ensureDeferred, respondPayload } = require("./securityPanelPagerHelpers") as typeof import("./securityPanelPagerHelpers");

async function logModuleAction(interaction?, guild?, action?, target?, results?) {
  const okCount = results.filter((r?) => r.ok).length;
  const changedCount = results.filter((r?) => r.changed).length;
  await sec
    .sendSecurityAuditLog(guild, {
      actorId: interaction.user.id,
      action: action === "enable" ? "security.enable" : "security.disable",
      details: [
        `Target: \`${target}\``,
        `Risultati: ${okCount}/${results.length} ok, modificati ${changedCount}`,
      ],
      color: okCount === results.length ? "#57F287" : "#FEE75C",
    })
    .catch(() => null);
}

async function handlePick(interaction?, parts?, guild?, member?, ownerId?) {
  if (!sec.hasPanicControlAccess(member, guild)) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
    return true;
  }
  const target = sec.parsePanicTarget(interaction.values?.[0]);
  if (!target) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Target non valido.");
    return true;
  }
  const action = String(parts[3] || "").toLowerCase() === "enable" ? "enable" : "disable";
  if (!(await ensureDeferred(interaction))) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
    return true;
  }
  const results = await sec.runSecurityAction(action, target, guild, interaction.user.id);
  await logModuleAction(interaction, guild, action, target, results);
  const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
  await respondPayload(interaction, payload);
  return true;
}

async function handleToggle(interaction?, parts?, guild?, member?, ownerId?) {
  if (!sec.hasPanicControlAccess(member, guild)) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
    return true;
  }
  const moduleId = sec.parsePanicTarget(parts[3]);
  if (!moduleId || moduleId === "all") {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Modulo non valido.");
    return true;
  }
  if (!(await ensureDeferred(interaction))) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
    return true;
  }
  const modules = await sec.fetchSecurityModulesState(guild);
  const mod = modules.find((m?) => m.id === moduleId);
  const action = mod?.enabled ? "disable" : "enable";
  const results = await sec.runSecurityAction(action, moduleId, guild, interaction.user.id);
  await logModuleAction(interaction, guild, action, moduleId, results);
  const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
  await respondPayload(interaction, payload);
  return true;
}

async function handleBulk(interaction?, parts?, guild?, member?, ownerId?) {
  if (!sec.hasPanicControlAccess(member, guild)) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
    return true;
  }
  const bulkAction = String(parts[3] || "").toLowerCase();
  const action = bulkAction === "enable_all" ? "enable" : bulkAction === "disable_all" ? "disable" : "";
  if (!action) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Azione non valida.");
    return true;
  }
  if (!(await ensureDeferred(interaction))) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
    return true;
  }
  const results = await sec.runSecurityAction(action, "all", guild, interaction.user.id);
  await logModuleAction(interaction, guild, action, "all", results);
  const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
  await respondPayload(interaction, payload);
  return true;
}

export = {
  handlePick,
  handleToggle,
  handleBulk,
};
