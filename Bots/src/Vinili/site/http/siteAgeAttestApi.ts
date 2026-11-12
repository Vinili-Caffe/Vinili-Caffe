"use strict";

const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/siteDocumentSchema") as typeof import("../../Community/schemas/siteDocumentSchema");
const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");
const {
  getBirthdayProfile,
  setBirthdayProfile,
  clearBirthdayProfile,
} = require("../../Community/services/profileStore") as typeof import("../../Community/services/profileStore");
const {
  getRomeDateParts,
  tryCelebrateBirthdayAfterProfileSave,
} = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const MIN_AGE = 13;
const STAFF_UNDERAGE_THREAD_ID = "1519340883734958152";
const DOC_TYPE = SITE_DOCUMENT_TYPE.SITE_AGE_ATTESTATION;

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseBirthIso(iso?) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  return { y, mo, d, birthIso: `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function ageFromParts(y?, mo?, d?, now = new Date()) {
  let age = now.getUTCFullYear() - Number(y);
  const beforeBirthday =
    now.getUTCMonth() + 1 < Number(mo) || (now.getUTCMonth() + 1 === Number(mo) && now.getUTCDate() < Number(d));
  if (beforeBirthday) age -= 1;
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  return age;
}

function payloadOf(doc?) {
  const p = doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  return {
    birthIso: String(p.birthIso || "").trim() || null,
    minAge: Number(p.minAge) || MIN_AGE,
    attestedAt: p.attestedAt ? String(p.attestedAt) : null,
    notifiedAt: p.notifiedAt ? String(p.notifiedAt) : null,
    birthdayAutoSeedDone: p.birthdayAutoSeedDone === true,
  };
}

function publicState(doc?) {
  if (!doc) return { status: "missing", birthIso: null, minAge: MIN_AGE };
  const payload = payloadOf(doc);
  const status = String(doc.status || "").trim() === "blocked" ? "blocked" : String(doc.status || "").trim() === "ok" ? "ok" : "missing";
  return {
    status,
    birthIso: status === "ok" || status === "blocked" ? payload.birthIso : null,
    minAge: MIN_AGE,
    attestedAt: payload.attestedAt,
  };
}

async function findAttestDoc(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  return SiteDocument.findOne({ docType: DOC_TYPE, userId: uid }).lean().catch(() => null);
}

async function upsertAttestDoc(userId?, fields: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  const status = String(fields.status || "").trim();
  const birthIso = String(fields.birthIso || "").trim();
  const attestedAt = fields.attestedAt || new Date().toISOString();
  const existing = await findAttestDoc(uid);
  const prev = payloadOf(existing);
  const notifiedAt =
    fields.notifiedAt !== undefined ? fields.notifiedAt : prev.notifiedAt;
  const birthdayAutoSeedDone =
    fields.birthdayAutoSeedDone !== undefined
      ? Boolean(fields.birthdayAutoSeedDone)
      : prev.birthdayAutoSeedDone;
  const payload = {
    birthIso: birthIso || prev.birthIso,
    minAge: MIN_AGE,
    attestedAt: prev.attestedAt || attestedAt,
    notifiedAt: notifiedAt || null,
    birthdayAutoSeedDone,
  };
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, userId: uid },
    {
      $set: { status, payload },
      $setOnInsert: { docType: DOC_TYPE, userId: uid },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  return findAttestDoc(uid);
}

/**
 * Copia la data dell’autodichiarazione sul compleanno profilo (modificabile in Personalizza).
 * Una sola volta per account: non sovrascrive un compleanno già impostato e non ripete dopo clear.
 */
async function maybeSeedBirthdayFromAttest(client?, userId?, birthIso?) {
  const uid = String(userId || "").trim();
  const guildId = resolveGuildId(client);
  const parsed = parseBirthIso(birthIso);
  if (!uid || !guildId || !parsed) return false;

  const doc = await findAttestDoc(uid);
  const prev = payloadOf(doc);
  if (prev.birthdayAutoSeedDone) return false;

  const current = (await getBirthdayProfile(guildId, uid).catch(() => null)) || {};
  const hasBirthday =
    Number(current.day) >= 1 &&
    Number(current.month) >= 1 &&
    Number(current.birthYear) >= 1900;

  if (!hasBirthday) {
    await setBirthdayProfile(guildId, uid, {
      day: parsed.d,
      month: parsed.mo,
      birthYear: parsed.y,
      /* Auto da gate età: età nascosta di default; l’utente può attivarla in Personalizza. */
      showAge: false,
      lastCelebratedYear: current.lastCelebratedYear,
      registrationMessageId: current.registrationMessageId,
      registrationChannelId: current.registrationChannelId,
    }).catch(() => null);
    await tryCelebrateBirthdayAfterProfileSave(client, guildId, uid).catch(() => null);
  }

  await upsertAttestDoc(uid, {
    status: String(doc?.status || "ok").trim() || "ok",
    birthIso: parsed.birthIso,
    attestedAt: prev.attestedAt || new Date().toISOString(),
    notifiedAt: prev.notifiedAt,
    birthdayAutoSeedDone: true,
  });
  return !hasBirthday;
}

async function maybeSeedFromBirthday(client?, userId?) {
  const guildId = resolveGuildId(client);
  if (!guildId || !userId) return null;
  const bday = await getBirthdayProfile(guildId, userId).catch(() => null);
  const day = Number(bday?.day);
  const month = Number(bday?.month);
  const birthYear = Number(bday?.birthYear);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(birthYear)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || birthYear < 1900) return null;
  const today = getRomeDateParts();
  const hasBirthdayPassed = today.month > month || (today.month === month && today.day >= day);
  const ageNow = Math.max(0, today.year - birthYear - (hasBirthdayPassed ? 0 : 1));
  if (ageNow < MIN_AGE) return null;
  const birthIso = `${String(birthYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const existing = await findAttestDoc(userId);
  if (existing && String(existing.status || "").trim() === "ok") return existing;
  /* blocked: lascia che syncAgeAndBirthdayForUser rivaluti (soglia / date future). */
  if (existing && String(existing.status || "").trim() === "blocked") return existing;
  return upsertAttestDoc(userId, {
    status: "ok",
    birthIso,
    attestedAt: new Date().toISOString(),
    birthdayAutoSeedDone: true,
  });
}

function isFutureDobParts(y?, mo?, d?, today = getRomeDateParts()) {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year > today.year) return true;
  if (year < today.year) return false;
  if (month > today.month) return true;
  if (month < today.month) return false;
  return day > today.day;
}

function ageNowFromParts(y?, mo?, d?, today = getRomeDateParts()) {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (isFutureDobParts(year, month, day, today)) return null;
  const hasBirthdayPassed = today.month > month || (today.month === month && today.day >= day);
  const ageNow = today.year - year - (hasBirthdayPassed ? 0 : 1);
  if (!Number.isFinite(ageNow) || ageNow < 0 || ageNow > 120) return null;
  return ageNow;
}

async function clearInvalidFutureBirthday(guildId?, userId?, day?, month?, birthYear?) {
  if (!isFutureDobParts(birthYear, month, day)) return false;
  await clearBirthdayProfile(guildId, userId).catch(() => null);
  return true;
}

async function resetAttestDoc(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  await SiteDocument.deleteOne({ docType: DOC_TYPE, userId: uid }).catch(() => null);
}

/**
 * Allinea autodichiarazione ↔ compleanno per un utente (solo se esiste già una data).
 * Rivaluta anche i bloccati: ≥ MIN_AGE → sblocco; data futura → reset.
 * Non inventa date: senza birthday e senza attest non fa nulla.
 */
async function syncAgeAndBirthdayForUser(client?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return { userId: uid, action: "skip", reason: "missing_user" };
  const guildId = resolveGuildId(client);
  if (!guildId) return { userId: uid, action: "skip", reason: "missing_guild" };

  let attest = await findAttestDoc(uid);
  let attestStatus = String(attest?.status || "").trim();
  let attestPayload = payloadOf(attest);
  let bday = (await getBirthdayProfile(guildId, uid).catch(() => null)) || {};
  let day = Number(bday.day);
  let month = Number(bday.month);
  let birthYear = Number(bday.birthYear);
  let hasBirthday =
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    Number.isInteger(birthYear) &&
    day >= 1 &&
    day <= 31 &&
    month >= 1 &&
    month <= 12 &&
    birthYear >= 1900;

  /* Compleanni futuri (es. 31/12/2026): azzera profilo. */
  if (hasBirthday && (await clearInvalidFutureBirthday(guildId, uid, day, month, birthYear))) {
    hasBirthday = false;
    day = month = birthYear = NaN;
    bday = {};
  }

  const attestParsed = parseBirthIso(attestPayload.birthIso);
  const attestIsFuture = attestParsed
    ? isFutureDobParts(attestParsed.y, attestParsed.mo, attestParsed.d)
    : false;
  const attestAge = attestParsed && !attestIsFuture
    ? ageNowFromParts(attestParsed.y, attestParsed.mo, attestParsed.d)
    : null;

  /* Bloccati con data futura: reset totale → possono ridichiarare. */
  if (attestStatus === "blocked" && (attestIsFuture || !attestParsed)) {
    await resetAttestDoc(uid);
    if (hasBirthday) {
      /* se resta un compleanno valido, ricadiamo sotto */
      attest = null;
      attestStatus = "";
      attestPayload = payloadOf(null);
    } else {
      return { userId: uid, action: "reset_future", reason: "future_or_invalid_blocked" };
    }
  }

  /* Bloccati ma ≥ soglia attuale (es. erano sotto i 14, ora min 13): sblocca. */
  if (attestStatus === "blocked") {
    let unlockIso = null;
    let unlockAge = null;
    if (attestAge != null && attestAge >= MIN_AGE && attestParsed) {
      unlockIso = attestParsed.birthIso;
      unlockAge = attestAge;
    } else if (hasBirthday) {
      const ageB = ageNowFromParts(birthYear, month, day);
      if (ageB != null && ageB >= MIN_AGE) {
        unlockIso = `${String(birthYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        unlockAge = ageB;
      }
    }
    if (unlockIso) {
      await upsertAttestDoc(uid, {
        status: "ok",
        birthIso: unlockIso,
        attestedAt: attestPayload.attestedAt || new Date().toISOString(),
        birthdayAutoSeedDone: true,
      });
      await maybeSeedBirthdayFromAttest(client, uid, unlockIso).catch(() => null);
      return { userId: uid, action: "unblocked_eligible", birthIso: unlockIso, age: unlockAge };
    }
    return { userId: uid, action: "skip", reason: "already_blocked" };
  }

  /* Attest ok ma con data futura: reset. */
  if (attestStatus === "ok" && attestIsFuture) {
    await resetAttestDoc(uid);
    if (!hasBirthday) {
      return { userId: uid, action: "reset_future", reason: "future_ok_attest" };
    }
    attest = null;
    attestStatus = "";
    attestPayload = payloadOf(null);
  }

  if (attestStatus === "ok" && attestPayload.birthIso) {
    const seeded = await maybeSeedBirthdayFromAttest(client, uid, attestPayload.birthIso);
    return { userId: uid, action: seeded ? "birthday_seeded" : "ok_synced", birthIso: attestPayload.birthIso };
  }

  if (hasBirthday) {
    const ageNow = ageNowFromParts(birthYear, month, day);
    const birthIso = `${String(birthYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (ageNow == null || ageNow < MIN_AGE) {
      await upsertAttestDoc(uid, {
        status: "blocked",
        birthIso,
        attestedAt: new Date().toISOString(),
        notifiedAt: new Date().toISOString(),
        birthdayAutoSeedDone: true,
      });
      return { userId: uid, action: "blocked_underage", birthIso, age: ageNow == null ? 0 : ageNow };
    }
    await upsertAttestDoc(uid, {
      status: "ok",
      birthIso,
      attestedAt: new Date().toISOString(),
      birthdayAutoSeedDone: true,
    });
    return { userId: uid, action: "attest_from_birthday", birthIso, age: ageNow };
  }

  return { userId: uid, action: "skip", reason: "no_dob" };
}

async function resolveAuthedUser(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Authorization Bearer richiesto." };
  }
  const out = await fetchDiscordOAuthMe(token, { timeoutMs: 9000 });
  if (!out.ok || !out.me?.id) {
    return {
      ok: false,
      status: Number(out.status) || 401,
      error: out.error || "unauthorized",
      message: out.message || "Login Discord richiesto.",
    };
  }
  const me = out.me;
  const username = String(me.global_name || me.username || me.id || "").trim();
  return { ok: true, status: 200, userId: String(me.id), username, me };
}

async function notifyUnderageStaff(client?, { userId, username, birthIso, age }: Record<string, any> = {}) {
  try {
    const channel =
      client?.channels?.cache?.get?.(STAFF_UNDERAGE_THREAD_ID) ||
      (await client?.channels?.fetch?.(STAFF_UNDERAGE_THREAD_ID).catch(() => null));
    if (!channel || typeof channel.send !== "function") {
      global.logger?.warn?.("[WEBHOOK] site-age-attest: thread staff non raggiungibile");
      return false;
    }
    const when = new Date().toISOString();
    const label = String(username || userId || "utente").trim();
    const content = [
      "**Avviso — minore di 13 anni (sito)**",
      `Utente: <@${userId}> (\`${label}\`)`,
      `ID Discord: \`${userId}\``,
      `Data di nascita dichiarata: \`${birthIso}\` (età calcolata: **${age}** anni)`,
      `Soglia: ${MIN_AGE} anni — accesso al sito bloccato.`,
      `Registrato: \`${when}\``,
    ].join("\n");
    await channel.send({
      content,
      allowedMentions: { users: [String(userId)] },
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-age-attest notify underage:", err?.message || err);
    return false;
  }
}

async function handleSiteAgeAttestGet(client?, req?, res?) {
  try {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const auth = await resolveAuthedUser(accessToken);
    if (!auth.ok) {
      return res.status(Number(auth.status) || 401).json({
        ok: false,
        error: auth.error,
        message: auth.message,
        status: "missing",
        minAge: MIN_AGE,
      });
    }
    let doc = await findAttestDoc(auth.userId);
    if (!doc) {
      doc = await maybeSeedFromBirthday(client, auth.userId);
    }
    const state = publicState(doc);
    if (state.status === "ok" && state.birthIso) {
      void maybeSeedBirthdayFromAttest(client, auth.userId, state.birthIso).catch(() => null);
    }
    return res.status(200).json({ ok: true, ...state });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-age-attest get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno.", status: "missing", minAge: MIN_AGE });
  }
}

async function handleSiteAgeAttestPost(client?, req?, res?) {
  try {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const auth = await resolveAuthedUser(accessToken);
    if (!auth.ok) {
      return res.status(Number(auth.status) || 401).json({
        ok: false,
        error: auth.error,
        message: auth.message,
        status: "missing",
        minAge: MIN_AGE,
      });
    }

    let existing = await findAttestDoc(auth.userId);
    if (existing) {
      const state = publicState(existing);
      if (state.status === "blocked") {
        const prevPayload = payloadOf(existing);
        if (!prevPayload.notifiedAt && prevPayload.birthIso) {
          const age = (() => {
            const p = parseBirthIso(prevPayload.birthIso);
            return p ? ageFromParts(p.y, p.mo, p.d) : null;
          })();
          if (age != null) {
            const sent = await notifyUnderageStaff(client, {
              userId: auth.userId,
              username: auth.username,
              birthIso: prevPayload.birthIso,
              age,
            });
            if (sent) {
              existing = await upsertAttestDoc(auth.userId, {
                status: "blocked",
                birthIso: prevPayload.birthIso,
                attestedAt: prevPayload.attestedAt || new Date().toISOString(),
                notifiedAt: new Date().toISOString(),
              });
            }
          }
        }
        return res.status(403).json({
          ok: false,
          error: "underage",
          reason: "underage",
          message: `Accesso non consentito: è richiesta un’età minima di ${MIN_AGE} anni.`,
          ...publicState(existing),
        });
      }
      if (state.status === "ok") {
        if (state.birthIso) {
          void maybeSeedBirthdayFromAttest(client, auth.userId, state.birthIso).catch(() => null);
        }
        return res.status(200).json({
          ok: true,
          message: "Autodichiarazione già registrata e non modificabile.",
          ...state,
        });
      }
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.attested !== true) {
      return res.status(400).json({
        ok: false,
        error: "attestation_required",
        message: "È necessario accettare l’autodichiarazione di età.",
        status: "missing",
        minAge: MIN_AGE,
      });
    }

    /* Checkbox-only: niente data di nascita obbligatoria. Se arriva ancora una data (legacy),
       restano i controlli underage/validità; altrimenti registra solo l’ok a spunta. */
    const parsed = parseBirthIso(body.birthIso);
    if (parsed) {
      const age = ageFromParts(parsed.y, parsed.mo, parsed.d);
      if (age == null) {
        return res.status(400).json({
          ok: false,
          error: "invalid_date",
          message: "Indicare una data di nascita valida.",
          status: "missing",
          minAge: MIN_AGE,
        });
      }

      if (age < MIN_AGE) {
        let notifiedAt = null;
        const prevPayload = payloadOf(existing);
        if (!prevPayload.notifiedAt) {
          const sent = await notifyUnderageStaff(client, {
            userId: auth.userId,
            username: auth.username,
            birthIso: parsed.birthIso,
            age,
          });
          if (sent) notifiedAt = new Date().toISOString();
        } else {
          notifiedAt = prevPayload.notifiedAt;
        }
        const doc = await upsertAttestDoc(auth.userId, {
          status: "blocked",
          birthIso: parsed.birthIso,
          attestedAt: new Date().toISOString(),
          notifiedAt,
        });
        const state = publicState(doc);
        return res.status(403).json({
          ok: false,
          error: "underage",
          reason: "underage",
          message: `Accesso non consentito: è richiesta un’età minima di ${MIN_AGE} anni.`,
          ...state,
        });
      }

      const doc = await upsertAttestDoc(auth.userId, {
        status: "ok",
        birthIso: parsed.birthIso,
        attestedAt: new Date().toISOString(),
      });
      await maybeSeedBirthdayFromAttest(client, auth.userId, parsed.birthIso).catch(() => null);
      const state = publicState(doc);
      return res.status(200).json({
        ok: true,
        message: "Autodichiarazione registrata.",
        ...state,
      });
    }

    const doc = await upsertAttestDoc(auth.userId, {
      status: "ok",
      birthIso: "",
      attestedAt: new Date().toISOString(),
    });
    const state = publicState(doc);
    return res.status(200).json({
      ok: true,
      message: "Autodichiarazione registrata.",
      ...state,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-age-attest post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno.", status: "missing", minAge: MIN_AGE });
  }
}

export = {
  handleSiteAgeAttestGet,
  handleSiteAgeAttestPost,
  syncAgeAndBirthdayForUser,
  maybeSeedBirthdayFromAttest,
  maybeSeedFromBirthday,
  MIN_AGE,
  STAFF_UNDERAGE_THREAD_ID,
};
