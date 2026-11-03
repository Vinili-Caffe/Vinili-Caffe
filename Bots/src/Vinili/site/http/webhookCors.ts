/** Webhook HTTP: helper CORS (allowlist, loopback, middleware sito). */
function normalizeCorsOriginEntry(entry?) {
  const stripped = String(entry || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  if (!stripped) return "";
  try {
    const u = new URL(stripped);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function parseCorsOriginAllowlist(raw?) {
  return String(raw || "")
    .split(",")
    .map((s?) => normalizeCorsOriginEntry(s))
    .filter(Boolean);
}

function expandCorsOriginAllowlist(origins?) {
  const set = new Set(origins);
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (u.hostname === "localhost") {
        const alt = new URL(o);
        alt.hostname = "127.0.0.1";
        set.add(alt.origin);
      } else if (u.hostname === "127.0.0.1") {
        const alt = new URL(o);
        alt.hostname = "localhost";
        set.add(alt.origin);
      } else if (u.hostname.startsWith("www.")) {
        // appelliApi1: site lives on www; env often has apex-only CORS origins
        const alt = new URL(o);
        alt.hostname = u.hostname.slice(4);
        set.add(alt.origin);
      } else if (u.hostname && !u.hostname.startsWith("www.")) {
        const alt = new URL(o);
        alt.hostname = `www.${u.hostname}`;
        set.add(alt.origin);
      }
    } catch {
      continue;
    }
  }
  return [...set];
}

function isLoopbackBrowserOriginUrl(origin?) {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

function corsAllowlistPermitsAnyLoopbackDevOrigin(allowlist?) {
  return allowlist.some((o?) => isLoopbackBrowserOriginUrl(o));
}

function createSiteCandidatureCorsMiddleware(candidatureCorsAllowlist?) {
  return (req?, res?, next?) => {
    const rawPath = String(req.originalUrl || req.url || req.path || "");
    const pathStr = rawPath.split("?")[0];
    const isStatus = pathStr === "/webhooks/status" || pathStr === "/webhooks/health";
    const isCandidature = pathStr.startsWith("/webhooks/site-candidature");
    const isUnban = pathStr.startsWith("/webhooks/site-unban");
    const isUnmute = pathStr.startsWith("/webhooks/site-unmute");
    const isSiteRules = pathStr.startsWith("/webhooks/site-rules");
    const isSiteUsers = pathStr.startsWith("/webhooks/site-users");
    /* bachecaSite1: la Bacheca del sito ha le stesse regole (CORS, metodi) dei contenuti del profilo */
    const isSiteUserBoards = pathStr.startsWith("/webhooks/site-user-boards") || pathStr.startsWith("/webhooks/site-bacheca");
    const isSiteVote = pathStr.startsWith("/webhooks/site-vote");
    const isSiteLiveEvent = pathStr.startsWith("/webhooks/site-live-event");
    const isSiteRoles = pathStr.startsWith("/webhooks/site-roles");
    const isSiteRankCard = pathStr.startsWith("/webhooks/site-rank-card");
    const isSiteWikiHelp = pathStr.startsWith("/webhooks/site-wiki-help");
    const isSiteReviews = pathStr.startsWith("/webhooks/site-reviews");
    const isSiteBoards = pathStr.startsWith("/webhooks/site-boards");
    const isSiteSuggestions = pathStr.startsWith("/webhooks/site-suggestions");
    const isSiteBotFeedback = pathStr.startsWith("/webhooks/site-bot-feedback");
    const isSiteWebTickets = pathStr.startsWith("/webhooks/site-web-tickets");
    const isSiteNotifications = pathStr.startsWith("/webhooks/site-notifications");
    const isSiteVerify = pathStr.startsWith("/webhooks/site-verify");
    const isSiteSeratafilmAccess =
      pathStr.startsWith("/webhooks/site-seratafilm-access") ||
      pathStr.startsWith("/webhooks/site-seratafilm-film");
    const isSiteStaffAccess =
      pathStr.startsWith("/webhooks/site-staff-access") ||
      pathStr.startsWith("/webhooks/site-staff-dashboard") ||
      pathStr.startsWith("/webhooks/site-staff-manage") ||
      pathStr.startsWith("/webhooks/site-staff-organico") ||
      pathStr.startsWith("/webhooks/site-staff-pause") ||
      pathStr.startsWith("/webhooks/site-staff-compiti") ||
      pathStr.startsWith("/webhooks/site-staff-profile") ||
      pathStr.startsWith("/webhooks/site-staff-pm-hub") ||
      pathStr.startsWith("/webhooks/site-staff-pm-points-removed") ||
      pathStr.startsWith("/webhooks/site-staff-pm-shop") ||
      pathStr.startsWith("/webhooks/site-staff-pm-actions") ||
      pathStr.startsWith("/webhooks/site-staff-tickets") ||
      pathStr.startsWith("/webhooks/site-staff-seratafilm") ||
      pathStr.startsWith("/webhooks/site-staff-guide");
    const isSiteHogwartsSorting = pathStr.startsWith("/webhooks/site-hogwarts-sorting");
    const isSiteCustomProfile = pathStr.startsWith("/webhooks/site-custom-profile");
    const isSiteProfileExtras = pathStr.startsWith("/webhooks/site-profile-extras");
    // appelliApi1: subject live chat on /appelli uses these user workflow endpoints
    const isSiteUserWorkflow =
      pathStr.startsWith("/webhooks/site-user-workflows") ||
      pathStr.startsWith("/webhooks/site-user-workflow-chat");
    const isSiteStaffWorkflow =
      pathStr.startsWith("/webhooks/site-staff-workflows") ||
      pathStr.startsWith("/webhooks/site-staff-workflow-chat");
    if (
      !isStatus &&
      !isCandidature &&
      !isUnban &&
      !isUnmute &&
      !isSiteRules &&
      !isSiteUsers &&
      !isSiteUserBoards &&
      !isSiteVote &&
      !isSiteLiveEvent &&
      !isSiteRoles &&
      !isSiteRankCard &&
      !isSiteWikiHelp &&
      !isSiteReviews &&
      !isSiteBoards &&
      !isSiteSuggestions &&
      !isSiteBotFeedback &&
      !isSiteWebTickets &&
      !isSiteNotifications &&
      !isSiteVerify &&
      !isSiteSeratafilmAccess &&
      !isSiteStaffAccess &&
      !isSiteHogwartsSorting &&
      !isSiteCustomProfile &&
      !isSiteProfileExtras &&
      !isSiteUserWorkflow &&
      !isSiteStaffWorkflow
    ) {
      return next();
    }
    const originRaw = String(req.headers.origin || "").trim();
    const originNorm = originRaw ? normalizeCorsOriginEntry(originRaw) || originRaw : "";
    let allowOrigin = "";
    if (originNorm && candidatureCorsAllowlist.includes(originNorm)) {
      allowOrigin = originNorm;
    } else if (
      originNorm &&
      candidatureCorsAllowlist.length > 0 &&
      corsAllowlistPermitsAnyLoopbackDevOrigin(candidatureCorsAllowlist) &&
      isLoopbackBrowserOriginUrl(originNorm)
    ) {
      allowOrigin = originNorm;
    } else if (originNorm && candidatureCorsAllowlist.length === 0) {
      if (isLoopbackBrowserOriginUrl(originNorm)) allowOrigin = originNorm;
    }
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.append("Vary", "Origin");
    } else if (isStatus || isSiteRules || isSiteUsers || isSiteUserBoards || isSiteVote || isSiteLiveEvent || isSiteRoles || isSiteRankCard || isSiteWikiHelp || isSiteReviews || isSiteBoards || isSiteSuggestions || isSiteBotFeedback || isSiteNotifications || isSiteSeratafilmAccess || isSiteStaffAccess || isSiteHogwartsSorting) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Cache-Control, Pragma, Access-Control-Request-Private-Network, X-VC-View-As");
    if (allowOrigin) res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export = {
  normalizeCorsOriginEntry,
  parseCorsOriginAllowlist,
  expandCorsOriginAllowlist,
  isLoopbackBrowserOriginUrl,
  corsAllowlistPermitsAnyLoopbackDevOrigin,
  createSiteCandidatureCorsMiddleware,
};
