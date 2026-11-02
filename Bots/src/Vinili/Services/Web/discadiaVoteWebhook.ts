/** Webhook HTTP: voto Discadia (parse body, secret, route). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers") as typeof import("../../Utils/Message/officialMessageAutomationHandlers");
const { enqueuePendingDiscadiaVote } = require("./discadiaVoteInboxService") as typeof import("./discadiaVoteInboxService");

function shouldStartDiscadiaVoteHttpWebhook(client?) {
  const env = String(process.env.DISCADIA_VOTE_HTTP_WEBHOOK || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(env)) return true;
  if (["0", "false", "no", "off"].includes(env)) return false;
  return Boolean(client?.config?.discadia?.httpVoteWebhookEnabled);
}

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function asDiscordSnowflakeId(value?) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const id = String(Math.trunc(value));
    return /^\d{17,22}$/.test(id) ? id : null;
  }
  if (typeof value === "bigint") {
    const id = String(value);
    return /^\d{17,22}$/.test(id) ? id : null;
  }
  const text = String(value).trim();
  if (/^\d{17,22}$/.test(text)) return text;
  return null;
}

function extractSnowflakeFromText(text?) {
  if (!text) return null;
  const mention = String(text).match(/<@!?(\d{17,22})>/);
  if (mention) return mention[1];
  const labeled = String(text).match(
    /["']?(?:user(?:[_-]?id)?|voter(?:[_-]?id)?|discord(?:[_-]?id)?|uid|member(?:[_-]?id)?)["']?\s*[:=]\s*["']?(\d{17,22})/i,
  );
  if (labeled) return labeled[1];
  const snowflake = String(text).match(/\b(\d{17,22})\b/);
  return snowflake ? snowflake[1] : null;
}

function flattenWebhookEmbedText(embed?) {
  if (!embed || typeof embed !== "object") return "";
  const parts = [];
  const push = (value?) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  return parts.join("\n");
}

function extractVoteWebhookUserId(body?) {
  if (!body || typeof body === "string") {
    if (typeof body === "string") return extractSnowflakeFromText(body);
    return null;
  }
  if (Buffer.isBuffer(body)) return extractVoteWebhookUserId(body.toString("utf8"));

  const directUser = asDiscordSnowflakeId(body.user);
  if (directUser) return directUser;

  const candidates = [
    body.user_id,
    body.userId,
    body.userid,
    body.uid,
    body.voter_id,
    body.voterId,
    body.discord_id,
    body.discordId,
    body.member_id,
    body.memberId,
    body.user?.id,
    body.user?.user_id,
    body.user?.userId,
    body.user?.discord_id,
    body.user?.discordId,
    body.user?.platform_id,
    body.user?.platformId,
    body.voter?.id,
    body.voter,
    body.member?.id,
    body.member,
    body.data?.user?.id,
    body.data?.user?.platform_id,
    body.data?.user?.platformId,
    body.data?.user?.discord_id,
    body.data?.user?.discordId,
    body.data?.user_id,
    body.data?.userId,
    body.data?.voter_id,
    body.data?.voterId,
    typeof body.content === "string" ? body.content : null,
    body.id,
  ];
  for (const c of candidates) {
    const asId = asDiscordSnowflakeId(c);
    if (asId) return asId;
    if (typeof c === "string") {
      const fromText = extractSnowflakeFromText(c);
      if (fromText) return fromText;
    }
  }

  if (Array.isArray(body.embeds)) {
    for (const embed of body.embeds) {
      const fromEmbed = extractSnowflakeFromText(flattenWebhookEmbedText(embed));
      if (fromEmbed) return fromEmbed;
    }
  }
  return null;
}

function normalizeWebhookPath(pathRaw?) {
  const pathOnly = String(pathRaw || "").split("?")[0];
  if (!pathOnly || pathOnly === "/") return "/";
  return pathOnly.replace(/\/+$/, "") || "/";
}

function isDiscadiaWebhookRequest(req?) {
  return normalizeWebhookPath(req.originalUrl || req.url || req.path) === "/webhooks/discadia";
}

function summarizeRawBodyForLog(rawBuf?, maxLen = 240) {
  if (!Buffer.isBuffer(rawBuf) || rawBuf.length === 0) return "(empty)";
  const compact = rawBuf.toString("utf8").replace(/\s+/g, " ").trim();
  if (!compact) return "(empty)";
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen)}…`;
}

function parseDiscadiaWebhookBodyFromRaw(rawBuf?, contentTypeRaw?) {
  if (!Buffer.isBuffer(rawBuf) || rawBuf.length === 0) return {};
  const raw = rawBuf.toString("utf8").trim();
  if (!raw) return {};

  const contentType = String(contentTypeRaw || "").toLowerCase();
  const looksUrlEncoded =
    contentType.includes("application/x-www-form-urlencoded") ||
    (!raw.startsWith("{") && !raw.startsWith("[") && raw.includes("="));

  if (looksUrlEncoded) {
    try {
      const params = new URLSearchParams(raw);
      if ([...params.keys()].length) {
        const out: Record<string, any> = {};
        for (const [key, value] of params) out[key] = value;
        return out;
      }
    } catch {
    }
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }

  const userFromText = extractSnowflakeFromText(raw);
  if (userFromText) return { user_id: userFromText };
  return {};
}

function resolveDiscadiaWebhookBody(req?) {
  const fromParser = req.body;
  if (fromParser && typeof fromParser === "object" && !Buffer.isBuffer(fromParser)) {
    const keys = Object.keys(fromParser);
    if (keys.length) return fromParser;
  }
  const fromRaw = parseDiscadiaWebhookBodyFromRaw(req._discadiaRawBody, req.headers["content-type"]);
  if (fromRaw && typeof fromRaw === "object" && Object.keys(fromRaw).length) return fromRaw;
  if (req.query && typeof req.query === "object" && Object.keys(req.query).length) return req.query;
  return fromRaw || {};
}

function extractDiscadiaProvidedSecret(req?) {
  const fromHeader = normalizeHeaderSecret(
    req.headers["authorization"] || req.headers["x-discadia-secret"],
  );
  if (fromHeader) return fromHeader;
  const q = req.query || {};
  const fromQuery = String(q.secret || q.key || q.token || "").trim();
  if (fromQuery) return fromQuery;
  const pathOnly = normalizeWebhookPath(req.originalUrl || req.url || req.path || "");
  const m = pathOnly.match(/^\/webhooks\/discadia\/([^/]+)\/?$/i);
  if (m && m[1] && m[1].toLowerCase() !== "health") return decodeURIComponent(m[1]);
  return "";
}

function discadiaSecretsEqual(a?, b?) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (!left.length || left.length !== right.length) return false;
  try {
    return require("node:crypto").timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

async function handleDiscadiaVoteWebhook(req?, res?, client?, secret?) {
  try {
    if (!secret) {
      global.logger?.error?.("[WEBHOOK] Discadia: DISCADIA_WEBHOOK_SECRET missing — refuse");
      return res.status(503).send("Misconfigured");
    }
    const receivedSecret = extractDiscadiaProvidedSecret(req);
    if (!receivedSecret || !discadiaSecretsEqual(receivedSecret, secret)) {
      global.logger?.warn?.("[WEBHOOK] Discadia: Unauthorized request (secret mismatch)");
      return res.status(401).send("Unauthorized");
    }

    const body = resolveDiscadiaWebhookBody(req);
    const rawText = Buffer.isBuffer(req._discadiaRawBody)
      ? req._discadiaRawBody.toString("utf8")
      : "";
    const user_id =
      extractSnowflakeFromText(rawText) ||
      extractVoteWebhookUserId(body) ||
      extractVoteWebhookUserId(req.query);
    if (!user_id) {
      const contentType = String(req.headers["content-type"] || "").trim() || "(none)";
      const rawSummary = summarizeRawBodyForLog(req._discadiaRawBody);
      const looksLikeProbe =
        rawSummary === "(empty)" || rawSummary === "{}" || rawSummary === "[]" || rawSummary === "null";
      if (looksLikeProbe) {
        return res.status(200).send("Ignored");
      }
      global.logger?.warn?.(
        "[WEBHOOK] Discadia: User ID missing; content-type: " +
          contentType +
          "; body keys: " +
          (body && typeof body === "object" ? Object.keys(body).join(", ") : "(non-object)") +
          "; raw: " +
          rawSummary,
      );
      return res.status(400).send("User ID missing");
    }

    const guildId = client.config.mainGuildId || IDs.guilds.main;
    await enqueuePendingDiscadiaVote(guildId, user_id, {
      source: "bots-http",
      rawSnippet: rawText.replace(/\s+/g, " ").trim().slice(0, 240),
    });

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));

    if (!guild) {
      global.logger?.warn?.("[WEBHOOK] Discadia: Guild not ready, vote queued for " + user_id);
      return res.status(200).send("Queued");
    }

    const user = await client.users.fetch(user_id).catch(() => null);
    if (!user) {
      global.logger?.warn?.("[WEBHOOK] Discadia: User not found for ID " + user_id);
      return res.status(404).send("User not found");
    }

    const handled = await processDiscadiaVote(guild, user, client, { voteListing: "discadia" });
    if (handled) {
      return res.status(200).send("Vote Processed");
    }
    return res.status(200).send("Queued");
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] Discadia: Error handling webhook", err);
    return res.status(500).send("Internal Server Error");
  }
}

function mountDiscadiaVoteWebhook(app?, client?, secret?) {
  if (!shouldStartDiscadiaVoteHttpWebhook(client)) return;
  if (!secret) {
    global.logger?.error?.(
      "[WEBHOOK] Discadia HTTP abilitato ma DISCADIA_WEBHOOK_SECRET vuoto — route non montata",
    );
    return;
  }
  app.post("/webhooks/discadia", (req?, res?) => {
    handleDiscadiaVoteWebhook(req, res, client, secret);
  });
  app.post("/webhooks/discadia/:token", (req?, res?) => {
    handleDiscadiaVoteWebhook(req, res, client, secret);
  });
}

export = {
  shouldStartDiscadiaVoteHttpWebhook,
  normalizeHeaderSecret,
  extractVoteWebhookUserId,
  normalizeWebhookPath,
  isDiscadiaWebhookRequest,
  handleDiscadiaVoteWebhook,
  mountDiscadiaVoteWebhook,
};
