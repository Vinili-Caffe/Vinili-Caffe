const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { getUserOverviewStats } = require("../../Services/Community/activityService");
const { STAFF_WARN_RESET_MS } = require("../../Services/Staff/staffWarnService");
const { buildPauseListPayload, buildPauseListMonthRows } = require("../Pause/pauseListRuntime");
const PANEL_PREFIX = "staff_profile_panel";
const SECTION_HOME = "home";
const SECTION_VALUTAZIONI = "valutazioni";
const SECTION_WARN = "warn";
const SECTION_PAUSE = "pause";
const SECTION_STATS = "stats";
const TIME_ZONE = "Europe/Rome";
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 250, hours: 2.5 },
  [String(IDs.roles.Mod)]: { messages: 350, hours: 3.5 },
  [String(IDs.roles.Coordinator)]: { messages: 450, hours: 4.5 },
  [String(IDs.roles.Supervisor)]: { messages: 500, hours: 5 },
};
const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Supervisor),
  String(IDs.roles.Coordinator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
].filter(Boolean);
const STAFF_PROFILE_DISPLAY_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
].filter(Boolean);
const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

function resolveStaffRole(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function resolveStaffProfileDisplayRoleId(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function getStaffPauseLine(staffDoc) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      return `In pausa fino al **${p.dataRitorno}**`;
    }
    if (end < today && end >= sevenDaysAgo) {
      return `Rientrato il **${p.dataRitorno}**`;
    }
  }
  return "Nessuna pausa in corso.";
}

function dayKeyToWeekdayLabel(dayKey) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

function barRowFromValues(values, maxVal) {
  const safeMax = Math.max(1, maxVal);
  return values
    .map((v) => {
      const n = Math.max(0, Number(v || 0));
      const level = Math.min(7, Math.floor((7 * n) / safeMax));
      return COSTANZA_BARS[level];
    })
    .map((b) => ` ${b} `)
    .join("");
}

function formatStaffProfileSelectCustomId(viewerId, targetId) {
  return `${PANEL_PREFIX}:select:${viewerId}:${targetId}`;
}

function parseStaffProfileSelectCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PANEL_PREFIX || parts[1] !== "select") return null;
  return { viewerId: parts[2], targetId: parts[3] };
}

function buildSelectRow(viewerId, targetId, section) {
  const opts = [
    { label: "Home", value: SECTION_HOME, emoji: "<:staff:1443651912179388548>", default: section === SECTION_HOME },
    { label: "Valutazioni", value: SECTION_VALUTAZIONI, emoji: "<:thumbsup:1471292172145004768>", default: section === SECTION_VALUTAZIONI },
    { label: "Warn staff", value: SECTION_WARN, emoji: "<:banhammer:1443651875441217639>", default: section === SECTION_WARN },
    { label: "Pause", value: SECTION_PAUSE, emoji: "<a:VC_Calendar:1482706208149475358>", default: section === SECTION_PAUSE },
    { label: "Stats", value: SECTION_STATS, emoji: "<:VC_Clock:1473359204189474886>", default: section === SECTION_STATS },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(formatStaffProfileSelectCustomId(viewerId, targetId))
      .setPlaceholder("Sezione profilo staff")
      .addOptions(...opts),
  );
}

function chunkString(text, maxLen = 3800) {
  const s = String(text || "");
  if (!s) return [""];
  const chunks = [];
  for (let i = 0; i < s.length; i += maxLen) {
    chunks.push(s.slice(i, i + maxLen));
  }
  return chunks;
}

function warnResetLine(firstWarnStaffAt) {
  if (!firstWarnStaffAt) return
  const first = firstWarnStaffAt instanceof Date ? firstWarnStaffAt : new Date(firstWarnStaffAt);
  if (Number.isNaN(first.getTime())) return "";
  const resetAt = first.getTime() + STAFF_WARN_RESET_MS;
  const left = resetAt - Date.now();
  if (left <= 0) return "I warn possono essere stati azzerati dal ciclo automatico.";
  const days = Math.ceil(left / (24 * 60 * 60 * 1000));
  return `Prossimo reset automatico warn: tra ~**${days}** giorni (<t:${Math.floor(resetAt / 1000)}:R>).`;
}

async function fetchStaffLean(guildId, userId) {
  return ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("staff")
    .lean()
    .catch(() => null);
}

async function buildStaffProfilePayload(guild, targetUserId, viewerId, client, section = SECTION_HOME) {
  const gid = String(guild?.id || "");
  const tid = String(targetUserId || "");
  const member = await guild.members.fetch(tid).catch(() => null);
  const targetUser = member?.user || (await client.users.fetch(tid).catch(() => null));
  const display = member || targetUser;
  const name = member?.displayName || targetUser?.username || tid;
  const staffRoleId = member ? resolveStaffRole(member) : null;
  const displayRoleId = member ? resolveStaffProfileDisplayRoleId(member) : null;
  let roleLabel = "—";
  if (displayRoleId) {
    roleLabel = guild.roles.cache.get(displayRoleId)?.name || `<@&${displayRoleId}>`;
  } else {
    roleLabel = "— (nessun ruolo staff rilevato)";
  }

  const doc = await fetchStaffLean(gid, tid);
  const s = doc?.staff || {};
  const pos = Math.max(0, Math.floor(Number(s.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(s.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(s.warnCount || 0)));
  const posReasons = Array.isArray(s.positiveReasons) ? s.positiveReasons : [];
  const negReasons = Array.isArray(s.negativeReasons) ? s.negativeReasons : [];
  const warnReasons = Array.isArray(s.warnReasons) ? s.warnReasons : [];

  const overview = await getUserOverviewStats(gid, tid, 7).catch(() => null);
  const d7 = overview?.windows?.d7 || {};
  const weeklyMsg = Math.max(0, Math.floor(Number(d7.text || 0)));
  const weeklySec = Math.max(0, Math.floor(Number(d7.voiceSeconds || 0)));
  const weeklyHours = weeklySec / 3600;
  const limits = staffRoleId ? STAFF_ACTIVITY_LIMITS[String(staffRoleId)] : null;

  const sec = String(section || SECTION_HOME).toLowerCase();
  const selectRow = buildSelectRow(String(viewerId), tid, sec);

  if (sec === SECTION_VALUTAZIONI) {
    const posLines = posReasons.map((r, i) => `**+${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const negLines = negReasons.map((r, i) => `**−${i + 1}.** ${String(r || "—").slice(0, 900)}`);
    const body = [
      `<:staff:1443651912179388548> **${name}**`,
      "",
      `Valutazioni positive: **${pos}** · negative: **${neg}**`,
      "",
      posLines.length ? "**Positive**" : "**Positive** — nessuna.",
      ...posLines,
      "",
      negLines.length ? "**Negative**" : "**Negative** — nessuna.",
      ...negLines,
    ].join("\n");
    const chunks = chunkString(body, 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(i === 0 ? "Valutazioni staff" : `Valutazioni staff (${i + 1}/${chunks.length})`)
        .setDescription(desc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    );
    return { embeds, components: [selectRow] };
  }

  if (sec === SECTION_WARN) {
    const lines = [
      `<:staff:1443651912179388548> **${name}**`,
      "",
      `Warn staff attivi: **${warns}**`,
      "",
      warnResetLine(s.firstWarnStaffAt),
      "",
    ];
    if (warnReasons.length) {
      lines.push("**Motivazioni**");
      warnReasons.forEach((r, i) => lines.push(`**${i + 1}.** ${String(r || "—").slice(0, 900)}`));
    } else {
      lines.push("Nessun warn registrato.");
    }
    const chunks = chunkString(lines.join("\n"), 3800);
    const embeds = chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(i === 0 ? "Warn staff" : `Warn staff (${i + 1}/${chunks.length})`)
        .setDescription(desc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    );
    return { embeds, components: [selectRow] };
  }

  if (sec === SECTION_PAUSE) {
    const targetUserObj = targetUser || { id: tid, username: name };
    const viewerMem = await guild.members.fetch(String(viewerId)).catch(() => null);
    const isHighStaff = Boolean(viewerMem?.roles?.cache?.has(IDs.roles.HighStaff));
    const listPayload = await buildPauseListPayload({
      guildId: gid,
      requesterId: String(viewerId),
      targetUser: targetUserObj,
      isHighStaff,
      client,
    });
    if (!listPayload.ok) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(listPayload.error || "Errore caricamento pause."),
        ],
        components: [selectRow],
      };
    }
    return {
      embeds: [...listPayload.embeds],
      components: [selectRow, ...(listPayload.components || [])],
    };
  }

  if (sec === SECTION_STATS) {
    const chart = Array.isArray(overview?.chart) ? overview.chart.slice(-7) : [];
    const labels = chart.map((p) => dayKeyToWeekdayLabel(p?.dayKey)).join(" ");
    const texts = chart.map((p) => Number(p?.text || 0));
    const hours = chart.map((p) => Number(p?.voiceSeconds || 0) / 3600);
    const maxT = Math.max(1, ...texts);
    const maxH = Math.max(1, ...hours);
    const barT = barRowFromValues(texts, maxT);
    const barH = barRowFromValues(hours, maxH);
    const limitLines = limits
      ? [
          "",
          "**Limiti settimanali**",
          `Messaggi: **${weeklyMsg}** / ${limits.messages} — mancano **${Math.max(0, limits.messages - weeklyMsg)}**`,
          `Vocale: **${weeklyHours.toFixed(2)}h** / ${limits.hours}h — mancano **${Math.max(0, limits.hours - weeklyHours).toFixed(2)}h**`,
        ]
      : [
          "",
          `Messaggi negli ultimi 7 giorni: **${weeklyMsg}**`,
          `Vocale negli ultimi 7 giorni: **${weeklyHours.toFixed(2)}h**`,
        ];
    const desc = [
      `<:staff:1443651912179388548> **${name}** — ultimi **7** giorni.`,
      "",
      "**Messaggi / giorno**",
      `\`${labels}\``,
      `\`${barT}\``,
      "",
      "**Ore vocali / giorno**",
      `\`${labels}\``,
      `\`${barH}\``,
      ...limitLines,
    ].join("\n");
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("Statistiche attività")
          .setDescription(desc.slice(0, 4090))
          .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
      ],
      components: [selectRow],
    };
  }

  const pauseShort = getStaffPauseLine(s);
  const homeDesc = [
    `<:staff:1443651912179388548> **Profilo staff — ${name}**`,
    "",
    `**Ruolo:** ${roleLabel}`,
    "",
    `<a:VC_Calendar:1482706208149475358> **Pause:** ${pauseShort}`,
    "",
    `**Valutazioni:** <:thumbsup:1471292172145004768> ${pos} · <:thumbsdown:1471292163957457013> ${neg}`,
    `**Warn staff:** ${warns}`,
    `**Attività:** ${weeklyMsg} messaggi · **${weeklyHours.toFixed(2)}h** vocale`,
    "",
    "Seleziona una sezione dal menu per i dettagli.",
  ].join("\n");

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Home")
        .setDescription(homeDesc)
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null),
    ],
    components: [selectRow],
  };
}

module.exports = {
  PANEL_PREFIX,
  SECTION_HOME,
  SECTION_VALUTAZIONI,
  SECTION_WARN,
  SECTION_PAUSE,
  SECTION_STATS,
  formatStaffProfileSelectCustomId,
  parseStaffProfileSelectCustomId,
  buildStaffProfilePayload,
};