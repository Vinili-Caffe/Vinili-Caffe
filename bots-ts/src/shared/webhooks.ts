import http from "node:http";
import { logger } from "./logger";

interface PendingVote {
  provider: "discadia" | "topgg";
  userId: string;
  at: number;
  raw: unknown;
}

const inbox: PendingVote[] = [];
const MAX = 5_000;

export function listPendingVotes(limit = 50): PendingVote[] {
  return inbox.slice(-Math.max(1, limit));
}

function pushVote(provider: "discadia" | "topgg", userId: string, raw: unknown): void {
  inbox.push({ provider, userId, at: Date.now(), raw });
  if (inbox.length > MAX) inbox.splice(0, inbox.length - MAX);
  logger.info(`[webhook] ${provider} vote user=${userId}`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function checkSecret(req: http.IncomingMessage, expected: string): boolean {
  if (!expected) return true;
  const h =
    String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() ||
    String(req.headers["x-webhook-secret"] || "").trim() ||
    String(req.headers["authorization"] || "").trim();
  return h === expected;
}

/**
 * Vote webhooks Keep (Discadia / Top.gg) — porta dedicata VC_TS_WEBHOOK_PORT.
 * Non sostituisce site-api Later.
 */
export function startVoteWebhookServer(): http.Server | null {
  const port = Number(process.env.VC_TS_WEBHOOK_PORT || 0);
  if (!Number.isFinite(port) || port <= 0) {
    logger.info("[webhook] skip — VC_TS_WEBHOOK_PORT off");
    return null;
  }
  const discadiaOn = ["1", "true", "yes", "on"].includes(
    String(process.env.DISCADIA_VOTE_HTTP_WEBHOOK || "").toLowerCase(),
  );
  const topggOn = ["1", "true", "yes", "on"].includes(
    String(process.env.TOPGG_VOTE_HTTP_WEBHOOK || "").toLowerCase(),
  );
  const discadiaSecret = String(process.env.DISCADIA_WEBHOOK_SECRET || "").trim();
  const topggSecret = String(process.env.TOPGG_WEBHOOK_SECRET || "").trim();

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || "/", `http://127.0.0.1`);
      if (req.method === "GET" && (url.pathname === "/webhooks/health" || url.pathname === "/health")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, pending: inbox.length, discadiaOn, topggOn }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/webhooks/discadia") {
        if (!discadiaOn) {
          res.writeHead(404).end();
          return;
        }
        if (!checkSecret(req, discadiaSecret)) {
          res.writeHead(401).end("unauthorized");
          return;
        }
        const body = await readBody(req);
        let data: { user?: string; userId?: string; id?: string } = {};
        try {
          data = JSON.parse(body) as typeof data;
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        const userId = String(data.user || data.userId || data.id || "").trim();
        if (!/^\d{17,20}$/.test(userId)) {
          res.writeHead(400).end("missing user");
          return;
        }
        pushVote("discadia", userId, data);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/webhooks/topgg") {
        if (!topggOn) {
          res.writeHead(404).end();
          return;
        }
        if (!checkSecret(req, topggSecret)) {
          res.writeHead(401).end("unauthorized");
          return;
        }
        const body = await readBody(req);
        let data: { user?: string } = {};
        try {
          data = JSON.parse(body) as typeof data;
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        const userId = String(data.user || "").trim();
        if (!/^\d{17,20}$/.test(userId)) {
          res.writeHead(400).end("missing user");
          return;
        }
        pushVote("topgg", userId, data);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404).end();
    })().catch((err) => {
      logger.warn("[webhook]", err);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`[webhook] :${port} /webhooks/discadia|topgg|health`);
  });
  server.unref();
  server.on("error", (err) => logger.error("[webhook] server", err));
  return server;
}
