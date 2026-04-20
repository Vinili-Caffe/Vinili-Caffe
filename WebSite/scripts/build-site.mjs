import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
import { buildWikiCommandPanesInnerHtml } from "./wiki-command-discovery.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "site.config.json");
const FALLBACK_GUILD_ICON = "images/vc-header-logo.png";
/** Discord snowflake epoch (2015-01-01 UTC), ms since Unix epoch. */
const DISCORD_EPOCH_MS = 1420070400000;

const STAFF_LIST_FALLBACK_HTML = `          <p>
            L&apos;organico dello staff, i permessi e i canali dedicati sono gestiti sul server Discord. Per segnalazioni o partnership
            usa i contatti qui sotto o i ticket indicati nelle regole del server.
          </p>`;

const EXCLUDE = new Set([
  "dist",
  "scripts",
  "deploy-site.ps1",
  "site.config.json",
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  "package.json",
  "package-lock.json",
  "README.md",
  "CNAME",
  "node_modules",
  "deploy",
]);

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (EXCLUDE.has(name)) continue;
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyRecursive(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyPlaceholderMap(html, map) {
  for (const [key, value] of Object.entries(map)) {
    const ph = `{{${key}}}`;
    if (html.includes(ph)) {
      html = html.split(ph).join(String(value ?? ""));
    }
  }
  return html;
}

function warnLeftoverPlaceholders(html, label) {
  const leftover = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (leftover.length) {
    console.warn(`Placeholder non sostituiti (${label}):`, [...new Set(leftover)].join(", "));
  }
}

function inviteCodeFromConfig(cfg) {
  const explicit = String(cfg.discordInviteCode || "").trim();
  if (explicit) return explicit;
  const url = String(cfg.discordInviteUrl || "").trim();
  const m = url.match(/discord\.(?:gg|com\/invite)\/([a-zA-Z0-9-]+)/i);
  return m ? m[1] : "";
}

function guildBannerCdnUrl(guildId, bannerHash) {
  const gid = String(guildId || "").trim();
  const h = String(bannerHash || "").trim();
  if (!gid || !h) return "";
  const ext = h.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${gid}/${h}.${ext}?size=2048`;
}

function guildIconCdnUrl(guildId, iconHash) {
  const gid = String(guildId || "").trim();
  const h = String(iconHash || "").trim();
  if (!gid || !h) return "";
  const ext = h.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${gid}/${h}.${ext}?size=256`;
}

/** URL assoluto per og:image (Discord anteprima link) se path è relativo. */
function absUrlForMetadata(siteUrl, pathOrUrl) {
  const p = String(pathOrUrl || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(siteUrl || "").trim().replace(/\/+$/, "");
  if (!base) return p;
  return `${base}/${p.replace(/^\//, "")}`;
}

/** Data approssimativa di creazione guild dall’ID snowflake (l’API invite non espone created_at). */
function snowflakeGuildCreatedUtcDate(guildId) {
  try {
    const bid = BigInt(String(guildId || "").trim());
    const ms = Number(bid >> 22n) + DISCORD_EPOCH_MS;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function formatItalianDateRome(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function buildHeroBannerStyleBlock(bannerUrl) {
  return (
    `    <style id="hero-discord-banner">\n` +
    `#intro {\n` +
    `  background: #151515 url("${bannerUrl}") no-repeat center center;\n` +
    `  -webkit-background-size: cover;\n` +
    `  -moz-background-size: cover;\n` +
    `  background-size: cover;\n` +
    `  background-attachment: fixed;\n` +
    `}\n` +
    `</style>\n`
  );
}

/** Stesso query string usato da `js/live-stats.js` sul fallback Discord. */
async function fetchInviteInvitePayload(inviteCode) {
  const code = String(inviteCode || "").trim();
  if (!code) return null;
  const url = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "ViniliCaffeWebBuild/1.0 (static site; +https://www.viniliecaffe.it)",
      },
    });
  } catch (e) {
    console.warn("[build-site] fetch invite fallito:", e?.message || e);
    return null;
  }
  if (!res.ok) {
    console.warn("[build-site] invite API HTTP", res.status, code);
    return null;
  }
  try {
    const data = await res.json();
    const guild = data?.guild;
    const snap =
      guild?.id != null
        ? {
            guildId: guild.id,
            banner: guild.banner,
            icon: guild.icon,
            approximateMemberCount: data.approximate_member_count,
            boostCount: guild.premium_subscription_count,
            guildDescription:
              guild.description != null && String(guild.description).trim()
                ? String(guild.description)
                : "",
          }
        : null;
    return { snap, raw: data };
  } catch (e) {
    console.warn("[build-site] JSON invite:", e?.message || e);
    return null;
  }
}

async function fetchInviteGuildSnapshot(inviteCode) {
  const p = await fetchInviteInvitePayload(inviteCode);
  return p?.snap ?? null;
}

function discordCdnUserAvatarUrl(userId, avatarHash) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const h = avatarHash != null ? String(avatarHash).trim() : "";
  if (h) {
    const ext = h.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${id}/${h}.${ext}?size=256`;
  }
  try {
    const idx = Number((BigInt(id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/1.png";
  }
}

/** Avatar dell’account bot da Discord API (richiede token del bot). */
async function fetchBotSelfAvatarUrl(botToken, label) {
  const t = String(botToken || "").trim();
  if (!t) return null;
  try {
    const res = await discordBotGet("/users/@me", t);
    if (!res.ok) {
      console.warn(`[build-site] Wiki avatar ${label}: GET /users/@me HTTP`, res.status);
      return null;
    }
    const u = await res.json().catch(() => null);
    const id = String(u?.id || "").trim();
    if (!id) return null;
    return discordCdnUserAvatarUrl(id, u?.avatar);
  } catch (e) {
    console.warn(`[build-site] Wiki avatar ${label}:`, e?.message || e);
    return null;
  }
}

async function discordBotGet(path, botToken, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
      "User-Agent": "ViniliCaffeWebBuild/1.0 (staff-list)",
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
    return discordBotGet(path, botToken, attempt + 1);
  }
  return res;
}

async function fetchGuildRoleMetas(guildId, botToken) {
  const res = await discordBotGet(`/guilds/${guildId}/roles`, botToken);
  if (!res.ok) {
    console.warn("[build-site] Guild roles HTTP", res.status);
    return new Map();
  }
  const roles = await res.json().catch(() => []);
  const map = new Map();
  if (!Array.isArray(roles)) return map;
  for (const r of roles) {
    const id = String(r?.id || "");
    if (!id) continue;
    map.set(id, {
      name: String(r?.name || id),
      position: Number(r?.position ?? 0),
    });
  }
  return map;
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
      console.warn(
        "[build-site] Guild members HTTP",
        res.status,
        "(abilita «Server Members Intent» nel portale Discord del bot e assicurati che il bot sia nel server).",
      );
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
  if (Array.isArray(ids)) return ids.map(String);
  return [];
}

/** Nome in elenco tipo “Blear#3218” (discriminator) o display / @handle senza #0. */
function memberStaffLineName(m) {
  const u = m?.user;
  if (!u) return "Utente";
  const cleanup = (v) =>
    String(v || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim();
  const meaningful = (v) => {
    const s = cleanup(v);
    return /\p{L}|\p{N}/u.test(s) ? s : "";
  };
  const un = meaningful(u.username);
  const disc = String(u.discriminator ?? "0");
  const nick = m?.nick != null ? meaningful(m.nick) : "";
  const gn = u.global_name != null ? meaningful(u.global_name) : "";
  if (disc && disc !== "0") return `${un}#${disc}`;
  return nick || gn || un || "Utente";
}

function staffListFallback() {
  return { html: STAFF_LIST_FALLBACK_HTML, staffCount: null };
}

function buildLiveStatsBootHtml(cfg, inviteCode, opts) {
  const scriptPrefix = opts && typeof opts.scriptPrefix === "string" ? opts.scriptPrefix : "";
  const ls = cfg.liveStats || {};
  if (ls.enabled === false) return "";
  const code = String(inviteCode || "").trim();
  const inviteProxy =
    ls.inviteProxyPath === ""
      ? ""
      : String(ls.inviteProxyPath != null ? ls.inviteProxyPath : "/discord-invite.json");
  const extraStats =
    ls.extraStatsPath === ""
      ? ""
      : String(ls.extraStatsPath != null ? ls.extraStatsPath : "/live-stats-extra.json");
  const pollMs = Number.isFinite(Number(ls.pollIntervalMs)) ? Number(ls.pollIntervalMs) : 45000;
  const introFallbackMs = Number.isFinite(Number(ls.introFallbackMs)) ? Number(ls.introFallbackMs) : 45000;
  const liveEventApiUrl = String(cfg.liveEventApiUrl || "").trim();
  const liveEventApiUrlLocal = String(cfg.liveEventApiUrlLocal || "").trim();
  const liveEventPollMsRaw = ls.liveEventPollMs != null ? Number(ls.liveEventPollMs) : 90000;
  const liveEventPollMs = Number.isFinite(liveEventPollMsRaw)
    ? Math.max(20000, Math.min(600000, liveEventPollMsRaw))
    : 90000;
  const payload = {
    enabled: true,
    inviteCode: code,
    inviteProxyPath: inviteProxy,
    extraStatsPath: extraStats,
    pollIntervalMs: pollMs,
    introFallbackMs,
    liveEventApiUrl,
    liveEventApiUrlLocal,
    liveEventPollMs,
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_LIVE=${json};</script>\n` +
    `    <script src="${scriptPrefix}js/live-stats.js" defer></script>\n`
  );
}

async function buildStaffListBlock(cfg, guildId) {
  const b = cfg.discordStaffListBuild;
  if (!b || b.enabled !== true) return staffListFallback();
  const gid = String(guildId || b.guildId || "").trim();
  const botToken = process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN?.trim();
  if (!gid || !botToken) {
    console.warn(
      "[build-site] Staff list: servono guildId (o invite per ricavarlo) e la variabile DISCORD_WEBSITE_BUILD_BOT_TOKEN.",
    );
    return staffListFallback();
  }

  const staffRoleIds = new Set(
    (Array.isArray(b.staffRoleIds) ? b.staffRoleIds : []).map((x) => String(x).trim()).filter(Boolean),
  );
  const rawEx = b.excludeFromStaffListRoleIds;
  const excludeRoleIds = new Set(
    rawEx === undefined
      ? ["1442568905582317740"]
      : (Array.isArray(rawEx) ? rawEx : []).map((x) => String(x).trim()).filter(Boolean),
  );

  if (!staffRoleIds.size) {
    console.warn("[build-site] discordStaffListBuild.staffRoleIds vuoto.");
    return staffListFallback();
  }

  const roleMetas = await fetchGuildRoleMetas(gid, botToken);
  for (const rid of staffRoleIds) {
    if (!roleMetas.has(rid)) {
      console.warn("[build-site] staffRoleIds: ruolo non trovato in guild (ID errato o ruolo rimosso):", rid);
    }
  }

  const maxScan = Number.isFinite(Number(b.maxMembersToScan)) ? Number(b.maxMembersToScan) : 10000;
  const members = await fetchGuildMembersUpTo(gid, botToken, maxScan);
  if (!members.length) {
    console.warn("[build-site] Nessun membro scaricato per la staff list.");
    return staffListFallback();
  }
  if (members.length >= maxScan) {
    console.warn(
      "[build-site] Staff list: raggiunto maxMembersToScan=",
      maxScan,
      "; possibili membri non scansionati. Aumenta maxMembersToScan in site.config.json.",
    );
  }

  const labelOverrides =
    b.staffRoleLabels && typeof b.staffRoleLabels === "object" && !Array.isArray(b.staffRoleLabels)
      ? b.staffRoleLabels
      : {};
  const staffRoleCdnEmojiByRoleId =
    b.staffRoleCdnEmojiByRoleId &&
    typeof b.staffRoleCdnEmojiByRoleId === "object" &&
    !Array.isArray(b.staffRoleCdnEmojiByRoleId)
      ? b.staffRoleCdnEmojiByRoleId
      : {};
  function staffRoleIconHtml(roleId) {
    const eid = String(staffRoleCdnEmojiByRoleId[roleId] ?? staffRoleCdnEmojiByRoleId[String(roleId)] ?? "").trim();
    if (!/^\d{5,25}$/.test(eid)) return "";
    const src = `https://cdn.discordapp.com/emojis/${eid}.webp?size=48&quality=lossless`;
    return `<span class="vc-staff-role-ico" aria-hidden="true"><img src="${escAttr(src)}" alt="" width="20" height="20" loading="lazy" decoding="async" /></span>`;
  }
  const displayOrder = Array.isArray(b.staffRoleDisplayOrder)
    ? b.staffRoleDisplayOrder.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const showEachRole = b.staffListShowEachRole === true;
  const showEmptyRoles = b.showEmptyStaffRoles !== false;

  for (const id of staffRoleIds) {
    if (excludeRoleIds.has(id)) {
      console.warn(
        "[build-site] excludeFromStaffListRoleIds contiene un ID presente anche in staffRoleIds (conflitto). Rimuovilo da uno dei due elenchi:",
        id,
      );
    }
  }

  const ladderIds =
    displayOrder.length > 0
      ? displayOrder
      : [...staffRoleIds].sort(
          (a, b) =>
            (roleMetas.get(b)?.position ?? 0) - (roleMetas.get(a)?.position ?? 0),
        );

  function pickStaffBucketRoleId(rids) {
    const rset = new Set(rids);
    if (displayOrder.length > 0) {
      for (const rid of displayOrder) {
        if (excludeRoleIds.has(rid)) continue;
        if (!staffRoleIds.has(rid)) continue;
        if (rset.has(rid)) return rid;
      }
    }
    let bestId = null;
    let bestPos = -999999;
    for (const rid of rids) {
      if (excludeRoleIds.has(rid)) continue;
      if (!staffRoleIds.has(rid)) continue;
      const meta = roleMetas.get(rid);
      const pos = meta ? Number(meta.position) : 0;
      if (pos > bestPos) {
        bestPos = pos;
        bestId = rid;
      }
    }
    return bestId;
  }

  const rows = [];
  for (const m of members) {
    if (m?.user?.bot) continue;
    const rids = memberRoleIds(m);
    if (showEachRole) {
      const seenRid = new Set();
      for (const rid of rids) {
        if (excludeRoleIds.has(rid)) continue;
        if (!staffRoleIds.has(rid)) continue;
        if (seenRid.has(rid)) continue;
        seenRid.add(rid);
        const bestPos = roleMetas.get(rid)?.position ?? 0;
        const rawLabel = roleMetas.get(rid)?.name || rid;
        const roleLabel =
          String(labelOverrides[rid] ?? labelOverrides[String(rid)] ?? rawLabel).trim() || rawLabel;
        rows.push({ bestId: rid, bestPos, roleLabel, m });
      }
      continue;
    }
    const bestId = pickStaffBucketRoleId(rids);
    if (!bestId) continue;
    const bestPos = roleMetas.get(bestId)?.position ?? 0;
    const rawLabel = roleMetas.get(bestId)?.name || bestId;
    const roleLabel = String(labelOverrides[bestId] ?? labelOverrides[String(bestId)] ?? rawLabel).trim() || rawLabel;
    rows.push({ bestId, bestPos, roleLabel, m });
  }

  const humans = members.filter((m) => m?.user && !m.user.bot).length;
  const withStaff = new Set(
    rows.map((r) => String(r.m?.user?.id || "")).filter(Boolean),
  ).size;
  console.log(
    "[build-site] Staff list:",
    members.length,
    "membri scaricati (",
    humans,
    "umani),",
    withStaff,
    "con almeno un ruolo in staffRoleIds,",
    rows.length,
    showEachRole ? "righe (una per ruolo staff)." : "righe (una persona = una fascia).",
  );

  if (!rows.length) {
    console.warn("[build-site] Staff list: nessun membro dopo filtri (ruoli o intent).");
    return staffListFallback();
  }

  const byRole = new Map();
  for (const row of rows) {
    if (!byRole.has(row.bestId)) {
      byRole.set(row.bestId, {
        roleId: row.bestId,
        roleLabel: row.roleLabel,
        bestPos: row.bestPos,
        members: [],
      });
    }
    const g = byRole.get(row.bestId);
    const uid = String(row.m?.user?.id || "");
    if (uid && g.members.some((x) => String(x?.user?.id || "") === uid)) continue;
    g.members.push(row.m);
  }

  if (showEmptyRoles) {
    for (const roleId of ladderIds) {
      if (!staffRoleIds.has(roleId)) continue;
      if (excludeRoleIds.has(roleId)) continue;
      if (byRole.has(roleId)) continue;
      const rawLabel = roleMetas.get(roleId)?.name || roleId;
      const roleLabel =
        String(labelOverrides[roleId] ?? labelOverrides[String(roleId)] ?? rawLabel).trim() || rawLabel;
      byRole.set(roleId, {
        roleId,
        roleLabel,
        bestPos: roleMetas.get(roleId)?.position ?? -999999,
        members: [],
      });
    }
  }

  const groups = [...byRole.values()];
  groups.sort((a, b) => {
    const ia = ladderIds.indexOf(a.roleId);
    const ib = ladderIds.indexOf(b.roleId);
    const aKnown = ia !== -1;
    const bKnown = ib !== -1;
    if (aKnown && bKnown && ia !== ib) return ia - ib;
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return b.bestPos - a.bestPos;
  });
  for (const g of groups) {
    g.members.sort((ma, mb) =>
      memberStaffLineName(ma).localeCompare(memberStaffLineName(mb), "it", { sensitivity: "base" }),
    );
  }

  const roleLines = groups
    .map((g) => {
      const parts = g.members.length
        ? g.members.map((mem) => escHtml(memberStaffLineName(mem))).join(" | ")
        : "—";
      const icon = staffRoleIconHtml(g.roleId);
      return `            <p class="vc-staff-block__line">${icon}<strong>${escHtml(g.roleLabel)}:</strong> ${parts}</p>`;
    })
    .join("\n");

  const html = `          <div class="vc-staff-block">\n${roleLines}\n          </div>`;
  const staffCount = new Set(rows.map((r) => String(r.m?.user?.id || "")).filter(Boolean)).size;
  return { html, staffCount };
}

/** Solo `live-stats-extra.json` (nessun rebuild HTML). Utile con cron sul VPS. */
async function mainLiveStatsExtraOnly() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Manca site.config.json in", ROOT);
    process.exit(1);
  }
  const cfg = readJson(CONFIG_PATH);
  const staffB = cfg.discordStaffListBuild || {};
  const guildIdConfigured = String(staffB.guildId || "").trim();
  const inviteCode = inviteCodeFromConfig(cfg);
  let snap = null;
  if (!guildIdConfigured) {
    if (!inviteCode) {
      console.error(
        "[live-stats-extra] Impossibile ricavare guildId: imposta discordStaffListBuild.guildId o discordInviteUrl in site.config.json.",
      );
      process.exit(1);
    }
    snap = await fetchInviteGuildSnapshot(inviteCode);
  }
  const guildIdResolved = guildIdConfigured || snap?.guildId || "";
  if (!guildIdResolved) {
    console.error("[live-stats-extra] Invite API senza guild id.");
    process.exit(1);
  }
  const staffResult = await buildStaffListBlock(cfg, guildIdResolved);
  const n = staffResult.staffCount != null ? staffResult.staffCount : 0;
  if (staffResult.staffCount == null) {
    console.warn(
      "[live-stats-extra] Conteggio staff non disponibile (token, intent o config). Scrivo staffNoPm: 0.",
    );
  }
  const outRaw = process.env.VC_LIVE_STATS_JSON_OUT?.trim();
  const out = outRaw || path.join(DIST, "live-stats-extra.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ staffNoPm: n }), "utf8");
  console.log("[live-stats-extra] OK", out, "staffNoPm:", n);
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Manca site.config.json in", ROOT);
    process.exit(1);
  }
  const { loadEnvFiles } = require(path.join(__dirname, "..", "..", "shared", "runtime", "fsRuntime.js"));
  loadEnvFiles(ROOT);
  const cfg = readJson(CONFIG_PATH);
  rmrf(DIST);
  copyRecursive(ROOT, DIST);

  const indexPath = path.join(DIST, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const cookieYesClientId = String(cfg.cookieYesClientId || "").trim();
  const cookieYesSafe = /^[a-zA-Z0-9_-]+$/.test(cookieYesClientId) ? cookieYesClientId : "";
  const cookieYesBlock = cookieYesSafe
    ? `    <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/${cookieYesSafe}/script.js"></script>\n`
    : "";

  const gaId = String(cfg.googleAnalyticsMeasurementId || "").trim();
  const gaBlock = gaId
    ? `    <script async src="https://www.googletagmanager.com/gtag/js?id=${escAttr(gaId)}"></script>\n    <script>\n      window.dataLayer = window.dataLayer || [];\n      function gtag(){dataLayer.push(arguments);}\n      gtag("js", new Date());\n      gtag("config", "${escAttr(gaId)}");\n    </script>\n`
    : "";

  const instagramUrl = String(cfg.instagramUrl || "").trim();
  const instagramLi = instagramUrl
    ? `        <li>\n          <a href="${escAttr(instagramUrl)}" target="_blank" rel="noopener noreferrer"\n            ><i class="fa fa-instagram"></i\n          ></a>\n        </li>\n`
    : "";

  const year = String(new Date().getFullYear());

  const wantBanner = cfg.useDiscordGuildBanner !== false;
  const wantIcon = cfg.useDiscordGuildIcon !== false;
  const wantFounded = cfg.useDiscordGuildFoundedDate !== false;
  const wantGuildDescription = cfg.useDiscordGuildDescription !== false;
  const staffB = cfg.discordStaffListBuild || {};
  const staffEnabled = staffB.enabled === true;
  const guildIdConfigured = String(staffB.guildId || "").trim();
  const inviteCode = inviteCodeFromConfig(cfg);

  const needInvite =
    Boolean(inviteCode) &&
    (wantBanner ||
      wantIcon ||
      wantFounded ||
      wantGuildDescription ||
      (staffEnabled && !guildIdConfigured) ||
      cfg.liveStats?.enabled !== false);

  let invitePayload = null;
  if (needInvite) {
    invitePayload = await fetchInviteInvitePayload(inviteCode);
  }
  const snap = invitePayload?.snap ?? null;

  let heroBannerBlock = "";
  let guildIconUrl = FALLBACK_GUILD_ICON;
  let foundedDisplay = String(cfg.foundedDisplay || "").trim() || "—";

  if (snap) {
    if (wantBanner) {
      const bannerUrl = guildBannerCdnUrl(snap.guildId, snap.banner);
      if (bannerUrl) heroBannerBlock = buildHeroBannerStyleBlock(bannerUrl);
      else
        console.warn(
          "[build-site] Nessun banner guild (Impostazioni server → Profilo server → Banner).",
        );
    }
    if (wantIcon) {
      const iconUrl = guildIconCdnUrl(snap.guildId, snap.icon);
      if (iconUrl) guildIconUrl = iconUrl;
      else console.warn("[build-site] Nessuna icon guild nell’invite; uso fallback locale.");
    }
    if (wantFounded) {
      const created = snowflakeGuildCreatedUtcDate(snap.guildId);
      const label = formatItalianDateRome(created);
      if (label) foundedDisplay = label;
    }
  }

  const siteName = cfg.siteName || "Vinili & Caffè";
  const siteUrlTrim =
    String(process.env.VC_SITE_URL ?? "").trim() || String(cfg.siteUrl || "").trim();
  if (String(process.env.VC_SITE_URL ?? "").trim()) {
    console.log("[build-site] VC_SITE_URL (override solo per questo build):", siteUrlTrim);
  }
  const configuredAbout = String(cfg.aboutDescription ?? "").trim();
  let aboutPlain = "";
  if (wantGuildDescription && snap?.guildDescription) {
    const gd = String(snap.guildDescription).trim();
    if (gd) aboutPlain = gd;
  }
  if (!aboutPlain) {
    aboutPlain = configuredAbout;
  }
  if (!aboutPlain) {
    aboutPlain = `${siteName} è la community ufficiale collegata al bot e alle attività del server: canali tematici, strumenti per lo staff e spazio per condividere ascolti, consigli e novità. Entra su Discord per regolamento, ruoli e annunci aggiornati.`;
  }

  const guildIdResolved = guildIdConfigured || snap?.guildId || "";
  const staffResult = await buildStaffListBlock(cfg, guildIdResolved);

  const statMembers =
    snap?.approximateMemberCount != null
      ? String(snap.approximateMemberCount)
      : String(cfg.statMembers ?? "0");
  const statBoosts =
    snap?.boostCount != null ? String(snap.boostCount) : String(cfg.statBoosts ?? "0");
  const statStaff =
    staffResult.staffCount != null
      ? String(staffResult.staffCount)
      : String(cfg.statStaff ?? "0");

  const liveStatsBoot = buildLiveStatsBootHtml(cfg, inviteCode);
  const liveStatsBootWiki = buildLiveStatsBootHtml(cfg, inviteCode, { scriptPrefix: "../" });
  const liveStatsBootUser = buildLiveStatsBootHtml(cfg, inviteCode, { scriptPrefix: "../" });

  if (staffResult.staffCount != null) {
    const extraPath = path.join(DIST, "live-stats-extra.json");
    fs.writeFileSync(
      extraPath,
      JSON.stringify({ staffNoPm: staffResult.staffCount }),
      "utf8",
    );
  }

  const lsForProxy = cfg.liveStats || {};
  const inviteProxyForSnapshot =
    lsForProxy.inviteProxyPath === ""
      ? ""
      : String(lsForProxy.inviteProxyPath != null ? lsForProxy.inviteProxyPath : "/discord-invite.json");
  if (
    lsForProxy.enabled !== false &&
    String(inviteCode || "").trim() &&
    inviteProxyForSnapshot &&
    invitePayload?.raw
  ) {
    fs.writeFileSync(path.join(DIST, "discord-invite.json"), JSON.stringify(invitePayload.raw), "utf8");
    console.log(
      "[build-site] Scritto discord-invite.json (snapshot all’avvio del build; in produzione nginx può sostituirlo con il proxy live).",
    );
  }

  const ogImageUrl = absUrlForMetadata(siteUrlTrim, guildIconUrl);
  const ogTitle = `${siteName} | Discord`;
  const ogDesc = String(cfg.metaDescription || "").trim();
  const ogUrl = siteUrlTrim;

  const discordInviteResolved = cfg.discordInviteUrl || "https://discord.gg/viniliecaffe";
  const siteBaseNoSlash = siteUrlTrim.replace(/\/+$/, "");
  const defaultLegalPath = (slug) =>
    siteBaseNoSlash ? `${siteBaseNoSlash}/${slug}` : `/${slug}`;
  const termsUrlResolved = String(cfg.termsUrl ?? "").trim() || defaultLegalPath("terms");
  const privacyUrlResolved = String(cfg.privacyUrl ?? "").trim() || defaultLegalPath("privacy");
  const cookiePolicyUrlResolved =
    String(cfg.cookiePolicyUrl ?? "").trim() || defaultLegalPath("cookie");
  const legalTermsDate =
    String(cfg.legalTermsUpdated ?? "").trim() || "17 aprile 2026";
  const legalPrivacyDate =
    String(cfg.legalPrivacyUpdated ?? "").trim() || "17 aprile 2026";
  const legalCookieDate =
    String(cfg.legalCookieUpdated ?? "").trim() || "17 aprile 2026";
  const discordInviteDisplay = inviteCode ? `discord.gg/${inviteCode}` : "Discord";
  const wikiUrlResolved =
    String(cfg.wikiUrl ?? "").trim() || (siteBaseNoSlash ? `${siteBaseNoSlash}/wiki` : "/wiki");
  // Non usare siteUrlTrim come fallback: href alla home fa scattare vc-landing.js e segna tutto il menu "corrente".
  const faqUrlResolved = String(cfg.faqUrl ?? "").trim() || "#";
  const communityRulesUrlResolved =
    String(cfg.communityRulesUrl ?? "").trim() || defaultLegalPath("regole");
  const modEmail = String(cfg.siteModeratorEmail || cfg.supportEmail || "").trim();
  const supEmail = String(cfg.supportEmail || "").trim();
  const richiesteUnbanUrl = defaultLegalPath("unban");
  const richiesteCandidatureUrl = defaultLegalPath("candidature");
  const donationsUrlResolved =
    String(cfg.donationsUrl ?? "").trim() || discordInviteResolved || "#";

  const wikiViniliCfgUrl = String(cfg.wikiBotViniliAvatarUrl ?? "").trim();
  const wikiCaffeCfgUrl = String(cfg.wikiBotCaffeAvatarUrl ?? "").trim();
  const tokenVinili =
    process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim();
  const tokenCaffe = process.env.DISCORD_TOKEN_TEST?.trim();
  let wikiViniliFromApi = null;
  let wikiCaffeFromApi = null;
  if (!wikiViniliCfgUrl && tokenVinili) {
    wikiViniliFromApi = await fetchBotSelfAvatarUrl(tokenVinili, "Vinili");
    if (wikiViniliFromApi) {
      console.log("[build-site] Wiki Vinili: avatar da Discord GET /users/@me (account bot).");
    } else {
      console.warn(
        "[build-site] Wiki Vinili: impossibile ottenere l’avatar via API. Imposta DISCORD_TOKEN o DISCORD_WEBSITE_BUILD_BOT_TOKEN nel .env del build, oppure wikiBotViniliAvatarUrl in site.config.json.",
      );
    }
  }
  if (!wikiCaffeCfgUrl && tokenCaffe) {
    wikiCaffeFromApi = await fetchBotSelfAvatarUrl(tokenCaffe, "Caffè");
    if (wikiCaffeFromApi) {
      console.log("[build-site] Wiki Caffè: avatar da Discord GET /users/@me (account bot).");
    } else {
      console.warn(
        "[build-site] Wiki Caffè: impossibile ottenere l’avatar via API. Imposta DISCORD_TOKEN_TEST (token del bot Coffee) nel .env del build, oppure wikiBotCaffeAvatarUrl in site.config.json.",
      );
    }
  }

  const wikiViniliAvatarRaw =
    wikiViniliCfgUrl ||
    wikiViniliFromApi ||
    "https://cdn.discordapp.com/embed/avatars/1.png";
  const wikiCaffeAvatarRaw =
    wikiCaffeCfgUrl ||
    wikiCaffeFromApi ||
    "https://cdn.discordapp.com/embed/avatars/4.png";
  const siteUrlForAbs = siteUrlTrim;
  const wikiViniliAvatarUrl = absUrlForMetadata(siteUrlForAbs, wikiViniliAvatarRaw);
  const wikiCaffeAvatarUrl = absUrlForMetadata(siteUrlForAbs, wikiCaffeAvatarRaw);

  const WIKI_CMD_PANES_HTML = buildWikiCommandPanesInnerHtml({
    avatarProdUrl: wikiViniliAvatarUrl,
    avatarTestUrl: wikiCaffeAvatarUrl,
  });

  let discordOauthRedirectRaw = String(cfg.discordOauth?.redirectUri || "").trim();
  if (String(process.env.VC_SITE_URL ?? "").trim()) {
    discordOauthRedirectRaw = "";
  }
  if (discordOauthRedirectRaw.includes("discord.com/oauth2/authorize")) {
    console.warn(
      "[build-site] discordOauth.redirectUri sembra l’URL di invito del bot, non la callback del sito. Uso siteUrl.",
    );
    discordOauthRedirectRaw = "";
  }
  const discordOauthRedirectResolved = discordOauthRedirectRaw || siteUrlTrim;
  const discordOauthRedirectNoSlash = discordOauthRedirectResolved.replace(/\/+$/, "");
  const candidatureSubmitApiFromEnv = String(process.env.VC_CANDIDATURE_SUBMIT_API_URL ?? "").trim();
  const candidatureSubmitApiRaw =
    candidatureSubmitApiFromEnv || String(cfg.candidatureSubmitApiUrl ?? "").trim();
  if (candidatureSubmitApiFromEnv) {
    console.log("[build-site] VC_CANDIDATURE_SUBMIT_API_URL (override):", candidatureSubmitApiFromEnv);
  }
  const candidatureSubmitApiResolved =
    candidatureSubmitApiRaw && /^https?:\/\//i.test(candidatureSubmitApiRaw)
      ? candidatureSubmitApiRaw
      : candidatureSubmitApiRaw && siteBaseNoSlash
        ? `${siteBaseNoSlash.replace(/\/+$/, "")}${candidatureSubmitApiRaw.startsWith("/") ? "" : "/"}${candidatureSubmitApiRaw}`
        : "";
  const candidatureSubmitApiLocalFromEnv = String(
    process.env.VC_CANDIDATURE_SUBMIT_API_URL_LOCAL ?? "",
  ).trim();
  const candidatureSubmitApiLocalRaw =
    candidatureSubmitApiLocalFromEnv || String(cfg.candidatureSubmitApiUrlLocal ?? "").trim();
  if (candidatureSubmitApiLocalFromEnv) {
    console.log(
      "[build-site] VC_CANDIDATURE_SUBMIT_API_URL_LOCAL (override):",
      candidatureSubmitApiLocalFromEnv,
    );
  }
  const candidatureSubmitApiLocalResolved =
    candidatureSubmitApiLocalRaw && /^https?:\/\//i.test(candidatureSubmitApiLocalRaw)
      ? candidatureSubmitApiLocalRaw
      : "";
  const unbanSubmitApiFromEnv = String(process.env.VC_UNBAN_SUBMIT_API_URL ?? "").trim();
  const unbanSubmitApiRaw =
    unbanSubmitApiFromEnv || String(cfg.unbanSubmitApiUrl ?? "").trim();
  const unbanSubmitApiResolved =
    unbanSubmitApiRaw && /^https?:\/\//i.test(unbanSubmitApiRaw)
      ? unbanSubmitApiRaw
      : unbanSubmitApiRaw && siteBaseNoSlash
        ? `${siteBaseNoSlash.replace(/\/+$/, "")}${unbanSubmitApiRaw.startsWith("/") ? "" : "/"}${unbanSubmitApiRaw}`
        : "";
  const unbanSubmitApiLocalFromEnv = String(process.env.VC_UNBAN_SUBMIT_API_URL_LOCAL ?? "").trim();
  const unbanSubmitApiLocalRaw =
    unbanSubmitApiLocalFromEnv || String(cfg.unbanSubmitApiUrlLocal ?? "").trim();
  const unbanSubmitApiLocalResolved =
    unbanSubmitApiLocalRaw && /^https?:\/\//i.test(unbanSubmitApiLocalRaw)
      ? unbanSubmitApiLocalRaw
      : "";
  const communityRulesApiFromEnv = String(process.env.VC_COMMUNITY_RULES_API_URL ?? "").trim();
  const communityRulesApiRaw =
    communityRulesApiFromEnv || String(cfg.communityRulesApiUrl ?? "").trim();
  const communityRulesApiResolved =
    communityRulesApiRaw && /^https?:\/\//i.test(communityRulesApiRaw)
      ? communityRulesApiRaw
      : communityRulesApiRaw && siteBaseNoSlash
        ? `${siteBaseNoSlash.replace(/\/+$/, "")}${communityRulesApiRaw.startsWith("/") ? "" : "/"}${communityRulesApiRaw}`
        : siteBaseNoSlash
          ? `${siteBaseNoSlash}/webhooks/site-rules`
          : "/webhooks/site-rules";
  const communityRulesApiLocalFromEnv = String(process.env.VC_COMMUNITY_RULES_API_URL_LOCAL ?? "").trim();
  const communityRulesApiLocalRaw =
    communityRulesApiLocalFromEnv || String(cfg.communityRulesApiUrlLocal ?? "").trim();
  const communityRulesApiLocalResolved =
    communityRulesApiLocalRaw && /^https?:\/\//i.test(communityRulesApiLocalRaw)
      ? communityRulesApiLocalRaw
      : "";
  const usersLeaderboardApiFromEnv = String(process.env.VC_USERS_LEADERBOARD_API_URL ?? "").trim();
  const usersLeaderboardApiRaw =
    usersLeaderboardApiFromEnv || String(cfg.usersLeaderboardApiUrl ?? "").trim();
  const usersLeaderboardApiResolved =
    usersLeaderboardApiRaw && /^https?:\/\//i.test(usersLeaderboardApiRaw)
      ? usersLeaderboardApiRaw
      : usersLeaderboardApiRaw && siteBaseNoSlash
        ? `${siteBaseNoSlash.replace(/\/+$/, "")}${usersLeaderboardApiRaw.startsWith("/") ? "" : "/"}${usersLeaderboardApiRaw}`
        : siteBaseNoSlash
          ? `${siteBaseNoSlash}/webhooks/site-users`
          : "/webhooks/site-users";
  const usersLeaderboardApiLocalFromEnv = String(process.env.VC_USERS_LEADERBOARD_API_URL_LOCAL ?? "").trim();
  const usersLeaderboardApiLocalRaw =
    usersLeaderboardApiLocalFromEnv || String(cfg.usersLeaderboardApiUrlLocal ?? "").trim();
  const usersLeaderboardApiLocalResolved =
    usersLeaderboardApiLocalRaw && /^https?:\/\//i.test(usersLeaderboardApiLocalRaw)
      ? usersLeaderboardApiLocalRaw
      : "";
  const userPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/user` : "/user";
  if (discordOauthRedirectResolved) {
    console.log(
      "[build-site] OAuth2 Redirect (Discord Developer Portal): registra solo questa callback (stesso redirect da tutte le pagine; il ritorno alla pagina corretta usa state):",
      JSON.stringify(discordOauthRedirectResolved),
    );
    if (discordOauthRedirectNoSlash !== discordOauthRedirectResolved) {
      console.log(
        "[build-site] Se in portale hai solo la variante senza slash finale, aggiungi anche:",
        JSON.stringify(discordOauthRedirectNoSlash),
      );
    }
    console.log(
      "[build-site] Stessa applicazione (client_id), sezione OAuth2: attiva «Implicit Grant» se usi response_type=token.",
    );
  }

  const map = {
    COOKIEYES_BLOCK: cookieYesBlock,
    GA_BLOCK: gaBlock,
    HERO_BANNER_BLOCK: heroBannerBlock,
    GUILD_ICON_URL: escAttr(guildIconUrl),
    OG_IMAGE_URL: escAttr(ogImageUrl),
    OG_TITLE: escAttr(ogTitle),
    OG_DESCRIPTION: escAttr(ogDesc),
    OG_URL: escAttr(ogUrl),
    STAFF_LIST_BLOCK: staffResult.html,
    LIVE_STATS_BOOT: liveStatsBoot,
    LIVE_STATS_BOOT_WIKI: liveStatsBootWiki,
    LIVE_STATS_BOOT_USER: liveStatsBootUser,
    ABOUT_DESCRIPTION: escHtml(aboutPlain),
    SITE_NAME: siteName,
    SITE_URL: escAttr(siteUrlTrim),
    TERMS_URL: escAttr(termsUrlResolved),
    PRIVACY_URL: escAttr(privacyUrlResolved),
    COOKIE_POLICY_URL: escAttr(cookiePolicyUrlResolved),
    LEGAL_TERMS_UPDATED: escHtml(legalTermsDate),
    LEGAL_PRIVACY_UPDATED: escHtml(legalPrivacyDate),
    LEGAL_COOKIE_UPDATED: escHtml(legalCookieDate),
    DISCORD_INVITE_DISPLAY: escHtml(discordInviteDisplay),
    SUPPORT_MAILTO: supEmail ? escAttr(`mailto:${supEmail}`) : escAttr("#"),
    VOTE_URL: cfg.voteUrl || "https://discadia.com/vote/viniliecaffe/",
    REVIEWS_URL: cfg.reviewsUrl || "https://disboard.org/it/server/1329080093599076474",
    DONATIONS_URL: escAttr(donationsUrlResolved),
    DISCORD_OAUTH_CLIENT_ID: String(cfg.discordOauth?.clientId || "").trim(),
    DISCORD_OAUTH_REDIRECT_URI: discordOauthRedirectResolved,
    DISCORD_INVITE_URL: discordInviteResolved,
    WIKI_URL: escAttr(wikiUrlResolved),
    FAQ_URL: escAttr(faqUrlResolved),
    COMMUNITY_RULES_URL: escAttr(communityRulesUrlResolved),
    RICHIESTE_UNBAN_URL: escAttr(richiesteUnbanUrl),
    RICHIESTE_CANDIDATURE_URL: escAttr(richiesteCandidatureUrl),
    CANDIDATURE_PAGE_TITLE: `${siteName} | Candidature staff`,
    CANDIDATURE_META_DESCRIPTION: escAttr(
      `Candidature Helper e Partner Manager: requisiti e modulo per ${siteName} su Discord.`,
    ),
    CANDIDATURE_OG_TITLE: escAttr(`${siteName} | Candidature`),
    CANDIDATURE_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/candidature` : ""),
    CANDIDATURE_SUBMIT_API_URL: escAttr(candidatureSubmitApiResolved),
    CANDIDATURE_SUBMIT_API_URL_LOCAL: escAttr(candidatureSubmitApiLocalResolved),
    UNBAN_SUBMIT_API_URL: escAttr(unbanSubmitApiResolved),
    UNBAN_SUBMIT_API_URL_LOCAL: escAttr(unbanSubmitApiLocalResolved),
    COMMUNITY_RULES_API_URL: escAttr(communityRulesApiResolved),
    COMMUNITY_RULES_API_URL_LOCAL: escAttr(communityRulesApiLocalResolved),
    USER_PAGE_URL: escAttr(userPageUrl),
    USERS_LEADERBOARD_API_URL: escAttr(usersLeaderboardApiResolved),
    USERS_LEADERBOARD_API_URL_LOCAL: escAttr(usersLeaderboardApiLocalResolved),
    USER_PAGE_TITLE: `${siteName} | Community · Classifica`,
    USER_META_DESCRIPTION: escAttr(
      `Classifica livelli ed EXP del server Discord ${siteName}: utenti ordinati per esperienza totale.`,
    ),
    USER_OG_TITLE: escAttr(`${siteName} | Community`),
    USER_OG_URL: escAttr(userPageUrl),
    REGOLE_PAGE_TITLE: `${siteName} | Regole della community`,
    REGOLE_META_DESCRIPTION: escAttr(`Regole del server Discord ${siteName}: generali, chat testuali e vocali.`),
    REGOLE_OG_TITLE: escAttr(`${siteName} | Regole`),
    REGOLE_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/regole` : ""),
    META_DESCRIPTION: cfg.metaDescription || "",
    META_KEYWORDS: cfg.metaKeywords || "",
    SUPPORT_EMAIL: cfg.supportEmail || "",
    SITE_MODERATOR_EMAIL: cfg.siteModeratorEmail || cfg.supportEmail || "",
    SITE_ADMIN_EMAIL: cfg.siteAdminEmail || cfg.supportEmail || "",
    FOUNDED_DISPLAY: foundedDisplay,
    STAT_MEMBERS: statMembers,
    STAT_BOOSTS: statBoosts,
    STAT_STAFF: statStaff,
    YEAR: year,
    INSTAGRAM_LI_INTRO: instagramLi,
    INSTAGRAM_LI_FOOTER: instagramLi,
    WIKI_PAGE_TITLE: `${siteName} Wiki`,
    WIKI_META_DESCRIPTION: escAttr(
      `Documentazione, comandi e guide del server ${siteName} su Discord.`,
    ),
    WIKI_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/wiki` : ""),
    WIKI_OG_TITLE: escAttr(`${siteName} | Wiki`),
    WIKI_BOT_VINILI_AVATAR_URL: escAttr(wikiViniliAvatarUrl),
    WIKI_BOT_CAFFE_AVATAR_URL: escAttr(wikiCaffeAvatarUrl),
    WIKI_CMD_PANES_HTML,
  };

  html = applyPlaceholderMap(html, map);
  warnLeftoverPlaceholders(html, "index.html");

  fs.writeFileSync(indexPath, html, "utf8");

  const wikiIndexPath = path.join(DIST, "wiki", "index.html");
  if (fs.existsSync(wikiIndexPath)) {
    let wikiHtml = fs.readFileSync(wikiIndexPath, "utf8");
    wikiHtml = applyPlaceholderMap(wikiHtml, map);
    warnLeftoverPlaceholders(wikiHtml, "wiki/index.html");
    fs.writeFileSync(wikiIndexPath, wikiHtml, "utf8");
  } else {
    console.warn("[build-site] Manca wiki/index.html (saltato placeholder).");
  }

  const candidatureIndexPath = path.join(DIST, "candidature", "index.html");
  if (fs.existsSync(candidatureIndexPath)) {
    let candidatureHtml = fs.readFileSync(candidatureIndexPath, "utf8");
    candidatureHtml = applyPlaceholderMap(candidatureHtml, map);
    warnLeftoverPlaceholders(candidatureHtml, "candidature/index.html");
    fs.writeFileSync(candidatureIndexPath, candidatureHtml, "utf8");
  } else {
    console.warn("[build-site] Manca candidature/index.html (saltato placeholder).");
  }
  const unbanIndexPath = path.join(DIST, "unban", "index.html");
  if (fs.existsSync(unbanIndexPath)) {
    let unbanHtml = fs.readFileSync(unbanIndexPath, "utf8");
    unbanHtml = applyPlaceholderMap(unbanHtml, map);
    warnLeftoverPlaceholders(unbanHtml, "unban/index.html");
    fs.writeFileSync(unbanIndexPath, unbanHtml, "utf8");
  } else {
    console.warn("[build-site] Manca unban/index.html (saltato placeholder).");
  }
  const candidatureAccessRequiredPath = path.join(DIST, "candidature", "accesso-richiesto", "index.html");
  if (fs.existsSync(candidatureAccessRequiredPath)) {
    let arHtml = fs.readFileSync(candidatureAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "candidature/accesso-richiesto/index.html");
    fs.writeFileSync(candidatureAccessRequiredPath, arHtml, "utf8");
  }
  const unbanAccessRequiredPath = path.join(DIST, "unban", "accesso-richiesto", "index.html");
  if (fs.existsSync(unbanAccessRequiredPath)) {
    let arHtml = fs.readFileSync(unbanAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "unban/accesso-richiesto/index.html");
    fs.writeFileSync(unbanAccessRequiredPath, arHtml, "utf8");
  }
  const notificationsIndexPath = path.join(DIST, "notifications", "index.html");
  if (fs.existsSync(notificationsIndexPath)) {
    let nHtml = fs.readFileSync(notificationsIndexPath, "utf8");
    nHtml = applyPlaceholderMap(nHtml, map);
    warnLeftoverPlaceholders(nHtml, "notifications/index.html");
    fs.writeFileSync(notificationsIndexPath, nHtml, "utf8");
  }

  const userIndexPath = path.join(DIST, "user", "index.html");
  if (fs.existsSync(userIndexPath)) {
    let userHtml = fs.readFileSync(userIndexPath, "utf8");
    userHtml = applyPlaceholderMap(userHtml, map);
    warnLeftoverPlaceholders(userHtml, "user/index.html");
    fs.writeFileSync(userIndexPath, userHtml, "utf8");
  } else {
    console.warn("[build-site] Manca user/index.html (saltato placeholder).");
  }

  const regoleIndexPath = path.join(DIST, "regole", "index.html");
  if (fs.existsSync(regoleIndexPath)) {
    let regoleHtml = fs.readFileSync(regoleIndexPath, "utf8");
    regoleHtml = applyPlaceholderMap(regoleHtml, map);
    warnLeftoverPlaceholders(regoleHtml, "regole/index.html");
    fs.writeFileSync(regoleIndexPath, regoleHtml, "utf8");
  } else {
    console.warn("[build-site] Manca regole/index.html (saltato placeholder).");
  }

  const legalRel = ["terms/index.html", "privacy/index.html", "cookie/index.html"];
  for (const rel of legalRel) {
    const legalPath = path.join(DIST, rel);
    if (!fs.existsSync(legalPath)) {
      console.warn("[build-site] Manca pagina legale:", rel);
      continue;
    }
    let legalHtml = fs.readFileSync(legalPath, "utf8");
    legalHtml = applyPlaceholderMap(legalHtml, map);
    warnLeftoverPlaceholders(legalHtml, rel);
    fs.writeFileSync(legalPath, legalHtml, "utf8");
  }

  console.log("Build OK:", path.relative(process.cwd(), DIST));
}

const runExtraOnly = process.argv.includes("--only-live-stats-extra");
(runExtraOnly ? mainLiveStatsExtraOnly() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});