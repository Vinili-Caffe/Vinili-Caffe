const { buildLevelServerPanelPayload } = require("../../Prefix/Admin/level") as typeof import("../../Prefix/Admin/level");
const { setLevelChannelLocked, setRoleIgnored, setTemporaryEventMultiplier, setRoleExpMultiplier, setGlobalMultiplier } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const { SERVER_BTN_MODAL, PRIVATE_FLAG, asInt, fmtDate, buildModal, buildSimpleEmbed } = require("./levelPanelModalsHelpers") as typeof import("./levelPanelModalsHelpers");

async function runServerModalAction(interaction?, action?) {
  const guildId = interaction.guild?.id;
  if (!guildId) return buildSimpleEmbed("Level", "Guild non disponibile.");
  if (action === "multiplier") {
    const value = Number(interaction.fields.getTextInputValue("value"));
    const minutesRaw = String(interaction.fields.getTextInputValue("minutes") || "").trim();
    const minutes = asInt(minutesRaw || 60);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(minutes) || minutes <= 0) {
      return buildSimpleEmbed("Level", "Valori non validi.");
    }
    const out = await setTemporaryEventMultiplier(guildId, value, minutes * 60 * 1000);
    return buildSimpleEmbed("Level", `Boost EXP temporaneo impostato a **${out.multiplier}x** fino al **${fmtDate(out.expiresAt)}**.`);
  }
  if (action === "gmulti") {
    const value = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido.");
    const stored = await setGlobalMultiplier(guildId, value);
    return buildSimpleEmbed("Level", `Moltiplicatore globale impostato a **${stored}x**.`);
  }
  if (action === "role_multi_set") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    const value = Number(interaction.fields.getTextInputValue("value"));
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Ruolo non valido.");
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Moltiplicatore non valido.");
    await setRoleExpMultiplier(guildId, cleanTarget, value);
    return buildSimpleEmbed("Level", `Moltiplicatore ruolo impostato per <@&${cleanTarget}> a **${value}x**.`);
  }
  if (action === "role_multi_remove") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Ruolo non valido.");
    await setRoleExpMultiplier(guildId, cleanTarget, null);
    return buildSimpleEmbed("Level", `Override moltiplicatore rimosso per <@&${cleanTarget}> (torna al default se presente).`);
  }
  return buildSimpleEmbed("Level", "Azione server non riconosciuta.");
}

async function handleServerButton(interaction?, compParsed?, ownerId?) {
  const modalAction = SERVER_BTN_MODAL[compParsed.action];
  if (!modalAction) return false;
  const modal = buildModal("server", modalAction, ownerId);
  await interaction.showModal(modal).catch(() => {});
  return true;
}

async function handleChannelSelect(interaction?, compParsed?, ownerId?) {
  if (compParsed?.kind !== "server_ch") return false;
  const guildId = interaction.guild?.id;
  const channelId = interaction.values?.[0];
  if (!guildId || !channelId) return false;
  const locked = compParsed.action === "lock";
  await setLevelChannelLocked(guildId, channelId, locked);
  const payload = await buildLevelServerPanelPayload(interaction.guild, ownerId, "channels", interaction.user);
  await interaction.update(payload).catch(async () => {
    await interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => {});
  });
  return true;
}

async function handleRoleSelect(interaction?, compParsed?, ownerId?) {
  if (compParsed?.kind !== "server_role") return false;
  const guildId = interaction.guild?.id;
  const roleId = interaction.values?.[0];
  if (!guildId || !roleId) return false;
  const ignored = compParsed.action === "ignore";
  await setRoleIgnored(guildId, roleId, ignored);
  const payload = await buildLevelServerPanelPayload(interaction.guild, ownerId, "roles", interaction.user);
  await interaction.update(payload).catch(async () => {
    await interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => {});
  });
  return true;
}

async function handleServerNav(interaction?, ownerId?) {
  const section = String(interaction.values?.[0] || "home").toLowerCase();
  const payload = await buildLevelServerPanelPayload(interaction.guild, ownerId, section, interaction.user);
  await interaction.update(payload).catch(async () => { await interaction.reply(payload).catch(() => {}); });
  return true;
}

export = {
  runServerModalAction,
  handleServerButton,
  handleChannelSelect,
  handleRoleSelect,
  handleServerNav,
};
