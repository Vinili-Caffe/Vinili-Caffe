const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const http = require("node:http") as typeof import("node:http");
const crypto = require("node:crypto") as typeof import("node:crypto");

const ROOT = path.resolve(__dirname, "../../..");
const envPath = path.join(ROOT, ".env");
try {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
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
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
} catch (_) {}

const express = require("express");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { enqueuePendingDiscadiaVote } = require("./discadiaVoteInboxService") as typeof import("./discadiaVoteInboxService");

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

function parseBody(rawBuf?, contentTypeRaw?) {
  if (!Buffer.isBuffer(rawBuf) || !rawBuf.length) return {};
  const raw = rawBuf.toString("utf8").trim();
  if (!raw) return {};
  const contentType = String(contentTypeRaw || "").toLowerCase();
  const looksUrlEncoded =
    contentType.includes("application/x-www-form-urlencoded") ||
    (!raw.startsWith("{") && !raw.startsWith("[") && raw.includes("="));
  if (looksUrlEncoded) {
    try {
      const params = new URLSearchParams(raw);
      const out: Record<string, any> = {};
      for (const [k, v] of params) out[k] = v;
      if (Object.keys(out).length) return out;
    } catch (_) {}
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}
  const id = extractSnowflakeFromText(raw);
  return id ? { user_id: id } : {};
}

function extractUserId(body?, rawText?) {
  const fromRaw = extractSnowflakeFromText(rawText);
  if (fromRaw) return fromRaw;
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.user,
    body.user_id,
    body.userId,
    body.userid,
    body.uid,
    body.voter_id,
    body.voterId,
    body.discord_id,
    body.discordId,
    body.user?.id,
    body.data?.user?.id,
    body.data?.user_id,
    body.id,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number" && Number.isFinite(c)) {
      const id = String(Math.trunc(c));
      if (/^\d{17,22}$/.test(id)) return id;
    }
    const id = String(c).trim();
    if (/^\d{17,22}$/.test(id)) return id;
    const fromText = extractSnowflakeFromText(id);
    if (fromText) return fromText;
  }
  return null;
}

function normalizeHeaderSecret(raw?) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function secretsEqual(a?, b?) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Discadia UI ha solo l'URL (niente Authorization): secret in path/query, oppure header se presente. */
function extractDiscadiaProvidedSecret(req?) {
  const fromHeader = normalizeHeaderSecret(
    req.headers["authorization"] || req.headers["x-discadia-secret"],
  );
  if (fromHeader) return fromHeader;
  const q = req.query || {};
  const fromQuery = String(q.secret || q.key || q.token || "").trim();
  if (fromQuery) return fromQuery;
  const pathToken = String(req.params?.token || "").trim();
  if (pathToken && pathToken !== "health") return pathToken;
  return "";
}

async function main() {
  const port = Number(process.env.DISCADIA_VOTE_INTAKE_PORT || 3010) || 3010;
  const bindHost = String(process.env.DISCADIA_VOTE_INTAKE_BIND || "127.0.0.1").trim() || "127.0.0.1";
  const secret = String(process.env.DISCADIA_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("[DISCADIA INTAKE] Missing DISCADIA_WEBHOOK_SECRET — refuse to start");
    process.exit(1);
  }
  /* mongoSingleSource1 */
  const mongo = require("../../../shared/db/mongoConnect").buildMongoUrl();
  if (!mongo) {
    console.error("[DISCADIA INTAKE] Missing MONGO_URL");
    process.exit(1);
  }
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo, {
    maxPoolSize: 2,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8_000,
  });
  const guildId = String(IDs.guilds?.main || "").trim();

  const app = express();
  app.set("trust proxy", true);
  app.use(
    express.raw({
      type: () => true,
      limit: "512kb",
    }),
  );

  app.get("/webhooks/discadia/health", (_req?, res?) => {
    res.status(200).json({ ok: true, service: "discadia-vote-intake" });
  });

  async function handleDiscadiaPost(req?, res?) {
    try {
      const got = extractDiscadiaProvidedSecret(req);
      if (!got || !secretsEqual(got, secret)) {
        return res.status(401).send("Unauthorized");
      }
      const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const rawText = rawBuf.toString("utf8");
      const body = parseBody(rawBuf, req.headers["content-type"]);
      const userId = extractUserId(body, rawText) || extractUserId(req.query, "");
      if (!userId) {
        const compact = rawText.replace(/\s+/g, " ").trim();
        if (!compact || compact === "{}" || compact === "[]" || compact === "null") {
          return res.status(200).send("Ignored");
        }
        console.warn("[DISCADIA INTAKE] User ID missing; raw:", compact.slice(0, 200));
        return res.status(400).send("User ID missing");
      }
      await enqueuePendingDiscadiaVote(guildId, userId, {
        source: "intake",
        rawSnippet: rawText.replace(/\s+/g, " ").trim().slice(0, 240),
      });
      return res.status(200).send("Queued");
    } catch (err) {
      console.error("[DISCADIA INTAKE]", err?.message || err);
      return res.status(500).send("Internal Server Error");
    }
  }

  app.post("/webhooks/discadia", handleDiscadiaPost);
  app.post("/webhooks/discadia/:token", handleDiscadiaPost);

  const server = http.createServer(app);
  server.listen(port, bindHost, () => {
    console.log(`[DISCADIA INTAKE] listening on ${bindHost}:${port}`);
  });
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[DISCADIA INTAKE] fatal:", err);
    process.exit(1);
  });
}

export = { startDiscadiaIntake: main };
