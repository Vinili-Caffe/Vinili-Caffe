const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType } = require("discord.js");
const { MentionReaction } = require("../Schemas/Community/autoInteractionSchemas");
const { CustomRole, AvatarPrivacy, BannerPrivacy, QuotePrivacy } = require("../Schemas/Community/communitySchemas");
const { getBirthdayProfile, setBirthdayProfile, clearBirthdayProfile } = require("../Services/Community/profileStore");
const { inferBirthYearFromAge, getRomeDateParts } = require("../Services/Community/birthdayService");
const { resolveCustomRoleState, buildExpiryText } = require("../Utils/Community/customRoleState");
const {
  MAX_REACTIONS,
  memberHasCustomReactionRoleAccess,
  parseReactionTokens,
  toDisplay,
  buildCustomReactionPanelRows,
} = require("../Utils/Community/mentionReactionPanelUtils");
const { getNoDmPreferences, setNoDmCategories, DM_CATEGORIES, DM_CATEGORY_ALL, DM_CATEGORY_LABELS } = require("../Utils/noDmList");
const IDs = require("../Utils/Config/ids");
const PANEL_PREFIX = "profile_panel";
const SECTION_HOME = "home";
const SECTION_BIRTHDAY = "birthday";
const SECTION_CUSTOMROLE = "customrole";
const SECTION_CUSTOMVOC = "customvoc";
const SECTION_CUSTOMREACTION = "customreaction";
const SECTION_DMFILTERS = "dmfilters";
const SECTION_PRIVACY = "privacy";
const PRIVATE_FLAG = 1 << 6;
const birthdayDrafts = new Map();
const ANCHOR_ROLE_ID = IDs?.roles?.separatore4 || "1469452890761596981";
const CUSTOM_VOICE_CATEGORY_ID = IDs?.categories?.categoryPrivate || "1442569078379118755";
const MEMBER_ROLE_ID = IDs?.roles?.Member || null;
const CUSTOM_ROLE_VOC_ROLE_IDS = [
  IDs?.roles?.VIP,
  IDs?.roles?.ServerBooster,
  IDs?.roles?.Level50,
].filter(Boolean);
function parseBirthdayDate(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  const dim = month === 2 ? 29 : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  if (day < 1 || day > dim) return null;
  return { day, month };
}

function parseAge(rawValue) {
  const n = Number(String(rawValue || "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 120) return null;
  return n;
}

function computeAgeNow(day, month, birthYear) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(birthYear)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (birthYear < 1900) return null;
  const today = getRomeDateParts(new Date());
  if (birthYear > today.year) return null;
  const hasBirthdayPassed = today.month > month || (today.month === month && today.day >= day);
  return Math.max(1, today.year - Number(birthYear) - (hasBirthdayPassed ? 0 : 1));
}

function getDraftKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function getBirthdayDraft(guildId, userId) {
  return birthdayDrafts.get(getDraftKey(guildId, userId)) || null;
}

function setBirthdayDraft(guildId, userId, patch) {
  const key = getDraftKey(guildId, userId);
  birthdayDrafts.set(key, { ...(birthdayDrafts.get(key) || {}), ...(patch || {}) });
}

function clearBirthdayDraft(guildId, userId) {
  birthdayDrafts.delete(getDraftKey(guildId, userId));
}

function trimRoleName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  const base = clean || "Custom Role";
  const prefixed = base.startsWith("༄") ? base : `༄ ${base}`;
  return prefixed.slice(0, 32).trim();
}

function sanitizeVoiceBaseName(name) {
  const clean = String(name || "")
    .replace(/[^\p{L}\p{N}_ ',.!?\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "privata";
}

function buildCustomVocName(emoji, baseName) {
  const safeEmoji = String(emoji || "🎧").trim() || "🎧";
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `༄${safeEmoji}︲`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

function formatBirthday(profile) {
  const day = Number(profile?.day || 0);
  const month = Number(profile?.month || 0);
  if (!day || !month) return "Non impostato";
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}/${mm}`;
}

function formatBirthdayWithOptionalYear(profile) {
  const day = Number(profile?.day || 0);
  const month = Number(profile?.month || 0);
  if (!day || !month) return "Non impostato";
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const canShowYear = profile?.showAge !== false && Number.isInteger(profile?.birthYear);
  return canShowYear ? `${dd}/${mm}/${profile.birthYear}` : `${dd}/${mm}`;
}

function renderReactionToken(token, guild) {
  const raw = String(token || "");
  if (raw.startsWith("custom:")) {
    const id = raw.slice("custom:".length);
    const emoji = guild?.emojis?.cache?.get?.(id) || null;
    if (emoji?.id) {
      return `<${emoji.animated ? "a" : ""}:${emoji.name || "emoji"}:${emoji.id}>`;
    }
  }
  return toDisplay(token);
}

async function safeUpdatePanelInteraction(interaction, payload) {
  const updated = await interaction.update(payload).then(() => true).catch(() => false);
  if (updated) return true;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => { });
  }
  if (interaction.message?.edit) {
    await interaction.message.edit(payload).catch(() => { });
  }
  return true;
}

function parsePanelCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, kind, ownerId, ...rest] = parts;
  if (prefix !== PANEL_PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  return { kind, ownerId, rest };
}

async function fetchProfilePanelState(guild, userId, client) {
  const guildId = guild?.id;
  const [birthday, reactionDoc, customState, noDmPrefs, avatarPrivacy, bannerPrivacy, quotePrivacy, member] = await Promise.all([
    getBirthdayProfile(guildId, userId),
    MentionReaction.findOne({ guildId, userId }).lean().catch(() => null),
    resolveCustomRoleState({ guild, userId, client, cleanupExpired: false }),
    getNoDmPreferences(guildId, userId).catch(() => ({ blockAll: false, disabled: new Set() })),
    AvatarPrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    BannerPrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    QuotePrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    guild?.members?.fetch?.(userId).catch(() => guild?.members?.cache?.get?.(userId) || null),
  ]);
  const hasCustomRoleVocAccess = Boolean(
    member?.roles?.cache && CUSTOM_ROLE_VOC_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId)),
  );
  const hasCustomReactionAccess = memberHasCustomReactionRoleAccess(member);

  return {
    birthday: birthday || null,
    reactions: Array.isArray(reactionDoc?.reactions) ? reactionDoc.reactions : [],
    custom: customState || null,
    noDm: noDmPrefs || { blockAll: false, disabled: new Set() },
    privacy: {
      avatar: Boolean(avatarPrivacy?.blocked),
      banner: Boolean(bannerPrivacy?.blocked),
      quotes: Boolean(quotePrivacy?.blocked),
    },
    featureAccess: {
      customRoleVoc: hasCustomRoleVocAccess,
      customReaction: hasCustomReactionAccess,
    },
  };
}

function buildSectionEmbed(section, state, user, guild = null) {
  const base = new EmbedBuilder().setColor("#6f4e37");
  if (user && typeof user === "object" && typeof user.displayAvatarURL === "function") {
    base.setThumbnail(user.displayAvatarURL({ size: 256 }));
  }
  const birthday = state?.birthday || {};
  const hasBirthday = Boolean(Number(birthday?.day) && Number(birthday?.month));
  const custom = state?.custom || {};
  const customDoc = custom?.doc || null;
  const customStatusRaw = String(custom?.status || "none");
  const customRoleStatus = customStatusRaw === "active"
    ? "Attivo"
    : customStatusRaw === "expired"
      ? "Scaduto"
      : customStatusRaw === "missing_role"
        ? "Ruolo mancante"
        : "Nessun ruolo";
  const customRoleName = custom?.role?.name ? `**${custom.role.name}**` : "Nessun ruolo attivo";
  const customRoleMention = custom?.role?.id ? `<@&${custom.role.id}>` : "Non impostato";
  const customRoleExpiry = customDoc ? buildExpiryText(customDoc) : "—";
  const customVocLinked = customDoc?.customVocChannelId ? `<#${customDoc.customVocChannelId}>` : "Nessuna vocale";
  const customVocEmoji = String(customDoc?.customVocEmoji || "").trim() || "Non impostata";
  const reactionList = Array.isArray(state?.reactions) ? state.reactions : [];
  const reactionsText = reactionList.length ? reactionList.map((token) => renderReactionToken(token, guild)).join(" ") : "Non impostate";
  const birthdayPrivacy = birthday?.showAge === false ? "Nascosta" : "Visibile";
  const noDm = state?.noDm || { blockAll: false, disabled: new Set() };
  const disabledDmSet = noDm?.disabled instanceof Set ? noDm.disabled : new Set(Array.isArray(noDm?.disabled) ? noDm.disabled : []);
  const noDmSummary = noDm?.blockAll
    ? "Tutti disattivati"
    : disabledDmSet.size === 0
      ? "Tutti attivi"
      : `${disabledDmSet.size} categoria/e disattivate`;
  const privacy = state?.privacy || { avatar: false, banner: false, quotes: false };
  const privacySummary = [privacy.avatar ? "Avatar: Nascosto" : "Avatar: Visibile", privacy.banner ? "Banner: Nascosto" : "Banner: Visibile", privacy.quotes ? "Quote: Bloccate" : "Quote: Attive"].join("-");
  const profileDisplayName = user && typeof user === "object"
    ? String(user.globalName || user.username || user.tag || "").trim() || "Utente"
    : "Utente";

  if (section === SECTION_BIRTHDAY) {
    const ageNow = computeAgeNow(Number(birthday?.day || 0), Number(birthday?.month || 0), Number(birthday?.birthYear || 0));
    return base
      .setDescription([
        "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
        "",
        `<a:VC_Calendar:1482706208149475358> Data: **${formatBirthday(birthday)}**`,
        `<:VC_addperson:1485419347068588073> Età: **${Number.isInteger(ageNow) ? `${ageNow} anni` : "Non impostata"}**`,
        `<:VC_Lock:1482526739044368476> Privacy età: **${birthdayPrivacy}**`,
        "",
        hasBirthday
          ? "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire."
          : "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMROLE) {
    return base
      .setDescription([
        "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
        "",
        `<:VC_emoji:1485419161168511036> Stato: **${customRoleStatus}**`,
        `<:VC_Color:1482532543273238569> Ruolo: ${customRoleName}`,
        `<a:VC_Calendar:1482706208149475358> Scadenza: **${customRoleExpiry}**`,
        "",
        "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMVOC) {
    return base
      .setDescription([
        "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
        "",
        `<:VC_emoji:1485419161168511036> Stato: **${customRoleStatus}**`,
        `<:VC_Color:1482532543273238569> Vocale: ${customVocLinked}`,
        `<a:VC_Calendar:1482706208149475358> Scadenza: **${customRoleExpiry}**`,
        "",
        "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMREACTION) {
    return base
      .setDescription([
        "<:VC_Info:1482526956703580372> **Configurazione attuale**",
        "",
        reactionList.length
          ? `<:VC_emoji:1485419161168511036> Attive (${reactionList.length}/${MAX_REACTIONS}): ${reactionList.map((token) => renderReactionToken(token, guild)).join(" ")}`
          : "<:VC_emoji:1485419161168511036> Nessuna reaction attiva.",
        "",
        "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
      ].join("\n"));
  }

  if (section === SECTION_DMFILTERS) {
    const isAll = Boolean(noDm?.blockAll || disabledDmSet.has(DM_CATEGORY_ALL));
    const lines = DM_CATEGORIES.map((key) => {
      const off = isAll || disabledDmSet.has(key);
      return `<:VC_Dot:1482532364222595303> **${DM_CATEGORY_LABELS[key]}**: ${off ? "<:VC_OfflineStatus:1482527117051957380> Disattivato" : "<:VC_OnlineStatus:1482527088912240650> Attivo"}`;
    });
    return base.setDescription([
      "<:VC_PinkQuestionMark:1471892611026391306> Configura le tue **preferenze DM**. Clicca un pulsante per attivare/disattivare una categoria.",
      "",
      ...lines,
      "",
      isAll
        ? "<:VC_Attention:1482534443632558151> **Tutti i DM sono attualmente disattivati.** Clicca una categoria per ricevere solo quella, o **Attiva tutto**."
        : "<a:VC_Alert:1482706673176150077> Usa **Disattiva tutto** per bloccare tutti i DM, o **Attiva tutto** per riceverli tutti.",
    ].join("\n"));
  }

  if (section === SECTION_PRIVACY) {
    const privacyLines = [
      `<:VC_Dot:1482532364222595303> **Avatar**: ${privacy.avatar ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
      `<:VC_Dot:1482532364222595303> **Banner**: ${privacy.banner ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
      `<:VC_Dot:1482532364222595303> **Quote**: ${privacy.quotes ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
    ];
    return base.setDescription([
      "<:VC_PinkQuestionMark:1471892611026391306> Gestisci **privacy** di avatar, banner e quote in questo server.",
      "",
      ...privacyLines,
      "",
      "<a:VC_Alert:1482706673176150077> Clicca una categoria per alternare solo quella. Usa **Disattiva tutto** per bloccare tutti, o **Attiva tutto** per sbloccarli tutti.",
    ].join("\n"));
  }

  return base
    .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${profileDisplayName}.`)
    .setDescription([
      "<:VC_EXP:1482534670896730143> Qui trovi una mini guida per configurare il tuo profilo e le funzioni principali del bot.",
      "",
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<a:VC_Events:1482706144953897223> Birthday: **${formatBirthdayWithOptionalYear(birthday)}**`,
      `<a:VC_CheckDMs:1482724593448784123> Notifiche DM: **${noDmSummary}**`,
      `<:VC_Lock:1482526739044368476> Privacy: **${privacySummary}**`,
      `<:VC_Color:1482532543273238569> Custom Role: ${customRoleMention}`,
      `<:VC_Modifica:1478859646587633717> Vocale Privata: ${customVocLinked}`,
      `<:VC_emoji:1485419161168511036> Custom Reactions: ${reactionsText}`,
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    ].join("\n"))
}

function buildRows(ownerId, section, state = null) {
  const canAccessCustomRoleVoc = Boolean(state?.featureAccess?.customRoleVoc);
  const canAccessCustomReaction = Boolean(state?.featureAccess?.customReaction);
  const selectOptions = [
    { label: "Home", value: SECTION_HOME, emoji: "<:VC_addperson:1485419347068588073>", default: section === SECTION_HOME },
    { label: "Birthday", value: SECTION_BIRTHDAY, emoji: "<a:VC_Events:1482706144953897223>", default: section === SECTION_BIRTHDAY },
    { label: "Notifiche DM", value: SECTION_DMFILTERS, emoji: "<a:VC_Ping:1482694298687246377>", default: section === SECTION_DMFILTERS },
    { label: "Privacy", value: SECTION_PRIVACY, emoji: "<:VC_Lock:1482526739044368476>", default: section === SECTION_PRIVACY },
  ];
  if (canAccessCustomRoleVoc) {
    selectOptions.push(
      { label: "Custom Role", value: SECTION_CUSTOMROLE, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMROLE },
      { label: "Custom Voc", value: SECTION_CUSTOMVOC, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMVOC },
    );
  }
  if (canAccessCustomReaction) {
    selectOptions.push(
      { label: "Custom Reaction", value: SECTION_CUSTOMREACTION, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMREACTION },
    );
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PANEL_PREFIX}:select:${ownerId}`)
    .setPlaceholder("Scegli una sezione")
    .addOptions(...selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder();
  const roleId = String(state?.custom?.role?.id || "").trim();
  const customVocChannelId = String(state?.custom?.doc?.customVocChannelId || "").trim();

  if (section === SECTION_BIRTHDAY) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_date`).setLabel("Data").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_age`).setLabel("Età").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_privacy`).setLabel(state?.birthday?.showAge === false ? "Età nascosta" : "Età visibile").setStyle(state?.birthday?.showAge === false ? ButtonStyle.Danger : ButtonStyle.Success),
    );
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_save`).setLabel("Salva profilo").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_clear`).setLabel("Rimuovi profilo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_cancel`).setLabel("Chiudi").setStyle(ButtonStyle.Secondary),
    );
    return [row1, row2, row3];
  } else if (section === SECTION_CUSTOMROLE) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`customrole_name:${ownerId}:${roleId || "0"}`).setLabel("Modifica Nome").setEmoji("<:VC_Modifica:1478859646587633717>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_color:${ownerId}:${roleId || "0"}`).setLabel("Modifica Colore").setEmoji("<:VC_Color:1482532543273238569>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_emoji:${ownerId}:${roleId || "0"}`).setLabel("Modifica Icona").setEmoji("<:VC_emoji:1485419161168511036>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
    );
    if (!roleId) {
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customrole_create`).setLabel("Crea Ruolo").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      );
      return [row1, row2, row3];
    }
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`customrole_members:${ownerId}:${roleId}`).setLabel("Aggiungi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`customrole_members_remove:${ownerId}:${roleId}`).setLabel("Rimuovi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`customrole_delete:${ownerId}:${roleId}`).setLabel("Elimina Ruolo").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger),
    );
    return [row1, row2, row3];
  } else if (section === SECTION_CUSTOMVOC) {
    if (!customVocChannelId) {
      row2.addComponents(
        new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customvoc_create`).setLabel("Crea Vocale").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      );
      return [row1, row2];
    }
    row2.addComponents(
      new ButtonBuilder().setCustomId(`customvoc_name:${ownerId}:${customVocChannelId}`).setLabel("Modifica Nome").setEmoji("<:VC_Modifica:1478859646587633717>").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`customvoc_emoji:${ownerId}:${customVocChannelId}`).setLabel("Modifica Emoji").setEmoji("<:VC_emoji:1485419161168511036>").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customvoc_delete`).setLabel("Elimina Vocale").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger),
    );
    return [row1, row2];
  } else if (section === SECTION_CUSTOMREACTION) {
    return [row1, ...buildCustomReactionPanelRows(ownerId)];
  } else if (section === SECTION_DMFILTERS) {
    const noDm = state?.noDm || { blockAll: false, disabled: new Set() };
    const isAll = Boolean(noDm?.blockAll || noDm?.disabled?.has?.(DM_CATEGORY_ALL));
    const dmButtons = DM_CATEGORIES.map((key) => {
      const off = isAll || noDm?.disabled?.has?.(key);
      return new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_toggle_${key}`)
        .setLabel(String(DM_CATEGORY_LABELS[key] || key).slice(0, 80))
        .setStyle(off ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(off ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>");
    });
    const row2 = new ActionRowBuilder().addComponents(...dmButtons);
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_all`).setLabel("Disattiva tutto").setStyle(isAll ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji("<:cancel:1461730653677551691>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_none`).setLabel("Attiva tutto").setStyle(!isAll && noDm?.disabled?.size === 0 ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_done`).setLabel("Fine").setStyle(ButtonStyle.Primary).setEmoji("<:vegacheckmark:1443666279058772028>"),
    );
    return [row1, row2, row3];
  } else if (section === SECTION_PRIVACY) {
    const privacy = state?.privacy || { avatar: false, banner: false, quotes: false };
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_avatar`).setLabel("Avatar").setStyle(privacy.avatar ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.avatar ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_banner`).setLabel("Banner").setStyle(privacy.banner ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.banner ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_quotes`).setLabel("Quote").setStyle(privacy.quotes ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.quotes ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
    );
    const allBlocked = privacy.avatar && privacy.banner && privacy.quotes;
    const allVisible = !privacy.avatar && !privacy.banner && !privacy.quotes;
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_all`).setLabel("Blocca tutto").setStyle(allBlocked ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji("<:cancel:1461730653677551691>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_none`).setLabel("Sblocca tutto").setStyle(allVisible ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_done`).setLabel("Fine").setStyle(ButtonStyle.Primary).setEmoji("<:vegacheckmark:1443666279058772028>"),
    );
    return [row1, row2, row3];
  } else {
    return [row1];
  }

  return [row1, row2];
}

async function buildPanelPayload(guild, ownerId, client, section = SECTION_HOME) {
  const state = await fetchProfilePanelState(guild, ownerId, client);
  const canAccessCustomRoleVoc = Boolean(state?.featureAccess?.customRoleVoc);
  const canAccessCustomReaction = Boolean(state?.featureAccess?.customReaction);
  const requestedSection = String(section || SECTION_HOME);
  const isDeniedCustomRoleVoc = !canAccessCustomRoleVoc
    && (requestedSection === SECTION_CUSTOMROLE || requestedSection === SECTION_CUSTOMVOC);
  const isDeniedCustomReaction = !canAccessCustomReaction && requestedSection === SECTION_CUSTOMREACTION;
  const safeSection = (isDeniedCustomRoleVoc || isDeniedCustomReaction)
    ? SECTION_HOME
    : requestedSection;
  const draft = getBirthdayDraft(guild?.id, ownerId);
  if (draft) {
    state.birthday = {
      ...(state.birthday || {}),
      ...(Number.isInteger(draft?.day) ? { day: draft.day } : {}),
      ...(Number.isInteger(draft?.month) ? { month: draft.month } : {}),
      ...(Number.isInteger(draft?.birthYear) ? { birthYear: draft.birthYear } : {}),
      ...(typeof draft?.showAge === "boolean" ? { showAge: draft.showAge } : {}),
    };
  }
  let panelUser = await client.users.fetch(ownerId).catch(() => null);
  if (!panelUser && guild) {
    const member = await guild.members.fetch(ownerId).catch(() => null);
    panelUser = member?.user ?? null;
  }
  return {
    embeds: [buildSectionEmbed(safeSection, state, panelUser, guild)],
    components: buildRows(ownerId, safeSection, state),
  };
}

async function ensureOwner(interaction, ownerId) {
  if (String(interaction?.user?.id || "") === String(ownerId)) return true;
  await interaction.reply({
    content: "<:vegax:1443934876440068179> Questo pannello non è tuo.",
    flags: PRIVATE_FLAG,
  }).catch(() => { });
  return false;
}

async function ensureCustomReactionEnabled(interaction, ownerId, client) {
  const guild = interaction.guild;
  const member =
    interaction.member ||
    (guild && typeof guild.members?.fetch === "function"
      ? await guild.members.fetch(ownerId).catch(() => null)
      : null);
  if (memberHasCustomReactionRoleAccess(member)) return true;

  const state = await resolveCustomRoleState({
    guild,
    userId: ownerId,
    client,
    cleanupExpired: true,
  }).catch(() => null);
  const status = String(state?.status || "none");
  if (status === "active") return true;
  await interaction.reply({
    content:
      "<:VC_Attention:1482534443632558151> Serve VIP, Booster o Level 70 (come da profilo), oppure un custom role attivo. Usa `+profile`.",
    flags: PRIVATE_FLAG,
  }).catch(() => { });
  return false;
}

async function ensureCustomRoleExists(interaction, ownerId, client) {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return { ok: false, reason: "server_missing" };

  const state = await resolveCustomRoleState({
    guild,
    userId: ownerId,
    client,
    cleanupExpired: true,
  }).catch(() => null);

  if (state?.status === "active" && state?.role) {
    return { ok: true, role: state.role, doc: state.doc || null };
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  const roleName = trimRoleName(member?.displayName || interaction.user?.username || "Custom Role");
  const createdRole = await guild.roles.create({
    name: roleName,
    colors: { primaryColor: "#f4b6d7" },
    reason: `Custom role per ${interaction.user?.tag || ownerId}`,
  }).catch(() => null);
  if (!createdRole) return { ok: false, reason: "create_failed" };

  const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
  if (anchor?.position) {
    const customRoleDocs = await CustomRole.find({ guildId: guild.id })
      .select("roleId")
      .lean()
      .catch(() => []);
    const existingCustomPositions = (Array.isArray(customRoleDocs) ? customRoleDocs : [])
      .map((doc) => String(doc?.roleId || ""))
      .filter((id) => id && id !== createdRole.id)
      .map((id) => guild.roles.cache.get(id) || null)
      .filter((role) => role && Number(role.position) > 0 && Number(role.position) < Number(anchor.position))
      .map((role) => Number(role.position));
    const targetPosition = existingCustomPositions.length
      ? Math.max(1, Math.min(...existingCustomPositions) - 1)
      : Math.max(1, Number(anchor.position) - 1);
    if (createdRole.position !== targetPosition) {
      await createdRole.setPosition(targetPosition).catch(() => { });
    }
  }

  await member.roles.add(createdRole.id).catch(() => { });

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    { $set: { guildId: guild.id, userId: ownerId, roleId: createdRole.id, expiresAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return { ok: true, role: createdRole, doc };
}

async function ensureCustomVocExists(interaction, ownerId, client) {
  const roleState = await ensureCustomRoleExists(interaction, ownerId, client);
  if (!roleState.ok) return { ok: false, reason: roleState.reason || "custom_role_missing" };
  const guild = interaction.guild;
  const role = roleState.role;
  const me = guild?.members?.me || guild?.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { ok: false, reason: "no_manage_channels" };
  }

  const latestDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null);
  const existingChannelId = String(latestDoc?.customVocChannelId || "").trim();
  if (existingChannelId) {
    const existing = guild.channels?.cache?.get?.(existingChannelId) || (await guild.channels?.fetch?.(existingChannelId).catch(() => null));
    if (existing) return { ok: true, channel: existing, role, doc: latestDoc };
  }

  const category = guild.channels?.cache?.get?.(CUSTOM_VOICE_CATEGORY_ID) || (await guild.channels?.fetch?.(CUSTOM_VOICE_CATEGORY_ID).catch(() => null));
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: "category_missing" };
  }

  const channelName = buildCustomVocName(
    latestDoc?.customVocEmoji || role?.unicodeEmoji || "🎧",
    interaction.member?.displayName || interaction.user?.username || "privata",
  );

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: CUSTOM_VOICE_CATEGORY_ID,
    reason: `Canale vocale privato per ${interaction.user?.tag || ownerId}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.UseVAD,
          PermissionsBitField.Flags.Stream,
        ],
      },
      ...(MEMBER_ROLE_ID ? [{ id: MEMBER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.Connect] }] : []),
      {
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.UseVAD,
          PermissionsBitField.Flags.Stream,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.MoveMembers,
        ],
      },
    ],
  }).catch(() => null);
  if (!channel) return { ok: false, reason: "channel_create_failed" };

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    { $set: { customVocChannelId: channel.id } },
    { new: true },
  ).catch(() => latestDoc || null);

  return { ok: true, channel, role, doc };
}

async function handleBirthdaySetModal(interaction, ownerId) {
  const dateRaw = interaction.fields.getTextInputValue("date");
  const ageRaw = interaction.fields.getTextInputValue("age");
  const parsedDate = parseBirthdayDate(dateRaw);
  const age = parseAge(ageRaw);
  if (!parsedDate || !age) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Dati non validi. Usa `gg/mm` e un'età 1-120.",
      flags: PRIVATE_FLAG,
    }).catch(() => { });
    return true;
  }

  const birthYear = inferBirthYearFromAge(parsedDate.day, parsedDate.month, age);
  await setBirthdayProfile(interaction.guild.id, ownerId, {
    day: parsedDate.day,
    month: parsedDate.month,
    birthYear,
    showAge: true,
  }).catch(() => { });

  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_BIRTHDAY);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => { });
  await interaction.reply({
    content: "<:vegacheckmark:1443666279058772028> Birthday aggiornato.",
    flags: PRIVATE_FLAG,
  }).catch(() => { });
  return true;
}

async function handleBirthdayDateModal(interaction, ownerId) {
  const raw = interaction.fields.getTextInputValue("date");
  const parsed = parseBirthdayDate(raw);
  if (!parsed) {
    await interaction.reply({ content: "Data non valida. Usa `gg/mm`.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  setBirthdayDraft(interaction.guild.id, ownerId, { day: parsed.day, month: parsed.month });
  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_BIRTHDAY);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => { });
  await interaction.reply({ content: "Data aggiornata in bozza.", flags: PRIVATE_FLAG }).catch(() => { });
  return true;
}

async function handleBirthdayAgeModal(interaction, ownerId) {
  const age = parseAge(interaction.fields.getTextInputValue("age"));
  if (!age) {
    await interaction.reply({ content: "Età non valida. Inserisci un numero 1-120.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  const draft = getBirthdayDraft(interaction.guild.id, ownerId) || {};
  const profile = await getBirthdayProfile(interaction.guild.id, ownerId).catch(() => null);
  const day = Number.isInteger(draft?.day) ? draft.day : Number(profile?.day || 0);
  const month = Number.isInteger(draft?.month) ? draft.month : Number(profile?.month || 0);
  if (!day || !month) {
    await interaction.reply({ content: "Prima imposta la data.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }
  const birthYear = inferBirthYearFromAge(day, month, age);
  setBirthdayDraft(interaction.guild.id, ownerId, { birthYear });
  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_BIRTHDAY);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => { });
  await interaction.reply({ content: "Età aggiornata in bozza.", flags: PRIVATE_FLAG }).catch(() => { });
  return true;
}

async function handleReactionSetModal(interaction, ownerId) {
  const allowed = await ensureCustomReactionEnabled(interaction, ownerId, interaction.client);
  if (!allowed) return true;
  await interaction.guild?.emojis?.fetch?.().catch(() => { });
  const raw = interaction.fields.getTextInputValue("reactions");
  const tokens = parseReactionTokens(raw, MAX_REACTIONS, interaction.guild);
  if (!tokens.length) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Nessuna reaction valida trovata.",
      flags: PRIVATE_FLAG,
    }).catch(() => { });
    return true;
  }

  await MentionReaction.findOneAndUpdate(
    { guildId: interaction.guild.id, userId: ownerId },
    { $set: { reactions: tokens } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });

  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_CUSTOMREACTION);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => { });
  await interaction.reply({
    content: `<:vegacheckmark:1443666279058772028> Reactions salvate: ${tokens.map((token) => renderReactionToken(token, interaction.guild)).join(" ")}`,
    flags: PRIVATE_FLAG,
  }).catch(() => { });
  return true;
}

function match(interaction) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PANEL_PREFIX}:`);
}

async function execute(interaction, client) {
  const parsed = parsePanelCustomId(interaction.customId);
  if (!parsed) return false;
  const { kind, ownerId, rest } = parsed;

  if (!(await ensureOwner(interaction, ownerId))) return true;

  if (interaction.isStringSelectMenu() && kind === "select") {
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildPanelPayload(interaction.guild, ownerId, client, section);
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

  if (interaction.isButton() && kind === "action") {
    const action = String(rest?.[0] || "");
    if (action === "refresh") {
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_HOME);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "birthday_set") {
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_birthday:${ownerId}:${SECTION_BIRTHDAY}`)
        .setTitle("Imposta Birthday");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("date")
            .setLabel("Data (gg/mm)")
            .setPlaceholder("21/02")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("age")
            .setLabel("Età")
            .setPlaceholder("18")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => { });
      return true;
    }

    if (action === "birthday_date") {
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_birthday_date:${ownerId}:${SECTION_BIRTHDAY}`)
        .setTitle("Imposta data compleanno");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("date")
            .setLabel("Data (gg/mm)")
            .setPlaceholder("21/02")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => { });
      return true;
    }

    if (action === "birthday_age") {
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_birthday_age:${ownerId}:${SECTION_BIRTHDAY}`)
        .setTitle("Imposta età");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("age")
            .setLabel("Età attuale")
            .setPlaceholder("18")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => { });
      return true;
    }

    if (action === "birthday_privacy") {
      const draft = getBirthdayDraft(interaction.guild.id, ownerId) || {};
      const profile = await getBirthdayProfile(interaction.guild.id, ownerId).catch(() => null);
      const showAge = typeof draft?.showAge === "boolean" ? draft.showAge : profile?.showAge !== false;
      setBirthdayDraft(interaction.guild.id, ownerId, { showAge: !showAge });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "birthday_save") {
      const draft = getBirthdayDraft(interaction.guild.id, ownerId) || {};
      const profile = await getBirthdayProfile(interaction.guild.id, ownerId).catch(() => null);
      const day = Number.isInteger(draft?.day) ? draft.day : Number(profile?.day || 0);
      const month = Number.isInteger(draft?.month) ? draft.month : Number(profile?.month || 0);
      const birthYear = Number.isInteger(draft?.birthYear) ? draft.birthYear : Number(profile?.birthYear || 0);
      const showAge = typeof draft?.showAge === "boolean" ? draft.showAge : profile?.showAge !== false;
      if (!day || !month) {
        await interaction.reply({ content: "Prima imposta la data.", flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      if (!birthYear) {
        await interaction.reply({ content: "Prima imposta l'età.", flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      await setBirthdayProfile(interaction.guild.id, ownerId, {
        day,
        month,
        birthYear,
        showAge,
        registrationMessageId: profile?.registrationMessageId,
        registrationChannelId: profile?.registrationChannelId,
      }).catch(() => { });
      clearBirthdayDraft(interaction.guild.id, ownerId);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await safeUpdatePanelInteraction(interaction, payload);
      await interaction.followUp?.({ content: "Profilo compleanno salvato.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "birthday_clear") {
      await clearBirthdayProfile(interaction.guild.id, ownerId).catch(() => { });
      clearBirthdayDraft(interaction.guild.id, ownerId);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "birthday_cancel") {
      clearBirthdayDraft(interaction.guild.id, ownerId);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_HOME);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action.startsWith("dm_toggle_")) {
      const category = action.slice("dm_toggle_".length);
      if (!DM_CATEGORIES.includes(category)) return true;
      const prefs = await getNoDmPreferences(interaction.guild.id, ownerId).catch(() => ({ blockAll: false, disabled: new Set() }));
      const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
      let next;
      if (isAll) {
        next = DM_CATEGORIES.filter((k) => k !== category);
      } else {
        const disabled = new Set(prefs.disabled);
        if (disabled.has(category)) disabled.delete(category);
        else disabled.add(category);
        next = [...disabled];
      }
      await setNoDmCategories(interaction.guild.id, ownerId, next.length ? next : []).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_DMFILTERS);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "dm_all") {
      await setNoDmCategories(interaction.guild.id, ownerId, [DM_CATEGORY_ALL]).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_DMFILTERS);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "dm_none") {
      await setNoDmCategories(interaction.guild.id, ownerId, []).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_DMFILTERS);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "dm_done") {
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_HOME);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action.startsWith("privacy_toggle_")) {
      const kind = action.slice("privacy_toggle_".length);
      const model = kind === "avatar" ? AvatarPrivacy : kind === "banner" ? BannerPrivacy : kind === "quotes" ? QuotePrivacy : null;
      if (!model) return true;
      const current = await model.findOne({ guildId: interaction.guild.id, userId: ownerId }).lean().catch(() => null);
      const nextBlocked = !Boolean(current?.blocked);
      await model.findOneAndUpdate(
        { guildId: interaction.guild.id, userId: ownerId },
        { $set: { blocked: nextBlocked }, $setOnInsert: { guildId: interaction.guild.id, userId: ownerId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_PRIVACY);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "privacy_all" || action === "privacy_none") {
      const blocked = action === "privacy_all";
      await Promise.all([
        AvatarPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: ownerId },
          { $set: { blocked }, $setOnInsert: { guildId: interaction.guild.id, userId: ownerId } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => { }),
        BannerPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: ownerId },
          { $set: { blocked }, $setOnInsert: { guildId: interaction.guild.id, userId: ownerId } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => { }),
        QuotePrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: ownerId },
          { $set: { blocked }, $setOnInsert: { guildId: interaction.guild.id, userId: ownerId } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => { }),
      ]);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_PRIVACY);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "privacy_done") {
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_HOME);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "customrole_create") {
      const result = await ensureCustomRoleExists(interaction, ownerId, client);
      if (!result.ok) {
        const reason = result.reason === "no_manage_roles"
          ? "Mi serve `Gestisci Ruoli` per creare il custom role."
          : "Non sono riuscito a creare il custom role.";
        await interaction.reply({ content: `<:vegax:1443934876440068179> ${reason}`, flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMROLE);
      await safeUpdatePanelInteraction(interaction, payload);
      await interaction.followUp?.({ content: "<:vegacheckmark:1443666279058772028> Custom role creato.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "customvoc_create") {
      const result = await ensureCustomVocExists(interaction, ownerId, client);
      if (!result.ok) {
        let reason = "Non sono riuscito a creare la vocale privata.";
        if (result.reason === "no_manage_channels") reason = "Mi serve `Gestisci Canali` per creare la vocale.";
        if (result.reason === "category_missing") reason = "Categoria delle vocali private non trovata.";
        if (result.reason === "no_manage_roles") reason = "Mi serve `Gestisci Ruoli` per creare il custom role richiesto.";
        await interaction.reply({ content: `<:vegax:1443934876440068179> ${reason}`, flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMVOC);
      await safeUpdatePanelInteraction(interaction, payload);
      await interaction.followUp?.({ content: "<:vegacheckmark:1443666279058772028> Vocale privata creata.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "customvoc_delete") {
      const state = await resolveCustomRoleState({
        guild: interaction.guild,
        userId: ownerId,
        client,
        cleanupExpired: true,
      }).catch(() => null);
      const channelId = String(state?.doc?.customVocChannelId || "").trim();
      if (!channelId) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Non hai una vocale privata da eliminare.",
          flags: PRIVATE_FLAG,
        }).catch(() => { });
        return true;
      }
      const channel = interaction.guild?.channels?.cache?.get(channelId) || (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
      if (channel?.delete) {
        await channel.delete(`Custom voice deleted by ${interaction.user?.tag || interaction.user?.id || "profile panel"}`).catch(() => { });
      }
      await CustomRole.updateOne(
        { guildId: interaction.guild.id, userId: ownerId },
        { $unset: { customVocChannelId: 1 } },
      ).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMVOC);
      await safeUpdatePanelInteraction(interaction, payload);
      await interaction.followUp?.({
        content: "<:vegacheckmark:1443666279058772028> Vocale privata eliminata.",
        flags: PRIVATE_FLAG,
      }).catch(() => { });
      return true;
    }

    if (action === "reaction_set") {
      const allowed = await ensureCustomReactionEnabled(interaction, ownerId, client);
      if (!allowed) return true;
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_reactions:${ownerId}:${SECTION_CUSTOMREACTION}`)
        .setTitle("Imposta Reactions");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reactions")
            .setLabel("Emoji (max 3)")
            .setPlaceholder("🐼 🔥 <:emoji:123>")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => { });
      return true;
    }

    if (action === "reaction_clear") {
      const allowed = await ensureCustomReactionEnabled(interaction, ownerId, client);
      if (!allowed) return true;
      await MentionReaction.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => { });
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMREACTION);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action === "open_customrole" || action === "open_customvoc" || action === "open_customreaction") {
      const cmd = action === "open_customrole"
        ? "+profile"
        : action === "open_customvoc"
          ? "+profile"
          : "+profile";
      await interaction.reply({
        content: `Usa ${cmd} nel canale comandi per aprire il pannello dedicato.`,
        flags: PRIVATE_FLAG,
      }).catch(() => { });
      return true;
    }
  }

  if (interaction.isModalSubmit() && kind === "modal_birthday") {
    return handleBirthdaySetModal(interaction, ownerId);
  }

  if (interaction.isModalSubmit() && kind === "modal_birthday_date") {
    return handleBirthdayDateModal(interaction, ownerId);
  }

  if (interaction.isModalSubmit() && kind === "modal_birthday_age") {
    return handleBirthdayAgeModal(interaction, ownerId);
  }

  if (interaction.isModalSubmit() && kind === "modal_reactions") {
    return handleReactionSetModal(interaction, ownerId);
  }

  return false;
}

module.exports = {
  name: "profile",
  order: 70,
  match,
  execute,
  buildPanelPayload,
};