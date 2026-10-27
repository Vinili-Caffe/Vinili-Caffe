import http from "node:http";
import { logger } from "./logger";
import { isMongoConnected } from "./mongo";
import { handleGdprApi } from "../vinyls/modules/community/gdpr";
import { handleInternalApi } from "./internalApi";

export interface HealthInfo {
  label: string;
  ready: boolean;
  uptimeSec: number;
  mongo: boolean;
  commands?: number;
  extra?: Record<string, unknown>;
}

export type HealthSnapshot = () => HealthInfo;

/**
 * HTTP health + API interna loopback.
 * Porta da HEALTH_PORT / BOT_HEALTH_PORT (0 = off).
 */
export function startHealthServer(getSnapshot: HealthSnapshot): http.Server | null {
  const raw = process.env.HEALTH_PORT || process.env.BOT_HEALTH_PORT || "0";
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) {
    logger.info("[health] skip — HEALTH_PORT non impostato");
    return null;
  }

  const server = http.createServer((req, res) => {
    if (handleInternalApi(req, res)) return;
    if (handleGdprApi(req, res)) return;

    if (
      req.method === "GET" &&
      (req.url === "/" || req.url === "/health" || req.url?.startsWith("/health?"))
    ) {
      const snap = getSnapshot();
      const body = JSON.stringify({
        ok: true,
        ...snap,
        mongo: snap.mongo ?? isMongoConnected(),
        ts: new Date().toISOString(),
        api: [
          "/api/ts/staff/:guildId/:userId",
          "/api/ts/tickets/:guildId",
          "/api/ts/user/:guildId/:userId",
        ],
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(body);
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, "127.0.0.1", () => {
    logger.info(`[health] http://127.0.0.1:${port}/health (+ /api/ts/*)`);
  });
  server.unref();
  server.on("error", (err) => logger.error("[health] server", err));
  return server;
}
