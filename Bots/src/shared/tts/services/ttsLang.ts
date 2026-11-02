/** TTS: lingua scelta da ogni utente. */
const { ttsUserLangFindManyLean, ttsUserLangFindOneLean, ttsUserLangUpsert } = require("../../botState/domainStatesStore") as typeof import("../../botState/domainStatesStore");

const userLangs = new Map();

async function warmUserTtsLangsFromDb() {
  try {
    const rows = await ttsUserLangFindManyLean().catch(() => []);
    for (const row of rows || []) {
      if (row?.userId != null && row?.lang) {
        userLangs.set(String(row.userId).trim(), String(row.lang));
      }
    }
  } catch (err) {
    global.logger?.warn?.("[TTS] warmUserTtsLangsFromDb:", err?.message || err);
  }
}

async function hydrateUserTtsLangForUser(userId?) {
  const uid = String(userId || "").trim();
  if (!uid || userLangs.has(uid)) return;
  const row = await ttsUserLangFindOneLean(uid).catch(() => null);
  userLangs.set(uid, row?.lang ? String(row.lang) : false);
}

function setUserTtsLang(userId?, lang?) {
  if (!userId) return;
  const uid = String(userId).trim();
  if (!uid) return;
  if (!lang) {
    userLangs.delete(uid);
    void ttsUserLangUpsert(uid, null).catch((err?) =>
      global.logger?.warn?.("[TTS] persist user lang clear:", err?.message || err),
    );
    return;
  }
  userLangs.set(uid, String(lang));
  void ttsUserLangUpsert(uid, String(lang)).catch((err?) =>
    global.logger?.warn?.("[TTS] persist user lang:", err?.message || err),
  );
}
function getUserTtsLang(userId?) {
  if (userId == null) return null;
  const uid = String(userId).trim();
  const v = userLangs.get(uid);
  if (v === false) return null;
  if (typeof v === "string") return v;
  return null;
}

function resolveDefaultTtsLang(client?) {
  const raw = String(client?.config?.tts?.lang || client?.config?.voiceClip?.language || "it").trim().toLowerCase();
  return raw.split("-")[0] || "it";
}

export = { warmUserTtsLangsFromDb, hydrateUserTtsLangForUser, setUserTtsLang, getUserTtsLang, resolveDefaultTtsLang };
