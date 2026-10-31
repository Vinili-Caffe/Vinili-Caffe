/** Bacheche: controllo che i link inseriti esistano (inviti Discord, GitHub, YouTube, siti). */
const { SOCIAL_HANDLE_BUILDERS } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");

/* boardsLinkCheck1: probe invite/social/sito/banner per ✓/✗ nel form */
/* boardsLinkCheck2: Instagram/X spesso 429 anti-bot → soft ✓ se handle valido */
const PROBE_UA = "ViniliBoardsLinkCheck/1.0 (+https://www.viniliecaffe.it)";
const probeRateByUser = new Map();

function probeAllow(userId?) {
  const now = Date.now();
  const key = String(userId || "anon");
  let bucket = probeRateByUser.get(key);
  if (!bucket || now - bucket.start > 60_000) {
    bucket = { start: now, n: 0 };
    probeRateByUser.set(key, bucket);
  }
  bucket.n += 1;
  if (probeRateByUser.size > 2000) {
    for (const [k, v] of probeRateByUser) {
      if (now - v.start > 120_000) probeRateByUser.delete(k);
    }
  }
  return bucket.n <= 90;
}

function inviteCodeFromRaw(raw?) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return v
    .replace(/^https?:\/\/(www\.)?discord\.gg\//i, "")
    .replace(/^https?:\/\/(www\.)?discord\.com\/invite\//i, "")
    .replace(/^discord\.gg\//i, "")
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .trim();
}

async function fetchProbe(url?, opts: Record<string, any> = {}) {
  const method = opts.method || "GET";
  const timeoutMs = Math.max(1500, Math.min(8000, Number(opts.timeoutMs) || 5500));
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch (_) {}
  }, timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: opts.accept || "*/*",
        "User-Agent": PROBE_UA,
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function probeHttpExists(url?, { expectImage = false, softBlockOk = false } = {}) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, found: false, reason: "invalid_url" };
  }
  let res = null;
  try {
    res = await fetchProbe(target, { method: "HEAD", timeoutMs: 4500 });
  } catch (_) {
    res = null;
  }
  const retryGet =
    !res ||
    res.status === 405 ||
    res.status === 501 ||
    res.status === 403 ||
    res.status === 429 ||
    res.status === 503;
  if (retryGet) {
    try {
      res = await fetchProbe(target, {
        method: "GET",
        timeoutMs: 5500,
        accept: expectImage ? "image/*,*/*;q=0.8" : "text/html,application/json,*/*;q=0.8",
        headers: {
          /* boardsLinkCheck2: UA browser riduce qualche blocco (non Instagram 429 sul VPS) */
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        },
      });
    } catch (_) {
      if (softBlockOk) {
        return { ok: true, found: true, reason: "soft_ok_unreachable" };
      }
      return { ok: true, found: false, reason: "unreachable" };
    }
  }
  const status = Number(res.status) || 0;
  if (status === 404 || status === 410 || status === 451) {
    return { ok: true, found: false, reason: "not_found", status };
  }
  if (status >= 200 && status < 400) {
    if (expectImage) {
      const ct = String(res.headers.get("content-type") || "").toLowerCase();
      if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
        return { ok: true, found: false, reason: "not_image", status, contentType: ct };
      }
    }
    return { ok: true, found: true, status };
  }
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    /* social anti-bot (IG 429 sul VPS): handle valido → soft ✓ */
    if (softBlockOk || status === 401 || status === 403) {
      return { ok: true, found: true, reason: "soft_ok", status };
    }
  }
  return { ok: true, found: false, reason: "bad_status", status };
}

async function probeDiscordInvite(code?) {
  const c = String(code || "").trim();
  if (!/^[A-Za-z0-9-]{2,64}$/.test(c)) {
    return { ok: true, found: false, reason: "invalid_code" };
  }
  try {
    const res = await fetchProbe(`https://discord.com/api/v10/invites/${encodeURIComponent(c)}?with_counts=true`, {
      method: "GET",
      timeoutMs: 5500,
      accept: "application/json",
    });
    if (res.status === 404 || res.status === 410) {
      return { ok: true, found: false, reason: "not_found", status: res.status };
    }
    if (!res.ok) {
      return { ok: true, found: false, reason: "bad_status", status: res.status };
    }
    const data: any = await res.json().catch(() => null);
    const guildName = String(data?.guild?.name || data?.guild_name || "").trim();
    return {
      ok: true,
      found: true,
      status: res.status,
      label: guildName || undefined,
    };
  } catch (_) {
    return { ok: true, found: false, reason: "unreachable" };
  }
}

async function probeGithubUser(handle?) {
  const h = String(handle || "").trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(h)) {
    return { ok: true, found: false, reason: "invalid_handle" };
  }
  try {
    const res = await fetchProbe(`https://api.github.com/users/${encodeURIComponent(h)}`, {
      method: "GET",
      timeoutMs: 5500,
      accept: "application/vnd.github+json",
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (res.status === 404) return { ok: true, found: false, reason: "not_found", status: 404 };
    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      return {
        ok: true,
        found: true,
        status: res.status,
        label: String(data?.login || h),
      };
    }
    return probeHttpExists(`https://github.com/${encodeURIComponent(h)}`);
  } catch (_) {
    return { ok: true, found: false, reason: "unreachable" };
  }
}

async function probeYoutubeHandle(handle?) {
  const h = String(handle || "").trim().replace(/^@+/, "");
  if (!h) return { ok: true, found: false, reason: "invalid_handle" };
  const url = `https://www.youtube.com/@${encodeURIComponent(h)}`;
  try {
    const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetchProbe(oembed, { method: "GET", timeoutMs: 5500, accept: "application/json" });
    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      return {
        ok: true,
        found: true,
        status: res.status,
        label: String(data?.author_name || h),
      };
    }
    if (res.status === 404) return { ok: true, found: false, reason: "not_found", status: 404 };
  } catch (_) {}
  return probeHttpExists(url, { softBlockOk: true });
}

async function probeBoardLink(client?, payload: Record<string, any> = {}) {
  void client;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  if (!probeAllow(auth.userId)) {
    return { ok: false, status: 429, error: "rate_limited", message: "Troppi controlli, riprova tra poco." };
  }

  const kind = String(payload.kind || payload.type || "").trim().toLowerCase();
  const raw = String(payload.value || payload.url || payload.handle || "").trim();
  if (!kind) {
    return { ok: false, status: 400, error: "missing_kind", message: "Tipo link mancante." };
  }
  if (!raw) {
    return { ok: true, status: 200, found: false, empty: true, kind };
  }

  const socialKeys = ["youtube", "twitch", "instagram", "tiktok", "x", "github"];
  if (kind === "invite" || kind === "discord_invite") {
    const code = inviteCodeFromRaw(raw);
    const out = await probeDiscordInvite(code);
    return { ...out, status: 200, kind: "invite", value: code ? `https://discord.gg/${code}` : "" };
  }

  if (kind === "bot_invite") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    const okHost =
      /discord\.com\/(api\/)?oauth2\/authorize/i.test(url) ||
      /discordapp\.com\/(api\/)?oauth2\/authorize/i.test(url);
    if (!okHost || !/[?&]client_id=\d{5,}/i.test(url)) {
      return { ok: true, status: 200, found: false, kind, reason: "invalid_bot_invite" };
    }
    return { ok: true, status: 200, found: true, kind, value: url };
  }

  if (kind === "website" || kind === "site") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    try {
      const u = new URL(url);
      if (!u.hostname || !u.hostname.includes(".")) {
        return { ok: true, status: 200, found: false, kind: "website", reason: "invalid_host" };
      }
      url = u.toString();
    } catch (_) {
      return { ok: true, status: 200, found: false, kind: "website", reason: "invalid_url" };
    }
    const out = await probeHttpExists(url);
    return { ...out, status: 200, kind: "website", value: url };
  }

  if (kind === "banner" || kind === "image") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    try {
      url = new URL(url).toString();
    } catch (_) {
      return { ok: true, status: 200, found: false, kind: "banner", reason: "invalid_url" };
    }
    const out = await probeHttpExists(url, { expectImage: true });
    return { ...out, status: 200, kind: "banner", value: url };
  }

  if (socialKeys.includes(kind)) {
    const handle = String(raw)
      .replace(/^@+/, "")
      .replace(/^\/+/, "")
      .split(/[/?#]/)[0]
      .trim();
    if (!handle || !/^[A-Za-z0-9._-]{1,64}$/.test(handle)) {
      return { ok: true, status: 200, found: false, kind, reason: "invalid_handle" };
    }
    if (kind === "github") {
      const out = await probeGithubUser(handle);
      return { ...out, status: 200, kind, value: SOCIAL_HANDLE_BUILDERS.github(handle) };
    }
    if (kind === "youtube") {
      const out = await probeYoutubeHandle(handle);
      return { ...out, status: 200, kind, value: SOCIAL_HANDLE_BUILDERS.youtube(handle) };
    }
    const built = SOCIAL_HANDLE_BUILDERS[kind](handle);
    /* IG/X/TikTok/Twitch: anti-bot frequente → soft ✓ se handle ok */
    const out = await probeHttpExists(built, { softBlockOk: true });
    return { ...out, status: 200, kind, value: built };
  }

  return { ok: false, status: 400, error: "unknown_kind", message: "Tipo link non supportato." };
}

export = { probeBoardLink };
