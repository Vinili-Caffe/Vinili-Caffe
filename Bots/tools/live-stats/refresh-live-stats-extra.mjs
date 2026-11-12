// Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchCommunityPulse } from "./live-community-pulse.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(HERE, "config.json");

let fetchStaffListStatusFlags = async () => ({
  paused: new Set(),
  newRolesByUser: new Map(),
});
try {
  ({ fetchStaffListStatusFlags } = await import("./staff-list-status.mjs"));
} catch (err) {
  console.warn("[live-stats-extra] staff-list-status import:", err?.message || err);
}

function loadEnvFiles() {
  const candidates = [
    process.env.VC_BOT_ENV,
    "/opt/bot/.env",
    path.join(HERE, "..", "..", "..", "..", ".env"),
    path.join(HERE, "..", "..", "..", ".env"),
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
      console.log("[live-stats-extra] env:", p);
      return;
    } catch {
      /* try next */
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function discordBotGet(apiPath, botToken, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${apiPath}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
      "User-Agent": "ViniliCaffeWebBuild/1.0 (live-stats-extra)",
    },
  });
  if (res.status === 429 && attempt < 8) {
    let waitSec = 1;
    try {
      const j = await res.clone().json();
      waitSec = Number(j.retry_after) || 1;
    } catch {
      waitSec = 1;
    }
    await new Promise((r) => setTimeout(r, Math.ceil(waitSec * 1000) + 200));
    return discordBotGet(apiPath, botToken, attempt + 1);
  }
  if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 6) {
    await new Promise((r) => setTimeout(r, 800 + attempt * 1200));
    return discordBotGet(apiPath, botToken, attempt + 1);
  }
  return res;
}

async function fetchGuildLiveStatsCountsFromBot(guildId, botToken) {
  const gid = String(guildId || "").trim();
  const t = String(botToken || "").trim();
  if (!gid || !t) return null;
  const res = await discordBotGet(`/guilds/${encodeURIComponent(gid)}?with_counts=true`, t);
  if (!res.ok) {
    console.warn("[live-stats-extra] Guild live counts HTTP", res.status);
    return null;
  }
  const g = await res.json().catch(() => null);
  if (!g || typeof g !== "object") return null;
  const num = (v) =>
    v != null && Number.isFinite(Number(v)) ? Math.floor(Number(v)) : null;
  return {
    memberCount: num(g.approximate_member_count ?? g.member_count),
    boostCount: num(g.premium_subscription_count),
    presenceCount: num(g.approximate_presence_count),
  };
}

async function fetchGuildRoleMetas(guildId, botToken) {
  const map = new Map();
  const res = await discordBotGet(`/guilds/${guildId}/roles`, botToken);
  if (!res.ok) {
    console.warn("[live-stats-extra] Guild roles HTTP", res.status);
    return { ok: false, map, httpStatus: res.status };
  }
  const roles = await res.json().catch(() => []);
  if (!Array.isArray(roles)) return { ok: true, map };
  for (const r of roles) {
    const id = String(r?.id || "");
    if (!id) continue;
    map.set(id, {
      name: String(r?.name || id),
      position: Number(r?.position ?? 0),
      premiumSubscriber: Boolean(r?.tags && Object.prototype.hasOwnProperty.call(r.tags, "premium_subscriber")),
    });
  }
  return { ok: true, map };
}

async function fetchGuildOwnerId(guildId, botToken) {
  const res = await discordBotGet(`/guilds/${encodeURIComponent(guildId)}`, botToken);
  if (!res.ok) return "";
  const data = await res.json().catch(() => null);
  const ownerId = String(data?.owner_id || "").trim();
  return /^\d{16,22}$/.test(ownerId) ? ownerId : "";
}

async function fetchGuildMembersUpTo(guildId, botToken, maxTotal) {
  const cap = Math.min(Math.max(1, Number(maxTotal) || 4000), 50000);
  const all = [];
  let after = "";
  while (all.length < cap) {
    const q = new URLSearchParams({ limit: "1000" });
    if (after) q.set("after", after);
    const res = await discordBotGet(`/guilds/${guildId}/members?${q}`, botToken);
    if (!res.ok) {
      console.warn("[live-stats-extra] Guild members HTTP", res.status);
      break;
    }
    const chunk = await res.json().catch(() => []);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const m of chunk) {
      all.push(m);
      if (all.length >= cap) break;
    }
    if (chunk.length < 1000 || all.length >= cap) break;
    const lastId = chunk[chunk.length - 1]?.user?.id;
    if (!lastId) break;
    after = String(lastId);
  }
  return all;
}

function memberRoleIds(m) {
  const ids = m?.roles;
  return Array.isArray(ids) ? ids.map(String) : [];
}

function cleanupName(v) {
  return String(v || "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();
}

function memberDisplayName(m) {
  const usable = (v) => {
    const s = cleanupName(v);
    if (!s) return "";
    const compact = s.replace(/[\s\u3164\u2800\u115F\u1160\u1CB0\uFFA0]/g, "");
    return (compact.match(/\p{L}|\p{N}/gu) || []).length >= 2 ? s : "";
  };
  const u = m?.user;
  return (
    usable(m?.nick) ||
    usable(u?.global_name) ||
    usable(u?.globalName) ||
    usable(u?.username) ||
    cleanupName(u?.username) ||
    "Utente"
  );
}

function discordCdnUserAvatarUrl(userId, avatarHash) {
  const id = String(userId || "").trim();
  if (!id) return "";
  const h = avatarHash != null ? String(avatarHash).trim() : "";
  if (h) {
    const ext = h.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${id}/${h}.${ext}?size=80`;
  }
  try {
    const idx = Number((BigInt(id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/1.png";
  }
}

function memberAvatarUrl(m, guildId) {
  const uid = String(m?.user?.id || "").trim();
  if (!uid) return "";
  const userHash = m?.user?.avatar != null ? String(m.user.avatar).trim() : "";
  if (userHash) {
    const ext = userHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${uid}/${userHash}.${ext}?size=80`;
  }
  const gid = String(guildId || "").trim();
  const guildHash = m?.avatar != null ? String(m.avatar).trim() : "";
  if (gid && guildHash) {
    const ext = guildHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/guilds/${gid}/users/${uid}/avatars/${guildHash}.${ext}?size=80`;
  }
  return discordCdnUserAvatarUrl(uid, "");
}

function memberProfileHref(m) {
  const uid = String(m?.user?.id || "").trim();
  return /^\d{16,22}$/.test(uid) ? `/user/?id=${encodeURIComponent(uid)}` : "";
}

function isOwner(m, ownerUserId) {
  const uid = String(m?.user?.id || "").trim();
  return Boolean(uid && ownerUserId && uid === ownerUserId);
}

function hoverMember(mem, roleId, roleLabel, ownerUserId, guildId, cfg, flags = {}) {
  const staffDel = String(cfg.staffDelMeseRoleId || "").trim();
  const delMese = staffDel ? memberRoleIds(mem).includes(staffDel) : false;
  return {
    name: memberDisplayName(mem),
    avatarUrl: memberAvatarUrl(mem, guildId) || "",
    profileUrl: memberProfileHref(mem),
    isOwner: isOwner(mem, ownerUserId),
    isPaused: flags.isPaused === true,
    isStaffDelMese: flags.isStaffDelMese === true || delMese,
    ...(flags.isNew ? { isNew: true } : {}),
    roleId: String(roleId || "").trim(),
    roleLabel: String(roleLabel || "").trim(),
  };
}

function mergeLivePulseIntoPayload(payload, pulse, presenceCount) {
  if (!pulse || typeof pulse !== "object") return payload;
  const mp = pulse.memberPulse && typeof pulse.memberPulse === "object" ? { ...pulse.memberPulse } : null;
  if (mp) {
    if (presenceCount != null && Number.isFinite(Number(presenceCount))) {
      mp.onlineNow = Math.max(0, Math.floor(Number(presenceCount)));
    }
    payload.memberPulse = mp;
  }
  if (pulse.communityHours && typeof pulse.communityHours === "object") {
    payload.communityHours = pulse.communityHours;
  }
  return payload;
}

function computeStaffNoPm(members, staffRoleIds, excludeRoleIds) {
  const staffSet = new Set(staffRoleIds);
  const seen = new Set();
  for (const m of members) {
    if (m?.user?.bot) continue;
    const uid = String(m.user.id || "").trim();
    if (!uid) continue;
    const rids = memberRoleIds(m).filter((r) => !excludeRoleIds.has(r));
    if (rids.some((r) => staffSet.has(r))) seen.add(uid);
  }
  return seen.size;
}

async function buildStaffAndBoostPayload(cfg, guildId, botToken) {
  const staffRoleIds = new Set(
    (Array.isArray(cfg.staffRoleIds) ? cfg.staffRoleIds : []).map((x) => String(x).trim()).filter(Boolean),
  );
  const excludeRoleIds = new Set(
    (Array.isArray(cfg.excludeFromStaffListRoleIds) ? cfg.excludeFromStaffListRoleIds : [])
      .map((x) => String(x).trim())
      .filter(Boolean),
  );
  const displayOrder = (Array.isArray(cfg.staffRoleDisplayOrder) ? cfg.staffRoleDisplayOrder : [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  const pmRoleId = String(cfg.partnerManagerRoleId || "").trim();
  const bloggerRoleId = String(cfg.bloggerRoleId || "").trim();
  const maxScan = Number.isFinite(Number(cfg.maxMembersToScan)) ? Number(cfg.maxMembersToScan) : 10000;

  const [{ map: roleMetas }, ownerUserId, members, staffFlags] = await Promise.all([
    fetchGuildRoleMetas(guildId, botToken),
    fetchGuildOwnerId(guildId, botToken),
    fetchGuildMembersUpTo(guildId, botToken, maxScan),
    fetchStaffListStatusFlags(guildId).catch(() => ({
      paused: new Set(),
      newRolesByUser: new Map(),
    })),
  ]);

  if (!members.length) {
    console.warn("[live-stats-extra] Nessun membro scaricato.");
    return { staffNoPm: 0, staffHoverGroups: [], boostHoverMembers: [] };
  }

  const resolveLabel = (roleId) => {
    const rid = String(roleId || "").trim();
    return String(roleMetas.get(rid)?.name || rid).trim() || rid;
  };

  const byRole = new Map();
  for (const m of members) {
    if (m?.user?.bot) continue;
    const rids = memberRoleIds(m);
    const seenRid = new Set();
    for (const rid of rids) {
      if (excludeRoleIds.has(rid)) continue;
      if (!staffRoleIds.has(rid)) continue;
      if (seenRid.has(rid)) continue;
      seenRid.add(rid);
      if (!byRole.has(rid)) {
        byRole.set(rid, { roleId: rid, role: resolveLabel(rid), members: [] });
      }
      const g = byRole.get(rid);
      const uid = String(m.user.id || "");
      if (uid && !g.members.some((x) => String(x?.user?.id || "") === uid)) g.members.push(m);
    }
  }

  function appendRoleGroup(roleId) {
    const rid = String(roleId || "").trim();
    if (!rid || byRole.has(rid)) return;
    const roleMembers = members
      .filter((m) => !m?.user?.bot && memberRoleIds(m).includes(rid))
      .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b), "it", { sensitivity: "base" }));
    if (!roleMembers.length) return;
    byRole.set(rid, { roleId: rid, role: resolveLabel(rid), members: roleMembers });
  }

  appendRoleGroup(pmRoleId);
  appendRoleGroup(bloggerRoleId);

  const ladder = displayOrder.length ? displayOrder : [...staffRoleIds];
  const ordered = [];
  const used = new Set();
  for (const rid of ladder) {
    const g = byRole.get(rid);
    if (!g || !g.members.length) continue;
    ordered.push(g);
    used.add(rid);
  }
  for (const [rid, g] of byRole) {
    if (used.has(rid) || !g.members.length) continue;
    ordered.push(g);
  }

  const staffHoverGroups = ordered.map((g) => ({
    roleId: g.roleId,
    role: g.role,
    members: g.members
      .map((mem) => {
        const uid = String(mem?.user?.id || "").trim();
        return hoverMember(mem, g.roleId, g.role, ownerUserId, guildId, cfg, {
          isNew: staffFlags.newRolesByUser?.get(uid)?.has(String(g.roleId)) === true,
          isPaused: staffFlags.paused?.has(uid),
        });
      })
      .filter((row) => row.name),
  }));

  const serverBoosterRoleId = String(cfg.serverBoosterRoleId || "").trim();
  const doubleBoosterRoleId = String(cfg.doubleBoosterRoleId || "").trim();
  const boosterRoleIds = new Set([serverBoosterRoleId, doubleBoosterRoleId].filter(Boolean));
  for (const [rid, meta] of roleMetas.entries()) {
    const name = String(meta?.name || "")
      .toLowerCase()
      .replace(/^༄\s*/, "")
      .trim();
    if (
      meta?.premiumSubscriber ||
      name === "server booster" ||
      name === "booster" ||
      name.includes("server booster")
    ) {
      boosterRoleIds.add(String(rid));
    }
  }

  const boostByUserId = new Map();
  for (const m of members) {
    if (m?.user?.bot) continue;
    const uid = String(m?.user?.id || "").trim();
    if (!uid) continue;
    const rids = memberRoleIds(m);
    const hasBoosterRole = rids.some((rid) => boosterRoleIds.has(String(rid)));
    const hasPremium = Boolean(m?.premium_since || m?.premiumSince);
    if (!hasPremium && !hasBoosterRole) continue;
    const boostCount = doubleBoosterRoleId && rids.includes(doubleBoosterRoleId) ? 2 : 1;
    boostByUserId.set(uid, {
      name: memberDisplayName(m),
      avatarUrl: memberAvatarUrl(m, guildId) || "",
      profileUrl: memberProfileHref(m),
      boostCount,
    });
  }

  const boostHoverMembers = [...boostByUserId.values()]
    .filter((m) => m.name)
    .sort((a, b) => {
      const dc = Number(b.boostCount || 0) - Number(a.boostCount || 0);
      return dc || String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" });
    });

  const staffNoPm = computeStaffNoPm(members, [...staffRoleIds], excludeRoleIds);

  console.log(
    "[live-stats-extra] staff",
    `staffNoPm=${staffNoPm}`,
    `groups=${staffHoverGroups.length}`,
    `boosters=${boostHoverMembers.length}`,
    `paused=${staffFlags.paused?.size ?? 0}`,
    `new=${staffFlags.newRolesByUser?.size ?? 0}`,
  );

  return { staffNoPm, staffHoverGroups, boostHoverMembers };
}

async function notifySiteApi() {
  const port = Number(process.env.SITE_API_PORT || 3020) || 3020;
  const secret = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "local").trim() || "local";
  const body = JSON.stringify({ type: "live_stats_changed", at: new Date().toISOString() });
  await fetch(`http://127.0.0.1:${port}/webhooks/site-realtime/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Notify": secret },
    body,
  }).catch(() => null);
}

async function main() {
  loadEnvFiles();
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("[live-stats-extra] Manca config.json in", HERE);
    process.exit(1);
  }
  const cfg = readJson(CONFIG_PATH);
  const guildId = String(cfg.guildId || "").trim();
  if (!guildId) {
    console.error("[live-stats-extra] guildId mancante in config.json");
    process.exit(1);
  }
  const botToken = String(
    process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN || process.env.DISCORD_TOKEN || "",
  ).trim();
  if (!botToken) {
    console.error("[live-stats-extra] Manca DISCORD_WEBSITE_BUILD_BOT_TOKEN o DISCORD_TOKEN");
    process.exit(1);
  }

  const [guildLive, communityPulse, staffBoost] = await Promise.all([
    fetchGuildLiveStatsCountsFromBot(guildId, botToken),
    fetchCommunityPulse(guildId),
    buildStaffAndBoostPayload(cfg, guildId, botToken),
  ]);

  const payload = { staffNoPm: staffBoost.staffNoPm };
  if (staffBoost.staffHoverGroups.length) payload.staffHoverGroups = staffBoost.staffHoverGroups;
  if (staffBoost.boostHoverMembers.length) payload.boostHoverMembers = staffBoost.boostHoverMembers;
  if (guildLive?.memberCount != null) payload.guildMemberCount = guildLive.memberCount;
  if (guildLive?.boostCount != null) payload.guildBoostCount = guildLive.boostCount;
  mergeLivePulseIntoPayload(payload, communityPulse, guildLive?.presenceCount);

  const outRaw = process.env.VC_LIVE_STATS_JSON_OUT?.trim();
  const out = outRaw || path.join(HERE, "live-stats-extra.json");
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.error("[live-stats-extra] Scrittura fallita:", err?.message || err);
    process.exit(1);
  }

  await notifySiteApi();

  const boostN = payload.boostHoverMembers?.length || 0;
  const boostSlots = (payload.boostHoverMembers || []).reduce(
    (s, row) => s + Math.max(1, Math.floor(Number(row?.boostCount || 1))),
    0,
  );
  const pulseLog = payload.memberPulse
    ? ` msgs7d=${payload.memberPulse.messages7d} voice7d=${payload.memberPulse.voiceSeconds7d} active7d=${payload.memberPulse.activeMembers7d} online=${payload.memberPulse.onlineNow ?? "—"}`
    : "";
  console.log(
    "[live-stats-extra] OK",
    out,
    "staffNoPm:",
    payload.staffNoPm,
    payload.guildMemberCount != null ? `guildMemberCount=${payload.guildMemberCount}` : "",
    payload.guildBoostCount != null ? `guildBoostCount=${payload.guildBoostCount}` : "",
    `boosters=${boostN}`,
    `boostSlots=${boostSlots}`,
    pulseLog,
  );
}

main().catch((e) => {
  console.error("[live-stats-extra] Fatal:", e?.message || e);
  process.exit(1);
});
