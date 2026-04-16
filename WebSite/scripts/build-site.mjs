import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "site.config.json");
const FALLBACK_GUILD_ICON = "images/ocean.png";
/** Discord snowflake epoch (2015-01-01 UTC), ms since Unix epoch. */
const DISCORD_EPOCH_MS = 1420070400000;

const STAFF_LIST_FALLBACK_HTML = `          <p>
            L&apos;organico dello staff, i permessi e i canali dedicati sono gestiti sul server Discord. Per segnalazioni o partnership
            usa i contatti qui sotto o i ticket indicati nelle regole del server.
          </p>`;

const EXCLUDE = new Set([
  "dist",
  "scripts",
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

async function fetchInviteGuildSnapshot(inviteCode) {
  const code = String(inviteCode || "").trim();
  if (!code) return null;
  const url = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=1`;
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
    if (!guild?.id) return null;
    return {
      guildId: guild.id,
      banner: guild.banner,
      icon: guild.icon,
      approximateMemberCount: data.approximate_member_count,
      boostCount: guild.premium_subscription_count,
      guildDescription:
        guild.description != null && String(guild.description).trim()
          ? String(guild.description)
          : "",
    };
  } catch (e) {
    console.warn("[build-site] JSON invite:", e?.message || e);
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
  const un = String(u.username || "").trim();
  const disc = String(u.discriminator ?? "0");
  const nick = m?.nick != null ? String(m.nick).trim() : "";
  const gn = u.global_name != null ? String(u.global_name).trim() : "";
  if (disc && disc !== "0") return `${un}#${disc}`;
  return nick || gn || un || "Utente";
}

function staffListFallback() {
  return { html: STAFF_LIST_FALLBACK_HTML, staffCount: null };
}

function buildLiveStatsBootHtml(cfg, inviteCode) {
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
  const payload = {
    enabled: true,
    inviteCode: code,
    inviteProxyPath: inviteProxy,
    extraStatsPath: extraStats,
    pollIntervalMs: pollMs,
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_LIVE=${json};</script>\n` +
    `    <script src="js/live-stats.js" defer></script>\n`
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
  const maxScan = Number.isFinite(Number(b.maxMembersToScan)) ? Number(b.maxMembersToScan) : 4000;
  const members = await fetchGuildMembersUpTo(gid, botToken, maxScan);
  if (!members.length) {
    console.warn("[build-site] Nessun membro scaricato per la staff list.");
    return staffListFallback();
  }

  const labelOverrides =
    b.staffRoleLabels && typeof b.staffRoleLabels === "object" && !Array.isArray(b.staffRoleLabels)
      ? b.staffRoleLabels
      : {};

  const rows = [];
  for (const m of members) {
    if (m?.user?.bot) continue;
    const rids = memberRoleIds(m);
    const rset = new Set(rids);
    let excluded = false;
    for (const ex of excludeRoleIds) {
      if (rset.has(ex)) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    let bestId = null;
    let bestPos = -999999;
    for (const rid of rids) {
      if (!staffRoleIds.has(rid)) continue;
      const meta = roleMetas.get(rid);
      const pos = meta ? Number(meta.position) : 0;
      if (pos > bestPos) {
        bestPos = pos;
        bestId = rid;
      }
    }
    if (!bestId) continue;
    const rawLabel = roleMetas.get(bestId)?.name || bestId;
    const roleLabel = String(labelOverrides[bestId] ?? labelOverrides[String(bestId)] ?? rawLabel).trim() || rawLabel;
    rows.push({ bestId, bestPos, roleLabel, m });
  }

  if (!rows.length) {
    console.warn("[build-site] Staff list: nessun membro dopo filtri (ruoli o intent).");
    return staffListFallback();
  }

  const byRole = new Map();
  for (const row of rows) {
    if (!byRole.has(row.bestId)) {
      byRole.set(row.bestId, { roleLabel: row.roleLabel, bestPos: row.bestPos, members: [] });
    }
    const g = byRole.get(row.bestId);
    g.members.push(row.m);
  }

  const groups = [...byRole.values()].sort((a, b) => b.bestPos - a.bestPos);
  for (const g of groups) {
    g.members.sort((ma, mb) =>
      memberStaffLineName(ma).localeCompare(memberStaffLineName(mb), "it", { sensitivity: "base" }),
    );
  }

  const roleLines = groups
    .map((g) => {
      const parts = g.members.map((mem) => escHtml(memberStaffLineName(mem))).join(" | ");
      return `            <p class="vc-staff-block__line"><strong>${escHtml(g.roleLabel)}:</strong> ${parts}</p>`;
    })
    .join("\n");

  const html = `          <div class="vc-staff-block">\n${roleLines}\n          </div>`;
  return { html, staffCount: rows.length };
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

  let snap = null;
  if (needInvite) {
    snap = await fetchInviteGuildSnapshot(inviteCode);
  }

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
  const configuredAbout = String(cfg.aboutDescription ?? "").trim();
  let aboutPlain = configuredAbout;
  if (!aboutPlain && wantGuildDescription && snap?.guildDescription) {
    const gd = String(snap.guildDescription).trim();
    if (gd) aboutPlain = gd;
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

  if (staffResult.staffCount != null) {
    const extraPath = path.join(DIST, "live-stats-extra.json");
    fs.writeFileSync(
      extraPath,
      JSON.stringify({ staffNoPm: staffResult.staffCount }),
      "utf8",
    );
  }

  const map = {
    COOKIEYES_BLOCK: cookieYesBlock,
    GA_BLOCK: gaBlock,
    HERO_BANNER_BLOCK: heroBannerBlock,
    GUILD_ICON_URL: escAttr(guildIconUrl),
    STAFF_LIST_BLOCK: staffResult.html,
    LIVE_STATS_BOOT: liveStatsBoot,
    ABOUT_DESCRIPTION: escHtml(aboutPlain),
    SITE_NAME: siteName,
    SITE_URL: cfg.siteUrl || "",
    DISCORD_INVITE_URL: cfg.discordInviteUrl || "https://discord.gg/viniliecaffe",
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
  };

  for (const [key, value] of Object.entries(map)) {
    const ph = `{{${key}}}`;
    if (!html.includes(ph)) {
      continue;
    }
    html = html.split(ph).join(String(value ?? ""));
  }

  const leftover = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (leftover.length) {
    console.warn("Placeholder non sostituiti:", [...new Set(leftover)].join(", "));
  }

  fs.writeFileSync(indexPath, html, "utf8");
  console.log("Build OK:", path.relative(process.cwd(), DIST));
}

const runExtraOnly = process.argv.includes("--only-live-stats-extra");
(runExtraOnly ? mainLiveStatsExtraOnly() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});