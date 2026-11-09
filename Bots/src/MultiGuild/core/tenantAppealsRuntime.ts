/**
 * Impostazioni ricorsi (Dyno-like) + check periodo di attesa / allow.
 */
const {
  getTenantModerationExtras,
  getTenantModerationExtrasSync,
  ensureTenantModerationCacheFresh,
  DEFAULT_APPEALS,
} = require("./tenantModerationSettings") as typeof import("./tenantModerationSettings");
const { findOpenCases } = require("../../Vinili/Moderation/utils/modCaseStore") as typeof import("../../Vinili/Moderation/utils/modCaseStore");

function dayMs(days?) {
  const n = Math.max(0, Math.floor(Number(days) || 0));
  return n * 24 * 60 * 60 * 1000;
}

async function getAppealsSettings(guildId?) {
  await ensureTenantModerationCacheFresh().catch(() => null);
  const extras = getTenantModerationExtrasSync(guildId);
  return extras?.appeals && typeof extras.appeals === "object" ? extras.appeals : { ...DEFAULT_APPEALS };
}

async function getAppealsSettingsFresh(guildId?) {
  const extras = await getTenantModerationExtras(guildId);
  return extras?.appeals && typeof extras.appeals === "object" ? extras.appeals : { ...DEFAULT_APPEALS };
}

function latestCaseCreatedAtMs(cases?) {
  let best = 0;
  for (const row of Array.isArray(cases) ? cases : []) {
    const t = Date.parse(String(row?.createdAt || ""));
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string, message: string, cooldown_until_ms?: number }}
 */
async function assertAppealAllowed(guildId?, kind?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const type = String(kind || "").toLowerCase() === "unmute" ? "unmute" : "unban";
  const appeals = await getAppealsSettingsFresh(gid);

  if (type === "unban" && appeals.allowBanned === false) {
    return {
      ok: false,
      status: 403,
      error: "appeals_disabled",
      message: "I ricorsi unban sono disattivati su questo server.",
    };
  }
  if (type === "unmute" && appeals.allowMuted === false) {
    return {
      ok: false,
      status: 403,
      error: "appeals_disabled",
      message: "I ricorsi unmute sono disattivati su questo server.",
    };
  }

  const waitDays = type === "unmute" ? Number(appeals.waitDaysMute) || 0 : Number(appeals.waitDaysBan) || 0;
  if (waitDays > 0 && uid) {
    const action = type === "unmute" ? "MUTE" : "BAN";
    const open = await findOpenCases(gid, uid, action).catch(() => []);
    const startedAt = latestCaseCreatedAtMs(open);
    if (startedAt > 0) {
      const until = startedAt + dayMs(waitDays);
      if (until > Date.now()) {
        return {
          ok: false,
          status: 429,
          error: "waiting_period",
          cooldown_until_ms: until,
          message:
            type === "unmute"
              ? `Devi attendere ${waitDays} giorni dal mute prima di poter fare ricorso.`
              : `Devi attendere ${waitDays} giorni dal ban prima di poter fare ricorso.`,
        };
      }
    }
  }

  return { ok: true };
}

function appealResubmitCooldownMs(appeals?, kind?) {
  const type = String(kind || "").toLowerCase() === "unmute" ? "unmute" : "unban";
  const configured =
    type === "unmute" ? Number(appeals?.waitDaysMute) || 0 : Number(appeals?.waitDaysBan) || 0;
  // Default storico sito: 15 giorni tra un ricorso e il successivo, se l’attesa è 0.
  const days = configured > 0 ? configured : 15;
  return dayMs(days);
}

function resolveAppealInviteUrl(appeals?, fallback?) {
  const raw = String(appeals?.inviteUrl || fallback || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(discord\.gg\/|discord\.com\/invite\/)/i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  if (/^[A-Za-z0-9-]{2,64}$/.test(raw)) return `https://discord.gg/${raw}`;
  return raw;
}

export = {
  getAppealsSettings,
  getAppealsSettingsFresh,
  assertAppealAllowed,
  appealResubmitCooldownMs,
  resolveAppealInviteUrl,
  dayMs,
};
