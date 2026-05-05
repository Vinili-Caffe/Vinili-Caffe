const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType } = require("discord.js");
const { MentionReaction } = require("../Schemas/Community/autoInteractionSchemas");
const { ActivityUserProfile, CustomRole, AvatarPrivacy, BannerPrivacy, QuotePrivacy } = require("../Schemas/Community/communitySchemas");
const { getBirthdayProfile, setBirthdayProfile, clearBirthdayProfile } = require("../Services/Community/profileStore");
const { applyZodiacRoleFromBirthday, stripAllZodiacRoles } = require("../Utils/Community/zodiacRoles");
const { applyAgeBracketRoleFromBirthday, stripAllAgeBracketRoles } = require("../Utils/Community/ageBracketRoles");
const { inferBirthYearFromAge, getRomeDateParts, tryCelebrateBirthdayAfterProfileSave } = require("../Services/Community/birthdayService");
const { resolveCustomRoleState, buildExpiryText } = require("../Utils/Community/customRoleState");
const { hasExtraCustomPerksUnlock } = require("../Utils/Community/customPerksUnlock");
const { hasEventWeekWinnerGrant } = require("../Services/Community/weekWinnerGrantsService");
const colorUnlocks = require("../Utils/Community/personalityColorUnlocks");
const { MAX_REACTIONS, memberHasCustomReactionRoleAccess, getCustomReactionMax, parseReactionTokens, resolveStoredCustomEmojiFromClient, toDisplay, buildCustomReactionPanelRows } = require("../Utils/Community/mentionReactionPanelUtils");
const { getNoDmPreferences, setNoDmCategories, DM_CATEGORIES, DM_CATEGORY_ALL, DM_CATEGORY_LABELS } = require("../Utils/noDmList");
const IDs = require("../Utils/Config/ids");
const { userAvatarUrlDynamic, guildMemberDisplayAvatarUrlDynamic, accountUsername } = require("../Utils/Discord/guildDiscordIdentity");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest, memberHasCustomRolePanelAccess, memberHasCustomRoleSecondarySlot } = require("../Utils/Community/customRoleSlots");
const { partnerManagerPerkDateActive, fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../Utils/Staff/partnerManagerTimedPerks");
const { findCustomVoiceByRole } = require("../Utils/Interaction/customRoleUtils");
const PANEL_PREFIX = "profile_panel";
const SECTION_HOME = "home";
const SECTION_BIRTHDAY = "birthday";
const SECTION_CUSTOMROLE = "customrole";
const SECTION_CUSTOMROLE_SECONDARY = "customrole_secondary";
const SECTION_CUSTOMVOC = "customvoc";
const SECTION_CUSTOMREACTION = "customreaction";
const SECTION_DMFILTERS = "dmfilters";
const SECTION_PRIVACY = "privacy";
const SECTION_COLORS = "colors";
const CMD_COLORS_SEG = "cmd_colors_seg:";
const CMD_COLORS_BTN = "cmd_colors_btn:";
const PRIVATE_FLAG = 1 << 6;
const birthdayDrafts = new Map();
const ANCHOR_ROLE_ID = IDs?.roles?.separatore4 || "1469452890761596981";
const CUSTOM_VOICE_CATEGORY_ID = IDs?.categories?.categoryPrivate || "1442569078379118755";
const MEMBER_ROLE_ID = IDs?.roles?.Member || null;
const CUSTOM_VOC_CREATE_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"], IDs?.roles?.Level50].filter(Boolean);
const CUSTOM_VOC_MEMBER_ALLOW_FLAGS = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.UseVAD, PermissionsBitField.Flags.Stream];
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

function isDmCategoryOff(noDm, key) {
  const disabled =
    noDm?.disabled instanceof Set
      ? noDm.disabled
      : new Set(Array.isArray(noDm?.disabled) ? noDm.disabled : []);
  const isAll = Boolean(noDm?.blockAll || disabled.has(DM_CATEGORY_ALL));
  return isAll || disabled.has(key);
}

function buildProfileEligibleColorOptions(guild, numericLevel, canPickPlus) {
  const plusIds = colorUnlocks.listUnlockedPlusRoleIds(guild, canPickPlus, numericLevel);
  const tierIds = colorUnlocks
    .listUnlockedTierRoleIds(numericLevel)
    .filter((id) => guild?.roles?.cache?.has?.(id));
  const options = [];
  for (const roleId of plusIds) {
    options.push({
      label: `Plus · ${colorUnlocks.roleLabel(guild, roleId)}`.slice(0, 100),
      value: roleId,
      emoji: "<:VC_Vip:1482534921472835895>",
      description: "Gradiente Plus",
    });
  }
  for (const roleId of tierIds) {
    const tierDef = colorUnlocks.getTierExclusiveColorDefs().find((row) => row.roleId === roleId);
    options.push({
      label: `Lv${tierDef?.minLevel || "?"} · ${colorUnlocks.roleLabel(guild, roleId)}`.slice(0, 100),
      value: roleId,
      emoji: "<:VC_EXP:1482534670896730143>",
      description: `Da livello ${tierDef?.minLevel || "?"}`,
    });
  }
  return options.slice(0, 25);
}

function buildProfileColorsDescription(guild, numericLevel, canPickPlus, eligibleOptions) {
  const level = Math.max(0, Number(numericLevel) || 0);
  const plusIds = colorUnlocks.listUnlockedPlusRoleIds(guild, canPickPlus, level);
  const lines = [
    "### <:VC_Vip:1482534921472835895> Colori Plus",
    canPickPlus
      ? "Sbloccati per te."
      : "Non sbloccati (servono requisiti Plus o livello adeguato).",
  ];
  if (canPickPlus) {
    if (plusIds.length) {
      lines.push(...plusIds.map((roleId) => `· **${colorUnlocks.roleLabel(guild, roleId)}**`));
    } else {
      lines.push("_Nessun colore Plus configurato sul server._");
    }
  }
  lines.push(
    "",
    "### <:VC_EXP:1482534670896730143> Colori esclusivi di livello",
    `Il tuo livello: **${level}**`,
  );
  const tierDefs = [
    ...colorUnlocks
      .getTierExclusiveColorDefs()
      .map((row) => ({ ...row, needsPlus: false })),
    ...colorUnlocks
      .getLevelGatedPlusColorDefs()
      .map((row) => ({ ...row, needsPlus: true })),
  ].filter((row) => guild?.roles?.cache?.has?.(row.roleId));
  if (tierDefs.length) {
    lines.push(
      ...tierDefs.map((row) => {
        const unlocked = level >= row.minLevel && (!row.needsPlus || canPickPlus);
        const roleName = colorUnlocks.roleLabel(guild, row.roleId);
        return `· **${roleName}** — da livello **${row.minLevel}** ${unlocked ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`;
      }),
    );
  } else {
    lines.push("_Nessun colore esclusivo livello configurato._");
  }
  lines.push("", "୨୧ — · · · — ୨୧", "");
  if (eligibleOptions.length) {
    lines.push("Menu attivo: puoi scegliere uno dei colori sbloccati qui sotto.");
  } else {
    lines.push("Non hai ancora colori Plus/Esclusivi selezionabili.");
  }
  return lines.join("\n");
}

async function applyNoDmCategoryToggle(guildId, ownerId, category) {
  if (!DM_CATEGORIES.includes(category)) return false;
  const prefs = await getNoDmPreferences(guildId, ownerId).catch(() => ({ blockAll: false, disabled: new Set() }));
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
  await setNoDmCategories(guildId, ownerId, next.length ? next : []).catch(() => { });
  return true;
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

function memberCanCreateCustomVoc(member) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_VOC_CREATE_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function listVoiceChannelsWithOwnerPrivateAccess(guild, ownerId) {
  const cat = String(CUSTOM_VOICE_CATEGORY_ID || "").trim();
  const uid = String(ownerId || "").trim();
  if (!guild?.channels?.cache || !cat || !/^\d{17,22}$/.test(uid)) return [];
  const ManageChannels = PermissionsBitField.Flags.ManageChannels;
  const Connect = PermissionsBitField.Flags.Connect;
  const list = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (String(ch.parentId || "") !== cat) continue;
    const ow = ch.permissionOverwrites.cache.get(uid);
    if (!ow?.allow) continue;
    if (ow.allow.has(ManageChannels) && ow.allow.has(Connect)) list.push(ch);
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  return list;
}

async function consolidateOwnerCustomVoiceChannels(guild, ownerId, latestDoc, keepChannelIdHint) {
  const uid = String(ownerId || "").trim();
  const guildId = String(guild?.id || "");
  if (!guild || !guildId || !/^\d{17,22}$/.test(uid)) return null;

  const map = new Map();
  for (const ch of listVoiceChannelsWithOwnerPrivateAccess(guild, uid)) {
    map.set(ch.id, ch);
  }
  for (const rid of [latestDoc?.roleId, latestDoc?.secondaryRoleId].filter(Boolean)) {
    const r = String(rid || "").trim();
    if (!r) continue;
    const ch = findCustomVoiceByRole(guild, r);
    if (ch) map.set(ch.id, ch);
  }

  const stored = String(latestDoc?.customVocChannelId || "").trim();
  if (stored && /^\d{17,22}$/.test(stored) && typeof guild.channels?.fetch === "function") {
    let chStored = guild.channels.cache.get(stored) || null;
    if (!chStored) {
      chStored = await guild.channels.fetch(stored).catch(() => null);
    }
    if (chStored?.type === ChannelType.GuildVoice) {
      map.set(chStored.id, chStored);
    }
  }

  const all = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length === 0) return null;

  const hint = String(keepChannelIdHint || "").trim();
  const keep =
    (hint && all.some((c) => c.id === hint) ? all.find((c) => c.id === hint) : null) ||
    (stored && all.some((c) => c.id === stored) ? all.find((c) => c.id === stored) : null) ||
    all[0];

  const me = guild.members?.me || guild.members?.cache?.get?.(guild.client?.user?.id);
  if (me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    for (const ch of all) {
      if (ch.id === keep.id) continue;
      await ch.delete(`Custom voc: massimo 1 per utente (${uid}); mantengo ${keep.id}`).catch(() => { });
    }
  }

  if (String(latestDoc?.customVocChannelId || "") !== keep.id) {
    await CustomRole.findOneAndUpdate(
      { guildId, userId: uid },
      { $set: { customVocChannelId: keep.id } },
    ).catch(() => { });
  }

  const doc = await CustomRole.findOne({ guildId, userId: uid }).lean().catch(() => null);
  return { channel: keep, doc };
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
    const emoji =
      guild?.emojis?.cache?.get?.(id) || resolveStoredCustomEmojiFromClient(guild?.client, id) || null;
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
  const [birthday, reactionDoc, customState, customDocLean, noDmPrefs, avatarPrivacy, bannerPrivacy, quotePrivacy, member, contestPrizeLean, eventWeek2Grant, eventWeek3Grant] = await Promise.all([
    getBirthdayProfile(guildId, userId),
    MentionReaction.findOne({ guildId, userId }).lean().catch(() => null),
    resolveCustomRoleState({ guild, userId, client, cleanupExpired: false }),
    CustomRole.findOne(
      { guildId, userId },
      { customVocChannelId: 1, customVocEmoji: 1, roleId: 1, secondaryRoleId: 1, expiresAt: 1 },
    ).lean().catch(() => null),
    getNoDmPreferences(guildId, userId).catch(() => ({ blockAll: false, disabled: new Set() })),
    AvatarPrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    BannerPrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    QuotePrivacy.findOne({ guildId, userId }).lean().catch(() => null),
    guild?.members?.fetch?.(userId).catch(() => guild?.members?.cache?.get?.(userId) || null),
    ActivityUserProfile.findOne({ guildId, userId })
      .select(
        "profile.contestPrizes profile.totals.exp.event staff.partnerManagerCustomPerksUntil staff.partnerManagerVipUntil",
      )
      .lean()
      .catch(() => null),
    guildId && userId ? hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false) : false,
    guildId && userId ? hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false) : false,
  ]);
  const contestSecondUnlock =
    Boolean(contestPrizeLean?.profile?.contestPrizes?.disegniSecondPlaceUnlock) ||
    Boolean(contestPrizeLean?.profile?.totals?.exp?.event?.contestDisegniSecondPlaceUnlock);
  const pmCustomBundleActive = partnerManagerPerkDateActive(contestPrizeLean?.staff?.partnerManagerCustomPerksUntil);
  const hasCustomRoleAccess = memberHasCustomRolePanelAccess(member, {
    hasContestSecondPlaceUnlock: contestSecondUnlock,
    hasEventWeek2Grant: Boolean(eventWeek2Grant),
    hasEventWeek3Grant: Boolean(eventWeek3Grant),
    hasPartnerManagerCustomBundle: pmCustomBundleActive,
  });
  const hasCustomVocAccess =
    memberCanCreateCustomVoc(member) ||
    contestSecondUnlock ||
    Boolean(eventWeek2Grant) ||
    Boolean(eventWeek3Grant) ||
    pmCustomBundleActive;
  const hasCustomReactionAccess = memberHasCustomReactionRoleAccess(member);
  const customReactionMax = getCustomReactionMax(member);
  const colorLevel = await colorUnlocks.fetchNumericProfileLevel(guildId, userId).catch(() => 0);
  const colorCanPickPlus = await colorUnlocks.memberHasPlusColorFullEligibilityAsync(member).catch(() => false);
  const colorEligibleOptions = buildProfileEligibleColorOptions(guild, colorLevel, colorCanPickPlus);

  let mergedCustomDoc = customState?.doc || customDocLean || null;
  const vocIdSync = String(mergedCustomDoc?.customVocChannelId || "").trim();
  if (guild && /^\d{17,22}$/.test(String(userId)) && vocIdSync && typeof guild.channels?.fetch === "function") {
    await guild.channels.fetch(vocIdSync).catch(() => null);
  }
  if (
    guild &&
    /^\d{17,22}$/.test(String(userId)) &&
    mergedCustomDoc &&
    (mergedCustomDoc.roleId || mergedCustomDoc.secondaryRoleId || mergedCustomDoc.customVocChannelId)
  ) {
    const consolidated = await consolidateOwnerCustomVoiceChannels(
      guild,
      String(userId),
      mergedCustomDoc,
      vocIdSync,
    ).catch(() => null);
    if (consolidated?.doc) mergedCustomDoc = consolidated.doc;
  }
  const mergedCustomState = customState && typeof customState === "object"
    ? { ...customState, doc: mergedCustomDoc || null }
    : { status: "none", doc: mergedCustomDoc || null, role: null, secondaryRole: null };

  return {
    birthday: birthday || null,
    reactions: Array.isArray(reactionDoc?.reactions) ? reactionDoc.reactions : [],
    custom: mergedCustomState,
    panelMember: member && member.guild ? member : null,
    noDm: noDmPrefs || { blockAll: false, disabled: new Set() },
    privacy: {
      avatar: Boolean(avatarPrivacy?.blocked),
      banner: Boolean(bannerPrivacy?.blocked),
      quotes: Boolean(quotePrivacy?.blocked),
    },
    featureAccess: {
      customRole: hasCustomRoleAccess,
      customVoc: hasCustomVocAccess,
      customReaction: hasCustomReactionAccess,
      customReactionMax,
      secondaryCustomRole: memberHasCustomRoleSecondarySlot(member),
    },
    colors: {
      level: colorLevel,
      canPickPlus: colorCanPickPlus,
      eligibleOptions: colorEligibleOptions,
    },
  };
}

function isProfilePanelGuildMember(userOrMember) {
  return Boolean(
    userOrMember &&
      typeof userOrMember === "object" &&
      userOrMember.guild &&
      userOrMember.user &&
      typeof userOrMember.displayAvatarURL === "function",
  );
}

function buildSectionEmbed(section, state, userOrMember, guild = null) {
  const base = new EmbedBuilder().setColor("#6f4e37");
  if (userOrMember && typeof userOrMember === "object") {
    const thumb = isProfilePanelGuildMember(userOrMember)
      ? guildMemberDisplayAvatarUrlDynamic(userOrMember, { size: 256 })
      : userAvatarUrlDynamic(userOrMember, { size: 256 });
    if (thumb) base.setThumbnail(thumb);
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
  const customSecondaryRoleName = custom?.secondaryRole?.name ? `**${custom.secondaryRole.name}**` : "Nessun ruolo secondario";
  const customRoleMention = custom?.role?.id ? `<@&${custom.role.id}>` : null;
  const customSecondaryRoleMention = custom?.secondaryRole?.id ? `<@&${custom.secondaryRole.id}>` : null;
  const hasSecondaryCustomRole = Boolean(custom?.secondaryRole?.id || custom?.secondaryRole?.name);
  const primaryRoleDisplay = customRoleMention || customRoleName;
  const secondaryRoleDisplay = customSecondaryRoleMention || customSecondaryRoleName;
  const customRoleExpiry = customDoc ? buildExpiryText(customDoc) : "—";
  let customVocLinked = "Nessuna vocale";
  if (customDoc?.customVocChannelId) {
    const cid = String(customDoc.customVocChannelId).trim();
    const vch = guild?.channels?.cache?.get(cid);
    if (vch?.type === ChannelType.GuildVoice) {
      const vn = String(vch.name || "")
        .trim()
        .replace(/\n/g, " ")
        .slice(0, 96);
      customVocLinked = vn ? `**${vn}**` : `<#${cid}>`;
    } else {
      customVocLinked = `Canale non trovato (ID \`${cid}\`). Dal menu **Vocale Privata** usa *Elimina Vocale* e poi *Crea Vocale* se il canale è stato eliminato o spostato.`;
    }
  }
  const customVocEmoji = String(customDoc?.customVocEmoji || "").trim() || "Non impostata";
  const reactionList = Array.isArray(state?.reactions) ? state.reactions : [];
  const reactionMax = Math.max(1, Number(state?.featureAccess?.customReactionMax || MAX_REACTIONS));
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
  const user = userOrMember?.user || userOrMember;
  const profileDisplayName =
    isProfilePanelGuildMember(userOrMember)
      ? String(userOrMember.displayName || user?.username || user?.globalName || "").trim() || "Utente"
      : user && typeof user === "object"
        ? String(user.globalName || user.username || user.tag || "").trim() || "Utente"
        : "Utente";
  if (section === SECTION_BIRTHDAY) {
    const ageNow = computeAgeNow(Number(birthday?.day || 0), Number(birthday?.month || 0), Number(birthday?.birthYear || 0));
    const showAgeLine = birthday?.showAge !== false;
    const birthdayLines = [
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<a:VC_Calendar:1482706208149475358> Data: **${formatBirthday(birthday)}**`,
    ];
    if (showAgeLine) {
      birthdayLines.push(
        `<:VC_addperson:1485419347068588073> Età: **${Number.isInteger(ageNow) ? `${ageNow} anni` : "Non impostata"}**`,
      );
    }
    birthdayLines.push(
      `<:VC_Lock:1482526739044368476> Privacy età: **${birthdayPrivacy}**`,
      "",
      hasBirthday
        ? "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire."
        : "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    );
    return base.setDescription(birthdayLines.join("\n"));
  }

  if (section === SECTION_CUSTOMROLE) {
    const roleLines = [
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<:VC_emoji:1485419161168511036> Stato: **${customRoleStatus}**`,
      `<:VC_Color:1482532543273238569> **Ruolo primario:** ${customRoleName}`,
      `<a:VC_Calendar:1482706208149475358> Scadenza: **${customRoleExpiry}**`,
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    ];
    return base.setDescription(roleLines.join("\n"));
  }

  if (section === SECTION_CUSTOMROLE_SECONDARY) {
    const secLines = [
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<:VC_emoji:1485419161168511036> Stato: **${customRoleStatus}**`,
      `<:VC_Color:1482532543273238569> **Ruolo secondario:** ${customSecondaryRoleName}`,
      `<a:VC_Calendar:1482706208149475358> Scadenza: **${customRoleExpiry}**`,
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    ];
    return base.setDescription(secLines.join("\n"));
  }

  if (section === SECTION_CUSTOMVOC) {
    return base
      .setDescription([
        "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
        "",
        `<:VC_emoji:1485419161168511036> Stato: **${customRoleStatus}**`,
        `<:VC_Color:1482532543273238569> Nome: ${customVocLinked}`,
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
          ? `<:VC_emoji:1485419161168511036> Attive (${reactionList.length}/${reactionMax}): ${reactionList.map((token) => renderReactionToken(token, guild)).join(" ")}`
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
    const voteDiscDmOff = isDmCategoryOff(noDm, "bump");
    const voteTopggDmOff = isDmCategoryOff(noDm, "vote_topgg");
    const privacyLines = [
      `<:VC_Dot:1482532364222595303> **Avatar**: ${privacy.avatar ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
      `<:VC_Dot:1482532364222595303> **Banner**: ${privacy.banner ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
      `<:VC_Dot:1482532364222595303> **Quote**: ${privacy.quotes ? "<:VC_OfflineStatus:1482527117051957380> Nascosto / bloccato" : "<:VC_OnlineStatus:1482527088912240650> Visibile"}`,
      `<:VC_Dot:1482532364222595303> **DM reminder voto Discadia**: ${voteDiscDmOff ? "<:VC_OfflineStatus:1482527117051957380> Disattivato" : "<:VC_OnlineStatus:1482527088912240650> Attivo"}`,
      `<:VC_Dot:1482532364222595303> **DM reminder voto Top.gg**: ${voteTopggDmOff ? "<:VC_OfflineStatus:1482527117051957380> Disattivato" : "<:VC_OnlineStatus:1482527088912240650> Attivo"}`,
    ];
    return base.setDescription([
      "<:VC_PinkQuestionMark:1471892611026391306> Gestisci **privacy** (avatar, banner, quote) e i **promemoria DM** per i voti su Discadia e Top.gg (impostazioni separate).",
      "",
      ...privacyLines,
      "",
      "<a:VC_Alert:1482706673176150077> Per tutte le altre categorie DM usa la sezione **Notifiche DM**. Avatar/Banner/Quote: **Blocca tutto** / **Sblocca tutto**.",
    ].join("\n"));
  }

  if (section === SECTION_COLORS) {
    const level = Number(state?.colors?.level || 0);
    const canPickPlus = Boolean(state?.colors?.canPickPlus);
    const eligibleOptions = Array.isArray(state?.colors?.eligibleOptions) ? state.colors.eligibleOptions : [];
    const desc = buildProfileColorsDescription(guild, level, canPickPlus, eligibleOptions);
    return base.setDescription(desc);
  }

  const homeRoleLines = [`<:VC_Color:1482532543273238569> **Ruolo primario:** ${primaryRoleDisplay}`];
  if (hasSecondaryCustomRole) {
    homeRoleLines.push(`<:VC_Color:1482532543273238569> **Ruolo secondario:** ${secondaryRoleDisplay}`);
  }
  const homeBirthdaySummary =
    birthday?.showAge === false ? formatBirthday(birthday) : formatBirthdayWithOptionalYear(birthday);
  return base
    .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${profileDisplayName}.`)
    .setDescription([
      "<:VC_EXP:1482534670896730143> Qui trovi una mini guida per configurare il tuo profilo e le funzioni principali del bot.",
      "",
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<a:VC_Events:1482706144953897223> Birthday: **${homeBirthdaySummary}**`,
      `<a:VC_CheckDMs:1482724593448784123> Notifiche DM: **${noDmSummary}**`,
      `<:VC_Lock:1482526739044368476> Privacy: **${privacySummary}**`,
      ...homeRoleLines,
      `<:VC_Modifica:1478859646587633717> Vocale Privata: ${customVocLinked}`,
      `<:VC_emoji:1485419161168511036> Custom Reactions: ${reactionsText}`,
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    ].join("\n"))
}

function buildRows(ownerId, section, state = null) {
  const closeRow = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:action:${ownerId}:close`)
        .setEmoji("<:cancel:1461730653677551691>")
        .setStyle(ButtonStyle.Danger),
    );
  const canAccessCustomRole = Boolean(state?.featureAccess?.customRole);
  const canAccessCustomVoc = Boolean(state?.featureAccess?.customVoc);
  const canAccessCustomReaction = Boolean(state?.featureAccess?.customReaction);
  const canCreateSecondaryRole = Boolean(state?.featureAccess?.secondaryCustomRole);
  const roleId = String(state?.custom?.role?.id || "").trim();
  const secondaryRoleId = String(state?.custom?.secondaryRole?.id || "").trim();
  const customVocChannelId = String(state?.custom?.doc?.customVocChannelId || "").trim();
  const primaryRoleStored = String(state?.custom?.doc?.roleId || "").trim();
  const hasPrimaryCustomRole = Boolean(roleId || primaryRoleStored);
  const selectOptions = [
    { label: "Home", value: SECTION_HOME, emoji: "<:VC_addperson:1485419347068588073>", default: section === SECTION_HOME },
    { label: "Birthday", value: SECTION_BIRTHDAY, emoji: "<a:VC_Events:1482706144953897223>", default: section === SECTION_BIRTHDAY },
    { label: "Notifiche DM", value: SECTION_DMFILTERS, emoji: "<a:VC_Ping:1482694298687246377>", default: section === SECTION_DMFILTERS },
    { label: "Privacy", value: SECTION_PRIVACY, emoji: "<:VC_Lock:1482526739044368476>", default: section === SECTION_PRIVACY },
  ];
  if (canAccessCustomRole) {
    selectOptions.push(
      { label: "Ruolo Primario", value: SECTION_CUSTOMROLE, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMROLE },
    );
  }
  if (canCreateSecondaryRole && hasPrimaryCustomRole) {
    selectOptions.push(
      { label: "Ruolo Secondario", value: SECTION_CUSTOMROLE_SECONDARY, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMROLE_SECONDARY },
    );
  }
  if (canAccessCustomVoc) {
    selectOptions.push(
      { label: "Vocale Privata", value: SECTION_CUSTOMVOC, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMVOC },
    );
  }
  if (canAccessCustomReaction) {
    selectOptions.push(
      { label: "Mention Reactions", value: SECTION_CUSTOMREACTION, emoji: "<:VC_Vip:1482534921472835895>", default: section === SECTION_CUSTOMREACTION },
    );
  }
  if (Boolean(state?.colors)) {
    selectOptions.push(
      { label: "Colori Chat", value: SECTION_COLORS, emoji: "<:VC_Color:1482532543273238569>", default: section === SECTION_COLORS },
    );
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PANEL_PREFIX}:select:${ownerId}`)
    .setPlaceholder("Scegli una sezione")
    .addOptions(...selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder();

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
    return [row1, row2, row3, closeRow()];
  } else if (section === SECTION_CUSTOMROLE) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`customrole_name:${ownerId}:${roleId || "0"}`).setLabel("Modifica Nome").setEmoji("<:VC_Modifica:1478859646587633717>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_color:${ownerId}:${roleId || "0"}`).setLabel("Modifica Colore").setEmoji("<:VC_Color:1482532543273238569>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_emoji:${ownerId}:${roleId || "0"}`).setLabel("Modifica Icona").setEmoji("<:VC_emoji:1485419161168511036>").setStyle(ButtonStyle.Primary).setDisabled(!roleId),
    );
    if (!roleId && !secondaryRoleId) {
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customrole_create`).setLabel("Crea Ruolo").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      );
      return [row1, row2, row3, closeRow()];
    }
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`customrole_members:${ownerId}:${roleId || "0"}`).setLabel("Aggiungi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_members_remove:${ownerId}:${roleId || "0"}`).setLabel("Rimuovi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Danger).setDisabled(!roleId),
      new ButtonBuilder().setCustomId(`customrole_delete:${ownerId}:${roleId || "0"}`).setLabel("Elimina Ruolo").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger).setDisabled(!roleId),
    );

    return [row1, row2, row3, closeRow()];
  } else if (section === SECTION_CUSTOMROLE_SECONDARY) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`customrole_name:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Modifica Nome").setEmoji("<:VC_Modifica:1478859646587633717>").setStyle(ButtonStyle.Primary).setDisabled(!secondaryRoleId),
      new ButtonBuilder().setCustomId(`customrole_color:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Modifica Colore").setEmoji("<:VC_Color:1482532543273238569>").setStyle(ButtonStyle.Primary).setDisabled(!secondaryRoleId),
      new ButtonBuilder().setCustomId(`customrole_emoji:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Modifica Icona").setEmoji("<:VC_emoji:1485419161168511036>").setStyle(ButtonStyle.Primary).setDisabled(!secondaryRoleId),
    );
    if (!secondaryRoleId) {
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customrole_create_secondary`).setLabel("Crea Ruolo").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success).setDisabled(!canCreateSecondaryRole || !hasPrimaryCustomRole),
      );
      return [row1, row2, row3, closeRow()];
    }
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`customrole_members:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Aggiungi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`customrole_members_remove:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Rimuovi Utenti").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`customrole_delete:${ownerId}:${secondaryRoleId || "0"}`).setLabel("Elimina Ruolo").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger),
    );
    return [row1, row2, row3, closeRow()];
  } else if (section === SECTION_CUSTOMVOC) {
    if (!customVocChannelId) {
      row2.addComponents(
        new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customvoc_create`).setLabel("Crea Vocale").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      );
      return [row1, row2, closeRow()];
    }
    row2.addComponents(
      new ButtonBuilder().setCustomId(`customvoc_name:${ownerId}:${customVocChannelId}`).setLabel("Modifica Nome").setEmoji("<:VC_Modifica:1478859646587633717>").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`customvoc_emoji:${ownerId}:${customVocChannelId}`).setLabel("Modifica Emoji").setEmoji("<:VC_emoji:1485419161168511036>").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`customvoc_add:${ownerId}:${customVocChannelId}`).setLabel("Aggiungi Utente").setEmoji("<:VC_addperson:1485419347068588073>").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`customvoc_remove:${ownerId}:${customVocChannelId}`).setLabel("Rimuovi Utente").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:customvoc_delete`).setLabel("Elimina Vocale").setEmoji("<:VC_delete:1485421886589501511>").setStyle(ButtonStyle.Danger),
    );
    return [row1, row2, closeRow()];
  } else if (section === SECTION_CUSTOMREACTION) {
    return [row1, ...buildCustomReactionPanelRows(ownerId), closeRow()];
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
    const dmRows = [];
    for (let i = 0; i < dmButtons.length; i += 5) {
      dmRows.push(new ActionRowBuilder().addComponents(...dmButtons.slice(i, i + 5)));
    }
    const rowLast = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_all`).setLabel("Disattiva tutto").setStyle(isAll ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji("<:cancel:1461730653677551691>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_none`).setLabel("Attiva tutto").setStyle(!isAll && noDm?.disabled?.size === 0 ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:dm_done`).setLabel("Fine").setStyle(ButtonStyle.Primary).setEmoji("<:vegacheckmark:1443666279058772028>"),
    );
    return [row1, ...dmRows, rowLast, closeRow()];
  } else if (section === SECTION_PRIVACY) {
    const privacy = state?.privacy || { avatar: false, banner: false, quotes: false };
    const noDm = state?.noDm || { blockAll: false, disabled: new Set() };
    const voteDiscDmOff = isDmCategoryOff(noDm, "bump");
    const voteTopggDmOff = isDmCategoryOff(noDm, "vote_topgg");
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_avatar`).setLabel("Avatar").setStyle(privacy.avatar ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.avatar ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_banner`).setLabel("Banner").setStyle(privacy.banner ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.banner ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_toggle_quotes`).setLabel("Quote").setStyle(privacy.quotes ? ButtonStyle.Secondary : ButtonStyle.Success).setEmoji(privacy.quotes ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
    );
    const rowVoteDm = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_dm_bump`)
        .setLabel("Voto Discadia (DM)")
        .setStyle(voteDiscDmOff ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(voteDiscDmOff ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_dm_vote_topgg`)
        .setLabel("Voto Top.gg (DM)")
        .setStyle(voteTopggDmOff ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(voteTopggDmOff ? "<:VC_OfflineStatus:1482527117051957380>" : "<:VC_OnlineStatus:1482527088912240650>"),
    );
    const allBlocked = privacy.avatar && privacy.banner && privacy.quotes;
    const allVisible = !privacy.avatar && !privacy.banner && !privacy.quotes;
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_all`).setLabel("Blocca tutto").setStyle(allBlocked ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji("<:cancel:1461730653677551691>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_none`).setLabel("Sblocca tutto").setStyle(allVisible ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:privacy_done`).setLabel("Fine").setStyle(ButtonStyle.Primary).setEmoji("<:vegacheckmark:1443666279058772028>"),
    );
    return [row1, row2, rowVoteDm, row3, closeRow()];
  } else if (section === SECTION_COLORS) {
    const eligibleOptions = Array.isArray(state?.colors?.eligibleOptions) ? state.colors.eligibleOptions : [];
    const colorsButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CMD_COLORS_BTN}${ownerId}:info`)
        .setLabel("Come ottenere i colori")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📋"),
      new ButtonBuilder()
        .setCustomId(`${CMD_COLORS_BTN}${ownerId}:remove`)
        .setLabel("Rimuovi colore")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🧹"),
    );
    if (!eligibleOptions.length) return [row1, colorsButtonRow, closeRow()];
    const colorsSelectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${CMD_COLORS_SEG}${ownerId}:all`)
        .setPlaceholder("🎨 Colori Plus/Esclusivi sbloccati")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(eligibleOptions),
    );
    return [row1, colorsButtonRow, colorsSelectRow, closeRow()];
  } else {
    return [row1, closeRow()];
  }
}

async function buildPanelPayload(guild, ownerId, client, section = SECTION_HOME) {
  const state = await fetchProfilePanelState(guild, ownerId, client);
  const canAccessCustomRole = Boolean(state?.featureAccess?.customRole);
  const canAccessSecondaryCustomRole = Boolean(state?.featureAccess?.secondaryCustomRole);
  const canAccessCustomVoc = Boolean(state?.featureAccess?.customVoc);
  const canAccessCustomReaction = Boolean(state?.featureAccess?.customReaction);
  const requestedSection = String(section || SECTION_HOME);
  const isDeniedCustomRole =
    !canAccessCustomRole && requestedSection === SECTION_CUSTOMROLE;
  const isDeniedSecondaryCustomRole =
    !canAccessSecondaryCustomRole && requestedSection === SECTION_CUSTOMROLE_SECONDARY;
  const hasPrimaryCustomRole = Boolean(
    String(state?.custom?.doc?.roleId || state?.custom?.role?.id || "").trim(),
  );
  const isDeniedSecondaryNoPrimary =
    requestedSection === SECTION_CUSTOMROLE_SECONDARY && !hasPrimaryCustomRole;
  const isDeniedCustomVoc =
    !canAccessCustomVoc && requestedSection === SECTION_CUSTOMVOC;
  const isDeniedCustomReaction = !canAccessCustomReaction && requestedSection === SECTION_CUSTOMREACTION;
  const safeSection = (isDeniedCustomRole || isDeniedSecondaryCustomRole || isDeniedSecondaryNoPrimary || isDeniedCustomVoc || isDeniedCustomReaction)
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
  const panelMember = state.panelMember || null;
  if (!panelUser && panelMember) panelUser = panelMember.user ?? null;
  const panelIdentity = panelMember || panelUser;
  return {
    embeds: [buildSectionEmbed(safeSection, state, panelIdentity, guild)],
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
  await interaction.reply({
    content:
      "<:VC_Attention:1482534443632558151> Serve VIP, Server Booster, Level 70, Double Booster o VIP+ per usare le custom reactions.",
    flags: PRIVATE_FLAG,
  }).catch(() => { });
  return false;
}

async function ensureCustomRoleExists(interaction, ownerId, client, slot = "primary") {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return { ok: false, reason: "server_missing" };
  const targetSlot = String(slot || "primary").toLowerCase() === "secondary" ? "secondary" : "primary";
  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, ownerId),
    hasEventWeekWinnerGrant(guild.id, ownerId, 2).catch(() => false),
    hasEventWeekWinnerGrant(guild.id, ownerId, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(guild.id, ownerId),
  ]);
  const primarySlotUnlock =
    hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  if (targetSlot === "primary" && getCustomRoleSlotCapWithContest(member, primarySlotUnlock) < 1) {
    return { ok: false, reason: "missing_customrole_access" };
  }
  if (targetSlot === "secondary" && getCustomRoleSlotCapFromRoles(member) < 2) {
    return { ok: false, reason: "missing_secondary_access" };
  }

  const state = await resolveCustomRoleState({
    guild,
    userId: ownerId,
    client,
    cleanupExpired: true,
  }).catch(() => null);

  if (state?.status === "active") {
    if (targetSlot === "primary" && state?.role) {
      return { ok: true, role: state.role, doc: state.doc || null };
    }
    if (targetSlot === "secondary" && state?.secondaryRole) {
      return { ok: true, role: state.secondaryRole, doc: state.doc || null };
    }
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  if (targetSlot === "secondary") {
    const primaryRow = await CustomRole.findOne(
      { guildId: guild.id, userId: ownerId },
      { roleId: 1 },
    )
      .lean()
      .catch(() => null);
    if (!String(primaryRow?.roleId || "").trim()) {
      return { ok: false, reason: "primary_required" };
    }
  }

  const roleName = trimRoleName(accountUsername(member || interaction.user) || "Custom Role");
  const createdRole = await guild.roles.create({
    name: roleName,
    colors: { primaryColor: "#f4b6d7" },
    reason: `Custom role per ${interaction.user?.tag || ownerId}`,
  }).catch(() => null);
  if (!createdRole) return { ok: false, reason: "create_failed" };

  const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
  if (anchor?.position) {
    const customRoleDocs = await CustomRole.find({ guildId: guild.id }, { roleId: 1, secondaryRoleId: 1 })
      .lean()
      .catch(() => []);
    const existingCustomPositions = (Array.isArray(customRoleDocs) ? customRoleDocs : [])
      .flatMap((doc) => [String(doc?.roleId || ""), String(doc?.secondaryRoleId || "")])
      .filter((id) => id && id !== createdRole.id)
      .map((id) => guild.roles.cache.get(id) || null)
      .filter((role) => role && Number(role.position) > 0 && Number(role.position) < Number(anchor.position))
      .map((role) => Number(role.position));
    const targetPosition = existingCustomPositions.length
      ? Math.min(
        Math.max(1, Number(anchor.position) - 1),
        Math.max(...existingCustomPositions) + 1,
      )
      : Math.max(1, Number(anchor.position) - 1);
    if (createdRole.position !== targetPosition) {
      await createdRole.setPosition(targetPosition).catch(() => { });
    }
  }

  await member.roles.add(createdRole.id).catch(() => { });

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    { $set: targetSlot === "secondary" ? { guildId: guild.id, userId: ownerId, secondaryRoleId: createdRole.id, expiresAt: null } : { guildId: guild.id, userId: ownerId, roleId: createdRole.id, expiresAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return { ok: true, role: createdRole, doc };
}

async function ensureCustomVocExists(interaction, ownerId, client) {
  const guild = interaction.guild;
  const member = interaction.member || (guild && typeof guild.members?.fetch === "function" ? await guild.members.fetch(ownerId).catch(() => null) : null);
  const [hasExtraUnlock, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild?.id, ownerId),
    fetchPartnerManagerTimedPerkLean(guild?.id, ownerId),
  ]);
  const pmBundle = partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  if (!memberCanCreateCustomVoc(member) && !hasExtraUnlock && !pmBundle) return { ok: false, reason: "missing_customvoc_access" };
  const me = guild?.members?.me || guild?.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { ok: false, reason: "no_manage_channels" };
  }

  const latestDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null);
  const merged = await consolidateOwnerCustomVoiceChannels(guild, ownerId, latestDoc, null);
  if (merged?.channel) {
    return { ok: true, channel: merged.channel, doc: merged.doc };
  }

  const existingChannelId = String(latestDoc?.customVocChannelId || "").trim();
  if (existingChannelId) {
    const existing = guild.channels?.cache?.get?.(existingChannelId) || (await guild.channels?.fetch?.(existingChannelId).catch(() => null));
    if (existing) return { ok: true, channel: existing, doc: latestDoc };
  }

  const category = guild.channels?.cache?.get?.(CUSTOM_VOICE_CATEGORY_ID) || (await guild.channels?.fetch?.(CUSTOM_VOICE_CATEGORY_ID).catch(() => null));
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: "category_missing" };
  }

  const channelName = buildCustomVocName(
    latestDoc?.customVocEmoji || "🎧",
    accountUsername(interaction.member || interaction.user) || "privata",
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
        id: ownerId,
        allow: [
          ...CUSTOM_VOC_MEMBER_ALLOW_FLAGS,
          PermissionsBitField.Flags.MoveMembers,
          PermissionsBitField.Flags.ManageChannels,
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
    { new: true, lean: true },
  ).catch(() => null);

  const afterDedupe = await consolidateOwnerCustomVoiceChannels(
    guild,
    ownerId,
    doc || { ...(latestDoc || {}), guildId: guild.id, userId: ownerId, customVocChannelId: channel.id },
    channel.id,
  );
  const finalChannel = afterDedupe?.channel || channel;
  const finalDoc =
    (await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null)) ||
    afterDedupe?.doc ||
    doc;

  return { ok: true, channel: finalChannel, role, doc: finalDoc };
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
  void tryCelebrateBirthdayAfterProfileSave(interaction.client, interaction.guild.id, ownerId).catch(() => { });
  await applyZodiacRoleFromBirthday(interaction.guild, ownerId, parsedDate.month, parsedDate.day).catch(() => { });
  await applyAgeBracketRoleFromBirthday(
    interaction.guild,
    ownerId,
    parsedDate.day,
    parsedDate.month,
    birthYear,
  ).catch(() => { });

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
  const member =
    interaction.member ||
    (interaction.guild && typeof interaction.guild.members?.fetch === "function"
      ? await interaction.guild.members.fetch(ownerId).catch(() => null)
      : null);
  const reactionMax = getCustomReactionMax(member);
  await interaction.guild?.emojis?.fetch?.().catch(() => { });
  const raw = interaction.fields.getTextInputValue("reactions");
  const tokens = parseReactionTokens(raw, reactionMax, interaction.guild);
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

  if (interaction.isStringSelectMenu() && kind === "select") {
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildPanelPayload(interaction.guild, ownerId, client, section);
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

  if (!(await ensureOwner(interaction, ownerId))) return true;

  if (interaction.isButton() && kind === "action") {
    const action = String(rest?.[0] || "");
    if (action === "close") {
      const sourceMessageId = String(interaction.message?.reference?.messageId || "").trim();
      await interaction.message?.delete?.().catch(() => {});
      if (/^\d{16,20}$/.test(sourceMessageId) && interaction.channel?.messages?.fetch) {
        const sourceMessage = await interaction.channel.messages.fetch(sourceMessageId).catch(() => null);
        if (sourceMessage?.deletable) {
          await sourceMessage.delete().catch(() => {});
        }
      }
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate().catch(() => {});
      }
      return true;
    }
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
      void tryCelebrateBirthdayAfterProfileSave(interaction.client, interaction.guild.id, ownerId).catch(() => { });
      await applyZodiacRoleFromBirthday(interaction.guild, ownerId, month, day).catch(() => { });
      await applyAgeBracketRoleFromBirthday(interaction.guild, ownerId, day, month, birthYear).catch(() => { });
      clearBirthdayDraft(interaction.guild.id, ownerId);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await safeUpdatePanelInteraction(interaction, payload);
      await interaction.followUp?.({ content: "Profilo compleanno salvato.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "birthday_clear") {
      await clearBirthdayProfile(interaction.guild.id, ownerId).catch(() => { });
      await stripAllZodiacRoles(interaction.guild, ownerId).catch(() => { });
      await stripAllAgeBracketRoles(interaction.guild, ownerId).catch(() => { });
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
      await applyNoDmCategoryToggle(interaction.guild.id, ownerId, category);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_DMFILTERS);
      await safeUpdatePanelInteraction(interaction, payload);
      return true;
    }

    if (action.startsWith("privacy_dm_")) {
      const category = action.slice("privacy_dm_".length);
      if (!DM_CATEGORIES.includes(category)) return true;
      await applyNoDmCategoryToggle(interaction.guild.id, ownerId, category);
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_PRIVACY);
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
      const result = await ensureCustomRoleExists(interaction, ownerId, client, "primary");
      if (!result.ok) {
        let reason = "Non sono riuscito a creare il custom role.";
        if (result.reason === "no_manage_roles") reason = "Mi serve `Gestisci Ruoli` per creare il custom role.";
        if (result.reason === "missing_customrole_access") {
          reason = "Il custom role e disponibile solo per Level 50, Server Booster, VIP, Double Booster e VIP+.";
        }
        await interaction.reply({ content: `<:vegax:1443934876440068179> ${reason}`, flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMROLE);
      const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
      if (deferred) {
        await interaction.message?.edit?.(payload).catch(() => { });
      } else {
        await safeUpdatePanelInteraction(interaction, payload);
      }
      await interaction.followUp?.({ content: "<:vegacheckmark:1443666279058772028> Custom role creato.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }
    if (action === "customrole_create_secondary") {
      const liveMember = interaction.member || (await interaction.guild.members.fetch(ownerId).catch(() => null));
      if (!memberHasCustomRoleSecondarySlot(liveMember)) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Il secondo custom role e solo per il tier **VIP+ / Double Booster** (massimo **2** custom role totali: non si cumulano Level 50, Booster o VIP tra loro).",
          flags: PRIVATE_FLAG,
        }).catch(() => { });
        return true;
      }
      const result = await ensureCustomRoleExists(interaction, ownerId, client, "secondary");
      if (!result.ok) {
        let reason = "Non sono riuscito a creare il ruolo secondario.";
        if (result.reason === "no_manage_roles") reason = "Mi serve `Gestisci Ruoli` per creare il ruolo secondario.";
        if (result.reason === "primary_required") {
          reason = "Crea prima il custom role primario: il secondo slot si sblocca solo dopo.";
        }
        if (result.reason === "missing_secondary_access") {
          reason =
            "Il secondo custom role e solo per VIP+ / Double Booster (max 2 totali; Level 50, Booster e VIP non si sommano).";
        }
        await interaction.reply({ content: `<:vegax:1443934876440068179> ${reason}`, flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMROLE_SECONDARY);
      const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
      if (deferred) {
        await interaction.message?.edit?.(payload).catch(() => { });
      } else {
        await safeUpdatePanelInteraction(interaction, payload);
      }
      await interaction.followUp?.({ content: "<:vegacheckmark:1443666279058772028> Ruolo secondario creato.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "customvoc_create") {
      const result = await ensureCustomVocExists(interaction, ownerId, client);
      if (!result.ok) {
        let reason = "Non sono riuscito a creare la vocale privata.";
        if (result.reason === "no_manage_channels") reason = "Mi serve `Gestisci Canali` per creare la vocale.";
        if (result.reason === "category_missing") reason = "Categoria delle vocali private non trovata.";
        if (result.reason === "missing_customvoc_access") reason = "La custom voc e disponibile solo per Double Booster, Level 50, VIP e VIP+.";
        await interaction.reply({ content: `<:vegax:1443934876440068179> ${reason}`, flags: PRIVATE_FLAG }).catch(() => { });
        return true;
      }
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMVOC);
      const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
      if (deferred) {
        await interaction.message?.edit?.(payload).catch(() => { });
      } else {
        await safeUpdatePanelInteraction(interaction, payload);
      }
      await interaction.followUp?.({ content: "<:vegacheckmark:1443666279058772028> Vocale privata creata.", flags: PRIVATE_FLAG }).catch(() => { });
      return true;
    }

    if (action === "customvoc_delete") {
      const vocDoc = await CustomRole.findOne(
        { guildId: interaction.guild.id, userId: ownerId },
        { customVocChannelId: 1 },
      ).lean().catch(() => null);
      const channelId = String(vocDoc?.customVocChannelId || "").trim();
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
      const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
      if (deferred) {
        await interaction.message?.edit?.(payload).catch(() => { });
      } else {
        await safeUpdatePanelInteraction(interaction, payload);
      }
      await interaction.followUp?.({
        content: "<:vegacheckmark:1443666279058772028> Vocale privata eliminata.",
        flags: PRIVATE_FLAG,
      }).catch(() => { });
      return true;
    }

    if (action === "reaction_set") {
      const allowed = await ensureCustomReactionEnabled(interaction, ownerId, client);
      if (!allowed) return true;
      const member =
        interaction.member ||
        (interaction.guild && typeof interaction.guild.members?.fetch === "function"
          ? await interaction.guild.members.fetch(ownerId).catch(() => null)
          : null);
      const reactionMax = getCustomReactionMax(member);
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_reactions:${ownerId}:${SECTION_CUSTOMREACTION}`)
        .setTitle("Imposta Reactions");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reactions")
            .setLabel(`Emoji (max ${reactionMax})`)
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