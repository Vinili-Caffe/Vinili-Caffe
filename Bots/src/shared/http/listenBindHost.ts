/** Bind HTTP: default loopback (nginx in fronte). Override con *_BIND / LISTEN_HOST. */

function resolveListenBindHost(...envKeys: string[]) {
  for (const key of envKeys) {
    const raw = String(process.env[key] || "").trim();
    if (raw) return raw;
  }
  const shared = String(process.env.HTTP_LISTEN_HOST || process.env.LISTEN_HOST || "").trim();
  if (shared) return shared;
  return "127.0.0.1";
}

export = { resolveListenBindHost };
