"use strict";

const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const { buildStaffProfilePayload, SECTION_HOME } = require("../Utils/Staff/staffProfilePanelRuntime");

const SELECT_PREFIX = "staff_hs_target:";
const MAX_OPTIONS = 25;
const PRIVATE_FLAG = 1 << 6;
const NO_SOURCE_TOKEN = "0";

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function buildStaffHsSelectCustomId(viewerUserId, sourceMessageId = null) {
  const vid = String(viewerUserId || "");
  const sid = normalizeSourceMessageId(sourceMessageId);
  return `${SELECT_PREFIX}${vid}:${sid || NO_SOURCE_TOKEN}`;
}

function collectStaffOrPartnerManagerMembers(guild) {
  const staffRoleId = String(IDs.roles?.Staff || "");
  const pmRoleId = String(IDs.roles?.PartnerManager || "");
  const list = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    const hasStaff = staffRoleId && member.roles.cache.has(staffRoleId);
    const hasPm = pmRoleId && member.roles.cache.has(pmRoleId);
    if (!hasStaff && !hasPm) continue;
    list.push(member);
  }
  list.sort((a, b) => {
    const na = String(a.displayName || a.user?.username || a.id).toLowerCase();
    const nb = String(b.displayName || b.user?.username || b.id).toLowerCase();
    return na.localeCompare(nb, "it", { sensitivity: "base" });
  });
  return list;
}

/** Messaggio con menu per `+staff` (solo High Staff, senza argomenti). */
function buildStaffHsPickerMessage(guild, viewerUserId, sourceMessageId = null) {
  const vid = String(viewerUserId || "");
  if (!guild || !/^\d{16,20}$/.test(vid)) return { error: "<:vegax:1443934876440068179> Richiesta non valida." };
  const members = collectStaffOrPartnerManagerMembers(guild);
  if (!members.length) {
    return {
      error:
        "<:vegax:1443934876440068179> Nessun membro con ruolo **Staff** o **Partner Manager** trovato nella cache del server. Prova `+staff @utente` oppure attendi che il client sincronizzi i membri.",
    };
  }
  const slice = members.slice(0, MAX_OPTIONS);
  const options = slice.map((m) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(String(m.displayName || m.user?.username || m.id).slice(0, 100))
      .setValue(String(m.id)),
  );
  const over = members.length > MAX_OPTIONS;
  const descLines = [
    "<:VC_Staff:1494286904089247754> Seleziona **chi** vuoi visualizzare (solo membri con ruolo **Staff** o **Partner Manager**).",
  ];
  if (over) {
    descLines.push(
      "",
      `<a:VC_Alert:1482706673176150077> Nel menu compaiono i primi **${MAX_OPTIONS}** su **${members.length}** (ordine alfabetico). Per altri utenti usa \`+staff @utente\`.`,
    );
  }
  const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(descLines.join("\n"));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildStaffHsSelectCustomId(vid, sourceMessageId))
      .setPlaceholder("Scegli un membro Staff o Partner Manager…")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
  return { embeds: [embed], components: [row] };
}

function match(interaction) {
  if (!interaction?.isStringSelectMenu?.()) return false;
  return String(interaction.customId || "").startsWith(SELECT_PREFIX);
}

function parseSelectCustomId(customId) {
  const rest = String(customId || "").slice(SELECT_PREFIX.length);
  const parts = rest.split(":");
  const viewerId = String(parts[0] || "");
  if (!/^\d{16,20}$/.test(viewerId)) return null;
  const sourceToken = String(parts[1] || NO_SOURCE_TOKEN).trim();
  const sourceMessageId = sourceToken === NO_SOURCE_TOKEN ? null : normalizeSourceMessageId(sourceToken);
  return { viewerId, sourceMessageId };
}

async function execute(interaction, client) {
  const guild = interaction.guild;
  if (!guild) return false;
  const parsedSelect = parseSelectCustomId(interaction.customId);
  if (!parsedSelect) return false;
  const viewerId = parsedSelect.viewerId;
  if (String(interaction.user.id) !== viewerId) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Solo chi ha usato `+staff` può usare questo menu.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }
  const hsRole = String(IDs.roles?.HighStaff || "");
  if (!hsRole || !interaction.member?.roles?.cache?.has(hsRole)) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Solo **High Staff** può usare questo menu.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }
  const targetId = String(interaction.values?.[0] || "");
  if (!/^\d{16,20}$/.test(targetId)) {
    await interaction
      .reply({ content: "<:vegax:1443934876440068179> Selezione non valida.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }
  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    await interaction
      .reply({ content: "<:vegax:1443934876440068179> Utente non trovato nel server.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }
  const staffRoleId = String(IDs.roles?.Staff || "");
  const pmRoleId = String(IDs.roles?.PartnerManager || "");
  const stillOk =
    (staffRoleId && targetMember.roles.cache.has(staffRoleId)) ||
    (pmRoleId && targetMember.roles.cache.has(pmRoleId));
  if (!stillOk) {
    await interaction
      .reply({
        content:
          "<:vegax:1443934876440068179> Il membro selezionato non ha più ruolo **Staff** o **Partner Manager**.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }
  const resolvedClient = client || interaction.client;
  const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
  const sourceMessageId = parsedSelect.sourceMessageId || interaction.message?.id || null;
  let payload;
  try {
    payload = await buildStaffProfilePayload(guild, targetId, viewerId, resolvedClient, SECTION_HOME, {
      sourceMessageId,
      partnersChatPanel,
    });
  } catch (err) {
    global.logger?.warn?.("[staffCommandSelect] buildStaffProfilePayload:", err?.message || err);
    await interaction
      .reply({ content: "<:vegax:1443934876440068179> Impossibile caricare il profilo.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }
  try {
    await interaction.update({
      embeds: payload.embeds || [],
      components: payload.components || [],
      content: "",
    });
  } catch (err) {
    global.logger?.warn?.("[staffCommandSelect] interaction.update:", err?.message || err);
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Impossibile aggiornare il messaggio. Riprova con `+staff @utente`.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
  }
  return true;
}

module.exports = {
  name: "staffCommandSelect",
  order: 12,
  match,
  execute,
  buildStaffHsPickerMessage,
};