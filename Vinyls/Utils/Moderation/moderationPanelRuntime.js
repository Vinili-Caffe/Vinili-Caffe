const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const PANEL_PREFIX = "mpr";
const SECTION_HOME = "home";
const SECTION_SANCTIONS = "sanctions";
const SECTION_CASES = "cases";

const FIELD_REASON = "mpr_f_reason";
const FIELD_DURATION = "mpr_f_duration";
const FIELD_CASE = "mpr_f_case";
const FIELD_EXTRA = "mpr_f_extra";

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function withSourceSuffix(baseCustomId, sourceMessageId = null) {
  const sid = normalizeSourceMessageId(sourceMessageId);
  return sid ? `${baseCustomId}:${sid}` : baseCustomId;
}

function formatNavCustomId(guildId, viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:nav:${guildId}:${viewerId}:${targetId}`, sourceMessageId);
}

function formatGoCustomId(guildId, viewerId, targetId, action, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:go:${guildId}:${viewerId}:${targetId}:${action}`, sourceMessageId);
}

function formatModalCustomId(guildId, viewerId, targetId, action, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:md:${guildId}:${viewerId}:${targetId}:${action}`, sourceMessageId);
}

function formatHomeCustomId(guildId, viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:home:${guildId}:${viewerId}:${targetId}`, sourceMessageId);
}

function formatCloseCustomId(guildId, viewerId, targetId, sourceMessageId = null) {
  return withSourceSuffix(`${PANEL_PREFIX}:close:${guildId}:${viewerId}:${targetId}`, sourceMessageId);
}

function parseNavCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 4 || p[0] !== PANEL_PREFIX || p[1] !== "nav") return null;
  if (p.length >= 5) return { guildId: p[2], viewerId: p[3], targetId: p[4], sourceMessageId: normalizeSourceMessageId(p[5]) };
  return { guildId: null, viewerId: p[2], targetId: p[3], sourceMessageId: normalizeSourceMessageId(p[4]) };
}

function parseHomeCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "home") return null;
  return { guildId: p[2], viewerId: p[3], targetId: p[4], sourceMessageId: normalizeSourceMessageId(p[5]) };
}

function parseGoCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "go") return null;
  if (p.length >= 6) return { guildId: p[2], viewerId: p[3], targetId: p[4], action: p[5], sourceMessageId: normalizeSourceMessageId(p[6]) };
  return { guildId: null, viewerId: p[2], targetId: p[3], action: p[4] };
}

function parseCloseCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "close") return null;
  return { guildId: p[2], viewerId: p[3], targetId: p[4], sourceMessageId: normalizeSourceMessageId(p[5]) };
}

function parseModalCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "md") return null;
  if (p.length >= 6) return { guildId: p[2], viewerId: p[3], targetId: p[4], action: p[5], sourceMessageId: normalizeSourceMessageId(p[6]) };
  return { guildId: null, viewerId: p[2], targetId: p[3], action: p[4] };
}

function sectionLabel(sec) {
  const s = String(sec || SECTION_HOME).toLowerCase();
  if (s === SECTION_SANCTIONS) return "Sanzioni";
  return "Home";
}

function buildNavRow(guildId, viewerId, targetId, section, sourceMessageId = null) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatNavCustomId(g, v, t, sourceMessageId))
      .setPlaceholder(`Sezione: ${sectionLabel(sec)}`)
      .addOptions(
        { label: "Home", value: SECTION_HOME, default: sec === SECTION_HOME, emoji: "<:VC_Info:1482526956703580372>" },
        { label: "Sanzioni", value: SECTION_SANCTIONS, default: sec === SECTION_SANCTIONS, emoji: "<:VC_BanHammer:1482534474502897795>" },
      ),
  );
}

function buildHomeRow(guildId, viewerId, targetId, sourceMessageId = null) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatHomeCustomId(g, v, t, sourceMessageId))
      .setPlaceholder("Warnings · moderazioni · modlogs")
      .addOptions(
        { label: "Warnings", value: "warnings", emoji: "<:VC_Info:1482526956703580372>" },
        { label: "Moderazioni attive", value: "moderations", emoji: "<:VC_BanHammer:1482534474502897795>" },
        { label: "Modlogs", value: "modlogs", emoji: "<:VC_id:1478517313618575419>" },
      ),
  );
}

function buildModlogCaseRow(guildId, viewerId, targetId, sourceMessageId = null) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  return new ActionRowBuilder().addComponents(
    btn(g, v, t, "case", "Case", ButtonStyle.Primary, sourceMessageId),
    btn(g, v, t, "reason", "Reason", ButtonStyle.Primary, sourceMessageId),
    btn(g, v, t, "duration", "Duration", ButtonStyle.Primary, sourceMessageId),
  );
}

function chunkButtons(rows, maxPerRow = 5) {
  const out = [];
  for (let i = 0; i < rows.length; i += maxPerRow) {
    out.push(rows.slice(i, i + maxPerRow));
  }
  return out;
}

function btn(guildId, v, t, key, label, style = ButtonStyle.Secondary, sourceMessageId = null) {
  return new ButtonBuilder().setCustomId(formatGoCustomId(guildId, v, t, key, sourceMessageId)).setLabel(label).setStyle(style);
}

function buildSectionRows(guildId, viewerId, targetId, section, sourceMessageId = null) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  if (sec === SECTION_HOME) {
    return [buildHomeRow(g, v, t, sourceMessageId), buildModlogCaseRow(g, v, t, sourceMessageId)];
  }
  const rows = [];
  if (sec === SECTION_SANCTIONS) {
    rows.push(
      btn(g, v, t, "warn", "Warn", ButtonStyle.Danger, sourceMessageId),
      btn(g, v, t, "kick", "Kick", ButtonStyle.Danger, sourceMessageId),
      btn(g, v, t, "mute", "Mute", ButtonStyle.Danger, sourceMessageId),
      btn(g, v, t, "ban", "Ban", ButtonStyle.Danger, sourceMessageId),
      btn(g, v, t, "unmute", "Unmute", ButtonStyle.Secondary, sourceMessageId),
      btn(g, v, t, "unban", "Unban", ButtonStyle.Secondary, sourceMessageId),
      btn(g, v, t, "delwarn", "Delwarn", ButtonStyle.Secondary, sourceMessageId),
      btn(g, v, t, "clearwarn", "Clearwarn", ButtonStyle.Secondary, sourceMessageId),
    );
  }
  const chunks = chunkButtons(rows, 5);
  return chunks.map((chunk) => new ActionRowBuilder().addComponents(...chunk));
}

function buildCloseRow(guildId, viewerId, targetId, sourceMessageId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(formatCloseCustomId(guildId, viewerId, targetId, sourceMessageId))
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildModalForAction(guildId, viewerId, targetId, action, sourceMessageId = null) {
  const a = String(action || "").toLowerCase();
  const modal = new ModalBuilder()
    .setCustomId(formatModalCustomId(String(guildId), viewerId, targetId, a, sourceMessageId))
    .setTitle(`Moderazione: ${a}`);
  if (a === "warn" || a === "kick") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "mute") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_DURATION)
          .setLabel("Durata (es. 10m, 2h, 1d)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "ban") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_DURATION)
          .setLabel("Durata (opzionale, es. 2d) o vuoto")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(32),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Motivo (obbligatorio)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "unmute" || a === "unban") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(a === "unmute")
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "delwarn") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Testo warn da rimuovere (match)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "modlogs") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_EXTRA)
          .setLabel("Pagina (opzionale, default 1)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4),
      ),
    );
    return modal;
  }
  if (a === "case") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_CASE)
          .setLabel("ID case (numero)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(12),
      ),
    );
    return modal;
  }
  if (a === "reason") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_CASE)
          .setLabel("ID case")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(12),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_REASON)
          .setLabel("Nuovo motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
    return modal;
  }
  if (a === "duration") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_CASE)
          .setLabel("ID case")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(12),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_DURATION)
          .setLabel("Nuova durata (es. 420m)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32),
      ),
    );
    return modal;
  }
  return null;
}

async function buildModerationPanelPayload(guild, viewerId, targetId, client, section = SECTION_HOME, options = {}) {
  const tid = String(targetId || "");
  const vid = String(viewerId || "");
  const targetUser = await client.users.fetch(tid).catch(() => null);
  const member = await guild.members.fetch(tid).catch(() => null);
  const name = member?.displayName || targetUser?.username || tid;
  let sec = String(section || SECTION_HOME).toLowerCase();
  if (sec === SECTION_CASES) sec = SECTION_HOME;
  const allowed = new Set([SECTION_HOME, SECTION_SANCTIONS]);
  if (!allowed.has(sec)) sec = SECTION_HOME;
  const sourceMessageId = normalizeSourceMessageId(options?.sourceMessageId);

  const lines = [
    `<:staff:1443651912179388548> **Target:** ${targetUser ? `${targetUser} (\`${tid}\`)` : `\`${tid}\``}`,
    member ? `<:VC_OnlineStatus:1482527088912240650> **Nel server:** sì` : `<:VC_InactiveStatus:1482526984234860574> **Nel server:** no (alcune azioni richiedono la presenza)`,
    "",
    "<:VC_Info:1482526956703580372> **Home:** menu consultazioni (warnings, moderazioni, modlogs) e sotto i pulsanti **Case / Reason / Duration**. **Sanzioni:** pulsanti sanzione. Il menu in alto passa tra Home e Sanzioni.",
    "",
    "_Comandi legacy (+ban, +kick, …) restano disponibili; questo pannello li riunisce._",
  ];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_BanHammer:1482534474502897795> Pannello moderazione")
    .setDescription(lines.join("\n"))
    .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null)
    .setFooter({ text: `Server ${guild.id} · Aperto da ${vid} · Target ${tid}` });

  const gid = String(guild.id);
  const components = [
    buildNavRow(gid, vid, tid, sec, sourceMessageId),
    ...buildSectionRows(gid, vid, tid, sec, sourceMessageId),
    buildCloseRow(gid, vid, tid, sourceMessageId),
  ];
  return { embeds: [embed], components };
}

module.exports = {
  PANEL_PREFIX,
  SECTION_HOME,
  SECTION_SANCTIONS,
  SECTION_CASES,
  FIELD_REASON,
  FIELD_DURATION,
  FIELD_CASE,
  FIELD_EXTRA,
  formatNavCustomId,
  formatGoCustomId,
  formatHomeCustomId,
  formatModalCustomId,
  parseNavCustomId,
  parseHomeCustomId,
  parseGoCustomId,
  parseCloseCustomId,
  parseModalCustomId,
  buildModalForAction,
  buildModerationPanelPayload,
};