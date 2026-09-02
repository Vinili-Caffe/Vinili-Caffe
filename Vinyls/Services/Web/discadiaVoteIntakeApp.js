const fs = require("fs");
const path = require("path");
const http = require("node:http");

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
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { enqueuePendingDiscadiaVote } = require("./discadiaVoteInboxService");

function extractSnowflakeFromText(text) {
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

function parseBody(rawBuf, contentTypeRaw) {
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
      const out = {};
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

function extractUserId(body, rawText) {
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

async function main() {
  const port = Number(process.env.DISCADIA_VOTE_INTAKE_PORT || 3010) || 3010;
  const mongo =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongo) {
    console.error("[DISCADIA INTAKE] Missing MONGO_URL");
    process.exit(1);
  }
  await mongoose.connect(mongo, {
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

  app.get("/webhooks/discadia/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "discadia-vote-intake" });
  });

  app.post("/webhooks/discadia", async (req, res) => {
    try {
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
  });

  const server = http.createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[DISCADIA INTAKE] listening on 0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error("[DISCADIA INTAKE] fatal:", err);
  process.exit(1);
});
