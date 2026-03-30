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

function formatNavCustomId(guildId, viewerId, targetId) {
  return `${PANEL_PREFIX}:nav:${guildId}:${viewerId}:${targetId}`;
}

function formatGoCustomId(guildId, viewerId, targetId, action) {
  return `${PANEL_PREFIX}:go:${guildId}:${viewerId}:${targetId}:${action}`;
}

function formatModalCustomId(guildId, viewerId, targetId, action) {
  return `${PANEL_PREFIX}:md:${guildId}:${viewerId}:${targetId}:${action}`;
}

function parseNavCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 4 || p[0] !== PANEL_PREFIX || p[1] !== "nav") return null;
  if (p.length >= 5) return { guildId: p[2], viewerId: p[3], targetId: p[4] };
  return { guildId: null, viewerId: p[2], targetId: p[3] };
}

function parseGoCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "go") return null;
  if (p.length >= 6) return { guildId: p[2], viewerId: p[3], targetId: p[4], action: p[5] };
  return { guildId: null, viewerId: p[2], targetId: p[3], action: p[4] };
}

function parseModalCustomId(customId) {
  const p = String(customId || "").split(":");
  if (p.length < 5 || p[0] !== PANEL_PREFIX || p[1] !== "md") return null;
  if (p.length >= 6) return { guildId: p[2], viewerId: p[3], targetId: p[4], action: p[5] };
  return { guildId: null, viewerId: p[2], targetId: p[3], action: p[4] };
}

function sectionLabel(sec) {
  const s = String(sec || SECTION_HOME).toLowerCase();
  if (s === SECTION_SANCTIONS) return "Sanzioni";
  if (s === SECTION_CASES) return "Case e log";
  return "Home";
}

function buildNavRow(guildId, viewerId, targetId, section) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatNavCustomId(g, v, t))
      .setPlaceholder(`Sezione: ${sectionLabel(sec)}`)
      .addOptions(
        { label: "Home", value: SECTION_HOME, default: sec === SECTION_HOME, emoji: "<:VC_Info:1482526956703580372>" },
        { label: "Sanzioni", value: SECTION_SANCTIONS, default: sec === SECTION_SANCTIONS, emoji: "<:VC_BanHammer:1482534474502897795>" },
        { label: "Case e log", value: SECTION_CASES, default: sec === SECTION_CASES, emoji: "<:VC_id:1478517313618575419>" },
      ),
  );
}

function chunkButtons(rows, maxPerRow = 5) {
  const out = [];
  for (let i = 0; i < rows.length; i += maxPerRow) {
    out.push(rows.slice(i, i + maxPerRow));
  }
  return out;
}

function btn(guildId, v, t, key, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(formatGoCustomId(guildId, v, t, key)).setLabel(label).setStyle(style);
}

function buildSectionRows(guildId, viewerId, targetId, section) {
  const g = String(guildId);
  const v = String(viewerId);
  const t = String(targetId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  const rows = [];
  if (sec === SECTION_HOME) {
    rows.push(
      btn(g, v, t, "warnings", "Warnings", ButtonStyle.Primary),
      btn(g, v, t, "moderations", "Moderazioni attive", ButtonStyle.Primary),
      btn(g, v, t, "modlogs", "Modlogs", ButtonStyle.Primary),
    );
  } else if (sec === SECTION_SANCTIONS) {
    rows.push(
      btn(g, v, t, "warn", "Warn", ButtonStyle.Danger),
      btn(g, v, t, "kick", "Kick", ButtonStyle.Danger),
      btn(g, v, t, "mute", "Mute", ButtonStyle.Danger),
      btn(g, v, t, "ban", "Ban", ButtonStyle.Danger),
      btn(g, v, t, "unmute", "Unmute", ButtonStyle.Secondary),
      btn(g, v, t, "unban", "Unban", ButtonStyle.Secondary),
      btn(g, v, t, "delwarn", "Delwarn", ButtonStyle.Secondary),
      btn(g, v, t, "clearwarn", "Clearwarn", ButtonStyle.Secondary),
    );
  } else if (sec === SECTION_CASES) {
    rows.push(
      btn(g, v, t, "case", "Case", ButtonStyle.Primary),
      btn(g, v, t, "reason", "Reason", ButtonStyle.Primary),
      btn(g, v, t, "duration", "Duration", ButtonStyle.Primary),
    );
  }
  const chunks = chunkButtons(rows, 5);
  return chunks.map((chunk) => new ActionRowBuilder().addComponents(...chunk));
}

function buildModalForAction(guildId, viewerId, targetId, action) {
  const a = String(action || "").toLowerCase();
  const modal = new ModalBuilder()
    .setCustomId(formatModalCustomId(String(guildId), viewerId, targetId, a))
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

async function buildModerationPanelPayload(guild, viewerId, targetId, client, section = SECTION_HOME) {
  const tid = String(targetId || "");
  const vid = String(viewerId || "");
  const targetUser = await client.users.fetch(tid).catch(() => null);
  const member = await guild.members.fetch(tid).catch(() => null);
  const name = member?.displayName || targetUser?.username || tid;
  let sec = String(section || SECTION_HOME).toLowerCase();
  const allowed = new Set([SECTION_HOME, SECTION_SANCTIONS, SECTION_CASES]);
  if (!allowed.has(sec)) sec = SECTION_HOME;

  const lines = [
    `<:staff:1443651912179388548> **Target:** ${targetUser ? `${targetUser} (\`${tid}\`)` : `\`${tid}\``}`,
    member ? `<:VC_OnlineStatus:1482527088912240650> **Nel server:** sì` : `<:VC_InactiveStatus:1482526984234860574> **Nel server:** no (alcune azioni richiedono la presenza)`,
    "",
    "<:VC_Info:1482526956703580372> Usa il **menu** per cambiare sezione. I **pulsanti** aprono un modulo o eseguono subito l’azione.",
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
  const components = [buildNavRow(gid, vid, tid, sec), ...buildSectionRows(gid, vid, tid, sec)];
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
  formatModalCustomId,
  parseNavCustomId,
  parseGoCustomId,
  parseModalCustomId,
  buildModalForAction,
  buildModerationPanelPayload,
};