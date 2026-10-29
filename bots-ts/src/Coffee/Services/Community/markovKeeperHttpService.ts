const http = require("http") as typeof import("http");
const { URL } = require("url") as typeof import("url");
const { readChannelLines, isMarkovEnabled, getMarkovConfig } = require("./markovMessageCollectorService") as typeof import("./markovMessageCollectorService");
let keeperServer = null;

function parsePositiveInt(value?, fallback?) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function handleKeeperRequest(req?, res?, client?) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  const host = req.headers.host || "127.0.0.1";
  let parsed;
  try {
    parsed = new URL(req.url || "/", `http://${host}`);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "/keeper") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const channelId = String(parsed.searchParams.get("channel_id") || "").trim();
  if (!/^\d{5,30}$/.test(channelId)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Missing channel_id");
    return;
  }
  const maxLinesRaw = parsed.searchParams.get("max_lines");
  const maxLines = maxLinesRaw == null || maxLinesRaw === "" || maxLinesRaw === "-1"
    ? -1
    : parsePositiveInt(maxLinesRaw, -1);
  const cleanUri = String(parsed.searchParams.get("clean_uri") || "false").toLowerCase() === "true";
  const lines = await readChannelLines(client, channelId, {
    maxLines,
    cleanLinks: cleanUri,
  });
  const body = JSON.stringify(lines);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
  });
  res.end(body);
}

function startMarkovKeeperHttpServer(client?) {
  if (keeperServer) return keeperServer;
  if (!isMarkovEnabled(client)) return null;
  const cfg = getMarkovConfig(client);
  const port = parsePositiveInt(cfg.keeperHttpPort, 0);
  if (!port) return null;
  const host = String(cfg.keeperHttpHost || "127.0.0.1").trim() || "127.0.0.1";
  keeperServer = http.createServer((req?, res?) => {
    void handleKeeperRequest(req, res, client).catch((err?) => {
      global.logger?.warn?.("[MARKOV] keeper request failed:", err?.message || err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Internal server error");
    });
  });
  keeperServer.listen(port, host, () => {
    global.logger?.info?.(`[MARKOV] keeper HTTP listening on http://${host}:${port}/keeper`);
  });
  keeperServer.on("error", (err?) => {
    global.logger?.error?.("[MARKOV] keeper HTTP error:", err?.message || err);
  });
  return keeperServer;
}

function stopMarkovKeeperHttpServer() {
  if (!keeperServer) return;
  const server = keeperServer;
  keeperServer = null;
  server.close(() => {
    global.logger?.info?.("[MARKOV] keeper HTTP stopped");
  });
}

export = { startMarkovKeeperHttpServer, stopMarkovKeeperHttpServer };