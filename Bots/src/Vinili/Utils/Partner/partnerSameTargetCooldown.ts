const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const PARTNER_SAME_TARGET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function escapeRegExp(s?) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getLatestPartnerCreateAtForTarget(guildId?, partnerGuildId?, inviteCode?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const pg = String(partnerGuildId || "").trim();
  const code = String(inviteCode || "").trim().toLowerCase();

  const or = [];
  if (pg && /^\d{17,22}$/.test(pg)) {
    or.push({ "staff.partnerActions.partnerGuildId": pg });
  }
  if (code) {
    const e = escapeRegExp(code);
    or.push({ "staff.partnerActions.invite": new RegExp(`discord\\.gg/${e}(?:\\?|[/\\s]|$)`, "i") });
    or.push({ "staff.partnerActions.invite": new RegExp(`discord\\.com/invite/${e}(?:\\?|[/\\s]|$)`, "i") });
  }
  if (!or.length) return null;

  const rows = await ActivityUserProfile.aggregate([
    { $match: { guildId: gid } },
    { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "staff.partnerActions.action": "create",
        $or: or,
      },
    },
    { $group: { _id: null, lastAt: { $max: "$staff.partnerActions.date" } } },
  ]).catch(() => []);

  const raw = rows?.[0]?.lastAt;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function checkSamePartnerTargetCooldown(guildId?, partnerGuildId?, inviteCode?, cooldownMs?) {
  const windowMs = Math.floor(Number(cooldownMs));
  if (!Number.isFinite(windowMs) || windowMs <= 0) return { ok: true };

  const last = await getLatestPartnerCreateAtForTarget(guildId, partnerGuildId, inviteCode);
  if (!last) return { ok: true };
  const elapsed = Date.now() - last.getTime();
  if (elapsed >= windowMs) return { ok: true };
  return { ok: false, nextAllowedAt: new Date(last.getTime() + windowMs), cooldownMs: windowMs };
}

function resolveSameServerCooldownMs(partnershipCfg?) {
  const raw = partnershipCfg?.sameServerCooldownMs;
  if (raw === undefined) {
    return partnershipCfg?.legacy ? PARTNER_SAME_TARGET_COOLDOWN_MS : null;
  }
  if (raw === null || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export = {
  PARTNER_SAME_TARGET_COOLDOWN_MS,
  checkSamePartnerTargetCooldown,
  resolveSameServerCooldownMs,
};
