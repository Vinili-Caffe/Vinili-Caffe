const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { fetchDiscordUser } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { exportUserGdprData } = require("../../Services/Community/gdprUserDataExportService") as typeof import("../../Services/Community/gdprUserDataExportService");
const { eraseUserGdprData } = require("../../Services/Community/gdprUserDataEraseService") as typeof import("../../Services/Community/gdprUserDataEraseService");

const EXPORT_COOLDOWN_MS = 15 * 60 * 1000;
const ERASE_COOLDOWN_MS = 60 * 60 * 1000;
const exportCooldownByUser = new Map();
const eraseCooldownByUser = new Map();

function pruneCooldownMap(map?, ttlMs?) {
  const now = Date.now();
  for (const [key, at] of map) {
    if (now - at > ttlMs) map.delete(key);
  }
}

function cooldownRemainingMs(map?, userId?, ttlMs?) {
  pruneCooldownMap(map, ttlMs);
  const at = map.get(String(userId || ""));
  if (!at) return 0;
  return Math.max(0, ttlMs - (Date.now() - at));
}

function markCooldown(map?, userId?) {
  map.set(String(userId || ""), Date.now());
}

function fail(status?, error?, message?, extra: Record<string, any> = {}) {
  return { ok: false, status, error, message, ...extra };
}

function resolveMainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function normalizeConfirmToken(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

async function exportSelfGdprData(client?, accessToken?) {
  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;

  const uid = String(user.userId || "").trim();
  const waitMs = cooldownRemainingMs(exportCooldownByUser, uid, EXPORT_COOLDOWN_MS);
  if (waitMs > 0) {
    return fail(429, "rate_limited", "Hai già richiesto un export di recente. Riprova tra poco.", {
      retryAfterMs: waitMs,
    });
  }

  const guildId = resolveMainGuildId(client);
  const exportResult = await exportUserGdprData({
    guildId,
    userId: uid,
    requestedByUserId: uid,
  }).catch((err?) => {
    global.logger?.error?.("[gdpr-self-export]", err?.message || err);
    return { ok: false, reason: "export_failed" };
  });

  if (!exportResult?.ok) {
    return fail(500, "export_failed", "Export non riuscito. Riprova più tardi.");
  }

  markCooldown(exportCooldownByUser, uid);

  return {
    ok: true,
    status: 200,
    user: { id: uid, username: user.username || null },
    filename: exportResult.filename,
    byteSize: exportResult.byteSize,
    tooLarge: Boolean(exportResult.tooLarge),
    summary: exportResult.summary || {},
    jsonText: exportResult.tooLarge ? null : exportResult.jsonText,
  };
}

async function eraseSelfGdprData(client?, accessToken?, body: Record<string, any> = {}) {
  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;

  const uid = String(user.userId || "").trim();
  const username = String(user.username || "").trim();
  const confirm = body?.confirm === true;
  const confirmToken = normalizeConfirmToken(body?.confirmToken);
  const expectedTokens = new Set(
    [uid, username, username ? username.toLowerCase() : ""]
      .map((x?) => normalizeConfirmToken(x))
      .filter(Boolean),
  );

  if (!confirm) {
    const guildId = resolveMainGuildId(client);
    const preview = await eraseUserGdprData({
      guildId,
      userId: uid,
      client,
      dryRun: true,
    }).catch((err?) => {
      global.logger?.error?.("[gdpr-self-erase-preview]", err?.message || err);
      return { ok: false, reason: "erase_failed" };
    });
    if (!preview?.ok) {
      return fail(500, "erase_failed", "Anteprima cancellazione non riuscita.");
    }
    return {
      ok: true,
      status: 200,
      preview: true,
      user: { id: uid, username: username || null },
      deleted: preview.deleted || {},
      retained: preview.retained || {},
      trimmedProfiles: preview.trimmedProfiles || null,
      message: "Anteprima: nessun dato cancellato.",
    };
  }

  if (!confirmToken || !expectedTokens.has(confirmToken)) {
    return fail(
      400,
      "confirm_mismatch",
      "Per confermare digita il tuo username Discord o il tuo ID utente.",
    );
  }

  const waitMs = cooldownRemainingMs(eraseCooldownByUser, uid, ERASE_COOLDOWN_MS);
  if (waitMs > 0) {
    return fail(429, "rate_limited", "Hai già richiesto una cancellazione di recente. Riprova più tardi.", {
      retryAfterMs: waitMs,
    });
  }

  const guildId = resolveMainGuildId(client);
  const eraseResult = await eraseUserGdprData({
    guildId,
    userId: uid,
    client,
    dryRun: false,
  }).catch((err?) => {
    global.logger?.error?.("[gdpr-self-erase]", err?.message || err);
    return { ok: false, reason: "erase_failed" };
  });

  if (!eraseResult?.ok) {
    return fail(500, "erase_failed", "Cancellazione non riuscita. Riprova più tardi.");
  }

  markCooldown(eraseCooldownByUser, uid);

  return {
    ok: true,
    status: 200,
    preview: false,
    user: { id: uid, username: username || null },
    deleted: eraseResult.deleted || {},
    retained: eraseResult.retained || {},
    trimmedProfiles: eraseResult.trimmedProfiles || null,
    message: "Cancellazione completata per i dati eliminabili.",
  };
}

export = {
  exportSelfGdprData,
  eraseSelfGdprData,
};
