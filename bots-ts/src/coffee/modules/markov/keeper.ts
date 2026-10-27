import http from "node:http";
import type { Client } from "discord.js";
import { logger } from "../../../shared";
import { corpusSize, generateForGuild, sampleLine } from "./index";

/**
 * Markov keeper HTTP — porta VC_TS_MARKOV_KEEPER_PORT (live: keeperHttpPort).
 * Espone corpus/generate per guild (channel_id usato come guild hint se mappato).
 */
export function startMarkovKeeperHttp(client: Client): http.Server | null {
  const port = Number(process.env.VC_TS_MARKOV_KEEPER_PORT || 0);
  if (!Number.isFinite(port) || port <= 0) {
    logger.info("[markov-keeper] off — VC_TS_MARKOV_KEEPER_PORT");
    return null;
  }
  const host = String(process.env.VC_TS_MARKOV_KEEPER_HOST || "127.0.0.1").trim() || "127.0.0.1";

  const server = http.createServer((req, res) => {
    try {
      if (req.method !== "GET") {
        res.writeHead(405).end("Method not allowed");
        return;
      }
      const url = new URL(req.url || "/", `http://${host}`);
      if (url.pathname !== "/" && url.pathname !== "/keeper") {
        res.writeHead(404).end("Not found");
        return;
      }
      const channelId = String(url.searchParams.get("channel_id") || "").trim();
      const guildIdParam = String(url.searchParams.get("guild_id") || "").trim();
      // Prefer guild_id; else try resolve channel → guild
      let guildId = guildIdParam;
      if (!guildId && /^\d{5,30}$/.test(channelId)) {
        for (const g of client.guilds.cache.values()) {
          if (g.channels.cache.has(channelId)) {
            guildId = g.id;
            break;
          }
        }
      }
      if (!guildId) {
        res.writeHead(400).end("Missing guild_id or resolvable channel_id");
        return;
      }
      const wantGenerate = url.searchParams.get("generate") === "1";
      const body = wantGenerate
        ? generateForGuild(guildId, {
            count: Math.min(5, Number(url.searchParams.get("count") || 1) || 1),
            maxSymbols: Math.min(500, Number(url.searchParams.get("max_symbols") || 180) || 180),
          })
        : [sampleLine(guildId)].filter(Boolean);
      const payload = JSON.stringify({
        guildId,
        corpus: corpusSize(guildId),
        lines: body,
      });
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(payload),
      });
      res.end(payload);
    } catch (err) {
      logger.warn("[markov-keeper]", err);
      res.writeHead(500).end("Internal server error");
    }
  });

  server.listen(port, host, () => {
    logger.info(`[markov-keeper] http://${host}:${port}/keeper`);
  });
  server.unref();
  server.on("error", (err) => logger.error("[markov-keeper]", err));
  return server;
}
