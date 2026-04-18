/**
 * Proxy locale solo per sviluppo: il sito (localhost:3000, 5173, ecc.) chiama questo processo;
 * lui inoltra a http://IP-VPS:porta senza CORS browser→VPS (il browser parla solo con 127.0.0.1).
 *
 * Avvio (dalla root del repo):
 *   node WebSite/scripts/dev-candidature-proxy.mjs --target http://45.143.196.131:3000
 *
 * Poi in site.config candidatureSubmitApiUrlLocal (e rebuild):
 *   http://127.0.0.1:3042/webhooks/site-candidature
 *
 * Lascia questo processo SEMPRE aperto in un terminale mentre provi il sito (se lo chiudi -> ERR_CONNECTION_REFUSED).
 * Verifica: http://127.0.0.1:3042/webhooks/status (inoltra al bot) oppure http://127.0.0.1:3042/
 *
 * Sul VPS non serve WEBSITE_CANDIDATURE_CORS_ORIGIN per questo flusso (il fetch non va al VPS).
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

function parseArgs(argv) {
  const out = { target: "", port: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target" && argv[i + 1]) {
      out.target = String(argv[++i]).trim();
    } else if (a === "--port" && argv[i + 1]) {
      out.port = String(argv[++i]).trim();
    }
  }
  return out;
}

const hopRequestHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function stripAccessControl(headers) {
  const h = { ...headers };
  for (const key of Object.keys(h)) {
    if (key.toLowerCase().startsWith("access-control-")) delete h[key];
  }
  return h;
}

function applyProxyCors(res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.append("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Access-Control-Request-Private-Network",
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

const args = parseArgs(process.argv);
const targetRaw =
  args.target ||
  String(process.env.VC_CANDIDATURE_PROXY_TARGET || "").trim() ||
  "";
if (!/^https?:\/\//i.test(targetRaw)) {
  console.error(
    "Uso: node WebSite/scripts/dev-candidature-proxy.mjs --target http://IP_O_HOST:PORTA\n" +
      "  es.: --target http://45.143.196.131:3000\n" +
      "  oppure: VC_CANDIDATURE_PROXY_TARGET=http://... node WebSite/scripts/dev-candidature-proxy.mjs",
  );
  process.exit(1);
}

const targetBase = new URL(targetRaw.replace(/\/+$/, "") + "/");
const listenPort = Number(args.port || process.env.VC_CANDIDATURE_PROXY_PORT || 3042) || 3042;

const server = http.createServer((req, res) => {
  const origin = String(req.headers.origin || "").trim();

  if (req.method === "OPTIONS") {
    applyProxyCors(res, origin);
    res.writeHead(204).end();
    return;
  }

  let pathWithQuery;
  try {
    pathWithQuery = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    res.writeHead(400).end("Bad URL");
    return;
  }
  const pathname = pathWithQuery.pathname || "";
  const forwardPath =
    pathname === "/webhooks/status" || pathname.startsWith("/webhooks/site-candidature");
  if (!forwardPath) {
    if (pathname === "/" && (req.method || "GET") === "GET") {
      applyProxyCors(res, origin);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          proxy: "dev-candidature-proxy",
          target: targetBase.origin,
          paths: ["/webhooks/status", "/webhooks/site-candidature"],
        }),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "Proxy dev: usa /webhooks/site-candidature o /webhooks/status. Avvio: node WebSite/scripts/dev-candidature-proxy.mjs --target " +
        targetBase.origin,
    );
    return;
  }

  const dest = new URL(pathname + (pathWithQuery.search || ""), targetBase);
  const lib = dest.protocol === "https:" ? https : http;

  const outHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!k || hopRequestHeaders.has(k.toLowerCase())) continue;
    if (v === undefined) continue;
    outHeaders[k] = v;
  }
  outHeaders.host = dest.host;

  const proxyReq = lib.request(
    dest,
    { method: req.method || "GET", headers: outHeaders },
    (proxyRes) => {
      const headers = stripAccessControl(proxyRes.headers);
      applyProxyCors(res, origin);
      for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) continue;
        res.setHeader(k, v);
      }
      res.writeHead(proxyRes.statusCode || 500);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    applyProxyCors(res, origin);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(
      JSON.stringify({
        ok: false,
        error: "proxy_upstream",
        message: String(err?.message || err),
      }),
    );
  });

  req.pipe(proxyReq);
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(
    "[dev-candidature-proxy] in ascolto su http://127.0.0.1:" +
      listenPort +
      " → " +
      targetBase.origin +
      "\n" +
      "  In site.config (poi build): candidatureSubmitApiUrlLocal = \"http://127.0.0.1:" +
      listenPort +
      "/webhooks/site-candidature\"",
  );
});
