"use strict";

const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const {
  getNoDmPreferences,
  setNoDmCategories,
  DM_CATEGORIES,
  DM_CATEGORY_ALL,
  DM_CATEGORY_LABELS,
} = require("../../Community/utils/noDmList") as typeof import("../../Community/utils/noDmList");
const {
  PRIVACY_CONTENT_KINDS,
  PRIVACY_CONTENT_LABELS,
  privacyContentModel,
} = require("../../Community/utils/privacyContentKinds") as typeof import("../../Community/utils/privacyContentKinds");
const {
  getBirthdayProfile,
  setBirthdayProfile,
  clearBirthdayProfile,
  getMentionResponse,
  setMentionResponse,
  clearMentionResponse,
} = require("../../Community/services/profileStore") as typeof import("../../Community/services/profileStore");
const { MentionReaction } = require("../../Community/schemas/autoInteractionSchemas") as typeof import("../../Community/schemas/autoInteractionSchemas");
const {
  memberHasCustomReactionRoleAccess,
  getCustomReactionMax,
  parseReactionTokens,
  toDisplay,
} = require("../../Community/utils/mentionReactionPanelUtils") as typeof import("../../Community/utils/mentionReactionPanelUtils");
const {
  memberHasMentionResponseAccess,
  MENTION_RESPONSE_ACCESS_HINT_IT,
} = require("../../Community/utils/mentionResponseAccessUtils") as typeof import("../../Community/utils/mentionResponseAccessUtils");
const colorUnlocks = require("../../Community/utils/personalityColorUnlocks") as typeof import("../../Community/utils/personalityColorUnlocks");
const {
  PERSONALITY_CATEGORY_ROLE_IDS,
  persistPersonalityRoleDelta,
} = require("../../Community/utils/personalityRolePersistence") as typeof import("../../Community/utils/personalityRolePersistence");
const { ROLE_PANEL_CATEGORY_KEYS, normalizeRolePanelCategory } = require("../../Community/utils/ruoliColoriPanelComponents") as typeof import("../../Community/utils/ruoliColoriPanelComponents");
const {
  inferBirthYearFromAge,
  tryCelebrateBirthdayAfterProfileSave,
  isBirthdayDayChangeLocked,
  getRomeDateParts,
} = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const {
  getSerializedSiteNotifPrefs,
  mutateSiteNotifPrefs,
} = require("./siteNotifPrefs") as typeof import("./siteNotifPrefs");
const { applyViewAsToResolvedMember } = require("./siteViewAsPreview") as typeof import("./siteViewAsPreview");
const { discordRoleIconUrl } = require("../utils/discordRoleIconUrl") as typeof import("../utils/discordRoleIconUrl");

const ROLE_PANEL_LABELS = Object.freeze({
  pronouns: "Pronomi",
  age: "Età",
  zodiac: "Segno zodiacale",
  region: "Provenienza",
  dm: "Stato DM",
  relationship: "Stato sentimentale",
  mentions: "Ping",
  hobby: "Hobby",
  gaming: "Gaming",
  colors1: "Colori Base",
  colors_level: "Colori Livelli",
  colors_plus: "Colori Plus",
});

const EXTRAS_GET_CACHE_TTL_MS = 25_000;
const extrasGetCache = new Map();

function extrasCacheKey(userId?) {
  return String(userId || "");
}

function readExtrasCache(userId?) {
  const key = extrasCacheKey(userId);
  const hit = extrasGetCache.get(key);
  if (!hit || Number(hit.exp || 0) <= Date.now()) {
    extrasGetCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeExtrasCache(userId?, payload?) {
  const key = extrasCacheKey(userId);
  extrasGetCache.set(key, { exp: Date.now() + EXTRAS_GET_CACHE_TTL_MS, payload });
  if (extrasGetCache.size > 300) {
    const first = extrasGetCache.keys().next().value;
    if (first) extrasGetCache.delete(first);
  }
}

function clearExtrasCache(userId?) {
  const uid = extrasCacheKey(userId);
  if (!uid) return;
  extrasGetCache.delete(uid);
  for (const key of [...extrasGetCache.keys()]) {
    if (key === uid || String(key).indexOf(uid + ":") === 0) extrasGetCache.delete(key);
  }
}

function serializeDmPrefs(prefs?) {
  const blockAll = Boolean(prefs?.blockAll || prefs?.disabled?.has?.(DM_CATEGORY_ALL));
  const disabled = blockAll
    ? [...DM_CATEGORIES]
    : DM_CATEGORIES.filter((k?) => prefs?.disabled?.has?.(k));
  return {
    blockAll,
    categories: DM_CATEGORIES.map((key?) => ({
      key,
      label: DM_CATEGORY_LABELS[key] || key,
      enabled: !blockAll && !disabled.includes(key),
    })),
  };
}

async function readPrivacyState(guildId?, userId?) {
  const out: Record<string, any> = {};
  await Promise.all(
    PRIVACY_CONTENT_KINDS.map(async (kind?) => {
      const model = privacyContentModel(kind);
      const row = model ? await model.findOne({ guildId, userId }).lean().catch(() => null) : null;
      out[kind] = {
        key: kind,
        label: PRIVACY_CONTENT_LABELS[kind] || kind,
        blocked: Boolean(row?.blocked),
      };
    }),
  );
  return out;
}

function normalizeExtrasSection(raw?) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "birthday" || s === "privacy" || s === "roles" || s === "role_panel") return s === "role_panel" ? "roles" : s;
  if (s === "reactions" || s === "mention_reaction") return "reactions";
  if (s === "response" || s === "mention_response") return "response";
  return "";
}

function extrasSkeleton(userId?) {
  return {
    ok: true,
    status: 200,
    userId,
    dm: { blockAll: false, categories: [] },
    siteNotif: { groups: [] },
    privacy: { kinds: [] },
    birthday: { day: null, month: null, birthYear: null, showAge: true },
    mentionReaction: { access: false, max: 0, reactions: [], display: [] },
    mentionResponse: { access: false, accessHint: MENTION_RESPONSE_ACCESS_HINT_IT, text: "" },
    rolePanel: { categories: [], byKey: {} },
  };
}

/* rolesDiscordIcon1: nome Discord esatto (niente strip prefissi) + icona/emoji ruolo */
function buildRoleOption(guild?, roleId?, extra: Record<string, any> = {}) {
  const rid = String(roleId || "").trim();
  const role = guild?.roles?.cache?.get?.(rid);
  const label = String(role?.name || rid || "").trim() || rid;
  const icon = discordRoleIconUrl(role, { size: 64 });
  const emoji = String(role?.unicodeEmoji || "").trim();
  return {
    value: rid,
    label,
    iconUrl: String(icon.iconUrl || "").trim(),
    iconAnimated: Boolean(icon.iconAnimated),
    emoji,
    unlocked: true,
    ...extra,
  };
}

function isColorCategory(cat?) {
  return cat === "colors1" || cat === "colors_level" || cat === "colors_plus";
}

function categoryRolePool(cat?) {
  // Colori Base / Livelli / Plus: sempre lo stesso pool — max 1 colore totale.
  if (isColorCategory(cat)) return colorUnlocks.getAllPersonalityChatColorRoleIds();
  return PERSONALITY_CATEGORY_ROLE_IDS[cat] || [];
}

function isMultiToggleCategory(cat?) {
  return cat === "mentions" || cat === "hobby" || cat === "gaming";
}

async function buildRolePanelCategory(guild?, member?, cat?, prefetched: Record<string, any> = {}) {
  const key = normalizeRolePanelCategory(cat);
  const level =
    prefetched.level != null
      ? Number(prefetched.level) || 0
      : await colorUnlocks.fetchNumericProfileLevel(guild.id, member.id).catch(() => 0);
  const canPlus =
    typeof prefetched.canPlus === "boolean"
      ? prefetched.canPlus
      : await colorUnlocks.memberHasPlusColorFullEligibilityAsync(member).catch(() => false);
  let options = [{ value: "remove", label: "Rimuovi selezione" }];
  let selected = "";
  const selectedIds = [];
  const multi = isMultiToggleCategory(key);

  if (key === "colors_level") {
    const unlocked = colorUnlocks.listUnlockedTierRoleIds(level);
    for (const rid of unlocked) {
      if (!guild.roles.cache.has(rid)) continue;
      options.push(buildRoleOption(guild, rid));
      if (member.roles.cache.has(rid)) selected = rid;
    }
  } else if (key === "colors_plus") {
    const unlocked = colorUnlocks.listUnlockedPlusRoleIds(guild, canPlus, level);
    for (const rid of unlocked) {
      options.push(buildRoleOption(guild, rid));
      if (member.roles.cache.has(rid)) selected = rid;
    }
  } else if (key === "colors1") {
    for (const rid of colorUnlocks.listUnlockedNaturalRoleIds()) {
      if (!guild.roles.cache.has(rid)) continue;
      options.push(buildRoleOption(guild, rid));
      if (member.roles.cache.has(rid)) selected = rid;
    }
  } else {
    const pool = PERSONALITY_CATEGORY_ROLE_IDS[key] || [];
    for (const rid of pool) {
      if (!guild.roles.cache.has(rid)) continue;
      options.push(buildRoleOption(guild, rid));
      if (member.roles.cache.has(rid)) {
        selectedIds.push(rid);
        selected = rid;
      }
    }
  }

  return {
    key,
    label: ROLE_PANEL_LABELS[key] || key,
    selected: multi ? "" : selected || "",
    selectedIds: multi ? selectedIds : selected ? [selected] : [],
    multi,
    options,
    canPickPlus: canPlus,
    level,
  };
}

async function getProfileExtras(client?, { accessToken, section: sectionRaw, viewAs: viewAsRaw }: any = {}) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  let { guild, member, userId } = resolved;
  const viewAsApplied = applyViewAsToResolvedMember(member, viewAsRaw, {
    userId,
  });
  if (viewAsApplied.viewAs) {
    member = viewAsApplied.member;
  }
  const section = normalizeExtrasSection(sectionRaw);

  const cacheKey = section ? `${userId}:${section}` : userId;
  const cached = viewAsApplied.viewAs ? null : readExtrasCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  const needAll = !section;
  const needBirthday = needAll || section === "birthday";
  const needPrivacy = needAll || section === "privacy";
  const needRoles = needAll || section === "roles";
  const needReactions = needAll || section === "reactions";
  const needResponse = needAll || section === "response";
  const needDm = needAll;
  const needNotif = needAll;

  const [
    dmPrefs,
    siteNotif,
    privacy,
    birthday,
    reactionDoc,
    mentionResponse,
    profileLevel,
    canPlus,
  ] = await Promise.all([
    needDm ? getNoDmPreferences(guild.id, userId).catch(() => ({ blockAll: false, disabled: new Set() })) : null,
    needNotif
      ? getSerializedSiteNotifPrefs(guild.id, userId, { member }).catch(() => ({ groups: [] }))
      : null,
    needPrivacy ? readPrivacyState(guild.id, userId) : null,
    needBirthday ? getBirthdayProfile(guild.id, userId).catch(() => null) : null,
    needReactions ? MentionReaction.findOne({ guildId: guild.id, userId }).lean().catch(() => null) : null,
    needResponse ? getMentionResponse(guild.id, userId).catch(() => null) : null,
    needRoles ? colorUnlocks.fetchNumericProfileLevel(guild.id, userId).catch(() => 0) : 0,
    needRoles ? colorUnlocks.memberHasPlusColorFullEligibilityAsync(member).catch(() => false) : false,
  ]);

  const payload = extrasSkeleton(userId);

  if (needDm && dmPrefs) payload.dm = serializeDmPrefs(dmPrefs);
  if (needNotif && siteNotif) {
    payload.siteNotif = siteNotif && Array.isArray(siteNotif.groups) ? siteNotif : { groups: [] };
  }
  if (needPrivacy && privacy) {
    payload.privacy = { kinds: PRIVACY_CONTENT_KINDS.map((k?) => privacy[k]) };
  }
  if (needBirthday) {
    payload.birthday = birthday
      ? {
          day: Number(birthday.day) || null,
          month: Number(birthday.month) || null,
          birthYear: Number(birthday.birthYear) || null,
          showAge: birthday.showAge !== false,
        }
      : { day: null, month: null, birthYear: null, showAge: true };
  }
  if (needReactions) {
    const reactionMax = getCustomReactionMax(member);
    const reactionTokens = Array.isArray(reactionDoc?.reactions)
      ? reactionDoc.reactions.slice(0, reactionMax)
      : [];
    payload.mentionReaction = {
      access: memberHasCustomReactionRoleAccess(member),
      max: reactionMax,
      reactions: reactionTokens,
      display: reactionTokens.map((t?) => toDisplay(t, guild)).filter(Boolean),
    };
  }
  if (needResponse) {
    payload.mentionResponse = {
      access: memberHasMentionResponseAccess(member),
      accessHint: MENTION_RESPONSE_ACCESS_HINT_IT,
      text: String(mentionResponse?.text || "").trim(),
    };
  }
  if (needRoles) {
    const rolePrefetch = { level: Number(profileLevel) || 0, canPlus: Boolean(canPlus) };
    const rolePanels = await Promise.all(
      ROLE_PANEL_CATEGORY_KEYS.map((key?) => buildRolePanelCategory(guild, member, key, rolePrefetch)),
    );
    const roleCategories: Record<string, any> = {};
    for (const panel of rolePanels) {
      if (panel?.key) roleCategories[panel.key] = panel;
    }
    payload.rolePanel = {
      categories: ROLE_PANEL_CATEGORY_KEYS.map((k?) => ({
        key: k,
        label: ROLE_PANEL_LABELS[k] || k,
      })),
      byKey: roleCategories,
    };
  }

  if (!viewAsApplied.viewAs) writeExtrasCache(cacheKey, payload);
  return { ...payload, viewAs: viewAsApplied.viewAs || null };
}

async function mutateDm(guildId?, userId?, payload?) {
  const action = String(payload?.action || "").trim();
  if (action === "all_on") {
    await setNoDmCategories(guildId, userId, []);
  } else if (action === "all_off") {
    await setNoDmCategories(guildId, userId, [DM_CATEGORY_ALL]);
  } else if (action === "toggle") {
    const key = String(payload?.key || "").trim();
    if (!DM_CATEGORIES.includes(key)) return { ok: false, reason: "invalid_params", message: "Categoria DM non valida." };
    const prefs = await getNoDmPreferences(guildId, userId).catch(() => ({ blockAll: false, disabled: new Set() }));
    const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
    let next;
    if (isAll) next = DM_CATEGORIES.filter((k?) => k !== key);
    else {
      const disabled = new Set(prefs.disabled);
      if (disabled.has(key)) disabled.delete(key);
      else disabled.add(key);
      next = [...disabled];
    }
    await setNoDmCategories(guildId, userId, next.length ? next : []);
  } else {
    return { ok: false, reason: "invalid_action", message: "Azione DM non valida." };
  }
  const prefs = await getNoDmPreferences(guildId, userId);
  return { ok: true, dm: serializeDmPrefs(prefs), message: "Preferenze DM aggiornate." };
}

async function mutatePrivacy(guildId?, userId?, payload?) {
  const action = String(payload?.action || "").trim();
  if (action === "all_on" || action === "all_off") {
    const blocked = action === "all_off";
    await Promise.all(
      PRIVACY_CONTENT_KINDS.map((kind?) => {
        const model = privacyContentModel(kind);
        if (!model) return null;
        return model
          .findOneAndUpdate(
            { guildId, userId },
            { $set: { blocked }, $setOnInsert: { guildId, userId } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          )
          .catch(() => null);
      }),
    );
  } else if (action === "toggle") {
    const kind = String(payload?.key || "").trim();
    const model = privacyContentModel(kind);
    if (!model) return { ok: false, reason: "invalid_params", message: "Voce privacy non valida." };
    const current = await model.findOne({ guildId, userId }).lean().catch(() => null);
    const nextBlocked = !Boolean(current?.blocked);
    await model
      .findOneAndUpdate(
        { guildId, userId },
        { $set: { blocked: nextBlocked }, $setOnInsert: { guildId, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .catch(() => null);
  } else {
    return { ok: false, reason: "invalid_action", message: "Azione privacy non valida." };
  }
  return { ok: true, privacy: { kinds: Object.values(await readPrivacyState(guildId, userId)) }, message: "Privacy aggiornata." };
}

async function mutateBirthday(guild?, userId?, client?, payload?) {
  const action = String(payload?.action || "").trim();
  if (action === "clear") {
    await clearBirthdayProfile(guild.id, userId);
    return { ok: true, birthday: { day: null, month: null, birthYear: null, showAge: true }, message: "Compleanno rimosso." };
  }
  if (action === "privacy") {
    const current = (await getBirthdayProfile(guild.id, userId).catch(() => null)) || {};
    const showAge = payload?.showAge == null ? !(current.showAge === false) : Boolean(payload.showAge);
    if (!Number(current.day) || !Number(current.month) || !Number(current.birthYear)) {
      return { ok: false, reason: "birthday_incomplete", message: "Imposta prima giorno, mese e anno di nascita." };
    }
    await setBirthdayProfile(guild.id, userId, {
      day: Number(current.day),
      month: Number(current.month),
      birthYear: Number(current.birthYear),
      showAge,
      lastCelebratedYear: current.lastCelebratedYear,
      registrationMessageId: current.registrationMessageId,
      registrationChannelId: current.registrationChannelId,
    });
    const birthday = await getBirthdayProfile(guild.id, userId);
    return {
      ok: true,
      birthday: {
        day: Number(birthday?.day) || null,
        month: Number(birthday?.month) || null,
        birthYear: Number(birthday?.birthYear) || null,
        showAge: birthday?.showAge !== false,
      },
      message: "Privacy età aggiornata.",
    };
  }
  if (action === "set") {
    const day = Number(payload?.day);
    const month = Number(payload?.month);
    let birthYear = Number(payload?.birthYear);
    const age = Number(payload?.age);
    const current = (await getBirthdayProfile(guild.id, userId).catch(() => null)) || {};
    const showAge = payload?.showAge == null ? current.showAge !== false : Boolean(payload.showAge);
    if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > 31 || month < 1 || month > 12) {
      return { ok: false, reason: "invalid_date", message: "Data non valida (giorno/mese)." };
    }
    if (!Number.isInteger(birthYear) || birthYear < 1900) {
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        return { ok: false, reason: "invalid_age", message: "Indica l'anno di nascita (es. 2001)." };
      }
      birthYear = inferBirthYearFromAge(day, month, age);
    }
    const today = getRomeDateParts();
    const nowY = today.year;
    /* Data calendario reale (niente 31/02). */
    {
      const probe = new Date(Date.UTC(birthYear, month - 1, day));
      if (
        probe.getUTCFullYear() !== birthYear ||
        probe.getUTCMonth() !== month - 1 ||
        probe.getUTCDate() !== day
      ) {
        return { ok: false, reason: "invalid_date", message: "Data di nascita non valida." };
      }
    }
    /* Blocca anche “anno corrente ma giorno/mese futuri” (es. 31/12/2026 a novembre). */
    const isFuture =
      birthYear > nowY ||
      (birthYear === nowY && (month > today.month || (month === today.month && day > today.day)));
    if (isFuture) {
      return { ok: false, reason: "invalid_age", message: "La data di nascita non può essere nel futuro." };
    }
    if (birthYear < nowY - 120) {
      return { ok: false, reason: "invalid_age", message: "Anno di nascita non valido." };
    }
    /* Lock età: sotto i 13 anni non si salva il compleanno (pavimento Discord). */
    {
      const BIRTHDAY_MIN_AGE = 13;
      const hasBirthdayPassed = today.month > month || (today.month === month && today.day >= day);
      const ageNow = today.year - birthYear - (hasBirthdayPassed ? 0 : 1);
      if (ageNow < BIRTHDAY_MIN_AGE) {
        return {
          ok: false,
          reason: "underage",
          message: `Devi avere almeno ${BIRTHDAY_MIN_AGE} anni per impostare il compleanno.`,
        };
      }
    }
    const prevDay = Number(current.day) || 0;
    const prevMonth = Number(current.month) || 0;
    const dayMonthChanged = Boolean(prevDay && prevMonth) && (day !== prevDay || month !== prevMonth);
    if (dayMonthChanged) {
      const locked = await isBirthdayDayChangeLocked(guild, userId, current);
      if (locked) {
        return {
          ok: false,
          reason: "birthday_locked",
          message:
            "Non puoi cambiare giorno/mese: il compleanno di quest'anno è già stato annunciato (o hai ancora il ruolo compleanno). Puoi aggiornare solo l'anno o la privacy età.",
        };
      }
    }
    await setBirthdayProfile(guild.id, userId, {
      day,
      month,
      birthYear,
      showAge,
      lastCelebratedYear: current.lastCelebratedYear,
      registrationMessageId: current.registrationMessageId,
      registrationChannelId: current.registrationChannelId,
    });
    await tryCelebrateBirthdayAfterProfileSave(client, guild.id, userId).catch(() => null);
    const birthday = await getBirthdayProfile(guild.id, userId);
    const celebratedNow =
      Number(birthday?.day) === today.day &&
      Number(birthday?.month) === today.month &&
      Number(birthday?.lastCelebratedYear) === today.year;
    return {
      ok: true,
      birthday: {
        day: Number(birthday?.day) || null,
        month: Number(birthday?.month) || null,
        birthYear: Number(birthday?.birthYear) || null,
        showAge: birthday?.showAge !== false,
      },
      message: celebratedNow
        ? "Compleanno salvato. Oggi è il tuo giorno: annuncio in chat e multi ×2 attivi!"
        : "Compleanno salvato.",
    };
  }
  return { ok: false, reason: "invalid_action", message: "Azione compleanno non valida." };
}

async function mutateMentionReaction(guild?, member?, userId?, client?, payload?) {
  if (!memberHasCustomReactionRoleAccess(member)) {
    return {
      ok: false,
      reason: "missing_access",
      message: "Mention Reactions riservate a VIP, Booster, Double Booster, VIP+ o Level 70.",
    };
  }
  const action = String(payload?.action || "").trim();
  const max = getCustomReactionMax(member);
  if (action === "clear") {
    await MentionReaction.deleteOne({ guildId: guild.id, userId }).catch(() => null);
    return { ok: true, mentionReaction: { access: true, max, reactions: [], display: [] }, message: "Reaction rimosse." };
  }
  if (action === "set") {
    const tokens = Array.isArray(payload?.reactions)
      ? payload.reactions.map((t?) => String(t || "").trim()).filter(Boolean).slice(0, max)
      : parseReactionTokens(payload?.value || "", max, guild);
    if (!tokens.length) {
      await MentionReaction.deleteOne({ guildId: guild.id, userId }).catch(() => null);
      return {
        ok: true,
        mentionReaction: { access: true, max, reactions: [], display: [] },
        message: "Reaction rimosse.",
      };
    }
    await MentionReaction.findOneAndUpdate(
      { guildId: guild.id, userId },
      { $set: { reactions: tokens } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return {
      ok: true,
      mentionReaction: {
        access: true,
        max,
        reactions: tokens,
        display: tokens.map((t?) => toDisplay(t, guild)).filter(Boolean),
      },
      message: "Mention Reactions aggiornate.",
    };
  }
  return { ok: false, reason: "invalid_action", message: "Azione reaction non valida." };
}

async function mutateMentionResponse(guild?, member?, userId?, payload?) {
  if (!memberHasMentionResponseAccess(member)) {
    return {
      ok: false,
      reason: "missing_access",
      message: `Mention Response riservata a ${MENTION_RESPONSE_ACCESS_HINT_IT}.`,
    };
  }
  const action = String(payload?.action || "").trim();
  if (action === "clear") {
    await clearMentionResponse(guild.id, userId);
    return { ok: true, mentionResponse: { access: true, text: "", accessHint: MENTION_RESPONSE_ACCESS_HINT_IT }, message: "Risposta rimossa." };
  }
  if (action === "set") {
    const out: any = await setMentionResponse(guild.id, userId, payload?.text || "");
    if (!out?.ok) {
      return {
        ok: false,
        reason: out?.reason || "invalid_params",
        message: out?.userMessage || out?.message || "Testo non valido.",
      };
    }
    const row = await getMentionResponse(guild.id, userId);
    return {
      ok: true,
      mentionResponse: {
        access: true,
        text: String(row?.text || "").trim(),
        accessHint: MENTION_RESPONSE_ACCESS_HINT_IT,
      },
      message: "Mention Response salvata.",
    };
  }
  return { ok: false, reason: "invalid_action", message: "Azione response non valida." };
}

async function mutateRolePanel(guild?, member?, userId?, payload?) {
  const category = normalizeRolePanelCategory(payload?.category);
  const value = String(payload?.value || "").trim();
  if (!value) return { ok: false, reason: "invalid_params", message: "Seleziona un ruolo." };

  const level = await colorUnlocks.fetchNumericProfileLevel(guild.id, userId).catch(() => 0);
  const canPlus = await colorUnlocks.memberHasPlusColorFullEligibilityAsync(member).catch(() => false);
  const poolAll = categoryRolePool(category).filter((id?) => guild.roles.cache.has(id));
  const heldInPool = poolAll.filter((id?) => member.roles.cache.has(id));
  const isRemove = value === "remove";
  const multi = isMultiToggleCategory(category);

  if (!isRemove) {
    if (isColorCategory(category)) {
      if (!colorUnlocks.isAllowedColorValue(value, member, level, canPlus)) {
        return { ok: false, reason: "locked_color", message: "Non hai i requisiti per quel colore." };
      }
      if (category === "colors_plus" && !canPlus) {
        return { ok: false, reason: "locked_color", message: "Colori Plus non disponibili per il tuo account." };
      }
    } else {
      const pool = PERSONALITY_CATEGORY_ROLE_IDS[category] || [];
      if (!pool.includes(value)) {
        return { ok: false, reason: "invalid_params", message: "Ruolo non valido per questa categoria." };
      }
    }
    if (!guild.roles.cache.has(value)) {
      return { ok: false, reason: "role_not_found", message: "Ruolo non trovato sul server." };
    }
  }

  let toRemove = [];
  let addIds = [];
  let message = "Ruolo aggiornato.";

  if (isRemove) {
    toRemove = heldInPool;
    message = "Selezione rimossa.";
  } else if (multi) {
    // Ping / Hobby / Gaming: toggle — puoi tenerne più di uno.
    if (member.roles.cache.has(value)) {
      toRemove = [value];
      message = "Ruolo rimosso.";
    } else {
      addIds = [value];
      message = "Ruolo aggiunto.";
    }
  } else if (isColorCategory(category)) {
    // Base / Livelli / Plus: max 1 colore totale.
    toRemove = heldInPool.filter((id?) => id !== value);
    if (!member.roles.cache.has(value)) addIds = [value];
    message = "Colore aggiornato.";
  } else {
    // Pronomi / età / ecc.: esclusivi nella categoria.
    toRemove = heldInPool.filter((id?) => id !== value);
    if (!member.roles.cache.has(value)) addIds = [value];
  }

  if (toRemove.length) {
    await member.roles.remove(toRemove, `Profile role panel via sito (${category})`).catch(() => null);
  }
  if (addIds.length) {
    await member.roles.add(addIds, `Profile role panel via sito (${category})`).catch(() => null);
  }

  await persistPersonalityRoleDelta(guild.id, userId, {
    added: addIds,
    removed: toRemove,
  }).catch(() => null);

  const fresh = await guild.members.fetch({ user: userId, force: true }).catch(() => member);
  const panel = await buildRolePanelCategory(guild, fresh, category);
  return {
    ok: true,
    rolePanelCategory: panel,
    message,
  };
}

async function mutateProfileExtras(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const section = String(payload?.section || "").trim().toLowerCase();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  const { guild, member, userId } = resolved;

  let result;
  try {
    if (section === "dm") result = await mutateDm(guild.id, userId, payload);
    else if (section === "site_notif") {
      result = await mutateSiteNotifPrefs(guild.id, userId, payload, { member });
    }
    else if (section === "privacy") result = await mutatePrivacy(guild.id, userId, payload);
    else if (section === "birthday") result = await mutateBirthday(guild, userId, client, payload);
    else if (section === "mention_reaction" || section === "reactions") {
      result = await mutateMentionReaction(guild, member, userId, client, payload);
    } else if (section === "mention_response" || section === "response") {
      result = await mutateMentionResponse(guild, member, userId, payload);
    } else if (section === "roles" || section === "role_panel") {
      result = await mutateRolePanel(guild, member, userId, payload);
    } else {
      return { ok: false, status: 400, error: "invalid_section", message: "Sezione non valida." };
    }
  } catch (err) {
    global.logger?.error?.("[siteProfileExtrasApi] mutate:", err);
    return { ok: false, status: 500, error: "internal", message: "Errore interno." };
  }

  if (!result?.ok) {
    const statusMap = {
      invalid_params: 400,
      invalid_action: 400,
      invalid_date: 400,
      invalid_age: 400,
      birthday_incomplete: 400,
      birthday_locked: 403,
      missing_access: 403,
      locked_color: 403,
      role_not_found: 404,
    };
    return {
      ok: false,
      status: statusMap[result?.reason] || 400,
      error: result?.reason || "error",
      message: result?.message || "Operazione non riuscita.",
    };
  }

  clearExtrasCache(userId);
  return { ok: true, status: 200, ...result };
}

export = {
  getProfileExtras,
  mutateProfileExtras,
  DM_CATEGORIES,
  DM_CATEGORY_LABELS,
};
